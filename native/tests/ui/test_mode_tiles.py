"""TILES: the library, the pixel editor, transforms, reference-safe swaps."""

from __future__ import annotations

import unittest

from support import StudioTest


class TilesModeTests(StudioTest):
    def tiles(self, window):
        window.select_mode("TILES")
        return window.modes["TILES"]

    def test_the_library_shows_real_tile_art(self) -> None:
        window = self.window("basics")
        tiles = self.tiles(window)
        self.assertEqual(len(tiles.library_buttons), 256)
        self.assertFalse(tiles.library_buttons[0].icon().isNull())

    def test_the_pixel_canvas_renders(self) -> None:
        window = self.window("basics")
        tiles = self.tiles(window)
        tiles.select_tile(1, bank="bg")
        for column in range(8):
            window.document.set_background_tile_pixel(1, column, 3, 2)
        tiles.refresh()
        self.assertEqual((tiles.pixel_canvas.width(), tiles.pixel_canvas.height()), (256, 256))
        self.assertRenders(tiles.pixel_canvas, minimum_colours=2)

    def test_clicking_a_pixel_paints_it(self) -> None:
        window = self.window("scratch")
        tiles = self.tiles(window)
        tiles.select_tile(7, bank="bg")
        tiles.set_pen(1)

        tiles.pixel_buttons[4 * 8 + 3].click()

        self.assertEqual(window.document.background_tile_pixels(7)[4][3], 1)

    def test_the_two_banks_are_separate(self) -> None:
        window = self.window("scratch")
        tiles = self.tiles(window)
        tiles.select_tile(7, bank="bg")
        tiles.set_pen(1)
        tiles.pixel_buttons[4 * 8 + 3].click()

        tiles.select_tile(7, bank="sprite")
        tiles.set_pen(3)
        tiles.pixel_buttons[4 * 8 + 3].click()

        self.assertEqual(window.document.sprite_tile_pixels(7)[4][3], 3)
        self.assertEqual(window.document.background_tile_pixels(7)[4][3], 1)

    def test_a_drag_across_pixels_is_one_undo_step(self) -> None:
        window = self.window("scratch")
        tiles = self.tiles(window)
        tiles.select_tile(3, bank="bg")
        tiles.set_pen(2)

        tiles.begin_paint()
        for column in range(5):
            tiles.paint_pixel(column, 0)
        tiles.end_paint()

        self.assertTrue(all(window.document.background_tile_pixels(3)[0][c] == 2 for c in range(5)))
        self.assertTrue(window.store.undo())
        self.assertTrue(all(window.document.background_tile_pixels(3)[0][c] != 2 for c in range(5)))

    def test_copy_and_paste_a_tile(self) -> None:
        window = self.window("scratch")
        tiles = self.tiles(window)
        tiles.select_tile(7, bank="bg")
        tiles.set_pen(1)
        tiles.pixel_buttons[4 * 8 + 3].click()

        tiles._copy()
        tiles.select_tile(8)
        tiles._paste()

        self.assertEqual(window.document.background_tile_pixels(8)[4][3], 1)

    def test_the_preview_palette_changes_the_colours(self) -> None:
        """A tile has no palette of its own; the cell that uses it chooses one.
        So the editor needs an explicit 'preview through this palette'."""

        window = self.window("basics")
        tiles = self.tiles(window)
        window.document.set_background_palette_slot(0, 0, 0x16)
        window.document.set_background_palette_slot(1, 0, 0x2A)
        tiles.select_tile(1)

        tiles.tile_preview_palette.setCurrentIndex(0)
        first = tiles.ramp()
        tiles.tile_preview_palette.setCurrentIndex(1)
        second = tiles.ramp()

        self.assertNotEqual(first, second)

    def test_usage_counts_are_shown(self) -> None:
        window = self.window("scratch")
        tiles = self.tiles(window)
        window.document.set_world_tile(0, 0, 5)
        window.document.set_world_tile(1, 0, 5)
        tiles.select_tile(5)

        self.assertEqual(tiles.usage("bg").get(5), 2)
        self.assertIn("used 2 times", tiles.usage_label.text())

    def test_swap_follows_the_references(self) -> None:
        window = self.window("scratch")
        self.tiles(window)
        window.document.set_background_tile_pixel(4, 0, 0, 3)
        window.document.set_world_tile(2, 2, 4)

        window.document.swap_tile_slots("bg", 4, 200)

        self.assertEqual(window.document.background_tile_pixels(200)[0][0], 3)
        self.assertEqual(window.document.world_tiles(0, 0)[2][2], 200)


if __name__ == "__main__":
    unittest.main()
