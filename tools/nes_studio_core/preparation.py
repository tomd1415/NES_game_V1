"""Pure validation and feature selection for project-to-ROM requests."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from .build import GenerationError
from . import build as build_core
from . import collision, graphics, project, scene, world

AUDIO_MAX_BYTES = 64 * 1024


@dataclass(frozen=True, slots=True)
class RequestParameters:
    state: dict[str, Any]
    custom_main_c: str | None
    custom_main_asm: str | None
    player_index: int
    player_index_2: int
    scene_sprites: list[Any]
    start_x: int
    start_y: int
    start_x_2: int
    start_y_2: int


@dataclass(frozen=True, slots=True)
class AudioAssets:
    songs_asm: str | None
    sfx_asm: str | None
    # True only when the pupil supplied a REAL sfx pack. The auto-stub below has
    # a single null entry, so calling famistudio_sfx_play against it would read
    # past the (empty) sound table — event SFX must stay off for a stub.
    sfx_is_real: bool = False


@dataclass(frozen=True, slots=True)
class AsmFeatures:
    leaf: bool
    scroll: bool
    scene: bool
    ai: bool
    player: bool
    smb: bool
    racer: bool
    player2: bool
    player_draw: bool


def parse_request(body: dict[str, Any]) -> RequestParameters:
    source_state = body.get("state")
    if not isinstance(source_state, dict):
        raise GenerationError("missing 'state' in request body")
    custom_c = _optional_source(body, "customMainC")
    custom_asm = _optional_source(body, "customMainAsm")
    if custom_c and custom_asm:
        raise GenerationError("send only one of 'customMainC' or 'customMainAsm' per request")
    start = body.get("playerStart") or {}
    start_2 = body.get("playerStart2") or {}
    raw_index_2 = body.get("playerSpriteIdx2")
    try:
        index_2 = int(raw_index_2) if raw_index_2 is not None else -1
    except (TypeError, ValueError):
        index_2 = -1
    return RequestParameters(
        state=copy.deepcopy(source_state),
        custom_main_c=custom_c,
        custom_main_asm=custom_asm,
        player_index=int(body.get("playerSpriteIdx", 0)),
        player_index_2=index_2,
        scene_sprites=copy.deepcopy(body.get("sceneSprites") or []),
        start_x=int(start.get("x", 60)),
        start_y=int(start.get("y", 120)),
        start_x_2=int(start_2.get("x", 180)) if start_2 else 180,
        start_y_2=int(start_2.get("y", 120)) if start_2 else 120,
    )


def _optional_source(body: dict[str, Any], key: str) -> str | None:
    value = body.get(key)
    if value is not None and not isinstance(value, str):
        raise GenerationError(f"'{key}' must be a string if provided")
    if isinstance(value, str) and value.strip():
        return value
    return None


def normalize_audio(
    body: dict[str, Any], *, songs_stub: str, sfx_stub: str
) -> AudioAssets:
    songs = _audio_source(body, "audioSongsAsm")
    sfx = _audio_source(body, "audioSfxAsm")
    sfx_is_real = sfx is not None
    if songs and not sfx:
        sfx = sfx_stub
    elif sfx and not songs:
        songs = songs_stub
    return AudioAssets(songs, sfx, sfx_is_real)


def _audio_source(body: dict[str, Any], key: str) -> str | None:
    value = body.get(key)
    if value is not None and not isinstance(value, str):
        raise GenerationError(f"'{key}' must be a string if provided")
    if value is not None and len(value.encode("utf-8")) > AUDIO_MAX_BYTES:
        raise GenerationError(f"'{key}' too large (>{AUDIO_MAX_BYTES} bytes)")
    return value if isinstance(value, str) and value.strip() else None


def select_asm_features(
    parameters: RequestParameters,
    *,
    world_columns: int,
    world_rows: int,
    has_scene_animation: bool,
    disable_player_draw: bool = False,
) -> AsmFeatures:
    custom_c = parameters.custom_main_c
    asm_ready = custom_c is None or "NES_ASM_READY_V1" in custom_c
    scroll = world_columns > 32 or world_rows > 30
    source = custom_c or ""
    topdown = "\n#define BW_GAME_STYLE 1" in source
    smb_style = "\n#define BW_SMB_JUMP" in source
    runner = "\n#define BW_GAME_STYLE 2" in source and scroll
    racer_style = "\n#define BW_GAME_STYLE 3" in source and scroll
    platformer = not any(
        marker in source
        for marker in (
            "\n#define BW_GAME_STYLE 1",
            "\n#define BW_GAME_STYLE 2",
            "\n#define BW_GAME_STYLE 3",
        )
    ) and not smb_style
    # Per-room scene instances (v75) park off-room actors at ss_y=0xFF. The C
    # scene draw skips them (BW_SCENE_PERROOM) before they reach OAM and the C AI
    # bodies guard `ss_y < 0xEF` so a parked chaser/flyer stays put — the
    # hand-written ASM draw and AI loop do neither. Fall back to the
    # (byte-identical) C paths for multi-room projects.
    per_room = scene.scene_is_perroom(parameters.scene_sprites)
    sprites = parameters.state.get("sprites") or []
    player2_enabled = (
        parameters.player_index_2 >= 0
        and parameters.player_index_2 != parameters.player_index
        and parameters.player_index_2 < len(sprites)
    )
    has_custom_c = custom_c is not None
    # ITEM #37 — a big player must NOT take the ASM draw. `draw_player` in
    # pdraw_asm.s tracks the OAM cursor in Y (`ldy _oam_idx` ... `sty _oam_idx`),
    # which is 8-bit, so the player's span has to end strictly INSIDE one 256-byte
    # page. The boundary is `< 256`, not `<= 256`: the individual writes are fine at
    # exactly 256, but the closing `sty` then stores 256 mod 256 = 0, leaving the
    # cursor at 0 (or 4) instead of 256. Two distinct ways that corrupts:
    #
    #   * every later writer (P2, scene, spawn, HUD) reads that cursor, decides the
    #     buffer is empty and draws over the player from slot 0 — and their own
    #     `oam_idx > 252` guards never trip;
    #   * with the background status bar on (BW_SMB_HUD_BG starts the player at byte
    #     4) the player's own last cells wrap onto oam_buf[0..3] and wipe the
    #     sprite-0 split marker, breaking the mid-frame scroll split.
    #
    # Silent corruption, no crash — the "random mess on screen / froze for no reason"
    # class in feedback item 37. A 64-cell player is reachable: the Builder allows 8x8.
    # The C loop handles all of this correctly (oam_idx is `unsigned int`, and the
    # template's BW_P1_OAM_FITS guard bounds it), so the fix is to leave the ASM draw
    # out for those configs and let the C run. It costs those rare projects the ASM
    # draw's speed; everything that fits keeps the ASM path and stays byte-identical.
    player_width = player_height = 2
    if 0 <= parameters.player_index < len(sprites):
        player_sprite = sprites[parameters.player_index] or {}
        try:
            player_width = int(player_sprite.get("width") or 2)
            player_height = int(player_sprite.get("height") or 2)
        except (TypeError, ValueError):
            player_width = player_height = 2
    # Mirrors the template's BW_OAM_P1_BASE.
    oam_base = 4 if (scroll and "#define BW_SMB_HUD_BG 1" in source) else 0
    oam_fits = (oam_base + player_width * player_height * 4) < 256
    return AsmFeatures(
        leaf=asm_ready,
        scroll=scroll and asm_ready,
        scene=asm_ready
        and scroll
        and len(parameters.scene_sprites) > 0
        and not has_scene_animation
        and not per_room,
        ai=asm_ready and has_custom_c and "ss_ai_type[" in source and not per_room,
        player=asm_ready
        and has_custom_c
        and (topdown or platformer or (runner and not player2_enabled)),
        smb=asm_ready and has_custom_c and smb_style,
        racer=asm_ready and has_custom_c and racer_style,
        player2=asm_ready
        and has_custom_c
        and player2_enabled
        and (topdown or racer_style or platformer),
        player_draw=asm_ready
        and has_custom_c
        and scroll
        and oam_fits  # item #37: the 8-bit Y cursor must not wrap
        and not disable_player_draw,
    )


class ProjectBuilder:
    """Convert a project request into generated inputs and compile its ROM."""

    def __init__(
        self,
        build_service: build_core.BuildService,
        *,
        asm_makefile: str,
        songs_stub: str,
        sfx_stub: str,
    ) -> None:
        self.build_service = build_service
        self.asm_makefile = asm_makefile
        self.songs_stub = songs_stub
        self.sfx_stub = sfx_stub

    def build(
        self,
        body: dict[str, Any],
        *,
        disable_all_asm: bool = False,
        disable_player_draw: bool = False,
    ) -> tuple[bytes, str]:
        parameters = parse_request(body)
        state = parameters.state
        graphics.expand_metatiles(state)
        # Fail fast with a readable message on worlds that provably can't fit the
        # cartridge (a wide level too varied to column-compress), rather than
        # crashing deep in codegen or overflowing the linker. Must follow
        # expand_metatiles so it measures the world the codegen will actually emit.
        world.guard_world_fits(state)
        graphics._inject_racer_rotation(state, parameters.player_index)
        chr_bytes = graphics.build_chr(state)
        nam_bytes = graphics.build_nam(state)
        audio = normalize_audio(
            body, songs_stub=self.songs_stub, sfx_stub=self.sfx_stub
        )
        dialogue = graphics._dialogue_module_enabled(state)

        if parameters.custom_main_asm is not None:
            result = self.build_service.build_asm(
                build_core.AsmBuildInputs(
                    custom_main=parameters.custom_main_asm,
                    chr_bytes=chr_bytes,
                    nam_bytes=nam_bytes,
                    palettes_source=graphics.build_palettes_asminc(state, dialogue),
                    scene_source=scene.build_scene_asminc(
                        state,
                        parameters.player_index,
                        parameters.scene_sprites,
                        parameters.start_x,
                        parameters.start_y,
                    ),
                ),
                self.asm_makefile,
            )
            return self._patch_if_needed(state, result)

        _, _, world_columns, world_rows, _, _ = world.world_nametable(state)
        # The raw SCROLL_BUILD predicate, before the ASM-readiness gate that
        # select_asm_features applies. HUD_NMI keys off this one.
        is_scroll = world_columns > 32 or world_rows > 30
        has_scene_animation = any(
            scene._resolve_tagged_animation(state, role, style) is not None
            for role, style in (
                ("enemy", "walk"),
                ("enemy", "idle"),
                ("pickup", "idle"),
            )
        )
        features = select_asm_features(
            parameters,
            world_columns=world_columns,
            world_rows=world_rows,
            has_scene_animation=has_scene_animation,
            disable_player_draw=disable_player_draw,
        )
        flags = () if disable_all_asm else self._asm_flags(features)
        result = self.build_service.build_c(
            build_core.CBuildInputs(
                custom_main=parameters.custom_main_c,
                chr_bytes=chr_bytes,
                nam_bytes=nam_bytes,
                palettes_source=graphics.build_palettes_inc(state, dialogue),
                scene_source=scene.build_scene_inc(
                    state,
                    parameters.player_index,
                    parameters.scene_sprites,
                    parameters.start_x,
                    parameters.start_y,
                    parameters.player_index_2,
                    parameters.start_x_2,
                    parameters.start_y_2,
                ),
                collision_header=collision.build_collision_h(state),
                behaviour_source=collision.build_behaviour_c(state),
                world_header=world.build_bg_world_h(state),
                world_source=world.build_bg_world_c(state),
                project_inc=project.build_project_inc(
                    state,
                    parameters.player_index,
                    parameters.scene_sprites,
                    parameters.start_y,
                    parameters.player_index_2,
                ),
                audio_songs_asm=audio.songs_asm,
                audio_sfx_asm=audio.sfx_asm,
                asm_flags=flags,
                # Event sound effects (engine v74): trigger sfx on
                # jump/pickup/hurt/win. Only honoured when the pupil supplied a
                # real sfx pack — see AudioAssets.sfx_is_real.
                bw_sfx_events=bool(body.get("audioSfxEvents")) and audio.sfx_is_real,
                # Gate on the ACTUAL emission of BW_SMB_HUD_BG in the assembled C
                # (target-engine gated, >= v58), not just the module config — the
                # NMI crt0 imports _hud_present/_hud_ready, which only exist when
                # `BW_SMB_HUD_BG && SCROLL_BUILD` both hold. A pre-v58 target that
                # leaves BW_SMB_HUD_BG out would otherwise link the crt0 against
                # undefined symbols.
                #
                # The SCROLL_BUILD half is `is_scroll`, NOT features.scroll:
                # HUD_NMI is independent of the ASM kill switch, because
                # hud_present is C and calls scroll_apply_ppu/scroll_stream
                # whether those resolve to the ASM or the C definitions.
                # features.scroll is ASM-gated and would wrongly drop the NMI hook
                # on a non-asm-ready custom main.
                hud_nmi=(
                    is_scroll
                    and "#define BW_SMB_HUD_BG 1" in (parameters.custom_main_c or "")
                ),
            )
        )
        return self._patch_if_needed(state, result)

    @staticmethod
    def _asm_flags(features: AsmFeatures) -> tuple[str, ...]:
        flags = []
        for enabled, flag in (
            (features.leaf, "NES_ASM_LEAF=1"),
            (features.scroll, "NES_ASM_SCROLL=1"),
            (features.scene, "NES_ASM_SCENE=1"),
            (features.ai, "NES_ASM_AI=1"),
        ):
            if enabled:
                flags.append(flag)
        if features.smb:
            flags.append("NES_ASM_SMB=1")
        elif features.racer:
            flags.append("NES_ASM_RACER=1")
        elif features.player:
            flags.append("NES_ASM_PLAYER=1")
        if features.player2:
            flags.append("NES_ASM_PLAYER2=1")
        if features.player_draw:
            flags.append("NES_ASM_PDRAW=1")
        return tuple(flags)

    @staticmethod
    def _patch_if_needed(
        state: dict[str, Any], result: tuple[bytes, str]
    ) -> tuple[bytes, str]:
        rom, log = result
        if world.project_needs_four_screen(state):
            rom = world.patch_ines_four_screen(rom)
        return rom, log
