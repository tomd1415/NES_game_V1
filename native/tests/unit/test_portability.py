from __future__ import annotations

import json
from pathlib import Path

from nes_studio.core.project_document import ProjectDocument
from nes_studio.persistence.portability import export_project, import_project
from nes_studio.persistence.projects import ProjectRepository


def legacy_browser_export(name: str) -> bytes:
    state = ProjectDocument.preview().state
    state.pop("version")
    state["name"] = name
    state["engineVersion"] = 63
    state["browserFutureField"] = {"preserve": True}
    return json.dumps(state, ensure_ascii=False).encode()


def test_atomic_export_replaces_destination_with_canonical_json(tmp_path: Path) -> None:
    destination = tmp_path / "game.nesgame.json"
    destination.write_bytes(b"previous valid export")
    document = ProjectDocument.from_json(legacy_browser_export("Caf\u00e9 Game"))
    export_project(destination, document)
    assert destination.read_bytes() == document.to_json()
    assert json.loads(destination.read_bytes())["browserFutureField"] == {
        "preserve": True
    }
    assert not list(tmp_path.glob(".*game.nesgame.json*"))


def test_import_as_new_creates_baseline_and_reports_normalization(tmp_path: Path) -> None:
    source = tmp_path / "browser.json"
    source.write_bytes(legacy_browser_export("Imported"))
    with ProjectRepository(tmp_path / "projects.sqlite3") as repository:
        result = import_project(repository, source)
        assert result.normalized
        assert result.snapshot_reason == "imported_baseline"
        assert result.project.name == "Imported"
        snapshots = repository.snapshots(result.project.project_id)
        assert len(snapshots) == 1
        assert snapshots[0].reason == "imported_baseline"
        assert snapshots[0].document_json == result.project.document_json


def test_replacement_import_preserves_previous_project_first(tmp_path: Path) -> None:
    source = tmp_path / "browser.json"
    source.write_bytes(legacy_browser_export("Replacement"))
    original_document = ProjectDocument.preview()
    with ProjectRepository(tmp_path / "projects.sqlite3") as repository:
        original = repository.create(
            "Original", original_document.to_json(), engine_version=1
        )
        result = import_project(
            repository,
            source,
            replace_project_id=original.project_id,
            expected_revision=1,
        )
        assert result.project.project_id == original.project_id
        assert result.project.name == "Replacement"
        assert result.project.revision == 2
        snapshots = repository.snapshots(original.project_id)
        assert [(item.reason, item.document_json) for item in snapshots] == [
            ("before_import", original.document_json)
        ]
