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


def test_sprite_palettes_have_three_editable_nontransparent_slots() -> None:
    document = ProjectDocument.preview()
    document.set_sprite_palette_slot(3, 2, 0x16)
    assert document.sprite_palette(3) == (0x0F, 0x0F, 0x16)


def test_background_tile_pixels_are_lazily_initialized_and_editable() -> None:
    document = ProjectDocument.preview()
    assert document.background_tile_pixels(7) == [[0] * 8 for _ in range(8)]
    document.set_background_tile_pixel(7, 3, 4, 2)
    assert document.background_tile_pixels(7)[4][3] == 2
    assert len(document.state["bg_tiles"]) == 256


def test_background_tile_transforms_are_canonical_and_reversible_by_callers() -> None:
    document = ProjectDocument.preview()
    document.set_background_tile_pixel(4, 0, 0, 1)
    document.set_background_tile_pixel(4, 7, 0, 2)
    document.transform_background_tile(4, "flip_h")
    assert document.background_tile_pixels(4)[0][0] == 2
    assert document.background_tile_pixels(4)[0][7] == 1
    document.transform_background_tile(4, "rotate")
    assert document.background_tile_pixels(4)[0][7] == 2
    document.transform_background_tile(4, "clear")
    assert document.background_tile_pixels(4) == [[0] * 8 for _ in range(8)]


def test_sprite_lifecycle_supports_roles_flying_and_deep_duplicate() -> None:
    document = ProjectDocument.preview()
    first = document.add_sprite("Hero", role="player")
    document.set_sprite_flying(first, True)
    document.set_background_tile_pixel(0, 0, 0, 2)
    duplicate = document.duplicate_sprite(first, "Hero copy")
    document.rename_sprite(duplicate, "Buddy")
    assert document.sprite_names() == ["Hero", "Buddy"]
    assert document.state["sprites"][0]["flying"] is True
    assert document.state["sprites"][1]["role"] == "player"
    document.delete_sprite(0)
    assert document.sprite_names() == ["Buddy"]


def test_sprite_resize_preserves_existing_cells_and_marks_new_cells_empty() -> None:
    document = ProjectDocument.preview()
    sprite = document.add_sprite("Hero")
    document.resize_sprite(sprite, 2, 2)
    assert document.state["sprites"][sprite]["cells"][0][0]["empty"] is False
    assert document.state["sprites"][sprite]["cells"][1][1]["empty"] is True


def test_sprite_cell_edits_use_the_oam_tile_palette_and_empty_shape() -> None:
    document = ProjectDocument.preview()
    sprite = document.add_sprite("Hero")
    document.set_sprite_cell(sprite, 0, 0, tile=42, palette=3)
    assert document.state["sprites"][sprite]["cells"][0][0] == {
        "tile": 42, "palette": 3, "empty": False,
    }


def test_sprite_tiles_are_independent_from_background_tiles() -> None:
    document = ProjectDocument.preview()
    document.set_background_tile_pixel(7, 3, 4, 1)
    document.set_sprite_tile_pixel(7, 3, 4, 2)
    document.transform_sprite_tile(7, "flip_h")
    assert document.background_tile_pixels(7)[4][3] == 1
    assert document.sprite_tile_pixels(7)[4][4] == 2


def test_duplicate_tiles_copies_into_the_first_available_slot_per_bank() -> None:
    document = ProjectDocument.preview()
    document.set_background_tile_pixel(7, 0, 0, 3)
    document.set_sprite_tile_pixel(7, 0, 0, 2)
    assert document.duplicate_background_tile(7) == 0
    assert document.duplicate_sprite_tile(7) == 0
    assert document.background_tile_pixels(0)[0][0] == 3
    assert document.sprite_tile_pixels(0)[0][0] == 2


def test_background_tile_metadata_exposes_default_world_behaviour() -> None:
    document = ProjectDocument.preview()
    document.set_background_tile_metadata(7, name="Ground", default_behaviour=1)
    assert document.background_tile_default_behaviour(7) == 1


