from __future__ import annotations

import copy
import importlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import project  # noqa: E402
import playground_server  # noqa: E402


def test_project_constants_match_server_for_wide_two_player_smb_world() -> None:
    state = {
        "sprites": [
            {"width": 2, "height": 3},
            {"width": 1, "height": 2},
            {"width": 1, "height": 1},
        ],
        "selectedBgIdx": 0,
        "backgrounds": [
            {
                "dimensions": {"screens_x": 3, "screens_y": 2},
                "nametable": [],
            }
        ],
        "builder": {
            "modules": {
                "game": {
                    "config": {
                        "type": "smb",
                        "smbSpeed": 5,
                        "autoscrollSpeed": 4,
                        "racerTopSpeed": 2,
                        "racerLaps": 7,
                        "racerCheckpoints": 2,
                    }
                },
                "smbhud": {"enabled": True, "config": {"background": True}},
            }
        },
    }
    scene_sprites = [{"spriteIdx": 2, "x": 400, "y": 300}]
    before = copy.deepcopy(state)
    generated = project.build_project_inc(state, 0, scene_sprites, 123, 1)
    assert playground_server.build_project_inc(state, 0, scene_sprites, 123, 1) == generated
    assert ".define WORLD_COLS             96" in generated
    assert ".define WORLD_ROWS             60" in generated
    assert ".define PLAYER2_ENABLED        1" in generated
    assert ".define SS_POS_WIDE            1" in generated
    assert ".define SCROLL_SKIP_TOP        4" in generated
    assert state == before


def test_project_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(project)
    assert set(tmp_path.iterdir()) == before
