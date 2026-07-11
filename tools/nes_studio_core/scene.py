"""Pure shared scene-model transformations for C and ca65 emitters."""

from __future__ import annotations

from typing import Any

from .graphics import SCREEN_COLS, SCREEN_ROWS, nametable_bytes

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


def _as_sprite_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def _spawn_trigger_index(state: dict[str, Any]) -> int | None:
    try:
        modules = (state.get("builder") or {}).get("modules") or {}
    except AttributeError:
        return None
    spawn = modules.get("spawn") or {}
    if not spawn.get("enabled"):
        return None
    return _as_sprite_int((spawn.get("config") or {}).get("spriteIdx", -1))


def _spawn_hit_index(state: dict[str, Any]) -> int | None:
    try:
        modules = (state.get("builder") or {}).get("modules") or {}
    except AttributeError:
        return None
    damage = modules.get("damage") or {}
    config = damage.get("config") or {}
    if not (damage.get("enabled") and config.get("spawnOnHit")):
        return None
    return _as_sprite_int(config.get("spawnSpriteIdx", -1))


def _spawn_art_one(sprites: list[dict[str, Any]], index: int, suffix: str) -> list[str]:
    if not 0 <= index < len(sprites):
        return []
    sprite = sprites[index]
    width = int(sprite.get("width", 0) or 0)
    height = int(sprite.get("height", 0) or 0)
    if width < 1 or height < 1:
        return []
    tiles, attributes = flatten_sprite(sprite)
    return [
        "",
        f"#define SPAWN{suffix}_W {width}",
        f"#define SPAWN{suffix}_H {height}",
        f"static const unsigned char SPAWN{suffix}_TILES[{width * height}] = {{",
        "    " + ", ".join(f"0x{tile:02X}" for tile in tiles),
        "};",
        f"static const unsigned char SPAWN{suffix}_ATTRS[{width * height}] = {{",
        "    " + ", ".join(f"0x{attribute:02X}" for attribute in attributes),
        "};",
        "",
    ]


