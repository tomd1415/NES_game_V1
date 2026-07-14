"""`.chr` / `.pal` / `.nam` — the formats every other NES tool speaks.

Without these a pupil's work cannot leave the Studio, and art made in YY-CHR,
NEXXT or a hex editor cannot come in.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from nes_studio.core import assets  # noqa: E402
from nes_studio.core.project_document import ProjectDocument  # noqa: E402


class ChrTests(unittest.TestCase):
    def test_a_tile_round_trips_through_planar_2bpp(self) -> None:
        pixels = [[(column + row) % 4 for column in range(8)] for row in range(8)]

        data = assets.tile_to_chr(pixels)

        self.assertEqual(len(data), 16)
        self.assertEqual(assets.chr_to_tile(data), pixels)

    def test_the_planes_are_the_nes_s_own_layout(self) -> None:
        """Low bits in the first 8 bytes, high bits in the second 8 — a real CHR
        file, not a private format that merely round-trips."""

        pixels = [[0] * 8 for _ in range(8)]
        pixels[0][0] = 3  # both bits set
        pixels[0][7] = 1  # low bit only
        pixels[1][0] = 2  # high bit only

        data = assets.tile_to_chr(pixels)

        self.assertEqual(data[0], 0b10000001)  # low plane, row 0
        self.assertEqual(data[8], 0b10000000)  # high plane, row 0
        self.assertEqual(data[1], 0b00000000)  # low plane, row 1
        self.assertEqual(data[9], 0b10000000)  # high plane, row 1

    def test_a_whole_bank_is_four_kilobytes(self) -> None:
        document = ProjectDocument.preview()
        data = assets.export_chr(document, "bg")
        self.assertEqual(len(data), 4096)

    def test_export_then_import_preserves_the_art(self) -> None:
        document = ProjectDocument.preview()
        document.set_background_tile_pixel(9, 3, 4, 2)
        document.set_background_tile_pixel(9, 4, 4, 1)

        data = assets.export_chr(document, "bg")
        blank = ProjectDocument.preview()
        count = assets.import_chr(blank, "bg", data)

        self.assertEqual(count, 256)
        self.assertEqual(blank.background_tile_pixels(9)[4][3], 2)
        self.assertEqual(blank.background_tile_pixels(9)[4][4], 1)

    def test_a_short_file_only_replaces_the_tiles_it_has(self) -> None:
        """A pupil exporting eight tiles from YY-CHR should get eight tiles back,
        not have the rest of their bank wiped."""

        document = ProjectDocument.preview()
        document.set_background_tile_pixel(100, 0, 0, 3)

        eight_tiles = bytes(16 * 8)
        count = assets.import_chr(document, "bg", eight_tiles)

        self.assertEqual(count, 8)
        self.assertEqual(document.background_tile_pixels(100)[0][0], 3, "the bank was wiped")

    def test_a_file_that_is_not_a_whole_number_of_tiles_is_rejected(self) -> None:
        document = ProjectDocument.preview()
        with self.assertRaises(assets.AssetFormatError):
            assets.import_chr(document, "bg", b"\x00" * 17)


class PalTests(unittest.TestCase):
    def test_the_file_is_the_ppu_s_32_bytes(self) -> None:
        document = ProjectDocument.preview()
        data = assets.export_pal(document)
        self.assertEqual(len(data), 32)

    def test_slot_zero_is_the_shared_backdrop_in_every_palette(self) -> None:
        """Every mirror of $3F00 holds the same colour. That is the hardware."""

        document = ProjectDocument.preview()
        document.set_universal_background(0x21)

        data = assets.export_pal(document)

        self.assertEqual(data[0], 0x21)
        self.assertEqual(data[4], 0x21)
        self.assertEqual(data[8], 0x21)
        self.assertEqual(data[12], 0x21)

    def test_round_trip(self) -> None:
        document = ProjectDocument.preview()
        document.set_universal_background(0x0F)
        document.set_background_palette_slot(1, 2, 0x2A)
        document.set_sprite_palette_slot(3, 0, 0x16)

        data = assets.export_pal(document)
        blank = ProjectDocument.preview()
        assets.import_pal(blank, data)

        self.assertEqual(blank.universal_background, 0x0F)
        self.assertEqual(blank.background_palette(1)[2], 0x2A)
        self.assertEqual(blank.sprite_palette(3)[0], 0x16)

    def test_colours_are_masked_to_the_nes_s_six_bits(self) -> None:
        document = ProjectDocument.preview()
        assets.import_pal(document, bytes([0xFF] * 32))
        self.assertEqual(document.universal_background, 0x3F)

    def test_a_wrong_sized_file_is_rejected(self) -> None:
        with self.assertRaises(assets.AssetFormatError):
            assets.import_pal(ProjectDocument.preview(), b"\x00" * 20)


class NamTests(unittest.TestCase):
    def test_a_screen_is_960_tiles_and_64_attribute_bytes(self) -> None:
        document = ProjectDocument.preview()
        data = assets.export_nam(document)
        self.assertEqual(len(data), 1024)

    def test_round_trip_keeps_tiles_and_palettes(self) -> None:
        document = ProjectDocument.preview()
        document.set_world_tile(5, 6, 0x2A)
        document.set_world_palette(4, 6, 2)
        document.set_world_palette(5, 6, 2)
        document.set_world_palette(4, 7, 2)
        document.set_world_palette(5, 7, 2)

        data = assets.export_nam(document)
        blank = ProjectDocument.preview()
        assets.import_nam(blank, data)

        self.assertEqual(blank.world_tiles(0, 0)[6][5], 0x2A)
        self.assertEqual(blank.world_palettes(0, 0)[6][5], 2)

    def test_attributes_are_packed_per_2x2_quadrant(self) -> None:
        """The NES stores one palette per 2x2 quadrant — four of them per byte."""

        palettes = [[0] * 32 for _ in range(30)]
        for row in (0, 1):
            for column in (0, 1):
                palettes[row][column] = 3  # top-left quadrant
        for row in (2, 3):
            for column in (2, 3):
                palettes[row][column] = 1  # bottom-right quadrant of the same byte

        data = assets._attribute_bytes(palettes)

        self.assertEqual(data[0] & 0b11, 3)
        self.assertEqual((data[0] >> 6) & 0b11, 1)

    def test_a_960_byte_file_without_attributes_is_accepted(self) -> None:
        document = ProjectDocument.preview()
        assets.import_nam(document, bytes([7]) * 960)
        self.assertEqual(document.world_tiles(0, 0)[0][0], 7)

    def test_a_wrong_sized_file_is_rejected(self) -> None:
        with self.assertRaises(assets.AssetFormatError):
            assets.parse_nam(b"\x00" * 100)


if __name__ == "__main__":
    unittest.main()
