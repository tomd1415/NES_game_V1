from __future__ import annotations

from pathlib import Path

from nes_studio.persistence.projects import ProjectRepository, StaleRevisionError


def repository(path: Path) -> ProjectRepository:
    identities = iter(("p1", "p2", "conflict", "p3"))
    ticks = iter((1000, 2000, 3000, 4000, 5000, 6000))
    return ProjectRepository(path, identity=lambda: next(identities), clock_ms=lambda: next(ticks))


def test_create_list_save_rename_duplicate_delete_round_trip(tmp_path: Path) -> None:
    with repository(tmp_path / "data" / "projects.sqlite3") as store:
        first = store.create("First", b'{"name":"First"}\n', engine_version=63)
        assert (first.project_id, first.revision, first.created_at) == ("p1", 1, 1000)
        saved = store.save("p1", b'{"name":"Changed"}\n', expected_revision=1)
        assert saved.revision == 2
        assert saved.document_json == b'{"name":"Changed"}\n'
        renamed = store.rename("p1", "Renamed", expected_revision=2)
        assert (renamed.name, renamed.revision) == ("Renamed", 3)
        duplicate = store.duplicate("p1")
        assert duplicate.project_id == "p2"
        assert duplicate.name == "Renamed copy"
        assert duplicate.document_json == renamed.document_json
        assert [project.project_id for project in store.list()] == ["p2", "p1"]
        store.delete("p1")
        assert [project.project_id for project in store.list()] == ["p2"]


def test_stale_save_never_overwrites_and_preserves_conflict_copy(tmp_path: Path) -> None:
    with repository(tmp_path / "projects.sqlite3") as store:
        original = store.create("Shared", b'{"revision":1}\n', engine_version=63)
        current = store.save(original.project_id, b'{"revision":2}\n', expected_revision=1)
        try:
            store.save(
                original.project_id,
                b'{"revision":"stale writer"}\n',
                expected_revision=1,
                name="Shared",
                engine_version=63,
            )
        except StaleRevisionError as exc:
            assert (exc.actual, exc.expected, exc.conflict_id) == (2, 1, "p2")
        else:
            raise AssertionError("stale revision overwrote current project")
        assert store.get(original.project_id) == current
        conflict = store.get("p2")
        assert conflict.name == "Shared (conflict copy)"
        assert conflict.document_json == b'{"revision":"stale writer"}\n'


def test_schema_enforces_foreign_keys_and_missing_projects_are_actionable(tmp_path: Path) -> None:
    with repository(tmp_path / "projects.sqlite3") as store:
        assert store.connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        for operation in (lambda: store.get("missing"), lambda: store.delete("missing")):
            try:
                operation()
            except KeyError as exc:
                assert "Unknown project" in str(exc)
            else:
                raise AssertionError("missing project operation succeeded")
