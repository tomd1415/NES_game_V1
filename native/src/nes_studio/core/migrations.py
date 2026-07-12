"""Additive browser-compatible project migrations."""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass
from typing import Any

CURRENT_SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True)
class MigrationResult:
    state: dict[str, Any]
    applied: tuple[str, ...]


def migrate_project(source: dict[str, Any]) -> MigrationResult:
    state = copy.deepcopy(source)
    applied = []
    if not isinstance(state.get("version"), int):
        state["version"] = CURRENT_SCHEMA_VERSION
        applied.append("add-schema-version")

    backgrounds = state.get("backgrounds")
    legacy_nametable = state.get("nametable")
    if (not isinstance(backgrounds, list) or not backgrounds) and isinstance(
        legacy_nametable, list
    ):
        state["backgrounds"] = [
            {
                "name": "background",
                "nametable": copy.deepcopy(legacy_nametable),
            }
        ]
        backgrounds = state["backgrounds"]
        applied.append("wrap-legacy-nametable")

    if isinstance(backgrounds, list):
        for index, background in enumerate(backgrounds):
            if not isinstance(background, dict):
                continue
            grid = background.get("nametable")
            if not isinstance(background.get("dimensions"), dict) and isinstance(grid, list):
                rows = len(grid)
                columns = max(
                    (len(row) for row in grid if isinstance(row, list)), default=0
                )
                background["dimensions"] = {
                    "screens_x": max(1, math.ceil(columns / 32)),
                    "screens_y": max(1, math.ceil(rows / 30)),
                }
                applied.append(f"background-{index}-dimensions")
            if not isinstance(background.get("behaviour"), list) and isinstance(grid, list):
                background["behaviour"] = [
                    [0 for _ in range(len(row) if isinstance(row, list) else 0)]
                    for row in grid
                ]
                applied.append(f"background-{index}-behaviour")

    if not isinstance(state.get("selectedBgIdx"), int):
        state["selectedBgIdx"] = 0
        applied.append("add-selected-background")
    if isinstance(backgrounds, list) and backgrounds:
        selected = state["selectedBgIdx"]
        clamped = min(len(backgrounds) - 1, max(0, selected))
        if clamped != selected:
            state["selectedBgIdx"] = clamped
            applied.append("clamp-selected-background")

    legacy_tiles = state.get("tiles")
    if isinstance(legacy_tiles, list):
        if not isinstance(state.get("bg_tiles"), list):
            state["bg_tiles"] = copy.deepcopy(legacy_tiles)
            applied.append("copy-legacy-bg-tiles")
        if not isinstance(state.get("sprite_tiles"), list):
            state["sprite_tiles"] = copy.deepcopy(legacy_tiles)
            applied.append("copy-legacy-sprite-tiles")
    return MigrationResult(state, tuple(applied))
