# NES engine changelog

Newest first. The **engine** is the C templates + assembler + cc65 project
that turn a project into a ROM. Bump `ENGINE_VERSION` (and
`tools/tile_editor_web/engine-version.js`) and add an entry here whenever a
change alters ROM output or the project↔ROM contract, then run
`node scripts/snapshot-engine.mjs` to freeze the new version.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
for the full design (snapshots, fallback, upgrade advisor).

## v51 — 2026-07-09 — Player-1 OAM draw loop on hand-written 6502 (off by default)

### Added
- **`src/pdraw_asm.s` (`draw_player`)** — the hand-written 6502 twin of the plain
  P1 OAM draw loop. Builds the player-1 sprite's OAM entries each frame from
  `anim_tiles`/`anim_attrs`/`anim_base` (so it covers the static player and any
  assigned animation — those pointers already select the current frame), applies the
  horizontal flip (the `(PLAYER_W-1-c)` column when `plrdir==0x40`), and calls
  `world_to_screen_x/y` (px/py widened per `PX_WIDE`). Leaves `oam_idx` at
  `PLAYER_W*PLAYER_H*4` so the P2/scene/HUD draws continue in C from there. This is
  the last per-frame hot loop still in cc65 C (see the full-ASM scoping doc,
  `docs/design/2026-07-09-full-asm-engine-scoping.md`).
- Gated `NES_ASM_PDRAW` in the Makefile (links `pdraw_asm.s`, `-D`'s out the plain
  C P1 draw loop in main.c; the C call site also excludes the walk-bob case). The
  server sets it only behind the `PLAYGROUND_ASM_PDRAW` dev toggle for now (needs a
  scroll build for `world_to_screen`), exactly how the P2 second actors rode
  `PLAYGROUND_ASM_PLAYER` before their v50 flip.

### Off by default — byte-identical when off
- With `NES_ASM_PDRAW` unset (the default: no `PLAYGROUND_ASM_PDRAW`), the template's
  `#if defined(NES_ASM_PDRAW)` guards leave the C draw loop untouched and
  `pdraw_asm.s` is not compiled. Golden `1730448e` and `_rom-equiv` `0aed6e95` both
  UNCHANGED. Proven C-draw ≡ ASM-draw byte-for-byte in the OAM shadow by
  `asm-player.mjs` (three new cases: square + 2×3 + 3×1 players, comparing the P1
  OAM entries across a screen-2 scroll with the horizontal flip exercised; both sides
  run identical ASM physics so any OAM diff is a pure draw bug). NOT yet shipped by
  default — the ship-by-default flip (which re-pins `_rom-equiv`) is a separate,
  surfaced decision.

## v50 — 2026-07-08 — SHIP the 2-player ASM player physics by default

### Changed / migration
- **The hand-written 6502 player physics now ship BY DEFAULT for 2-PLAYER builds
  too.** The server `nes_asm_player2` gate no longer requires the PLAYGROUND_ASM_PLAYER
  toggle (engages for any 2-player build of a covered style: top-down/racer/
  platformer/runner), and the 1-player gates no longer exclude 2-player builds
  (`_p2_ok` retired). So a 2-player project now runs P1 AND P2 on ASM. All four P2
  second actors are A/B-proven byte-behaviour-identical to the C (asm-player.mjs,
  matched px/py + px2/py2).
- **`_rom-equiv` re-pinned `54a15150` -> `0aed6e95`** — its everything-on fixture is a
  2-player platformer, which now builds with P1 plat_update + P2 p2_plat_update on
  ASM. The byte change is exactly that swap (both procs A/B-proven identical to the
  C). Golden `1730448e` UNCHANGED (the stock build has no custom main.c, so the player
  gate never fires). PLAYGROUND_NO_ASM=1 remains the whole-engine kill switch.
- **Phase 2c COMPLETE.** Every player-physics model — all six single-player
  (top-down, platformer, SMB, auto-runner, racer) + all four two-player second actors
  — now runs on hand-written 6502, shipped by default, each A/B-verified against the C.

## v49 — 2026-07-08 — player-2 runner update WIRED + A/B-verified (Phase 2c, OFF by default)

### Changed / migration
- **The player-2 auto-runner second actor now runs on hand-written 6502 under the
  flag** — `p2_run_update` = the shared `p2_hwalk` only (a runner's P2 has no vertical
  block). platformer.c gates the C P2 style-2 walk under NES_ASM_PLAYER and calls
  `p2_run_update()`; the server `nes_asm_player2` gate now also accepts a 2P runner.
- A/B (`asm-player.mjs`): a 2-player runner — P1 autoscrolls (run_update) + jumps, P2
  walks via pad2 (p2_run_update) — C ≡ ASM P1 `px/py` AND P2 `px2/py2` at every matched
  tick over 400 ticks (autoscroll, walk, wall bump).
- **ALL player physics are now on hand-written 6502.** Six single-player models
  (top-down, platformer, SMB, auto-runner, racer) SHIPPED BY DEFAULT (v43); the four
  2-player second actors (top-down/racer/platformer/runner) A/B-verified behind the
  PLAYGROUND_ASM_PLAYER toggle (2P builds still ship pure-C by default). Off by
  default = byte-identical (golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED).
- Next (user decision): ship 2-player ASM by default (drops the toggle from the P2
  gate + `not player2_enabled` from the 1P gates) — that re-pins `_rom-equiv` (its 2P
  fixture would then get ASM), so it's an outward-facing call to be surfaced.

## v48 — 2026-07-08 — player-2 platformer update WIRED + A/B-verified (Phase 2c, OFF by default)

### Changed / migration
- **The player-2 platformer second actor now runs on hand-written 6502 under the
  flag, A/B-proven identical to the C.** p2_plat_update = the shared P2 horizontal
  walk (p2_hwalk) + edge-UP jump (jmp_up2=20) + prev_pad2=pad2 + the SIMPLE gravity
  (rise 2 while jmp_up2>0 else foot-check land-or-fall +2) — NO ladder, NO ceiling
  bonk (matching the C P2 MVP). Reuses shr3/cell_solid/cell_solid_or_plat/hprobe +
  the P2 p2_calc_cols/p2_rows_from_py; p2_hwalk is a shared proc (also for P2 runner).
- platformer.c gates the C P2 style-0 blocks under NES_ASM_PLAYER (the shared P2
  hwalk guard widened to exclude styles 1 AND 0; the style-0 vertical gets `&&
  !defined(NES_ASM_PLAYER)`) and calls `p2_plat_update()`. The server nes_asm_player2
  gate now also accepts a plain 2P platformer (`_asm_player_platformer`).
- A/B (`asm-player.mjs`): a 2-player platformer (SOLID floor + WALL columns) both
  walking + jumping — C ≡ ASM P1 `px/py` AND P2 `px2/py2` at every matched tick over
  400 ticks (walk, gravity, jump arc, wall bumps). Matched the C from the first build.
- Off by default (2P gated on PLAYGROUND_ASM_PLAYER); flag off = byte-identical
  (golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED). Last P2 style: the runner
  (walk-only, p2_hwalk); then the 2P-ship decision.

## v47 — 2026-07-08 — player-2 racer update WIRED + A/B-verified (Phase 2c, OFF by default)

### Changed / migration
- **The player-2 racer second car now runs on hand-written 6502 under the flag,
  A/B-proven identical to the C.** platformer.c gates the C P2 racer block under
  NES_ASM_PLAYER (`&& !defined(NES_ASM_PLAYER)`) and calls `p2_racer_update()` in its
  place. The server `nes_asm_player2` gate now accepts a 2P racer
  (`_asm_player_topdown or _asm_player_racer`); a 2P racer build compiles BOTH the
  NES_ASM_RACER section (P1) and the P2-racer section (both flags).
- **Bug caught by the wired A/B and fixed:** the mechanical sed that ported the P1
  racer onto the *2 globals missed `_pad -> _pad2`, so `p2_rc_drive` steered/accel'd
  the P2 car off P1's controller. The 2-player A/B's per-actor px2/py2 comparison
  surfaced it (P2 Y diverged); fixed by substituting `_pad -> _pad2` in p2_rc_drive.
- A/B (`asm-player.mjs`): a 2-player racer (2 cars, SOLID border) both steering +
  accelerating — C ≡ ASM P1 `px/py` AND P2 `px2/py2` at every matched tick over 400
  ticks (COS16 velocity + per-axis slide collision for both cars).
- Off by default (2P still gated on PLAYGROUND_ASM_PLAYER); flag off = byte-identical
  (golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED). Next: P2 platformer + P2
  runner, then the 2P-ship decision.

## v46 — 2026-07-08 — player-2 racer update composed in ASM (Phase 2c, OFF/unwired)

### Added
- **p2_racer_update proc in src/player_asm.s** — the PLAYER-2 top-down racer
  (BW_GAME_STYLE 3 + PLAYER2_ENABLED), the line-for-line P1 racer on the *2 globals
  (px2/py2/px2_sub/py2_sub/racer_heading2/racer_speed2/racer_cp_stage2/racer_laps2/
  racer_finished2) + PLAYER2 dims. The four main procs (p2_rc_drive/vel/axis/laps)
  are the P1 rc_* bodies mechanically ported onto the *2 globals; the dimension-free
  helpers (rc_velcomp/rc_axis3/rc_probe/rc_rbe) + the rcos16 table + the shared racer
  scratch are REUSED. Guarded by if(!(racer_finished || racer_finished2)) (2P RACE_OVER).

### Changed / migration
- **Gated `.if NES_ASM_PLAYER2 .and NES_ASM_RACER`** — it needs the racer helpers
  (only compiled under NES_ASM_RACER) AND the P2 globals (only under NES_ASM_PLAYER2);
  a 2-player racer build sets both, a 2P non-racer build sets only PLAYER2 and skips
  this section (so it never references rc_* there).
- **Not wired yet** (no C caller, no server style-3 P2 gate) — dead code (nothing
  sets both flags in a real build yet). Flag off = byte-identical (golden 1730448e +
  _rom-equiv 54a15150 UNCHANGED); the 7 A/B cases (incl. P2 top-down) still pass.
  Assemble-checked both widths x {plain, PLAYER2, PLAYER2+RACER, RACER}.
- Next: wire P2 racer (C gate + call + server gate for style-3 2P + A/B), then P2
  platformer (leaves) + P2 runner.

## v45 — 2026-07-08 — player-2 top-down update WIRED + A/B-verified (Phase 2c, OFF by default)

