from __future__ import annotations

from pathlib import Path

from nes_studio.persistence.manager import StorageManager


def test_storage_manager_creates_starters_under_only_its_data_root(qapp, tmp_path: Path) -> None:
    root = tmp_path / "xdg-data" / "nes-studio"
    with StorageManager(root, current_engine=63) as storage:
        project = storage.create_starter("scratch", name="My Native Game")
        assert project.name == "My Native Game"
        assert (root / "projects.sqlite3").is_file()
        session = storage.open_session(project.project_id, debounce_ms=60_000)
        session.document.set_world_tile(1, 2, 33)
        session.schedule_save()
    assert not session.has_pending_save

    with StorageManager(root, current_engine=63) as storage:
        reopened = storage.projects()
        assert len(reopened) == 1
        session = storage.open_session(reopened[0].project_id)
        assert session.document.world_tiles()[2][1] == 33
