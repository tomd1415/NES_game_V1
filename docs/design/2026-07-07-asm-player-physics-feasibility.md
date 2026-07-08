# Phase 2c — the player physics/update loop on hand-written 6502 (feasibility + plan)

Written 2026-07-07, after the scene-sprite AI loop shipped on ASM by default
(engine v30) and the scene-draw loop (v31). Companion:
[`2026-07-07-asm-ai-update-loop.md`](2026-07-07-asm-ai-update-loop.md),
[`../plans/current/2026-07-06-asm-engine-generator.md`].

## Why the player loop is the next target — and the hardest one

The per-frame **player update** (read pad → integrate velocity → resolve
collision → jump/gravity state → animation) runs **every frame of every
project**, not just SMB or enemy-packed levels. So unlike goomba/koopa (see
"Deferred" below), converting it pays off for the whole corpus. It is also the
last big cc65 hot loop the ASM engine doesn't own.

It is also the **most intricate C in the engine**, for four reasons:

1. **Four+ game-type variants**, each a different physics model (all in
   `builder-templates/platformer.c`, selected at compile time):
   - platformer — LEFT/RIGHT walk, UP jump, gravity, ladders;
   - top-down — 4-way movement, no gravity;
   - racer — 16-direction heading, 8.8 accel/friction, per-axis edge collision
     (`racer_box_on_edge`, a 3×3 body probe);
   - runner — autoscroll + tap-to-jump (reuses the platformer gravity block);
   - SMB — 8.8 fixed-point horizontal accel/decel (`smb_px_sub`, run vs walk).
2. **8.8 fixed-point math** — sub-pixel accumulators (`px_sub`/`py_sub`,
   `smb_px_sub`, `fb_vx/fb_vy`, `acc = sub + v; np = pos + (acc>>8)`). 16-bit
   signed adds + arithmetic shifts, easy to get subtly wrong vs cc65's codegen.
3. **Per-axis collision resolution** — X and Y are moved and resolved
   independently against `behaviour_at` (already ASM), each rolling back on a
   hit. Ordering and the exact rollback are load-bearing.
4. **Duplication + coupling** — a full second player (`px2`/`jumping2`/… co-op),
   plus coupling to `cam_x` (scroll), the animation state machine, HP/damage,
   and the SMB enemy macros (which read `jumping`/`jmp_up`/`px`). Flipping player
   physics to ASM interacts with the already-shipped scroll + AI ASM.

Net: this is a **Phase-2c** effort materially larger than the AI loop (which was
four self-contained movement types). It must stay behind an off-by-default flag
(`NES_ASM_PLAYER`, like `PLAYGROUND_ASM_AI` was) until each slice is A/B-proven,
then flip per game-type — not all at once.

## Leaf-first plan (each its own milestone, each A/B-verified)

Order chosen so every step is byte-behaviour-verifiable before the next:

1. **Sub-pixel integrate helper** — ✅ **DONE** (`asm-lab/functions/px_integrate/`).
   `(pos, sub, vel) -> (pos', sub')` in 8.8 (`acc = sub + v; pos += acc>>8;
   sub = acc & 0xFF`). 15-case unit test incl. backward-fractional, 16-bit wrap,
   overflowing v — asm == C == JS model.
2. **Axis collision-resolve helper** — ✅ **DONE** (`asm-lab/functions/box_on_edge/`).
   `racer_box_on_edge` as a callable ASM predicate (16-bit box->cells per axis +
   5 `behaviour_at` probes, short-circuit). 14-case unit test (corners, centre,
   straddle, floor, bx>=256 out-of-map) — asm == C == JS model. **← leaves done;
   next is the first wired-in update (3).**
3. **top-down player update** — simplest full model (4-way, no gravity, no
   fixed-point run accel). First end-to-end `NES_ASM_PLAYER` game type. A/B:
   extend `asm-realproj.mjs` with a top-down variant + scripted 4-way input,
   matched-tick on `px`/`py`.
4. **platformer player update** — walk + jump + gravity + ladders. A/B with
   scripted LEFT/RIGHT/UP over a walled+laddered level.
5. **SMB player update** — the 8.8 run/walk accel path (`smb_px_sub`). A/B must
   include the enemy-stomp coupling (BW_SMB_* read `jumping`/`jmp_up`), so run it
   on a scene with goombas (which stay C — see below) and assert both player AND
   enemy state match.
6. **racer / runner** — the remaining two models.
7. **player 2** — the co-op duplicate; likely falls out of the shared code once
   the single-player path is ASM (parameterise on a player index).

## Verification (reuse what's proven)

The matched-tick / RAM-state method (mirror real `px`/`py` + enemy `ss_x`/`ss_y`
into RAM at the tick point, walk both builds by matched tick, compare only at
equal tick) already handles the frame-rate divergence and is now used by
`asm-ai{,-wide,-corpus}` and `asm-realproj`. Extend `asm-realproj.mjs` per game
type with a **scripted input sequence keyed to the tick** (not the frame), so
both builds see identical input at identical game-ticks. Keep `asm-ab.mjs`
(lockstep player-motion, universal engine) as the light smoke test.

Byte-identity checklist per milestone (unchanged): flag off → `_rom-equiv` +
golden unchanged; engine bump + CHANGELOG + snapshot; re-pin only when a flip
lands, and note why.

## Deferred: goomba/koopa (SMB enemy AI) → ASM

Assessed 2026-07-07 and **deferred** (kept in cc65 C). Rationale: unlike the
generic AI types, goomba/koopa are a **player-physics/damage/camera state
machine**, not self-contained movement — `BW_SMB_STOMP` reads `jumping`/`jmp_up`,
`BW_SMB_BOUNCE` writes them, `BW_SMB_HURT`/`GUARD` write `player_iframes`/HP
(conditionally compiled on `PLAYER_HP_ENABLED`), `BW_SMB_ONSCREEN` reads
`cam_x`, and a kicked koopa mutates other enemies' `ss_y`. Re-implementing all
that in 6502 byte-behaviour-identically is high surface area and high risk, for a
movement cost that is **already cheap** (`bw_smb_wall` is one `behaviour_at`
lookup, not the generic full-edge probe loop), and only for SMB projects. The
clean subset (movement) isn't separable without restructuring the shipped C
block (splitting move from touch inside the on-screen gate), which would risk the
flag-off byte-identity. Revisit only after the player loop is ASM — at which
point `jumping`/`jmp_up`/iframes will already have ASM accessors to reuse.
