# Tuned ASM Step Games

This directory contains hand-tuned 6502/ca65 rewrites of the modular tutorial
games in `../step_game_modular`. It is intentionally separate from both:

- `../step_game_modular`: the readable C version
- `../step_game_asm_generated`: the compiler-generated ASM baseline

No original project files are required to change to evaluate this work.

## Why This Is Worth It

The NES is a small machine: the CPU is slow, vblank time is short, and every
extra helper call matters when sprites, input, PPU writes, collisions, and
dialogue all happen every frame. The generated cc65 output is correct, but it
often pays a lot of overhead for small C helpers: parameter-stack setup,
boolean helper calls, redundant register loads, and generic pointer/index code.

The tuned versions replace that with direct, domain-specific 6502:

- Controller reads use the standard 8-read `lsr`/`rol` loop.
- Palette and scroll writes go straight to PPU registers.
- Player/enemy/item/NPC drawing writes directly to OAM in the exact order used
  by the game, without stack-heavy `draw_sprite` calls.
- Movement, gravity, patrols, collision checks, and dialogue state use simple
  branches instead of cc65 boolean/runtime helpers.
- Values a pupil or developer is likely to change are grouped near the top of
  each `src/main.s` in a `TUNABLES` block.

## Measured Improvements

These are source-level and helper-call reductions against
`../step_game_asm_generated`, not padded `.nes` file sizes. NROM ROM files are
fixed/padded, so source and helper-call counts are a better signal here.

| Step | Generated lines | Tuned lines | cc65 helper calls before | after |
| ---- | --------------- | ----------- | ------------------------ | ----- |
| Step 1 | 632 | 320 | 45 | 0 |
| Step 2 | 681 | 329 | 46 | 0 |
| Step 3 | 1331 | 675 | 155 | 0 |
| Step 4 | 1738 | 834 | 222 | 0 |
| Step 5 | 2130 | 1026 | 267 | 0 |

That makes the code easier to audit at the assembly level and removes a large
amount of generic cc65 runtime traffic from the hot path.

## What Is Tuned

All five steps now have hand-written tuned `src/main.s` files:

- `Step_1_Player_Movement`
- `Step_2_Background_Level`
- `Step_3_Enemies_And_Items`
- `Step_4_Dialogue`
- `Step_5_Multi_NPC_Dialogue`

Each file keeps related routines grouped by job: setup, input, player update,
gravity, enemies, item collision, dialogue, and drawing.

## Tunable Values

Each tuned ASM file has a clear `TUNABLES` block near the top. Common values:

- `PLAYER_START_X`, `PLAYER_START_Y`
- `FLOOR_Y`
- `JUMP_FRAMES`
- `MOVE_SPEED`
- `JUMP_PIXELS`, `FALL_PIXELS`
- enemy start positions and patrol bounds
- NPC positions
- pickup positions
- palette color constants
- Step 5 dialogue box layout constants

See `TUNABLES.md` for a quick index.

## Verification

Run:

```sh
node rewrites/step_game_asm_tuned/test_tuned_accuracy.mjs
```

The test:

- force-builds the generated ASM baseline and tuned ASM ROMs
- boots each ROM in jsnes
- runs frames
- compares CPU WRAM game state
- compares palette writes
- compares loaded background nametable tiles
- compares visible OAM sprite bytes

Current result:

```text
Step 1 OK
Step 2 OK
Step 3 OK
Step 4 OK
Step 5 OK
All tuned ASM smoke tests passed.
```

## Honest Drawbacks

This rewrite is not “free performance.” The tradeoffs are real:

- Hand ASM is harder to modify safely than C. A small branch or carry mistake can
  become a gameplay bug.
- The tuned code is more specialized. It is excellent for these tutorial steps,
  but less generic than the C helpers.
- The current smoke tests verify startup/normal-frame behavior, state, palettes,
  backgrounds, and OAM. They do not yet simulate every possible controller path,
  every pickup interaction, or opening/closing every dialogue box under input.
- There is no cycle-count benchmark report yet. Helper-call removal strongly
  suggests faster code, but exact per-frame cycle measurements are still work to
  do.
- Some OAM drawing code is intentionally explicit and repetitive. That is faster
  and easier to count, but less elegant than a generic sprite routine.

## Work Still To Do

Good next steps:

- Add controller-input scripted tests for moving, jumping, collecting gems, and
  opening/closing NPC dialogue.
- Add targeted tests for Step 5 bordered dialogue tiles after talking to each
  NPC.
- Add cycle/size reports from `.map` files or emulator instrumentation.
- Consider extracting shared ASM include files only after the tuned versions
  settle. For now, duplication keeps each tutorial step self-contained.
- Review whether any remaining routines should trade a little size for even more
  speed, especially Step 5 dialogue drawing and OAM output.

## Bottom Line

This rewrite is worth keeping as a serious assembly baseline: it is isolated,
tested against the generated reference, much smaller to read, removes hundreds
of cc65 helper calls, and exposes the values users are likely to change. The
remaining risk is not correctness in the currently tested paths, but test depth:
more scripted interaction coverage would make it ready to promote beyond the
`rewrites/` sandbox.
