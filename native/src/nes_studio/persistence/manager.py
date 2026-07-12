"""One owner for native project storage rooted in the application data path."""

from __future__ import annotations

from pathlib import Path

from nes_studio.core.starters import StarterCatalog

from .projects import ProjectRepository, StoredProject
from .session import ProjectSession


class StorageManager:
    """Open the local catalog and ensure pending session changes are flushed."""

    def __init__(self, data_root: str | Path, *, current_engine: int = 63) -> None:
        self.data_root = Path(data_root)
        self.data_root.mkdir(parents=True, exist_ok=True)
        self.repository = ProjectRepository(self.data_root / "projects.sqlite3")
        self.starters = StarterCatalog(current_engine=current_engine)
        self._sessions: set[ProjectSession] = set()

    def projects(self) -> tuple[StoredProject, ...]:
        return self.repository.list()

    def create_starter(self, style: str, *, name: str | None = None) -> StoredProject:
        created = self.starters.create(style, name=name)
        return self.repository.create(
            created.document.name,
            created.document.to_json(),
            engine_version=created.document.engine_version,
        )

    def open_session(self, project_id: str, *, debounce_ms: int = 500) -> ProjectSession:
        session = ProjectSession(self.repository, project_id, debounce_ms=debounce_ms)
        self._sessions.add(session)
        session.destroyed.connect(lambda *_args, current=session: self._sessions.discard(current))
        return session

    def close(self) -> None:
        for session in tuple(self._sessions):
            session.close()
            session.deleteLater()
        self._sessions.clear()
        self.repository.close()

    def __enter__(self) -> "StorageManager":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()
