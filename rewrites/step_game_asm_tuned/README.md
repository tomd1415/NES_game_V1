# Tuned ASM Step Games

This directory is for hand-tuned assembly replacements. It is separate from:

- `../step_game_modular`: readable C rewrites
- `../step_game_asm_generated`: compiler-generated ASM baseline

Current status:

- Step 1: hand-written tuned `src/main.s`
- Step 2: hand-written tuned `src/main.s`
- Steps 3-5: copied from the generated ASM baseline, ready for incremental tuning

The tuned Step 1 and Step 2 files put pupil-editable values in a clear
`TUNABLES` block at the top of `src/main.s`. Examples:

- `PLAYER_START_X`, `PLAYER_START_Y`
- `FLOOR_Y`
- `JUMP_FRAMES`
- `MOVE_SPEED`
- `JUMP_PIXELS`, `FALL_PIXELS`
- palette color constants

Efficiency changes already made in Steps 1-2:

- Removed cc65 parameter-stack helpers from tiny hardware routines.
- Replaced generated controller reads with the standard `lsr`/`rol` 8-read loop.
- Replaced stack-heavy sprite drawing with a direct OAM loop.
- Removed redundant `ldx #0` and boolean helper calls from movement/gravity.
- Kept routine labels readable and grouped by job.

Run:

```sh
node rewrites/step_game_asm_tuned/test_tuned_accuracy.mjs
```

That builds generated and tuned ROMs, boots them with jsnes, runs frames, and
compares visible state for the tuned steps.
