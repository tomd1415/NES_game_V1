# Debugging in FCEUX

A short reference for using FCEUX's built-in viewers to diagnose
graphics issues that don't show up in the browser emulator (jsnes is
more permissive about timing).  Written specifically to support the
**C2 scroll-flicker** investigation, but the workflow generalises to
any "looks wrong on real hardware / fceux but fine in jsnes" report.

---

## When to use this

Reach for these viewers when:

- A pupil reports a glitch that **only appears in fceux**, not the
  browser embedded emulator.  jsnes tolerates several PPU-timing and
  cycle-budget violations that real hardware (and fceux) enforce.
- A glitch is **timing-sensitive** — visible during scrolling /
  movement / dialogue open / multi-bg transition, gone when static.
- A glitch is **specific in space** (e.g. "row 28 only", "top of
  screen", "every 32 pixels vertically") — usually points at a
  nametable, attribute-table, or OAM data issue.

If the symptom is "the wrong tile shows up" or "the player won't move,"
the PPU viewers won't help — that's gameplay logic, not rendering.

---

## Step 1 — Build a ROM that reproduces the bug

1. In the editor, set up the simplest project that shows the
   problem.  For the scroll-flicker case: a horizontally-scrolling
   level (background ≥ 2 screens wide), a player sprite, and ideally
   a few scene sprites that move (so the problem is reproducible
   while the camera moves).
2. Click **▶ Play in NES** and pick **Local (fceux)** in the mode
   dropdown.  The playground server writes the just-built ROM to
   `steps/Step_Playground/_play_latest.nes` and launches fceux on
   it.  See the
   "native fceux now runs the SAME ROM as the browser" entry in
   `changelog-implemented.md` for context.

Alternatively: download the ROM from any editor page (⬇ ROM button)
and open it with `fceux <path>` from a terminal.

---

## Step 2 — Open the viewers

In FCEUX's menu bar, under **Tools** (or **Debug** on some builds):

- **PPU Viewer** — shows the contents of the two pattern tables
  (`$0000` and `$1000`) and all four palettes.  Useful for confirming
  your CHR data made it across and that palettes are what you expect.
- **Name Table Viewer** — shows the four nametables ($2000, $2400,
  $2800, $2C00) as the PPU sees them right now.  Critical for scroll
  debugging.
- **Hex Editor** (`Tools → Hex Editor` or `Ctrl+H`) — open it on
  **PPU Memory** to read attribute-table bytes ($23C0–$23FF for
  NT0, $27C0–$27FF for NT1).
- **Code/Data Logger** and **Trace Logger** — only needed if you're
  pinning down a specific instruction.  Skip for routine
  scroll/render debugging.

**Recommended layout:** keep the game window plus the **Name Table
Viewer** visible side-by-side.  The Name Table Viewer auto-refreshes
each frame and shows you exactly what the PPU is reading from.

---

## Step 3 — Reproduce the glitch and freeze a frame

1. Play the game until the glitch is on-screen.  For scroll-flicker:
   walk forward until the flicker band appears.
2. Press **Pause** (default keybind in FCEUX is **Pause** or
   **Backslash** depending on build).  The Name Table Viewer freezes
   on the same frame.
3. With the game paused, press the right-arrow / **F** (frame-step)
   key one frame at a time to advance.  Watch the Name Table Viewer
   for what changes between frames.

---

## Step 4 — What to look for

### A. Name Table Viewer

You're looking for four things:

1. **Are NT0 ($2000) and NT1 ($2400) full of the right tile data?**
   For a horizontally-scrolling world they should hold the level's
   data, with new columns streamed in by `scroll_stream()` as the
   camera moves.  If a column has tile 0 (transparent / blank) where
   it shouldn't, `scroll_stream` didn't fire or wrote to the wrong
   address.
2. **Are NT2 ($2800) and NT3 ($2C00) showing what you expect?**
   The project uses **horizontal mirroring** (`NES_MIRRORING: 1` in
   `nes.cfg`), so $2800 mirrors $2000 and $2C00 mirrors $2400.  The
   Name Table Viewer might draw NT2 / NT3 anyway — if they don't
   look like exact copies of NT0 / NT1, a stale write happened.
3. **Is there garbage at the top or bottom of any nametable?**
   Specifically rows 0–1 or rows 28–29 are common spots where mid-
   frame writes overrun the vblank window and corrupt the start /
   end of a column.  Rows 28–29 corruption matches the symptom
   "flickering just below the current background location."
4. **Does the bottom-right of any nametable (the attribute area)
   look like junk-looking colour swatches?**  That's normal — the
   last 64 bytes of each NT are the attribute table.  But if those
   bytes change from frame to frame while the player is scrolling,
   `scroll_stream` is overwriting attributes when it shouldn't.

### B. Palette panel of the PPU Viewer

Compare the four BG palettes on screen vs what you painted in the
editor.  If a palette slot shows the wrong colour, either the
palette was overwritten (rare) or the build picked up a stale
`palettes.inc`.

### C. Attribute table bytes (Hex Editor)

In the Hex Editor, switch the dropdown to **PPU Memory** and jump to
**$23C0**.  The next 64 bytes are NT0's attribute table.  Each byte
covers a 32×32-pixel block (4×4 tiles).  Layout is row-major: byte
0 = top-left block, byte 7 = top-right, byte 8 = next row down, …,
byte 63 = bottom-right.

**For the scroll-flicker case specifically:** check whether the
attribute bytes at the bottom-right of NT0 ($23F8–$23FF, the bottom
attribute row) change while the camera scrolls horizontally.  They
should NOT — `scroll_stream` only writes tile rows 0–29 of a
column, not attribute bytes — but any change there means we're
scribbling past the tile area.

### D. OAM (Object Attribute Memory) — sprite list

`Tools → Sprite Viewer` (sometimes labelled "OAM Viewer") shows the
64 sprite entries.  Each row is `Y / Tile / Attr / X`.  Worth a
glance to confirm:

- Sprites you expect off-screen have **Y = $FF** (or ≥ $F0).  The
  OAM-shadow buffer is supposed to park them there each frame —
  see the OAM-DMA changelog entry from 2026-04-24.
- Player + scene sprites are at the world-coordinate positions you
  expect.

If a sprite has a Y value in the visible range that "shouldn't"
have one — or several sprites cluster on a single scanline — you
might be hitting the NES's **8-sprites-per-scanline** hardware limit
(extra sprites on that scanline silently drop, which looks like
flicker).  That's a real hardware constraint, not a bug to fix in
code; classic NES games mitigate it via OAM cycling (rotating which
sprites get drawn first each frame).

### E. PPU registers (status bar / hex)

FCEUX's status bar shows the live PPU registers.  The two that
matter for scroll debugging are:

- **PPU_CTRL** ($2000) — bit 0 selects the X nametable, bit 1 the
  Y nametable, bit 2 is the PPU_DATA write stride (+1 vs +32),
  bit 7 enables NMI.  Should normally be `$10` (BG pattern table 1)
  or `$11` / `$12` / `$13` depending on which nametable the camera
  is straddling.
- **PPU_SCROLL** is internal — fceux doesn't always expose it, but
  the **Code/Data Logger** can show writes to `$2005` over time if
  you really need it.

If PPU_CTRL ever shows the +32 stride bit (bit 2, value `$04`) set
while rendering is active, `scroll_stream` left it on by mistake —
that was the latent bug fixed by the explicit `PPU_CTRL =
PPU_CTRL_BASE` reset at the end of `scroll_stream` in
[steps/Step_Playground/src/scroll.c](steps/Step_Playground/src/scroll.c).

---

## Step 5 — Capture the symptom for a bug report

When you find the issue, capture enough so the next person can fix
it without re-running the whole investigation:

1. **Screenshot of the game window** showing the glitch.
2. **Screenshot of the Name Table Viewer** at the same paused
   frame.  Highlight the suspicious region if you can.
3. **Frame number** (FCEUX shows a counter in the title bar in
   debug builds).
4. **What was happening just before** — "scrolling right at
   `walk_speed=2`", "dialogue just opened", "after walking through
   a door", etc.  The trigger context narrows the search.
5. **A short description** of what you saw: which scanline range,
   which column range, single-frame flash vs sustained, every frame
   vs every other frame, etc.

---

## Step 6 — Common findings, mapped to fixes

| Symptom | Likely cause | Where to look in this codebase |
| ------- | ------------ | ------------------------------ |
| Top 8 px of screen flicker during scroll | OAM DMA running late; sprite-0 / shadow not refreshed before pre-render | already addressed by the OAM-DMA-first reorder; if recurs, check vblank_writes ordering in `platformer.c` |
| Bottom 1–2 rows of screen flicker during scroll | Column write overruns vblank; tail of `scroll_stream` writes during active render | reduce work: `scroll_stream` already capped to one transfer per axis per vblank; consider splitting column writes across two frames |
| Entire screen judders / camera jitter | `PPU_SCROLL` written before all `PPU_ADDR` writes settle | `scroll_apply_ppu()` must be the LAST PPU register access in vblank — verify nothing was added after it |
| Wrong palette colours on a row | Attribute bytes not updated by `scroll_stream` | for very wide worlds (>2 screens), need to extend `scroll_stream` to write attributes too — currently it only writes tiles |
| Sprites flicker only when 8+ on one scanline | NES hardware 8-per-scanline limit | not a bug; mitigate with OAM cycling (scheduled in plan) |
| Bottom of level appears at top of screen | Vertical scroll wrap with horizontal mirroring (NT2 mirrors NT0) | the project's mirroring choice — vertical scrolling is intentionally limited; document the limitation if pupils try to make tall worlds |

---

## Reporting back

Drop a screenshot or two plus the frame-step description into the
chat / a feedback entry, and I can usually map it to a specific
function within an hour.  The most useful single piece of
information is "where on the screen, and what frame-by-frame
behaviour" — much more than "it flickers."

---

## See also

- [changelog-implemented.md](../changelog/changelog-implemented.md) — recent
  vblank-timing fixes (OAM DMA, scroll_stream cap, scroll_apply_ppu
  ordering).  Provides context on what we've already addressed.
- [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §8 — known limitations
  including the horizontal-mirroring caveat.
- [2026-04-26-next-steps.md](../plans/archive/2026-04-26-next-steps.md) Phase 1.1 / C2 — the
  parked scroll-flicker investigation this guide supports.
