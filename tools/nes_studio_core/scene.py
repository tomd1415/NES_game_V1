"""Pure shared scene-model transformations for C and ca65 emitters."""

from __future__ import annotations

from typing import Any

ROLE_TABLE = [
    ("PLAYER", 0),
    ("NPC", 1),
    ("ENEMY", 2),
    ("ITEM", 3),
    ("TOOL", 4),
    ("POWERUP", 5),
    ("PICKUP", 6),
    ("PROJECTILE", 7),
    ("DECORATION", 8),
    ("OTHER", 9),
    ("HUD", 10),
]
ROLE_CODES = {name.lower(): code for name, code in ROLE_TABLE}
ROLE_TOKEN_WIDTH = max(len("ROLE_" + name) for name, _ in ROLE_TABLE)


def role_definitions(directive: str) -> list[str]:
    return [
        f"{directive} {('ROLE_' + name).ljust(ROLE_TOKEN_WIDTH)} {code}"
        for name, code in ROLE_TABLE
    ]


def role_code(sprite: dict[str, Any]) -> int:
    role = str(sprite.get("role") or "other").lower()
    return ROLE_CODES.get(role, ROLE_CODES["other"])


def world_bounds(state: dict[str, Any]) -> tuple[int, int]:
    backgrounds = state.get("backgrounds") or []
    background: dict[str, Any] = {}
    if isinstance(backgrounds, list) and backgrounds:
        index = state.get("selectedBgIdx", 0) or 0
        if not isinstance(index, int) or not 0 <= index < len(backgrounds):
            index = 0
        candidate = backgrounds[index]
        if isinstance(candidate, dict):
            background = candidate
    dimensions = background.get("dimensions") or {}
    world_width = (int(dimensions.get("screens_x", 1)) or 1) * 256
    world_height = (int(dimensions.get("screens_y", 1)) or 1) * 240
    return world_width, world_height


def sprite_position(
    item: dict[str, Any], world_width: int, world_height: int
) -> tuple[int, int]:
    x = max(0, min(world_width - 1, int(item.get("x", 0))))
    y = max(0, min(world_height - 1, int(item.get("y", 0))))
    return x, y
