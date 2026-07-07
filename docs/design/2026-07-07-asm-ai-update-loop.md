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
3. Extend the dispatch to chaser (needs `px`/`py`), flyer (`ss_ai_aux` hover),
   patrol (`ss_ai_aux` bounce), one type per milestone, each A/B-verified. **←
   next.**

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
