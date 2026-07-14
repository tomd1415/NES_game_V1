"""Pixel-level tests for the NES renderer.

The existing suite asserts `document.field == X` and never asserts that anything
*renders* — which is how the app shipped with a transparent emulator frame and a
WORLD canvas that never drew the pupil's tiles. These tests look at pixels.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


def _blank_tile() -> dict:
    return {"name": "", "pixels": [[0] * 8 for _ in range(8)]}


def _solid_tile(value: int) -> dict:
    return {"name": "", "pixels": [[value] * 8 for _ in range(8)]}


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class FramebufferTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PySide6.QtWidgets import QApplication

        cls.app = QApplication.instance() or QApplication([])

    def _document(self, **overrides):
        from nes_studio.core.project_document import ProjectDocument

        # Tile 1 is solid pixel-value 1; tile 2 is solid pixel-value 2.
        tiles = [_blank_tile() for _ in range(256)]
        tiles[1] = _solid_tile(1)
        tiles[2] = _solid_tile(2)

        state = {
            "name": "render test",
            "engineVersion": 63,
            "version": 1,
            "universal_bg": 0x0F,  # black backdrop
            "bg_palettes": [
                {"slots": [0x16, 0x27, 0x30]},  # red, orange, white
                {"slots": [0x11, 0x21, 0x31]},
                {"slots": [0x1A, 0x2A, 0x3A]},
                {"slots": [0x12, 0x22, 0x32]},
            ],
            "sprite_palettes": [{"slots": [0x16, 0x27, 0x30]} for _ in range(4)],
            "bg_tiles": tiles,
            "sprite_tiles": tiles,
            "sprites": [],
            "backgrounds": [
                {
                    "name": "bg",
                    "dimensions": {"screens_x": 1, "screens_y": 1},
                    "nametable": [
                        [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
                    ],
                }
            ],
            "selectedBgIdx": 0,
        }
        state.update(overrides)
        return ProjectDocument.from_json(json.dumps(state).encode())

    def test_pixel_value_zero_is_the_universal_backdrop(self) -> None:
        """Not the palette's slot 0 — all four BG palettes share one backdrop."""

        from PySide6.QtGui import QColor

        from nes_studio.render.framebuffer import render_nametable
        from nes_studio.render.palette import nes_rgb

        document = self._document()  # every cell is tile 0 (all pixel value 0)
        image = render_nametable(document)

        expected = QColor(*nes_rgb(0x0F)).rgb()
        self.assertEqual(image.pixel(0, 0), expected)
        self.assertEqual(image.pixel(255, 239), expected)

    def test_tile_pixels_use_the_cells_palette(self) -> None:
        from PySide6.QtGui import QColor

        from nes_studio.render.framebuffer import render_nametable
        from nes_studio.render.palette import nes_rgb

        document = self._document()
        grid = document.state["backgrounds"][0]["nametable"]
        grid[0][0] = {"tile": 1, "palette": 0}  # value 1 -> bg_palettes[0][0] = 0x16
        grid[0][1] = {"tile": 1, "palette": 1}  # value 1 -> bg_palettes[1][0] = 0x11
        grid[0][2] = {"tile": 2, "palette": 0}  # value 2 -> bg_palettes[0][1] = 0x27

        image = render_nametable(document)

        self.assertEqual(image.pixel(0, 0), QColor(*nes_rgb(0x16)).rgb())
        self.assertEqual(image.pixel(8, 0), QColor(*nes_rgb(0x11)).rgb())
        self.assertEqual(image.pixel(16, 0), QColor(*nes_rgb(0x27)).rgb())

    def test_screen_is_opaque(self) -> None:
        """RGBA8888 over a zero alpha byte yields a fully transparent screen."""

        from nes_studio.render.framebuffer import render_nametable

        image = render_nametable(self._document())
        self.assertEqual(image.pixelColor(0, 0).alpha(), 255)

    def test_sprite_pixel_value_zero_is_transparent(self) -> None:
        from nes_studio.render.framebuffer import render_sprite

        document = self._document()
        sprite = {
            "name": "hero",
            "cells": [[{"tile": 0, "palette": 0}, {"tile": 1, "palette": 0}]],
        }
        image = render_sprite(document, sprite)

        self.assertEqual(image.width(), 16)
        self.assertEqual(image.height(), 8)
        # Left cell is tile 0 (all value 0) -> transparent.
        self.assertEqual(image.pixelColor(0, 0).alpha(), 0)
        # Right cell is tile 1 (all value 1) -> opaque.
        self.assertEqual(image.pixelColor(8, 0).alpha(), 255)

    def test_sprite_cells_honour_flips(self) -> None:
        from nes_studio.render.framebuffer import render_sprite

        document = self._document()
        # A tile whose top-left pixel is the only set pixel.
        corner = [[0] * 8 for _ in range(8)]
        corner[0][0] = 1
        document.state["sprite_tiles"][3] = {"name": "", "pixels": corner}

        plain = render_sprite(document, {"cells": [[{"tile": 3, "palette": 0}]]})
        self.assertEqual(plain.pixelColor(0, 0).alpha(), 255)
        self.assertEqual(plain.pixelColor(7, 0).alpha(), 0)

        flipped = render_sprite(
            document, {"cells": [[{"tile": 3, "palette": 0, "flipH": True}]]}
        )
        self.assertEqual(flipped.pixelColor(0, 0).alpha(), 0)
        self.assertEqual(flipped.pixelColor(7, 0).alpha(), 255)

    def test_empty_cells_are_skipped(self) -> None:
        from nes_studio.render.framebuffer import render_sprite

        document = self._document()
        image = render_sprite(
            document, {"cells": [[{"tile": 1, "palette": 0, "empty": True}]]}
        )
        self.assertEqual(image.pixelColor(0, 0).alpha(), 0)

    def test_attribute_conflicts_are_detected_per_quadrant(self) -> None:
        """The NES stores one palette per 2x2 quadrant, not per cell."""

        from nes_studio.render.framebuffer import attribute_conflicts

        document = self._document()
        self.assertEqual(attribute_conflicts(document), [])

        grid = document.state["backgrounds"][0]["nametable"]
        grid[0][0] = {"tile": 1, "palette": 0}
        grid[0][1] = {"tile": 1, "palette": 2}  # same quadrant, different palette

        self.assertEqual(attribute_conflicts(document), [(0, 0)])

    def test_rendering_a_full_screen_is_fast_enough_to_drag_paint(self) -> None:
        import time

        from nes_studio.render.framebuffer import render_nametable

        document = self._document()
        grid = document.state["backgrounds"][0]["nametable"]
        for row in range(30):
            for column in range(32):
                grid[row][column] = {"tile": (row + column) % 3, "palette": column % 4}

        start = time.perf_counter()
        for _ in range(10):
            render_nametable(document)
        per_frame = (time.perf_counter() - start) / 10

        # Generous: a paint drag repaints on every mouse move.
        self.assertLess(per_frame, 0.050, f"render took {per_frame * 1000:.1f} ms")


if __name__ == "__main__":
    unittest.main()
