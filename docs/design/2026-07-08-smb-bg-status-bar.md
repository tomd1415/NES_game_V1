# SMB background status bar (sprite-0 split) — design + tradeoffs

**Goal:** eliminate the SMB HUD flicker by moving the HUD off OAM sprites into a
fixed background status bar, held stationary over the horizontally-scrolling
playfield by a sprite-0-hit mid-frame scroll split (how real SMB does it).

**Status:** BUILD IN PROGRESS (started 2026-07-09, engine → v58). User chose the full
build (iterate the split via FCEUX) after the v57 HUD-digit cache confirmed the SMB
"inconsistent speed" is this same frame budget. Gated behind `BW_SMB_HUD_BG` (off by
default → byte-identical). Two blockers below still hold; Blocker 1 (top-4-rows) is
accepted as opt-in.

### Build progress (this is the working checklist)
- [x] **Flag + glyph seeding (Phase 1).** `smbhud.config.background` → builder-modules
  emits `#define BW_SMB_HUD_BG 1` (gated targetEngine ≥ 58); server `_seed_hud_digits_bg`
  seeds the 0-9 glyphs into BG tiles 48-57 (mirrors the sprite/dialogue seeding).
- [x] **Static strip (Phase 2) + Live updates + drop OAM HUD (Phase 3)** — v59.
  `bw_hud_bg_init()` paints rows 0-3 at boot; `bw_hud_dirty` + `bw_hud_bg_paint()`
  repaint in vblank on change; OAM `bw_hud_digit` compiled out under the flag.
  jsnes-verified: 11 digits (tiles 48-57) in the nametable, live-updating, 0 HUD
  sprites in OAM. **Fully works for a single-screen SMB + kills the HUD flicker.**
  MEASURED: on top of the v57 cache this frees only a little extra frame budget —
  the SMB speed ceiling is the **enemy AI + heavy SMB base**, not the HUD. So the bg
  HUD's real win is the FLICKER + freed OAM, NOT the "inconsistent speed."
- [ ] **Sprite-0 split (Phase 4).** FCEUX-only. Sprite 0 at the strip bottom; vblank
  sets scroll (0,0), busy-poll `PPU_STATUS` bit 6, then write the playfield scroll.
  **Assessed 2026-07-10 — deeper than first scoped:**
  - The mid-frame scroll re-apply must fit the **~28-CPU-cycle H-blank** of the split
    scanline, but the engine's `scroll_apply_ppu` (ASM, handles wide/tall nametable
    select) is **~100 cycles** — too slow, it would tear. So the split needs a
    *minimal hand-tuned* mid-frame write (fine-x + the coarse-x/nametable `$2006`/`$2005`
    loopy bits only), separate from `scroll_apply_ppu`. This is the crux and is
    cycle-exact → **jsnes can validate the LOGIC (does the strip stay put) but NOT the
    tear-free TIMING; only FCEUX can.**
  - OAM layout change: sprite 0 must be OAM slot 0 (an opaque tile parked at the strip
    bottom over an opaque strip pixel), so `draw_player` must start at `oam_idx = 4`
    under the flag.
  - Player/enemy sprites still render over the top 32px, so a bg-HUD game must keep
    actors in rows 4-29 (author the top as the strip). Starter would be authored so.
  → Best done as a focused round with live FCEUX iteration, not one-shot.