### Changed / migration
- **The player-2 top-down second actor now runs on hand-written 6502 under the flag,
  A/B-proven identical to the C.** platformer.c gates the C P2 top-down blocks under
  NES_ASM_PLAYER — the shared P2 horizontal walk is excluded for style 1
  (`#if !(BW_GAME_STYLE == 1 && defined(NES_ASM_PLAYER))`) and the style-1 vertical
  block gets `&& !defined(NES_ASM_PLAYER)` — and calls `p2_td_update()` in their
  place (it does both H+V).
- **Makefile:** `NES_ASM_PLAYER2=1` implies NES_ASM_PLAYER and passes `-D
  NES_ASM_PLAYER2` to ca65. **Server:** a distinct `nes_asm_player2` gate
  (player2_enabled + top-down) that appends `NES_ASM_PLAYER2=1` IN ADDITION to the
  P1 flag (a 2P top-down build runs P1 td_update + P2 p2_td_update). **Still gated on
  PLAYGROUND_ASM_PLAYER** — 2P builds ship pure-C by default until all P2 styles are
  done + the (re-pin-triggering) 2P-ship decision, so `_rom-equiv` (a 2P fixture)
  stays `54a15150`.
- A/B (`asm-player.mjs`): a 2-player top-down project (2 player sprites) driving both
  pads — C ≡ ASM P1 `px/py` AND P2 `px2/py2` at every matched tick over 300 ticks
  (P1 right, P2 left, both 4-way with wall bumps). A P2-aware probe exposes px2/py2.
- Off by default; flag off = byte-identical (golden `1730448e` + `_rom-equiv`
  `54a15150` UNCHANGED); the 6 single-player A/B cases still pass. Next: P2 racer, P2
  platformer, P2 runner; then the 2P-ship decision.

## v44 — 2026-07-08 — player-2 top-down update composed in ASM (Phase 2c, OFF/unwired)

### Added
- **p2_td_update proc in src/player_asm.s** — the PLAYER-2 top-down move
  (BW_GAME_STYLE 1 + PLAYER2_ENABLED), algorithmically identical to td_update (4-way
  RIGHT/LEFT/UP/DOWN, same leading-edge wall probe) but on the P2 globals
  (px2/py2/pad2/plrdir2/walk_speed2) + PLAYER2 dimensions. Reuses the dimension-free
  helpers (shr3/cell_solid/hprobe) via the shared pxw/pyw working copies; the
  dimension-baking helpers get P2 twins (p2_rows_from_py/p2_calc_cols with PH8_2/PW8_2).
  Sets jumping2/jmp_up2 = 0. project.inc now emits PLAYER2_W/H.

### Changed / migration
- **Gated under a new ca65 NES_ASM_PLAYER2 symbol** (like NES_ASM_SMB/RACER): the P2
  section imports the P2-only globals a single-player build never defines, so it is
  compiled ONLY for a wired 2-player build.
- **Not wired yet** (no C caller, no Makefile -D, no server gate) — dead code in
  current builds, absent flag-off. Flag off = byte-identical (golden 1730448e +
  _rom-equiv 54a15150 UNCHANGED); the 6 single-player A/B cases still pass.
  Assemble-checked both widths x {plain, NES_ASM_PLAYER2, all-P2-flags}.
- Next: wire P2 top-down (Makefile + C gate + server + 2-player A/B), then P2 racer,
  P2 platformer (simpler jump/gravity), P2 runner.

## v43 — 2026-07-08 — SHIP the ASM player physics by default (single-player)

### Changed / migration
- **The hand-written 6502 player physics now ship BY DEFAULT for single-player
  builds.** The server `nes_asm_player`/`nes_asm_smb`/`nes_asm_racer` gates no longer
  require the `PLAYGROUND_ASM_PLAYER` env toggle — they engage whenever the build is
  a single-player project of a covered style (top-down, platformer, SMB, auto-runner,
  racer). All six single-player models are A/B-proven byte-behaviour-identical to the
  C (asm-player.mjs) and flag-off byte-identical.
