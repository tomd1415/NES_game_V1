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
        grid = backgrounds[index].get("nametable")
        if not isinstance(grid, list) or len(grid) < 30:
            raise ProjectFormatError("Selected background has no 30-row nametable")
        if any(not isinstance(row, list) or len(row) < 32 for row in grid[:30]):
            raise ProjectFormatError("Selected background has no 32-column nametable")
        return grid

    def world_tiles(self) -> list[list[int]]:
        grid = self._world_grid(self.state)
        return [[int(cell.get("tile", 0)) for cell in row[:32]] for row in grid[:30]]

    def set_world_tile(self, col: int, row: int, tile: int) -> None:
        if not 0 <= col < 32 or not 0 <= row < 30:
            raise IndexError(f"WORLD cell outside 32x30: {col}, {row}")
        grid = self._world_grid(self.state)
        cell = grid[row][col]
        if not isinstance(cell, dict):
            raise ProjectFormatError(f"WORLD cell {col}, {row} is not an object")
        if int(cell.get("tile", 0)) != tile:
            cell["tile"] = tile
            self.dirty = True

