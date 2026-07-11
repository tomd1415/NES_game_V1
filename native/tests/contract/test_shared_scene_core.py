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
