from __future__ import annotations

import copy
import importlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import world  # noqa: E402
import playground_server  # noqa: E402


def sample_world() -> dict:
    nametable = [[{"tile": 0, "palette": 0} for _ in range(64)] for _ in range(60)]
    nametable[0][0] = {"tile": 0x123, "palette": 1}
    nametable[0][2] = {"tile": 2, "palette": 2}
    nametable[30][32] = {"tile": 9, "palette": 3}
    return {
        "selectedBgIdx": 0,
        "backgrounds": [
            {
                "dimensions": {"screens_x": 2, "screens_y": 2},
                "nametable": nametable,
            }
        ],
    }


def test_full_world_encoding_and_emitters_match_server_adapters() -> None:
    state = sample_world()
    before = copy.deepcopy(state)
    encoded = world.world_nametable(state)
    assert playground_server._world_nametable(state) == encoded
    tiles, attributes, columns, rows, attribute_columns, attribute_rows = encoded
    assert (columns, rows, attribute_columns, attribute_rows) == (64, 60, 16, 16)
    assert tiles[0] == 0x23
    assert tiles[30 * 64 + 32] == 9
    assert attributes[0] == 0b00001001
    assert playground_server.build_bg_world_h(state) == world.build_bg_world_h(state)
    assert playground_server.build_bg_world_c(state) == world.build_bg_world_c(state)
    assert state == before


def test_world_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(world)
    assert set(tmp_path.iterdir()) == before


def test_four_screen_detection_and_header_patch_match_server_adapters() -> None:
    vertical = sample_world()
    horizontal = copy.deepcopy(vertical)
    horizontal["backgrounds"][0]["dimensions"]["screens_y"] = 1
    assert world.project_needs_four_screen(vertical)
    assert not world.project_needs_four_screen(horizontal)
    assert playground_server._project_needs_four_screen(vertical)

    rom = b"NES\x1a" + bytes((2, 1, 0x03)) + bytes(9) + b"payload"
    patched = world.patch_ines_four_screen(rom)
    assert patched[6] == 0x0B
    assert patched[:6] == rom[:6]
    assert patched[7:] == rom[7:]
    assert playground_server._patch_ines_four_screen(rom) == patched


def test_four_screen_patch_leaves_non_ines_data_unchanged() -> None:
    for payload in (b"", b"short", bytes(16), b"NOPE" + bytes(20)):
        assert world.patch_ines_four_screen(payload) == payload
