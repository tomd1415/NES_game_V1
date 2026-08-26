"""Crash-safe XDG autosave and recovery snapshots."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True, slots=True)
class RecoveryEntry:
    path: Path
    reason: str
    created_at: str
    sha256: str


class AutosaveRepository:
    """Persist one current document and eight deduplicated snapshots."""

    SNAPSHOT_LIMIT = 8

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self.current_path = self.root / "current.json"
        self.snapshot_dir = self.root / "snapshots"

    @staticmethod
    def _hash(payload: bytes) -> str:
        return hashlib.sha256(payload).hexdigest()

    @staticmethod
    def _atomic_write(path: Path, payload: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        except BaseException:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass
            raise

    def save_current(self, payload: bytes) -> str:
        digest = self._hash(payload)
        self._atomic_write(self.current_path, payload)
        return digest

    def load_current(self) -> bytes | None:
        try:
            return self.current_path.read_bytes()
        except FileNotFoundError:
            return None

    def snapshot(self, payload: bytes, reason: str) -> RecoveryEntry | None:
        digest = self._hash(payload)
        entries = self.entries()
        if entries and entries[0].sha256 == digest:
            return None
        now = datetime.now(UTC)
        created = now.isoformat(timespec="seconds")
        project_path = self.snapshot_dir / f"{now.strftime('%Y%m%dT%H%M%S.%fZ')}-{reason}.json"
        metadata_path = project_path.with_suffix(".meta.json")
        self._atomic_write(project_path, payload)
        metadata = {"reason": reason, "created_at": created, "sha256": digest}
        self._atomic_write(metadata_path, (json.dumps(metadata, indent=2) + "\n").encode())
        self._prune()
        return RecoveryEntry(project_path, reason, created, digest)

    def entries(self) -> list[RecoveryEntry]:
        """List the snapshots from the payloads on disk, never from the index.

        `snapshot()` writes the pupil's project and then its `.meta.json`. Each write
        is atomic on its own, but they are two writes, and a crash between them is the
        exact condition this whole class exists for. Listing from `*.meta.json` made
        such a payload **invisible** — recovery would not offer it and `_prune()`
        could not remove it. Listing from the payload makes the worst case an
        *unlabelled* snapshot instead: reason "unknown", timestamp from the file, hash
        recomputed. The reverse case — metadata with no payload — simply never
        appears, because nothing globs the metadata.
        """

        if not self.snapshot_dir.exists():
            return []
        entries: list[RecoveryEntry] = []
        for project_path in sorted(self.snapshot_dir.glob("*.json")):
            if project_path.name.endswith(".meta.json"):
                continue
            try:
                metadata = json.loads(
                    project_path.with_suffix(".meta.json").read_text(encoding="utf-8")
                )
                entry = RecoveryEntry(
                    project_path,
                    metadata["reason"],
                    metadata["created_at"],
                    metadata["sha256"],
                )
            except (OSError, TypeError, KeyError, json.JSONDecodeError):
                try:
                    stamp = datetime.fromtimestamp(project_path.stat().st_mtime, UTC)
                    entry = RecoveryEntry(
                        project_path,
                        "unknown",
                        stamp.isoformat(timespec="seconds"),
                        self._hash(project_path.read_bytes()),
                    )
                except OSError:
                    continue
            entries.append(entry)
        return sorted(entries, key=lambda entry: entry.path.name, reverse=True)

    def _prune(self) -> None:
        for entry in self.entries()[self.SNAPSHOT_LIMIT :]:
            entry.path.unlink(missing_ok=True)
            entry.path.with_suffix(".meta.json").unlink(missing_ok=True)
