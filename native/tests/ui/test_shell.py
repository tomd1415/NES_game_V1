from __future__ import annotations

import importlib.util
import os
import sys
import unittest
import json
import tempfile
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class NativeShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        os.environ.setdefault("NES_STUDIO_TEST_MODE", "1")
        cls.data_root = tempfile.TemporaryDirectory()
        os.environ["NES_STUDIO_DATA_ROOT"] = cls.data_root.name

    @classmethod
    def tearDownClass(cls) -> None:
        os.environ.pop("NES_STUDIO_DATA_ROOT", None)
        cls.data_root.cleanup()

    def test_shell_constructs_without_starting_event_loop(self) -> None:
        from nes_studio.application import create_application
        from nes_studio.core.resources import ResourceLocator
        from nes_studio.ui.main_window import MainWindow

        application = create_application(["nes-studio-test"])
        window = MainWindow(ResourceLocator.discover(NATIVE_ROOT))
        self.assertEqual(window.objectName(), "mainWindow")
        self.assertIn("NES Studio", window.windowTitle())
        self.assertIsNotNone(window.findChild(object, "studioWorkspace"))
        self.assertIsNotNone(window.findChild(object, "modeRail"))
        self.assertIsNotNone(window.findChild(object, "nesScreen"))
        self.assertIsNotNone(window.findChild(object, "questPanel"))
        self.assertEqual(window.mode_title.text(), "WORLD")
        self.assertTrue(window._tool_buttons["select"].isEnabled())
        window._select_world_tool("paint")
        self.assertEqual(window.world_canvas.tool, "paint")
        window.world_layout.setCurrentIndex(3)
        self.assertEqual(window._document.background_dimensions(), (2, 2))
        window.metatile_mode_button.click()
        self.assertEqual(window._document.background_tile_mode(), "16x16")
        before = window.metatile_list.count()
        window._add_metatile()
        self.assertEqual(window.metatile_list.count(), before + 1)
        window.metatile_mode_button.click()
        self.assertEqual(window._document.background_tile_mode(), "8x8")
        window.world_screen_x.setValue(1)
        window.world_screen_y.setValue(1)
        window._select_world_tool("paint")
        window.world_canvas.edit_cell(0, 0)
        self.assertEqual(window._document.world_tiles(1, 1)[0][0], 1)
        self.assertEqual(window._document.world_tiles(0, 0)[0][0], 0)
        enemy = window._document.add_sprite("Slime", role="enemy")
        window._refresh_scene_editor()
        window.scene_sprite.setCurrentIndex(0)
        window._add_scene_instance()
        self.assertEqual(window._document.scene_instances()[0]["spriteIdx"], enemy)
        window.scene_x.setValue(88)
        self.assertEqual(window._document.scene_instances()[0]["x"], 88)
        window.world_layout.setCurrentIndex(0)
        self.assertEqual(window._document.background_dimensions(), (1, 1))
        window.universal_background.setValue(0x0F)
        self.assertEqual(window._document.universal_background, 0x0F)
        window.world_canvas.edit_cell(2, 2)
        self.assertTrue(window.undo_action.isEnabled())
        window._undo_world()
        self.assertTrue(window.redo_action.isEnabled())
        window.select_mode("CHARS")
        self.assertEqual(window.mode_title.text(), "CHARS")
        self.assertEqual(window.editor_stack.currentWidget(), window.chars_editor)
        window.sprite_role.setCurrentText("enemy")
        self.assertEqual(window._document.state["sprites"][window.sprite_list.currentRow()]["role"], "enemy")
        self.assertTrue(window._mode_buttons["CHARS"].isChecked())
        self.assertFalse(window._tool_buttons["paint"].isEnabled())
        window._document.add_animation("Walk", frames=[window.sprite_list.currentRow()])
        window._refresh_animation_list(0)
        self.assertEqual(window.animation_list.currentRow(), 0)
        window.animation_fps.setValue(12)
        self.assertEqual(window._document.state["animations"][0]["fps"], 12)
        window.animation_add_frame_button.click()
        self.assertEqual(len(window._document.state["animations"][0]["frames"]), 2)
        window.animation_assignments["walk"].setCurrentIndex(1)
        self.assertEqual(window._document.state["animation_assignments"]["walk"], 1)
        window.animation_remove_frame_button.click()
        self.assertEqual(len(window._document.state["animations"][0]["frames"]), 1)
        window.select_mode("RULES")
        window.game_style.setCurrentText("racer")
        window.game_options["racerTopSpeed"].setValue(4)
        self.assertEqual(window._document.state["builder"]["modules"]["game"]["config"]["racerTopSpeed"], 4)
        window.player_options["startX"].setValue(88)
        window.attack_button.setCurrentText("a")
        player_config = window._document.state["builder"]["modules"]["players"]["submodules"]["player1"]["config"]
        self.assertEqual(player_config["startX"], 88)
        self.assertEqual(player_config["attackButton"], "a")
        window.global_options["gravityPx"].setValue(3)
        window.walk_bob.setChecked(True)
        self.assertEqual(window._document.state["builder"]["modules"]["globals"]["config"]["gravityPx"], 3)
        window.damage_respawn_hp.setValue(3)
        window.stomp_defeat.setChecked(True)
        self.assertEqual(window._document.state["builder"]["modules"]["damage"]["config"]["respawnHp"], 3)
        window._document.add_audio_song("theme.s", ".export _theme\ntheme: .byte 0")
        window.select_mode("SOUND")
        self.assertEqual(window.editor_stack.currentWidget(), window.sound_editor)
        self.assertIn("theme", window.song_list.item(0).text())
        self.assertIn("Audio uses", window.audio_budget.text())
        window.select_mode("CODE")
        self.assertEqual(window.editor_stack.currentWidget(), window.code_preview)
        self.assertIn("#include", window.code_preview.toPlainText())
        window.select_mode("PALS")
        self.assertEqual(window.editor_stack.currentWidget(), window.palette_editor)
        window._background_palette_controls[0].setValue(0x2A)
        self.assertEqual(window._document.background_palette(0)[0], 0x2A)
        window._sprite_palette_controls[0].setValue(0x16)
        self.assertEqual(window._document.sprite_palette(0)[0], 0x16)
        window.select_mode("TILES")
        self.assertEqual(window.editor_stack.currentWidget(), window.tile_editor)
        window.tile_selector.setValue(7)
        window._tile_pixel_buttons[4 * 8 + 3].click()
        self.assertEqual(window._document.background_tile_pixels(7)[4][3], 1)
        window.tile_bank.setCurrentIndex(1)
        window._tile_pixel_buttons[4 * 8 + 3].click()
        self.assertEqual(window._document.sprite_tile_pixels(7)[4][3], 1)
        self.assertEqual(window._document.background_tile_pixels(7)[4][3], 1)
        window.tile_bank.setCurrentIndex(0)
        window.tile_selector.setValue(7)
        window.findChild(object, "duplicateTileButton").click()
        self.assertEqual(window.tile_selector.value(), 0)
        self.assertEqual(window._document.background_tile_pixels(0)[4][3], 1)
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory) / "project.json"
            window.select_mode("WORLD")
            window._select_world_tool("paint")
            window.world_canvas.edit_cell(2, 2)
            self.assertTrue(window.save_project_path(str(project)))
            saved = json.loads(project.read_text(encoding="utf-8"))
            self.assertEqual(saved["backgrounds"][0]["nametable"][2][2]["tile"], 1)
            self.assertTrue(window.open_project_path(str(project)))
            self.assertEqual(window.world_canvas.cell_value(2, 2), 1)
            window._select_world_tool("erase")
            window.world_canvas.edit_cell(2, 2)
            window._flush_autosave()
            window._storage.repository.snapshot(
                window._session.project_id, window._document.to_json(), reason="manual_test"
            )
            window._select_world_tool("paint")
            window.world_canvas.edit_cell(3, 3)
            self.assertTrue(window.recover_autosave())
            self.assertEqual(window.world_canvas.cell_value(2, 2), 0)
            self.assertEqual(window.world_canvas.cell_value(3, 3), 0)
            self.assertFalse(window._document.dirty)
            self.assertTrue(any(entry.reason == "before_restore" for entry in window._storage.repository.snapshots(window._session.project_id)))
            previous_project_id = window._session.project_id
            window.new_project()
            self.assertEqual(window._document.name, "Untitled Game")
            self.assertFalse(window._document.dirty)
            self.assertFalse(window.world_canvas.can_undo)
            self.assertIn(previous_project_id, {entry.project_id for entry in window._storage.projects()})
        window.close()
        application.processEvents()


if __name__ == "__main__":
    unittest.main()
