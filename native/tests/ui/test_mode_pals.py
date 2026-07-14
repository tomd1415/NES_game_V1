"""PALS: the real 64-colour master palette, and the hardware's two locked slots."""

from __future__ import annotations

import unittest

from support import StudioTest


class PalsModeTests(StudioTest):
    def pals(self, window):
        window.select_mode("PALS")
        return window.modes["PALS"]

    def test_the_panel_is_legible(self) -> None:
        """PALS shipped rendering white-on-white: the theme listed `#rulesEditor`
        and friends but never `#paletteEditor`, so it fell back to Qt's default
        white — with light-blue labels on it."""

        window = self.window("basics")
        pals = self.pals(window)
        pals.resize(700, 700)
        self.assertRenders(pals, minimum_colours=5)

    def test_the_master_palette_has_all_64_nes_colours(self) -> None:
        """It used to *invent* them: QColor.fromHsv((tone * 23) % 360, ...) —
        64 colours the NES cannot produce."""

        from nes_studio.render.palette import NES_PALETTE_RGB

        window = self.window("basics")
        pals = self.pals(window)
        self.assertEqual(len(pals.master_palette_buttons), 64)

        for index in (0x00, 0x16, 0x2A, 0x30):
            expected = "#%02x%02x%02x" % NES_PALETTE_RGB[index]
            self.assertIn(expected, pals.master_palette_buttons[index].styleSheet())

    def test_clicking_a_colour_fills_the_selected_slot(self) -> None:
        window = self.window("basics")
        pals = self.pals(window)
        pals.select_slot("bg", 0, 0)

        window.findChild(object, "nesMasterColour16").click()

        self.assertEqual(window.document.background_palette(0)[0], 0x16)
        self.assertEqual(window.document.palette_recent_colours()[0], 0x16)

    def test_a_sprite_slot_is_reachable_too(self) -> None:
        window = self.window("basics")
        pals = self.pals(window)
        pals.select_slot("sprite", 2, 1)

        window.findChild(object, "nesMasterColour2A").click()

        self.assertEqual(window.document.sprite_palette(2)[1], 0x2A)

    def test_background_slot_zero_is_the_shared_backdrop(self) -> None:
        """All four background palettes share one backdrop — editing "BG2 colour
        0" independently is not a thing the NES can do."""

        window = self.window("basics")
        pals = self.pals(window)
        for button in pals.background_slot_zero:
            self.assertFalse(button.isEnabled())

        pals.universal_background.setValue(0x21)
        self.assertEqual(window.document.universal_background, 0x21)
        # Every palette's slot 0 now shows it.
        for button in pals.background_slot_zero:
            self.assertIn("#53aeff", button.styleSheet().lower())

    def test_sprite_slot_zero_is_transparent(self) -> None:
        window = self.window("basics")
        self.pals(window)
        for palette in range(4):
            label = window.findChild(object, f"spritePalette{palette}Slot0")
            self.assertIsNotNone(label)
            self.assertEqual(label.text(), "—")

    def test_usage_counts_show_which_palettes_are_unused(self) -> None:
        window = self.window("scratch")
        pals = self.pals(window)
        window.document.set_world_palette(0, 0, 2)
        pals.refresh()

        self.assertIn("BG2: 1 cell", pals.usage.text())
        self.assertIn("BG3: 0 cells  ·  unused", pals.usage.text())

    def test_editing_a_slot_is_undoable(self) -> None:
        window = self.window("basics")
        pals = self.pals(window)
        before = window.document.background_palette(0)[0]

        pals.background_palette_controls[0].setValue(0x16)
        self.assertEqual(window.document.background_palette(0)[0], 0x16)

        self.assertTrue(window.store.undo())
        self.assertEqual(window.document.background_palette(0)[0], before)


if __name__ == "__main__":
    unittest.main()
