# Arc B — A Readable Dialogue Box (implementation plan)

*Target: `/home/duguid/projects/nesgame/attempt1` — the browser NES game maker (cc65).*
*Status: ✅ IMPLEMENTED (2026-06-19). See the changelog entry. Verified with the
Arc A render harness (`render-dialogue-box.mjs`, updated `render-dialogue-visible`,
`round2-dialogue` guards); `run-all.mjs` green, byte-identical intact.*
*Author context: the dialogue text was just made camera-relative for scrolling
maps; the remaining gap is colour control. See
`docs/plans/current/2026-06-18-next-phase-suggestions.md` §"Arc B".*

> **Deviations from this plan (as built):**
> - **User chose the full-width banner (Option A)** over the narrow box.
> - **No dedicated box-fill tile** (as the plan's "revised, simpler"
>   recommendation foresaw): blank `0x20` cells render colour 0 = `universal_bg`
>   in any palette, so the box body is uniform and only the *text* cells need
>   the reserved palette.
> - **The banner is snapped to the attribute grid in world space** (it spans the
>   1–2 attribute rows the text occupies, filled in full), which makes the
>   recolour/​fill footprints identical and lets the attribute writes be
>   whole-byte — no read-modify-write, even on scroll builds.
> - **Verification reads the nametable + decoded attribute table + loaded
>   palette, not the framebuffer.** jsnes mis-restores the PPU scroll after the
>   banner's many mid-vblank writes (correct on real hardware), so the rendered
>   framebuffer is unreliable for dialogue — but "text tiles present + region in
>   palette 3 + palette 3 = white" proves legibility exactly.
> - The §4.1 framebuffer pixel-sampling / contrast-threshold plan was therefore
>   replaced by the attribute/palette assertions above.

---

## 1. Goal & the exact problem

### The goal
Dialogue text must be **legible on any project**, regardless of what background
art the pupil painted under the box. Today it is not: the glyph colour is
whatever the background attribute table assigns to that screen region, so on
many projects the text is low-contrast or invisible.

### Why text is illegible today — a cited walk-through

Dialogue renders by writing **glyph tile indices straight into the nametable**.
The vblank draw loop is in the `dialogue` module of
`tools/tile_editor_web/builder-modules.js`:

- It picks a PPU base for each row and walks the columns writing one tile per
  character (`builder-modules.js:1200`–`1261`):
  - `dlg_tile = dlg_line[dlg_j];` then `PPU_DATA = dlg_tile;`
    (`builder-modules.js:1233`, `:1260`).
  - The glyph tiles themselves are the built-in font, auto-seeded into **blank
    background tile slots at their ASCII indices** by the server
    (`_DIALOGUE_FONT` + `_seed_dialogue_font` in
    `tools/playground_server.py:583`–`672`, called from `build_chr`
    `:687`). So `A` is tile `0x41`, `Z` is `0x5A`, space is `0x20`, etc.

Crucially, **the loop writes tile indices only — it never touches the attribute
table.** On the NES, the colour of a background tile is *not* a property of the
tile; it is selected per-16×16-pixel region by the **attribute table**, which
names one of the **4 BG sub-palettes** for that region. The attribute bytes are
authored from the pupil's painted palette choices and emitted by the server:

- Per-screen attribute encoding lives in `_nametable_bytes_for`
  (`playground_server.py:744`–`757`) and, for scrolling worlds, in
  `_world_nametable` (`:1798`–`1817`). Each attribute byte packs **four 2×2-tile
  quads**, each quad carrying a 2-bit palette id (`pal = … & 3`,
  `byte |= pal << (quad*2)`). The granularity is therefore **16×16 px (2×2
  tiles) per palette select**, **32×32 px (4×4 tiles) per attribute byte**.
- The 4 BG sub-palettes come from `bg_palettes` in editor state
  (`index.html:1612` `defaultBgPalettes()` — 4 entries of 3 colour slots each)
  and are emitted as `palette_bytes[0..15]` by `build_palettes_inc`
  (`playground_server.py:780`–`799`); the engine uploads them to PPU `$3F00`
  in `write_palettes()` (`builder-templates/platformer.c:336`–`342`).

