"""Additive browser-compatible project migrations."""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass
from typing import Any

CURRENT_SCHEMA_VERSION = 1
_ANIMATION_ROLES = {"player", "enemy", "pickup", "npc", "decoration", "any"}
_ANIMATION_STYLES = {"walk", "jump", "idle", "die", "attack", "custom"}


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
    _migrate_metatiles(state, applied)
    _migrate_animations(state, applied)
    _migrate_behaviour_slot_six(state, applied)
    _migrate_builder(state, applied)
    return MigrationResult(state, tuple(applied))


def _migrate_metatiles(state: dict[str, Any], applied: list[str]) -> None:
    for index, background in enumerate(state.get("backgrounds") or []):
        if not isinstance(background, dict):
            continue
        if background.get("tileMode") == "16x16":
            for field in ("metatiles", "mtmap"):
                if not isinstance(background.get(field), list):
                    background[field] = []
                    applied.append(f"background-{index}-{field}")
        elif "tileMode" in background and background.get("tileMode") != "8x8":
            background["tileMode"] = "8x8"
            applied.append(f"background-{index}-tile-mode")


def _migrate_animations(state: dict[str, Any], applied: list[str]) -> None:
    if not isinstance(state.get("animations"), list):
        state["animations"] = []
        applied.append("add-animations")
    assignments = state.get("animation_assignments")
    if not isinstance(assignments, dict):
        assignments = {"walk": None, "jump": None, "attack": None}
        state["animation_assignments"] = assignments
        applied.append("add-animation-assignments")
    elif "attack" not in assignments:
        assignments["attack"] = None
        applied.append("add-attack-assignment")
    next_id = state.get("nextAnimationId")
    next_id = next_id if isinstance(next_id, int) and next_id >= 1 else 1
    for animation in state["animations"]:
        if not isinstance(animation, dict):
            continue
        if not isinstance(animation.get("id"), int):
            animation["id"] = next_id
            next_id += 1
        else:
            next_id = max(next_id, animation["id"] + 1)
        if animation.get("role") not in _ANIMATION_ROLES:
            animation["role"] = "player"
        if animation.get("style") not in _ANIMATION_STYLES:
            animation["style"] = "custom"
        if not isinstance(animation.get("frames"), list):
            animation["frames"] = []
        animation["frames"] = [int(frame) for frame in animation["frames"] if isinstance(frame, (int, float)) and frame >= 0]
        fps = animation.get("fps")
        animation["fps"] = max(1, min(60, int(fps) if isinstance(fps, (int, float)) else 8))
    if state.get("nextAnimationId") != next_id:
        state["nextAnimationId"] = next_id
        applied.append("normalize-animation-ids")
    valid_ids = {animation.get("id") for animation in state["animations"] if isinstance(animation, dict)}
    for kind in ("walk", "jump", "attack"):
        if assignments.get(kind) not in valid_ids:
            assignments[kind] = None


def _migrate_behaviour_slot_six(state: dict[str, Any], applied: list[str]) -> None:
    types = state.get("behaviour_types")
    if not isinstance(types, list):
        return
    six = next((item for item in types if isinstance(item, dict) and item.get("id") == 6), None)
    if not six or six.get("builtin"):
        return
    name = str(six.get("name") or "").strip()
    seven = next((item for item in types if isinstance(item, dict) and item.get("id") == 7), None)
    seven_unused = not seven or (not seven.get("builtin") and not str(seven.get("name") or "").strip())
    state["behaviour_types"] = [item for item in types if not isinstance(item, dict) or item.get("id") not in ({6, 7} if seven_unused else {6})]
    if not name or not seven_unused:
        applied.append("drop-legacy-behaviour-slot-6")
        return
    state["behaviour_types"].append({"id": 7, "name": name, "colour": six.get("colour") or "#33dddd", "builtin": False})
    for background in state.get("backgrounds") or []:
        for row in background.get("behaviour") or [] if isinstance(background, dict) else []:
            if isinstance(row, list):
                row[:] = [7 if value == 6 else value for value in row]
    for reactions in state.get("behaviour_reactions") or []:
        if isinstance(reactions, dict) and "6" in reactions:
            reactions["7"] = reactions.pop("6")
    applied.append("relocate-legacy-behaviour-slot-6")


def _migrate_builder(state: dict[str, Any], applied: list[str]) -> None:
    builder = state.get("builder")
    if isinstance(builder, dict) and builder.get("version") == 1:
        return
    game_type = "topdown" if state.get("template") == "topdown" else "platformer"
    state["builder"] = {
        "version": 1,
        "modules": {
            "game": {"enabled": True, "config": {"type": game_type}},
            "players": {
                "enabled": True,
                "config": {"count": 1},
                "submodules": {
                    "player1": {"enabled": True, "config": {"startX": 60, "startY": 120, "walkSpeed": 1, "jumpHeight": 20, "maxHp": 0}},
                    "player2": {"enabled": False, "config": {"startX": 180, "startY": 120, "walkSpeed": 1, "jumpHeight": 20, "maxHp": 0}},
                },
            },
        },
    }
    applied.append("replace-legacy-builder")
