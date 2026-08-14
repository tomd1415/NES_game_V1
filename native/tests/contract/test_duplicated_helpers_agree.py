"""Three helpers are defined twice in `tools/nes_studio_core/`. Nothing checked them.

Duplicated code decays exactly like a hand-maintained list: silently, and in whichever
copy the next person did not open. Two of these three are currently identical, so the
risk is drift. The third is **already different**, which is why this file asserts
behaviour rather than text — a source-equality check would have been red from the day it
was written and would simply have been deleted.

What each pair is, and what is asserted:

* `_smbhud_bg_enabled` — `graphics.py` and `project.py`. Same logic, different local
  names and type hints. Asserted to agree on a corpus that reaches every branch.
* `cell_tile` — `scene.py` and `graphics.py`. Byte-identical bodies today. Asserted to
  agree on a corpus including the `empty` short-circuit and out-of-range tiles.
* `_hex_table_declared` / `_hex_table_sized` — `world.py` and `collision.py`. Two
  different functions, and since 2026-08-14 two different names. See
  `test_hex_table_...` below for which behaviour is canonical for which caller.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT / "tools"))

from nes_studio_core import collision, graphics, project, scene, world  # noqa: E402


def _state(module_overrides: dict) -> dict:
    return {"builder": {"modules": module_overrides}}


#: Reaches every branch of `_smbhud_bg_enabled`: wrong game type, HUD off, HUD on but
#: not in background mode, the true case, and three malformed shapes that must be
#: swallowed to False rather than raised at a child mid-build.
SMBHUD_STATES = [
    ("not an smb game", _state({"game": {"config": {"type": "platformer"}},
                                "smbhud": {"enabled": True, "config": {"background": True}}})),
    ("smb, hud absent", _state({"game": {"config": {"type": "smb"}}})),
    ("smb, hud disabled", _state({"game": {"config": {"type": "smb"}},
                                  "smbhud": {"enabled": False, "config": {"background": True}}})),
    ("smb, hud on, sprite mode", _state({"game": {"config": {"type": "smb"}},
                                         "smbhud": {"enabled": True, "config": {"background": False}}})),
    ("smb, hud on, background mode", _state({"game": {"config": {"type": "smb"}},
                                             "smbhud": {"enabled": True, "config": {"background": True}}})),
    ("smb, hud on, config is null", _state({"game": {"config": {"type": "smb"}},
                                            "smbhud": {"enabled": True, "config": None}})),
    ("no builder key at all", {}),
    ("modules is not a dict", {"builder": {"modules": "nonsense"}}),
]

#: `empty` short-circuits before `tile` is read; `tile` is masked to a byte; a missing
#: `tile` defaults to 0.
CELLS = [
    {"empty": True, "tile": 200},
    {"empty": False, "tile": 7},
    {"tile": 0},
    {},
    {"tile": 255},
    {"tile": 256},          # masked to 0
    {"tile": 300},          # masked to 44
    {"empty": True},
]


class DuplicatedHelpersAgreeTests(unittest.TestCase):
    def test_smbhud_bg_enabled_agrees_across_both_definitions(self) -> None:
        for label, state in SMBHUD_STATES:
            with self.subTest(state=label):
                self.assertEqual(
                    graphics._smbhud_bg_enabled(state),
                    project._smbhud_bg_enabled(state),
                    f"graphics.py and project.py disagree about '{label}'. They are two "
                    "copies of one rule; whichever you just edited, edit the other.",
                )

    def test_cell_tile_agrees_across_both_definitions(self) -> None:
        for cell in CELLS:
            with self.subTest(cell=cell):
                self.assertEqual(
                    scene.cell_tile(cell),
                    graphics.cell_tile(cell),
                    f"scene.py and graphics.py disagree about {cell}. Both feed the same "
                    "nametable bytes, so a divergence here is a wrong ROM, not a wrong test.",
                )

    def test_hex_table_agrees_on_the_case_both_callers_share(self) -> None:
        """Non-empty data, 16 per line, `const` — where the two overlap, byte for byte."""
        for length in (1, 15, 16, 17, 40):
            data = bytes(range(length))
            with self.subTest(length=length):
                self.assertEqual(
                    world._hex_table_declared("t", str(len(data)), data),
                    collision._hex_table_sized("t", data),
                    "the shared emission format has drifted between world.py and "
                    "collision.py; these bytes become C arrays in the same ROM",
                )

    def test_hex_table_differs_deliberately_and_here_is_which_is_which(self) -> None:
        """Two different functions that are **not** interchangeable. Do not "unify" them.

        `collision._hex_table_sized` is **self-sizing**: the array length is `len(data)`, or
        `[1]` when empty, and it takes a column width and a storage qualifier. Its
        callers hold the bytes and want the declaration to match them.

        `world._hex_table_declared` is **caller-sized**: the length is a C *expression* handed in
        by the caller — often a macro rather than a number — so the declaration can say
        `[WORLD_LEN]` while the initialiser is shorter and C zero-fills the rest. That
        is the whole reason it exists separately, and it is why the empty case cannot be
        shared: collapsing to `[1]` would contradict the declared size.

        They now have different names, which is what the rename in item 4 was for — this
        test no longer has to argue that two identically-named functions are deliberately
        different. It still pins the behaviours, because the names alone do not enforce
        them.
        """
        self.assertEqual(
            world._hex_table_declared("t", "WORLD_LEN", b"")[0],
            "const unsigned char t[WORLD_LEN] = {",
            "world._hex_table_declared must keep honouring a size EXPRESSION, not a byte count",
        )
        self.assertEqual(
            collision._hex_table_sized("t", b""),
            ["const unsigned char t[1] = { 0 }; /* empty */"],
            "collision._hex_table_sized must keep self-sizing to [1] on empty input",
        )
        # Stated as an assertion so "they are the same function" cannot creep back in.
        self.assertNotEqual(
            world._hex_table_declared("t", "1", b""),
            collision._hex_table_sized("t", b""),
            "these two are deliberately different on empty input -- if you have just "
            "made them agree, read this test's docstring before deleting this line",
        )
        self.assertEqual(
            collision._hex_table_sized("t", bytes(range(4)), columns_per_line=2, qualifier="static"),
            ["static unsigned char t[4] = {", "  0x00, 0x01,", "  0x02, 0x03,", "};"],
            "collision._hex_table_sized's column width and qualifier are part of its contract",
        )


if __name__ == "__main__":
    unittest.main()
