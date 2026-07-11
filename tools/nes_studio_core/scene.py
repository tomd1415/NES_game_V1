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


def _hex_row(values: list[int]) -> str:
    return ", ".join(f"${value:02X}" for value in values)


def build_scene_asminc(
    state: dict[str, Any],
    player_index: int,
    scene_sprites: list[dict[str, Any]],
    start_x: int,
    start_y: int,
) -> str:
    sprites = state.get("sprites") or []
    if not sprites:
        raise ValueError("No sprites defined yet -- make at least one in the Sprites page.")
    if not 0 <= player_index < len(sprites):
        raise ValueError(
            f"playerSpriteIdx {player_index} out of range (0..{len(sprites) - 1})"
        )

    player = sprites[player_index]
    player_width = int(player["width"])
    player_height = int(player["height"])
    player_tiles, player_attributes = flatten_sprite(player)
    walk = resolve_animation(state, "walk", player_width, player_height)
    jump = resolve_animation(state, "jump", player_width, player_height)
    attack = resolve_animation(state, "attack", player_width, player_height)

    definitions = [
        f".define PLAYER_W {player_width}",
        f".define PLAYER_H {player_height}",
        f".define PLAYER_X {int(start_x) & 0xFF}",
        f".define PLAYER_Y {int(start_y) & 0xFF}",
    ]
    data = [
        f"player_tiles: .byte {_hex_row(player_tiles)}",
        f"player_attrs: .byte {_hex_row(player_attributes)}",
    ]

    animation_kinds = [("walk", walk), ("jump", jump)]
    if attack is not None:
        animation_kinds.append(("attack", attack))
    for kind, resolved in animation_kinds:
        if resolved is None:
            definitions += [
                f".define {kind.upper()}_FRAME_COUNT 0",
                f".define {kind.upper()}_FRAME_TICKS 0",
            ]
            data += [f"{kind}_tiles: .byte $00", f"{kind}_attrs: .byte $00"]
            continue
        frames, frames_per_second = resolved
        ticks = max(1, round(60 / frames_per_second))
        tiles: list[int] = []
        attributes: list[int] = []
        for frame in frames:
            frame_tiles, frame_attributes = flatten_sprite(frame)
            tiles += frame_tiles
            attributes += frame_attributes
        definitions += [
            f".define {kind.upper()}_FRAME_COUNT {len(frames)}",
            f".define {kind.upper()}_FRAME_TICKS {ticks}",
        ]
        data += [
            f"{kind}_tiles: .byte {_hex_row(tiles)}",
            f"{kind}_attrs: .byte {_hex_row(attributes)}",
        ]

    count = len(scene_sprites)
    definitions.append(f".define NUM_STATIC_SPRITES {count}")
    definitions += role_definitions(".define")
    if count == 0:
        data += [
            "ss_x:      .byte $00",
            "ss_y:      .byte $00",
            "ss_w:      .byte $00",
            "ss_h:      .byte $00",
            "ss_offset: .byte $00",
            "ss_tiles:  .byte $00",
            "ss_attrs:  .byte $00",
            "ss_role:   .byte $00",
            "ss_flying: .byte $00",
        ]
    else:
        world_width, world_height = world_bounds(state)
        xs: list[int] = []
        ys: list[int] = []
        widths: list[int] = []
        heights: list[int] = []
        offsets: list[int] = []
        roles: list[int] = []
        flying: list[int] = []
        tiles: list[int] = []
        attributes: list[int] = []
        for item in scene_sprites:
            sprite_index = int(item["spriteIdx"])
            if not 0 <= sprite_index < len(sprites):
                raise ValueError(f"scene sprite idx {sprite_index} out of range")
            sprite = sprites[sprite_index]
            width = int(sprite["width"])
            height = int(sprite["height"])
            x, y = sprite_position(item, world_width, world_height)
            xs.append(x & 0xFF)
            ys.append(y & 0xFF)
            widths.append(width)
            heights.append(height)
            offsets.append(len(tiles))
            roles.append(role_code(sprite))
            flying.append(1 if sprite.get("flying") else 0)
            sprite_tiles, sprite_attributes = flatten_sprite(sprite)
            tiles += sprite_tiles
            attributes += sprite_attributes
        data += [
            "ss_x:      .byte " + ", ".join(str(value) for value in xs),
            "ss_y:      .byte " + ", ".join(str(value) for value in ys),
            "ss_w:      .byte " + ", ".join(str(value) for value in widths),
            "ss_h:      .byte " + ", ".join(str(value) for value in heights),
            "ss_offset: .byte " + ", ".join(str(value) for value in offsets),
            f"ss_tiles:  .byte {_hex_row(tiles)}",
            f"ss_attrs:  .byte {_hex_row(attributes)}",
            "ss_role:   .byte " + ", ".join(str(value) for value in roles),
            "ss_flying: .byte " + ", ".join(str(value) for value in flying),
        ]

    lines = [
        "; generated by tools/playground_server.py - do not edit",
        ";",
        "; SCOPE: asm /play is the raw 6502 path -- single player, NO Builder",
        "; modules.  HUD, Player 2, dialogue, win-conditions, pickups, damage,",
        "; doors and scene AI are C-only (the Builder emits C).  This file gives",
        "; you the same identifiers the C scene.inc does (player_tiles,",
        "; player_attrs, NUM_STATIC_SPRITES, ss_x/ss_y/ss_w/ss_h/ss_role/...) so",
        "; the pedagogy carries across -- use the C language mode for the modules.",
    ]
    lines += definitions
    lines += ["", ".pushseg", '.segment "RODATA"']
    lines += data
    lines += [".popseg", ""]
    return "\n".join(lines)
