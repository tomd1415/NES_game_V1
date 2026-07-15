"""Drive the actual mouse.

Every canvas in this app was tested by calling its API — `canvas.edit_cell(3, 4)`,
`chars._paint_pixel(1, 1, 5, 6)` — and never by clicking it. `QTest` was imported
in exactly one file and used for the **keyboard**.

So none of the coordinate maths was covered: `_cell_at`, `_grid_geometry`,
`_pixel_at`, the entity hit-test, the rubber band, the flip correction, and the
zoom factor. That is the part most likely to be wrong and it was the part least
tested — a canvas that painted the cell *next to* the one you clicked would have
passed the entire suite.

These tests click at a pixel and assert on the **document**.
"""

from __future__ import annotations

import unittest

from PySide6.QtCore import QEvent, QPoint, QPointF, Qt
from PySide6.QtGui import QMouseEvent
from PySide6.QtWidgets import QApplication

from support import StudioTest


def _send(widget, kind, position: QPoint, button, buttons) -> None:
    event = QMouseEvent(
        kind,
        QPointF(position),
        widget.mapToGlobal(position),
        button,
        buttons,
        Qt.KeyboardModifier.NoModifier,
    )
    QApplication.sendEvent(widget, event)


def press(widget, position: QPoint, button=Qt.MouseButton.LeftButton) -> None:
    _send(widget, QEvent.Type.MouseButtonPress, position, button, button)


def move(widget, position: QPoint, button=Qt.MouseButton.LeftButton) -> None:
    # The button must be reported as *held* in `buttons`, or a drag reads as a
    # hover. `QTest.mouseMove` does not do this, which is why it is not used.
    _send(widget, QEvent.Type.MouseMove, position, Qt.MouseButton.NoButton, button)


def release(widget, position: QPoint, button=Qt.MouseButton.LeftButton) -> None:
    _send(widget, QEvent.Type.MouseButtonRelease, position, button, Qt.MouseButton.NoButton)


def click(widget, position: QPoint, button=Qt.MouseButton.LeftButton) -> None:
    press(widget, position, button)
    release(widget, position, button)


