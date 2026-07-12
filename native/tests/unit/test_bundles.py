from __future__ import annotations

import hashlib
import json
from pathlib import Path

from nes_studio.core.project_document import ProjectDocument
from nes_studio.persistence.bundles import BUNDLE_FORMAT, import_bundle
from nes_studio.persistence.projects import ProjectRepository


def payload(name: str, tile: int = 0) -> str:
    document = ProjectDocument.preview()
    document.state["name"] = name
    document.state["engineVersion"] = 63
    document.state["backgrounds"][0]["nametable"][0][0]["tile"] = tile
    return document.to_json().decode()


def checked(document_json: str, **extra) -> dict:
    return {
        "document_json": document_json,
        "sha256": hashlib.sha256(document_json.encode()).hexdigest(),
        **extra,
    }


def write_bundle(path: Path, projects: list[object], *, version: int = 1) -> None:
    path.write_text(
        json.dumps({"format": BUNDLE_FORMAT, "version": version, "projects": projects}),
        encoding="utf-8",
    )


def test_bundle_imports_projects_and_exact_reasoned_history(tmp_path: Path) -> None:
    path = tmp_path / "all-projects.json"
    current = payload("Quest", 3)
    old = payload("Quest", 1)
    write_bundle(path, [{
        "id": "browser-p1",
        "name": "Quest",
        **checked(current),
        "snapshots": [
            checked(old, reason="auto_30s", created_at=123),
            checked(old, reason="duplicate", created_at=124),
        ],
    }])
    identities = iter(("native-p1", "native-s1"))
    with ProjectRepository(
        tmp_path / "projects.sqlite3",
        identity=lambda: next(identities),
        clock_ms=lambda: 999,
    ) as repository:
        report = import_bundle(repository, path)
        assert report.imported_projects == ("native-p1",)
        assert report.imported_snapshots == 1
        assert report.skipped == ()
        assert repository.get("native-p1").name == "Quest"
        history = repository.snapshots("native-p1")
        assert [(item.reason, item.created_at) for item in history] == [("auto_30s", 123)]


def test_corrupt_entries_are_reported_and_valid_entries_commit_atomically(tmp_path: Path) -> None:
    path = tmp_path / "bundle.json"
    valid = payload("Good")
    corrupt = checked(payload("Bad"))
    corrupt["sha256"] = "0" * 64
    write_bundle(path, [
        {"id": "good", "name": "Good", **checked(valid)},
        {"id": "bad", "name": "Bad", **corrupt},
    ])
    with ProjectRepository(tmp_path / "projects.sqlite3", identity=lambda: "native-good") as repository:
        report = import_bundle(repository, path)
        assert report.imported_projects == ("native-good",)
        assert [(problem.source_id, problem.message) for problem in report.skipped] == [
            ("bad", "checksum mismatch")
        ]
        assert len(repository.list()) == 1


def test_unsupported_bundle_never_changes_repository(tmp_path: Path) -> None:
    path = tmp_path / "future.json"
    write_bundle(path, [], version=2)
    with ProjectRepository(tmp_path / "projects.sqlite3") as repository:
        try:
            import_bundle(repository, path)
        except ValueError as exc:
            assert "Unsupported project bundle version" in str(exc)
        else:
            raise AssertionError("future bundle version was imported")
        assert repository.list() == ()


def test_database_failure_rolls_back_every_staged_project(tmp_path: Path) -> None:
    path = tmp_path / "bundle.json"
    write_bundle(path, [
        {"id": "one", "name": "One", **checked(payload("One"))},
        {"id": "two", "name": "Two", **checked(payload("Two"))},
    ])
    with ProjectRepository(
        tmp_path / "projects.sqlite3", identity=lambda: "duplicate-id"
    ) as repository:
        try:
            import_bundle(repository, path)
        except Exception as exc:
            assert "UNIQUE constraint failed" in str(exc)
        else:
            raise AssertionError("injected bundle transaction failure succeeded")
        assert repository.list() == ()
