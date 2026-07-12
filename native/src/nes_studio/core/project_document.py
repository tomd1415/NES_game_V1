"""Canonical JSON-compatible project document for the native client."""

from __future__ import annotations

import copy
import json
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .migrations import CURRENT_SCHEMA_VERSION, migrate_project


class ProjectFormatError(ValueError):
    """Raised when a project cannot provide an editable WORLD grid."""


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    path: str
    message: str
    severity: str = "error"


@dataclass(frozen=True, slots=True)
class ProjectSnapshot:
    json_bytes: bytes
    sha256: str
    engine_version: int

    @classmethod
    def from_state(cls, state: dict[str, Any]) -> "ProjectSnapshot":
        payload = _json_bytes(state)
        return cls(
            payload,
            hashlib.sha256(payload).hexdigest(),
            max(1, int(state.get("engineVersion") or 1)),
        )

    def state(self) -> dict[str, Any]:
        return json.loads(self.json_bytes)


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
                "version": CURRENT_SCHEMA_VERSION,
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
        migration = migrate_project(state)
        issues = cls.validate(migration.state)
        errors = [issue for issue in issues if issue.severity == "error"]
        if errors:
            first = errors[0]
            raise ProjectFormatError(f"{first.path}: {first.message}")
        return cls(state=migration.state, path=path)

    @classmethod
    def open(cls, path: str | Path) -> "ProjectDocument":
        project_path = Path(path)
        return cls.from_json(project_path.read_bytes(), project_path)

    def to_json(self) -> bytes:
        return _json_bytes(self.state)

    @property
    def name(self) -> str:
        return str(self.state.get("name") or "Untitled")

    @property
    def selected_background_index(self) -> int:
        return int(self.state.get("selectedBgIdx", 0))

    def background_names(self) -> list[str]:
        backgrounds = self.state.get("backgrounds") or []
        return [
            str(background.get("name") or f"Room {index + 1}")
            if isinstance(background, dict)
            else f"Room {index + 1}"
            for index, background in enumerate(backgrounds)
        ]

    def world_grid_options(self) -> tuple[bool, bool]:
        native_ui = self.state.get("nativeUi")
        world = native_ui.get("world") if isinstance(native_ui, dict) else None
        return (
            bool(world.get("showGrid", True)) if isinstance(world, dict) else True,
            bool(world.get("showAttributes", True)) if isinstance(world, dict) else True,
        )

    def set_world_grid_options(self, *, show_grid: bool, show_attributes: bool) -> None:
        native_ui = self.state.setdefault("nativeUi", {})
        if not isinstance(native_ui, dict):
            native_ui = {}
            self.state["nativeUi"] = native_ui
        world = native_ui.setdefault("world", {})
        if not isinstance(world, dict):
            world = {}
            native_ui["world"] = world
        value = {"showGrid": bool(show_grid), "showAttributes": bool(show_attributes)}
        if world != value:
            world.clear()
            world.update(value)
            self.dirty = True

    def select_background(self, index: int) -> None:
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        candidate = copy.deepcopy(self.state)
        candidate["selectedBgIdx"] = index
        self._world_grid(candidate)
        if self.selected_background_index != index:
            self.state["selectedBgIdx"] = index
            self.dirty = True

    def add_background(self, name: str, *, duplicate_selected: bool = False) -> int:
        """Add a blank room or a deep copy of the selected room and select it."""

        normalized = name.strip()
        if not normalized:
            raise ValueError("Background name cannot be empty")
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list):
            raise ProjectFormatError("Project has no editable backgrounds")
        if duplicate_selected:
            background = copy.deepcopy(self._selected_background())
            background["name"] = normalized
        else:
            background = {
                "name": normalized,
                "dimensions": {"screens_x": 1, "screens_y": 1},
                "nametable": [
                    [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
                ],
                "behaviour": [[0 for _ in range(32)] for _ in range(30)],
            }
        backgrounds.append(background)
        self.state["selectedBgIdx"] = len(backgrounds) - 1
        self.dirty = True
        return len(backgrounds) - 1

    def rename_background(self, index: int, name: str) -> None:
        normalized = name.strip()
        if not normalized:
            raise ValueError("Background name cannot be empty")
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        background = backgrounds[index]
        if not isinstance(background, dict):
            raise ProjectFormatError("Selected background is not an object")
        if background.get("name") != normalized:
            background["name"] = normalized
            self.dirty = True

    def delete_background(self, index: int) -> None:
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        if len(backgrounds) == 1:
            raise ValueError("A project must keep at least one background")
        del backgrounds[index]
        selected = self.selected_background_index
        self.state["selectedBgIdx"] = min(selected - (1 if index < selected else 0), len(backgrounds) - 1)
        self.dirty = True

    def background_dimensions(self, index: int | None = None) -> tuple[int, int]:
        background = self._background_at(self.selected_background_index if index is None else index)
        dimensions = background.get("dimensions")
        if not isinstance(dimensions, dict):
            raise ProjectFormatError("Background has no dimensions")
        try:
            return int(dimensions["screens_x"]), int(dimensions["screens_y"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ProjectFormatError("Background dimensions are invalid") from exc

    def set_background_dimensions(self, screens_x: int, screens_y: int) -> None:
        if (screens_x, screens_y) not in {(1, 1), (2, 1), (1, 2), (2, 2)}:
            raise ValueError("WORLD layout must be 1×1, 2×1, 1×2, or 2×2")
        background = self._selected_background()
        old_x, old_y = self.background_dimensions()
        if (old_x, old_y) == (screens_x, screens_y):
            return
        columns, rows = screens_x * 32, screens_y * 30
        old_grid = background.get("nametable") if isinstance(background.get("nametable"), list) else []
        old_behaviour = background.get("behaviour") if isinstance(background.get("behaviour"), list) else []
        background["nametable"] = [
            [
                copy.deepcopy(old_grid[row][col])
                if row < len(old_grid) and isinstance(old_grid[row], list) and col < len(old_grid[row]) and isinstance(old_grid[row][col], dict)
                else {"tile": 0, "palette": 0}
                for col in range(columns)
            ]
            for row in range(rows)
        ]
        background["behaviour"] = [
            [
                int(old_behaviour[row][col]) & 0xFF
                if row < len(old_behaviour) and isinstance(old_behaviour[row], list) and col < len(old_behaviour[row])
                else 0
                for col in range(columns)
            ]
            for row in range(rows)
        ]
        background["dimensions"] = {"screens_x": screens_x, "screens_y": screens_y}
        self.dirty = True

    def snapshot(self) -> dict[str, Any]:
        return copy.deepcopy(self.state)

    def immutable_snapshot(self) -> ProjectSnapshot:
        return ProjectSnapshot.from_state(self.state)

    @property
    def engine_version(self) -> int:
        return max(1, int(self.state.get("engineVersion") or 1))

    def set_engine_version(
        self, version: int, *, current: int, allow_downgrade: bool = False
    ) -> None:
        if not 1 <= version <= current:
            raise ValueError(f"Engine version must be 1..{current}: {version}")
        if version < self.engine_version and not allow_downgrade:
            raise ValueError("Engine downgrade requires explicit confirmation")
        if version != self.engine_version:
            self.state["engineVersion"] = version
            self.dirty = True

    @classmethod
    def validate(cls, state: dict[str, Any]) -> tuple[ValidationIssue, ...]:
        issues = []
        version = state.get("version")
        if not isinstance(version, int) or version < 1:
            issues.append(ValidationIssue("version", "must be a positive integer"))
        elif version > CURRENT_SCHEMA_VERSION:
            issues.append(
                ValidationIssue(
                    "version",
                    f"future schema {version} is preserved but only schema {CURRENT_SCHEMA_VERSION} is understood",
                    "warning",
                )
            )
        backgrounds = state.get("backgrounds")
        if not isinstance(backgrounds, list) or not backgrounds:
            issues.append(ValidationIssue("backgrounds", "must contain at least one background"))
            return tuple(issues)
        selected = state.get("selectedBgIdx")
        if not isinstance(selected, int) or not 0 <= selected < len(backgrounds):
            issues.append(ValidationIssue("selectedBgIdx", "is outside the background list"))
        for bg_index, background in enumerate(backgrounds):
            prefix = f"backgrounds[{bg_index}]"
            if not isinstance(background, dict):
                issues.append(ValidationIssue(prefix, "must be an object"))
                continue
            dimensions = background.get("dimensions")
            if not isinstance(dimensions, dict):
                issues.append(ValidationIssue(prefix + ".dimensions", "must be an object"))
                continue
            try:
                screens_x = int(dimensions.get("screens_x"))
                screens_y = int(dimensions.get("screens_y"))
            except (TypeError, ValueError):
                screens_x = screens_y = 0
            if screens_x < 1 or screens_y < 1:
                issues.append(ValidationIssue(prefix + ".dimensions", "screen counts must be positive"))
                continue
            required_columns, required_rows = screens_x * 32, screens_y * 30
            grid = background.get("nametable")
            if not isinstance(grid, list) or len(grid) < required_rows:
                issues.append(ValidationIssue(prefix + ".nametable", f"needs {required_rows} rows"))
                continue
            for row_index, row in enumerate(grid[:required_rows]):
                if not isinstance(row, list) or len(row) < required_columns:
                    issues.append(
                        ValidationIssue(
                            f"{prefix}.nametable[{row_index}]",
                            f"needs {required_columns} columns",
                        )
                    )
                    continue
                for column, cell in enumerate(row[:required_columns]):
                    if not isinstance(cell, dict):
                        issues.append(
                            ValidationIssue(
                                f"{prefix}.nametable[{row_index}][{column}]",
                                "must be an object",
                            )
                        )
                        continue
                    try:
                        tile, palette = int(cell.get("tile", 0)), int(cell.get("palette", 0))
                    except (TypeError, ValueError):
                        tile = palette = -1
                    if not 0 <= tile <= 255:
                        issues.append(ValidationIssue(f"{prefix}.nametable[{row_index}][{column}].tile", "must be 0..255"))
                    if not 0 <= palette <= 3:
                        issues.append(ValidationIssue(f"{prefix}.nametable[{row_index}][{column}].palette", "must be 0..3"))
        return tuple(issues)

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

    def world_tiles(self, screen_x: int = 0, screen_y: int = 0) -> list[list[int]]:
        grid = self._world_grid(self.state)
        left, top = self._screen_origin(screen_x, screen_y)
        return [
            [int(cell.get("tile", 0)) for cell in row[left : left + 32]]
            for row in grid[top : top + 30]
        ]

    def world_palettes(self, screen_x: int = 0, screen_y: int = 0) -> list[list[int]]:
        grid = self._world_grid(self.state)
        left, top = self._screen_origin(screen_x, screen_y)
        return [
            [int(cell.get("palette", 0)) & 3 for cell in row[left : left + 32]]
            for row in grid[top : top + 30]
        ]

    def world_behaviours(self, screen_x: int = 0, screen_y: int = 0) -> list[list[int]]:
        background = self._selected_background()
        behaviour = background.get("behaviour")
        if not isinstance(behaviour, list):
            return [[0 for _ in range(32)] for _ in range(30)]
        if len(behaviour) < 30 or any(
            not isinstance(row, list) or len(row) < 32 for row in behaviour[:30]
        ):
            raise ProjectFormatError("Selected background has no 32 by 30 behaviour map")
        left, top = self._screen_origin(screen_x, screen_y)
        return [
            [int(value) & 0xFF for value in row[left : left + 32]]
            for row in behaviour[top : top + 30]
        ]

    def _selected_background(self) -> dict[str, Any]:
        return self._background_at(self.selected_background_index)

    def _background_at(self, index: int) -> dict[str, Any]:
        backgrounds = self.state.get("backgrounds")
        if not isinstance(backgrounds, list) or not 0 <= index < len(backgrounds):
            raise IndexError(f"Background index outside project: {index}")
        background = backgrounds[index]
        if not isinstance(background, dict):
            raise ProjectFormatError("Selected background is not an object")
        return background

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
        background = self._selected_background()
        values = background.get("behaviour")
        if not isinstance(values, list):
            screens_x, screens_y = self.background_dimensions()
            values = [[0 for _ in range(screens_x * 32)] for _ in range(screens_y * 30)]
            background["behaviour"] = values
        if int(values[row][col]) != behaviour:
            values[row][col] = behaviour
            self.dirty = True

    def _set_world_cell_field(self, col: int, row: int, field: str, value: int) -> None:
        self._validate_coordinates(col, row)
        cell = self._world_grid(self.state)[row][col]
        if not isinstance(cell, dict):
            raise ProjectFormatError(f"WORLD cell {col}, {row} is not an object")
        if int(cell.get(field, 0)) != value:
            cell[field] = value
            self.dirty = True

    def _screen_origin(self, screen_x: int, screen_y: int) -> tuple[int, int]:
        columns, rows = self.background_dimensions()
        if not 0 <= screen_x < columns or not 0 <= screen_y < rows:
            raise IndexError(f"WORLD screen outside {columns}x{rows}: {screen_x}, {screen_y}")
        return screen_x * 32, screen_y * 30

    def _validate_coordinates(self, col: int, row: int) -> None:
        screens_x, screens_y = self.background_dimensions()
        if not 0 <= col < screens_x * 32 or not 0 <= row < screens_y * 30:
            raise IndexError(f"WORLD cell outside {screens_x * 32}x{screens_y * 30}: {col}, {row}")


def _json_bytes(state: dict[str, Any]) -> bytes:
    return (json.dumps(state, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
