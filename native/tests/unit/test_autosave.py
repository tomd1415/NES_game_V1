from __future__ import annotations

from pathlib import Path

import pytest

from nes_studio.persistence.autosave import AutosaveRepository


def test_autosave_current_is_atomic_and_snapshots_are_deduplicated(tmp_path: Path) -> None:
    repository = AutosaveRepository(tmp_path / "data")
    first = b'{"name":"first"}\n'
    second = b'{"name":"second"}\n'
    repository.save_current(first)
    assert repository.load_current() == first
    assert repository.snapshot(first, "auto_30s") is not None
    assert repository.snapshot(first, "auto_30s") is None
    assert repository.snapshot(second, "before_import") is not None
    assert [entry.reason for entry in repository.entries()] == ["before_import", "auto_30s"]


def test_snapshot_retention_keeps_the_newest_eight(tmp_path: Path) -> None:
    repository = AutosaveRepository(tmp_path)
    for index in range(10):
        repository.snapshot(f'{{"revision":{index}}}\n'.encode(), "auto_30s")
    entries = repository.entries()
    assert len(entries) == repository.SNAPSHOT_LIMIT
    assert b'"revision":9' in entries[0].path.read_bytes()
    assert b'"revision":2' in entries[-1].path.read_bytes()


def test_failed_atomic_write_keeps_last_good_current_document(tmp_path: Path, monkeypatch) -> None:
    repository = AutosaveRepository(tmp_path)
    repository.save_current(b'{"version":1}\n')

    def fail_replace(_source, _destination):
        raise OSError("disk full")

    monkeypatch.setattr("nes_studio.persistence.autosave.os.replace", fail_replace)
    with pytest.raises(OSError, match="disk full"):
        repository.save_current(b'{"version":2}\n')
    assert repository.load_current() == b'{"version":1}\n'
    assert not list(tmp_path.glob(".current.json.*"))
