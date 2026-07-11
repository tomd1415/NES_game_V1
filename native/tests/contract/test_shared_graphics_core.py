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
