"""Pure per-project constants generation for the hand-written ASM engine."""

from __future__ import annotations

from typing import Any

from .collision import behaviour_world_dims as _behaviour_world_dims
from .scene import sprite_position as _scene_sprite_xy
from .scene import world_bounds as _scene_world_bounds
from .world import world_nametable as _world_nametable


def _smbhud_bg_enabled(state: dict[str, Any]) -> bool:
    try:
        modules = state["builder"]["modules"]
        if modules.get("game", {}).get("config", {}).get("type") != "smb":
            return False
        hud = modules.get("smbhud", {})
        return bool(hud.get("enabled") and (hud.get("config") or {}).get("background"))
    except Exception:
        return False


def build_project_inc(state, player_idx, scene_sprites, start_y=120, player_idx2=-1):
    """Emit src/project.inc — the per-project ASM constants the hand-written 6502
    modules `.include`. Values MUST match collision.h / bg_world.h / scene.inc so
    the ASM and C engines agree. Uses ca65 `.define` (textual) not `SYM = value`
    because ca65 won't fold an `=` constant inside a `.proc` for `.if` / MULC.
    See docs/plans/current/2026-07-06-asm-engine-generator.md (Phase 1)."""
    wcols, wrows = _behaviour_world_dims(state)              # WORLD_COLS/ROWS
    _, _, bcols, brows, acols, _ = _world_nametable(state)   # BG_WORLD_COLS/ROWS + attr cols
    sprites = state.get("sprites") or []
    num_beh = len(sprites)
    num_static = len(scene_sprites or [])
    pw = ph = 2
    if isinstance(player_idx, int) and 0 <= player_idx < len(sprites):
        ps = sprites[player_idx] or {}
        pw = int(ps.get("width") or 2)
        ph = int(ps.get("height") or 2)
    # Player-2 dimensions for the hand-written P2 update (NES_ASM_PLAYER2). The
    # ASM P2 procs bake PLAYER2_W/H like the P1 procs bake PLAYER_W/H; feed them
    # via project.inc (same discipline as PLAYER_W/RUNNER_*/RACER_*). Default to
    # the P1 size when there is no distinct 2nd player sprite.
    pw2, ph2 = pw, ph
    p2_on = (isinstance(player_idx2, int) and 0 <= player_idx2 < len(sprites)
             and player_idx2 != player_idx)
    if p2_on:
        ps2 = sprites[player_idx2] or {}
        pw2 = int(ps2.get("width") or 2)
        ph2 = int(ps2.get("height") or 2)
    # SS_POS_WIDE mirrors build_scene_inc's wide_pos: 1 when any scene sprite
    # sits past the first screen (x or y > 255), so ss_x/ss_y are u16 in the C —
    # the scene-draw ASM must read them at the same width.
    ss_pos_wide = 0
    if num_static:
        world_w, world_h = _scene_world_bounds(state)
        for item in (scene_sprites or []):
            sx, sy = _scene_sprite_xy(item, world_w, world_h)
            if sx > 255 or sy > 255:
                ss_pos_wide = 1
                break
    # SMB horizontal tuning (8.8 fixed-point) for the hand-written smb_accel — it
    # MUST match the C's BW_SMB_WALK_MAX/RUN_MAX/ACCEL, which builder-modules.js
    # derives from the Speed preset (1..5), else the ASM velocity ramps at a
    # different rate than the C. Same table + same clamp(1,5,default=2) as the JS.
    _SMB_SPEED = {
        1: (256, 448, 40), 2: (384, 640, 48), 3: (512, 832, 56),
        4: (640, 1024, 64), 5: (768, 1280, 80),
    }
    _game_cfg = (((state.get("builder") or {}).get("modules") or {}).get("game") or {}).get("config") or {}
    try:
        _sp_key = min(5, max(1, int(_game_cfg.get("smbSpeed"))))
    except (TypeError, ValueError):
        _sp_key = 2
    smb_walk, smb_run, smb_accel = _SMB_SPEED[_sp_key]
    # Auto-runner tuning for the hand-written run_update (BW_GAME_STYLE 2). Must
    # match the C: AUTOSCROLL_SPEED is Builder-emitted (clamp 1..4, default 2);
    # RUNNER_SCREEN_X / BW_RUNNER_SPIKE_ID are template #ifndef defaults (64 / 7);
    # the respawn Y is the player start Y (& 0xFF, as scene.inc's PLAYER_Y).
    # Prefixed RUNNER_* so they never collide with scene.asminc's PLAYER_Y in a
    # module that includes both. Emitted for every build (unused off-runner).
    try:
        run_autoscroll = min(4, max(1, int(_game_cfg.get("autoscrollSpeed"))))
    except (TypeError, ValueError):
        run_autoscroll = 2
    run_screen_x = 64
    run_spike_id = 7
    run_start_y = int(start_y) & 0xFF
    # Racer tuning for the hand-written racer_update (BW_GAME_STYLE 3). Must match
    # the C: RACER_MAX_SPEED/LAPS_TO_WIN/CP_COUNT are Builder-emitted (from the
    # racerTopSpeed/racerLaps/racerCheckpoints knobs); ACCEL/FRICTION/BRAKE + the
    # finish/checkpoint IDs are template #ifndef defaults; REV_MAX = MAX/2. Same
    # discipline as SMB_*/RUNNER_* to avoid the tuning-mismatch class.
    try:
        _rt_tier = min(4, max(1, int(_game_cfg.get("racerTopSpeed"))))
    except (TypeError, ValueError):
        _rt_tier = 3
    racer_max = 256 + _rt_tier * 128
    try:
        racer_laps = min(9, max(1, int(_game_cfg.get("racerLaps"))))
    except (TypeError, ValueError):
        racer_laps = 3
    try:
        racer_cps = min(2, max(1, int(_game_cfg.get("racerCheckpoints"))))
    except (TypeError, ValueError):
        racer_cps = 1
    lines = [
        "; project.inc — generated by tools/playground_server.py. Per-project ASM",
        "; constants for the hand-written 6502 engine. `.define` (textual) so ca65",
        "; folds them inside .proc scopes. Values mirror collision.h/bg_world.h.",
        f".define WORLD_COLS             {wcols}",
        f".define WORLD_ROWS             {wrows}",
        f".define BG_WORLD_COLS          {bcols}",
        f".define BG_WORLD_ROWS          {brows}",
        f".define BG_WORLD_ATTR_COLS     {acols}",
        f".define PLAYER_W               {pw}",
        f".define PLAYER_H               {ph}",
        f".define PLAYER2_W              {pw2}",
        f".define PLAYER2_H              {ph2}",
        f".define PLAYER2_ENABLED        {1 if p2_on else 0}",
        # Rows the column streamer skips at the top of the nametable — 4 when the SMB
        # background status bar is on (BW_SMB_HUD_BG) so scroll_stream never overwrites
        # the fixed status strip (rows 0-3); 0 otherwise -> byte-identical.
        f".define SCROLL_SKIP_TOP        {4 if _smbhud_bg_enabled(state) else 0}",
        f".define PLAYER_TILES_PER_FRAME {pw * ph}",
        f".define NUM_BEHAVIOUR_SPRITES  {max(num_beh, 1)}",
        f".define NUM_STATIC_SPRITES     {num_static}",
        f".define SS_POS_WIDE            {ss_pos_wide}",
        ".define SCREEN_W_PX            256",
        ".define SCREEN_H_PX            240",
        f".define SMB_WALK_MAX           {smb_walk}",
        f".define SMB_RUN_MAX            {smb_run}",
        f".define SMB_ACCEL              {smb_accel}",
        f".define RUNNER_AUTOSCROLL      {run_autoscroll}",
        f".define RUNNER_SCREEN_X        {run_screen_x}",
        f".define RUNNER_SPIKE_ID        {run_spike_id}",
        f".define RUNNER_START_Y         {run_start_y}",
        f".define RACER_MAX_SPEED        {racer_max}",
        ".define RACER_ACCEL            13",
        ".define RACER_TURN_CD          6",   # steer cooldown — keep == the C #define RACER_TURN_CD
        ".define RACER_FRICTION         8",
        ".define RACER_BRAKE            40",
        f".define RACER_REV_MAX          {racer_max // 2}",
        f".define RACER_LAPS_TO_WIN      {racer_laps}",
        f".define RACER_CP_COUNT         {racer_cps}",
        ".define RACER_FINISH_ID        7",
        ".define RACER_CHECKPOINT_ID    5",
        ".define RACER_CHECKPOINT2_ID   6",
        "",
    ]
    return "\n".join(lines)
