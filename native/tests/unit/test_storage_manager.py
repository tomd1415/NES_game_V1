from __future__ import annotations

from pathlib import Path

import pytest  # noqa: E402

# PySide6 is optional in the test environment and absent from the headless
# container. Without this the module raises at import time, pytest reports a
# collection ERROR, and an absent dependency reads like a defect (F3). The
# import below is transitive for some of these modules -- nes_studio.* pulls
# PySide6 in -- so the guard belongs here, ahead of the first such import.
pytest.importorskip("PySide6")  # noqa: E402

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
