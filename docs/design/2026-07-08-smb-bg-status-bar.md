# SMB background status bar (sprite-0 split) — design + tradeoffs

**Goal:** eliminate the SMB HUD flicker by moving the HUD off OAM sprites into a
fixed background status bar, held stationary over the horizontally-scrolling
playfield by a sprite-0-hit mid-frame scroll split (how real SMB does it).

**Status:** designed + scoped, NOT yet built. Gated behind a new `BW_SMB_HUD_BG`
path (off by default → byte-identical). Two blockers surfaced below.

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
