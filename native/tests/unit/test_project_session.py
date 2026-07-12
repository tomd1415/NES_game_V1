from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtTest import QSignalSpy, QTest

from nes_studio.core.project_document import ProjectDocument
from nes_studio.persistence.projects import ProjectRepository
from nes_studio.persistence.session import ProjectSession


def project_payload(name: str) -> bytes:
    state = ProjectDocument.preview().state
    state["name"] = name
    state["engineVersion"] = 63
    return (json.dumps(state) + "\n").encode()


def test_edit_bursts_debounce_to_one_revisioned_save(qapp, tmp_path: Path) -> None:
    with ProjectRepository(tmp_path / "projects.sqlite3") as repository:
        project = repository.create("One", project_payload("One"), engine_version=63)
        session = ProjectSession(repository, project.project_id, debounce_ms=20)
        saved = QSignalSpy(session.saved)
        session.document.set_world_tile(0, 0, 4)
        session.schedule_save()
        session.document.set_world_tile(1, 0, 5)
        session.schedule_save()
        assert session.has_pending_save
        QTest.qWait(50)
        assert saved.count() == 1
        assert repository.get(project.project_id).revision == 2
        assert not session.document.dirty


def test_switch_and_close_flush_pending_edits_synchronously(qapp, tmp_path: Path) -> None:
    with ProjectRepository(tmp_path / "projects.sqlite3") as repository:
        first = repository.create("One", project_payload("One"), engine_version=63)
        second = repository.create("Two", project_payload("Two"), engine_version=63)
        session = ProjectSession(repository, first.project_id, debounce_ms=60_000)
        session.document.set_world_tile(2, 3, 9)
        session.schedule_save()
        session.switch(second.project_id)
        persisted = ProjectDocument.from_json(repository.get(first.project_id).document_json)
        assert persisted.world_tiles()[3][2] == 9
        assert repository.get(first.project_id).revision == 2

        session.document.set_world_tile(4, 5, 11)
        session.schedule_save()
        session.close()
        persisted = ProjectDocument.from_json(repository.get(second.project_id).document_json)
        assert persisted.world_tiles()[5][4] == 11


def test_snapshot_before_flushes_and_tags_current_state(qapp, tmp_path: Path) -> None:
    with ProjectRepository(tmp_path / "projects.sqlite3") as repository:
        project = repository.create("One", project_payload("One"), engine_version=63)
        session = ProjectSession(repository, project.project_id, debounce_ms=60_000)
        session.document.set_world_tile(7, 8, 21)
        session.schedule_save()
        session.snapshot_before("play")
        entries = repository.snapshots(project.project_id)
        assert len(entries) == 1
        assert entries[0].reason == "before_play"
        assert ProjectDocument.from_json(entries[0].document_json).world_tiles()[8][7] == 21
