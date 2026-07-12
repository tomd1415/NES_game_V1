"""Transactional SQLite project storage with optimistic revision checks."""

from __future__ import annotations

import sqlite3
import hashlib
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


@dataclass(frozen=True, slots=True)
class StoredProject:
    project_id: str
    name: str
    document_json: bytes
    created_at: int
    updated_at: int
    engine_version: int | None
    revision: int


@dataclass(frozen=True, slots=True)
class StoredSnapshot:
    snapshot_id: str
    project_id: str
    reason: str
    document_json: bytes
    created_at: int
    content_hash: str


class StaleRevisionError(RuntimeError):
    def __init__(self, project_id: str, expected: int, actual: int, conflict_id: str):
        super().__init__(
            f"Stale project revision for {project_id}: expected {expected}, found {actual}; "
            f"preserved attempted save as {conflict_id}"
        )
        self.project_id = project_id
        self.expected = expected
        self.actual = actual
        self.conflict_id = conflict_id


class ProjectRepository:
    def __init__(
        self,
        path: str | Path,
        *,
        identity: Callable[[], str] | None = None,
        clock_ms: Callable[[], int] | None = None,
        snapshot_limit: int = 8,
        backup_limit: int = 5,
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.identity = identity or (lambda: str(uuid.uuid4()))
        self.clock_ms = clock_ms or (lambda: time.time_ns() // 1_000_000)
        self.snapshot_limit = snapshot_limit
        self.backup_limit = backup_limit
        self.connection = sqlite3.connect(self.path)
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.execute("PRAGMA busy_timeout = 5000")
        self._migrate()

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "ProjectRepository":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _migrate(self) -> None:
        with self.connection:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects(
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    document_json BLOB NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    engine_version INTEGER,
                    revision INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS snapshots(
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    document_json BLOB NOT NULL,
                    created_at INTEGER NOT NULL,
                    content_hash TEXT NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
                """
            )

    def create(self, name: str, document_json: bytes, *, engine_version: int | None) -> StoredProject:
        project_id, now = self.identity(), self.clock_ms()
        with self.connection:
            self.connection.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 1)",
                (project_id, name, document_json, now, now, engine_version),
            )
        return self.get(project_id)

    def get(self, project_id: str) -> StoredProject:
        row = self.connection.execute(
            "SELECT id, name, document_json, created_at, updated_at, engine_version, revision "
            "FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Unknown project: {project_id}")
        return StoredProject(row[0], row[1], bytes(row[2]), row[3], row[4], row[5], row[6])

    def list(self) -> tuple[StoredProject, ...]:
        rows = self.connection.execute(
            "SELECT id, name, document_json, created_at, updated_at, engine_version, revision "
            "FROM projects ORDER BY updated_at DESC, id"
        ).fetchall()
        return tuple(StoredProject(row[0], row[1], bytes(row[2]), row[3], row[4], row[5], row[6]) for row in rows)

    def save(
        self,
        project_id: str,
        document_json: bytes,
        *,
        expected_revision: int,
        name: str | None = None,
        engine_version: int | None = None,
    ) -> StoredProject:
        now = self.clock_ms()
        with self.connection:
            current = self.get(project_id)
            if current.revision != expected_revision:
                conflict_id = self.identity()
                conflict_name = f"{name or current.name} (conflict copy)"
                self.connection.execute(
                    "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 1)",
                    (conflict_id, conflict_name, document_json, now, now, engine_version),
                )
                error = StaleRevisionError(
                    project_id, expected_revision, current.revision, conflict_id
                )
            else:
                self.connection.execute(
                    "UPDATE projects SET document_json = ?, name = ?, updated_at = ?, "
                    "engine_version = ?, revision = revision + 1 WHERE id = ?",
                    (
                        document_json,
                        name if name is not None else current.name,
                        now,
                        engine_version if engine_version is not None else current.engine_version,
                        project_id,
                    ),
                )
                error = None
        if error is not None:
            raise error
        return self.get(project_id)

    def rename(self, project_id: str, name: str, *, expected_revision: int) -> StoredProject:
        current = self.get(project_id)
        return self.save(
            project_id,
            current.document_json,
            expected_revision=expected_revision,
            name=name,
            engine_version=current.engine_version,
        )

    def duplicate(self, project_id: str, *, name: str | None = None) -> StoredProject:
        current = self.get(project_id)
        return self.create(
            name or f"{current.name} copy",
            current.document_json,
            engine_version=current.engine_version,
        )

    def delete(self, project_id: str) -> None:
        with self.connection:
            cursor = self.connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cursor.rowcount == 0:
            raise KeyError(f"Unknown project: {project_id}")

    def snapshot(
        self, project_id: str, document_json: bytes, *, reason: str
    ) -> StoredSnapshot | None:
        self.get(project_id)
        digest = hashlib.sha256(document_json).hexdigest()
        existing = self.connection.execute(
            "SELECT id FROM snapshots WHERE project_id = ? AND content_hash = ? LIMIT 1",
            (project_id, digest),
        ).fetchone()
        if existing is not None:
            return None
        snapshot_id, now = self.identity(), self.clock_ms()
        with self.connection:
            self.connection.execute(
                "INSERT INTO snapshots VALUES (?, ?, ?, ?, ?, ?)",
                (snapshot_id, project_id, reason, document_json, now, digest),
            )
            self._prune_snapshots(project_id)
        return self.get_snapshot(snapshot_id)

    def get_snapshot(self, snapshot_id: str) -> StoredSnapshot:
        row = self.connection.execute(
            "SELECT id, project_id, reason, document_json, created_at, content_hash "
            "FROM snapshots WHERE id = ?",
            (snapshot_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Unknown snapshot: {snapshot_id}")
        return StoredSnapshot(row[0], row[1], row[2], bytes(row[3]), row[4], row[5])

    def snapshots(self, project_id: str) -> tuple[StoredSnapshot, ...]:
        self.get(project_id)
        rows = self.connection.execute(
            "SELECT id, project_id, reason, document_json, created_at, content_hash "
            "FROM snapshots WHERE project_id = ? ORDER BY created_at DESC, id DESC",
            (project_id,),
        ).fetchall()
        return tuple(
            StoredSnapshot(row[0], row[1], row[2], bytes(row[3]), row[4], row[5])
            for row in rows
        )

    def restore_snapshot(
        self, project_id: str, snapshot_id: str, *, expected_revision: int
    ) -> StoredProject:
        current = self.get(project_id)
        target = self.get_snapshot(snapshot_id)
        if target.project_id != project_id:
            raise ValueError("Snapshot belongs to a different project")
        if current.revision != expected_revision:
            raise StaleRevisionError(project_id, expected_revision, current.revision, "")
        # The current state is durably preserved before replacement. The two
        # operations intentionally commit separately so a later write failure
        # still leaves a recovery point.
        self.snapshot(project_id, current.document_json, reason="before_restore")
        return self.save(
            project_id,
            target.document_json,
            expected_revision=expected_revision,
            name=current.name,
            engine_version=current.engine_version,
        )

    def _prune_snapshots(self, project_id: str) -> None:
        rows = self.connection.execute(
            "SELECT id, reason FROM snapshots WHERE project_id = ? "
            "ORDER BY created_at DESC, id DESC",
            (project_id,),
        ).fetchall()
        snapshots_seen = backups_seen = 0
        delete_ids = []
        for snapshot_id, reason in rows:
            is_backup = reason.startswith("backup")
            if is_backup:
                backups_seen += 1
                if backups_seen > self.backup_limit:
                    delete_ids.append(snapshot_id)
            else:
                snapshots_seen += 1
                if snapshots_seen > self.snapshot_limit:
                    delete_ids.append(snapshot_id)
        self.connection.executemany(
            "DELETE FROM snapshots WHERE id = ?", ((identifier,) for identifier in delete_ids)
        )
