from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.application import create_application  # noqa: E402
from nes_studio.ui.widgets.world_canvas import WorldCanvas  # noqa: E402


def test_world_canvas_paint_and_erase_change_only_the_selected_cell() -> None:
    app = create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    original_neighbor = canvas.cell_value(1, 1)

    canvas.set_tool("paint")
    assert canvas.edit_cell(2, 2)
    assert canvas.cell_value(2, 2) == 1
    assert canvas.cell_value(1, 1) == original_neighbor

    canvas.set_tool("erase")
    assert canvas.edit_cell(2, 2)
    assert canvas.cell_value(2, 2) == 0
    app.processEvents()


def test_select_tool_does_not_mutate_and_invalid_cells_are_rejected() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    before = canvas.cell_value(0, 0)
    canvas.set_tool("select")
    assert not canvas.edit_cell(0, 0)
    assert canvas.cell_value(0, 0) == before

    try:
        canvas.edit_cell(32, 0)
    except IndexError:
        pass
    else:
        raise AssertionError("out-of-range WORLD edit did not fail")
