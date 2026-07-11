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
