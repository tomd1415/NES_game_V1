"""Versioned multi-project/history interoperability bundle import."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from nes_studio.core.project_document import ProjectDocument, ProjectFormatError

from .projects import ProjectRepository

BUNDLE_FORMAT = "nes-studio-project-bundle"
BUNDLE_VERSION = 1


@dataclass(frozen=True, slots=True)
class BundleProblem:
    source_id: str
    message: str


@dataclass(frozen=True, slots=True)
class BundleImportReport:
    imported_projects: tuple[str, ...]
    imported_snapshots: int
    skipped: tuple[BundleProblem, ...]


@dataclass(frozen=True, slots=True)
class _StagedSnapshot:
    reason: str
    payload: bytes
    digest: str
    created_at: int


@dataclass(frozen=True, slots=True)
class _StagedProject:
    source_id: str
    name: str
    payload: bytes
    engine_version: int
    snapshots: tuple[_StagedSnapshot, ...]


def _checked_payload(entry: dict[str, Any], field: str = "document_json") -> bytes:
    value = entry.get(field)
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a JSON string")
    payload = value.encode("utf-8")
    expected = entry.get("sha256")
    if not isinstance(expected, str) or hashlib.sha256(payload).hexdigest() != expected:
        raise ValueError("checksum mismatch")
    return payload


def import_bundle(
    repository: ProjectRepository, path: str | Path
) -> BundleImportReport:
    bundle = json.loads(Path(path).read_text("utf-8"))
    if not isinstance(bundle, dict) or bundle.get("format") != BUNDLE_FORMAT:
        raise ValueError("Unsupported project bundle format")
    if bundle.get("version") != BUNDLE_VERSION:
        raise ValueError(f"Unsupported project bundle version: {bundle.get('version')}")
    entries = bundle.get("projects")
    if not isinstance(entries, list):
        raise ValueError("Bundle projects must be an array")

    staged: list[_StagedProject] = []
    skipped: list[BundleProblem] = []
    for index, entry in enumerate(entries):
        source_id = str(entry.get("id") or f"project-{index}") if isinstance(entry, dict) else f"project-{index}"
        try:
            if not isinstance(entry, dict):
                raise ValueError("project entry must be an object")
            source_payload = _checked_payload(entry)
            document = ProjectDocument.from_json(source_payload)
            snapshots = []
            seen_hashes = set()
            raw_snapshots = entry.get("snapshots") or []
            if not isinstance(raw_snapshots, list):
                raise ValueError("snapshots must be an array")
            for snapshot_index, snapshot in enumerate(raw_snapshots):
                if not isinstance(snapshot, dict):
                    raise ValueError(f"snapshot {snapshot_index} must be an object")
                payload = _checked_payload(snapshot)
                ProjectDocument.from_json(payload)
                digest = hashlib.sha256(payload).hexdigest()
                if digest in seen_hashes:
                    continue
                seen_hashes.add(digest)
                snapshots.append(
                    _StagedSnapshot(
                        str(snapshot.get("reason") or "imported_history"),
                        payload,
                        digest,
                        int(snapshot.get("created_at") or 0),
                    )
                )
            staged.append(
                _StagedProject(
                    source_id,
                    str(entry.get("name") or document.name),
                    document.to_json(),
                    document.engine_version,
                    tuple(snapshots),
                )
            )
        except (ValueError, ProjectFormatError, UnicodeError) as exc:
            skipped.append(BundleProblem(source_id, str(exc)))

    imported_ids = []
    snapshot_count = 0
    now = repository.clock_ms()
    with repository.connection:
        for project in staged:
            project_id = repository.identity()
            repository.connection.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, 1)",
                (project_id, project.name, project.payload, now, now, project.engine_version),
            )
            imported_ids.append(project_id)
            for snapshot in project.snapshots:
                repository.connection.execute(
                    "INSERT INTO snapshots VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        repository.identity(),
                        project_id,
                        snapshot.reason,
                        snapshot.payload,
                        snapshot.created_at or now,
                        snapshot.digest,
                    ),
                )
                snapshot_count += 1
            repository._prune_snapshots(project_id)
    return BundleImportReport(tuple(imported_ids), snapshot_count, tuple(skipped))
