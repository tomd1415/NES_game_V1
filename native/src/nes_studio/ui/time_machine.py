"""Browse and restore the snapshots that have always been taken.

The store has snapshotted every 30 seconds — and before every build, every new
project and every restore — since it was written. Nothing has ever been able to
*look* at them. A pupil who broke their game had no way back beyond 40 undos.

Restoring is itself undoable: it lands as a normal edit, so Ctrl+Z gets you back
to where you were before you time-travelled.
"""

from __future__ import annotations

import json
from datetime import datetime

from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..persistence.manager import StorageManager
from ..persistence.session import ProjectSession

#: Why a snapshot was taken, in words a pupil recognises.
REASONS: dict[str, str] = {
    "auto_30s": "Autosave",
    "before_build": "Before building",
    "before_new": "Before starting a new game",
    "before_open": "Before opening another game",
    "before_restore": "Before restoring",
    "before_time_machine": "Before time-travelling",
    "manual": "Saved by hand",
}


def _when(timestamp_ms: int) -> str:
    moment = datetime.fromtimestamp(timestamp_ms / 1000)
    return moment.strftime("%d %b %Y, %H:%M:%S")


def _describe(document_json: bytes) -> str:
    """A one-line summary of what the game looked like at that moment."""

    try:
        state = json.loads(document_json)
    except (ValueError, TypeError):
        return "—"
    sprites = len(state.get("sprites") or [])
    backgrounds = len(state.get("backgrounds") or [])
    painted = 0
    for background in state.get("backgrounds") or []:
        for row in (background or {}).get("nametable") or []:
            painted += sum(
                1 for cell in row if isinstance(cell, dict) and int(cell.get("tile", 0)) != 0
            )
    return (
        f"{sprites} character{'' if sprites == 1 else 's'} · "
        f"{backgrounds} background{'' if backgrounds == 1 else 's'} · "
        f"{painted} painted cell{'' if painted == 1 else 's'}"
    )


class TimeMachineDialog(QDialog):
    """Every snapshot of this project, newest first."""

    def __init__(
        self, storage: StorageManager, session: ProjectSession, window: QWidget
    ) -> None:
        super().__init__(window)
        self.setObjectName("timeMachineDialog")
        self.setWindowTitle("Time Machine")
        self.setMinimumSize(600, 460)

        self._storage = storage
        self._session = session
        self._window = window
        self.restored = False
        self.restored_message = ""

        layout = QVBoxLayout(self)
        layout.addWidget(
            QLabel(
                "Every version of this game the Studio has kept. Restoring one is an edit "
                "like any other — Ctrl+Z undoes it.",
                self,
            )
        )

        self.list = QListWidget(self)
        self.list.setObjectName("snapshotList")
        self.list.setAccessibleName("Project snapshots, newest first")
        layout.addWidget(self.list, 1)

        self._snapshots = storage.repository.snapshots(session.project_id)
        for snapshot in self._snapshots:
            reason = REASONS.get(snapshot.reason, snapshot.reason.replace("_", " ").title())
            item = QListWidgetItem(
                f"{_when(snapshot.created_at)}   ·   {reason}\n     {_describe(snapshot.document_json)}"
            )
            item.setData(0x0100, snapshot.snapshot_id)  # Qt.ItemDataRole.UserRole
            self.list.addItem(item)

        if not self._snapshots:
            self.list.addItem("No snapshots yet — they are taken every 30 seconds as you work.")
            self.list.setEnabled(False)

        actions = QHBoxLayout()
        actions.addStretch(1)
        self.restore_button = QPushButton("Restore this version", self)
        self.restore_button.setObjectName("restoreSnapshotButton")
        self.restore_button.setEnabled(False)
        self.restore_button.clicked.connect(self._restore)
        actions.addWidget(self.restore_button)
        layout.addLayout(actions)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Close, self)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        self.list.currentRowChanged.connect(
            lambda row: self.restore_button.setEnabled(0 <= row < len(self._snapshots))
        )

    def restore(self, index: int) -> bool:
        """Restore snapshot `index`. Public so a test can drive it without a click.

        Restoring is an **edit**, not a project switch: the snapshot's contents are
        applied to the live document in place, so it lands as one normal undo step
        and `Ctrl+Z` really does take you back — which is what the dialog has
        always promised. Reloading the session instead built a *new* document and
        rebound the store, which threw the whole undo stack away.
        """

        if not 0 <= index < len(self._snapshots):
            return False
        snapshot = self._snapshots[index]
        try:
            # Durable belt-and-braces: undo covers this within the session, and
            # the snapshot covers it across a restart.
            self._session.snapshot_before("time_machine")
            self._window.apply_document_json(
                snapshot.document_json,
                f"Restored the version from {_when(snapshot.created_at)}",
            )
        except (KeyError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "Could not restore this version", str(exc))
            return False
        self.restored = True
        self.restored_message = f"Restored the version from {_when(snapshot.created_at)}"
        return True

    def _restore(self) -> None:
        index = self.list.currentRow()
        snapshot = self._snapshots[index] if 0 <= index < len(self._snapshots) else None
        if snapshot is None:
            return
        confirm = QMessageBox.question(
            self,
            "Restore this version?",
            f"Go back to how the game was at {_when(snapshot.created_at)}?\n\n"
            "Your current version is kept, and Ctrl+Z brings it straight back.",
        )
        if confirm != QMessageBox.StandardButton.Yes:
            return
        if self.restore(index):
            self.accept()
