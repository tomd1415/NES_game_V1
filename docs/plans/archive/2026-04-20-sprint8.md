# Sprint 8 — Palette & drawing-tool UX

Plan of record for the Sprint 8 work. Two deliverables, landed in
order: **palette refactor** first (one clean pass across both pages),
**drawing-tools popout** second.

References:
- [PUPIL_FEEDBACK.md §Sprint 8](PUPIL_FEEDBACK.md) — original asks
- [index.html](tools/tile_editor_web/index.html) — Backgrounds page
- [sprites.html](tools/tile_editor_web/sprites.html) — Sprites page

---

## Deliverable A — Palette editor refactor (8.2)

### Problem

Palette UI is scattered. The Backgrounds page has a huge panel with
Universal BG + four BG palette rows + four sprite palette rows + a
master grid stacked vertically — to assign a colour the pupil
clicks a slot, then hunts down the master grid, then clicks. The
Sprites page duplicates the master grid and four sprite palettes in
the side controls *and* shows a read-only BG palettes block *and*
has a floating palettes popout. Picking a colour for one slot
means tracking state across three or four blocks.

### Target shape

One **palette editor module** per page, sitting *next to* the master
grid (or with the master grid inside it). The editor shows exactly
one palette's four slots at a time. Every other palette is shown in
a compact **overview list** above it; clicking the overview row
(radio-style) loads that palette into the editor. Inside the editor,
`P0 P1 P2 P3` buttons are a keyboard-friendly second way to switch.

Flow the pupil follows:
1. Pick a palette (overview row *or* `P0–P3` buttons).
2. Pick a slot in the editor (or pick one by pressing `1/2/3` — slot
   0 is locked for BG).
3. Click a colour on the master grid → colour assigned to that slot.
4. Alternatively: drag a colour from the master grid onto *any* slot
   (in the editor or in the overview list) — no slot-selection step.

This is the same flow on both pages. The Sprites page editor only
exposes the four sprite palettes in the overview (BG palettes stay
read-only in a small collapsible for reference), because editing BG
palettes from the Sprites page was never the intent.

### State model

No change to persisted state. `state.palette.bg[row][slot]` and
`state.palette.sp[row][slot]` continue to hold colour indices. New
in-memory session state:

```js
let paletteEditor = {
  kind: 'bg',     // 'bg' | 'sp'  (Backgrounds page can edit both;
                  //               Sprites page forces 'sp')
  row:  0,        // 0..3
  slot: 1,        // 0..3 — slot 0 locked when kind==='bg'
};
```

Persist `paletteEditor` in `prefs.paletteEditor` via
`Storage.writePrefs` so a pupil comes back to the same palette open.

### Component breakdown

1. **`renderPaletteEditor(host, opts)`** — renders into `host`:
   - BG/SP kind toggle (hidden when `opts.lockKind === 'sp'`).
   - `P0–P3` row of buttons with the active one highlighted.
   - Four `.palette-slot` tiles for the active palette, with the
     currently-selected slot outlined. Slot 0 is `.bg-universal-locked`
     when kind is `bg`.
   - A compact master grid (8×8 NES colours). Reused from existing
     `master-grid` render — extract `buildMasterGrid(host, onPick)`
     so we can mount it inside the editor without duplicating code.
   - Drop target on every slot.

2. **`renderPaletteOverview(host, opts)`** — renders into `host`:
   - One row per palette (4 or 8 depending on page). Each row:
     `<radio> P0 [■][■][■][■]`.
   - Radio click → `setPaletteEditor({ kind, row })`.
   - Every slot is also a drop target so pupils can drop from the
     master grid onto *any* palette without opening it first.

3. **Drag-and-drop wiring.**
   - Master-grid cells get `draggable="true"` + `dragstart` handler
     setting `event.dataTransfer.setData('application/x-nes-color', idx)`.
   - Palette slots add `dragover` (preventDefault) + `drop` handler
     that reads the color index and calls `setSlotColour(kind, row,
     slot, idx)`.
   - A single helper `setSlotColour(kind, row, slot, idx)` is the
     only mutation path — both click-assign and drag-drop route
     through it so undo is consistent.

