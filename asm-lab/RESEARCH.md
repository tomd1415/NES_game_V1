# 6502 / NES / cc65 assembly — research notes for the ASM engine

This is the reference behind the ASM-conversion lab (`asm-lab/`). Goal: rewrite
the playground engine's C functions as hand-written 6502 assembly, one at a
time, proving each is behaviourally identical to (or better than) the C version
and at least as small/fast. This document is the "why and how" — the ground
facts about the CPU, the NES, and the cc65 toolchain that make the conversions
correct.

Curated external links live in [`docs/reference/nes-resources.md`](../docs/reference/nes-resources.md).
This doc is the *operational* companion: exactly the subset we need, tied to
**our** toolchain (cc65 V2.18) and **our** memory map (`steps/Step_Playground/cfg/nes.cfg`).

---

## 1. The 6502 CPU (Ricoh 2A03 core in the NES)

An 8-bit CPU, little-endian, ~1.79 MHz (NTSC). Tiny register file — the work
happens in memory, especially **zero page**.

### Registers
| Reg | Bits | Role |
|-----|------|------|
| `A` | 8 | Accumulator — the only register with a full ALU (add/sub/logic). |
| `X` | 8 | Index; also the only reg that addresses the hardware stack (`TXS`/`TSX`). |
| `Y` | 8 | Index; the `(zp),Y` post-indexed mode is *the* pointer-deref idiom. |
| `SP`| 8 | Stack pointer, implied page 1 (`$0100-$01FF`). Grows downward. |
| `PC`| 16 | Program counter. |
| `P` | 8 | Status flags: `N V - B D I Z C`. |

### Status flags that matter here
- **C** (carry) — set/cleared before add/sub. **`CLC` before `ADC`, `SEC`
  before `SBC`** is the #1 correctness rule. Carry is also the shift-in/out bit
  for `ASL`/`LSR`/`ROL`/`ROR` and the ≥ result of `CMP`.
- **Z** (zero) — set when a result is 0. `BEQ`/`BNE` branch on it.
- **N** (negative) — bit 7 of a result. `BMI`/`BPL`.
- **V** (overflow) — signed overflow of `ADC`/`SBC`. Rarely needed for our
  unsigned math.
