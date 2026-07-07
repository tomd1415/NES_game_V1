# Phase 2b — scene-sprite AI-UPDATE loop on hand-written 6502

Design for converting the enemy-movement (AI-update) loop to generic ASM. This
is the hard half of Phase 2 (the draw loop, 2a, shipped at engine v24). Written
2026-07-07. Companion: [`../plans/current/2026-07-06-asm-engine-generator.md`].

## The problem

Today the AI update is emitted by `builder-modules.js` as **per-instance unrolled
C** — each enemy gets a bespoke block with hardcoded index and per-instance scalar
state, e.g. the walker:

```c
{ static signed char bw_dir_0 = 1;
  if (bw_dir_0 > 0) { if (bw_sprite_blocked(ss_x[0],ss_y[0],ss_w[0],ss_h[0],0)) bw_dir_0=-1; else ss_x[0]+=SPEED; }
  else              { if (bw_sprite_blocked(ss_x[0],ss_y[0],ss_w[0],ss_h[0],1)) bw_dir_0= 1; else ss_x[0]-=SPEED; } }
```

Types: `walker`, `chaser`, `flyer`, `patrol`, plus SMB `goomba`/`koopa`. Each has
distinct logic and state (`bw_dir_i`, `bw_foff_i`, `bw_pdir_i`/`bw_poff_i`, …).
This is the `rewrites/` anti-pattern: not a loop, can't generalise as-is.

## Strategy — a PARALLEL uniform path (keep flag-off byte-identical)

Do NOT restructure the shipped C (that would break the golden invariant). Instead,
when the ASM AI flag is on, the server emits a **uniform data model** the ASM loops
over, and `#if`s out the per-instance C blocks. Flag off → unchanged C → byte-identical.

### Uniform data model (new, emitted only under the flag)

Per scene sprite `i`, parallel arrays (all `SS_LINKAGE`, like the draw arrays):
- `ss_ai_type[i]`  — 0=none/static, 1=walker, 2=chaser, 3=flyer, 4=patrol (goomba/
  koopa fold to walker+flags in older engines; map per targetEngine).
- `ss_ai_speed[i]` — the per-instance `clampInt(speed,1,4)`.
- `ss_ai_state[i]` — the AI's mutable byte (walker/patrol direction, etc.); seeded
  to match the C initialiser (walker `bw_dir` = 1).
- (flyer/patrol need a second byte — `ss_ai_aux[i]` — for the oscillation offset.)

`project.inc` already carries `NUM_STATIC_SPRITES`. Add `.define`s only if a type
needs a shared constant; per-instance values live in the tables above.

### The building blocks (leaf-first, each its own milestone)

1. **`bw_sprite_blocked` → ASM** — ✅ **DONE (engine v25, `src/ai_asm.s`).** 5-arg
   cc65 fastcall; NB cc65 pushes args L→R onto a downward stack so the LAST arg is
   at `(sp),0` (`sh`@0, `sw`@1, `sy`@2, `sx`@3). Copies args to BSS locals, loops
   the leading edge calling `_behaviour_at` via `pushax`, 16-bit `>>3` edge math,
   `jmp ret1/ret0 → incsp4`. Gated `NES_ASM_AI` (server `PLAYGROUND_ASM_AI` toggle),
   flag-off byte-identical. A/B: `asm-ai.mjs` (walled pen, phase-aligned, OAM
   identical over 400 frames incl. wall + edge turns).
2. **`ai_update` generic loop (walker)** — ✅ **DONE (engine v26, `_ai_update` in
   `ai_asm.s`).** Loops NUM_STATIC_SPRITES, dispatches on `ss_ai_type[i]`, drives
   walkers (reverse at a `bw_sprite_blocked` edge else step by `ss_ai_speed[i]`,
   dir in `ss_ai_state[i]`). builder-modules.js emits the uniform tables + the
   `ai_update()` call under NES_ASM_AI and `#ifndef`s out the C walker blocks;
   non-walker AIs keep their C (order-equivalent). A/B: `asm-ai.mjs`.
   - **Gap:** the SS_POS_WIDE (u16-position) walker path isn't A/B'd yet — needs a
     scrolling moving-enemy harness (phase alignment under stream drops). The
     non-wide walker (the common case) is proven.
