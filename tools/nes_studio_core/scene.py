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


def cell_tile(cell: dict[str, Any]) -> int:
    if cell.get("empty"):
        return 0
    return int(cell.get("tile", 0)) & 0xFF


def cell_attribute(cell: dict[str, Any]) -> int:
    if cell.get("empty"):
        return 0
    attribute = int(cell.get("palette", 0)) & 3
    if cell.get("priority"):
        attribute |= 0x20
    if cell.get("flipH"):
        attribute |= 0x40
    if cell.get("flipV"):
        attribute |= 0x80
    return attribute & 0xFF


def flatten_sprite(sprite: dict[str, Any]) -> tuple[list[int], list[int]]:
    width = int(sprite["width"])
    height = int(sprite["height"])
    cells = sprite["cells"]
    tiles = [cell_tile(cells[row][column]) for row in range(height) for column in range(width)]
    attributes = [
        cell_attribute(cells[row][column])
        for row in range(height)
        for column in range(width)
    ]
    return tiles, attributes


def resolve_animation(
    state: dict[str, Any], kind: str, width: int, height: int
) -> tuple[list[dict[str, Any]], int] | None:
    assignments = state.get("animation_assignments") or {}
    animation_id = assignments.get(kind)
    if animation_id is None:
        return None
    animations = state.get("animations") or []
    animation = next(
        (entry for entry in animations if entry.get("id") == animation_id), None
    )
    if not animation:
        return None
    frame_indices = animation.get("frames") or []
    if not frame_indices:
        return None
    sprites = state.get("sprites") or []
    frames = []
    for frame_index in frame_indices:
        if not 0 <= frame_index < len(sprites):
            continue
        sprite = sprites[frame_index]
        if int(sprite.get("width", 0)) == width and int(sprite.get("height", 0)) == height:
            frames.append(sprite)
    if not frames:
        return None
    frames_per_second = max(1, min(60, int(animation.get("fps", 8) or 8)))
    return frames, frames_per_second