4. **Keyboard.**
   - `1/2/3` while focus is inside the editor picks slots 1/2/3
     (slot 0 is not selectable when BG).
   - `Shift+1..4` cycles `P0..P3` within the current kind.

### Files touched

Backgrounds — [index.html](tools/tile_editor_web/index.html):
- Replace `.palettes-panel` block (lines 973–997) with:
  - Overview list — *eight* rows (BG P0–P3, SP P0–P3), kind grouped.
  - Palette editor host div.
- Remove `#universal-bg` standalone row (universal BG colour lives
  in the BG-colour swatch in the nametable controls; the overview
  row for BG P0 now shows the shared slot 0 with lock icon and a
  tooltip pointing to that swatch).
- JS: extract `buildMasterGrid(host, onPick)`, add
  `renderPaletteEditor`, `renderPaletteOverview`, `setPaletteEditor`,
  `setSlotColour`.

Sprites — [sprites.html](tools/tile_editor_web/sprites.html):
- Remove duplicate `#master-grid` in `.sprite-side-controls` (line
  1654) and `#sp-palettes` compact strip (line 1650).
- Remove `#floating-palettes` popout — replaced by the in-panel
  editor module. Delete CSS rules `#floating-palettes`,
  `.fp-palette-row*` (lines 573–611).
- In the `.palettes-sub` block (line 1731), replace the
  read-only BG palettes with:
  - Sprite palette overview + editor module (the new component).
  - Collapsed `<details>` for BG palettes read-only, noting "edit
    these on the Backgrounds page".
- JS: import the shared component functions (copy-paste since these
  are two separate static pages today — see *Code reuse* below).
- Wire the existing `#sprite-side-palettes` pill row to drive
  `paletteEditor.row` on single-click so picking the cell palette
  also opens that palette in the editor.

CSS — both pages share a small set of classes:
- `.palette-editor` — flex container, editor + master grid side by
  side above 900 px wide, stacked below.
- `.palette-editor__slots` — row of four `.palette-slot` with the
  selected-slot outline style.
- `.palette-editor__picker` — the inline master grid.
- `.palette-overview` — vertical list of compact palette rows.
- `.palette-overview__row` — radio + label + four mini slots.
- `.palette-slot.drop-target` — dashed border on dragover.

### Code reuse between index.html and sprites.html

The two pages today ship their own copies of shared helpers via
inline `<script>`. Rather than extracting to an external module
(out of scope for this sprint), copy the new component functions
into both files. Mark each copy with
`// --- palette-editor: keep in sync across index.html and sprites.html ---`
so the next person to touch one knows to touch the other.

### Removal list

After the new module lands, delete:

- [index.html](tools/tile_editor_web/index.html): `#universal-bg` row,
  the separate `<h3>Background palettes</h3>` + `#bg-palettes` block,
  the separate `<h3>Sprite palettes</h3>` + `#sp-palettes` block,
  the `.master-palette` wrapper around `#master-grid` (the master
  grid now lives inside the editor module).
- [sprites.html](tools/tile_editor_web/sprites.html): `#sprite-side-palettes`
  pills (replaced by the overview radios), `#sp-palettes` compact
  strip, side-panel `#master-grid`, entire `#floating-palettes`
  popout + its button + its CSS.
- Any helper functions only used by the deleted blocks
  (`renderPinnedSwatches` stays — it drives "in use" swatches on
  both pages).

Search before deleting — some callers may still reference
`document.getElementById('sp-palettes')` from other code paths.

### Verification

- `node --check` on the extracted script block of each page.
- Round-trip: load an existing project (pre-Sprint 8 schema) and
  confirm palettes render correctly — no schema migration needed.
