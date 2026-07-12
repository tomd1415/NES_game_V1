"""Atomic single-project import/export over the shared JSON contract."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PySide6.QtCore import QIODevice, QSaveFile

from nes_studio.core.project_document import ProjectDocument

from .projects import ProjectRepository, StoredProject


class AtomicExportError(OSError):
    pass


@dataclass(frozen=True, slots=True)
class ImportResult:
    project: StoredProject
    normalized: bool
    snapshot_reason: str


def export_project(path: str | Path, document: ProjectDocument) -> None:
    destination = QSaveFile(str(path))
    if not destination.open(QIODevice.OpenModeFlag.WriteOnly):
        raise AtomicExportError(destination.errorString())
    payload = document.to_json()
    if destination.write(payload) != len(payload):
        destination.cancelWriting()
        raise AtomicExportError(destination.errorString() or "short project export write")
    if not destination.commit():
        raise AtomicExportError(destination.errorString())


def import_project(
    repository: ProjectRepository,
    path: str | Path,
    *,
    replace_project_id: str | None = None,
    expected_revision: int | None = None,
) -> ImportResult:
    source = Path(path).read_bytes()
    document = ProjectDocument.from_json(source, Path(path))
    payload = document.to_json()
    normalized = payload != source
    if replace_project_id is None:
        project = repository.create(
            document.name, payload, engine_version=document.engine_version
        )
        repository.snapshot(
            project.project_id, payload, reason="imported_baseline"
        )
        return ImportResult(project, normalized, "imported_baseline")
    if expected_revision is None:
        raise ValueError("Replacing a project requires expected_revision")
    current = repository.get(replace_project_id)
    repository.snapshot(
        replace_project_id, current.document_json, reason="before_import"
    )
    project = repository.save(
        replace_project_id,
        payload,
        expected_revision=expected_revision,
        name=document.name,
        engine_version=document.engine_version,
    )
    return ImportResult(project, normalized, "before_import")
