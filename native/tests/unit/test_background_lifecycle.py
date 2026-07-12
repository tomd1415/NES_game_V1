from __future__ import annotations

import pytest

from nes_studio.core.project_document import ProjectDocument


def test_background_lifecycle_preserves_room_data_and_keeps_one_room() -> None:
    document = ProjectDocument.preview()
    document.set_world_tile(3, 4, 19)
    copy_index = document.add_background("Copy", duplicate_selected=True)
    assert copy_index == 1
    assert document.world_tiles()[4][3] == 19
    document.set_world_tile(3, 4, 21)
    document.select_background(0)
    assert document.world_tiles()[4][3] == 19

    document.rename_background(0, "Start")
    assert document.background_names() == ["Start", "Copy"]
    document.delete_background(0)
    assert document.background_names() == ["Copy"]
    assert document.selected_background_index == 0
    with pytest.raises(ValueError, match="at least one"):
        document.delete_background(0)


def test_blank_background_has_editable_nes_grid_and_name_validation() -> None:
    document = ProjectDocument.preview()
    document.add_background("Room 2")
    assert document.world_tiles() == [[0] * 32 for _ in range(30)]
    with pytest.raises(ValueError, match="cannot be empty"):
        document.rename_background(1, "  ")


def test_layout_resize_preserves_top_left_data_and_initializes_new_screens() -> None:
    document = ProjectDocument.preview()
    document.set_world_tile(31, 29, 77)
    document.set_background_dimensions(2, 2)
    background = document.state["backgrounds"][0]
    assert document.background_dimensions() == (2, 2)
    assert len(background["nametable"]) == 60
    assert len(background["nametable"][0]) == 64
    assert background["nametable"][29][31]["tile"] == 77
    assert background["nametable"][59][63] == {"tile": 0, "palette": 0}
    document.set_background_dimensions(1, 1)
    assert document.background_dimensions() == (1, 1)
    assert document.world_tiles()[29][31] == 77


def test_each_scrolling_world_screen_reads_and_writes_its_global_coordinates() -> None:
    document = ProjectDocument.preview()
    document.set_background_dimensions(2, 2)
    document.set_world_tile(32, 30, 44)
    document.set_world_palette(63, 59, 3)
    document.set_world_behaviour(32, 30, 9)
    assert document.world_tiles(1, 1)[0][0] == 44
    assert document.world_palettes(1, 1)[29][31] == 3
    assert document.world_behaviours(1, 1)[0][0] == 9
    assert document.world_tiles(0, 0)[0][0] == 0
