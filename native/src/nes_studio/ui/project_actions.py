"""New, open, save, switch, and travel back in time.

Everything that acts on the *project as a whole*, kept off `MainWindow` so the
shell stays a shell.
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import QDialog, QFileDialog, QInputDialog, QMessageBox

from ..core.project_document import ProjectFormatError
from ..persistence.portability import AtomicExportError, export_project, import_project
from .project_catalog import NewProjectDialog, ProjectCatalogDialog
from .time_machine import TimeMachineDialog


class ProjectActions:
    """The File menu, with the dialogs it needs."""

    def __init__(self, window) -> None:
        self._window = window

    # ---- saving -----------------------------------------------------------

    def save(self) -> None:
        """Flush the active project to local storage.

        The real store is SQLite, so 'Save' is a flush — not the JSON export that
        'Save Project As…' performs. For a while there was no Save at all.
        """

        window = self._window
        try:
            saved = window.session.flush()
        except Exception as exc:  # repository/schema failures must not crash
            QMessageBox.critical(window, "Could not save project", str(exc))
            return
        window.mark_saved()
        window.statusBar().showMessage("Saved project" if saved else "No changes to save")

    def save_as(self) -> None:
        window = self._window
        suggested = str(window.document.path or Path(f"{window.document.name}.json"))
        path, _filter = QFileDialog.getSaveFileName(
            window, "Save NES Studio Project", suggested, "NES Studio projects (*.json)"
        )
        if not path:
            return
        if not path.casefold().endswith(".json"):
            path += ".json"
        self.save_to(path)

    def save_to(self, path: str) -> bool:
        window = self._window
        try:
            window.session.flush()
            export_project(path, window.document)
        except (AtomicExportError, OSError, RuntimeError) as exc:
            QMessageBox.critical(window, "Could not save project", str(exc))
            return False
        window.document.path = Path(path)
        window.update_document_title()
        window.statusBar().showMessage(f"Saved {path}")
        return True

    def flush_autosave(self) -> None:
        window = self._window
        if window.document.dirty:
            window.session.flush()
            window.statusBar().showMessage("Saved local project")

    def snapshot_if_changed(self) -> None:
        window = self._window
        if window.document.dirty:
            window.session.flush()
            window.storage.repository.snapshot(
                window.session.project_id, window.document.to_json(), reason="auto_30s"
            )

    # ---- opening ----------------------------------------------------------

    def open_file(self) -> None:
        path, _filter = QFileDialog.getOpenFileName(
            self._window,
            "Open NES Studio Project",
            "",
            "NES Studio projects (*.json);;JSON files (*.json)",
        )
        if path:
            self.open_path(path)

    def open_path(self, path: str) -> bool:
        """Import a project file as a *new* stored project and switch to it.

        Opening a file must never overwrite the project the user currently has
        open, so this imports alongside it rather than replacing its row.
        """

        window = self._window
        try:
            if window.document.dirty:
                window.session.snapshot_before("open")
            result = import_project(window.storage.repository, path)
            window.switch_to_project(result.project.project_id)
        except (OSError, ProjectFormatError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(window, "Could not open project", str(exc))
            return False
        window.document.path = Path(path)
        window.statusBar().showMessage(f"Opened {path} as a new project")
        return True

    # ---- creating ---------------------------------------------------------

    def new(self, style: str = "scratch", name: str = "Untitled Game") -> None:
        """Create a project from a starter and switch to it.

        Programmatic on purpose — it must never open a dialog, so callers and
        tests can drive it directly. `prompt_new` is the menu path.
        """

        window = self._window
        window.session.snapshot_before("new")
        try:
            project = window.storage.create_starter(style, name=name)
        except (KeyError, OSError, ValueError) as exc:
            QMessageBox.critical(window, "Could not create the game", str(exc))
            return
        window.switch_to_project(project.project_id)
        window.statusBar().showMessage(f"Created “{name}”")

    def prompt_new(self) -> None:
        window = self._window
        dialog = NewProjectDialog(window)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        chosen, accepted = QInputDialog.getText(
            window, "Name your game", "Name:", text="My game"
        )
        if not accepted or not chosen.strip():
            return
        self.new(dialog.selected_style(), chosen.strip())

    def open_catalog(self) -> None:
        window = self._window
        if window.document.dirty:
            window.session.flush()
        dialog = ProjectCatalogDialog(window.storage, window.session.project_id, window)
        dialog.exec()
        if dialog.chosen_project_id and dialog.chosen_project_id != window.session.project_id:
            window.switch_to_project(dialog.chosen_project_id)
            window.statusBar().showMessage(f"Opened “{window.document.name}”")

    # ---- going back -------------------------------------------------------

    def open_time_machine(self) -> None:
        """Browse and restore the snapshots that have always been taken.

        They have existed since the store was written; nothing has ever been able
        to *look* at them.
        """

        window = self._window
        if window.document.dirty:
            window.session.flush()
        dialog = TimeMachineDialog(window.storage, window.session, window)
        if dialog.exec() == QDialog.DialogCode.Accepted and dialog.restored:
            # `apply_document_json` has already refreshed everything and recorded
            # the restore as an undoable step.
            window.statusBar().showMessage(dialog.restored_message)

    def recover_autosave(self) -> bool:
        """Jump straight to the newest snapshot — the Time Machine without the UI.

        Undoable, for the same reason and by the same route (see
        `MainWindow.apply_document_json`).
        """

        window = self._window
        snapshots = window.storage.repository.snapshots(window.session.project_id)
        if not snapshots:
            window.statusBar().showMessage("No local project snapshot is available")
            return False
        try:
            window.session.snapshot_before("restore")
            window.apply_document_json(
                snapshots[0].document_json, "Restored the latest local project snapshot"
            )
        except (KeyError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(window, "Could not restore project snapshot", str(exc))
            return False
        return True
