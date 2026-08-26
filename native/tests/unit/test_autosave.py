from __future__ import annotations

import tempfile
import unittest
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


class OrphanedSnapshotTests(unittest.TestCase):
    """A crash between the two writes must leave the work *unlabelled*, not invisible.

    `snapshot()` writes the pupil's project and then its `.meta.json`. Both writes are
    individually atomic, but they are two writes: a crash or a full disk in between
    leaves the payload on disk with no index entry. Listing from the index made that
    snapshot unreachable — and `_prune()` iterates the same list, so it was never
    cleaned up either. Listing from the payload cannot lose it.

    `unittest` rather than a bare pytest function so that `tests/mutations/guards.json`
    can name these assertions: that spec drives the guards with `unittest -v`, which
    does not collect module-level functions.
    """

    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.repository = AutosaveRepository(self._directory.name)

    def test_a_payload_whose_metadata_never_landed_is_still_offered(self) -> None:
        self.repository.snapshot(b'{"revision":1}\n', "auto_30s")
        orphan = self.repository.snapshot(b'{"revision":2}\n', "before_import")
        assert orphan is not None
        orphan.path.with_suffix(".meta.json").unlink()

        entries = self.repository.entries()
        paths = [entry.path for entry in entries]
        self.assertEqual(paths, sorted(paths, reverse=True), "newest first")
        self.assertIn(
            orphan.path,
            paths,
            "the payload is on disk but the recovery list does not offer it",
        )
        recovered = next(entry for entry in entries if entry.path == orphan.path)
        self.assertEqual(recovered.reason, "unknown")
        self.assertEqual(recovered.sha256, orphan.sha256)
        self.assertTrue(recovered.created_at)

    def test_an_orphaned_payload_is_pruned_like_any_other_snapshot(self) -> None:
        for index in range(10):
            entry = self.repository.snapshot(f'{{"revision":{index}}}\n'.encode(), "auto_30s")
            assert entry is not None
            if index == 0:
                entry.path.with_suffix(".meta.json").unlink()
        payloads = [
            path
            for path in self.repository.snapshot_dir.glob("*.json")
            if not path.name.endswith(".meta.json")
        ]
        self.assertEqual(
            len(payloads),
            self.repository.SNAPSHOT_LIMIT,
            "an unindexed payload accumulates outside SNAPSHOT_LIMIT because _prune() "
            "could not see it",
        )

    def test_metadata_with_no_payload_beside_it_is_simply_absent(self) -> None:
        entry = self.repository.snapshot(b'{"revision":1}\n', "auto_30s")
        assert entry is not None
        entry.path.unlink()
        self.assertEqual(self.repository.entries(), [])


if __name__ == "__main__":
    unittest.main()
