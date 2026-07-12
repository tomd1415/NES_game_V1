from __future__ import annotations

import copy
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


def test_universal_background_is_a_valid_build_relevant_project_field() -> None:
    document = ProjectDocument.preview()
    assert document.universal_background == 0x21
    document.set_universal_background(0x0F)
    assert document.state["universal_bg"] == 0x0F
    try:
        document.set_universal_background(0x40)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid NES backdrop colour was accepted")


def test_background_palette_slots_are_normalized_and_preserve_the_shared_backdrop() -> None:
    document = ProjectDocument.preview()
    assert document.background_palette(0) == (0x0F, 0x0F, 0x0F)
    document.set_background_palette_slot(2, 1, 0x2A)
    assert document.background_palette(2) == (0x0F, 0x2A, 0x0F)
    assert document.universal_background == 0x21


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
    before = document.snapshot()
    assert document.world_behaviours()[0][0] == 0
    assert document.state == before
    assert not document.dirty

    document.set_world_behaviour(31, 29, 255)
    assert document.world_behaviours()[29][31] == 255
    assert document.dirty


def test_malformed_background_and_cells_report_project_format_errors() -> None:
    malformed_background = project_state()
    malformed_background["backgrounds"][0] = None
    try:
        ProjectDocument.from_json(json.dumps(malformed_background))
    except ProjectFormatError as exc:
        assert "backgrounds[0]: must be an object" in str(exc)
    else:
        raise AssertionError("non-object background was accepted")

    malformed_cell = project_state()
    malformed_cell["backgrounds"][0]["nametable"][2][3] = 7
    try:
        ProjectDocument.from_json(json.dumps(malformed_cell))
    except ProjectFormatError as exc:
        assert "backgrounds[0].nametable[2][3]" in str(exc)
    else:
        raise AssertionError("non-object WORLD cell was accepted")


def test_native_tile_edits_reject_indices_outside_chr_bank() -> None:
    document = ProjectDocument.from_json(json.dumps(project_state()))
    for invalid in (-1, 256):
        try:
            document.set_world_tile(0, 0, invalid)
        except ValueError:
            pass
        else:
            raise AssertionError(f"invalid tile index {invalid} was accepted")
    assert not document.dirty


def test_multiple_backgrounds_can_be_selected_without_losing_room_data() -> None:
    state = project_state()
    second = copy.deepcopy(state["backgrounds"][0])
    second["name"] = "cave"
    second["nametable"][0][0]["tile"] = 23
    state["backgrounds"].append(second)
    document = ProjectDocument.from_json(json.dumps(state))

    assert document.background_names() == ["room", "cave"]
    assert document.world_tiles()[0][0] == 0
    document.select_background(1)
    assert document.selected_background_index == 1
    assert document.world_tiles()[0][0] == 23
    assert document.dirty


def test_malformed_unselected_background_is_rejected_during_import() -> None:
    state = project_state()
    state["backgrounds"].append({"name": "broken", "nametable": []})
    try:
        ProjectDocument.from_json(json.dumps(state))
    except ProjectFormatError as exc:
        assert "backgrounds[1].nametable" in str(exc)
    else:
        raise AssertionError("malformed unselected background was accepted")


def test_legacy_single_nametable_and_tile_pool_are_migrated_additively() -> None:
    table = [
        [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
    ]
    legacy = {
        "name": "legacy",
        "nametable": table,
        "tiles": [{"pixels": [[0] * 8 for _ in range(8)]}],
        "future": {"preserve": True},
    }
    document = ProjectDocument.from_json(json.dumps(legacy))
    assert document.state["version"] == 1
    assert document.state["selectedBgIdx"] == 0
    assert document.state["backgrounds"][0]["nametable"] == table
    assert document.state["backgrounds"][0]["dimensions"] == {
        "screens_x": 1,
        "screens_y": 1,
    }
    assert document.state["bg_tiles"] == legacy["tiles"]
    assert document.state["sprite_tiles"] == legacy["tiles"]
    assert document.state["bg_tiles"] is not document.state["sprite_tiles"]
    assert document.state["future"] == {"preserve": True}


def test_immutable_snapshot_is_stable_and_detached_from_later_edits() -> None:
    document = ProjectDocument.from_json(json.dumps(project_state()))
    snapshot = document.immutable_snapshot()
    before = snapshot.state()
    document.set_world_tile(0, 0, 99)
    assert snapshot.state() == before
    assert snapshot.state()["backgrounds"][0]["nametable"][0][0]["tile"] == 0
    assert len(snapshot.sha256) == 64


def test_engine_version_upgrade_and_explicit_downgrade_rules() -> None:
    document = ProjectDocument.from_json(json.dumps(project_state()))
    assert document.engine_version == 1
    document.set_engine_version(63, current=63)
    assert document.engine_version == 63
    try:
        document.set_engine_version(62, current=63)
    except ValueError as exc:
        assert "explicit confirmation" in str(exc)
    else:
        raise AssertionError("implicit engine downgrade was accepted")
    document.set_engine_version(62, current=63, allow_downgrade=True)
    assert document.engine_version == 62
    try:
        document.set_engine_version(64, current=63)
    except ValueError:
        pass
    else:
        raise AssertionError("future engine version was accepted")


def test_historical_animation_builder_and_metatile_shapes_are_backfilled() -> None:
    state = project_state()
    state["template"] = "topdown"
    state["builder"] = {"version": 0, "legacy": "preserved elsewhere"}
    state["animations"] = [{"name": "old walk", "frames": [0], "fps": 0}]
    state["animation_assignments"] = {"walk": 1, "jump": None}
    state["backgrounds"][0]["tileMode"] = "16x16"
    document = ProjectDocument.from_json(json.dumps(state))
    assert document.state["animation_assignments"] == {
        "walk": 1,
        "jump": None,
        "attack": None,
    }
    assert document.state["animations"][0] == {
        "name": "old walk",
        "frames": [0],
        "fps": 1,
        "id": 1,
        "role": "player",
        "style": "custom",
    }
    assert document.state["nextAnimationId"] == 2
    assert document.state["builder"]["version"] == 1
    assert document.state["builder"]["modules"]["game"]["config"]["type"] == "topdown"
    assert document.state["backgrounds"][0]["metatiles"] == []
    assert document.state["backgrounds"][0]["mtmap"] == []


def test_legacy_custom_behaviour_slot_six_moves_to_seven_everywhere() -> None:
    state = project_state()
    state["backgrounds"][0]["behaviour"][2][3] = 6
    state["behaviour_types"] = [
        {"id": 6, "name": "ice", "colour": "#abcdef", "builtin": False}
    ]
    state["behaviour_reactions"] = [{"6": "bounce"}]
    document = ProjectDocument.from_json(json.dumps(state))
    assert document.state["behaviour_types"] == [
        {"id": 7, "name": "ice", "colour": "#abcdef", "builtin": False}
    ]
    assert document.state["backgrounds"][0]["behaviour"][2][3] == 7
    assert document.state["behaviour_reactions"] == [{"7": "bounce"}]


def test_future_schema_and_unknown_fields_survive_normalization() -> None:
    state = project_state()
    state["version"] = 99
    state["futureNativeMustPreserve"] = {"nested": {"value": True}}
    document = ProjectDocument.from_json(json.dumps(state))
    assert document.state["version"] == 99
    assert document.state["futureNativeMustPreserve"] == {"nested": {"value": True}}
    issues = ProjectDocument.validate(document.state)
    assert any(issue.severity == "warning" and issue.path == "version" for issue in issues)
