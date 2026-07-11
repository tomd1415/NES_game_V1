"""Pure validation and feature selection for project-to-ROM requests."""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

from .build import GenerationError

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
    if songs and not sfx:
        sfx = sfx_stub
    elif sfx and not songs:
        songs = songs_stub
    return AudioAssets(songs, sfx)


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
    sprites = parameters.state.get("sprites") or []
    player2_enabled = (
        parameters.player_index_2 >= 0
        and parameters.player_index_2 != parameters.player_index
        and parameters.player_index_2 < len(sprites)
    )
    has_custom_c = custom_c is not None
    return AsmFeatures(
        leaf=asm_ready,
        scroll=scroll and asm_ready,
        scene=asm_ready
        and scroll
        and len(parameters.scene_sprites) > 0
        and not has_scene_animation,
        ai=asm_ready and has_custom_c and "ss_ai_type[" in source,
        player=asm_ready
        and has_custom_c
        and (topdown or platformer or (runner and not player2_enabled)),
        smb=asm_ready and has_custom_c and smb_style,
        racer=asm_ready and has_custom_c and racer_style,
        player2=asm_ready
        and has_custom_c
        and player2_enabled
        and (topdown or racer_style or platformer),
        player_draw=asm_ready and has_custom_c and scroll and not disable_player_draw,
    )