def test_background_can_promote_and_revert_the_shared_metatile_shape() -> None:
    document = ProjectDocument.preview()
    document.promote_selected_background_to_metatiles()
    assert document.background_tile_mode() == "16x16"
    assert document.state["backgrounds"][0]["metatiles"]
    document.revert_selected_background_to_tiles()
    assert document.background_tile_mode() == "8x8"


def test_animation_creation_uses_migrated_stable_ids_and_fps_limits() -> None:
    document = ProjectDocument.preview()
    assert document.add_animation("Walk", fps=12, frames=[0, 1]) == 0
    assert document.state["animations"][0] == {"id": 1, "name": "Walk", "fps": 12, "frames": [0, 1]}
    sprite = document.add_sprite("Hero")
    document.append_animation_frame(0, sprite)
    assert document.state["animations"][0]["frames"] == [0, 1, sprite]


def test_animation_editing_and_assignments_keep_the_web_project_contract() -> None:
    document = ProjectDocument.preview()
    sprite = document.add_sprite("Hero")
    walk = document.add_animation("Walk", frames=[sprite])
    jump = document.add_animation("Jump", fps=10)
    document.update_animation(walk, name="Walk cycle", fps=12)
    document.set_animation_assignment("walk", walk)
    document.set_animation_assignment("jump", jump)
    document.remove_animation_frame(walk)
    assert document.state["animations"][walk] == {"id": 1, "name": "Walk cycle", "fps": 12, "frames": []}
    assert document.state["animation_assignments"] == {"walk": 1, "jump": 2, "attack": None}
    document.delete_animation(walk)
    assert document.state["animation_assignments"]["walk"] is None
    assert document.state["animations"] == [{"id": 2, "name": "Jump", "fps": 10, "frames": []}]


def test_game_style_uses_the_shared_builder_game_config() -> None:
    document = ProjectDocument.preview()
    document.set_game_style("racer")
    document.set_game_option("racerTopSpeed", 4)
    document.set_game_option("racerLaps", 7)
    assert document.state["builder"]["modules"]["game"]["config"]["type"] == "racer"
    assert document.state["builder"]["modules"]["game"]["config"]["racerTopSpeed"] == 4
    assert document.state["builder"]["modules"]["game"]["config"]["racerLaps"] == 7


def test_player_options_use_the_shared_builder_player_one_config() -> None:
    document = ProjectDocument.preview()
    document.set_player_option("startX", 88)
    document.set_player_option("attackButton", "a")
    assert document.state["builder"]["modules"]["players"]["submodules"]["player1"] == {
        "enabled": True, "config": {"startX": 88, "attackButton": "a"},
    }


def test_audio_assets_match_the_web_song_sfx_payload_shape() -> None:
    document = ProjectDocument.preview()
    first = document.add_audio_song("theme.s", ".export _theme\ntheme: .byte 0")
    document.add_audio_song("battle.asm", ".export battle\nbattle: .byte 1")
    document.set_audio_sfx("effects.s", ".export _sfx\nsfx: .byte 2")
    document.set_default_song(1)
    assert document.state["audio"]["songs"][first]["symbol"] == "theme"
    assert document.state["audio"]["songs"][1]["symbol"] == "battle"
    assert document.state["audio"]["sfx"]["symbol"] == "sfx"
    document.remove_audio_song(1)
    assert document.state["audio"]["defaultSongIdx"] == 0


def test_scene_instances_use_the_builder_scene_module_shape() -> None:
    document = ProjectDocument.preview()
    sprite = document.add_sprite("Slime", role="enemy")
    instance = document.add_scene_instance(sprite, x=88, y=120)
    document.update_scene_instance(instance, x=96, ai="walker")
    assert document.scene_instances() == [{"id": 1, "spriteIdx": sprite, "x": 96, "y": 120, "ai": "walker", "speed": 1}]


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
