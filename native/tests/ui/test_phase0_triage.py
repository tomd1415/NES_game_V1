"""Regression tests for the Phase 0 triage fixes.

Every bug covered here shipped while the whole suite was green, because the
existing tests assert `document.field == X` and never drive these code paths.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class Phase0TriageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        os.environ.setdefault("NES_STUDIO_TEST_MODE", "1")
        cls.data_root = tempfile.TemporaryDirectory()
        os.environ["NES_STUDIO_DATA_ROOT"] = cls.data_root.name

        from nes_studio.application import create_application

        cls.application = create_application(["nes-studio-test"])

    @classmethod
    def tearDownClass(cls) -> None:
        os.environ.pop("NES_STUDIO_DATA_ROOT", None)
        cls.data_root.cleanup()

    def _window(self):
        from nes_studio.core.resources import ResourceLocator
        from nes_studio.ui.main_window import MainWindow

        return MainWindow(ResourceLocator.discover(NATIVE_ROOT))

    def test_switching_background_does_not_raise(self) -> None:
        """`_select_background` referenced an undefined `dimensions` (NameError).

        The exception fired *after* the document was mutated and autosaved, so
        the UI was left half-updated.
        """

        window = self._window()
        window._document.add_background("Level 2")
        window._sync_background_selector()
        names = window._document.background_names()
        self.assertEqual(len(names), 2)

        target = 0 if window._document.selected_background_index != 0 else 1
        window._select_background(target)  # must not raise

        self.assertEqual(window._document.selected_background_index, target)

    def test_opening_a_project_does_not_overwrite_the_current_one(self) -> None:
        """Open used `replace_project_id=<current>`, clobbering the open project."""

        window = self._window()
        original_id = window._session.project_id
        window._document.state["name"] = "Original"
        window._document.dirty = True
        window._session.flush()

        # A different project on disk.
        incoming = json.loads(window._document.to_json())
        incoming["name"] = "Incoming"
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as handle:
            json.dump(incoming, handle)
            path = handle.name

        try:
            self.assertTrue(window.open_project_path(path))
        finally:
            os.unlink(path)

        # We switched to a *new* project...
        self.assertNotEqual(window._session.project_id, original_id)
        self.assertEqual(window._document.name, "Incoming")

        # ...and the original still exists, unharmed.
        stored = {p.project_id: p for p in window._storage.projects()}
        self.assertIn(original_id, stored)
        self.assertEqual(stored[original_id].name, "Original")

    def test_quest_panel_reflects_the_document(self) -> None:
        """The quest log was 5 hardcoded developer milestones, all ticked."""

        window = self._window()
        labels = [label.text() for label in window._quest_labels]
        self.assertEqual(len(labels), len(window.QUESTS))
        self.assertNotIn("Launch a real Qt application", " ".join(labels))

        # "Take it for a spin" is only earned by actually building.
        spin = [text for text, _ in window.QUESTS].index("Take it for a spin")
        self.assertTrue(window._quest_labels[spin].text().startswith("○"))

        window._document.mark_built()
        window._refresh_quests()
        self.assertTrue(window._quest_labels[spin].text().startswith("✓"))

    def test_palette_editor_is_themed(self) -> None:
        """#paletteEditor was missing from the theme, so PALS rendered white."""

        window = self._window()
        theme = window.styleSheet()
        self.assertIn("#paletteEditor", theme)
        self.assertIn("#paletteEditorContent", theme)

    def test_save_flushes_to_local_storage(self) -> None:
        """There was no Save at all — only Save As, which exports a JSON copy."""

        window = self._window()
        window._document.state["name"] = "Saved by Ctrl+S"
        window._document.dirty = True
        window._save_project()
        self.assertFalse(window._document.dirty)

        stored = {p.project_id: p for p in window._storage.projects()}
        self.assertEqual(stored[window._session.project_id].name, "Saved by Ctrl+S")


if __name__ == "__main__":
    unittest.main()