- **D** (decimal) — the 2A03 **ignores** BCD mode, so `ADC`/`SBC` are always
  binary. We still `CLD` once at reset (cc65's crt0 does).

### Addressing modes we use constantly
| Mode | Syntax | Notes / cost |
|------|--------|--------------|
| Immediate | `lda #$20` | 2 cycles. |
| Zero page | `lda $10` | 3 cycles — **half the size and 1 cycle cheaper** than absolute. |
| Absolute | `lda $6000` | 4 cycles. |
| Zero page,X / ,Y | `lda $10,x` | 4 cycles; wraps within page 0. |
| Absolute,X / ,Y | `lda $6000,x` | 4 (+1 if the index crosses a page). |
| Indirect,Y | `lda ($10),y` | 5 (+1 on page cross) — pointer in ZP `$10/$11`, add Y. |
| Indexed indirect,X | `lda ($10,x)` | 6 — rare for us. |

### Cycle counts for the instructions we lean on
(For static "is the ASM as fast?" comparisons. Branch = 2, +1 if taken, +1 more
if the target is on another page.)

| Instr | Cyc | Instr | Cyc |
|-------|-----|-------|-----|
| `LDA/LDX/LDY #imm` | 2 | `STA/STX/STY zp` | 3 |
| `LDA/… zp` | 3 | `STA/… abs` | 4 |
| `LDA/… abs` | 4 | `INX/INY/DEX/DEY` | 2 |
| `LDA/… abs,X` | 4(+1) | `INC/DEC zp` | 5 |
| `LDA/… (zp),Y` | 5(+1) | `INC/DEC abs` | 6 |
| `ADC/SBC/AND/ORA/EOR` (zp) | 3 | `ASL/LSR/ROL/ROR A` | 2 |
| `CMP/CPX/CPY #imm` | 2 | `ASL/… zp` | 5 |
| `TAX/TAY/TXA/TYA` | 2 | `PHA/PLA` | 3/4 |
| `CLC/SEC/CLD/…` | 2 | `JSR`/`RTS` | 6/6 |
| `Bxx` (branch) | 2/3/4 | `JMP abs` | 3 |

**Rule of thumb:** keep hot values in **zero page**, prefer `A`, avoid needless
`JSR` (6+6 cycles of overhead), and never re-load a value you already have in a
register.

### Common idioms
- 16-bit add: `clc / lda lo / adc other_lo / sta lo / lda hi / adc other_hi / sta hi`.
- 16-bit sub: same with `sec`/`sbc`.
- ">= 256" test on a 16-bit value: **just test the high byte** (`lda hi / bne …`).
- Multiply by a power of two: `asl` (×2) chains. `×32` = five `asl`, or move the
  low 3 bits into the next byte.
- Pointer deref of `base[i]` (i 8-bit): `ldy i / lda (ptr),y`.

---

## 2. The NES, as our cfg lays it out

Memory map (from `cfg/nes.cfg` — the authoritative source for this project):

| Range | What | Segment(s) |
|-------|------|-----------|
| `$0000-$00FF` | **Zero page**. cc65 runtime + our ZP vars. `ZP` starts at `$0002`. | `ZEROPAGE` |
| `$0100-$01FF` | Hardware stack (SP). | — |
| `$0200-$02FF` | **OAM shadow** — 64 sprites ×4 bytes, DMA'd to the PPU via `$4014`. | `OAM` |
| `$0500-$07FF` | cc65 **parameter stack** (3 pages, `__STACKSIZE__=$0300`). | `SRAM` |
| `$2000-$2007` | PPU registers (mirrored to `$3FFF`). | (hardware) |
| `$4000-$4017` | APU + I/O (`$4014` OAM DMA, `$4016/$4017` controllers). | (hardware) |
| `$6000-$7FFF` | 8 KB work RAM — C `DATA`(run) + `BSS` + heap. Globals live here. | `RAM` |
| `$8000-$FFF9` | 32 KB PRG-ROM — `STARTUP/CODE/RODATA/DATA(load)`. | `ROM0` |
| `$FFFA-$FFFF` | NMI / RESET / IRQ vectors. | `ROMV` |
| CHR `$0000-$1FFF` | Pattern tables (tiles), via the PPU bus. | `CHARS` |

Mapper **0 (NROM)**, vertical mirroring, 1×8 KB CHR — the whole engine is NROM
by design (decision D-9). No bank switching to reason about.

### PPU essentials (what our functions touch)
- **Registers**: `$2000` PPUCTRL (NMI enable, pattern-table select, increment),
  `$2001` PPUMASK (show bg/sprites), `$2002` PPUSTATUS (vblank + sprite-0 flags,
  read to reset the `$2005/$2006` write latch), `$2003` OAMADDR, `$2005`
  PPUSCROLL (x then y), `$2006` PPUADDR (hi then lo), `$2007` PPUDATA.
- **The frame**: game logic runs in the main loop; **VRAM writes must happen in
  vblank** (during NMI or a `waitvsync()` gap). The NTSC vblank is ~2273 CPU
  cycles — the budget everything hot competes for. Writing `$2006/$2007`
  mid-frame corrupts the display; this is the root of the dialogue/scroll
  glitches in the bug list.
- **OAM**: build the 256-byte sprite table in the `$0200` shadow during the
  frame, then `sta $4014` (the page number `$02`) in vblank to DMA it in ~513
  cycles. Off-screen sprites park at `y>=$EF`.
- **Palettes**: `$3F00-$3F1F`. `$3F00` = universal backdrop; `+n*4` = bg palette
  n; `$3F10+n*4` = sprite palette n.
- **Scroll**: coarse+fine X/Y via the `$2005`/`$2006` "loopy" registers. Our
  `scroll_apply_ppu` is the function that writes these — the one place a
  behavioural test must watch the actual PPU latch order.

### Controllers
Strobe `$4016` (write 1 then 0), then read `$4016` eight times; each read's bit 0
is the next button in order A, B, Select, Start, Up, Down, Left, Right.

---

## 3. cc65 / ca65 — the toolchain and the ABI (the crucial part)

Our ROM is a cc65 project (`steps/Step_Playground/`): C is compiled to `.s` by
`cc65`, assembled by `ca65`, and linked by `ld65` against `nes.lib` with
`nes.cfg`. **We can freely mix hand-written `.s` files** — `src/graphics.s`
already does (`_load_background`). That is exactly the seam we exploit: replace a
C function with a ca65 one exporting the same symbol.

### C ↔ ASM name mangling
A C symbol `foo` is the assembly symbol `_foo` (leading underscore). A C global
`unsigned int cam_x;` is `_cam_x` (low byte) and `_cam_x+1` (high byte),
little-endian, in the `BSS`/`DATA` segment (i.e. in `$6000` RAM).

### The calling convention (cc65 default — "fastcall")
cc65 passes the **right-most** parameter in registers and the rest on the
software parameter stack:

- **Rightmost arg in registers**: `unsigned char` → `A`; `unsigned int` (16-bit)
  → `A` = low, `X` = high; `long` → `A`/`X`/`sreg`/`sreg+1`.
- **Earlier args**: pushed on the cc65 parameter stack (ZP pointer `sp`,
  low/high, pointing into `$0500-$07FF`), left-to-right; the callee pops them
  with the `popa`/`popax` runtime helpers (import them via `.import`).
- **Return value**: `unsigned char` in `A`; `unsigned int` in `A` (low) / `X`
  (high); `long` in `A`/`X`/`sreg`. A `void` function returns nothing.
- **Clobbers**: A/X/Y and the ZP "temporaries" (`tmp1..tmp4`, `ptr1..ptr4`,
  `sreg`) are caller-saved — a leaf function may use them freely. Do **not**
  clobber `sp` (the param-stack pointer) unless you restore it.

So a one-16-bit-arg, returns-`unsigned char` function like `world_to_screen_x`
receives `world_x` in `A`(lo)/`X`(hi) and returns in `A` — **no stack traffic at
all**. That is why the leaf arithmetic helpers are the ideal first conversions.

### Useful zero-page pseudo-registers (cc65 runtime, importable)
`.importzp sp, sreg, tmp1, tmp2, tmp3, tmp4, ptr1, ptr2, ptr3, ptr4` — scratch
we can use in a leaf without saving. `ptrN` are the 16-bit pointer pairs used
for `(zp),Y` derefs.

### Segments & directives we use
```
.export  _name          ; make the symbol C-visible
.import  _other          ; reference a C/asm symbol from elsewhere
.importzp sp, ptr1, tmp1 ; zero-page runtime scratch
.segment "CODE"          ; code goes in ROM0
.segment "RODATA"        ; constant tables
.proc _name … .endproc   ; a scoped routine (its @labels are local)
```

### Worked example — `world_to_screen_x`
C (`scroll.c`):
```c
unsigned char world_to_screen_x(unsigned int world_x) {
    if (world_x < cam_x) return 0xFF;
    { unsigned int off = world_x - cam_x;
      if (off >= SCREEN_W_PX) return 0xFF;   /* SCREEN_W_PX == 256 */
      return (unsigned char)off; }
}
```
Observation: `SCREEN_W_PX == 256`, so `off >= 256` ⇔ *high byte of `off` is
non-zero*. And the underflow when `world_x < cam_x` also leaves a non-zero high
byte. **Both C branches collapse into one high-byte test.** Hand ASM:
```asm
.export _world_to_screen_x
.importzp tmp1
.proc _world_to_screen_x       ; A=lo(world_x), X=hi(world_x)
    sec
    sbc _cam_x                  ; A = lo(world_x) - lo(cam_x)
    sta tmp1                    ; stash low byte of off
    txa
    sbc _cam_x+1                ; A = hi(off) (borrow propagated)
    bne @offscreen              ; hi != 0  -> >=256 or underflow -> 0xFF
    lda tmp1                    ; hi == 0  -> return low byte
    rts
@offscreen:
    lda #$FF
    rts
.endproc
```
~9 instructions, one branch, no `JSR`, no stack. The cc65 `-Os` output for the C
version does two 16-bit compares (more code + cycles), so this is *both* smaller
and faster — the "or better" the brief asks for. This is the template for every
leaf conversion.

---

## 4. Conversion methodology (how the lab proves each function)

Each function passes three gates before it's "done":

1. **Correctness — per-function unit harness (in a real ROM).** A cc65 test ROM
   links the **C reference** (renamed `_fn_ref`) and the **ASM candidate**
   (`_fn_asm`). `main()` sweeps a table of input cases (edge values: 0, boundary,
   just-under/over, underflow, max), calls both, and writes each `(ref, asm)`
   pair — or the first mismatch — into a fixed RAM buffer at `$6000+`. A Node +
   jsnes runner (reusing `tools/builder-tests/lib/render-harness.mjs`) boots the
   ROM, reads the buffer, and asserts `ref == asm` for every case.
2. **Integration — ROM behaviour match.** Once a function is swapped into the
   engine (behind the off-by-default flag), the existing render/behaviour suites
   (`tools/builder-tests/*.mjs`) must still pass — the on-screen result is
   unchanged. Golden ROMs stay byte-identical while the flag is off.
3. **Efficiency — size + cycles.** Bytes: from the `ld65 --mapfile` map (symbol
   sizes) or the assembled object. Cycles: **static count** from the tables
   above, comparing the `cc65 -Os` emitted `.s` for the C version against the
   hand ASM. Target: ≤ the C version on both.

### End state (per the brief)
Develop + prove here in `asm-lab/`, then integrate proven functions into the
shipped engine **behind an off-by-default flag** (a new engine version;
golden-safe until a project opts in), continuing until as much of the engine as
is feasible is hand-written 6502. Order: leaf arithmetic/table helpers first
(`world_to_screen_x/y`, `behaviour_at`, `reaction_for`, `read_controller`), then
larger routines, up toward the main loop / NMI where practical. Some things stay
C or cc65-runtime (16/32-bit multiply/divide runtime, constructor tables) — noted
per-function as we go.
