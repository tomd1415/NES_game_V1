"""Undo must work in every mode, not just WORLD.

Undo used to be wired straight to `WorldCanvas`, so tile pixels, sprites,
animations, palettes, sound and all ~40 RULES fields were **not undoable at
all** — and `load_tiles()` cleared the canvas's history, so merely switching
screen or background threw away the WORLD history too.
"""

from __future__ import annotations

import unittest

from support import StudioTest


class UndoEverywhereTests(StudioTest):
    # ---- the modes that were never undoable -------------------------------

    def test_palette_edit_is_undoable(self) -> None:
        window = self.window("basics")
        before = window.document.background_palette(0)[0]

        window.modes["PALS"].background_palette_controls[0].setValue(0x16)
        self.assertEqual(window.document.background_palette(0)[0], 0x16)

        self.assertTrue(window.store.undo())
        self.assertEqual(window.document.background_palette(0)[0], before)

        self.assertTrue(window.store.redo())
        self.assertEqual(window.document.background_palette(0)[0], 0x16)

    def test_tile_pixel_edit_is_undoable(self) -> None:
        window = self.window("basics")
        # pixels are indexed [row][column]; the setter takes (index, column, row, value)
        before = window.document.background_tile_pixels(5)[2][3]
        new_value = (before + 1) % 4

        window.document.set_background_tile_pixel(5, 3, 2, new_value)
        window.session.schedule_save()
        self.assertEqual(window.document.background_tile_pixels(5)[2][3], new_value)

        self.assertTrue(window.store.undo())
        self.assertEqual(window.document.background_tile_pixels(5)[2][3], before)

    def test_sprite_edit_is_undoable(self) -> None:
        window = self.window("basics")
        before = len(window.document.sprite_names())

        window.document.add_sprite("Undo me", role="enemy")
        window.session.schedule_save()
        self.assertEqual(len(window.document.sprite_names()), before + 1)

        self.assertTrue(window.store.undo())
        self.assertEqual(len(window.document.sprite_names()), before)

    def test_rules_edit_is_undoable(self) -> None:
        window = self.window("basics")
        window.document.set_player_option("walkSpeed", 1)
        window.session.schedule_save()
        window.store.commit()

        window.document.set_player_option("walkSpeed", 4)
        window.session.schedule_save()
        window.store.commit()

        self.assertTrue(window.store.undo())
        config = window.document.state["builder"]["modules"]["players"]["submodules"]["player1"]
        self.assertEqual(config["config"]["walkSpeed"], 1)

    # ---- WORLD, which used to be the only undoable mode -------------------

    def test_world_paint_is_undoable(self) -> None:
        window = self.window("basics")
        canvas = window.modes["WORLD"].canvas
        canvas.set_tool("paint")
        canvas.set_paint_value(42)
        before = window.document.world_tiles(0, 0)[4][6]

        canvas.edit_cell(6, 4)
        self.assertEqual(window.document.world_tiles(0, 0)[4][6], 42)

        self.assertTrue(window.store.undo())
        self.assertEqual(window.document.world_tiles(0, 0)[4][6], before)

    def test_a_drag_stroke_is_one_undo_step(self) -> None:
        """Without macro grouping a drag would be undone one cell at a time."""

        window = self.window("basics")
        canvas = window.modes["WORLD"].canvas
        canvas.set_tool("paint")
        canvas.set_paint_value(7)

        canvas.begin_stroke()
        for column in range(5):
            canvas.edit_cell(column, 10)
        canvas.end_stroke()

        tiles = window.document.world_tiles(0, 0)
        self.assertTrue(all(tiles[10][column] == 7 for column in range(5)))

        self.assertTrue(window.store.undo())
        tiles = window.document.world_tiles(0, 0)
        self.assertTrue(all(tiles[10][column] != 7 for column in range(5)))
        self.assertFalse(window.store.can_undo, "the stroke was more than one step")

    def test_switching_background_no_longer_wipes_history(self) -> None:
        """`WorldCanvas.load_tiles()` used to clear the undo stack, so changing
        screen or background threw away everything the pupil had done."""

        window = self.window("basics")
        world = window.modes["WORLD"]
        world.canvas.set_tool("paint")
        world.canvas.set_paint_value(21)
        world.canvas.edit_cell(3, 3)
        self.assertTrue(window.store.can_undo)

        window.document.add_background("Level 2")
        world.refresh()
        world._select_background(1)

        self.assertTrue(window.store.can_undo, "switching background threw the history away")

    # ---- history hygiene --------------------------------------------------

    def test_history_does_not_leak_across_projects(self) -> None:
        window = self.window("basics")
        canvas = window.modes["WORLD"].canvas
        canvas.set_tool("paint")
        canvas.edit_cell(2, 2)
        self.assertTrue(window.store.can_undo)

        window.new_project("scratch", f"second {id(self)}")
        self.assertFalse(window.store.can_undo, "undo would have reached into another project")

    def test_undo_is_bounded(self) -> None:
        from nes_studio.state.store import UNDO_LIMIT

        window = self.window("basics")
        canvas = window.modes["WORLD"].canvas
        canvas.set_tool("paint")
        for index in range(UNDO_LIMIT + 15):
            canvas.set_paint_value((index % 200) + 1)
            canvas.edit_cell(index % 32, (index // 32) + 1)

        steps = 0
        while window.store.undo():
            steps += 1
        self.assertLessEqual(steps, UNDO_LIMIT)


if __name__ == "__main__":
    unittest.main()
