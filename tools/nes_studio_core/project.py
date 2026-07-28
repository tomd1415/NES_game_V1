"""Pure per-project constants generation for the hand-written ASM engine."""

from __future__ import annotations

from typing import Any

from .collision import behaviour_world_dims as _behaviour_world_dims
from .scene import sprite_position as _scene_sprite_xy
from .scene import world_bounds as _scene_world_bounds
from .world import bg_compression as _bg_compression
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


def _player_physics(state: dict[str, Any]) -> tuple[int, int, int]:
    """(jump_budget, jump_speed, player_gravity) for the hand-written ASM player.

    Mirrors the JS Players/Globals module defaults + clamps so the ASM immediates
    baked into project.inc match the C values (jmp_up literal, BW_JUMP_SPEED_PX,
    BW_PLAYER_GRAVITY) — keeping the ASM and C players behaviourally identical.
    A module is active unless `enabled === False` (builder-assembler MODULE_ORDER).

    Defaults 20/2/2 reproduce the historic hardcoded `lda #20` / `sbc #2` /
    `fall_amt=2`, so an untouched project is byte-identical.  The Gravity slider
    (0..4, default 1) shifts the player's base-2 fall: player_gravity = grav + 1
    (so default 1 -> 2, and 0 -> floaty 1, 4 -> heavy 5).
    """

    def _clamped_int(value: Any, low: int, high: int, default: int) -> int:
        try:
            return max(low, min(high, int(value)))
        except (TypeError, ValueError):
            return default

    modules = ((state or {}).get("builder") or {}).get("modules") or {}
    game_type = str(
        ((modules.get("game") or {}).get("config") or {}).get("type") or "platformer"
    ).lower()
    player1_config = (
        ((modules.get("players") or {}).get("submodules") or {}).get("player1") or {}
    ).get("config") or {}
    jump_budget = _clamped_int(player1_config.get("jumpHeight"), 1, 60, 20)
    globals_node = modules.get("globals") or {}
    globals_active = (
        bool(globals_node)
        and globals_node.get("enabled") is not False
        and bool(globals_node.get("config"))
    )
    globals_config = globals_node.get("config") or {}
    gravity = (
        _clamped_int(globals_config.get("gravityPx"), 0, 4, 1) if globals_active else 1
    )
    player_gravity = max(1, min(5, gravity + 1))
    # JUMP_SPEED drives the SHARED pl_vmove rise (platformer + runner + smb).  The
    # platformer AND runner C rise both honour jumpSpeedPx (BW_APPLY_JUMP_RISE), so
    # tune it for them.  SMB uses a variable-height jump tuned by its own Speed
    # preset (smbSpeed), so it stays at the historic 2 (ASM == its C at default =
    # byte-identical); topdown/racer have no jump.
    if game_type in ("platformer", "runner"):
        jump_speed = (
            _clamped_int(globals_config.get("jumpSpeedPx"), 1, 6, 2)
            if globals_active
            else 2
        )
    else:
        jump_speed = 2
    return jump_budget, jump_speed, player_gravity


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
    # Tunable platformer physics for the hand-written pl_jump / pl_vmove. Same
    # discipline as SMB_*/RUNNER_*/RACER_*: mirror the JS Players/Globals module
    # clamps so the ASM (immediates) matches the C. Defaults 20/2/2 == the historic
    # `lda #20` / `sbc #2` / `fall_amt=2` -> byte-identical when untouched.
    jump_budget, jump_speed, player_gravity = _player_physics(state)
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
        # Tunable platformer physics (Style tab: Jump height / Jump speed / Gravity).
        # Defaults 20/2/2 == the historic hardcoded ASM immediates -> byte-identical.
        f".define JUMP_BUDGET           {jump_budget}",
        f".define JUMP_SPEED            {jump_speed}",
        f".define PLAYER_GRAVITY        {player_gravity}",
        # Rows the column streamer skips at the top of the nametable — 4 when the SMB
        # background status bar is on (BW_SMB_HUD_BG) so scroll_stream never overwrites
        # the fixed status strip (rows 0-3); 0 otherwise -> byte-identical.
        f".define SCROLL_SKIP_TOP        {4 if _smbhud_bg_enabled(state) else 0}",
        # 1 when the wide (>8-screen) world's tiles are column-deduplicated
        # (feedback #10); the scroll core then reads bg_col_index/bg_col_data
        # instead of the raw bg_world_tiles array.  0 -> raw -> byte-identical.
        f".define SCROLL_COMPRESSED      {1 if _bg_compression(state)[0] else 0}",
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