3. **`ai_update` patrol dispatch** — ✅ **DONE (engine v27, `_ai_update` in
   `ai_asm.s`).** Adds the `patrol` type (4): back-and-forth over ±40px, dir in
   `ss_ai_state[i]`, signed offset in a new `ss_ai_aux[i]` byte. builder-modules.js
   emits the `ss_ai_aux` table + `#ifndef`s out the C patrol block. A/B: `asm-ai.mjs`.
4. **`ai_update` chaser dispatch** — ✅ **DONE (engine v28, `_ai_update` in
   `ai_asm.s`).** Adds the `chaser` type (2): seeks `px`/`py` on X then Y, probing
   1px ahead each axis, skipping a defeated actor (`ss_y[i] >= 0xEF`). The
   toward-player compares are unsigned + can carry past 8 bits, so done 16-bit
   (hi=0 when not wide) — twin of the C for both position widths. builder-modules.js
   sets type 2 + `#ifndef`s out the C chaser block. A/B: `asm-ai.mjs` (chaser
   seeking the player, LEFT+DOWN, wall + floor stops).
5. **`ai_update` flyer dispatch** — ✅ **DONE (engine v29, `_ai_update` in
   `ai_asm.s`).** Adds the `flyer` type (3): hovers ±20px in Y around a new
   per-instance `ss_ai_home[i]` constant (dir in `ss_ai_state[i]`, signed offset
   in `ss_ai_aux[i]`), writing `ss_y` absolutely from `home+foff` (reproduces the
   C sign-wrap), and drifts toward `px` in X with no probe. builder-modules.js
   emits `ss_ai_home` + `#ifndef`s out the C flyer block. A/B: `asm-ai.mjs`.
   With this, walker + chaser + flyer + patrol all run in ASM (only goomba/koopa
   keep C).
6. **Close the SS_POS_WIDE (u16-position) A/B gap** — a scrolling moving-enemy
   harness that phase-aligns under stream drops and verifies all four ASM types
   in wide mode (their wide paths are written but unverified). **← next.**

### Verification methodology (learned the hard way at the patrol milestone)

The A/B **must** compare **RAM enemy state at matched tick**, not OAM in
lockstep-by-frame. The two builds have different per-frame CPU cost, so once a
scene is heavy enough that one drops a frame the other doesn't, their game-loop
tick counters advance at **different rates** — a lockstep frame diff then either
mis-aligns the phase or reports the one-frame sprite-DMA lag as a phantom
divergence (this is exactly what "phase slipped at frame 0" was when the patrol
was added — the ASM was *correct*). The robust harness (now in `asm-ai.mjs`):
mirror each enemy's real `ss_x`/`ss_y` into known RAM at the tick point (written
synchronously with the AI update — no DMA lag), then walk the two builds by
matched tick (advance whichever is behind on the tick counter) and compare the
mirrored positions only when both sit on the same tick. At equal tick both builds
have run the AI the same number of times, so identical AI ⇒ identical positions.
Rate- and DMA-independent; validated to report 0 diffs on the known-good
walker-only case and to catch a real per-tick position divergence.

### Gating

New flag `NES_ASM_AI` (Makefile + server, `PLAYGROUND_ASM_AI` test toggle until
proven, like `PLAYGROUND_ASM_SCENE`). The server emits the uniform tables + `#if`s
out only the C AI blocks for types the ASM handles this milestone. Requires the
shipped `behaviour_at` (NES_ASM_LEAF). Not shipped to pupils until the whole type
set is covered + broadly A/B-proven, then flip default + bump engine + re-pin.

## Verification

Extend `asm-enemy.mjs` (the phase-aligned moving-enemy harness): build C vs
`PLAYGROUND_ASM_AI` with walkers (then each type), align the constant boot phase
via the injected tick counter, and assert OAM byte-identical every frame across
300 frames of motion — including a walker turning at a wall (the `bw_sprite_blocked`
path) and at the world edge.

## Byte-identity checklist (every milestone)

- Flag off: `_rom-equiv` + golden unchanged (the C blocks + `bw_sprite_blocked` C
  body are `#if`-gated, tables emitted only under the flag).
- Engine bump + CHANGELOG + `snapshot-engine.mjs` per versioned-engine rules.
