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
| 4 | `reaction_for` | behaviour.c | ✅ 10/10 cases | 64 → **35** | ~120+ → **~30** | ⬜ (flag pending) |
| 5 | `read_controller` | main.c | ✅ 7/7 combos | 61 → **23** | ~300+ → **~150** | ⬜ (flag pending) |
| 6 | `write_palettes` | main.c | ✅ PPU RAM ≡ | 42 → **24** | — | ⬜ (flag pending) |
| 7 | `draw_text` | main.c | ✅ nametable ≡ (3 spots) | ~110 → **~85** | — | ⬜ (flag pending) |
| 8 | `clear_text_row` | main.c | ✅ nametable ≡ | ~90 → **~70** | — | ⬜ (flag pending) |

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

### 4. `reaction_for(unsigned char sprite, unsigned char beh) -> unsigned char`
Two **char** args: the earlier one is pushed as a single byte (`pusha`), so
`sprite` is at `(sp),0` and the callee pops 1 byte (`incsp1`). Because `sprite<2`
and `beh<8`, the index `(sprite<<3)|beh` is 0..15 — a plain 8-bit `,X` lookup,
no `shlax3`/`ptr1`. 10/10 (valid, sprite-OOB, beh-OOB, both-OOB — behaviour is
checked first). 35 bytes / ~30 cycles vs the C's 64 + `shlax3` + `pusha`/`incsp2`.

### 5. `read_controller(void) -> unsigned char`
Hardware I/O, no args. Strobe `$4016` (write 1, 0), then 8× { read `$4016`;
`lsr a` puts bit 0 in carry; `rol tmp1` collects carries MSB-first }. The
initial `tmp1` is irrelevant (its bits shift out). Harness holds real jsnes
buttons per combo and checks 7 combos incl. A→0x80, Right→0x01, all→0xFF. 23
bytes / ~150 cycles vs cc65's stack-local loop (61 bytes + `pusha`/`decsp1` /
~300+): cc65 keeps `result` and `j` on the param stack and does `asl (sp),y`
etc. every iteration — the worst-case for a register-starved loop.

### 6. `write_palettes(void)` — PPU palette load
First **PPU-effect** function: observable output is palette RAM ($3F00-$3F1F),
not CPU RAM. Harness pattern (new): build the driver twice — C ref vs ASM,
selected by `-DASM_VARIANT` (`run2` in run-all.sh) — boot each, read
`nes.ppu.vramMem[$3F00+i]` via `rdPPU`, and assert the 32 entries are identical
(plus the non-mirrored ones carry the source bytes; $3F10/14/18/1C mirror the
backdrops, which both implementations hit the same way). ASM uses X as both the
loop counter and the `palette_bytes,X` index: 24 bytes vs the C's 42.

### 7-8. `draw_text` / `clear_text_row` — PPU nametable writes
3 args. `addr = $2000 + row*32 + col` is a **full 16-bit add** (neither bounds
`col`, so the OR shortcut would be wrong): `lo = ((row&7)<<5) + col` with the
carry propagating to `hi = (row>>3) + $20`. Both call `waitvsync` and toggle
`PPU_MASK` off/on; the value that must survive `waitvsync` (the text pointer for
draw_text, the width for clear_text_row — cc65 lib calls clobber A/X + ZP temps)
is stashed on the **hardware** stack, while row/col stay on the cc65 param stack.
draw_text verified at 3 placements incl. `col=40` (exercises the add carry);
clear_text_row fills a row with 0xAB then clears cols 4..9 and checks the cut +
the untouched cells. Both read back via the new harness `ntTile()`.

## Up next
- `scroll_init`, `scroll_follow`, `load_world_bg` — camera math (RAM state) +
  a big VRAM streamer. `scroll_apply_ppu` writes the `$2005/$2006` latch in a
  timing-critical order — that one needs the ROM-level behaviour suite, so it's
  a good point to start the flag-integration so the real render tests can run it.
- `scroll_*` (`scroll_init`, `scroll_follow`, `world_to_screen_*` done, then
  `scroll_apply_ppu` which touches the `$2005/$2006` latch — needs the ROM-level
  behaviour test, the touchiest ones for timing).
- Upward toward the per-frame loop / NMI where practical.

## Integration plan (after the leaf batch)
Wire the proven `.s` files into the shipped engine behind an off-by-default
build flag (`NES_ASM_<fn>=1`), a new engine version; the C stays as the default
and the fallback. Golden ROMs remain byte-identical with the flag off; with it
on, the existing render/behaviour suites must still pass (gate 2). Because ASM
isn't byte-identical to the C, the flag-on ROMs get their own golden hash (or
are validated behaviourally only).
- then upward toward the per-frame loops and NMI where practical.
