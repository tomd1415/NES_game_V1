from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("NES_STUDIO_TEST_MODE", "1")
NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.application import create_application  # noqa: E402
from nes_studio.ui.widgets.world_canvas import WorldCanvas  # noqa: E402
from PySide6.QtCore import Qt  # noqa: E402
from PySide6.QtTest import QTest  # noqa: E402


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
    assert canvas.undo()
    assert canvas.cell_value(2, 2) == 1
    assert canvas.undo()
    assert canvas.cell_value(2, 2) == 0
    assert canvas.redo()
    assert canvas.cell_value(2, 2) == 1
    app.processEvents()


def test_world_canvas_groups_a_drag_stroke_into_one_undo_step() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    canvas.set_tool("paint")
    canvas.begin_stroke()
    canvas.edit_cell(1, 1)
    canvas.edit_cell(2, 1)
    canvas.edit_cell(3, 1)
    canvas.end_stroke()
    assert all(canvas.cell_value(col, 1) == 1 for col in (1, 2, 3))
    assert canvas.undo()
    assert all(canvas.cell_value(col, 1) == 0 for col in (1, 2, 3))
    assert not canvas.can_undo


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


def test_palette_and_behaviour_edits_share_stroke_undo_history() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    tiles = [[0 for _ in range(32)] for _ in range(30)]
    palettes = [[0 for _ in range(32)] for _ in range(30)]
    behaviours = [[0 for _ in range(32)] for _ in range(30)]
    canvas.load_world(tiles, palettes, behaviours)

    canvas.set_palette_value(3)
    canvas.set_tool("palette")
    assert canvas.edit_cell(8, 9)
    assert canvas.palette_value(8, 9) == 3
    assert canvas.cell_value(8, 9) == 0

    canvas.set_behaviour_value(7)
    canvas.set_tool("behaviour")
    assert canvas.edit_cell(8, 9)
    assert canvas.behaviour_value(8, 9) == 7
    assert canvas.undo()
    assert canvas.behaviour_value(8, 9) == 0
    assert canvas.palette_value(8, 9) == 3
    assert canvas.undo()
    assert canvas.palette_value(8, 9) == 0


def test_coordinate_mapping_is_exact_at_integer_and_fractional_scales() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()

    canvas.resize(256, 240)
    assert canvas.cell_at_position(0, 0) == (0, 0)
    assert canvas.cell_at_position(7.999, 7.999) == (0, 0)
    assert canvas.cell_at_position(8, 8) == (1, 1)
    assert canvas.cell_at_position(255.999, 239.999) == (31, 29)
    assert canvas.cell_at_position(256, 240) is None

    canvas.resize(384, 360)
    assert canvas.cell_at_position(11.999, 11.999) == (0, 0)
    assert canvas.cell_at_position(12, 12) == (1, 1)
    assert canvas.cell_at_position(383.999, 359.999) == (31, 29)


def test_coordinate_mapping_rejects_letterbox_margins() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    canvas.resize(500, 360)
    # The 384-pixel-wide NES image is centred inside 58-pixel side margins.
    assert canvas.cell_at_position(57.999, 120) is None
    assert canvas.cell_at_position(58, 0) == (0, 0)
    assert canvas.cell_at_position(441.999, 359.999) == (31, 29)
    assert canvas.cell_at_position(442, 120) is None


def test_keyboard_navigation_edits_selected_cell_and_describes_it() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    canvas.set_tool("paint")
    canvas.show()
    canvas.setFocus()

    QTest.keyClick(canvas, Qt.Key.Key_Right)
    QTest.keyClick(canvas, Qt.Key.Key_Down)
    QTest.keyClick(canvas, Qt.Key.Key_Space)

    assert canvas.selected_cell == (1, 1)
    assert canvas.cell_value(1, 1) == 1
    assert "column 1, row 1" in canvas.accessibleDescription()
    assert "tile 1" in canvas.accessibleDescription()


def test_keyboard_navigation_stays_inside_world_bounds() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    canvas.show()
    canvas.setFocus()
    QTest.keyClick(canvas, Qt.Key.Key_Left)
    QTest.keyClick(canvas, Qt.Key.Key_Up)
    assert canvas.selected_cell == (0, 0)


def test_selected_tile_value_is_painted_and_reversible() -> None:
    create_application(["world-canvas-test"])
    canvas = WorldCanvas()
    canvas.set_paint_value(173)
    canvas.set_tool("paint")

    assert canvas.edit_cell(3, 4)
    assert canvas.cell_value(3, 4) == 173
    assert canvas.undo()
    assert canvas.cell_value(3, 4) == 0
    assert canvas.redo()
    assert canvas.cell_value(3, 4) == 173
