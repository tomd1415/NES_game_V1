"""Canonical JSON-compatible project document for the native client."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ProjectFormatError(ValueError):
    """Raised when a project cannot provide an editable WORLD grid."""


@dataclass(slots=True)
class ProjectDocument:
    """Own a project state while preserving fields the native UI does not know."""

    state: dict[str, Any]
    path: Path | None = None
    dirty: bool = False

    @classmethod
    def preview(cls) -> "ProjectDocument":
        """Create the small canonical in-memory project shown by the preview UI."""

        nametable = [
            [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
        ]
        for row in range(24, 30):
            for col in range(32):
                nametable[row][col]["tile"] = 2 if row == 24 else 1
        for col, height in ((5, 3), (6, 3), (12, 5), (13, 5), (22, 2)):
            for row in range(24 - height, 24):
                nametable[row][col]["tile"] = 3
        return cls(
            state={
                "name": "Native Preview",
                "version": 2,
                "selectedBgIdx": 0,
                "backgrounds": [
                    {
                        "name": "room1",
                        "dimensions": {"screens_x": 1, "screens_y": 1},
                        "nametable": nametable,
                        "behaviour": [[0 for _ in range(32)] for _ in range(30)],
                    }
                ],
            }
        )

    @classmethod
    def from_json(cls, data: str | bytes, path: Path | None = None) -> "ProjectDocument":
        try:
            state = json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ProjectFormatError(f"Invalid project JSON: {exc}") from exc
        if not isinstance(state, dict):
            raise ProjectFormatError("Project JSON must contain an object at the top level")
        cls._world_grid(state)
        return cls(state=state, path=path)

    @classmethod
    def open(cls, path: str | Path) -> "ProjectDocument":
        project_path = Path(path)
        return cls.from_json(project_path.read_bytes(), project_path)

    def to_json(self) -> bytes:
        return (json.dumps(self.state, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    @property
    def name(self) -> str:
        return str(self.state.get("name") or "Untitled")

    def snapshot(self) -> dict[str, Any]:
        return copy.deepcopy(self.state)

    @staticmethod
    def _world_grid(state: dict[str, Any]) -> list[list[dict[str, Any]]]:
        backgrounds = state.get("backgrounds")
        if not isinstance(backgrounds, list) or not backgrounds:
            raise ProjectFormatError("Project has no editable backgrounds")
        index = state.get("selectedBgIdx", 0)
        if not isinstance(index, int) or not 0 <= index < len(backgrounds):
            raise ProjectFormatError("Selected background index is invalid")
        background = backgrounds[index]
        if not isinstance(background, dict):
            raise ProjectFormatError("Selected background is not an object")
        grid = background.get("nametable")
        if not isinstance(grid, list) or len(grid) < 30:
            raise ProjectFormatError("Selected background has no 30-row nametable")
        if any(not isinstance(row, list) or len(row) < 32 for row in grid[:30]):
            raise ProjectFormatError("Selected background has no 32-column nametable")
        for row_index, row in enumerate(grid[:30]):
            for col_index, cell in enumerate(row[:32]):
                if not isinstance(cell, dict):
                    raise ProjectFormatError(
                        f"WORLD cell {col_index}, {row_index} is not an object"
                    )
        return grid

    def world_tiles(self) -> list[list[int]]:
        grid = self._world_grid(self.state)
        return [[int(cell.get("tile", 0)) for cell in row[:32]] for row in grid[:30]]

    def world_palettes(self) -> list[list[int]]:
        grid = self._world_grid(self.state)
        return [[int(cell.get("palette", 0)) & 3 for cell in row[:32]] for row in grid[:30]]

    def world_behaviours(self) -> list[list[int]]:
        background = self._selected_background()
        behaviour = background.get("behaviour")
        if not isinstance(behaviour, list):
            return [[0 for _ in range(32)] for _ in range(30)]
        if len(behaviour) < 30 or any(
            not isinstance(row, list) or len(row) < 32 for row in behaviour[:30]
        ):
            raise ProjectFormatError("Selected background has no 32 by 30 behaviour map")
        return [[int(value) & 0xFF for value in row[:32]] for row in behaviour[:30]]

    def _selected_background(self) -> dict[str, Any]:
        backgrounds = self.state["backgrounds"]
        return backgrounds[self.state.get("selectedBgIdx", 0)]

    def set_world_tile(self, col: int, row: int, tile: int) -> None:
        if not 0 <= tile <= 0xFF:
            raise ValueError(f"NES tile index must be 0..255: {tile}")
        self._validate_coordinates(col, row)
        grid = self._world_grid(self.state)
        cell = grid[row][col]
        if int(cell.get("tile", 0)) != tile:
            cell["tile"] = tile
            self.dirty = True

    def set_world_palette(self, col: int, row: int, palette: int) -> None:
        if not 0 <= palette <= 3:
            raise ValueError(f"NES background palette must be 0..3: {palette}")
        self._set_world_cell_field(col, row, "palette", palette)

    def set_world_behaviour(self, col: int, row: int, behaviour: int) -> None:
        if not 0 <= behaviour <= 0xFF:
            raise ValueError(f"WORLD behaviour must be 0..255: {behaviour}")
        self._validate_coordinates(col, row)
        values = self.world_behaviours()
        if values[row][col] != behaviour:
            background = self._selected_background()
            if not isinstance(background.get("behaviour"), list):
                background["behaviour"] = values
            background["behaviour"][row][col] = behaviour
            self.dirty = True

    def _set_world_cell_field(self, col: int, row: int, field: str, value: int) -> None:
        self._validate_coordinates(col, row)
        cell = self._world_grid(self.state)[row][col]
        if not isinstance(cell, dict):
            raise ProjectFormatError(f"WORLD cell {col}, {row} is not an object")
        if int(cell.get(field, 0)) != value:
            cell[field] = value
            self.dirty = True

    @staticmethod
    def _validate_coordinates(col: int, row: int) -> None:
        if not 0 <= col < 32 or not 0 <= row < 30:
            raise IndexError(f"WORLD cell outside 32x30: {col}, {row}")
