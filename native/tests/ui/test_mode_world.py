"""WORLD: painting, backgrounds, screens, metatiles, entities, the eyedropper."""

from __future__ import annotations

import unittest

from support import StudioTest


class WorldModeTests(StudioTest):
    def world(self, window):
        return window.modes["WORLD"]

    def test_the_canvas_draws_the_real_game(self) -> None:
        """WORLD used to fill each cell with `NES_COLOURS[value % 4]` — a
        four-colour placebo keyed off the *tile index*. It never showed the pixel
        art made in TILES and never applied the palettes from PALS."""

        window = self.window("basics")
        world = self.world(window)
        world.canvas.resize(512, 480)
        self.assertRenders(world.canvas, minimum_colours=4)

    def test_painting_a_cell_writes_through_to_the_document(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(9)

        world.canvas.edit_cell(4, 5)

        self.assertEqual(window.document.world_tiles(0, 0)[5][4], 9)

    def test_painting_repaints_the_screen(self) -> None:
        """The frame is re-rendered from the document, not patched in place."""

        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(1)
        # Give tile 1 some pixels, so painting it is visible.
        for column in range(8):
            window.document.set_background_tile_pixel(1, column, 4, 3)
        world.redraw()

        before = world.canvas._frame.copy()
        world.canvas.edit_cell(0, 0)
        after = world.canvas._frame

        # Cell (0, 0) covers pixels 0-7; the row we drew is y=4.
        self.assertNotEqual(
            before.pixel(2, 4), after.pixel(2, 4), "painting did not change the picture"
        )

    def test_right_click_picks_up_the_cell(self) -> None:
        """The eyedropper: copying a cell you like beats hunting for its index."""

        window = self.window("scratch")
        world = self.world(window)
        world.select_tool("paint")
        world.tile_value.setValue(17)
        world.palette_value.setValue(2)
        world.canvas.edit_cell(6, 6)
        world.select_tool("palette")
        world.canvas.edit_cell(6, 6)

        world.tile_value.setValue(0)
        world.palette_value.setValue(0)
        world.canvas.picked.emit(6, 6)

        self.assertEqual(world.tile_value.value(), 17)
        self.assertEqual(world.palette_value.value(), 2)

    def test_switching_screen_shows_that_screen(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.world_layout.setCurrentIndex(3)  # 2x2
        self.assertEqual(window.document.background_dimensions(), (2, 2))

        world.world_screen_x.setValue(1)
        world.world_screen_y.setValue(1)
        world.select_tool("paint")
        world.tile_value.setValue(1)
        world.canvas.edit_cell(0, 0)

        self.assertEqual(window.document.world_tiles(1, 1)[0][0], 1)
        self.assertEqual(window.document.world_tiles(0, 0)[0][0], 0)

    def test_backgrounds_can_be_added_and_switched(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        window.document.add_background("Level 2")
        world.refresh()
        self.assertEqual(len(window.document.background_names()), 2)

        target = 0 if window.document.selected_background_index != 0 else 1
        world._select_background(target)  # must not raise (it once raised NameError)

        self.assertEqual(window.document.selected_background_index, target)

    def test_metatile_mode_round_trips(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        world.metatile_mode_button.click()
        self.assertEqual(window.document.background_tile_mode(), "16x16")

        before = world.metatile_list.count()
        world._add_metatile()
        self.assertEqual(world.metatile_list.count(), before + 1)

        world.metatile_mode_button.click()
        self.assertEqual(window.document.background_tile_mode(), "8x8")

    def test_entities_are_drawn_as_their_own_sprite(self) -> None:
        """The shell read `instance["sprite"]`, a key the document has never had,
        so every entity was drawn with sprite 0's artwork whatever it was."""

        window = self.window("basics")
        world = self.world(window)
        villager = window.document.add_sprite("Villager", role="npc")
        # Give it art that sprite 0 does not have.
        for column in range(8):
            window.document.set_sprite_tile_pixel(0, column, column, 2)
        window.document.add_scene_instance(villager, x=40, y=40)
        world.refresh_entities()

        images = world.canvas._entity_images
        self.assertTrue(images, "the entity was not drawn at all")
        self.assertIsNotNone(images[0])
        self.assertFalse(images[0].isNull())

    def test_entity_round_trips_through_the_dock(self) -> None:
        window = self.window("scratch")
        world = self.world(window)
        enemy = window.document.add_sprite("Slime", role="enemy")
        world.refresh_entities()
        world.scene_sprite.setCurrentIndex(0)
        world._add_entity()

        self.assertEqual(window.document.scene_instances()[0]["spriteIdx"], enemy)

        world.scene_x.setValue(88)
        world.scene_speed.setValue(3)
        world.scene_text.setText("Beware!")
        world._update_entity()

        instance = window.document.scene_instances()[0]
        self.assertEqual(instance["x"], 88)
        self.assertEqual(instance["speed"], 3)
        self.assertEqual(instance["text"], "Beware!")

    def test_attribute_conflicts_are_flagged(self) -> None:
        """The NES stores one palette per 2x2 quadrant, so a quadrant using two
        cannot render as drawn. The pupil should learn that before the build."""

        window = self.window("scratch")
        world = self.world(window)
        window.document.set_world_palette(0, 0, 1)
        window.document.set_world_palette(1, 0, 2)
        world.redraw()

        self.assertIn((0, 0), world.canvas._conflicts)
        self.assertIn("more than one palette", world.conflict_label.text())

    def test_the_dock_exists(self) -> None:
        """WORLD's inspector is a dock like everyone else's now."""

        window = self.window()
        window.select_mode("WORLD")
        self.assertIsNotNone(self.world(window).dock())
        self.assertFalse(window.context_dock.isHidden())


if __name__ == "__main__":
    unittest.main()
