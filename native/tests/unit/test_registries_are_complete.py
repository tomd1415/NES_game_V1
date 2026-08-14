"""Two hand-maintained registries whose failure is a feature silently missing.

Neither had any test. Both fail the same way — quietly, in the direction of the user:

* a `Mode` subclass written but not added to `MODE_CLASSES` is **not in the app**. No
  import error, no empty tab, no warning; `main_window.py` builds the rail from that
  tuple and nothing else. `MODE_NAMES` is derived from it, so the existing
  "every mode has a rail icon" test iterates the *registered* list and cannot notice.
* a starter shipped in `resources/starters/` but missing from
  `project_catalog.STARTERS` cannot be opened by anyone. That is the exact bug that
  module's own docstring says it was written to fix: *"six of the seven starters that
  ship on disk could not be opened at all."*

Both are read with `ast` rather than imported. `ui/modes/*` and `project_catalog` pull in
PySide6 transitively, which is absent on a headless box — importing would make these skip
exactly where they are most needed, and a skipped guard is not a guard.
"""

from __future__ import annotations

import ast
import json
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
MODES = NATIVE_ROOT / "src" / "nes_studio" / "ui" / "modes"
CATALOG = NATIVE_ROOT / "src" / "nes_studio" / "ui" / "project_catalog.py"
PACKAGED = NATIVE_ROOT / "src" / "nes_studio" / "resources" / "starters" / "manifest.json"


def _tuple_names(path: Path, variable: str) -> list[str]:
    """The plain names listed in `variable = ( A, B, ... )`."""
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        target = None
        if isinstance(node, ast.AnnAssign):
            target = node.target
        elif isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
        if isinstance(target, ast.Name) and target.id == variable and node.value is not None:
            if isinstance(node.value, (ast.Tuple, ast.List)):
                return [e.id for e in node.value.elts if isinstance(e, ast.Name)]
    raise AssertionError(f"{variable} not found as a tuple/list in {path.name}")


def _starter_ids() -> list[str]:
    """The first element of each row of `STARTERS = ((id, label, blurb), ...)`."""
    for node in ast.walk(ast.parse(CATALOG.read_text(encoding="utf-8"))):
        target = node.target if isinstance(node, ast.AnnAssign) else (
            node.targets[0] if isinstance(node, ast.Assign) and len(node.targets) == 1 else None)
        if isinstance(target, ast.Name) and target.id == "STARTERS" and node.value is not None:
            rows = [e for e in node.value.elts if isinstance(e, ast.Tuple) and e.elts]
            return [r.elts[0].value for r in rows if isinstance(r.elts[0], ast.Constant)]
    raise AssertionError("STARTERS not found in project_catalog.py")


class RegistriesAreCompleteTests(unittest.TestCase):
    def test_every_mode_on_disk_is_registered_in_mode_classes(self) -> None:
        registered = set(_tuple_names(MODES / "__init__.py", "MODE_CLASSES"))
        on_disk = set()
        for path in sorted(MODES.glob("*.py")):
            if path.stem in ("__init__", "base"):
                continue
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.ClassDef) and any(
                    isinstance(b, ast.Name) and b.id == "Mode" for b in node.bases
                ):
                    on_disk.add(node.name)
        self.assertTrue(on_disk, "found no Mode subclasses at all — the walk is broken")
        self.assertEqual(
            sorted(on_disk - registered),
            [],
            "these modes exist on disk but are not in MODE_CLASSES, so they do not appear "
            "in the app at all — no error, no empty tab, nothing. Add them to the tuple in "
            "ui/modes/__init__.py.",
        )

    def test_the_starter_picker_offers_exactly_what_is_shipped(self) -> None:
        offered = _starter_ids()
        shipped = list(json.loads(PACKAGED.read_text(encoding="utf-8"))["fixtures"])
        self.assertTrue(offered, "found no starters in STARTERS — the parse is broken")
        self.assertEqual(
            sorted(set(shipped) - set(offered)),
            [],
            "these starters ship in resources/starters/ but the picker does not offer "
            "them, so no pupil can open them — the bug project_catalog.py's own docstring "
            "says it was written to fix.",
        )
        self.assertEqual(
            sorted(set(offered) - set(shipped)),
            [],
            "the picker offers starters that are not shipped; StarterCatalog.create() "
            "raises KeyError when the child presses OK.",
        )


if __name__ == "__main__":
    unittest.main()
