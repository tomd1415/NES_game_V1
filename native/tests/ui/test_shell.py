"""The shell: app bar, mode rail, docks, levels, theme, projects.

Was a 240-line monolith that drove every mode in one test method and aborted
everything after its first failure. The modes now have their own files; this one
is about the chrome that holds them.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from support import StudioTest


class ShellTests(StudioTest):
    def test_the_workspace_is_assembled(self) -> None:
        window = self.window()
        self.assertEqual(window.objectName(), "mainWindow")
        self.assertIn("NES Studio", window.windowTitle())
        for name in ("studioWorkspace", "modeRail", "appBar", "nesScreen", "questPanel"):
            self.assertIsNotNone(window.findChild(object, name), f"missing {name}")

    def test_every_mode_has_a_dock(self) -> None:
        """The inspector used to exist **only in WORLD**
        (`setVisible(mode == "WORLD")`), so in the other six modes the entire
        left column vanished."""

        window = self.window()
        for mode_id, mode in window.modes.items():
            window.select_mode(mode_id)
            self.assertIsNotNone(mode.dock(), f"{mode_id} has no dock")
            self.assertFalse(
                window.context_dock.isHidden(), f"the dock is hidden in {mode_id}"
            )
            self.assertEqual(window.mode_title.text(), mode.title)

    def test_the_shell_owns_no_editors(self) -> None:
        """MainWindow was 3,008 lines and 176 methods with all seven modes built
        inline. The point of the refactor is that it no longer knows what is
        inside one."""

        from nes_studio.ui import main_window

        source = Path(main_window.__file__).read_text(encoding="utf-8")
        self.assertLess(
            len(source.splitlines()),
            800,
            "MainWindow is growing editors again",
        )

    def test_switching_mode_swaps_the_stage(self) -> None:
        window = self.window()
        window.select_mode("WORLD")
        self.assertEqual(window.editor_stack.currentWidget(), window.television)

        window.select_mode("TILES")
        self.assertEqual(window.editor_stack.currentWidget(), window.modes["TILES"])

    def test_the_project_name_is_editable_in_the_app_bar(self) -> None:
        window = self.window("scratch")
        window.project_name.setText("Renamed in the bar")
        window.project_name.editingFinished.emit()

        self.assertEqual(window.document.name, "Renamed in the bar")
        self.assertIn("Renamed in the bar", window.windowTitle())

    def test_the_save_dot_tracks_unsaved_work(self) -> None:
        window = self.window("scratch")
        window.session.flush()
        window.mark_saved()
        self.assertEqual(window.save_dot.objectName(), "saveDotSaved")

        window.document.set_world_tile(1, 1, 3)
        window.document_edited()
        self.assertEqual(window.save_dot.objectName(), "saveDotPending")

        window.session.flush()
        self.assertEqual(window.save_dot.objectName(), "saveDotSaved")

    def test_no_dock_clips_its_own_controls(self) -> None:
        """The dock has no horizontal scrollbar, so a control wider than the dock
        is not scrolled to — it is cut in half. `Duplicate` rendered as `Du`."""

        window = self.window()
        window.resize(1500, 940)
        window.show()
        self.application.processEvents()

        for mode_id, mode in window.modes.items():
            window.select_mode(mode_id)
            self.application.processEvents()
            # Measure the viewport *per mode*, after the layout has settled:
            # sampling it once up front let a clipped dock pass.
            available = window.context_dock.viewport().width()
            needed = mode.dock().minimumSizeHint().width()
            self.assertLessEqual(
                needed,
                available,
                f"{mode_id}'s inspector needs {needed}px but the dock gives it "
                f"{available}px — its controls are being cut off",
            )

        # And the whole dock, not just the modes' half of it: the mode title and
        # help text live in the host, and the help was wrapping past the edge.
        content = window.context_dock.widget()
        self.assertLessEqual(
            content.minimumSizeHint().width(),
            window.context_dock.viewport().width(),
            "the dock's own contents overflow it",
        )

    def test_a_closed_window_frees_its_widgets(self) -> None:
        """A `MainWindow` is ~1,170 widgets, and the theme is applied to the
        *application* — so every leaked window makes every later `setStyleSheet`
        slower. This suite once grew superlinearly for exactly that reason."""

        from PySide6.QtWidgets import QApplication

        application = QApplication.instance()
        self.window()
        before = len(application.allWidgets())

        window = self.window()
        peak = len(application.allWidgets())
        self.assertGreater(peak, before, "the second window built no widgets at all?")

        self._dispose(window)
        after = len(application.allWidgets())

        self.assertLess(
            after - before,
            (peak - before) // 2,
            f"closing a window freed almost nothing ({before} → {peak} → {after} widgets)",
        )

    def test_responsive_chrome_at_the_minimum_size(self) -> None:
        window = self.window()
        window.resize(960, 640)
        window._update_responsive_chrome()
        self.application.processEvents()
        self.assertTrue(window.attention.isHidden())
        self.assertEqual(window.modes["TILES"].library_buttons[0].width(), 38)

        window.resize(1440, 900)
        window._update_responsive_chrome()
        self.application.processEvents()
        self.assertFalse(window.attention.isHidden())
        self.assertEqual(window.modes["TILES"].library_buttons[0].width(), 42)


class LevelTests(StudioTest):
    """A locked mode stays *visible* with a nudge, rather than disappearing."""

    def test_advanced_modes_are_locked_for_a_beginner(self) -> None:
        from nes_studio.ui.modes.base import Level

        window = self.window(level="beginner")
        self.assertGreater(window.modes["CODE"].min_level, Level.BEGINNER)

        window.select_mode("CODE")

        self.assertNotEqual(window.mode, "CODE", "a locked mode opened anyway")
        self.assertFalse(window.locked_notice.isHidden())
        self.assertIn("Advanced", window.locked_notice.text())

    def test_a_locked_mode_stays_on_the_rail(self) -> None:
        window = self.window(level="beginner")
        button = window._mode_buttons["CODE"]
        self.assertFalse(button.isHidden())
        self.assertIn("🔒", button.text())
        self.assertEqual(button.property("locked"), "true")

    def test_raising_the_level_unlocks_it(self) -> None:
        from nes_studio.ui.modes.base import Level

        window = self.window(level="beginner")
        window.set_level(Level.ADVANCED)

        window.select_mode("CODE")

        self.assertEqual(window.mode, "CODE")
        self.assertNotIn("🔒", window._mode_buttons["CODE"].text())

    def test_dropping_the_level_leaves_a_locked_mode(self) -> None:
        from nes_studio.ui.modes.base import Level

        window = self.window(level="advanced")
        window.select_mode("CODE")
        self.assertEqual(window.mode, "CODE")

        window.set_level(Level.BEGINNER)

        self.assertEqual(window.mode, "WORLD", "we were left inside a locked mode")


class ThemeTests(StudioTest):
    def test_the_theme_is_applied_to_the_application(self) -> None:
        """A QDialog is a top-level window and does not inherit a QMainWindow
        stylesheet — so every dialog used to render as light-on-light default Qt
        chrome."""

        from PySide6.QtWidgets import QApplication

        self.window()
        theme = QApplication.instance().styleSheet()

        self.assertIn("QDialog", theme)
        self.assertIn("#paletteEditor", theme)
        self.assertIn("#paletteEditorContent", theme)

    def test_the_theme_is_a_real_file(self) -> None:
        """It was a 47-line QSS string keyed by objectName, so every new widget
        had to be manually registered in it or it rendered wrong."""

        from nes_studio.ui.theme import theme_qss

        qss = theme_qss()
        self.assertGreater(len(qss.splitlines()), 60)
        self.assertIn("#appBar", qss)

    def test_high_contrast_changes_the_chrome(self) -> None:
        from PySide6.QtWidgets import QApplication

        from nes_studio.ui.theme import Accessibility

        window = self.window()
        window.apply_accessibility(Accessibility(high_contrast=True))
        theme = QApplication.instance().styleSheet()
        self.assertIn("#ffff00", theme)

        window.apply_accessibility(Accessibility())
        self.assertNotIn("#ffff00", QApplication.instance().styleSheet())

    def test_text_scale_changes_the_font(self) -> None:
        from PySide6.QtWidgets import QApplication

        from nes_studio.ui.theme import Accessibility

        window = self.window()
        window.apply_accessibility(Accessibility(text_scale=1.0))
        base = QApplication.instance().font().pointSizeF()

        window.apply_accessibility(Accessibility(text_scale=2.0))
        self.assertAlmostEqual(QApplication.instance().font().pointSizeF(), base * 2, places=1)

        # Applying twice must not compound.
        window.apply_accessibility(Accessibility(text_scale=2.0))
        self.assertAlmostEqual(QApplication.instance().font().pointSizeF(), base * 2, places=1)
        window.apply_accessibility(Accessibility())


class ProjectTests(StudioTest):
    def test_opening_a_project_does_not_overwrite_the_current_one(self) -> None:
        """Open used `replace_project_id=<current>`, clobbering the open project."""

        window = self.window()
        original_id = window.session.project_id
        window.document.state["name"] = "Original"
        window.document.dirty = True
        window.session.flush()

        incoming = json.loads(window.document.to_json())
        incoming["name"] = "Incoming"
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as handle:
            json.dump(incoming, handle)
            path = handle.name

        try:
            self.assertTrue(window.open_project_path(path))
        finally:
            Path(path).unlink()

        self.assertNotEqual(window.session.project_id, original_id)
        self.assertEqual(window.document.name, "Incoming")

        stored = {project.project_id: project for project in window.storage.projects()}
        self.assertIn(original_id, stored)
        self.assertEqual(stored[original_id].name, "Original")

    def test_save_flushes_to_local_storage(self) -> None:
        """There was no Save at all — only Save As, which exports a JSON copy
        while the real store is SQLite."""

        window = self.window()
        window.document.state["name"] = "Saved by Ctrl+S"
        window.document.dirty = True

        window.projects.save()

        self.assertFalse(window.document.dirty)
        stored = {project.project_id: project for project in window.storage.projects()}
        self.assertEqual(stored[window.session.project_id].name, "Saved by Ctrl+S")

    def test_export_and_reopen_round_trips(self) -> None:
        window = self.window("scratch")
        world = window.modes["WORLD"]
        world.select_tool("paint")
        world.tile_value.setValue(1)
        world.canvas.edit_cell(2, 2)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "project.json"
            self.assertTrue(window.save_project_path(str(path)))
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(saved["backgrounds"][0]["nametable"][2][2]["tile"], 1)

            self.assertTrue(window.open_project_path(str(path)))
            self.assertEqual(window.modes["WORLD"].canvas.cell_value(2, 2), 1)

    def test_a_new_project_starts_clean(self) -> None:
        window = self.window()
        previous = window.session.project_id

        window.new_project()

        self.assertEqual(window.document.name, "Untitled Game")
        self.assertFalse(window.document.dirty)
        # History lives in DocumentStore now, and does not survive a switch.
        self.assertFalse(window.store.can_undo)
        self.assertIn(previous, {entry.project_id for entry in window.storage.projects()})


if __name__ == "__main__":
    unittest.main()
