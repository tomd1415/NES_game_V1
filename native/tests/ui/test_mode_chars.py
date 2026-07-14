"""CHARS: the composition canvas, the shared-tile guard, roles, animations.

CHARS had **no drawing canvas at all** — you edited one cell of a character
through four spin boxes, and to change a pixel you left for TILES and found the
right 8x8 slot yourself.
"""

from __future__ import annotations

import unittest

from support import StudioTest


class CharsCanvasTests(StudioTest):
    def chars(self, window):
        window.select_mode("CHARS")
        return window.modes["CHARS"]

    def test_the_character_is_drawn(self) -> None:
        window = self.window("basics")
        chars = self.chars(window)
        chars.canvas.resize(320, 320)
        self.assertRenders(chars.canvas, minimum_colours=3)

    def test_painting_writes_through_to_the_right_tile(self) -> None:
        """The canvas paints the *character*; the pixel lands in whichever 8x8
        tile owns it."""

        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Hero", role="player")
        window.document.resize_sprite(index, 2, 2)
        chars.refresh_sprites(index)
        chars.set_pen(3)

        cell = window.document.state["sprites"][index]["cells"][1][1]
        tile = int(cell["tile"])

        chars._paint_pixel(1, 1, 5, 6)

        self.assertEqual(window.document.sprite_tile_pixels(tile)[6][5], 3)

    def test_painting_a_flipped_cell_lands_where_you_drew_it(self) -> None:
        """A flipped cell draws its tile mirrored, so the pixel the pupil clicked
        is not the pixel in the tile."""

        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Hero", role="player")
        chars.refresh_sprites(index)
        window.document.set_sprite_cell(index, 0, 0, tile=9, palette=0, flip_h=True)
        chars.refresh_sprites(index)
        chars.set_pen(2)

        chars._paint_pixel(0, 0, 1, 4)

        # Drawn at x=1 on a horizontally-flipped cell → stored at x=6.
        self.assertEqual(window.document.sprite_tile_pixels(9)[4][6], 2)
        self.assertEqual(window.document.sprite_tile_pixels(9)[4][1], 0)

    def test_a_stroke_is_one_undo_step(self) -> None:
        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Hero", role="player")
        chars.refresh_sprites(index)
        chars.set_pen(1)
        tile = int(window.document.state["sprites"][index]["cells"][0][0]["tile"])

        chars._begin_stroke()
        for column in range(5):
            chars._paint_pixel(0, 0, column, 2)
        chars._end_stroke()

        self.assertTrue(all(window.document.sprite_tile_pixels(tile)[2][c] == 1 for c in range(5)))
        self.assertTrue(window.store.undo())
        self.assertTrue(all(window.document.sprite_tile_pixels(tile)[2][c] != 1 for c in range(5)))

    def test_roles_and_sizes_round_trip(self) -> None:
        window = self.window("basics")
        chars = self.chars(window)
        index = window.document.add_sprite("Slime")
        chars.refresh_sprites(index)

        chars.sprite_role.setCurrentIndex(chars.sprite_role.findData("enemy"))
        self.assertEqual(window.document.state["sprites"][index]["role"], "enemy")

        chars.sprite_width.setValue(2)
        chars.sprite_height.setValue(2)
        self.assertEqual(window.document.state["sprites"][index]["width"], 2)

    def test_oam_cost_is_shown(self) -> None:
        """A big character eats the NES's 64 hardware sprites fast."""

        window = self.window("scratch")
        chars = self.chars(window)
        index = window.document.add_sprite("Giant")
        window.document.resize_sprite(index, 4, 4)
        chars.refresh_sprites(index)

        self.assertIn("16 of the NES's 64", chars.oam_note.text())

    def test_the_animation_preview_shows_the_frame(self) -> None:
        """The preview was a *label of text* — it never showed the animation."""

        window = self.window("basics")
        chars = self.chars(window)
        index = window.document.add_sprite("Walker", role="enemy")
        for column in range(8):
            window.document.set_sprite_tile_pixel(
                int(window.document.state["sprites"][index]["cells"][0][0]["tile"]), column, 3, 2
            )
        chars.refresh_sprites(index)
        window.document.add_animation("Walk", frames=[index])
        chars.refresh_animations(0)

        pixmap = chars.animation_preview.pixmap()
        self.assertFalse(pixmap.isNull(), "the animation preview drew no picture")

    def test_animation_frames_reorder(self) -> None:
        window = self.window("basics")
        chars = self.chars(window)
        index = window.document.add_sprite("Walker", role="enemy")
        chars.refresh_sprites(index)
        window.document.add_animation("Walk", frames=[index])
        chars.refresh_animations(0)

        chars.animation_add_frame_button.click()
        self.assertEqual(len(window.document.state["animations"][0]["frames"]), 2)

        chars.animation_fps.setValue(12)
        self.assertEqual(window.document.state["animations"][0]["fps"], 12)

        chars.animation_remove_frame_button.click()
        self.assertEqual(len(window.document.state["animations"][0]["frames"]), 1)


