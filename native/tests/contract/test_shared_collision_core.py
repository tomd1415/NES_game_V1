from __future__ import annotations

import copy
import importlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import collision  # noqa: E402
import playground_server  # noqa: E402


def sample_state() -> dict:
    return {
        "selectedBgIdx": 1,
        "backgrounds": [
            {"dimensions": {"screens_x": 1, "screens_y": 1}},
            {"dimensions": {"screens_x": 3, "screens_y": 2}},
        ],
        "sprites": [{}, {}],
        "behaviour_types": [
            {"id": 7, "name": "Ice / Water"},
            {"id": "bad", "name": "ignored"},
        ],
    }


def test_collision_header_is_identical_through_server_adapter() -> None:
    state = sample_state()
    before = copy.deepcopy(state)
    generated = collision.build_collision_h(state)
    assert playground_server.build_collision_h(state) == generated
    assert "#define WORLD_COLS   96" in generated
    assert "#define WORLD_ROWS   60" in generated
    assert "#define BEHAVIOUR_ICE_WATER        7" in generated
    assert state == before


def test_collision_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(collision)
    assert set(tmp_path.iterdir()) == before


def test_behaviour_map_encoder_matches_server_and_tolerates_bad_cells() -> None:
    background = {
        "behaviour": [
            [1, 2, "bad", 11],
            [7],
        ]
    }
    before = copy.deepcopy(background)
    encoded = collision.behaviour_map_for_background(background, 4, 3)
    assert encoded == bytes((1, 2, 0, 3, 7, 0, 0, 0, 0, 0, 0, 0))
    assert playground_server._behaviour_map_for_bg(background, 4, 3) == encoded
    assert background == before


def test_sprite_reaction_table_matches_server_and_is_input_immutable() -> None:
    state = {
        "sprites": [{}, {}],
        "behaviour_reactions": [
            {"1": "block", 3: "land_top", "7": "unknown"},
            "malformed",
        ],
    }
    before = copy.deepcopy(state)
    table, count = collision.sprite_reaction_table(state)
    assert count == 2
    assert len(table) == 16
    assert table[1] == collision.REACTION_VERB_IDS["block"]
    assert table[3] == collision.REACTION_VERB_IDS["land_top"]
    assert table[7] == 0
    assert playground_server._sprite_reaction_table(state) == (table, count)
    assert state == before


def test_behaviour_c_is_identical_through_server_adapter() -> None:
    state = sample_state()
    state["backgrounds"][0]["behaviour"] = [[1, 2], [3, 4]]
    state["backgrounds"][1]["behaviour"] = [[7, 6], [5, 4]]
    state["behaviour_reactions"] = [
        {"1": "block", "3": "land_top"},
        {"4": "exit", "6": "call_handler"},
    ]
    before = copy.deepcopy(state)
    generated = collision.build_behaviour_c(state)
    assert playground_server.build_behaviour_c(state) == generated
    assert "active_behaviour_map = behaviour_map_1" in generated
    assert "case 1: active_behaviour_map = behaviour_map_1" in generated
    assert "const unsigned char sprite_reactions[16]" in generated
    assert state == before


def test_behaviour_c_emits_linkable_stubs_for_empty_project() -> None:
    generated = collision.build_behaviour_c({})
    assert "behaviour_map_0[960]" in generated
    assert "const unsigned char sprite_reactions[8]" in generated
    assert "sprite_idx >= 1" in generated
