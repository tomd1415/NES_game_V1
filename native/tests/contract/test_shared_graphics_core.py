from __future__ import annotations

import copy
import importlib
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import graphics  # noqa: E402
import playground_server  # noqa: E402


def sample_nametable() -> list[list[dict[str, int]]]:
    table = [[{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)]
    table[0][0] = {"tile": 0x123, "palette": 1}
    table[0][2] = {"tile": 2, "palette": 2}
    table[2][0] = {"tile": 3, "palette": 3}
    table[2][2] = {"tile": 4, "palette": 0}
    return table


def test_nametable_encoder_has_exact_nes_layout_and_server_compatibility() -> None:
    table = sample_nametable()
    encoded = graphics.nametable_bytes(table)
    assert len(encoded) == 1024
    assert encoded[:4] == bytes((0x23, 0, 2, 0))
    assert encoded[960] == 0b00111001
    assert playground_server._nametable_bytes_for(table) == encoded
    state = {"backgrounds": [{"nametable": table}], "selectedBgIdx": 0}
    assert playground_server.build_nam(state) == graphics.build_nam(state)


def test_metatile_expansion_is_identical_through_server_adapter() -> None:
    state = {
        "backgrounds": [
            {
                "tileMode": "16x16",
                "metatiles": [
                    {"tiles": [1, 2, 3, 4], "palette": 2, "behaviour": 7}
                ],
                "mtmap": [[0 for _ in range(17)] for _ in range(16)],
            }
        ]
    }
    core_state = graphics.expand_metatiles(copy.deepcopy(state))
    adapter_state = playground_server._expand_metatiles(copy.deepcopy(state))
    assert adapter_state == core_state
    background = core_state["backgrounds"][0]
    assert background["dimensions"] == {"screens_x": 2, "screens_y": 2}
    assert background["nametable"][0][:2] == [
        {"tile": 1, "palette": 2},
        {"tile": 2, "palette": 2},
    ]
    assert background["behaviour"][1][:2] == [7, 7]


def test_importing_graphics_core_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(graphics)
    assert set(tmp_path.iterdir()) == before


def test_chr_encoders_are_byte_identical_and_do_not_mutate_input() -> None:
    pixels = [[(row + column) % 4 for column in range(8)] for row in range(8)]
    tiles = [{"pixels": copy.deepcopy(pixels)} for _ in range(256)]
    before = copy.deepcopy(tiles)
    assert graphics.tile_to_chr(pixels) == playground_server.tile_to_chr(pixels)
    assert graphics.encode_tile_pool(tiles, "test") == playground_server._encode_pool(
        tiles, "test"
    )
    assert len(graphics.encode_tile_pool(tiles)) == 4096
    assert tiles == before


def test_palette_rows_are_identical_for_defaults_and_dialogue_override() -> None:
    state = {
        "universal_bg": 0x21,
        "bg_palettes": [{"slots": [0x01, 0x42, 0x03]}],
        "sprite_palettes": [{"slots": [0x11, 0x12, 0x13]}],
    }
    before = copy.deepcopy(state)
    assert playground_server._palette_rows(state) == graphics.palette_rows(state)
    assert graphics.palette_rows(state)[0] == [0x21, 0x01, 0x02, 0x03]

    state["builder"] = {"modules": {"dialogue": {"enabled": True}}}
    assert playground_server._palette_rows(state) == graphics.palette_rows(state, True)
    assert graphics.palette_rows(state, True)[3] == [0x21, 0x30, 0x01, 0x0F]
    del state["builder"]
    assert state == before


def test_palette_source_emitters_are_identical_through_server_adapters() -> None:
    state = {
        "universal_bg": 0x0F,
        "bg_palettes": [{"slots": [1, 2, 3]} for _ in range(4)],
        "sprite_palettes": [{"slots": [0x11, 0x12, 0x13]} for _ in range(4)],
    }
    before = copy.deepcopy(state)
    assert playground_server.build_palettes_inc(state) == graphics.build_palettes_inc(state)
    assert playground_server.build_palettes_asminc(state) == graphics.build_palettes_asminc(state)
    assert "const unsigned char palette_bytes[32]" in graphics.build_palettes_inc(state)
    assert '.segment "RODATA"' in graphics.build_palettes_asminc(state)
    assert state == before


def blank_tiles() -> list[dict]:
    return [
        {"pixels": [[0 for _ in range(8)] for _ in range(8)], "name": ""}
        for _ in range(256)
    ]


def test_complete_chr_generation_matches_server_for_dialogue_and_hud_seeding() -> None:
    state = {
        "sprite_tiles": blank_tiles(),
        "bg_tiles": blank_tiles(),
        "builder": {
            "modules": {
                "game": {"config": {"type": "smb"}},
                "smbhud": {"enabled": True, "config": {"background": True}},
                "dialogue": {"enabled": True},
            }
        },
    }
    core_state = copy.deepcopy(state)
    server_state = copy.deepcopy(state)
    core_chr = graphics.build_chr(core_state)
    server_chr = playground_server.build_chr(server_state)
    assert core_chr == server_chr
    assert core_state == server_state
    assert len(core_chr) == 8192
    assert any(
        pixel
        for row in core_state["bg_tiles"][ord("A")]["pixels"]
        for pixel in row
    )


def test_chr_generation_supports_legacy_pool_without_mutating_it() -> None:
    state = {"tiles": blank_tiles()}
    before = copy.deepcopy(state)
    encoded = graphics.build_chr(state)
    assert encoded[:4096] == encoded[4096:]
    assert state == before


def test_racer_rotation_injection_matches_server_and_preserves_referenced_tiles() -> None:
    pool = blank_tiles()
    pool[5]["pixels"] = [[1 for _ in range(8)] for _ in range(8)]
    state = {
        "sprites": [
            {
                "width": 1,
                "height": 1,
                "cells": [[{"tile": 5, "palette": 0, "empty": False}]],
            }
        ],
        "sprite_tiles": pool,
        "builder": {"modules": {"game": {"config": {"type": "racer"}}}},
    }
    core_state = copy.deepcopy(state)
    server_state = copy.deepcopy(state)
    graphics._inject_racer_rotation(core_state, 0)
    playground_server._inject_racer_rotation(server_state, 0)
    assert core_state == server_state
    assert core_state["sprite_tiles"][5] == state["sprite_tiles"][5]
    assert len(core_state["_racer_rot"]["tiles"]) == 8
    assert len(core_state["_racer_digits"]) == 10
