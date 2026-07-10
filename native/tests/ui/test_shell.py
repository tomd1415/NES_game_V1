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
        window.world_canvas.edit_cell(2, 2)
        self.assertTrue(window.undo_action.isEnabled())
        window._undo_world()
        self.assertTrue(window.redo_action.isEnabled())
        window.select_mode("CHARS")
        self.assertEqual(window.mode_title.text(), "CHARS")
        self.assertTrue(window._mode_buttons["CHARS"].isChecked())
        self.assertFalse(window._tool_buttons["paint"].isEnabled())
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
            window._select_world_tool("paint")
            window.world_canvas.edit_cell(3, 3)
            self.assertTrue(window.recover_autosave())
            self.assertEqual(window.world_canvas.cell_value(2, 2), 0)
            self.assertEqual(window.world_canvas.cell_value(3, 3), 0)
            self.assertTrue(window._document.dirty)
            self.assertTrue(any(entry.reason == "before_recovery" for entry in window._autosave.entries()))
            window.new_project()
            self.assertEqual(window._document.name, "Untitled Game")
            self.assertTrue(window._document.dirty)
            self.assertFalse(window.world_canvas.can_undo)
            self.assertTrue(any(entry.reason == "before_new" for entry in window._autosave.entries()))
        window.close()
        application.processEvents()


if __name__ == "__main__":
    unittest.main()
