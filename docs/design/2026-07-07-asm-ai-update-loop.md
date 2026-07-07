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

1. **`bw_sprite_blocked` → ASM** (`scene_asm.s` or a new `ai_asm.s`). 5-arg cc65
   fastcall: `dir` in A, `sx/sy/sw/sh` at `(sp),0..3`; copy all to locals at entry
   (the `behaviour_at` calls move `sp`), loop the leading edge calling the shipped
   `_behaviour_at` via `pushax` (push col, row in A/X), return 0/1 in A, `jmp incsp4`.
   Reusable by every AI type. Ship-safe on its own (C callers just bind the ASM
   symbol; behaviour identical → A/B green). **← first milestone.**
2. **`ai_update` generic loop** — `for i in 0..NUM_STATIC_SPRITES: dispatch on
   ss_ai_type[i]`. Start with **walker only** (type 1), other types fall through to
   a no-op (their C blocks stay when the loop doesn't handle them — mixed mode is
   fine as long as each type is handled by exactly one of C/ASM). Walker logic is a
   direct transcription of the C above, reading `ss_ai_speed`/`ss_ai_state`.
3. Extend the dispatch to chaser (needs `px`/`py`), flyer (`ss_ai_aux` hover),
   patrol (`ss_ai_aux` bounce), one type per milestone, each A/B-verified.

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
