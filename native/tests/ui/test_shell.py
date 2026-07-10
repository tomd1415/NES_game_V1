from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class NativeShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

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
        window.select_mode("CHARS")
        self.assertEqual(window.mode_title.text(), "CHARS")
        self.assertTrue(window._mode_buttons["CHARS"].isChecked())
        window.close()
        application.processEvents()


if __name__ == "__main__":
    unittest.main()