So when the dialogue loop writes glyph tile `0x41` at, say, tile-row 25 /
tile-col 10, the **glyph's colour-1 pixels are drawn through whichever BG
sub-palette the attribute byte for that region already selected** — i.e.
whatever the pupil painted there (grass, sky, stone…). The font glyph is drawn
in palette **colour index 1** (the `_glyph` helper marks `#` as "on pixel
(colour 1)", `playground_server.py:565`–`566`). If that region's
sub-palette has a colour-1 that is dark-on-dark or close to the colour-0
background, the text is unreadable. There is **no box** behind the text and **no
dedicated palette**, so contrast is pure luck.

This is the "real gap" called out in the next-phase doc
(`2026-06-18-next-phase-suggestions.md:64`–`69`).

---

## 2. Design

### Recommended approach (summary)

1. **Reserve BG sub-palette 3** (`bg_palettes[3]`, palette id `3`) as the
   **dedicated dialogue palette**, seeded by the server **only when the
   dialogue module is on**: colour-0 = near-black box, colour-1 = bright
   readable text (e.g. white), with colours-2/3 left available.
2. **Reserve one background tile** as a **solid box-fill tile** (every pixel =
   colour 1), seeded by the server into a known slot, so the box has an opaque
   dark background instead of showing the scenery through the gaps between
   glyphs.
3. On dialogue **open**, the vblank block:
   - writes the **box-fill tile** across the full box width on every dialogue
     row **before** overwriting cells with glyph tiles (so blank columns and
     the gaps inside letters read as solid box, not scenery), and
   - writes the **attribute bytes** for the box region to select palette `3`.
4. On dialogue **close**, restore both the tiles (already done from
   `bg_world_tiles` / `bg_nametable_0`) **and** the original attribute bytes.
5. Do the attribute write **camera-relative and inside the existing vblank
   window**, mirroring the tile path — it is only a handful of bytes, far
   cheaper than the 28×N tile writes already there.

This is the natural completion of the font + scroll work and needs no new
runtime subsystem.

#### Why this approach (justification)

- **A dedicated palette is the only correct fix.** The NES gives exactly 4 BG
  sub-palettes; colour is region-selected by attributes. The *only* way to
  guarantee a known text colour independent of the pupil's art is to (a) own a
  sub-palette and (b) point the box region's attributes at it. Anything else
  (e.g. choosing glyph colour per project) is a heuristic that still fails on
  some palette.
- **Palette 3, not 0.** Palette 0 (`bg_palettes[0]`) is the editor default for
  "grass/ground" (`index.html:1612`) and is the most-used pupil palette; the
  attribute encoders default unpainted regions to `pal = 0`
  (`playground_server.py:753`, `:1811`). Reserving palette **3** (the
  least-used, "sky" by default) minimises disruption and matches the existing
  "reserve the last/least-used resource for the engine" convention already used
  for letter tiles (`index.html:2427` reserves the glyph *tile* slots).
- **A box-fill tile is needed because attributes alone are not enough.** Setting
  the region to palette 3 recolours the *existing* scenery tiles under the box
  to palette 3's colours — but those scenery tiles still have their own shapes.
  We need the cells the text does *not* cover (inter-word spaces, the gaps
  inside/around letters that fall on whole empty tiles, and any row cells past
  the end of a short line) to read as a **solid dark block**. The cleanest way
  is a dedicated **opaque fill tile** (all pixels colour 1 → drawn in palette
  3's colour 1 — wait: see note) painted across the row first.

  > **Colour-index note (important).** Glyph "on" pixels are colour **1** and
  > "off" pixels are colour **0** (`playground_server.py:565`). For a *dark box
  > with bright text* we want: box background = palette-3 **colour 0**, text =
  > palette-3 **colour 1**. So the **box-fill tile should be all colour 0**, not
  > all colour 1 — i.e. it is simply a tile whose pixels are entirely 0. But an
  > all-zero tile is exactly the *blank* tile `0x20` (space), which the engine
  > also uses as transparent background. Writing `0x20` is therefore *not* a
  > solid box — it shows colour 0 of palette 3, which over palette 3 is the box
  > colour. **This is actually fine and is the simplest design:** with the
  > region's attributes pointed at palette 3, an empty/`0x20` cell renders as
  > palette-3 colour 0 (the dark box), and a glyph cell renders palette-3
  > colour 0 (box) for its off pixels and palette-3 colour 1 (white) for its on
  > pixels. **No separate fill tile is strictly required** — the box "fill" is
  > just colour 0 of the dialogue palette showing through every cell, glyph or
  > not.

  **Revised, simpler recommendation:** do **not** add a dedicated fill tile.
  Instead (a) make the box region use palette 3 via attributes, and (b) ensure
  every cell in the box rows is either a glyph or `0x20` (blank), so the whole
  box rectangle paints in palette-3 colours. The text loop already breaks on
  the NUL terminator (`builder-modules.js:1234`); we extend it to **pad the
  rest of the row with `0x20`** (instead of `break`) so a short line still fills
  the box width with box-colour cells rather than leaving scenery showing.
  This keeps CHR untouched (no reserved tile) — see §3 "do we need a reserved
  box tile?" for the trade-off and the fallback if a *visible border* is wanted.

  *(If the team later wants a lighter/coloured box body or a 1-px border frame,
  reintroduce a dedicated fill/border tile — kept as a documented option in §3,
  not the default.)*

- **Attribute writes are cheap and fit the existing budget.** The box spans at
  most tile-cols 2..29 over 1–3 tile-rows. In attribute space that is a small
  set of bytes (see the granularity analysis below). The tile loop already
  writes up to 3×28 = 84 `PPU_DATA` bytes inside vblank
  (`builder-modules.js:1182`); the attribute write adds **≤ ~8–16 bytes** — an
  order of magnitude cheaper.

#### Attribute-region geometry (the load-bearing detail)

Constants today (`builder-modules.js:1029`–`1033`):
`BW_DIALOG_ROW 25`, `BW_DIALOG_COL 2`, `BW_DIALOG_WIDTH 28`,
`BW_DIALOG_ROW_COUNT` ∈ {1,2,3}. A nametable is 32×30 tiles; attributes are
8×8 bytes; each byte = 4×4 tiles; each 2-bit field = 2×2 tiles.

- **Rows 25,26,27** all fall in **attribute-row 6** (covers tile-rows 24–27).
  So *all three* possible dialogue rows live in a **single attribute row**.
- **Cols 2..29** span **attribute-cols 0..7** (the whole 8-byte width).

**Consequence — coarse granularity bleed (must be designed for, and pupil-
visible):**
- Attribute-row 6 also covers **tile-row 24** (the row directly above the box).
  Pointing attr-row 6 at palette 3 will recolour tile-row 24 too.
- The 2×2 quad granularity means the **left edge** (tile-cols 0–1, *outside*
  the box, since box starts at col 2) and **right edge** (cols 30–31, outside
  the box width that ends at col 29) share attribute fields with box cells.

Two ways to handle this; the plan **recommends Option A**:

- **Option A — accept and mask the bleed with the box itself (recommended).**
  Widen the *tile* fill to the **attribute-aligned rectangle** so the visible
  box exactly matches the recoloured region: snap the box to **tile-cols 0..31
  (full width) and tile-rows 24..27** (attr-row 6), i.e. draw box-colour cells
  across the whole attribute footprint. Then the recolour is invisible because
  every recoloured cell *is* part of the (now full-width) box. This means
  moving `BW_DIALOG_COL` effectively to 0 and the box to a full-width banner
  occupying tile-rows 24–27 — a classic full-width JRPG text banner, which also
  reads better. Text still starts at col 2 (a 2-tile left margin) for aesthetics.

  > Net change: the **box rectangle** = tile-rows `24 .. (24 + 3)` capped to the
  > rows actually used, full 32-tile width; **attributes** = attr-row 6,
  > attr-cols 0..7; **text** = unchanged position (rows 25..). This makes the
  > recolour footprint and the fill footprint identical → no bleed.

- **Option B — keep the narrow box, restrict palette to inner quads only.**
  Only set palette 3 on the 2×2 quads fully inside cols 2..29 / rows 25..27 and
  leave edge quads on their original palette. More attribute bookkeeping, leaves
  the box edges showing scenery colour, and the top edge (row 24) cannot be
  excluded because it shares the quad with row 25. **Rejected** — more code,
  worse result.

#### Camera-relative attribute addressing

The attribute table for a nametable is at `nt_base + 0x3C0`
(so **$23C0 / $27C0 / $2BC0 / $2FC0** for NT0/1/2/3), confirmed in the scroll
core (`steps/Step_Playground/src/scroll.c:333`: `addr = nt_base + 0x3C0 + …`).

The dialogue tile loop already computes a camera-relative world row/col and
picks the nametable (`builder-modules.js:1213`–`1217`, `:1246`–`1251`):
```
dlg_wrow = (cam_y >> 3) + dlg_srow;          // world tile row
dlg_wcol0 = (cam_x >> 3) + BW_DIALOG_COL;     // world tile col
... 0x2800 + (dlg_wrow-30)*32  vs  0x2000 + dlg_wrow*32   // NT select by row
... ((dlg_wc & 32) ? 0x0400 : 0)                          // NT select by col
```
The attribute write reuses the **same world tile coordinates** but maps them to
attribute space:
- **Which nametable**: identical selection logic to the tile path
  (`wrow >= 30` → +0x800 vertical band; `wc & 32` → +0x400 horizontal). Reuse
  the already-computed nametable base.
- **Attribute byte address** within that nametable:
  `attr_addr = nt_base + 0x3C0 + (attr_row * 8) + attr_col`
  where `attr_row = (world_tile_row_within_screen) >> 2` and
  `attr_col = (world_tile_col_within_screen) >> 2`, with the within-screen tile
  coords being `world_tile & 31` (col) and the row reduced by the band offset
  (mirroring `wrow >= 30 ? wrow-30 : wrow`).
- **The box can straddle the col-32 nametable boundary** (Option A's full-width
  banner makes this *more* likely): just as the tile loop re-points `PPU_ADDR`
  whenever the run crosses a 32-tile boundary (`builder-modules.js:1246`), the
  attribute loop must split into the **left-NT attr-cols** and **right-NT
  attr-cols** when `cam_x` is not a multiple of 256. Because there are only 8
  attr-cols, this is at most two short bursts.

> **Read-modify-write subtlety for attributes.** Each attribute byte holds 4
> quads covering a 4×4-tile area. In Option A the box owns the entire 4×4 area
> for attr-row 6 across the screen, so we can **write whole bytes** (all four
> quads = palette 3) and **restore whole bytes** from the source-of-truth array
> on close. No bit-masking needed. This is only true because Option A snaps the
> box to the attribute grid — another reason to prefer it.

#### Where the "source of truth" for restore comes from

The tile restore already reads from ROM-resident copies rather than reading
VRAM back (a hard-won fix — see the long comment at `builder-modules.js:1152`–
`1170` and the regression guards in `round2-dialogue.mjs:109`–`134`):
- **Scroll build**: `bg_world_tiles[...]` (`builder-modules.js:1237`).
- **Non-scroll build**: `bg_nametable_0[...]` (`builder-modules.js:1239`).

The attribute restore must do the same — **never** read `PPU_DATA`
(guarded against at `round2-dialogue.mjs:119`):
- **Scroll build**: restore from **`bg_world_attrs[...]`** — already emitted by
  `build_bg_world_c` (`playground_server.py:1888`) and consumed by the scroll
  core's attribute upload (`scroll.c:337`). Indexing mirrors the scroll core:
  `bg_world_attrs[(screen_y*8 + attr_row)*BG_WORLD_ATTR_COLS + screen_x*8 + attr_col]`
  (cf. `scroll.c:337`–`339`, `_world_nametable` layout `:1817`).
- **Non-scroll build**: the per-screen attribute bytes are the **last 64 bytes**
  of `bg_nametable_0` (the 1024-byte blob is `960 tiles + 64 attrs`,
  `playground_server.py:762`, `:1399`). So restore from
  `bg_nametable_0[960 + attr_row*8 + attr_col]`.
  *Today `bg_nametable_0` is only emitted under `BW_DOORS_MULTIBG_ENABLED`
  (`playground_server.py:1431`).* Confirm it is present whenever dialogue
  is on in a non-scroll build (the tile restore at `:1239` already depends on
  it, so this is an existing precondition — verify, do not assume).

---

## 3. Concrete changes (per file)

### 3.1 `tools/tile_editor_web/builder-modules.js` — the `dialogue` module

All edits are inside `modules['dialogue'].applyToTemplate` (starts
`builder-modules.js:925`).

**(a) New macros (declarations slot, near `builder-modules.js:1028`–`1035`).**
Add:
```c
#define BW_DIALOG_PALETTE      3        /* reserved BG sub-palette for the box */
#define BW_DIALOG_BANNER_COL   0        /* Option A: box fill spans full width */
#define BW_DIALOG_BANNER_WIDTH 32
#define BW_DIALOG_ATTR_ROW     6        /* (BW_DIALOG_ROW>>2); rows 25..27 ⊂ attr-row 6 */
```
Keep `BW_DIALOG_ROW/COL/WIDTH/ROW_COUNT` as-is so the **text** position is
unchanged (preserves the existing visible text layout and the round2 guards
that assert those defines, `dialogue-scroll.mjs`/`round2-dialogue.mjs`).

**(b) Box fill + pad-to-width in the existing tile loop
(`builder-modules.js:1230`–`1261`).**
Change the per-character logic so a short line **pads with `0x20`** to the box
width instead of `break`-ing:
```c
if (bw_dialog_cmd == 1) {
    dlg_tile = dlg_line[dlg_j];
    if (dlg_tile == 0) dlg_tile = 0x20;   /* pad rest of row as box, was: break */
    if (dlg_ended)      dlg_tile = 0x20;   /* stay padded once terminator seen */
    else if (dlg_line[dlg_j] == 0) dlg_ended = 1;
} else { ... restore as today ... }
```
(Implementation detail: track a `dlg_ended` flag per row so we keep emitting
`0x20` after the terminator without re-reading past it.) This makes every box
cell either a glyph or blank → uniform box colour once attributes point at
palette 3. **Net effect on existing 1-line "HELLO":** instead of stopping after
5 tiles, it writes 5 glyph tiles + 23 `0x20` tiles across the box width. (This
*does* change the emitted bytes vs today for the non-dialogue-irrelevant case;
gated entirely behind `BW_DIALOGUE_ENABLED`, so non-dialogue ROMs are
unaffected — see §4.)

> If Option A's **full-width banner** is adopted, draw the fill from
> `BW_DIALOG_BANNER_COL` for `BW_DIALOG_BANNER_WIDTH` cells (the left margin
> cols 0–1 and the right margin get `0x20`; text still starts at col 2). The
> tile loop's left margin / right margin are plain `0x20` writes.

**(c) Attribute write on open + restore on close (new block, immediately after
the tile loop closes the `for (dlg_r ...)` at `builder-modules.js:1262`, still
inside `if (bw_dialog_cmd != 0)`).**
Pseudocode (C, both `#ifdef SCROLL_BUILD` arms):
```c
/* Box palette: point attr-row BW_DIALOG_ATTR_ROW at palette 3 on open,
 * restore the saved bytes on close.  Whole-byte writes because Option A
 * snaps the box to the 4x4 attribute grid. */
{
    unsigned char dlg_ac;
#ifdef SCROLL_BUILD
    unsigned int  dlg_wtr = (cam_y >> 3) + BW_DIALOG_ROW;     /* world tile row */
    unsigned int  dlg_band = (dlg_wtr >= 30) ? 1 : 0;
    unsigned int  dlg_nt   = 0x2000 + (dlg_band ? 0x0800 : 0);
    unsigned int  dlg_atr  = ((dlg_band ? dlg_wtr - 30 : dlg_wtr) >> 2);
    unsigned int  dlg_wtc0 = (cam_x >> 3);                    /* world tile col */
    for (dlg_ac = 0; dlg_ac < 8; dlg_ac++) {
        unsigned int dlg_wc  = dlg_wtc0 + (dlg_ac << 2);
        unsigned int dlg_nt2 = dlg_nt + ((dlg_wc & 32) ? 0x0400 : 0);
        unsigned int dlg_aa  = dlg_nt2 + 0x3C0 + dlg_atr * 8 + ((dlg_wc & 31) >> 2);
        unsigned char val;
        if (bw_dialog_cmd == 1) {
            val = 0xFF & (BW_DIALOG_PALETTE * 0x55);   /* all 4 quads = pal 3 -> 0xFF */
        } else {
            unsigned int sx = (dlg_wc >> 5);           /* screen col index */
            unsigned int sy = dlg_band;                /* screen row index */
            val = bg_world_attrs[(sy*8 + dlg_atr) * BG_WORLD_ATTR_COLS
                                 + sx*8 + ((dlg_wc & 31) >> 2)];
        }
        PPU_ADDR = (unsigned char)(dlg_aa >> 8);
        PPU_ADDR = (unsigned char)(dlg_aa & 0xFF);
        PPU_DATA = val;
    }
#else
    unsigned int  dlg_atr = (BW_DIALOG_ROW >> 2);             /* = 6 */
    for (dlg_ac = 0; dlg_ac < 8; dlg_ac++) {
        unsigned int dlg_aa = 0x23C0 + dlg_atr * 8 + dlg_ac;
        unsigned char val;
        if (bw_dialog_cmd == 1) val = 0xFF;                  /* pal 3 in all quads */
        else                    val = bg_nametable_0[960 + dlg_atr * 8 + dlg_ac];
        PPU_ADDR = (unsigned char)(dlg_aa >> 8);
        PPU_ADDR = (unsigned char)(dlg_aa & 0xFF);
        PPU_DATA = val;
    }
#endif
}
```
Notes:
- `BW_DIALOG_PALETTE * 0x55` == `3*0x55` == `0xFF` (all four 2-bit quads = 3).
  Spell it as `0x55 * BW_DIALOG_PALETTE` so changing the reserved palette id
  keeps working; or just hardcode `0xFF` with a comment.
- The two-`PPU_ADDR`-per-byte form is wasteful but trivial (≤8 bytes); if cycle
  budget ever matters, set `PPU_ADDR` once and rely on +1 auto-increment for a
  contiguous attr-col run (the stride is +1 here, same as the tile row walk —
  `scroll.c:306` sets `PPU_CTRL_BASE` = +1). Contiguity breaks only at the
  col-32 NT boundary, so at most two runs. **Recommend the simple per-byte
  form first**, optimise only if Arc A flags a vblank overrun.
- **Restore must run for the same attr-row even on a single-row per-NPC draw.**
  The tile path already restores `BW_DIALOG_ROW_COUNT` rows on close even when
  the open was single-row (`builder-modules.js:1198`–`1199`); since all rows
  share attr-row 6, the attribute restore is a single attr-row regardless —
  simpler than the tile case.

**(d) New RAM/declarations.** No new save-state RAM is needed for the attribute
restore because we restore from the ROM arrays (`bg_world_attrs` /
`bg_nametable_0`), consistent with the tile restore. The only new symbols are
`#define`s.

### 3.2 `tools/playground_server.py` — seed the dialogue palette

**(a) Seed BG sub-palette 3 when dialogue is on.** Add a helper analogous to
`_seed_dialogue_font` (`playground_server.py:651`), called from the palette
emitters. In `build_palettes_inc` (`:780`) and `build_palettes_asminc`
(`:806`), when `_dialogue_module_enabled(state)` is true, **override
`bg_palettes[3]`** with the dialogue palette before emitting:

```python
DIALOGUE_BG_PALETTE = [0x0F, 0x30, 0x10]   # slot1=white text? see note
# Actually: palette row emitted is [ubg, slot0, slot1, slot2] (playground_server.py:793).
# Colour 0 of every BG palette is the universal_bg (shared!) -> the box "background"
# colour is universal_bg, which the pupil controls. See the caveat below.
```

> **Caveat — colour 0 is shared (`ubg`).** `build_palettes_inc` forces every BG
> palette's colour 0 to `universal_bg` (`playground_server.py:793`,
> `:781`). So **palette 3 colour 0 == universal_bg**, the same backdrop colour
> as everywhere else — we do **not** independently control the box's background
> colour via colour 0. Two clean options:
>
> - **Use a non-zero colour for the box body via a fill tile after all.** Make
>   palette 3 = `{slot1 = dark box, slot2 = bright text}` and use a **fill tile
>   that is all colour 1** for the box body, with text drawn in **colour 2**.
>   This *requires* the dedicated box-fill tile (revisits the §2 decision) and a
>   glyph variant that uses colour 2 — too invasive for the font (glyphs are
>   colour 1, `playground_server.py:565`).
> - **Accept universal_bg as the box backdrop (recommended).** Set palette 3 =
>   `{slot1 = bright readable text, slot2/3 = anything}` and draw text in colour
>   1. The box "body" is then `universal_bg` (often a dark/black backdrop on
>   pupil projects; the codegen default `universal_bg` is `0x21`/`0x0F` in
>   various states — confirm). **Contrast is guaranteed between text (colour 1 =
>   our chosen bright value) and the box body (colour 0 = universal_bg)** as
>   long as we pick a text colour that contrasts with the *most common*
>   backdrops. Since pupils overwhelmingly use a dark/black `universal_bg`, set
>   **palette 3 slot1 = white (`0x30`)**. Text is then white-on-backdrop and
>   readable on the common case; the box rectangle is the backdrop colour
>   (uniform, since every box cell is glyph-or-blank → all show colour 0).

  **Recommended seed:** `bg_palettes[3].slots = [0x30, 0x16, 0x0F]`
  (slot1 white text, slot2 a red accent for a future border, slot3 black). The
  box body is `universal_bg`. This guarantees *white text* — the controlled,
  known-readable colour the Arc-A harness checks for.

  **If the team wants a guaranteed dark box independent of universal_bg**, that
  is the fill-tile + colour-2-text route above; document it as a follow-up,
  since it touches the font. Keep Arc B scoped to the white-text-on-backdrop
  box, which already removes the "blends into scenery" failure (the text colour
  is now fixed, not attribute-dependent).

**(b) Do NOT change the attribute *data* emission.** The server's
`_world_nametable` / `_nametable_bytes_for` still emit the pupil's painted
palettes for every region. The dialogue palette is applied **at runtime** by the
vblank attribute write, and restored from the same arrays — so the static data
(and any non-dialogue path) is untouched. No `_world_nametable` change.

**(c) Reserved box tile — only if the fill-tile route is taken.** Not needed for
the recommended (universal_bg-body) design. If a dedicated body/border tile is
later wanted, seed it like the font: pick a reserved bg-tile index (e.g. `0x10`,
an ASCII control slot the font never uses) and fill it in `_seed_dialogue_font`
or a sibling, only when blank, only when dialogue is on (mirror
`playground_server.py:664`–`672`).

### 3.3 Editor (`tools/tile_editor_web/index.html`) + validators

**Does the editor need to reserve a palette slot (like the letter-tile
reservation)?**

- **Functionally, no** — the server overrides `bg_palettes[3]` at emit time, so
  even a pupil who edited palette 3 still gets a readable box. This mirrors how
  the font is seeded server-side regardless of the editor.
- **For UX, yes — add a light reservation/notice**, paralleling the existing
  glyph-tile reservation (`index.html:2427`–`2514`, the
  `DIALOGUE_GLYPH_SLOTS` red-tint + conflict banner):
  - When `dialogueModuleOn()` (`index.html:2442`), mark **BG palette 3** in the
    palette strip (`renderPaletteStrip`/`makePaletteSlot`, around
    `index.html:2880`–`2974`) with a "reserved for dialogue" tint and a tooltip
    ("Palette 4 is used by the dialogue box so text stays readable; changes here
    are ignored while Dialogue is on").
  - Optionally make palette-3 slots **read-only** while dialogue is on (the
    palette-slot widget already supports a `readonly` flag,
    `index.html:2918`/`:2922`).
  - This avoids the "I set palette 4 and it did nothing" confusion. It is the
    direct analogue of the letter-tile reservation and should reuse the same
    pattern (info line + tint).

**Validators (`tools/tile_editor_web/builder-validators.js`).** No new *blocking*
validation required. Optional: a soft note (like the unsupported-char warning at
the `SUPPORTED` set referenced in `playground_server.py:571`) if a pupil's
project has only 3 BG palettes' worth of distinct art and dialogue would consume
the 4th — but since we override palette 3 unconditionally, this is informational
only.

**Sync note.** No new char/tile set is introduced, so the existing 3-way sync
(`_DIALOGUE_FONT` ↔ `DIALOGUE_GLYPH_CHARS` ↔ `SUPPORTED`,
`playground_server.py:568`–`572`) is unaffected. If a reserved box *tile* is
added later, add it to whatever guard run-all enforces.

---

## 4. Verification

### 4.1 Arc-A render harness proves legibility (the headline check)

Arc A delivers "build a project through `/play`, load the ROM in jsnes, run N
frames, drive the controller, and read OAM / nametable / framebuffer to assert"
(`2026-06-18-next-phase-suggestions.md:46`–`48`). For Arc B add a render test
(new `tools/builder-tests/dialogue-box.mjs`, modelled on `dialogue-scroll.mjs`):

1. Build a project with dialogue on, **a deliberately hostile background**
   (paint the box region with art whose palette colour-1 ≈ colour-0, the case
   that makes today's text invisible).
2. Use Arc A's "spawn player adjacent to NPC / teleport" hook
   (`:49`–`51`) to make the interaction deterministic, press B, run a few frames.
3. Read the **framebuffer** in the box region and assert:
   - **Text pixels are the known readable colour.** Sample the pixels at glyph
     "on" positions of a known character (e.g. the first letter of "HELLO") and
     assert they equal the NES master-palette RGB for **palette-3 slot1
     (white / `0x30`)** — *not* whatever the scenery palette would give.
   - **Box body is uniform.** Sample non-glyph cells across the box rectangle and
     assert they are all the single backdrop colour (universal_bg's RGB) — i.e.
     no scenery shows through.
   - **Contrast threshold.** Assert luminance(text) − luminance(body) exceeds a
     fixed threshold, so "legible on any project" is a measured property, not a
     visual hope.
4. Read the **attribute table** region of the active nametable (via jsnes PPU
   VRAM) and assert the box's attr-row bytes == `0xFF` (palette 3) while open,
   and == the original `bg_world_attrs`/`bg_nametable_0` bytes after close (the
   restore round-trips).
5. **Scroll variant.** Repeat on a 2×1 map after scrolling the camera, asserting
   the box and its palette land at the camera-relative position and straddle the
   col-32 boundary correctly (extends `dialogue-scroll.mjs`'s premise from
   "compiles" to "renders correctly").

### 4.2 Compile + byte-identical safety

- **Gate everything behind `BW_DIALOGUE_ENABLED`.** All new C (box pad, attribute
  writes) lives inside the `dialogue` module's emitted blocks, which only appear
  when the module is on. Non-dialogue projects emit identical C → identical ROM.
  The **byte-identical baseline** test (the frozen-golden-hash build of
  `Step_Playground`, referenced at `platformer.c:1466` and
  `playground_server.py:657`) must still pass unchanged, because it builds via
  `make` and never runs the dialogue path.
- **Keep the existing 1×1 vs scroll split intact.** The attribute write has the
  same `#ifdef SCROLL_BUILD` structure as the tile write; the non-scroll arm
  uses fixed `$23C0` (NT0) addressing — preserving the "1×1 path equivalent"
  property (no scroll symbols pulled in; `bg_world_attrs` referenced only under
  `SCROLL_BUILD`, matching `scroll.c:7`'s guard).
- **Honour the existing dialogue regression guards** in
  `tools/builder-tests/round2-dialogue.mjs` and `dialogue-scroll.mjs`:
  - **No `draw_text`/`clear_text_row` from per_frame** (`round2:91`–`98`) — the
    new code stays in `vblank_writes`. ✔
  - **No `PPU_DATA = 0x20;` as a *clear* mechanism** (`round2:115`). Careful:
    we now write `0x20` as **box padding on the *draw* path**, which is
    different from the forbidden *clear-by-spaces*. The guard regex is literally
    `/PPU_DATA = 0x20;/` and would **false-positive** on the new pad code.
    **Action:** the pad must not be emitted as the literal `PPU_DATA = 0x20;`
    (e.g. assign `dlg_tile = 0x20;` then the existing single `PPU_DATA =
    dlg_tile;` at `builder-modules.js:1260` does the write — which the guard
    does *not* match). Verify the assembled output does not contain the literal
    string, or update the guard with a comment distinguishing draw-pad from
    clear-by-space.
  - **No `= PPU_DATA;` VRAM reads** (`round2:119`) — attribute restore reads
    `bg_world_attrs`/`bg_nametable_0`, never VRAM. ✔
  - The `#define BW_DIALOG_*` value assertions (`dialogue-scroll.mjs:151`+)
    remain true (we **add** macros, don't change existing ones). ✔
- **New unit assertions** (extend `round2-dialogue.mjs`): assert the assembled C
  contains the attribute-write markers (`0x3C0` / `0x23C0`, palette-3 byte,
  `bg_world_attrs` restore) under the right `#ifdef`s.
- **Compile both ROMs**: run the existing `dialogue-scroll.mjs` 2×1 compile and
  a 1×1 dialogue compile through `/play` (as the tests already do) to prove both
  arms build with cc65.

---

## 5. The cosmetic forced-blank flash (out of scope)

When the box opens on a **scrolling** build, the whole vblank window runs with
`PPU_MASK = 0` (`platformer.c:1417`), and the per-frame open also triggers the
PPU writes — the brief blanking is visible as a flash. This is a **frame-model**
issue (the forced-blank-around-VRAM-writes pattern), explicitly deferred to the
**NMI-driven VRAM update model, codegen Sprint 5**
(`2026-06-18-next-phase-suggestions.md:70`–`71`, `:103`–`105`). Arc B does
**not** address it; the attribute writes added here are tiny and do not worsen
it (≤ ~8 extra bytes in the same window). Note only; no work in this plan.

---

## 6. Task breakdown, effort, dependencies, risks

### Task breakdown
1. **Server: seed dialogue BG palette 3** (`playground_server.py`): add
   `_seed_dialogue_palette`-style override in `build_palettes_inc` +
   `build_palettes_asminc`; choose `slots = [0x30, 0x16, 0x0F]`. *(S)*
2. **Module: box pad-to-width** (`builder-modules.js` tile loop): replace the
   `break` with `0x20`-pad + `dlg_ended` flag; (Option A) extend fill to
   full-width banner. *(S)*
3. **Module: attribute write/restore block** (`builder-modules.js`): both
   `#ifdef SCROLL_BUILD` arms, camera-relative, col-32-straddle handling,
   restore from `bg_world_attrs` / `bg_nametable_0`. *(M)* — the core of the arc.
4. **Editor: reserve/notice palette 3** (`index.html`): tint + tooltip +
   optional read-only on BG palette 3 when dialogue on (reuse the glyph-tile
   reservation pattern). *(S)*
5. **Tests:** new `dialogue-box.mjs` render test (needs Arc A harness); extend
   `round2-dialogue.mjs` unit guards (attr markers, no-`0x20`-clear false
   positive fix); extend `dialogue-scroll.mjs` to assert rendered box. *(M)*
6. **Docs/changelog:** record the reserved palette 3 + the box behaviour
   (`docs/changelog/changelog-implemented.md`, `BUILDER_GUIDE.md`). *(S)*

### Effort
**Small–medium overall** (matches `2026-06-18-next-phase-suggestions.md:74`).
Tasks 1/2/4/6 are small; tasks 3 and 5 are the medium core. Rough order:
1–1.5 focused arcs *including* the render test — but **task 5 cannot be done
well before Arc A exists**.

### Dependencies
- **Arc A (render harness) — required for verification**, not for the code. The
  code (tasks 1–4) can land first behind compile-only tests, but "prove
  legibility" (§4.1) needs Arc A's framebuffer/teleport tooling. Sequence per
  the doc: Arc A → Arc B (`:133`–`135`).
- Relies on existing emitted arrays: `bg_world_attrs`
  (`playground_server.py:1888` / `scroll.c:337`) and `bg_nametable_0`
  (`playground_server.py:1431`). **Verify `bg_nametable_0` is emitted in a
  non-scroll dialogue build** (the tile restore already needs it).

### Risks
- **Attribute-table corruption (highest).** Wrong nametable selection or
  off-by-one in the attr address writes palette bytes into tile space or the
  wrong NT — exactly the class of bug the scroll core already hit
  (`scroll.c:192`–`198`: bad row math wrote into `$23C0+`). Mitigation: reuse
  the *proven* nametable-selection expressions from the tile loop verbatim;
  whole-byte writes only (Option A); Arc-A test reads back the attr bytes and
  asserts the round-trip.
- **Coarse 16×16 attribute bleed (visible).** Recolouring attr-row 6 also
  recolours tile-row 24 and the box's edge quads (§2 geometry). Mitigation:
  Option A's attribute-aligned full-width banner makes the recoloured area
  exactly the box area. If the narrow box is kept, the top row and edges will
  show palette-3 colours — a visible artefact. **Decision required: adopt
  Option A.**
- **Vblank budget.** Adds ≤ ~8–16 `PPU_DATA` + their `PPU_ADDR` setups to a
  window already carrying OAM DMA (513 cyc), up to 84 tile writes, and the
  scroll burst (`scroll.c` notes the tail can spill past the T→V copy at cycle
  2358). Mitigation: the attribute write is an order of magnitude smaller than
  the tile write that already fits; if Arc A detects a spill, switch to the
  single-`PPU_ADDR`+auto-increment burst (≤2 runs). The box pad also *adds* tile
  writes (short lines now write full width) — net up to 3×28 = 84 already
  budgeted, so padding doesn't exceed the existing worst case.
- **`0x20`-clear guard false positive** (`round2-dialogue.mjs:115`). The new
  draw-time padding could trip the anti-`0x20` guard. Mitigation: emit padding
  via `dlg_tile = 0x20;` + the existing `PPU_DATA = dlg_tile;`, not a literal
  `PPU_DATA = 0x20;`; or refine the guard. **Must be checked or the test suite
  goes red.**
- **Palette reservation reduces pupil palettes from 4 → 3 (when dialogue on).**
  Pupils lose one BG sub-palette for their art while dialogue is enabled.
  Mitigation: reserve the *least-used* palette (3 = default "sky"), apply it
  **only when dialogue is on**, and surface it in the editor (task 4) so the
  loss is explicit, not silent. This is the same trade already accepted for the
  reserved letter tiles.
- **Universal-bg-as-box-body assumption.** The box body colour is `universal_bg`
  (colour 0 is shared, §3.2 caveat). If a pupil sets a *bright* `universal_bg`,
  white text on a bright box loses contrast. Mitigation (in priority order):
  (a) ship now with white text (legible on the common dark backdrop) — already
  strictly better than today; (b) follow-up: the fill-tile + colour-2-text route
  for a backdrop-independent dark box (documented in §3.2, deferred as it
  touches the font). Arc-A's contrast-threshold assertion will catch the bright-
  backdrop edge case and tell us whether (b) is needed.

---

### Appendix — key code references

| What | File:line |
|---|---|
| Dialogue vblank tile loop (`for (dlg_r …)`, `dlg_vbase`, restore) | `tools/tile_editor_web/builder-modules.js:1200`–`1264` |
| Camera-relative NT/col select for tiles | `builder-modules.js:1213`–`1217`, `:1246`–`1251` |
| Tile restore sources (`bg_world_tiles` / `bg_nametable_0`) | `builder-modules.js:1237`, `:1239` |
| Dialogue macros (`BW_DIALOG_ROW/COL/WIDTH/ROW_COUNT`) | `builder-modules.js:1029`–`1035` |
| Built-in font + colour-1 "on" pixel | `tools/playground_server.py:565`, `:583`–`628` |
| Font seeding (only-when-on, blank-only) | `playground_server.py:651`–`672`, `:687` |
| Attribute byte packing (2-bit quads, 16×16 granularity) | `playground_server.py:744`–`757`, `:1798`–`1817` |
| World attr array `bg_world_attrs` emit | `playground_server.py:1888`; consumed `scroll.c:331`–`341` |
| Attribute table address `nt_base + 0x3C0` ($23C0/$27C0/$2BC0/$2FC0) | `steps/Step_Playground/src/scroll.c:333` |
| BG sub-palettes in state + default | `tools/tile_editor_web/index.html:1612` |
| Palette emit (`palette_bytes`, colour 0 = universal_bg) | `playground_server.py:780`–`799` |
| PPU `$3F00` palette upload | `tools/tile_editor_web/builder-templates/platformer.c:336`–`342` |
| Forced-blank vblank window (flash) | `platformer.c:1417`; vblank_writes insert `:1429` |
| Letter-tile reservation precedent (editor) | `index.html:2427`–`2514` |
| Dialogue regression guards (no 0x20-clear, no VRAM read, vblank-only) | `tools/builder-tests/round2-dialogue.mjs:91`–`135` |
| Scrolling-dialogue compile test | `tools/builder-tests/dialogue-scroll.mjs` |
| Arc A / Arc B strategic framing | `docs/plans/current/2026-06-18-next-phase-suggestions.md:40`–`75` |
