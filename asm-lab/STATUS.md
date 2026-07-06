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
| 1 | `world_to_screen_x` | scroll.c | ✅ 12/12 cases | 66 → **20** | ~120+ → **~28** | ✅ **v12** (`NES_ASM_SCROLL`) |
| 2 | `world_to_screen_y` | scroll.c | ✅ 10/10 cases | 66 → **24** | ~120+ → **~32** | ✅ **v12** (`NES_ASM_SCROLL`) |
| 3 | `behaviour_at` | behaviour.c | ✅ 12/12 cases | 89 → **~70** | ~200+ → **~55** | ✅ **v14** (`NES_ASM_LEAF`) |
| 4 | `reaction_for` | behaviour.c | ✅ 10/10 cases | 64 → **35** | ~120+ → **~30** | ✅ **v14** (`NES_ASM_LEAF`) |
| 5 | `read_controller` | main.c | ✅ 7/7 combos | 61 → **23** | ~300+ → **~150** | ✅ **v14** (`NES_ASM_LEAF`) |
| 6 | `write_palettes` | main.c | ✅ PPU RAM ≡ | 42 → **24** | — | ✅ **v15** (`NES_ASM_LEAF`) |
| 7 | `draw_text` | main.c | ✅ nametable ≡ (3 spots) | ~110 → **~85** | — | ✅ **v15** (`NES_ASM_LEAF`) |
| 8 | `clear_text_row` | main.c | ✅ nametable ≡ | ~90 → **~70** | — | ✅ **v15** (`NES_ASM_LEAF`) |

| 9 | `scroll_follow` | scroll.c | ✅ 20/20 cases | 435 → **289** | big → smaller | ✅ **v13** (`NES_ASM_SCROLL`) |
| 10 | `scroll_apply_ppu` | scroll.c | ✅ 16/16 cases | — | — | ✅ **v16** (`NES_ASM_SCROLL`) |
| 11 | `scroll_stream_prepare` | scroll.c | ✅ 8/8 cases | — | index-loop → +64-stride walk | ✅ **v17** (`NES_ASM_SCROLL`) |
| 12 | `advance_animation` | main.c (main loop) | ✅ 9/9 cases | — | — | ✅ **v18** (`NES_ASM_LEAF`) |

### Main-loop conversion boundary (v18)

`advance_animation` is the first *main-loop gameplay* block converted — it runs
on engine-owned, non-`static` `anim_*` globals, so it hand-converts cleanly (the
inline C stays under `#else`; flag-on calls the ASM). The **scene-sprite gravity
loop** — the other hot inline block — cannot be hand-converted: it reads/writes
the **server-generated `ss_x/ss_y/…` arrays**, which are `static`, vary u8↔u16 by
sprite position, and vary in count per project. Converting it needs the *server*
to emit a project-matched ASM variant (codegen generation, the "full ASM engine"
route); its dominant cost, `behaviour_at`, is already ASM. So the cleanly
hand-convertible discrete + inline-engine-owned functions are essentially done;
what remains is per-project generated code, which is a codegen project.

**Phase 2 (leaf-first) goal met at v15**; **Phase 3 (harder integration
functions) in progress.** All integrated behind off-by-default flags
(`NES_ASM_SCROLL` + `NES_ASM_LEAF`), golden-safe (flag-off byte-identical
`d0a0fa7ad715`).

### Frame-pacing finding (v16) — the right A/B lens for a *faster* engine

Extending the settle-to-rest A/B to sustained scrolling showed a stable 6-px X
offset on static sprites in the all-ASM build. It is **not a divergence bug**:
with RIGHT held and no walls, `px` advances once per main-loop iteration, so it
doubles as an iteration counter. Over 130 vblanks the all-ASM build completed
**130** iterations; pure-C completed only **124** — pure-C **drops one frame per
30-tile column-stream burst** because that burst pushes the frame over the NTSC
vblank budget, while the faster ASM build makes it. At **matched game-logic
progress** (equal `px`) the two builds are byte-identical (cam_x, OAM, palette,
nametables). Lesson: for a faster engine the equivalence lens is *matched
progress*, not *matched vblank*. Harness: `matched.mjs` in the session scratch;
the streamer conversion should remove the drops entirely.

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

### 9. `scroll_follow(unsigned int tx, unsigned int ty)` — camera dead-zone
The biggest so far: two axes of branchy 16-bit math on the exported `cam_x/cam_y`.
The C algebra collapses per axis to `target<cam+96 → cam=max(0,target-96)` and
`target>cam+144 → cam=min(target-144, max_cam)`. Standard 16-bit compare idiom
(`lda lo/cmp lo/lda hi/sbc hi` → `bcc`=less). 10/10 first try (deadzone hold,
scroll-to-0, scroll-to-max clamp, both axes), verified against the exact C
algebra in JS. **289 bytes vs the C ref's 435** (which spills all 6 locals to
the software stack). Note: the lab pins a 512x480 world; the real per-project
`WORLD_W/H_PX` + `DEADZONE_*` are constants the integration will bake in.

