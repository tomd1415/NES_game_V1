"""Active-project session with Qt-event-loop debounce and synchronous flushes."""

from __future__ import annotations

from PySide6.QtCore import QObject, QTimer, Signal

from nes_studio.core.project_document import ProjectDocument

from .projects import ProjectRepository, StoredProject


class ProjectSession(QObject):
    projectChanged = Signal(str)
    saveScheduled = Signal()
    saved = Signal(int)
    saveFailed = Signal(str)

    def __init__(
        self,
        repository: ProjectRepository,
        project_id: str,
        *,
        debounce_ms: int = 500,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self.repository = repository
        self.debounce_ms = debounce_ms
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self.flush)
        self.project: StoredProject
        self.document: ProjectDocument
        self._load(project_id)

    @property
    def project_id(self) -> str:
        return self.project.project_id

    @property
    def has_pending_save(self) -> bool:
        return self._timer.isActive()

    def schedule_save(self) -> None:
        self._timer.start(self.debounce_ms)
        self.saveScheduled.emit()

    def flush(self) -> bool:
        self._timer.stop()
        if not self.document.dirty:
            return False
        try:
            self.project = self.repository.save(
                self.project_id,
                self.document.to_json(),
                expected_revision=self.project.revision,
                name=self.document.name,
                engine_version=self.document.engine_version,
            )
        except Exception as exc:
            self.saveFailed.emit(str(exc))
            raise
        self.document.dirty = False
        self.saved.emit(self.project.revision)
        return True

    def snapshot_before(self, reason: str) -> None:
        self.flush()
        self.repository.snapshot(
            self.project_id, self.document.to_json(), reason=f"before_{reason}"
        )

    def switch(self, project_id: str) -> None:
        if project_id == self.project_id:
            return
        self.flush()
        self._load(project_id)
        self.projectChanged.emit(project_id)

    def close(self) -> None:
        self.flush()

    def _load(self, project_id: str) -> None:
        self.project = self.repository.get(project_id)
        self.document = ProjectDocument.from_json(self.project.document_json)
        self.document.dirty = False