- **Two-player builds stay on the C for now** (the P2 second actors aren't on ASM
  yet): the gate excludes `player2_enabled` (mirrors build_scene_inc's p2_active).
  `PLAYGROUND_ASM_PLAYER=1` force-enables even 2P (for the forthcoming P2 A/B), and
  `PLAYGROUND_NO_ASM=1` remains the whole-engine kill switch.
- **Pinned hashes UNCHANGED** — golden `1730448e` (stock build has no custom main.c,
  so the player gate never fires) and `_rom-equiv` `54a15150` (its everything-on
  fixture is a 2-player project, now excluded). Server-only change (playground_
  server.py is git-versioned, not snapshotted); this bump documents the project↔ROM
  contract change (which builds get ASM), mirroring how scene-AI shipped at v30.
- Next: convert the P2 second actors to ASM (then 2P builds can ship ASM too).

## v42 — 2026-07-08 — top-down racer player update WIRED + A/B-verified (Phase 2c, OFF by default)

### Changed / migration
- **The top-down racer P1 player update now runs on hand-written 6502 under the
  flag, A/B-proven identical to the C.** platformer.c gates the C style-3 P1 block
  (`#if BW_GAME_STYLE == 3 && !defined(NES_ASM_PLAYER)`) and calls `racer_update()`
  in its place (`#if BW_GAME_STYLE == 3 && defined(NES_ASM_PLAYER)`). The 2-player
  P2 racer block stays in C (it uses the separate racer_*2 globals) — it rides with
  the player-2 model work; racer_update writes only the P1 globals.
- **Makefile:** `NES_ASM_RACER=1` implies NES_ASM_PLAYER (links player_asm.s + -D's
  out the C P1 block + calls racer_update()) and passes `-D NES_ASM_RACER` to ca65
  so player_asm.s compiles its racer section (racer_update + the racer-only globals
  it imports). **Server:** a distinct `nes_asm_racer` gate (line-anchored
  `\n#define BW_GAME_STYLE 3` AND is_scroll) → passes `NES_ASM_RACER=1`.
- A/B (`asm-player.mjs`): a 2-screen racer (SOLID border) steering (heading sweep)
  while accelerating — C ≡ ASM **px/py** at every matched tick over 400 ticks
  (diagonal motion from COS16 velocity, per-axis integrate, box_on_edge slide /
  world clamp at a border). Exercises the whole racer_update (rc_drive → rc_vel →
  rc_axis → rc_laps).
- **Still off by default / not shipped.** Linked only under PLAYGROUND_ASM_PLAYER;
  flag off = byte-identical (golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED).
  PLAYGROUND_NO_ASM=1 is the kill switch. **All six single-player models — top-down,
  platformer, SMB, auto-runner, racer (P1) — now run on 6502 behind the flag.**
  Remaining: the 2-player second actors (P2 platformer/top-down/racer).

## v41 — 2026-07-08 — top-down racer player update composed in ASM (Phase 2c, OFF/unwired)

### Added
- **racer_update proc in src/player_asm.s** — the TOP-DOWN RACER player update
  (BW_GAME_STYLE 3), composed from the four asm-lab-proven leaves in the C's order:
  rc_drive (steer + accel/friction/brake/reverse, signed-16) → rc_vel (vx/vy from a
  COS16 .byte table, signed product then arithmetic >>5) → rc_axis (per-axis
  integrate + world-clamp + box_on_edge slide, X before Y, then the dominant-axis
  speed >>1 bleed) → rc_laps (centre-cell checkpoint/finish FSM). box_on_edge is
  inlined (rc_axis3/rc_probe/rc_rbe). Guarded by if(!racer_finished) (P1 car only).
- **project.inc now emits RACER_*** (RACER_MAX_SPEED/ACCEL/FRICTION/BRAKE/REV_MAX/
  LAPS_TO_WIN/CP_COUNT/FINISH_ID/CHECKPOINT_ID/CHECKPOINT2_ID) — server derives
  MAX_SPEED/LAPS/CP_COUNT from the racerTopSpeed/racerLaps/racerCheckpoints knobs
  (same as builder-modules.js), the rest from the template #ifndef defaults. Same
  project-constants discipline as SMB_*/RUNNER_*.

### Changed / migration
- **Gated under a new ca65 NES_ASM_RACER symbol** (not just PX_WIDE): racer_update
  imports the racer-ONLY globals (racer_heading/speed/px_sub/py_sub/cp_stage/laps/
  finished), which a non-racer build never defines — so the whole section is
  compiled ONLY for racer builds, exactly like the SMB section's NES_ASM_SMB gate.
- **Not wired yet** (no C caller, no Makefile -D NES_ASM_RACER, server gate absent),
  so this is dead code in current flag builds and absent flag-off. Flag off =
  byte-identical (golden 1730448e + _rom-equiv 54a15150 UNCHANGED); the top-down +
  platformer + SMB + runner A/B all still pass. Assemble-checked both widths ×
  {plain, NES_ASM_RACER, NES_ASM_SMB, both}.
- Next: Makefile NES_ASM_RACER plumbing + gate the C style-3 block + racer_update()
  call + server _asm_player_racer gate, then A/B a racer project.

## v40 — 2026-07-08 — auto-runner player update WIRED + A/B-verified (Phase 2c, OFF by default)

### Changed / migration
- **The auto-runner player update now runs on hand-written 6502 under the flag,
  A/B-proven identical to the C.** platformer.c gates the C style-2 blocks under
  NES_ASM_PLAYER and calls `run_update()` in their place: the forced-scroll
  horizontal + respawn block (`#if BW_GAME_STYLE == 2 && !defined(NES_ASM_PLAYER)`)
  and the shared platformer vertical sub-blocks (ladder/jump-trigger +
  ascent/gravity — the gate widened from `!(style0 && flag)` to
  `!((style0 || style2) && flag)`). `prev_pad = pad` stays in C (run_update's jump
  trigger reads the old prev_pad). The `run_update` prototype is declared
  unconditionally (like smb_update).
- **Server:** the `nes_asm_player` gate now also accepts the runner — a new
  `_asm_player_runner` (line-anchored `\n#define BW_GAME_STYLE 2` AND is_scroll,
  matching the ASM's `.if PX_WIDE` gate; a runner is always multi-screen). No
  Makefile change (NES_ASM_PLAYER already links player_asm.s; the runner needs no
  ca65 -D).
- A/B (`asm-player.mjs`): a 2-screen runner (SOLID floor) autoscrolling with
  periodic A-jumps — C ≡ ASM **px/py/jumping** at every matched tick over 400
  ticks (autoscroll to px 318, track-end wrap respawn, jump take-off + gravity +
  landing). Exercises the whole run_update (run_hstep + pl_ladder/run_jump/pl_vmove).
- **Still off by default / not shipped.** Linked only under PLAYGROUND_ASM_PLAYER;
  flag off = byte-identical (golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED).
  PLAYGROUND_NO_ASM=1 is the kill switch. Top-down + platformer + SMB + auto-runner
  player physics are now all on 6502 behind the flag; racer + player 2 remain.

## v39 — 2026-07-08 — auto-runner player update composed in ASM (Phase 2c, OFF/unwired)

### Added
- **run_update proc in src/player_asm.s** — the AUTO-RUNNER player update
  (BW_GAME_STYLE 2), composed in the C's order: forced-scroll horizontal +
  respawn (run_hstep — cam_x += RUNNER_AUTOSCROLL, wrap at the track end, respawn
  on a spike at the body centre or on falling off the bottom; asm-lab-proven,
  functions/run_hstep) → the SHARED platformer vertical (pl_ladder detect+climb OR
  run_jump, then pl_vmove with a +2 fall). run_jump differs from pl_jump: the
  runner takes off on UP-edge OR A-edge (the auto-runner "tap to jump"), jmp_up=20,
  no run-boost/variable-cut. Imports _cam_x (scroll.c).
- **project.inc now emits RUNNER_AUTOSCROLL/SCREEN_X/SPIKE_ID/START_Y** (server
  derives AUTOSCROLL from the Builder autoscroll-speed knob, START_Y from the
  player start Y — same project-constants-via-project.inc discipline as SMB_*, so
  the ASM matches the C's tuned values). RUNNER_* prefixed to avoid colliding with
  scene.asminc's PLAYER_Y.

### Changed / migration
- **Gated under PX_WIDE** — an auto-runner is ALWAYS a multi-screen scroll build
  (autoscroll needs a track wider than one screen), so the whole runner section
  (the _cam_x import + run_update/run_hstep/run_jump/run_respawn + the export) only
  assembles when PX_WIDE. This keeps a 1-screen (non-scroll) build from importing
  _cam_x, which scroll.c defines only for a multi-screen world — so the top-down
  1-screen player build still links.
- **Not wired yet** — no C caller (the template still runs the C runner), and the
  server gate still excludes style 2, so this is dead code in current flag builds
  and absent flag-off. Flag off = byte-identical (golden 1730448e + _rom-equiv
  54a15150 UNCHANGED); top-down + platformer + SMB A/B still pass. Assemble-checked
  both PX_WIDE for both the SMB and non-SMB paths.
- Next: gate the C style-2 blocks under NES_ASM_PLAYER + call run_update() + extend
  the server gate to style-2 scroll builds, then A/B a runner project.

## v38 — 2026-07-08 — SMB player update WIRED + A/B-verified (Phase 2c 5b, OFF by default)

### Changed / migration
- **The SMB player update now runs on hand-written 6502 under the flag,
  A/B-proven identical to the C.** platformer.c gates the C SMB blocks (the SMB
  horizontal accel/skid, the shared ladder/jump-trigger — already covered by the
  `!(style 0 && NES_ASM_PLAYER)` gates — the SMB variable-cut, and the
  ascent/gravity) under NES_ASM_PLAYER and calls `smb_update()` in their place;
  the SMB-only fireball throw (BW_SMB_POWERUPS) + `prev_pad = pad` stay in C.
- **Real bug caught by the wired A/B and fixed:** `smb_accel` in player_asm.s
  hardcoded the asm-lab leaf's SMB tuning (walk 384 / run 640 / accel 24), but the
  Builder's Speed preset derives BW_SMB_WALK_MAX/RUN_MAX/ACCEL (e.g. Speed 2 =
  384/640/**48**), so the ASM velocity ramped at half the accel and the player
  lagged the C. Fixed by emitting `SMB_WALK_MAX/RUN_MAX/ACCEL` into project.inc
  (server derives them from the same Speed table + clamp as builder-modules.js)
  and having smb_accel read those instead of the hardcoded constants.
- **Makefile:** `NES_ASM_SMB=1` implies NES_ASM_PLAYER (links player_asm.s + -D's
  out the C blocks) and additionally passes `-D NES_ASM_SMB` to ca65 (new
  `$(ASFLAGS)` in the generic `.s` rule) so player_asm.s compiles its SMB section.
- **Server:** `nes_asm_player` now also accepts SMB via a distinct `nes_asm_smb`
  gate (line-anchored `\n#define BW_SMB_JUMP`) → passes `NES_ASM_SMB=1`.
- A/B (`asm-player.mjs`): a 2-screen SMB project (SOLID floor + 3-tall WALL + LADDER),
  player running RIGHT (B held) with periodic A-jumps — C ≡ ASM **px/py/jumping** at
  every matched tick over 400 ticks (accel/skid ramp, run-boosted jump, variable-cut,
  +3 gravity, wall bump, u16 crossing to screen 2). Exercises the whole smb_update
  (smb_accel → smb_hstep → pl_ladder / smb_jump → pl_vmove).
- **Still off by default / not shipped.** Linked only under PLAYGROUND_ASM_PLAYER;
  flag off = byte-identical (golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED).
  PLAYGROUND_NO_ASM=1 is the kill switch. Top-down + platformer + SMB player physics
  are now all on 6502 behind the flag; racer/runner + player 2 remain.

## v37 — 2026-07-08 — SMB player update composed in ASM (Phase 2c 5b-i, OFF/unwired)

### Added
- **smb_update proc in src/player_asm.s** — the SMB player update (BW_GAME_STYLE 0
  + BW_SMB_JUMP) composed from the asm-lab-proven SMB leaves: SMB horizontal
  (smb_accel signed-16 accel/skid -> smb_hstep integrate+world-clamp+collision) ->
  pl_ladder (reuse) OR smb_jump (A/UP-edge take-off + run-boost + variable-cut) ->
  pl_vmove with a +3 fall. pl_vmove's gravity step is now parameterised (a fall_amt
  byte: 2 platformer, 3 SMB); plat_update sets 2 (verified identical).

### Changed / migration
- **Not wired yet, and GATED under a new ca65 NES_ASM_SMB symbol** so the SMB
  section (which imports the SMB-only globals _smb_vx/_smb_px_sub) is compiled
  ONLY for SMB builds — a top-down/platformer build skips it and links fine.
  Assemble-verified both PX_WIDE for both the SMB and non-SMB paths. Flag off =
  byte-identical (golden 1730448e + _rom-equiv 54a15150 UNCHANGED); the top-down +
  platformer A/B still pass (pl_vmove fall_amt=2 keeps them identical).
- Next (5b-ii..iv): Makefile NES_ASM_SMB plumbing + gate the C SMB blocks + server
  gate for SMB + A/B a SMB project.

## v36 — 2026-07-08 — platformer player update WIRED + A/B-verified (Phase 2c 4b done, OFF by default)

### Changed / migration
- **The platformer player update now runs on hand-written 6502 under the flag,
  A/B-proven identical to the C.** The server `nes_asm_player` gate accepts a
  plain non-SMB platformer too (not just top-down): top-down emits a real
  `#define BW_GAME_STYLE 1`; a plain platformer emits none (defaults 0) and no
  `BW_SMB_JUMP`; SMB/runner/racer are excluded (plat_update covers only the
  non-SMB platformer). Detection is **line-anchored** — the template carries an
  explanatory comment containing the text `#define BW_GAME_STYLE 1` in every
  build, so a bare substring test false-matched; fixed in both the server gate
  and the A/B harness.
- A/B (`asm-player.mjs`): a 2-screen platformer (SOLID floor + WALL column +
  LADDER column), player walking RIGHT with periodic tick-keyed UP jumps — C ≡
  ASM **px/py/jumping** at every matched tick over 400 ticks (walk, gravity,
  jump arc, wall bump, ladder). This exercises the whole `plat_update`
  composition (hwalk + pl_ladder/pl_jump + pl_vmove) together.
- **Still off by default / not shipped.** Linked only under PLAYGROUND_ASM_PLAYER.
  Flag off = byte-identical (golden `1730448e` + `_rom-equiv` `54a15150`
  UNCHANGED). PLAYGROUND_NO_ASM=1 is the kill switch. Both top-down and platformer
  player physics are now on 6502 behind the flag; SMB/racer/runner + player 2 are
  the remaining Phase-2c models.

## v35 — 2026-07-08 — platformer player: gate the C blocks under the flag (Phase 2c 4b-ii, OFF by default)

### Changed / migration
- **platformer.c now gates the C platformer player blocks under NES_ASM_PLAYER**
  and calls `plat_update()` in their place (mirroring the top-down `td_update()`
  wiring). Precisely: the shared horizontal walk block's flag-exclusion now covers
  `(BW_GAME_STYLE==1 || ==0) && NES_ASM_PLAYER`; the ladder+jump-trigger portion
  and the jump-ascent/gravity portion each get `#if !(BW_GAME_STYLE==0 &&
  defined(NES_ASM_PLAYER))`; `prev_pad = pad` stays ungated (runs after
  plat_update, which reads the old prev_pad).
- **Still not reachable for platformers** — the server `nes_asm_player` gate still
  requires BW_GAME_STYLE==1 (top-down), so no platformer build sets the flag yet;
  the plat_update() call is present but never taken. Flag off = byte-identical:
  golden `1730448e` + `_rom-equiv` `54a15150` UNCHANGED (platformer-without-flag
  runs the C exactly as before). Top-down A/B (`asm-player.mjs`) still green.
- Next (4b-iii, 4b-iv): extend the server gate to plain platformers + A/B the
  wired platformer player — at which point flag-on drives it on 6502.

## v34 — 2026-07-08 — platformer player update composed in ASM (Phase 2c 4b-i, OFF by default)

### Added
- **`plat_update` proc in `src/player_asm.s`** — the PLATFORMER player update
  (BW_GAME_STYLE == 0) composed from the asm-lab-proven leaves, run in the C's
  exact order: horizontal walk (`hwalk`, the shared RIGHT/LEFT block as a callable
  proc so `td_update` stays untouched) → ladder detect+climb OR jump-trigger →
  vertical ascent/gravity (`pl_vmove`). Adds `bat`/`cell_solid_or_plat`; imports
  `_prev_pad`/`_climb_speed`. Both px widths (the pxw/pyw working-copy pattern).

### Changed / migration
- **Not wired yet** — `plat_update` is defined but not called by any C, and
  `player_asm.s` only compiles under `NES_ASM_PLAYER` (a top-down-only test toggle
  right now), so this is dead code in the top-down build and absent flag-off.
  Flag off = byte-identical (golden `1730448e` + `_rom-equiv` `54a15150`
  UNCHANGED). The top-down A/B (`asm-player.mjs`, both widths) still passes —
  `td_update` is untouched. Assemble-checked for both PX_WIDE.
- Next (4b-ii..iv): gate the C platformer blocks under NES_ASM_PLAYER + call
  `plat_update()`, extend the server gate to BW_GAME_STYLE 0, and A/B a platformer
  project — at which point flag-on drives the platformer player on 6502.

## v33 — 2026-07-08 — top-down player update: u8 (non-scroll) path (Phase 2c, OFF by default)

### Changed / migration
- **`td_update` (`src/player_asm.s`) now covers BOTH px/py widths**, completing
  top-down coverage. It loads px/py into 16-bit working copies at entry (hi=0 for
  u8) and stores them back width-appropriately at exit, so all the interior math
  is one 16-bit path and only the load/store branch on a new `PX_WIDE` `.define`
  (u16 ⟺ `BG_WORLD_COLS > 32 || BG_WORLD_ROWS > 30`, mirroring the C SCROLL_BUILD).
  The server `nes_asm_player` gate **drops the is_scroll requirement** — it now
  engages for any top-down build under `PLAYGROUND_ASM_PLAYER` (1-screen u8 or
  scrolling u16).
- Still OFF by default / not shipped. Flag off = byte-identical (golden `1730448e`
  + `_rom-equiv` `54a15150` UNCHANGED — the template is untouched this bump).
- A/B: `asm-player.mjs` now runs BOTH a 1-screen (u8) and a 2-screen (u16)
  top-down project — C ≡ ASM player px/py at every matched tick in each.
- ca65 gotcha recorded in the file: `.if PX_WIDE` needs `.define` (not `=`, which
  isn't visible to `.if` inside a `.proc`), and no parens around `>` (a
  parenthesised `>` is read as the hi-byte operator).

## v32 — 2026-07-08 — top-down player update on hand-written 6502 (Phase 2c, OFF by default)

### Added
- **Top-down player update on hand-written 6502** (`src/player_asm.s`, `td_update`,
  linked under `NES_ASM_PLAYER`) — the first player-physics loop on ASM. It is the
  4-way top-down move+collision (BW_GAME_STYLE == 1): RIGHT/LEFT probe the ahead
  column across every body row, UP/DOWN probe the two body columns at the ahead
  row, step `walk_speed` px if clear, then `jumping/jmp_up/on_ladder = 0` — the
  exact twin of the C. World bounds + player size come from the project.inc
  constants; px/py are u16 (it requires a SCROLL build, so the ASM is 16-bit only —
  the non-scroll u8 top-down path stays C). The leaf logic was proven in asm-lab
  (`functions/td_update`, 16 cases) alongside two supporting leaves,
  `px_integrate` (8.8 sub-pixel integrate) and `box_on_edge` (the box collision
  predicate).

### Changed / migration
- **Off by default / not shipped to pupils.** Linked only under the
  `PLAYGROUND_ASM_PLAYER` test toggle, and only for a scroll + top-down build.
  The C top-down block (the shared horizontal walk + the vertical block) is `#if`'d
  out only under `NES_ASM_PLAYER`, so **flag off is byte-identical**: golden
  `1730448e` and `_rom-equiv` `54a15150` are UNCHANGED (both are platformer builds,
  where the top-down gating is inert regardless). `PLAYGROUND_NO_ASM=1` is the kill
  switch.
- A/B: `asm-player.mjs` — a 2-screen top-down project, moving player (RIGHT+DOWN
  across the scroll boundary, wall bumps), C vs `PLAYGROUND_ASM_PLAYER`: C ≡ ASM
  player px/py at every matched tick over 300 ticks.
- Next (Phase 2c): the u8 (non-scroll) top-down path, then platformer/SMB/racer
  player updates, each behind the same flag; see the feasibility doc.

## v31 — 2026-07-07 — scene-sprite DRAW loop on hand-written 6502, SHIPPED BY DEFAULT

### Changed / migration
- **The scene-sprite DRAW loop now ships by default too** (Phase 2a, `scene_asm.s`
  `_draw_scene_sprites`), completing the "ASM by default" story alongside the v30
  AI loop. The server sets `NES_ASM_SCENE` for the shapes it handles: a **scroll**
  build (multi-screen, which pulls in NES_ASM_SCROLL) with **≥1 scene sprite** and
  **no tagged scene animation** (the ASM only does the plain draw path). Projects
  outside that envelope — 1×1/non-scroll, animated sprites, or no scene sprites —
  keep the C draw loop. `PLAYGROUND_NO_ASM=1` reverts the whole engine to C.
- **ROM output changes only for scroll + static-sprite + no-animation projects**
  (their OAM build is now the ASM path). Proven pixel-identical to the C —
  palette + OAM + nametables, including the SS_POS_WIDE u16 render — by
  `asm-scene.mjs` across platformer/top-down shapes and mixed sprite sizes.
- **Both pinned hashes are UNCHANGED** — `_rom-equiv` everything-on (`54a15150`)
  and the golden stock/template (`1730448e`) are both 1×1/non-scroll projects, so
  the scroll-gated draw-loop flip is a no-op for them.
- `PLAYGROUND_ASM_SCENE` (the old opt-in toggle) is now redundant/ignored.

## v30 — 2026-07-07 — scene-sprite AI on hand-written 6502, SHIPPED BY DEFAULT

### Changed / migration
- **The scene-sprite AI loop now ships to pupils by default.** The generic
  `ai_update` (walker/chaser/flyer/patrol) + the `bw_sprite_blocked` probe on
  hand-written 6502 (built up over v25–v29 behind the `PLAYGROUND_ASM_AI` test
  toggle) is now linked automatically: the server sets `NES_ASM_AI` whenever the
  project has at least one walker/chaser/flyer/patrol (detected by the emitted
  `ss_ai_type[...]` tables in the client main.c). Gating on the tables' PRESENCE
  is required — `ai_asm.s` imports `_ss_ai_type/state/speed/aux/home`, so forcing
  it on a table-less build would fail to link; a project with no AI enemies (or
  the stock main.c) stays pure C. **`PLAYGROUND_NO_ASM=1` is the kill switch** —
  it falls the whole engine, AI included, back to cc65 C.
- **ROM output changes for any project with an AI enemy** (the enemy movement is
  now the ASM path, not the cc65 C). Behaviourally identical to the C AI at every
  matched tick — proven by the `asm-ai`, `asm-ai-wide` (u16/scroll positions) and
  `asm-ai-corpus` (mixed sizes/speeds/types) A/B suites — and ~1.21× faster on a
  heavy enemy scene while leaving ~2.7 KB more free PRG (`asm-ai-bench`).
- **Re-pinned `_rom-equiv` everything-on hash** 27210a8f → **54a15150** (the byte
  change is the ASM AI loop; the pre-v30 pure-C-AI ROM is still reproducible with
  `PLAYGROUND_NO_ASM=1`). The **golden stock/template hash is unchanged**
  (`1730448e`) — those ROMs have no AI enemy, so the table-gated flip is a no-op
  for them.
- Flag semantics: `PLAYGROUND_ASM_AI` (the old opt-in toggle) is now redundant
  and ignored; the A/B suites still set it harmlessly. Only goomba/koopa (SMB)
  enemy AI remains in C.

## v29 — 2026-07-07 — scene-AI update loop: flyer on ASM (Phase 2b, off by default)

### Added
- **ai_update flyer dispatch on hand-written 6502** (`src/ai_asm.s`, NES_ASM_AI) —
  the generic `ai_update` loop now also owns the `flyer` AI (type 3): hovers ±20px
  in Y around a fixed home (direction in `ss_ai_state[i]`, signed offset in
  `ss_ai_aux[i]`, flip at ±20), writing `ss_y` ABSOLUTELY from `home+foff` each
  frame (overrides scene gravity), and drifts toward `px` in X with NO wall probe
  (flyers pass through) — the exact twin of the C flyer block, incl. the defeated
  guard (`ss_y[i] >= 0xEF`). The `home+foff` write reproduces the C `int`→ss_y
  wrap when the sum dips below 0 (8-bit add non-wide; 16-bit signed add with foff
  sign-extended when SS_POS_WIDE). Reuses the chaser's `ch_load_x`/`ch_le`/`ch_ge`
  + `add_speed`/`sub_speed` for the X drift.
- **New `ss_ai_home[]` uniform table** — the flyer needs a per-instance hover
  centre-Y constant (`clamp(inst.y,20,210)`); emitted alongside the other AI
  tables under NES_ASM_AI, 0 for non-flyers.

### Changed / migration
- **Default unchanged / not shipped to pupils.** Linked only under PLAYGROUND_ASM_AI.
  Flag off = byte-identical to v28 (golden 1730448e; _rom-equiv 27210a8f). Every
  existing enemy suite still green.
- **asm-ai.mjs** now also pens a flyer far LEFT of the player (home Y = 80, speed 1)
  so its Y-hover band and its RIGHT drift are both exercised in the compare window.
  Verified: C ≡ ASM `ss_x`/`ss_y` at every matched tick over 300 ticks incl.
  wall/edge turns, patrol bounce, chaser X+Y seek, and flyer Y-hover + X-drift.
- With flyer done, walker + chaser + flyer + patrol all run in ASM; only goomba/
  koopa (SMB) keep their C. Known gap (next): the SS_POS_WIDE (u16-position) path
  still isn't A/B'd (needs a scrolling moving-enemy harness); the wide paths for
  all four types are written but unverified.

## v28 — 2026-07-07 — scene-AI update loop: chaser on ASM (Phase 2b, off by default)

### Added
- **ai_update chaser dispatch on hand-written 6502** (`src/ai_asm.s`, NES_ASM_AI) —
  the generic `ai_update` loop now also owns the `chaser` AI (type 2): seeks the
  player on X then Y, probing 1px ahead (`bw_sprite_blocked`) before each step,
  and skips a defeated actor parked off-screen (`ss_y[i] >= 0xEF`) — the exact
  twin of the C chaser block. The `ss_x[i]+speed <= px` / `ss_x[i] >= px+speed`
  compares are unsigned and can carry past 8 bits, so they run 16-bit (hi=0 when
  not SS_POS_WIDE), matching the C `int`/`unsigned int` promotions for both the
  u8 and the u16 (scroll) position widths. New `add_speed_y`/`sub_speed_y` step
  ss_y; `ch_load_x`/`ch_load_y` + `ch_le`/`ch_ge` do the width-uniform compares.
  builder-modules.js sets type 2 + speed for chasers under NES_ASM_AI and
  `#ifndef`s out the C chaser block; walker + chaser + patrol now run in ASM.

### Changed / migration
- **Default unchanged / not shipped to pupils.** Linked only under PLAYGROUND_ASM_AI.
  Flag off = byte-identical to v27 (golden 1730448e; _rom-equiv 27210a8f). Every
  existing enemy suite still green.
- **asm-ai.mjs** now also pens a chaser placed far up-and-right of the player so
  its LEFT+DOWN seek is still in flight past the boot phase (wall stops its X, the
  floor stops its descent). Verified: C ≡ ASM `ss_x`/`ss_y` at every matched tick
  over 300 ticks incl. wall/edge turns, patrol bounce, and the chaser X+Y seek.
- Known gap (next): flyer still C; the SS_POS_WIDE (u16-position) path isn't A/B'd
  yet (needs a scrolling moving-enemy harness — the chaser wide path is written but
  unverified, like walker/patrol).

## v27 — 2026-07-07 — scene-AI update loop: patrol on ASM (Phase 2b, off by default)

### Added
- **ai_update patrol dispatch on hand-written 6502** (`src/ai_asm.s`, NES_ASM_AI) —
  the generic `ai_update` loop now also owns the `patrol` AI (type 4): back-and-
  forth over ±40px, direction in `ss_ai_state[i]`, signed offset in a new
  `ss_ai_aux[i]` byte (add/sub speed, flip at ±40) — the exact twin of the C
  patrol block. builder-modules.js emits the `ss_ai_aux` table + sets
  type/state/aux for patrols under NES_ASM_AI and `#ifndef`s out the C patrol
  block; walkers + patrols now both run in ASM, other AIs keep their C.

### Changed / migration
- **Default unchanged / not shipped to pupils.** Linked only under PLAYGROUND_ASM_AI.
  Flag off = byte-identical to v26 (golden 1730448e; _rom-equiv 27210a8f). Every
  existing enemy suite (walker-wall-stop, smb-enemies, topdown-enemies) still green.
- **asm-ai.mjs rewritten to a matched-tick / RAM-state comparison.** The old
  lockstep-frame OAM diff silently assumed both builds advance their game-loop
  tick at the same RATE; once a scene is heavy enough that one build drops frames
  the other doesn't, that breaks (it caught the 1-frame sprite-DMA lag as a phantom
  divergence — surfaced the moment the patrol was added). The new harness mirrors
  each enemy's real `ss_x`/`ss_y` into RAM at the tick point (no DMA lag) and walks
  the two builds by matched tick (advance whichever is behind), comparing positions
  only at equal tick — rate- and DMA-independent. Verified: C ≡ ASM at every matched
  tick over 300 ticks incl. wall/edge turns + patrol bounce.
- Known gap (next): chaser/flyer still C; the SS_POS_WIDE (u16-position) path
  isn't A/B'd yet (needs a scrolling moving-enemy harness).

## v26 — 2026-07-07 — scene-AI update loop (walker) on ASM (Phase 2b, off by default)

### Added
- **ai_update walker dispatch on hand-written 6502** (`src/ai_asm.s`, NES_ASM_AI) —
  a generic loop over NUM_STATIC_SPRITES that dispatches on a per-instance type
  byte and drives the walker AI (reverse at a bw_sprite_blocked leading edge, else
  step by the per-instance speed), calling the v25 ASM bw_sprite_blocked. Reads
  new uniform tables (`ss_ai_type`/`ss_ai_state`/`ss_ai_speed`) emitted by
  builder-modules.js under NES_ASM_AI. Non-walker AIs keep their C blocks (no
  cross-sprite dependency, so ASM-walkers-then-C-others is order-equivalent).
- SS_LINKAGE now de-`static`s the ss_* arrays under NES_ASM_AI too (ai_update
  imports ss_x/y/w/h). asm-ai.mjs now exercises the whole walker loop (the C
  walker block is #ifndef'd out; ai_update runs) — still OAM-identical every frame.

### Changed / migration
- **Default unchanged / not shipped to pupils.** Linked only under PLAYGROUND_ASM_AI.
  Flag off = byte-identical to v25 (golden 1730448e; _rom-equiv 27210a8f). Every
  existing enemy suite (walker-wall-stop, smb-enemies, topdown-enemies) still green.
- Known gap (next): the SS_POS_WIDE (u16-position) walker path isn't A/B'd yet
  (needs a scrolling moving-enemy harness); chaser/flyer/patrol still C.

## v25 — 2026-07-07 — scene-AI collision probe (bw_sprite_blocked) on ASM (Phase 2b, off by default)

### Added
- **bw_sprite_blocked on hand-written 6502** (`src/ai_asm.s`, NES_ASM_AI) — the
  per-enemy collision probe every walker/chaser/flyer/patrol calls each frame:
  probes the sprite's whole leading edge (4 directions) against SOLID_GROUND/WALL
  via the shipped `behaviour_at` (5-arg cc65 fastcall; args copied from the soft
  stack, `behaviour_at` called through `pushax`, `incsp4` cleanup). The first
  building block of the AI-update loop (design:
  `docs/design/2026-07-07-asm-ai-update-loop.md`).
- `builder-modules.js` now emits the C `bw_sprite_blocked` under `#ifndef
  NES_ASM_AI` (+ an extern prototype under the flag) so exactly one definition
  links. New A/B guard `tools/builder-tests/asm-ai.mjs`: a walled pen with walkers,
  dual-built pure-C vs AI-ASM, phase-aligned, OAM identical every frame over 400
  frames of motion incl. wall + world-edge turns.

### Changed / migration
- **Default unchanged / not shipped to pupils.** Linked only under the
  `PLAYGROUND_ASM_AI` test toggle (ASM-ready builds). Flag off = byte-identical to
  v24 (golden 1730448e; _rom-equiv 27210a8f).

## v24 — 2026-07-07 — scene-sprite DRAW loop on ASM (Phase 2a, off by default)

### Added
- **draw_scene_sprites on hand-written 6502** (`src/scene_asm.s`, NES_ASM_SCENE) —
  a generic loop over NUM_STATIC_SPRITES that reads the ss_* arrays and calls
  world_to_screen_x/y, replacing the template's PLAIN scene-draw loop (projects
  with tagged scene animations keep the C animated loop). Uses a running tile/attr
  pointer (row-major) and the project.inc SS_POS_WIDE flag to read ss_x/ss_y at the
  right width (u8/u16).
- project.inc gains **SS_POS_WIDE**; scene.inc's 7 draw-read arrays gain
  **SS_LINKAGE** (static normally; linker-visible under NES_ASM_SCENE). Emitted by
  the server (build_project_inc / build_scene_inc) + the checked-in fixture.
- New A/B guard `tools/builder-tests/asm-scene.mjs`: dual-builds scene shapes
  (multi-sprite, mixed sizes, top-down, SS_POS_WIDE off-screen + scrolled-on-screen)
  pure-C vs scene-ASM and asserts rendered-identical.

### Changed / migration
- **Default unchanged / not shipped to pupils.** The server links scene_asm.s only
  when `PLAYGROUND_ASM_SCENE=1` (a test toggle) AND the project scrolls, has scene
  sprites, and has no tagged scene animation. With the toggle off (every real
  /play) the ROM is byte-identical to v23 (golden 1730448e; _rom-equiv 27210a8f).

## v23 — 2026-07-06 — load_world_bg on ASM (scroll.c is now 100% hand-written 6502)

### Added
- **load_world_bg on hand-written 6502** (NES_ASM_SCROLL) — the boot-time
  nametable + attribute fill (rendering off, so no vblank timing). Running source
  pointers (no per-cell multiply), constant screen-offsets, top-test loops with
  jmp-backs for the outer screen loops. project.inc gains BG_WORLD_ATTR_COLS
  (server build_project_inc + checked-in). **scroll.c now has NO C bodies when
  NES_ASM_SCROLL=1** — the whole scroll subsystem is ASM.
- Verified: golden byte-identical (1730448e); the corpus's nametable comparison
  confirms every shape (1x1..2x2, WORLD_COLS=96, all-modules) loads the background
  rendered-identically.

### Changed / migration
- Default unchanged (golden 1730448e).

## v22 — 2026-07-06 — ASM generator: scroll_stream on ASM (scroll.c nearly all ASM)

### Added
- **scroll_stream on hand-written 6502** (NES_ASM_SCROLL) — the in-vblank
  column/row burst, unrolled via ca65 `.repeat` to stay inside the NTSC vblank
  budget (a loop would ghost-flash). scroll.c is now ASM except load_world_bg
  (boot-only). Verified: golden byte-identical; matched-progress A/B identical;
  asm-benchmark shows NO vblank-timing regression (still 0 dropped frames vs
  pure-C's 5). Row burst exercised behaviourally via the four-screen corpus.

### Changed / migration
- Default unchanged (golden 1730448e).

## v21 — 2026-07-06 — ASM generator: scroll_init on ASM + MULC hardening

### Added
- **`scroll_init` on hand-written 6502** (`NES_ASM_SCROLL`) — the camera/streamer
  init. Small, but it means the scroll subsystem's *entry point* is ASM too.
  (`scroll_stream` stays C — it is already optimally unrolled and vblank-timing
  sensitive; `load_world_bg` stays C — boot-only, complex address math. Both are
  the documented next candidates to finish scroll.c.)
- **`asm-lab/functions/mulc`** — a unit test for the `MULC` shift-add-by-constant
  macro (the core of Phase 1's `behaviour_at` / `advance_animation`
  generalisation). Proves `v*K` is exact for every world width the editor can
  produce — `K ∈ {32,64,96,128}`, including the non-power-of-two `96` (shift-add)
  that the shipped fixture never exercises. Hardens a now-shipped hot function.

### Changed / migration
- **Default unchanged** (golden `1730448e`); matched-progress A/B identical; full
  builder suite green. Behaviourally this is a no-op for the C engine.

## v20 — 2026-07-06 — ASM engine generator Phase 1: project.inc + 4 more functions

### Added
- **`src/project.inc`** — the server (`build_project_inc`) now emits per-project
  ASM constants (WORLD_COLS/ROWS, BG_WORLD_COLS/ROWS, PLAYER_*, sprite counts) as
  ca65 `.define`s, mirroring collision.h/bg_world.h/scene.inc. The hand-written
  modules `.include "project.inc"` (via `-I src`) so ONE fixed `.s` serves any
  project — ca65 bakes the values per build. First step of the generator plan
  (`docs/plans/current/2026-07-06-asm-engine-generator.md`).
- **`src/asm_macros.inc`** — `MULC resBase, CONST`: a shift-add multiply by an
  assemble-time constant (a shift for powers of two), used for the per-project
  index/offset math.
- **Four previously-`NES_ASM_SPECIALIZED` functions generalised and SHIPPED**
  (now under `NES_ASM_LEAF` / `NES_ASM_SCROLL`): `behaviour_at` (WORLD_COLS
  shift-add), `reaction_for` (NUM_BEHAVIOUR_SPRITES bound), `advance_animation`
  (PLAYER_TILES_PER_FRAME), `scroll_stream_prepare` (BG_WORLD_COLS stride +
  conditionally-assembled vertical row path for tall worlds). So `/play` now
  ships **10** hand-written 6502 functions — including the hot enemy/collision
  query `behaviour_at`.

### Changed / migration
- **Default unchanged.** Flags off ⇒ byte-identical to v19 (pure-C golden
  `1730448e`). Matched-progress A/B identical; full builder suite green across
  every world shape (1×1, 2×1, 1×2, 2×2, racer, SMB, topdown, runner). Shipped
  everything-on ROM re-pinned in `_rom-equiv.mjs` (`27210a8f`).
- The `behaviour.c` generator now gates `behaviour_at`/`reaction_for` behind
  `#ifndef NES_ASM_LEAF`; the `platformer.c` template gates the basic animation
  block behind `NES_ASM_ANIM` (the ASM `advance_animation` covers basic anim only
  — attack one-shots / racer rotation keep the inline C). `advance_animation`
  ships via `NES_ASM_LEAF` only when the project has no attack and isn't a racer.
- **ca65 note:** constants use `.define` (textual), not `SYM = value`, because
  ca65 won't fold an `=` constant inside a `.proc` scope for `.if` / macros.

## v19 — 2026-07-06 — universal hand-written 6502 engine SHIPS by default

### Changed / migration (ROM output changes — deliberate)
- **The `/play` server now builds the universal hand-written 6502 engine by
  default** for every platformer-derived project. Pupils' ROMs are no longer pure
  cc65 C: `read_controller`, `write_palettes` (`NES_ASM_LEAF`, any build) and —
  on scroll (multi-screen) builds — `world_to_screen_x/y`, `scroll_follow`,
  `scroll_apply_ppu` (`NES_ASM_SCROLL`) are hand-written 6502. Behaviourally
  identical to the C engine at matched game-logic progress (asm-lab settle-to-rest
  A/B); the win is headroom — the engine holds 60fps where pure C dropped frames.
- **Only the six project-INDEPENDENT functions ship.** The dimension-baked ones
  (`behaviour_at`→WORLD_COLS, `scroll_stream_prepare`→BG_WORLD_COLS,
  `advance_animation`→PLAYER_TILES_PER_FRAME, `reaction_for`→sprite count) plus
  `draw_text`/`clear_text_row` moved behind a new **`NES_ASM_SPECIALIZED`** flag
  (direct/lab builds only) — the server never ships them, so a project of any
  world/player size is safe.
- **Server gating.** `_build_in_tempdir` passes `NES_ASM_LEAF=1` (and
  `NES_ASM_SCROLL=1` for scroll builds) only when the `main.c` is ASM-ready — the
  stock main.c or a template-derived `customMainC` carrying the
  `NES_ASM_READY_V1` marker. A bespoke `customMainC` (e.g. the audio.html
  preview) lacks the marker and is built as pure C, so it can define those
  helpers itself without a clash. `palette_bytes` is emitted non-`static` so the
  ASM `write_palettes` can import it (linkage-only).
- **Kill switch:** set `PLAYGROUND_NO_ASM=1` in the server env to fall back to the
  pure-C engine for every build.
- **Golden invariant intact.** The byte-identity test builds via `make` with no
  flags (pure C) and is UNCHANGED (`1730448e…`); the flag-off ROM is still
  byte-identical. The shipped (ASM) everything-on ROM is re-pinned in
  `_rom-equiv.mjs` (`8172e353…`).

### Note
- The engine snapshot captures sources, not the server's build invocation, so a
  snapshot rebuild with `make` (no flags) reproduces the pure-C ROM — an
  acceptable behaviourally-identical fallback (byte-identity across engine
  versions was never guaranteed).

## v18 — 2026-07-06

### Added
- **First main-loop *gameplay* function on hand-written 6502:**
  `advance_animation` (extends `NES_ASM_LEAF`) in `main_asm.s`. This is the
  per-frame player animation state machine (mode-change reset → tick advance at
  `anim_frame_ticks` → frame wrap at `anim_frame_count` → `anim_base =
  anim_frame * PLAYER_TILES_PER_FRAME`). It runs on the engine-owned, already
  non-`static` `anim_*` globals — no per-project generated data — so it is a
  clean hand-conversion. The inline C block in `main.c` is preserved verbatim
  under `#else`; flag-on calls the ASM. Proven equivalent in
  `asm-lab/functions/advance_animation` (9 cases: mode-change reset, tick
  threshold, frame wrap, static `count==1`, the `*4` base).
- A compile-time `#error` guards the baked `PLAYER_TILES_PER_FRAME==4` (the ASM
  computes `anim_base` as `<<2`), so a project with a different player size fails
  loudly instead of silently baking the wrong shift.

### Changed / migration
- **Default unchanged.** Flags off ⇒ byte-identical to v17 (golden
  `d0a0fa7ad715`). At matched game-logic progress the all-ASM build (now
  including the anim state machine, exercised live every walking frame) is
  byte-identical to all-C (OAM/palette/nametables).
- **Boundary finding — the scene-sprite gravity loop stays in C.** The other hot
  main-loop block (per-enemy gravity) reads/writes the **server-generated
  `ss_x/ss_y/…` scene arrays**, which are `static` and whose element width
  varies u8↔u16 by sprite position and whose count varies per project. A stable
  hand-written twin isn't possible; it needs the *server* to emit a
  project-matched ASM variant (codegen generation) — the "full ASM engine"
  route. Its dominant per-sprite cost (`behaviour_at`) is already ASM.

## v17 — 2026-07-06

### Added
- **`scroll_stream_prepare` (horizontal column path) on hand-written 6502**
  (extends `NES_ASM_SCROLL`) in `scroll_asm.s`; C body gated with
  `#ifndef NES_ASM_SCROLL`. This is the function whose cc65-slow
  `bg_world_tiles[rr*64 + col]` index loop (30 iterations, each a 16-bit
  multiply + array load) pushed the column-stream frame over the NTSC vblank
  budget. The ASM replaces it with a constant **+64-stride pointer walk** down
  the column. Proven equivalent to the C in
  `asm-lab/functions/scroll_stream_prepare` (8 cases: no-cross, right/left
  boundary cross, NT0/NT1 select, col-0, out-of-world clamp, the column copy).
- **Shared streaming state de-`static`'d** in `scroll.c` (`col_buf`, `col_addr`,
  `col_pending`, `prev_cam_x`) so the ASM can `.import` them — linkage-only, BSS
  unchanged, default ROM byte-identical.

### Changed / migration
- **Default unchanged.** `NES_ASM_SCROLL` off ⇒ pure C ⇒ byte-identical to v16
  (golden `d0a0fa7ad715`). At matched game-logic progress the all-ASM build is
  byte-identical to all-C (cam_x, OAM, palette, nametables); the all-ASM engine
  holds 60 fps (0 dropped frames) over a scroll where pure-C drops 5.
- **Specialisation (documented):** the ASM `scroll_stream_prepare` bakes
  `BG_WORLD_COLS=64` and the horizontal-only world shape (like `behaviour_at`
  bakes `WORLD_COLS=64`). A vertically-scrolling world (`BG_WORLD_ROWS>30`) needs
  the C row path, so `NES_ASM_SCROLL` remains a horizontal-64-wide-world flag.
- **Left in C on purpose:** `scroll_stream`'s in-vblank burst is already fully
  unrolled by cc65 to `lda buf+N / sta $2007` (optimal), so an ASM twin would
  save ~nothing; `load_world_bg` runs once at startup (no per-frame budget).

## v16 — 2026-07-06

### Added
- **`scroll_apply_ppu` on hand-written 6502** (extends `NES_ASM_SCROLL`) in
  `scroll_asm.s`; the C body in `scroll.c` is gated with `#ifndef NES_ASM_SCROLL`.
  Folds `cam_y` into a 0..239 scroll value + vertical-band parity, derives the
  nametable-select bits (`cam_x` bit 8 → horizontal, band parity → vertical), and
  streams `$2000`/`$2005`/`$2005`, resetting the auto-increment stride to +1.
  Proven equivalent to the C in `asm-lab/functions/scroll_apply_ppu` (16 cases:
  the 256-px NT boundary, the 240-px band fold, the illegal 240..255 region, a
  full 0..479 range). The lab redirects the three PPU stores to a RAM capture
  buffer so ref-vs-asm is comparable; the engine version hits the real registers.

### Changed / migration
- **Default unchanged.** `NES_ASM_SCROLL` still defaults off ⇒ pure C ⇒
  byte-identical to v15 (golden hash `d0a0fa7ad715`, golden-safe).
- **A/B methodology corrected (finding, not a code change).** The settle-to-rest
  A/B was extended to sustained scrolling and surfaced a stable 6-px X offset on
  static sprites in the all-ASM build. Root-caused (not a bug): with RIGHT held
  and no walls, `px` advances once per main-loop iteration, so it doubles as an
  iteration counter — over 130 vblanks the all-ASM build ran 130 iterations while
  pure-C ran only 124. **The pure-C engine drops one frame per 30-tile
  column-stream burst (it overruns the NTSC vblank budget); the ASM engine is
  fast enough to hold 60 fps.** At *matched game-logic progress* (equal `px`) the
  two builds are byte-identical (cam_x, OAM, palette, nametables all equal). So
  the correct equivalence lens for a faster engine is matched-progress, not
  matched-vblank; the streamer conversion (next) should remove the drops outright.

## v15 — 2026-07-06

### Added
- **The last three lab-proven leaf helpers on ASM** (extends `NES_ASM_LEAF`):
  `write_palettes`, `draw_text`, `clear_text_row` in `main_asm.s`, C bodies
  gated. `draw_text`/`clear_text_row` are emitted in this build's `SCROLL_BUILD`
  variant (they `jsr scroll_apply_ppu`, matching the C exactly). To let the ASM
  reach the palette data, `palette_bytes` in `palettes.inc` is now non-`static`
  (a linkage-only change — the emitted bytes are unchanged, so the ROM stays
  byte-identical). Prototypes added for the three so their call sites compile
  when the bodies are gated out.
- **All 9 lab-proven engine functions are now integrated** (behind
  `NES_ASM_SCROLL` + `NES_ASM_LEAF`): `world_to_screen_x/y`, `scroll_follow`,
  `read_controller`, `behaviour_at`, `reaction_for`, `write_palettes`,
  `draw_text`, `clear_text_row`. Verified pure-C vs all-ASM: palette RAM +
  OAM identical at rest, scrolling, and jumping. (`draw_text`/`clear_text_row`
  are lab-proven; they are present-but-uncalled in Step_Playground's main.c, so
  the in-engine A/B exercises the other seven.)

### Changed / migration
- **Default unchanged.** Both flags default off ⇒ pure C ⇒ byte-identical to v14
  (golden-safe). NOTE for turning the flags on via the server (`/play`): the
  server's codegen (`playground_server.py` behaviour/palette emit + the
  `platformer.c` template for main.c) would need the same `#ifndef` gates +
  non-`static` `palette_bytes` so regenerated files match — a follow-up; today
  the flags are exercised by building `steps/Step_Playground` directly.

## v14 — 2026-07-06

### Added
- **Three more engine leaf helpers on hand-written ASM** (new opt-in flag
  `NES_ASM_LEAF`): `read_controller` (main.c → `main_asm.s`) and `behaviour_at`
  + `reaction_for` (behaviour.c → `behaviour_asm.s`). The C bodies are
  `#ifndef NES_ASM_LEAF`-gated; `read_controller` gains a forward prototype so
  the call still compiles when its body is gated out. Proven equivalent in
  `asm-lab/` (per-function harness) **and** in-engine: built pure-C vs
  all-ASM (leaf + scroll), OAM is identical at rest, while scrolling, and while
  jumping — the last two exercise the ASM `behaviour_at` collision and
  `read_controller` input every frame.
- Note: `behaviour_at`'s index multiply is specialised to this build's
  `WORLD_COLS=64` (a power of two → shifts). A general-`WORLD_COLS` variant is a
  follow-up; the flag is only enabled for matching builds.

### Changed / migration
- **Default unchanged.** `NES_ASM_LEAF` defaults off ⇒ pure C ⇒ ROM
  byte-identical to v13 (golden-safe). Build-time flag, not a project setting.

## v13 — 2026-07-06

### Added
- **`scroll_follow` on hand-written ASM** (opt-in, extends `NES_ASM_SCROLL`).
  The camera dead-zone follow is now in `scroll_asm.s`; the C body in `scroll.c`
  is `#ifndef`-gated. The per-project edge clamp is exposed as two flag-gated
  const globals (`scroll_max_cam_x/y = WORLD_*-SCREEN_*`) the ASM reads; the
  deadzone (96/144) is a fixed engine default baked in; an axis whose max is 0
  (single-screen) is skipped at runtime, matching the C's per-axis `#if`. Uses
  a private BSS scratch (`sf_*`), not cc65's shared `ptr1..4`. Proven equivalent
  in `asm-lab/` (20 cases incl. a dead-zone boundary sweep) **and** in-engine:
  built all-C vs all-ASM on a 64-col world, OAM is identical at rest and while
  scrolling once both settle. (A transient 1-frame offset appears only during
  the startup VRAM-load window because the faster ASM finishes the load ~1 frame
  sooner — the documented `-Os` load-timing sensitivity, not a logic difference.)

### Changed / migration
- **Default unchanged.** `NES_ASM_SCROLL` still defaults off ⇒ pure C ⇒ ROM
  byte-identical to v12/v11 (golden-safe). Build-time flag, not a project setting.

## v12 — 2026-07-06

### Added
- **Hand-written 6502 scroll helpers (opt-in)** — the first integration from the
  `asm-lab/` ASM-engine effort. A new fixed engine file
  `steps/Step_Playground/src/scroll_asm.s` provides ca65 versions of
  `world_to_screen_x` / `world_to_screen_y`, and the Makefile flag
  **`NES_ASM_SCROLL=1`** links them while `#ifdef`-ing out the matching C bodies
  in `scroll.c` (so exactly one definition of each symbol links). Multi-screen
  builds only (the ASM reads the `cam_x` global that a 1×1 ROM's empty
  `scroll.c` never defines). The ASM is proven byte-for-byte-behaviour-equal to
  the C in `asm-lab/` (unit harness: aligned / 255-256 & 239-240 boundaries /
  underflow / max) **and** in-engine: a 64-col world built both ways renders
  identical OAM across 160 frames incl. 80 of scrolling. Smaller + faster than
  cc65 -Os (20/24 bytes vs 66, no `pushax`/`ldax0sp` runtime helpers).

### Changed / migration
- **Default is unchanged.** `NES_ASM_SCROLL` defaults to `0`; with it off the
  build is pure C and the ROM is **byte-identical** to v11 (golden ROMs
  unaffected). The flag is a build-time toggle, not a project setting, so
  existing projects rebuild identically. Turning it on is the start of the
  engine running on hand-written assembly; more functions follow the same
  off-by-default pattern (see `asm-lab/STATUS.md`).

## v11 — 2026-07-06

### Added
- **Stomp to defeat (plain platformer)** (bug #15 "no way to kill an enemy").
  A new **Damage** module option — *"Jump on enemies to defeat them"* — plus a
  tunable **bounce height**. When Player 1 falls onto an enemy from above (not
  rising, feet within `BW_STOMP_MARGIN`=8px of the enemy's top) the enemy is
  defeated (parked at `y=0xFF`) and the player bounces (`jmp_up =
  BW_STOMP_BOUNCE`, default 12) instead of taking damage; a side/below touch
  still hurts. Platformer style only (it needs the jump/gravity state) and
  emitted `#ifdef BW_STOMP_DEFEAT`, so a project with the option off is
  **byte-identical**. The SMB style already had goomba/koopa stomp + fireballs;
  this brings a defeat mechanic to the basic platformer's walker/chaser/flyer/
  patrol enemies. Behavioural test `stomp-basic.mjs` (ON defeats + bounces;
  OFF leaves the enemy alive).

### Changed / migration
- **Chaser AI now skips a defeated (parked) actor.** The basic `chaser` seeks
  the player on both axes, so once a defeat mechanic (the new stomp) can park
  it at `y=0xFF` it would otherwise crawl its Y back on-screen. Guarded with
  `if (ss_y[i] < 0xEF)`. Only affects projects that place a `chaser`; the
  no-modules golden ROM and the walker/static `_rom-equiv` config are unchanged.

## v10 — 2026-07-06

### Added
- **Two new enemy paths** (bug #13 "more enemy paths") selectable per scene
  instance in the World dock's **AI** dropdown when the project targets v10+:
  - **flyer** — ignores gravity, bobs up and down a fixed ±20px range and
    drifts horizontally toward the player. A flying enemy for open air and
    ceilings; uses no wall probe, so it floats freely.
  - **patrol** — walks back and forth a fixed ±40px distance and turns on its
    own (no wall required), so it stays put on an open platform where a plain
    `walker` would march straight off the edge.
  Both use the existing per-instance **speed** (1..4). Emitted by
  `builder-modules.js` only when an instance's `ai` is `flyer`/`patrol` **and**
  the target engine is ≥10; on any older target they degrade to `walker`, so a
  design that picked one still builds and the non-flyer/patrol golden ROMs are
  byte-identical.

### Changed / migration
- None. Existing projects contain no `flyer`/`patrol` instances, so their ROM
  output is unchanged. New projects stamp `engineVersion: 10`.

## v9 — 2026-07-05

### Added
- **Tunable SMB speed** — the SMB horizontal max walk/run + accel are now
  `#define`s (`BW_SMB_WALK_MAX` / `BW_SMB_RUN_MAX` / `BW_SMB_ACCEL`) driven by a
  **Speed** preset (**1 slow … 5 fast**) in the Style tab. Fixes: the generic
  "walk speed" never affected the SMB style (it uses fixed-point velocity, not
  `walk_speed`), so changing it did nothing — now there's a control that does.
  Preset 2 ≈ SMB's 1.5 / 2.5 px/f; preset 5 ≈ 3 / 5. **Acceleration is snappier
  than SMB's authentic 0x18** at every preset (players found the original too
  gradual). Non-SMB golden ROM unchanged; the showcase ships at preset 3.
- **SMB OAM flicker** (`BW_OAM_FLICKER`, SMB + engine v9) — the engine rotates
  the scene-sprite OAM region one slot per frame, so a scanline with more than
  the NES's 8 sprites drops a **different** sprite each frame (a flicker) instead
  of the same one permanently — exactly how the real SMB copes with crowded
  rows. Player + HUD keep their fixed priority (drawn earlier). Toggle in the
  Style tab's Rendering panel. Stays **NROM** (decision D-9).

### Changed / migration
- No migration. Gated on `BW_OAM_FLICKER` (SMB game type, engine v9+), so every
  existing game (and pre-v9 targets) builds byte-identically — golden‑ROM
  hashes unchanged.

### Not yet
- **8×16 sprite mode** and a true **sprite-0 background HUD split** — larger
  rendering changes deferred as advanced polish; the 8×8 metasprites + OAM HUD
  work well and stay NROM. Column-stream scroll is already in place from the
  multi-screen work.

### Breaking
- (none.)

## v8 — 2026-07-05

### Added
- **Pipes** (`BW_SMB_PIPES`, SMB + engine v8) — hold **Down** while standing on
  a pipe cell to **warp** to a spawn spot: the classic underground bonus section
  of a tall (1×2) level, or any teleport. A position→spawn table
  (`bw_pipe_tbl`), placed in a **Pipes editor** on the World page.
- **Flagpole finish** (`BW_SMB_FLAG`, SMB + engine v8) — crossing a configured
  column **wins the level** (via the Win condition's `bw_won`) with a **+5000
  score bonus**. Toggle + column in the Style tab.

### Changed / migration
- No migration. Both are gated on their SMB flags (only emitted for the SMB game
  type on engine v8+), so every existing game (and pre-v8 targets) builds
  byte-identically — golden‑ROM hashes unchanged. The flagpole needs the Win
  condition module on; pipes warp **same-room** only (cross-room bonus areas use
  a per-door warp, which already exists).

### Not yet
- Cross-**room** pipe warps (use a door), a scripted flagpole slide animation,
  and the automatic **staircase** builder — a staircase is just painted solid
  tiles today, so it needs no engine feature.

### Breaking
- (none.)

## v7 — 2026-07-05

### Added
- **SMB HUD** — a new HUD module (`BW_SMB_HUD`, SMB game type + engine v7): a
  fixed on-screen read-out of **coins**, a **count-down timer**, a **score**
  and **lives**, drawn as **OAM digit sprites** at fixed screen positions (so it
  doesn't scroll with the level). The server seeds the 0-9 glyphs into the
  **sprite** pool at their ASCII indices, so the digits have art automatically.
- **Game logic:** the timer counts down ~every 0.4s and **time-up is a death**;
  each death **spends a life**; **coins add 200 to the score** (enemy-stomp
  points are a later addition). Digits spread over two tile-rows so no scanline
  exceeds the 8-sprite limit.
- Studio: a **HUD panel in the Style tab** (SMB) — toggle + start time + lives.

### Changed / migration
- No migration. All HUD code is gated on `BW_SMB_HUD` (only emitted for the SMB
  game type on engine v7+), so every existing game (and pre-v7 targets) builds
  byte-identically — golden‑ROM hashes unchanged. Needs Player HP for the
  time-up death / life spend.

### Not yet
- A true **sprite-0 background split** (SMB draws the HUD in the nametable and
  splits scroll mid-frame). The current HUD is OAM-sprite based — simpler and
  scroll-fixed, but costs sprites; the background/split version is deferred to
  the **v9** rendering pass. Also: a 6-digit score, enemy-stomp scoring, and
  deeper lives↔checkpoint-respawn integration.

### Breaking
- (none.)

## v6 — 2026-07-05

### Added
- **Interactive blocks** (`? / brick / coin`) — a new **Blocks** module on the
  SMB path (`#define BW_SMB_BLOCKS`, SMB game type + engine v6). A position→kind
  table (`bw_block_tbl`, mirroring the per-door table) + a `bw_block_used[]`
  state array drive three block behaviours in the per-frame path:
  - **coin** — collected on touch; `bw_coins++`.
  - **? block** — bump from below (while rising) to step the power state up
    (small→super→fire, when Power-ups are on) or +1 coin otherwise; then inert.
  - **brick** — bump from below; **breaks (vanishes) only while super**, else
    just bonks the head.
- **Runtime tile-graphics swap** — a consumed block queues a nametable poke
  (`bw_poke_*`, flushed in the vblank window) so its tile visibly changes: a
  collected coin / broken brick vanishes, and a used ? block shows a
  configurable **used tile**. Verified in jsnes (collecting a coin flips its
  nametable byte). *Limitation:* a block that scrolls off-screen and back is
  re-streamed from the `const` world map, so its art reverts even though it
  stays logically inert — fine for a forward-scrolling level.
- **? block contents choice + item pop-out** — each ? block picks what it gives:
  **coin**, **Super Mushroom**, **Fire Flower**, **Starman**, or **1-Up**. A
  power-up **rises out of the block** (a 1-slot dispense pool) — the mushroom
  then walks and falls onto the ground, the others sit — and applies its effect
  when the player touches it (reusing the v5 power state). Gated so a coin (or a
  power-up with no Power-ups module) just adds a coin.
- Studio: a **Blocks editor** in the WORLD dock (Maker+, SMB, engine v6) to
  place blocks and pick each one's kind, **contents** (for ? blocks), tile
  position, and used tile.

### Changed / migration
- No migration. All block code is gated on `BW_SMB_BLOCKS` (only emitted for the
  SMB game type on engine v6+, with a non-empty block list), so every existing
  game (and pre-v6 targets) builds byte-identically — golden‑ROM hashes
  unchanged.

### Not yet
- Invisible/hidden blocks (need runtime solidity change) and multi-coin bricks
  (bump-window timer) — deferred; and coin→**score** lands with the v7 HUD.

### Breaking
- (none.)

## v5 — 2026-07-05

### Added
- **Power-ups & fireballs** — the SMB power-up state machine, behind a new
  **Power-ups** module (`#define BW_SMB_POWERUPS`, SMB game type + engine v5):
  - A player **power state** — small → super → fire — set by touching items.
  - **Items** as a new Scene AI kind (`ai: 'item'`) with a `power`:
    **Super Mushroom** (→ super), **Fire Flower** (→ fire), **Starman**
    (invincibility timer), **1-Up** (full heal; true lives arrive with the HUD).
  - **Fireballs**: in the fire state, **B** throws one from a 2-slot pool —
    it arcs under gravity, bounces off the ground, despawns on a wall / off the
    world edge, and **defeats enemies** on contact.
  - The shared hurt path now **demotes a super/fire player to small** (instead
    of costing HP), and a **Starman** ignores hits entirely.
- **SMB-tuned jump/fall** for the smb style: the fall is now a touch faster
  than the rise (3 vs the rise speed) so the arc lands snappily — closer to the
  original. Gated on `BW_SMB_JUMP`, so all other styles are unchanged.
- **Performance — SMB enemy AI runs at full speed.** Two changes keep a wide,
  enemy-packed scrolling level inside the per-frame vblank budget (cc65 code is
  ~5× slower than asm, so the enemy AI was the dominant cost and a full screen
  of Goombas dropped the ROM below 30 fps): (1) Goomba/Koopa now turn at walls
  with a **single mid-line `behaviour_at` probe** (`bw_smb_wall`) instead of the
  5-arg, body-row-looping `bw_sprite_blocked` — measured **8 on-screen Goombas
  from ~25 fps to a full 60 fps**; (2) an **on-screen dormancy gate**
  (`BW_SMB_ONSCREEN`) skips AI for off-screen actors, exactly like the original.
  Both touch only the Goomba/Koopa path (the `walker`/`chaser` AIs and the
  golden ROM are unchanged).

### Changed / migration
- No migration. All power-up code is gated on `BW_SMB_POWERUPS` (only emitted
  for the SMB game type on engine v5+) and the faster fall on `BW_SMB_JUMP`, so
  every existing game (and pre-v5 targets) builds byte-identically — golden-ROM
  hashes unchanged. The **SMB showcase** starter now spans **two scrolling
  screens** and wires the power-ups; the Studio adds a Power-ups module card and
  an `item` Scene-AI option (with a power picker).

### Breaking
- (none.)

## v4 — 2026-07-05

### Added
- **SMB actor AIs** — two new per-instance enemy behaviours on the Scene page,
  the meat of the SMB‑1‑1 enemy set:
  - **Goomba** (`ai: 'goomba'`): walks side to side, reverses at walls, **walks
    off ledges** (no ledge sensing, exactly like SMB). **Stomping** it from
    above (player descending, feet in the sprite's top half) defeats it and
    bounces the player; any other touch hurts.
  - **Koopa Troopa** (`ai: 'koopa'`): a three-state machine — **walk → stomp
    turns it into a still shell → touching the still shell kicks it** into a
    shell that slides at 3 px/f away from the player, **chains kills** on other
    enemies it overtakes, and hurts the player on contact; stomping a sliding
    shell stops it again.
- Shared, index-parameterised `BW_SMB_TOUCH` / `BW_SMB_STOMP` / `BW_SMB_BOUNCE`
  / `BW_SMB_HURT` / `BW_SMB_GUARD` helpers. `BW_SMB_HURT`/`GUARD` respect the
  Damage module's invincibility frames (with sane fallbacks when Damage is off),
  so a stomp never also counts as a side-hit — the actor AIs compose with the
  Damage module in either apply order.

### Changed / migration
- No migration. The `goomba`/`koopa` AIs only emit when the design targets
  **engine v4+**; a pre-v4 target (and the pinned v1 pages) degrades them to the
  plain `walker`, so every existing game builds byte-identically — golden‑ROM
  hashes unchanged. The advisor tells v3 designs that upgrading to v4 unlocks
  the SMB enemies.

### Breaking
- (none.)

## v3 — 2026-07-05

### Added
- **SMB game style** (`🍄 SMB platformer`): the platformer engine plus the
  signature **variable-height jump** — A jumps (as well as Up), a tap is a
  short hop and a hold is a full jump (releasing A+Up mid-rise cuts the
  ascent to a small minimum), and a running take-off (B held) jumps higher.
  Emitted as `#define BW_SMB_JUMP 1` on top of `BW_GAME_STYLE 0`, so it reuses
  the proven platformer path. First step of the SMB‑1‑1 roadmap
  (`docs/plans/current/2026-07-05-smb-engine-roadmap.md`).
- **SMB fixed-point horizontal physics**: signed 8.8 velocity (`smb_vx`) with a
  sub-pixel accumulator — accelerate to a walk (1.5 px/f) or run (2.5 px/f, hold
  B) max, friction decel on release, **2× skid** on reversal, leading-edge
  solid/wall collision cancels the step.

### Changed / migration
- No migration. `BW_SMB_JUMP` is emitted only for the new `smb` game type on
  engine‑v3+ pages, so every existing game (and the v1/v2 game types) builds
  byte-identically — golden‑ROM hashes unchanged.

### Breaking
- (none.)

## v2 — 2026-07-05

### Added
- **Per-door destinations.** Each Door tile can carry its own spawn point and
  target background (same-room teleport *or* a room swap), instead of one
  spawn/target shared by every door. Authored in WORLD → Doors; stored as
  `builder.modules.doors.config.doorList` (`[{bg,tx,ty,spawnX,spawnY,targetBgIdx}]`).
  Emits a `bw_door_tbl[]` lookup keyed by (room, tile-x, tile-y).

### Changed / migration
- **No migration needed.** An empty `doorList` (all existing v1 projects)
  builds the exact v1 single-global-door code — byte-identical ROM, so the
  golden-ROM hash is unchanged. A v1 game opened here still works; to use
  per-door destinations, configure the door list.

### Breaking
- (none.)

## v1 — 2026-07-05 (baseline)

The shipped engine as of the `redesign/ui-ux` merge: four game types
(platformer, top-down, auto-runner, two-player racer), scrolling multi-screen
worlds (editor caps at 2×2), checkpoints, spawn effects, NPC dialogue with a
reserved BG glyph sub-palette, the behaviour map + sprite-reactions table,
16×16 metatile expansion, single global door (one shared spawn/target),
mapper-0 / 1× CHR bank, 8×8 sprites.

### Added
- (baseline — no prior version.)

### Changed / migration
- Projects created from here carry `state.engineVersion = 1`. Projects
  without the field are treated as v1.

### Breaking
- (none.)