---

## Unit-conversion phase: COMPLETE (9 functions)

Every function that is cleanly testable in isolation is converted and proven —
covering all the ABI/idiom patterns: leaf 16-bit arithmetic, 2-arg param-stack,
char args, an 8-bit table lookup, hardware `$4016` I/O, PPU palette + nametable
writes (with `waitvsync` and value-across-call preservation on the HW stack),
and complex branchy 16-bit camera math. The harness (unit + JS model + size) has
caught 4 real defects along the way. `./run-all.sh` builds + runs all of them.

## Integration phase (IN PROGRESS)

**Done — engine v12:** `world_to_screen_x` / `world_to_screen_y` are wired into
the shipped engine. `steps/Step_Playground/src/scroll_asm.s` holds the ca65
versions; the Makefile flag `NES_ASM_SCROLL=1` links it and `#ifdef`s out the C
in `scroll.c`. Default OFF ⇒ pure C ⇒ golden ROMs byte-identical. Verified
in-engine: a 64-col world built both ways renders identical OAM across 160
frames incl. 80 of scrolling.

**Done — engine v13:** `scroll_follow` is wired in (same flag). Generalised ASM
reads `_scroll_max_cam_x/y` = `WORLD-SCREEN`, skips a single-screen axis (max 0),
deadzone 96/144 baked; private BSS scratch (`sf_*`), not cc65's `ptr1..4`.
Verified flag-off byte-identical (golden) + flag-on **settle-to-rest** identical
(all-C vs all-ASM, 64-col world, OAM identical at rest and scrolling).

*Debugging war-story (worth remembering).* A naive A/B (compare from an
UNSETTLED window) showed a persistent 1px divergence and `cam_x` off-by-1 at
scroll start. It was NOT a `scroll_follow` bug: instrumenting the call showed
both implementations compute correctly for their inputs, but the *inputs*
(`cam_x`, player `px`) were each 1 ahead in the ASM build — a **1-frame phase
offset from the faster ASM finishing the startup VRAM-streaming load ~1 frame
sooner** (the `-Os` load-timing sensitivity the Makefile documents). Compared
from a settled state, 0 diffs. Lesson: A/B ASM-vs-C engine builds **settle to
rest first** (as the render suite already does), or a benign load-phase shift
reads as a bug.

**Next to integrate (`scroll.c`, same flag):**
- `scroll_apply_ppu` — the `$2005/$2006` latch is a rendered-frame property;
  prove via the settle-to-rest ROM-level A/B like `scroll_follow`.
- `scroll_init` (trivial; touches file-static `prev_cam_*` — either export them
  under the flag or keep in C).
- `scroll_stream_prepare` / `scroll_stream` / `load_world_bg` — the VRAM
  streamers (larger; whole-frame behaviours).
Then move to `behaviour.c` / `main.c` functions — those files are
server-regenerated, so integrating them means teaching `playground_server.py`'s
codegen to emit the `.s` + `#ifdef` the C (a bigger, separate change).

## Remaining functions still C (integration continues)
These are **not** cleanly unit-testable in isolation — their behaviour is the
whole-frame / whole-world result, so they get proven by the existing ROM-level
render/behaviour suites once wired in:
- `scroll_apply_ppu` — writes the `$2005/$2006` fine-scroll latch in a
  timing-critical order + the 240-px band nametable select; correctness is a
  rendered-frame property.
- `scroll_stream_prepare` / `scroll_stream` / `load_world_bg` — VRAM streamers
  over the full `bg_world_tiles` world; depend on world state + the vblank window.
- `scroll_init` — trivial (zeroes `cam_*` + the file-static `prev_cam_*`); the
  statics aren't externally linkable, so it's converted at integration, not in
  the isolated lab.
- `main()` / NMI — the orchestration; converted last, if at all (mostly calls).

### Integration plan (the path to "finished")
1. Add an off-by-default per-function build flag (`NES_ASM_<fn>=1`) — a new
   engine version. The server/codegen emits the proven `.s` (from this lab) and
   `#if NES_ASM_<fn>`-guards out the C body so exactly one definition links.
2. Flag OFF ⇒ pure C ⇒ **golden ROMs byte-identical** (the existing invariant).
3. Flag ON ⇒ the render/behaviour suites (`tools/builder-tests/*.mjs`) must still
   pass (gate 2); because ASM ≠ byte-identical to C, flag-on builds get their own
   golden hash or are validated behaviourally only.
4. Turn flags on function-by-function, running the full suite each time, until
   the engine runs on hand-written ASM for everything feasible.
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