def _spawn_art_lines(state: dict[str, Any], sprites: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    trigger_index = _spawn_trigger_index(state)
    if trigger_index is not None:
        lines += _spawn_art_one(sprites, trigger_index, "0")
    hit_index = _spawn_hit_index(state)
    if hit_index is not None:
        lines += _spawn_art_one(sprites, hit_index, "1")
    return lines


def _resolve_tagged_animation(
    state: dict[str, Any], role: str, style: str
) -> tuple[list[dict[str, Any]], int, int, int] | None:
    animations = state.get("animations") or []
    sprites = state.get("sprites") or []
    animation = next((entry for entry in animations if (entry.get("role") or "") == role and (entry.get("style") or "") == style), None)
    if not animation:
        return None
    frames = [sprites[index] for index in animation.get("frames") or [] if 0 <= index < len(sprites)]
    if not frames:
        return None
    width = int(frames[0].get("width", 0))
    height = int(frames[0].get("height", 0))
    frames = [sprite for sprite in frames if int(sprite.get("width", 0)) == width and int(sprite.get("height", 0)) == height]
    if not frames:
        return None
    frames_per_second = max(1, min(60, int(animation.get("fps", 8) or 8)))
    return frames, frames_per_second, width, height


def selected_bg_idx_safe(state: dict[str, Any]) -> int:
    backgrounds = state.get("backgrounds")
    if not isinstance(backgrounds, list) or not backgrounds:
        return 0
    index = state.get("selectedBgIdx", 0) or 0
    if not isinstance(index, int) or not 0 <= index < len(backgrounds):
        return 0
    return index


cell_attr = cell_attribute
_flatten_sprite = flatten_sprite
_resolve_animation = resolve_animation
_role_code = role_code
_role_defs = role_definitions
_scene_sprite_xy = sprite_position
_scene_world_bounds = world_bounds
_nametable_bytes_for = nametable_bytes


def build_scene_inc(state, player_idx, scene_sprites, start_x, start_y,
                    player_idx2=-1, start_x2=180, start_y2=120):
    sprites = state.get("sprites") or []
    if not sprites:
        raise ValueError("No sprites defined yet -- make at least one in the Sprites page.")
    if not (0 <= player_idx < len(sprites)):
        raise ValueError(f"playerSpriteIdx {player_idx} out of range (0..{len(sprites)-1})")
    # Validate the optional P2 pointer so a malformed payload can't sneak
    # an out-of-range index through to the scene.inc writer.  -1 means
    # "single-player build" and is always accepted.
    p2_active = (player_idx2 is not None and player_idx2 >= 0
                 and player_idx2 != player_idx
                 and player_idx2 < len(sprites))

    lines = [
        "// generated by tools/playground_server.py - do not edit",
        "#ifndef SCENE_INC",
        "#define SCENE_INC",
        "",
        "// Role codes — match enemy/npc/tool/... logic in your snippets.",
        "// ss_role[i] is the role of scene sprite i (see below).",
        *_role_defs("#define"),   # T7.6a: shared ROLE_TABLE source
        "",
        # Linkage for the scene-sprite arrays the draw loop reads. Normally
        # `static` (byte-identical as always); when the scene-draw ASM module
        # is built (NES_ASM_SCENE) they must be linker-visible so scene_asm.s
        # can import them. Flag-off is byte-for-byte unchanged.
        "#if defined(NES_ASM_SCENE) || defined(NES_ASM_AI)",
        "#define SS_LINKAGE",
        "#else",
        "#define SS_LINKAGE static",
        "#endif",
        "",
    ]

    # --- Player -----------------------------------------------------------
    ps = sprites[player_idx]
    pw = int(ps["width"])
    ph = int(ps["height"])
    cells = ps["cells"]
    p_tiles = [cell_tile(cells[r][c]) for r in range(ph) for c in range(pw)]
    p_attrs = [cell_attr(cells[r][c]) for r in range(ph) for c in range(pw)]

    # Resolve walk / jump animations (if any). All frames must share the
    # player sprite's (pw, ph) so the C loop has a fixed tile count.
    walk = _resolve_animation(state, "walk", pw, ph)
    jump = _resolve_animation(state, "jump", pw, ph)
    attack = _resolve_animation(state, "attack", pw, ph)   # R-7 attack animation

    lines += [
        f"#define PLAYER_W {pw}",
        f"#define PLAYER_H {ph}",
        f"#define PLAYER_X {int(start_x) & 0xFF}",
        f"#define PLAYER_Y {int(start_y) & 0xFF}",
        "",
        f"static const unsigned char player_tiles[{pw*ph}] = {{",
        "    " + ", ".join(f"0x{t:02X}" for t in p_tiles),
        "};",
        f"static const unsigned char player_attrs[{pw*ph}] = {{",
        "    " + ", ".join(f"0x{a:02X}" for a in p_attrs),
        "};",
        "",
    ]

    # E3-3: racer auto-rotated car frames (only emitted when _inject_racer_rotation
    # baked them, i.e. a racer game with CHR room).  The engine selects a frame
    # from racer_heading; BW_RACER_ROT gates the whole feature off otherwise, so
    # non-racer ROMs are byte-identical.
    rot = state.get("_racer_rot")
    if rot and rot.get("tiles"):
        rt, ra = rot["tiles"], rot["attrs"]
        lines += [
            "#define BW_RACER_ROT 1",
            f"#define RACER_ROT_FRAMES {rot['frames']}",
            f"static const unsigned char car_rot_tiles[{len(rt)}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in rt),
            "};",
            f"static const unsigned char car_rot_attrs[{len(ra)}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in ra),
            "};",
            "",
        ]
    digs = state.get("_racer_digits")
    if digs and len(digs) == 10:
        lines += [
            "#define BW_RACER_HUD 1",
            f"static const unsigned char racer_digit_tiles[10] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in digs),
            "};",
            "",
        ]

    # R-3/R-6 spawn-pool art (only when a spawn/damage-on-hit sprite is chosen,
    # so a no-spawn ROM stays byte-identical).  BR-04/BR-05 model B: validate the
    # trigger and hit effects independently and fail here with a clear message
    # naming the bad index, instead of letting cc65 choke on undefined SPAWN*_*.
    def _need_sprite(idx, what):
        if idx is not None and not (0 <= idx < len(sprites)):
            raise ValueError(
                f"{what} points at sprite #{idx}, which does not exist (this "
                f"project has {len(sprites)} sprite(s), numbered "
                f"0..{len(sprites) - 1}). Pick an existing sprite, or draw it "
                f"on the Sprites page.")
    _need_sprite(_spawn_trigger_index(state), "The Spawn effect")
    _need_sprite(_spawn_hit_index(state), "The Damage hit effect")
    lines += _spawn_art_lines(state, sprites)

    # --- Player 2 (optional, Phase B chunk 5) ---------------------------
    # Always emit PLAYER2_ENABLED so the template's #if gate compiles
    # cleanly regardless of single- vs two-player.  When enabled we also
    # emit PLAYER2_X/Y/W/H and the tile+attr tables drawn from the
    # second sprite tagged Player.
    if p2_active:
        ps2 = sprites[player_idx2]
        pw2 = int(ps2["width"])
        ph2 = int(ps2["height"])
        cells2 = ps2["cells"]
        p2_tiles = [cell_tile(cells2[r][c]) for r in range(ph2) for c in range(pw2)]
        p2_attrs = [cell_attr(cells2[r][c]) for r in range(ph2) for c in range(pw2)]
        lines += [
            "#define PLAYER2_ENABLED 1",
            f"#define PLAYER2_W {pw2}",
            f"#define PLAYER2_H {ph2}",
            f"#define PLAYER2_X {int(start_x2) & 0xFF}",
            f"#define PLAYER2_Y {int(start_y2) & 0xFF}",
            "",
            # Linkage for the P2 tile/attr arrays the P2 draw loop reads. Normally
            # `static` (byte-identical); when the P1/P2 draw ASM is built
            # (NES_ASM_PDRAW) they must be linker-visible so pdraw_asm.s's
            # draw_player2 can import them. Flag-off is byte-for-byte unchanged.
            "#if defined(NES_ASM_PDRAW)",
            "#define P2_LINKAGE",
            "#else",
            "#define P2_LINKAGE static",
            "#endif",
            f"P2_LINKAGE const unsigned char player2_tiles[{pw2*ph2}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in p2_tiles),
            "};",
            f"P2_LINKAGE const unsigned char player2_attrs[{pw2*ph2}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in p2_attrs),
            "};",
            "",
        ]
    else:
        # P2 inactive: stub so any stray reference of PLAYER2_ENABLED
        # in pupil code resolves to 0.  Empty arrays would fail cc65,
        # so the tile / attr tables are simply not emitted.
        lines += [
            "#define PLAYER2_ENABLED 0",
            "",
        ]

    # --- Walk / Jump animation tables ------------------------------------
    # For each assigned animation, emit:
    #   <kind>_frame_count, <kind>_frame_ticks (vblanks between frame advances),
    #   <kind>_tiles[N*W*H] and <kind>_attrs[N*W*H].
    # If an animation isn't set, emit a count of 0 and a 1-element stub
    # (cc65 rejects zero-length arrays); main.c's "if count > 0" gate
    # keeps the stubs unread.
    # R-7: emit the attack tables ONLY when an attack animation is assigned.
    # walk/jump always emit a {0} placeholder (the engine references them
    # unconditionally), but the attack code is fully #if-gated, so omitting the
    # attack arrays when unused keeps a no-attack ROM byte-identical (cc65 emits
    # even unreferenced const arrays, so an always-present placeholder would
    # shift the baseline).
    _anim_kinds = [("walk", walk), ("jump", jump)]
    if attack is not None:
        _anim_kinds.append(("attack", attack))
    for kind, resolved in _anim_kinds:
        if resolved is None:
            lines += [
                f"#define {kind.upper()}_FRAME_COUNT 0",
                f"#define {kind.upper()}_FRAME_TICKS 0",
                f"static const unsigned char {kind}_tiles[1] = {{ 0 }};",
                f"static const unsigned char {kind}_attrs[1] = {{ 0 }};",
                "",
            ]
            continue
        frames, fps = resolved
        ticks = max(1, round(60 / fps))
        flat_tiles = []
        flat_attrs = []
        for sp in frames:
            t, a = _flatten_sprite(sp)
            flat_tiles += t
            flat_attrs += a
        lines += [
            f"#define {kind.upper()}_FRAME_COUNT {len(frames)}",
            f"#define {kind.upper()}_FRAME_TICKS {ticks}",
            f"static const unsigned char {kind}_tiles[{len(flat_tiles)}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in flat_tiles),
            "};",
            f"static const unsigned char {kind}_attrs[{len(flat_attrs)}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in flat_attrs),
            "};",
            "",
        ]

    # --- HUD icon (Phase B finale chunk A) -------------------------------
    # First sprite tagged `hud` on the Sprites page becomes the heart
    # icon used by the HP/HUD module.  No tagged HUD sprite → emit the
    # HUD_ENABLED = 0 stub so the template's #if gates compile clean.
    hud_sprite = next((sp for sp in sprites if (sp.get("role") or "").lower() == "hud"), None)
    if hud_sprite is not None:
        hw = int(hud_sprite["width"])
        hh = int(hud_sprite["height"])
        hcells = hud_sprite["cells"]
        hud_tiles = [cell_tile(hcells[r][c]) for r in range(hh) for c in range(hw)]
        hud_attrs = [cell_attr(hcells[r][c]) for r in range(hh) for c in range(hw)]
        lines += [
            "#define HUD_ENABLED 1",
            f"#define HUD_W {hw}",
            f"#define HUD_H {hh}",
            "",
            f"static const unsigned char hud_tiles[{hw*hh}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in hud_tiles),
            "};",
            f"static const unsigned char hud_attrs[{hw*hh}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in hud_attrs),
            "};",
            "",
        ]
    else:
        lines += ["#define HUD_ENABLED 0", ""]

    # --- Tagged scene animations (Phase B finale chunk B) -----------
    # For each (role, style) pair the template cares about, look for
    # an animation tagged that way on the Sprites page.  If one
    # exists and all its frames share a single (W, H), emit the frame
    # table plus the count/ticks/W/H defines.  The template gates on
    # `ANIM_<ROLE>_<STYLE>_COUNT > 0` so absent pairs cost nothing.
    # Chunk B shipped enemy+walk.  Phase B+ round 1b/1c extends to
    # player2+walk, enemy+idle, and pickup+idle.  Future rounds can
    # drop npc+walk / npc+idle in alongside dialogue; the loop below
    # makes each pair mechanical to add.
    anim_targets = [
        ("enemy",   "walk"),
        ("enemy",   "idle"),
        ("pickup",  "idle"),
        ("player2", "walk"),
        # Phase 3.4 — finishes the P1/P2 animation symmetry.  P2 walk
        # already wires through above; jump now picks up the same
        # `role=player2, style=jump` tagged animation and the
        # template's per-frame render switches to it while jumping2 is
        # active.  Gated by `ANIM_PLAYER2_JUMP_COUNT > 0` so projects
        # without a tagged P2 jump animation pay nothing.
        ("player2", "jump"),
    ]
    for role, style in anim_targets:
        token = f"{role.upper()}_{style.upper()}"
        resolved = _resolve_tagged_animation(state, role, style)
        if resolved is None:
            lines.append(f"#define ANIM_{token}_COUNT 0")
            lines.append("")
            continue
        frames, fps, aw, ah = resolved
        ticks = max(1, round(60 / fps))
        flat_t, flat_a = [], []
        for sp in frames:
            t, a = _flatten_sprite(sp)
            flat_t += t
            flat_a += a
        lines += [
            f"#define ANIM_{token}_COUNT {len(frames)}",
            f"#define ANIM_{token}_TICKS {ticks}",
            f"#define ANIM_{token}_W {aw}",
            f"#define ANIM_{token}_H {ah}",
            f"static const unsigned char anim_{role}_{style}_tiles[{len(flat_t)}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in flat_t),
            "};",
            f"static const unsigned char anim_{role}_{style}_attrs[{len(flat_a)}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in flat_a),
            "};",
            "",
        ]

    # --- Static sprites --------------------------------------------------
    n = len(scene_sprites)
    lines.append(f"#define NUM_STATIC_SPRITES {n}")

    if n == 0:
        # cc65 rejects zero-length arrays -- keep a 1-element stub that's
        # never accessed because NUM_STATIC_SPRITES gates the loop.
        # ss_x / ss_y are non-const so movement snippets can write to them.
        stub = (
            "SS_LINKAGE unsigned char ss_x[1]            = { 0 };\n"
            "SS_LINKAGE unsigned char ss_y[1]            = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_w[1]      = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_h[1]      = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_offset[1] = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_tiles[1]  = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_attrs[1]  = { 0 };\n"
            "static const unsigned char ss_role[1]   = { 0 };\n"
            "static const unsigned char ss_flying[1] = { 0 };\n"
            "static unsigned char ss_anim_frame[1]   = { 0 };\n"
            "static unsigned char ss_anim_tick[1]    = { 0 };"
        )
        lines.append(stub)
    else:
        # Scene-sprite positions are world pixels so sprites can sit anywhere in a
        # multi-screen level, not just the first screen.  Clamp to the active
        # background's world bounds (ss_x/ss_y go 16-bit below if any exceed 255).
        world_w, world_h = _scene_world_bounds(state)
        xs, ys, ws, hs, offsets, roles, flying = [], [], [], [], [], [], []
        tiles_flat, attrs_flat = [], []
        for item in scene_sprites:
            idx = int(item["spriteIdx"])
            if not (0 <= idx < len(sprites)):
                raise ValueError(f"scene sprite idx {idx} out of range")
            sp = sprites[idx]
            w = int(sp["width"])
            h = int(sp["height"])
            sx, sy = _scene_sprite_xy(item, world_w, world_h)
            xs.append(sx)
            ys.append(sy)
            ws.append(w)
            hs.append(h)
            offsets.append(len(tiles_flat))
            roles.append(_role_code(sp))
            # `flying` lives on the sprite definition (Sprites page). When the
            # pupil ticks the 🕊 Flying checkbox, the baked gravity loop in
            # main.c skips that sprite so it hovers at its authored Y.
            flying.append(1 if sp.get("flying") else 0)
            for r in range(h):
                for c in range(w):
                    cell = sp["cells"][r][c]
                    tiles_flat.append(cell_tile(cell))
                    attrs_flat.append(cell_attr(cell))

        def arr(name, values, as_hex=False, mutable=False, wide=False, link=False):
            fmt = (lambda v: f"0x{v:02X}") if as_hex else (lambda v: str(v))
            # `link=True` arrays are read by the scene-draw ASM module, so they
            # carry SS_LINKAGE (static normally, linker-visible under NES_ASM_SCENE).
            base = "SS_LINKAGE" if link else "static"
            qualifier = base if mutable else base + " const"
            ctype = "unsigned int" if wide else "unsigned char"
            return (f"{qualifier} {ctype} {name}[{len(values)}] = {{ "
                    + ", ".join(fmt(v) for v in values) + " };")
        # ss_x / ss_y are mutable so movement / AI snippets can modify
        # positions at runtime; cc65's DATA segment is copied ROM->RAM at
        # startup per the nes.cfg linker script.  They go 16-bit (unsigned int)
        # only when a sprite sits past the first screen (x or y > 255), so
        # single-screen ROMs keep the 8-bit layout — which matches the asm /play
        # path, so the asm/C rom-equiv parity holds for first-screen projects.
        wide_pos = any(v > 255 for v in xs) or any(v > 255 for v in ys)
        # Per-instance animation state — one frame counter + one
        # tick counter per scene sprite.  Zero-initialised; the
        # template advances them when a matching tagged animation
        # exists (Phase B finale chunk B).
        anim_zero = [0] * n
        lines += [
            arr("ss_x", xs, mutable=True, wide=wide_pos, link=True),
            arr("ss_y", ys, mutable=True, wide=wide_pos, link=True),
            arr("ss_w", ws, link=True),
            arr("ss_h", hs, link=True),
            arr("ss_offset", offsets, link=True),
            arr("ss_tiles", tiles_flat, as_hex=True, link=True),
            arr("ss_attrs", attrs_flat, as_hex=True, link=True),
            arr("ss_role", roles),
            arr("ss_flying", flying),
            arr("ss_anim_frame", anim_zero, mutable=True),
            arr("ss_anim_tick", anim_zero, mutable=True),
        ]

    # --- Per-background nametables (Phase B+ Round 3 + T2.1 fix) ----
    # For multi-background door transitions we emit each painted
    # background's full nametable data in ROM, sized to the project's
    # world dimensions.  Pre-T2.1 each `bg_nametable_<n>` was a fixed
    # 1024 bytes (a single screen), so when a multi-screen project
    # used a door to swap rooms only screen 0 of the new bg got
    # written to NT0 — the player walking to a different screen post-
    # door saw the *previous* bg's stale tiles in NT1+ (item 2 in
    # docs/feedback/recently-observed-bugs.md).  The fix is to emit
    # `screens_x * screens_y` consecutive 1024-byte blocks per bg
    # (each block = one screen's tiles + attrs in NES format) and let
    # `load_background_n` walk all of them at door-swap time.
    #
    # Constraint: every bg in the project must share the active bg's
    # dimensions.  Mismatched bgs would need per-bg world dimensions
    # in the scroll engine which is T3.2's territory.  A validator
    # in builder-validators.js refuses the build before this code
    # runs; here we silently project-wide clamp to the active bg's
    # dimensions as a safety belt.
    bgs = state.get("backgrounds") or []
    active_bg = bgs[selected_bg_idx_safe(state)] if bgs else None
    proj_dims = ((active_bg or {}).get("dimensions") or {}) if active_bg else {}
    proj_sx = max(1, int(proj_dims.get("screens_x") or 1))
    proj_sy = max(1, int(proj_dims.get("screens_y") or 1))
    bytes_per_bg = proj_sx * proj_sy * 1024  # 1024 = 32*30 tiles + 64 attrs
    lines += ["", f"#define BG_COUNT {len(bgs)}",
              f"#define BG_SCREENS_X {proj_sx}",
              f"#define BG_SCREENS_Y {proj_sy}",
              f"#define BG_NAMETABLE_BYTES {bytes_per_bg}",
              ""]
    for bi, bg in enumerate(bgs):
        nt = bg.get("nametable") or []
        # Concatenate one 1024-byte NES block per screen, in
        # row-major (sy, sx) order.  Block ordering matches the
        # loop in load_background_n (sy outer, sx inner).
        bg_bytes = bytearray()
        for sy in range(proj_sy):
            for sx in range(proj_sx):
                # _nametable_bytes_for() works on a 30-row × 32-col
                # grid; carve out the (sy, sx) screen from the bg's
                # full multi-screen grid.  Pupils with mismatched-
                # dimension bgs see padding (zeros) for missing rows.
                rows_start = sy * SCREEN_ROWS
                cols_start = sx * SCREEN_COLS
                screen_grid = []
                for r in range(SCREEN_ROWS):
                    src_row = nt[rows_start + r] if rows_start + r < len(nt) else []
                    cropped = src_row[cols_start:cols_start + SCREEN_COLS]
                    # Pad short rows so _nametable_bytes_for sees the
                    # full 32-col width.
                    while len(cropped) < SCREEN_COLS:
                        cropped.append({"tile": 0, "palette": 0})
                    screen_grid.append(cropped)
                bg_bytes += _nametable_bytes_for(screen_grid)
        hex_body = ", ".join(f"0x{b:02X}" for b in bg_bytes)
        lines += [
            f"static const unsigned char bg_nametable_{bi}[BG_NAMETABLE_BYTES] = {{",
            "    " + hex_body,
            "};",
            "",
        ]

    lines += ["", "#endif", ""]
    return "\n".join(lines)
