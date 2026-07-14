"""Undo must work in every mode, not just WORLD.

Undo used to be wired straight to `WorldCanvas`, so tile pixels, sprites,
animations, palettes, sound and all ~40 RULES fields were **not undoable at
all** — and `load_tiles()` cleared the canvas's history, so merely switching
screen or background threw away the WORLD history too.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class UndoEverywhereTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        cls.data_root = tempfile.TemporaryDirectory()
        os.environ["NES_STUDIO_DATA_ROOT"] = cls.data_root.name
        from nes_studio.application import create_application

        cls.application = create_application(["nes-studio-test"])

    @classmethod
    def tearDownClass(cls) -> None:
        os.environ.pop("NES_STUDIO_DATA_ROOT", None)
        cls.data_root.cleanup()

    def _window(self, style: str = "basics"):
        from nes_studio.core.resources import ResourceLocator
        from nes_studio.ui.main_window import MainWindow

        window = MainWindow(ResourceLocator.discover(NATIVE_ROOT))
        self.addCleanup(window.close)
        window.new_project(style, f"undo {style} {id(self)}")
        return window

    # ---- the modes that were never undoable -------------------------------

    def test_palette_edit_is_undoable(self) -> None:
        window = self._window()
        before = window._document.background_palette(0)[0]

        window._set_background_palette_slot(0, 0, 0x16)
        self.assertEqual(window._document.background_palette(0)[0], 0x16)

        self.assertTrue(window._store.undo())
        self.assertEqual(window._document.background_palette(0)[0], before)

        self.assertTrue(window._store.redo())
        self.assertEqual(window._document.background_palette(0)[0], 0x16)

    def test_tile_pixel_edit_is_undoable(self) -> None:
        window = self._window()
        # pixels are indexed [row][column]; the setter takes (index, column, row, value)
        before = window._document.background_tile_pixels(5)[2][3]
        new_value = (before + 1) % 4

        window._document.set_background_tile_pixel(5, 3, 2, new_value)
        window._session.schedule_save()
        self.assertEqual(window._document.background_tile_pixels(5)[2][3], new_value)

        self.assertTrue(window._store.undo())
        self.assertEqual(window._document.background_tile_pixels(5)[2][3], before)

    def test_sprite_edit_is_undoable(self) -> None:
        window = self._window()
        before = len(window._document.sprite_names())

        window._document.add_sprite("Undo me", role="enemy")
        window._session.schedule_save()
        self.assertEqual(len(window._document.sprite_names()), before + 1)

        self.assertTrue(window._store.undo())
        self.assertEqual(len(window._document.sprite_names()), before)

    def test_rules_edit_is_undoable(self) -> None:
        window = self._window()
        window._document.set_player_option("walkSpeed", 1)
        window._session.schedule_save()
        window._store.commit()

        window._document.set_player_option("walkSpeed", 4)
        window._session.schedule_save()
        window._store.commit()

        self.assertTrue(window._store.undo())
        config = window._document.state["builder"]["modules"]["players"]
        self.assertNotEqual(config, {})

    # ---- WORLD, which used to be the only undoable mode -------------------

    def test_world_paint_is_undoable(self) -> None:
        window = self._window()
        window.world_canvas.set_tool("paint")
        window.world_canvas.set_paint_value(42)
        before = window._document.world_tiles(0, 0)[4][6]

        window.world_canvas.edit_cell(6, 4)
        self.assertEqual(window._document.world_tiles(0, 0)[4][6], 42)

        self.assertTrue(window._store.undo())
        self.assertEqual(window._document.world_tiles(0, 0)[4][6], before)

    def test_a_drag_stroke_is_one_undo_step(self) -> None:
        """Without macro grouping a drag would be undone one cell at a time."""

        window = self._window()
        window.world_canvas.set_tool("paint")
        window.world_canvas.set_paint_value(7)

        window.world_canvas.begin_stroke()
        for column in range(5):
            window.world_canvas.edit_cell(column, 10)
        window.world_canvas.end_stroke()

        tiles = window._document.world_tiles(0, 0)
        self.assertTrue(all(tiles[10][column] == 7 for column in range(5)))

        self.assertTrue(window._store.undo())
        tiles = window._document.world_tiles(0, 0)
        self.assertTrue(all(tiles[10][column] != 7 for column in range(5)))
        self.assertFalse(window._store.can_undo, "the stroke was more than one step")

    def test_switching_background_no_longer_wipes_history(self) -> None:
        """`WorldCanvas.load_tiles()` used to clear the undo stack, so changing
        screen or background threw away everything the pupil had done."""

        window = self._window()
        window.world_canvas.set_tool("paint")
        window.world_canvas.set_paint_value(21)
        window.world_canvas.edit_cell(3, 3)
        self.assertTrue(window._store.can_undo)

        window._document.add_background("Level 2")
        window._sync_background_selector()
        window._select_background(1)

        self.assertTrue(
            window._store.can_undo, "switching background threw the history away"
        )

    # ---- history hygiene --------------------------------------------------

    def test_history_does_not_leak_across_projects(self) -> None:
        window = self._window()
        window.world_canvas.set_tool("paint")
        window.world_canvas.edit_cell(2, 2)
        self.assertTrue(window._store.can_undo)

        window.new_project("scratch", f"second {id(self)}")
        self.assertFalse(
            window._store.can_undo, "undo would have reached into another project"
        )

    def test_undo_is_bounded(self) -> None:
        from nes_studio.state.store import UNDO_LIMIT

        window = self._window()
        window.world_canvas.set_tool("paint")
        for index in range(UNDO_LIMIT + 15):
            window.world_canvas.set_paint_value((index % 200) + 1)
            window.world_canvas.edit_cell(index % 32, (index // 32) + 1)

        steps = 0
        while window._store.undo():
            steps += 1
        self.assertLessEqual(steps, UNDO_LIMIT)


if __name__ == "__main__":
    unittest.main()