- [x] **Sprite-0 split (Phase 4) + Streamer skip (Phase 5) — WORKING (v61).**
  Validated on FCEUX HERE (headless `xvfb-run fceux --loadlua`, Lua screenshots +
  `ppu.readbyte` nametable dumps — jsnes hangs on the split so it's useless for this).
  Three fixes: (a) apply the strip scroll via `scroll_apply_ppu` (cam_x temporarily 0)
  not bare `PPU_SCROLL` (latch); (b) `scroll_asm.s` column write skips `SCROLL_SKIP_TOP`
  rows; (c) two-phase sprite-0 wait (clear-then-set) so a 60fps frame doesn't split at
  scanline 0. On a standard 2-screen SMB the bar is fixed at the top, the level
  scrolls, moving + stopped, no tear (consecutive frames identical md5).
- [x] **Multi-bg (doors) — RESOLVED, it always worked (v61).** The prior "strip
  painted but not displayed" was a **misread**: the strip's opaque solid-bar tile
  (`BW_HUDBG_SOLID_TILE=58`) renders in the level's green palette, which I mistook for
  scrolled-in level content. Re-tested the FULL showcase (doors on, `BW_DOORS_MULTIBG_
  ENABLED`) on FCEUX: probed `cam_x=0 cam_y=0` at rest; drove the player right to
  `cam_x=240`; the strip (digits + bar) stays **fixed at the top** while the level
  platforms scroll (compare `probe-boot.png` vs `probe-scrolled.png`), NT0 rows 0-3
  stay the strip (`r1=5 r2=6 r3=32` after scroll = same as the standard case), and two
  consecutive frames are **byte-identical** (no tear jitter). No mirroring/nametable
  difference exists — `scroll_apply_ppu` has no multi-bg branch; both builds are
  vertical-mirror (iNES byte6=3). **The sprite-0 split works for both standard 2-screen
  SMB and the multi-bg doors showcase.**

**FCEUX self-test harness (reusable):** `scratchpad/fceux/*.lua` +
`timeout N xvfb-run -a fceux --loadlua script.lua rom.nes`. `gui.savescreenshotas`,
`ppu.readbyte(0x2000+...)`, `memory.readbyte`, `joypad.set(1,{right=true})`. Don't
`os.exit` right after a screenshot (it won't flush) — advance a few frames or let the
timeout kill it.

## Why the flicker happens (confirmed)

NES PPU hard limit: **8 sprites per scanline**; the 9th+ are dropped. The SMB
build's OAM draw order (priority high→low, `platformer.c`): player → fireballs →
HUD digits → enemies (enemies are `BW_OAM_FLICKER`-rotated). The HUD is fixed OAM
sprites on the top rows (`y=8` and `y=20`). When the player **jumps up into** those
scanlines and/or a **fireball** is present, player + fireball + HUD cross 8 → the
PPU drops the excess → flicker. OAM tail is correctly cleared (`0xFF` fill at
`main.c:730`), so it is genuinely the per-scanline limit, not stale sprites.

## Architecture (current render flow)

Per frame, in the main loop (`src/main.c` ~730–785, from `platformer.c`):
1. build OAM shadow buffer (`oam_idx` from 0);
2. `scroll_stream_prepare()` (outside vblank);
3. `waitvsync()` → `PPU_MASK = 0` (rendering OFF for the whole vblank window);
4. `OAM_DMA`; `scroll_stream()` (column write); `scroll_apply_ppu()` (`PPU_SCROLL =
   cam_x, cy`); `PPU_MASK = 0x1E` (rendering ON) at the very end of vblank.

Vertical mirroring (`NES_MIRRORING=1`), horizontal scroll. HUD glyphs are seeded
into the **sprite** pattern table (`BW_HUD_DIGIT_BASE=48`); the BG pattern table is
at `$1000`. HUD content: coins(2)+time(3) row 1, lives(1)+score(5) row 2.

## The fix (phased, each needs an FCEUX checkpoint — jsnes can't validate it)

1. **BG glyph seeding** — seed digit glyphs into the BG pattern table (server
   `_seed_hud_digits`, mirroring the dialogue-font BG seeding).
2. **Static status strip** — reserve nametable rows 0–3 (32px); write labels +
   zeroed digits at boot.
3. **Live updates** — write coins/time/lives/score digits into the status
   nametable via buffered vblank PPU writes; delete the OAM HUD sprites.
4. **Sprite-0 split** — place sprite 0 at the strip's bottom (~scanline 31); this
   **restructures the frame**: vblank sets scroll `(0,0)` (status at top), then
   after `PPU_MASK=0x1E` the CPU **busy-polls `PPU_STATUS` bit 6** and at the hit
   writes the playfield scroll `(cam_x, …)` via the loopy `$2005/$2006` dance. Burns
   CPU for ~32 scanlines/frame; almost certainly needs to be **hand-written 6502**
   for tight timing.
5. **Streamer skip** — `scroll_stream` must offset the playfield to nametable rows
   4–29 and never write rows 0–3, or scrolling smears the HUD.

## ⚠️ Blocker 1 — material tradeoff: the playfield shrinks 240→208px

A fixed 32px status bar means the playfield is **rows 4–29 (208px)**, not the full
240px. Existing SMB levels authored for 30 rows lose their **top 4 rows** (covered
by the opaque bar) — a visible, gameplay-affecting change to existing projects.
Real SMB levels are authored for this (top rows = sky); ours are not. This is why
it must be opt-in, and it may change whether Path A is even wanted vs. the cheaper
"shimmer" mitigation (extend `BW_OAM_FLICKER` to the HUD band).

## ⚠️ Blocker 2 — cannot be validated in-harness

jsnes does **not** model the 8-sprite-per-scanline limit or sprite-0-hit timing
(that is why the tests stay green while the flicker is real on hardware/FCEUX).
So the split, the mid-frame scroll dance, and the "flicker gone" result can only be
verified on **FCEUX/Mesen** by a human. Every phase above needs a human checkpoint;
I can only guarantee byte-safety (off = identical) + that it compiles/boots.

## Recommendation

Surface Blocker 1 to the user before building. If they still want Path A, build it
phase-by-phase with an FCEUX check after each (esp. phases 4–5). If the playfield
shrink is unacceptable, fall back to the shimmer mitigation (Path B), which needs no
scroll-core change and no playfield loss.
