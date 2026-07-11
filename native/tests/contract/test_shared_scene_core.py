from __future__ import annotations

import copy
import importlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import scene  # noqa: E402
import playground_server  # noqa: E402


def test_scene_bounds_and_position_clamping_match_server_adapters() -> None:
    state = {
        "selectedBgIdx": 1,
        "backgrounds": [
            {"dimensions": {"screens_x": 1, "screens_y": 1}},
            {"dimensions": {"screens_x": 3, "screens_y": 2}},
        ],
    }
    before = copy.deepcopy(state)
    bounds = scene.world_bounds(state)
    assert bounds == (768, 480)
    assert playground_server._scene_world_bounds(state) == bounds
    for item, expected in (
        ({"x": -4, "y": -8}, (0, 0)),
        ({"x": 400, "y": 300}, (400, 300)),
        ({"x": 999, "y": 999}, (767, 479)),
    ):
        assert scene.sprite_position(item, *bounds) == expected
        assert playground_server._scene_sprite_xy(item, *bounds) == expected
    assert state == before


def test_role_codes_and_formatted_definitions_match_both_emitters() -> None:
    assert scene.role_code({"role": "enemy"}) == 2
    assert scene.role_code({"role": "not-a-role"}) == 9
    assert playground_server._role_code({"role": "hud"}) == 10
    assert playground_server._role_defs("#define") == scene.role_definitions("#define")
    assert playground_server._role_defs(".define") == scene.role_definitions(".define")
    assert len(scene.role_definitions("#define")) == 11


def test_scene_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(scene)
    assert set(tmp_path.iterdir()) == before


def sprite(tile: int, width: int = 1, height: int = 1) -> dict:
    return {
        "width": width,
        "height": height,
        "cells": [
            [
                {
                    "tile": tile + row * width + column,
                    "palette": 2,
                    "priority": row == 0,
                    "flipH": column == 0,
                    "flipV": False,
                }
                for column in range(width)
            ]
            for row in range(height)
        ],
    }


def test_cell_and_sprite_encoders_match_server_adapters() -> None:
    value = {"tile": 0x123, "palette": 6, "priority": True, "flipH": True, "flipV": True}
    assert scene.cell_tile(value) == 0x23 == playground_server.cell_tile(value)
    assert scene.cell_attribute(value) == 0xE2 == playground_server.cell_attr(value)
    encoded = scene.flatten_sprite(sprite(10, 2, 2))
    assert playground_server._flatten_sprite(sprite(10, 2, 2)) == encoded
    assert encoded[0] == [10, 11, 12, 13]


def test_animation_resolution_filters_shape_and_clamps_fps() -> None:
    state = {
        "sprites": [sprite(1), sprite(2), sprite(3, 2, 1)],
        "animations": [{"id": 7, "frames": [0, 2, 99, 1], "fps": 100}],
        "animation_assignments": {"walk": 7},
    }
    before = copy.deepcopy(state)
    resolved = scene.resolve_animation(state, "walk", 1, 1)
    assert resolved is not None
    frames, fps = resolved
    assert frames == [state["sprites"][0], state["sprites"][1]]
    assert fps == 60
    assert playground_server._resolve_animation(state, "walk", 1, 1) == resolved
    assert scene.resolve_animation(state, "jump", 1, 1) is None
    assert state == before


def test_asm_scene_emitter_is_identical_through_server_adapter() -> None:
    state = {
        "sprites": [
            {**sprite(1, 2, 1), "role": "player"},
            {**sprite(10), "role": "enemy", "flying": True},
        ],
        "animations": [{"id": 4, "frames": [0], "fps": 12}],
        "animation_assignments": {"walk": 4},
        "backgrounds": [{"dimensions": {"screens_x": 2, "screens_y": 1}}],
    }
    placed = [{"spriteIdx": 1, "x": 400, "y": 999}]
    before = copy.deepcopy(state)
    generated = scene.build_scene_asminc(state, 0, placed, 60, 120)
    assert playground_server.build_scene_asminc(state, 0, placed, 60, 120) == generated
    assert ".define WALK_FRAME_COUNT 1" in generated
    assert "ss_x:      .byte 144" in generated
    assert "ss_y:      .byte 239" in generated
    assert "ss_role:   .byte 2" in generated
    assert state == before
