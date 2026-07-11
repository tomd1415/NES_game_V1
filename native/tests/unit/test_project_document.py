from __future__ import annotations

import json
import sys
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.core.project_document import ProjectDocument, ProjectFormatError  # noqa: E402


def project_state() -> dict:
    return {
        "name": "contract",
        "version": 2,
        "futureNativeMustPreserve": {"answer": 42},
        "selectedBgIdx": 0,
        "backgrounds": [
            {
                "name": "room",
                "nametable": [
                    [{"tile": 0, "palette": 3, "futureCell": True} for _ in range(32)]
                    for _ in range(30)
                ],
                "behaviour": [[0 for _ in range(32)] for _ in range(30)],
            }
        ],
    }


def test_project_document_edits_tile_and_round_trips_unknown_fields() -> None:
    source = project_state()
    document = ProjectDocument.from_json(json.dumps(source))
    document.set_world_tile(4, 5, 7)
    result = json.loads(document.to_json())
    assert result["backgrounds"][0]["nametable"][5][4]["tile"] == 7
    assert result["backgrounds"][0]["nametable"][5][4]["palette"] == 3
    assert result["backgrounds"][0]["nametable"][5][4]["futureCell"] is True
    assert result["futureNativeMustPreserve"] == {"answer": 42}
    assert document.dirty


def test_project_document_snapshot_is_detached_and_invalid_grid_is_rejected() -> None:
    document = ProjectDocument.from_json(json.dumps(project_state()))
    snapshot = document.snapshot()
    snapshot["name"] = "changed"
    assert document.state["name"] == "contract"

    try:
        ProjectDocument.from_json('{"backgrounds": []}')
    except ProjectFormatError:
        pass
    else:
        raise AssertionError("invalid project grid was accepted")


def test_preview_document_is_canonical_and_editable() -> None:
    document = ProjectDocument.preview()
    assert document.name == "Native Preview"
    assert len(document.world_tiles()) == 30
    assert len(document.world_tiles()[0]) == 32
    assert document.world_tiles()[24][0] == 2


def test_project_document_edits_palette_and_behaviour_without_losing_cell_fields() -> None:
    document = ProjectDocument.from_json(json.dumps(project_state()))
    document.set_world_palette(4, 5, 2)
    document.set_world_behaviour(4, 5, 7)

    result = json.loads(document.to_json())
    cell = result["backgrounds"][0]["nametable"][5][4]
    assert cell == {"tile": 0, "palette": 2, "futureCell": True}
    assert result["backgrounds"][0]["behaviour"][5][4] == 7
    assert document.world_palettes()[5][4] == 2
    assert document.world_behaviours()[5][4] == 7


def test_missing_behaviour_map_is_created_lazily() -> None:
    state = project_state()
    del state["backgrounds"][0]["behaviour"]
    document = ProjectDocument.from_json(json.dumps(state))
    document.set_world_behaviour(31, 29, 255)
    assert document.world_behaviours()[29][31] == 255
