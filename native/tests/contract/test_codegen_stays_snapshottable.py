"""The ROM codegen must stay inside the snapshotted package.

Engine v76 added `tools/nes_studio_core/` to the engine snapshot, which is what
makes `snapshot-engine.mjs --check` able to see a codegen change at all. That
coverage rests on one fact: `tools/playground_server.py` -- which is NOT
snapshotted -- only *delegates* to that package rather than emitting ROM source
itself.

Nothing enforced that. If someone inlines a delegation back into the server for
convenience, the snapshot gate silently narrows: the inlined code changes ROM
output and no gate goes red, which is exactly the F7 blind spot the v76 bump
closed. LESSONS_LEARNT already records the general form of this trap --

    "the contract holds by construction, because both targets delegate to the
    same function." That may be true today, and it is not a test.

-- so this is that reasoning turned into an artefact that fails when it stops
being true.

Parsed with `ast` rather than grepped: a regex over source would match the word
in a comment or a docstring, and would pass while the real body did something
else entirely.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SERVER = REPOSITORY_ROOT / "tools" / "playground_server.py"
SNAPSHOT_SCRIPT = REPOSITORY_ROOT / "scripts" / "snapshot-engine.mjs"

# The ROM-emitting entry points. Each must be a thin delegation into the
# snapshotted package; the value is the core module it is expected to reach.
DELEGATIONS = {
    "build_behaviour_c": "collision_core",
    "build_scene_inc": "scene_core",
    "build_project_inc": "project_core",
    "build_bg_world_h": "world_core",
    "build_bg_world_c": "world_core",
}


def _functions() -> dict[str, ast.FunctionDef]:
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    return {
        node.name: node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
    }


class CodegenStaysSnapshottableTests(unittest.TestCase):
    def setUp(self) -> None:
        self.functions = _functions()

    def test_every_rom_emitting_entry_point_delegates_to_the_core_package(self) -> None:
        for name, expected_module in DELEGATIONS.items():
            with self.subTest(function=name):
                function = self.functions.get(name)
                self.assertIsNotNone(
                    function,
                    f"{name} has vanished from playground_server.py; if it moved, "
                    "update this test -- do not delete it",
                )

                # Strip a leading docstring, then require the remaining body to be
                # exactly one `return <module>.<something>(...)`.
                body = list(function.body)
                if body and isinstance(body[0], ast.Expr) and isinstance(
                    getattr(body[0], "value", None), ast.Constant
                ):
                    body = body[1:]

                self.assertEqual(
                    len(body), 1,
                    f"{name} has grown a body of {len(body)} statements. A ROM-emitting "
                    "function in playground_server.py is OUTSIDE the engine snapshot, so "
                    "changing it cannot turn snapshot-engine.mjs --check red. Move the "
                    "logic into tools/nes_studio_core/ and delegate.",
                )
                statement = body[0]
                self.assertIsInstance(statement, ast.Return, f"{name} does not delegate")
                call = statement.value
                self.assertIsInstance(call, ast.Call, f"{name} does not delegate to a call")
                self.assertIsInstance(call.func, ast.Attribute)
                self.assertIsInstance(call.func.value, ast.Name)
                self.assertEqual(
                    call.func.value.id,
                    expected_module,
                    f"{name} delegates to {call.func.value.id}, not {expected_module}",
                )

    def test_the_snapshot_actually_includes_the_package_it_delegates_to(self) -> None:
        """The delegation is only worth anything while the target is snapshotted."""
        script = SNAPSHOT_SCRIPT.read_text(encoding="utf-8")
        include_dirs = script.split("const INCLUDE_DIRS", 1)[1].split("]", 1)[0]
        self.assertIn(
            "tools/nes_studio_core",
            include_dirs,
            "playground_server.py delegates its codegen to tools/nes_studio_core, but "
            "that directory is no longer in the engine snapshot's INCLUDE_DIRS -- so "
            "the codegen is unsnapshotted again (F7)",
        )


if __name__ == "__main__":
    unittest.main()