- Manual UI checklist in the browser:
  1. Click BG P2 in overview → editor shows BG P2. `P0–P3` buttons
     highlight `P2`.
  2. Click slot 2 in editor → slot outline moves.
  3. Click master-grid cell `0x16` → BG[2][2] becomes `0x16`.
     Tileset and nametable previews repaint.
  4. Drag master-grid cell onto BG P3 slot 1 in the overview →
     BG[3][1] changes; editor still on BG P2.
  5. Switch to SP via kind toggle → P0–P3 now edit sprite palettes.
  6. Sprites page: open `sp-palettes` overview, pick SP3, drag a
     colour onto slot 3 → sprite canvas repaints.
  7. Undo (`Ctrl-Z`) after any colour change reverts it.
- Confirm the `▶ Play in NES` pipeline still builds — palette bytes
  are emitted by existing code that reads `state.palette`, not by
  anything the refactor touches.

### Effort estimate

S-to-M per page, M for the removal sweep. ~300–450 lines net
change (mostly new component JS + CSS; deletes offset some of it).

---

## Deliverable B — Drawing-tools popout (8.1)

Lands *after* Deliverable A. Keeping the plan short — flesh out
once we're into it.

### Problem

The Sprites pixel editor is pencil-only. Pupils have asked for
fill, line, rect, circle, and a region-select. Multi-tile sprites
make this harder: a rectangle drawn across two tiles has to land
pixels in both tiles without the pupil re-selecting.

### Target shape

- A `🛠 Tools ▾` button in the pixel-editor toolbar opens a small
  popover with: Pencil (default), Fill, Line, Rect, Circle, Select.
  Keep the popover compact — it's meant to be tucked away most of
  the time.
- Each tool registers `onPointerDown / onPointerMove / onPointerUp`
  against the **composition canvas** (sprite-level coordinate
  space), not a single tile. Tools operate in "sprite pixel" units
  (`width*8 × height*8`) so a rect drawn from cell (0,0) into cell
  (1,1) writes pixels in both tiles through the existing
  `putPixel(spriteIdx, x, y, colourIdx)` path.
- `Select` returns a marquee; `Delete` zeroes it, drag moves it.
- Shift modifier constrains line/rect to 45°/square.

### Files touched

Sprites only — the Backgrounds page uses its own tile-paint model
(one tile at a time, no cross-tile shapes expected).

- [sprites.html](tools/tile_editor_web/sprites.html): new popover
  markup, tool-registry JS, pointer handlers on the composition
  canvas. New `.tools-popover` CSS.

### Verification

- Draw a 10×10 rect starting in the top-left cell of a 2×2 sprite
  and confirm pixels land in all four cells.
- Flood fill from a pixel near a cell boundary — fill crosses the
  boundary without stopping.
- Undo after every tool operation reverts cleanly.
- Guided-mode / Advanced-mode of the Code page is unaffected.

### Effort estimate

M. ~250–350 lines for the tool registry + four additional tool
implementations on top of the existing pencil path.

---

## Out of scope for Sprint 8

- **8.3 Inline animation strip.** Separate sprint — the animation
  panel restructure is independent of palette/tool UX.
- Mobile/touch drag-and-drop. Mouse-first for now. If pupils hit
  this, add pointer-events fallback in a follow-up.
- Colour-picker alternatives (HSV, recent-colours strip). The
  master grid is still the one source of truth for NES colours.

## Open questions

1. **Sprites page — should it edit BG palettes at all?** Current
   plan: read-only with a link back to Backgrounds. If pupils say
   "I want to fix a BG colour without switching pages," revisit.
2. **Drag-and-drop visual affordance.** Dashed border on the drop
   target is the plan; confirm it reads as "drop here" without
   teacher explanation.
3. **`P0–P3` button labels.** Consider `BG P0` / `SP P0` for
   unambiguity once kind is hidden on the Sprites page. Decide
   during implementation.
