"""Switch, rename, duplicate, delete and create projects.

`ProjectRepository` has supported all of this from the start — and none of it was
reachable. The app opened `projects[0]` at startup and `New Project` always made
the `scratch` starter, so six of the seven starters that ship on disk could not be
opened at all.
"""

from __future__ import annotations

from datetime import datetime

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..persistence.manager import StorageManager

#: The starters shipped in `resources/starters/`, with names a pupil can choose
#: between. Keys must match the manifest.
STARTERS: tuple[tuple[str, str, str], ...] = (
    ("basics", "🎮 Platformer basics", "A hero, some ground and a ladder — the place to start."),
    ("smb", "🍄 SMB showcase", "Blocks, pipes, power-ups and a flagpole."),
    ("topdown", "🧭 Top-down adventure", "Walk in all four directions and explore rooms."),
    ("runner", "🏃 Auto-runner", "The screen scrolls by itself; you only jump."),
    ("racer", "🏎️ Top-down racer", "Laps, checkpoints and a finish line."),
    ("geodash", "🟦 Geo Dash", "A one-button rhythm jumper."),
    ("scratch", "📄 Blank project", "Nothing at all. Build it from scratch."),
)


def _when(timestamp_ms: int) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000).strftime("%d %b %Y, %H:%M")


class NewProjectDialog(QDialog):
    """Pick a starter. The web offers these; native only ever made `scratch`."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("newProjectDialog")
        self.setWindowTitle("New game")
        self.setMinimumWidth(460)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Start from:", self))

        self.list = QListWidget(self)
        self.list.setObjectName("starterList")
        for style, label, blurb in STARTERS:
            item = QListWidgetItem(f"{label}\n{blurb}", self.list)
            item.setData(Qt.ItemDataRole.UserRole, style)
        self.list.setCurrentRow(0)
        self.list.itemDoubleClicked.connect(lambda _item: self.accept())
        layout.addWidget(self.list)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel,
            parent=self,
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def selected_style(self) -> str:
        item = self.list.currentItem()
        return str(item.data(Qt.ItemDataRole.UserRole)) if item else "scratch"


class ProjectCatalogDialog(QDialog):
    """The project list: open, rename, duplicate, delete, or start a new game."""

    def __init__(
        self, storage: StorageManager, current_project_id: str, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.setObjectName("projectCatalogDialog")
        self.setWindowTitle("Your games")
        self.setMinimumSize(560, 420)

        self._storage = storage
        self._current_project_id = current_project_id
        #: Set when the user chooses a project to open.
        self.chosen_project_id: str | None = None

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Double-click a game to open it.", self))

        self.list = QListWidget(self)
        self.list.setObjectName("projectList")
        self.list.itemDoubleClicked.connect(lambda _item: self._open())
        layout.addWidget(self.list)

        actions = QHBoxLayout()
        for label, name, slot in (
            ("New game…", "newProjectButton", self._new),
            ("Rename…", "renameProjectButton", self._rename),
            ("Duplicate", "duplicateProjectButton", self._duplicate),
            ("Delete…", "deleteProjectButton", self._delete),
        ):
            button = QPushButton(label, self)
            button.setObjectName(name)
            button.clicked.connect(slot)
            actions.addWidget(button)
        layout.addLayout(actions)

        buttons = QDialogButtonBox(parent=self)
        self.open_button = buttons.addButton("Open", QDialogButtonBox.ButtonRole.AcceptRole)
        self.open_button.setObjectName("openProjectButton")
        buttons.addButton(QDialogButtonBox.StandardButton.Close)
        buttons.accepted.connect(self._open)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self.refresh()

    # ---- list -------------------------------------------------------------

    def refresh(self) -> None:
        self.list.clear()
        for project in self._storage.projects():
            suffix = "  ← open now" if project.project_id == self._current_project_id else ""
            item = QListWidgetItem(
                f"{project.name}{suffix}\nlast changed {_when(project.updated_at)}", self.list
            )
            item.setData(Qt.ItemDataRole.UserRole, project.project_id)
            if project.project_id == self._current_project_id:
                self.list.setCurrentItem(item)
        if self.list.currentRow() < 0 and self.list.count():
            self.list.setCurrentRow(0)

    def _selected_id(self) -> str | None:
        item = self.list.currentItem()
        return str(item.data(Qt.ItemDataRole.UserRole)) if item else None

    def _selected_name(self) -> str:
        project_id = self._selected_id()
        for project in self._storage.projects():
            if project.project_id == project_id:
                return project.name
        return ""

    # ---- actions ----------------------------------------------------------

    def _open(self) -> None:
        project_id = self._selected_id()
        if project_id is None:
            return
        self.chosen_project_id = project_id
        self.accept()

    def _new(self) -> None:
        dialog = NewProjectDialog(self)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return
        style = dialog.selected_style()
        name, ok = QInputDialog.getText(self, "Name your game", "Name:", text="My game")
        if not ok or not name.strip():
            return
        try:
            project = self._storage.create_starter(style, name=name.strip())
        except (KeyError, OSError, ValueError) as exc:
            QMessageBox.critical(self, "Could not create the game", str(exc))
            return
        self.chosen_project_id = project.project_id
        self.accept()

    def _rename(self) -> None:
        project_id = self._selected_id()
        if project_id is None:
            return
        name, ok = QInputDialog.getText(
            self, "Rename game", "Name:", text=self._selected_name()
        )
        if not ok or not name.strip():
            return
        try:
            current = self._storage.repository.get(project_id)
            self._storage.repository.rename(
                project_id, name.strip(), expected_revision=current.revision
            )
        except (KeyError, RuntimeError) as exc:
            QMessageBox.critical(self, "Could not rename the game", str(exc))
            return
        self.refresh()

    def _duplicate(self) -> None:
        project_id = self._selected_id()
        if project_id is None:
            return
        try:
            self._storage.repository.duplicate(project_id)
        except (KeyError, OSError) as exc:
            QMessageBox.critical(self, "Could not duplicate the game", str(exc))
            return
        self.refresh()

    def _delete(self) -> None:
        project_id = self._selected_id()
        if project_id is None:
            return
        if project_id == self._current_project_id:
            QMessageBox.information(
                self,
                "Cannot delete this game",
                "This is the game you have open. Open a different one first.",
            )
            return
        if len(self._storage.projects()) <= 1:
            QMessageBox.information(
                self, "Cannot delete this game", "This is your only game."
            )
            return
        confirmed = QMessageBox.question(
            self,
            "Delete this game?",
            f"Delete “{self._selected_name()}” permanently?\nThis cannot be undone.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if confirmed != QMessageBox.StandardButton.Yes:
            return
        try:
            self._storage.repository.delete(project_id)
        except KeyError as exc:
            QMessageBox.critical(self, "Could not delete the game", str(exc))
            return
        self.refresh()