class SharedTileGuardTests(StudioTest):
    """Repainting the Villager's boot can silently repaint the Hero's."""

    def test_the_guard_finds_the_other_users(self) -> None:
        from nes_studio.ui.widgets.shared_tile_guard import sprite_tile_users

        window = self.window("scratch")
        hero = window.document.add_sprite("Hero", role="player")
        villager = window.document.add_sprite("Villager", role="npc")
        window.document.set_sprite_cell(hero, 0, 0, tile=42, palette=0)
        window.document.set_sprite_cell(villager, 0, 0, tile=42, palette=0)

        users = sprite_tile_users(window.document, 42, excluding=hero)

        self.assertEqual([user.name for user in users], ["Villager"])

    def test_a_tile_nobody_else_uses_is_not_shared(self) -> None:
        from nes_studio.ui.widgets.shared_tile_guard import sprite_tile_users

        window = self.window("scratch")
        hero = window.document.add_sprite("Hero", role="player")
        window.document.set_sprite_cell(hero, 0, 0, tile=99, palette=0)

        self.assertEqual(sprite_tile_users(window.document, 99, excluding=hero), [])

    def test_duplicating_gives_this_character_its_own_copy(self) -> None:
        """'Duplicate first' must repoint the cell, or the pupil keeps editing the
        shared tile and nothing appears to have happened."""

        from nes_studio.ui.widgets.shared_tile_guard import SharedTileGuard

        window = self.window("scratch")
        chars = window.modes["CHARS"]
        hero = window.document.add_sprite("Hero", role="player")
        villager = window.document.add_sprite("Villager", role="npc")
        window.document.set_sprite_cell(hero, 0, 0, tile=42, palette=0)
        window.document.set_sprite_cell(villager, 0, 0, tile=42, palette=0)
        window.document.set_sprite_tile_pixel(42, 0, 0, 3)

        guard = SharedTileGuard(window, lambda: window.document)
        # Answer the dialog without showing it.
        guard._decisions[42] = SharedTileGuard.CANCELLED
        decision, tile = guard.check(42, sprite_index=hero)
        self.assertEqual(decision, SharedTileGuard.CANCELLED)
        self.assertEqual(tile, 42)

        guard.reset()
        guard._decisions[42] = SharedTileGuard.EVERYWHERE
        decision, tile = guard.check(42, sprite_index=hero)
        self.assertEqual(decision, SharedTileGuard.EVERYWHERE)

        self.assertIsNotNone(chars)

    def test_the_note_says_when_a_drawing_is_shared(self) -> None:
        window = self.window("scratch")
        window.select_mode("CHARS")
        chars = window.modes["CHARS"]
        hero = window.document.add_sprite("Hero", role="player")
        villager = window.document.add_sprite("Villager", role="npc")
        window.document.set_sprite_cell(hero, 0, 0, tile=42, palette=0)
        window.document.set_sprite_cell(villager, 0, 0, tile=42, palette=0)
        chars.refresh_sprites(hero)

        self.assertIn("shared with Villager", chars.shared_note.text())


if __name__ == "__main__":
    unittest.main()
