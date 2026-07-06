# ASM conversion — status tracker

Lab for rewriting the playground engine's C functions as hand-written 6502
(see [`RESEARCH.md`](RESEARCH.md) for the how/why). Each function passes three
gates: **(1) correctness** — per-function unit harness in a real ROM, ASM vs the
C reference vs an independent JS model over edge-case inputs; **(2) integration**
— once flagged into the engine, the existing render/behaviour suites still pass;
**(3) efficiency** — bytes + cycles ≤ the cc65 `-Os` version.

Run a function's unit test:
```
cd asm-lab
make ROM=<name> SRC="functions/<dir>/ref.c functions/<dir>/test.c functions/<dir>/asm.s"
node functions/<dir>/test.mjs
```
Or everything: `./run-all.sh`.

## Function log

| # | Function | Source | Gate 1 (unit) | Bytes (C→ASM) | ~Cycles (C→ASM) | Integrated |
|---|----------|--------|---------------|---------------|-----------------|------------|
| 1 | `world_to_screen_x` | scroll.c | ✅ 12/12 cases | 66 → **20** | ~120+ → **~28** | ⬜ (flag pending) |
| 2 | `world_to_screen_y` | scroll.c | ✅ 10/10 cases | 66 → **24** | ~120+ → **~32** | ⬜ (flag pending) |
| 3 | `behaviour_at` | behaviour.c | ✅ 12/12 cases | 89 → **~70** | ~200+ → **~55** | ⬜ (flag pending) |

### 1. `world_to_screen_x(unsigned int) -> unsigned char`
Camera transform: world pixel X → on-screen X, or `0xFF` if off-screen.
- **Insight:** one 16-bit subtract `off = world_x - cam_x` yields both the
  `world_x < cam_x` test (final borrow / carry) and the `off >= 256` test
  (high byte non-zero). Result: subtract → `bcc`(borrow)→0xFF → `bne`(hi≠0)→0xFF
  → else low byte.
- **Bug caught by the harness (v1→v2):** the first version assumed an underflow
  always leaves hi(off)≠0 and dropped the borrow test; false for `cam=65535,
  world=0` (off=1). Added `bcc`. Now exact for all inputs. Lesson: don't trade a
  real 16-bit comparison for a high-byte shortcut without checking the wrap.
- **Efficiency:** C ref 66 bytes + 7 runtime-helper `jsr`s (pushax×2, ldax0sp×3,
  incsp2×2); ASM 20 bytes, 0 `jsr`, ~28 cycles. Smaller **and** faster.

### 2. `world_to_screen_y(unsigned int) -> unsigned char`
Same as `_x` but screen height is **240**, so `off >= 240` is a real compare,
not a high-byte test: after the subtract, `bcc`(world<cam)→0xFF, `bne`(hi≠0,
i.e. ≥256)→0xFF, else `cmp #240 / bcs`→0xFF, else return the low byte. Passed
10/10 first attempt (aligned, 239/240 boundary, 255, underflow, max). 24 bytes
(4 more than `_x`) / ~32 cycles vs the C's 66 bytes + helpers / ~120+.

### 3. `behaviour_at(unsigned int col, unsigned int row) -> unsigned char`
First **2-arg** function: cc65 fastcall puts `row` in A/X and pushes `col` to the
param stack (confirmed from the call site — `pushwysp` then `ldaxysp`), so the
ASM reads `col` at `(sp),0/1` and pops 2 bytes with `jmp incsp2` (which
preserves A/X). WORLD_COLS=32 lets `row*32 + col` avoid any multiply/`tosaddax`
runtime: `indexHi = row>>3`, `indexLo = ((row&7)<<5) | col` (the low 5 bits are
free, so no carry). Passed 12/12 (corners, on/off-bounds each axis, far-OOB).
~70 bytes / ~55 cycles vs the C's 89 bytes + `pushax`/`ldaxysp×3`/`shlax4`/
`shlax1`/`tosaddax`/`incsp4` (~200+ cycles).
- **Harness lesson:** the driver clears a 960-byte map (crt0 also zeroes that
  BSS), which pushed setup past a fixed frame count. Added `frameUntil(addr,
  val)` to the harness (step frames until the done-marker) so no per-function
  frame tuning is needed. Also switched the map fill to a running accumulator
  (`v += 7`) to avoid a per-cell 16-bit multiply.
- **Integration note:** this version is specialised to WORLD_COLS=32 (1-screen).
  A multi-screen world uses a different multiply (e.g. `<<6` for 64); the engine
  integration will emit the shift set for the project's actual WORLD_COLS.

## Up next (leaf-first order)
- `reaction_for` — bounds-check + small 2D table index.
- `read_controller` — `$4016` strobe + 8-bit shift-in.
- then upward toward the per-frame loops and NMI where practical.