class WorldMouseTests(StudioTest):
    def world(self, window, *, starter: str = "scratch"):
        world = window.modes["WORLD"]
        world.canvas.resize(640, 600)
        world.canvas.show()
        self.application.processEvents()
        return world

    def test_clicking_a_cell_paints_that_cell_and_not_its_neighbour(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(12)

        click(world.canvas, world.canvas.cell_centre(9, 7))

        tiles = window.document.world_tiles(0, 0)
        self.assertEqual(tiles[7][9], 12, "the click landed on the wrong cell")
        self.assertEqual(tiles[7][8], 0)
        self.assertEqual(tiles[6][9], 0)

    def test_dragging_paints_every_cell_it_crosses(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(5)

        press(world.canvas, world.canvas.cell_centre(2, 12))
        for column in range(3, 8):
            move(world.canvas, world.canvas.cell_centre(column, 12))
        release(world.canvas, world.canvas.cell_centre(7, 12))

        tiles = window.document.world_tiles(0, 0)
        self.assertTrue(
            all(tiles[12][column] == 5 for column in range(2, 8)),
            f"the drag missed cells: {[tiles[12][c] for c in range(2, 8)]}",
        )

    def test_a_dragged_stroke_is_one_undo_step(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(6)

        press(world.canvas, world.canvas.cell_centre(1, 1))
        for column in range(2, 6):
            move(world.canvas, world.canvas.cell_centre(column, 1))
        release(world.canvas, world.canvas.cell_centre(5, 1))

        self.assertTrue(window.store.undo())
        tiles = window.document.world_tiles(0, 0)
        self.assertTrue(
            all(tiles[1][column] == 0 for column in range(1, 6)),
            "the drag was more than one undo step",
        )

    def test_right_clicking_picks_the_cell_up(self) -> None:
        """The eyedropper, through a real right-click."""

        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(31)
        world.palette_value.setValue(3)
        click(world.canvas, world.canvas.cell_centre(4, 4))
        world.select_tool("palette")
        click(world.canvas, world.canvas.cell_centre(4, 4))

        world.tile_value.setValue(0)
        world.palette_value.setValue(0)

        click(world.canvas, world.canvas.cell_centre(4, 4), Qt.MouseButton.RightButton)

        self.assertEqual(world.tile_value.value(), 31)
        self.assertEqual(world.palette_value.value(), 3)

    def test_zooming_keeps_the_click_on_the_cell_you_can_see(self) -> None:
        """Zoom scales the geometry. If the hit-test did not follow, a click at 2×
        would paint a cell somewhere else entirely."""

        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(19)
        world.canvas.set_zoom(2.0)
        self.application.processEvents()

        click(world.canvas, world.canvas.cell_centre(6, 5))

        self.assertEqual(window.document.world_tiles(0, 0)[5][6], 19)

    def test_dragging_an_entity_moves_it_in_world_coordinates(self) -> None:
        """Entity positions are NES pixels, not widget pixels. A drag that wrote
        widget coordinates into the document would place the character wildly
        wrong and still pass a `document.field` test."""

        window = self.window("scratch")
        world = self.world(window)
        enemy = window.document.add_sprite("Slime", role="enemy")
        window.document.add_scene_instance(enemy, x=40, y=40)
        world.refresh_entities()
        world.select_tool("select")
        self.application.processEvents()

        press(world.canvas, world.canvas.entity_position(0))
        target = world.canvas.cell_centre(20, 15)
        move(world.canvas, target)
        release(world.canvas, target)

        instance = window.document.scene_instances()[0]
        # Cell (20, 15) is NES pixel (160, 120).
        self.assertAlmostEqual(instance["x"], 160, delta=8)
        self.assertAlmostEqual(instance["y"], 120, delta=8)

    def test_rubber_band_select_then_copy_and_paste(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(7)
        click(world.canvas, world.canvas.cell_centre(1, 1))
        click(world.canvas, world.canvas.cell_centre(2, 1))

        world.select_tool("select")
        press(world.canvas, world.canvas.cell_centre(1, 1))
        move(world.canvas, world.canvas.cell_centre(2, 1))
        release(world.canvas, world.canvas.cell_centre(2, 1))

        self.assertEqual(world.canvas.selection, (1, 1, 2, 1))

        world._copy_region()
        click(world.canvas, world.canvas.cell_centre(10, 10))
        world.canvas.paste_selection(10, 10)

        tiles = window.document.world_tiles(0, 0)
        self.assertEqual(tiles[10][10], 7)
        self.assertEqual(tiles[10][11], 7)


class CharsMouseTests(StudioTest):
    def chars(self, window):
        window.select_mode("CHARS")
        chars = window.modes["CHARS"]
        chars.canvas.resize(320, 320)
        chars.canvas.show()
        self.application.processEvents()
        return chars

    def test_clicking_the_canvas_paints_the_pixel_under_the_cursor(self) -> None:
        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Hero", role="player")
        window.document.resize_sprite(index, 2, 2)
        chars.refresh_sprites(index)
        chars.set_pen(3)
        self.application.processEvents()

        tile = int(window.document.state["sprites"][index]["cells"][1][1]["tile"])
        # Cell (1, 1) starts at pixel (8, 8); paint its pixel (5, 6).
        click(chars.canvas, chars.canvas.pixel_centre(8 + 5, 8 + 6))

        self.assertEqual(window.document.sprite_tile_pixels(tile)[6][5], 3)

    def test_dragging_draws_a_line_not_a_dot(self) -> None:
        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Hero", role="player")
        chars.refresh_sprites(index)
        chars.set_pen(2)
        self.application.processEvents()
        tile = int(window.document.state["sprites"][index]["cells"][0][0]["tile"])

        press(chars.canvas, chars.canvas.pixel_centre(1, 3))
        for x in range(2, 7):
            move(chars.canvas, chars.canvas.pixel_centre(x, 3))
        release(chars.canvas, chars.canvas.pixel_centre(6, 3))

        pixels = window.document.sprite_tile_pixels(tile)
        self.assertTrue(
            all(pixels[3][x] == 2 for x in range(1, 7)),
            f"the drag drew {[pixels[3][x] for x in range(1, 7)]}, not a line",
        )

    def test_painting_a_flipped_cell_through_the_mouse(self) -> None:
        """The flip correction, driven where it actually runs."""

        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Hero", role="player")
        chars.refresh_sprites(index)
        window.document.set_sprite_cell(index, 0, 0, tile=17, palette=0, flip_h=True)
        chars.refresh_sprites(index)
        chars.set_pen(1)
        self.application.processEvents()

        click(chars.canvas, chars.canvas.pixel_centre(1, 4))

        # Drawn at x=1 on a horizontally-flipped cell → stored at x=6.
        self.assertEqual(window.document.sprite_tile_pixels(17)[4][6], 1)
        self.assertEqual(window.document.sprite_tile_pixels(17)[4][1], 0)


class TilePixelMouseTests(StudioTest):
    """The pixel editor is one self-painting widget (`_PixelGrid`), so a drag is
    a single press → moves → release on that one widget — the same shape as a
    real mouse, and the thing the old 64-button grid could not do on a real
    display."""

    def grid(self, window):
        window.select_mode("TILES")
        tiles = window.modes["TILES"]
        tiles.pixel_canvas.show()
        self.application.processEvents()
        return tiles

    def test_dragging_across_the_pixel_grid_draws_a_line(self) -> None:
        window = self.window("scratch")
        tiles = self.grid(window)
        tiles.select_tile(11, bank="bg")
        tiles.set_pen(3)
        canvas = tiles.pixel_canvas

        press(canvas, canvas.cell_centre(1, 2))
        for column in range(2, 6):
            move(canvas, canvas.cell_centre(column, 2))
        release(canvas, canvas.cell_centre(5, 2))

        pixels = window.document.background_tile_pixels(11)
        self.assertTrue(
            all(pixels[2][column] == 3 for column in range(1, 6)),
            f"the drag drew {[pixels[2][c] for c in range(1, 6)]}, not a line",
        )

    def test_a_single_press_is_one_pixel(self) -> None:
        window = self.window("scratch")
        tiles = self.grid(window)
        tiles.select_tile(4, bank="bg")
        tiles.set_pen(1)
        canvas = tiles.pixel_canvas

        press(canvas, canvas.cell_centre(6, 3))
        release(canvas, canvas.cell_centre(6, 3))

        self.assertEqual(window.document.background_tile_pixels(4)[3][6], 1)

    def test_a_pixel_drag_is_one_undo_step(self) -> None:
        window = self.window("scratch")
        tiles = self.grid(window)
        tiles.select_tile(12, bank="bg")
        tiles.set_pen(2)
        canvas = tiles.pixel_canvas

        press(canvas, canvas.cell_centre(0, 0))
        for column in range(1, 5):
            move(canvas, canvas.cell_centre(column, 0))
        release(canvas, canvas.cell_centre(4, 0))

        self.assertTrue(window.store.undo())
        pixels = window.document.background_tile_pixels(12)
        self.assertTrue(
            all(pixels[0][column] == 0 for column in range(0, 5)),
            "the pixel drag was more than one undo step",
        )


if __name__ == "__main__":
    unittest.main()
