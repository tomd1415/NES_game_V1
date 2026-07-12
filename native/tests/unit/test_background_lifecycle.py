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
