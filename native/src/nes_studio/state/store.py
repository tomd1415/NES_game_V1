"""One place that owns document mutation, saving and undo.

Before this existed the UI mutated `ProjectDocument` directly from 154 call
sites and had to *remember*, by hand, to call `ProjectSession.schedule_save()`
(66 sites) and `_update_document_title()` (55 sites) after every edit. Forget one
and the app silently lost work or showed a stale title. Undo was wired straight
to `WorldCanvas`, so **only WORLD was undoable** — tile pixels, sprites,
animations, palettes, sound and all ~40 RULES fields were not undoable at all.

The store hooks `ProjectSession.saveScheduled`, which every edit already emits.
That means an edit anywhere becomes undoable without touching those 154 sites.

Snapshots are whole-document JSON, exactly as the web does it
(`studio.js` `pushUndo` → `cloneState`, 40 deep). Measured on the largest
starter: 180 KB per snapshot, ~5 ms to take, ~7 MB for a full 40-deep stack.
"""

from __future__ import annotations

import json

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QUndoCommand, QUndoStack

from ..core.project_document import ProjectDocument
from ..persistence.session import ProjectSession

#: Matches the web's UNDO_LIMIT.
UNDO_LIMIT = 40


class _StateEdit(QUndoCommand):
    """One undoable edit, held as the document JSON before and after."""

    def __init__(self, store: "DocumentStore", before: bytes, after: bytes, text: str) -> None:
        super().__init__(text)
        self._store = store
        self._before = before
        self._after = after
        # QUndoStack.push() calls redo() immediately, but the edit has already
        # been applied to the document by the UI. Swallow that first call.
        self._skip_first_redo = True

    def redo(self) -> None:  # noqa: D102 - Qt API
        if self._skip_first_redo:
            self._skip_first_redo = False
            return
        self._store._restore(self._after)

    def undo(self) -> None:  # noqa: D102 - Qt API
        self._store._restore(self._before)


class DocumentStore(QObject):
    """Undo/redo over the active project, driven by the session's save signal."""

    #: The document was replaced wholesale (an undo or redo). Every mode must
    #: re-read it — the UI holds no incremental diff.
    changed = Signal()
    can_undo_changed = Signal(bool)
    can_redo_changed = Signal(bool)

    def __init__(self, session: ProjectSession, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._stack = QUndoStack(self)
        self._stack.setUndoLimit(UNDO_LIMIT)
        self._stack.canUndoChanged.connect(self.can_undo_changed)
        self._stack.canRedoChanged.connect(self.can_redo_changed)
        self._restoring = False
        self._suspended = 0
        self._session: ProjectSession | None = None
        self.rebind(session)

    # ---- wiring -----------------------------------------------------------

    def rebind(self, session: ProjectSession) -> None:
        """Point at a different project. History does not survive the switch."""

        if self._session is not None:
            try:
                self._session.saveScheduled.disconnect(self._on_save_scheduled)
            except (RuntimeError, TypeError):
                pass
        self._session = session
        session.saveScheduled.connect(self._on_save_scheduled)
        self._stack.clear()
        self._baseline = session.document.to_json()

    @property
    def document(self) -> ProjectDocument:
        assert self._session is not None
        return self._session.document

    # ---- commits ----------------------------------------------------------

    def _on_save_scheduled(self) -> None:
        # Every edit in the app already schedules a save. That is the hook.
        if self._restoring or self._suspended:
            return
        self.commit()

    def commit(self, text: str = "edit") -> bool:
        """Record the document's current state as one undoable step."""

        after = self.document.to_json()
        if after == self._baseline:
            return False
        self._stack.push(_StateEdit(self, self._baseline, after, text))
        self._baseline = after
        return True

    def begin_macro(self) -> None:
        """Group everything until `end_macro` into a single undo step.

        A paint drag mutates one cell per mouse-move; without this the pupil
        would have to undo a stroke pixel by pixel.
        """

        self._suspended += 1

    def end_macro(self, text: str = "edit") -> None:
        if self._suspended == 0:
            return
        self._suspended -= 1
        if self._suspended == 0:
            self.commit(text)

    # ---- history ----------------------------------------------------------

    @property
    def can_undo(self) -> bool:
        return self._stack.canUndo()

    @property
    def can_redo(self) -> bool:
        return self._stack.canRedo()

    def undo(self) -> bool:
        if not self._stack.canUndo():
            return False
        self._stack.undo()
        return True

    def redo(self) -> bool:
        if not self._stack.canRedo():
            return False
        self._stack.redo()
        return True

    def clear(self) -> None:
        self._stack.clear()
        self._baseline = self.document.to_json()

    def _restore(self, payload: bytes) -> None:
        assert self._session is not None
        self._restoring = True
        try:
            # Mutate the existing document in place: the UI holds a reference to
            # it, so replacing the object would strand every editor.
            document = self.document
            document.state.clear()
            document.state.update(json.loads(payload))
            document.dirty = True
            self._baseline = payload
            self._session.schedule_save()
        finally:
            self._restoring = False
        self.changed.emit()
