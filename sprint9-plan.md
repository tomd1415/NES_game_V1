# Sprint 9 — Selection-tool actions

Builds on Sprint 8's `Select` marquee. Adds the actions that pupils
actually want once they can select an area: **copy / paste**, **rotate
90°**, **flip H / flip V**, and **grab-to-move**. Fill-selection is
deliberately out of scope.

References:
- [changelog-implemented.md §Sprint 8 Select](changelog-implemented.md)
- [sprites.html](tools/tile_editor_web/sprites.html) — all changes land
  here; Backgrounds page is unaffected.

---

## State model

Add two module-level variables in [sprites.html](tools/tile_editor_web/sprites.html):

```js
// Filled by copySelection() or by the "lift" step of a drag-move.
// Pixels indexed [y][x]; colour values are 0..3 just like sprite_tiles.
let selectionClipboard = null;  // { w, h, pixels: [[c, …], …] }

// Non-null while the pupil is drag-moving a lifted region. The source
// pixels have already been zeroed; overlay renders at (offsetX, offsetY)
// until mouseup commits the drop. Commit writes back via setSpritePixel
// and updates selectedRegion to the new anchor.
let floatingSelection = null;
// { w, h, pixels, offsetX, offsetY,
//   grabDX, grabDY   // pointer offset from top-left when grabbed
// }
```

No persistence: clipboard lives for the session only, same as the
existing tile-level clipboard. Cross-sprite paste is free because the
buffer holds raw pixel colours, not references.

## Operations

Every op below **starts with a single `pushUndo()`**, so one `Ctrl-Z`
reverts the whole thing.

1. **Copy** (`copySelection`)
   Reads the region via existing `readSpritePixel()` into
   `selectionClipboard`. Toast: `📋 Copied WxH pixels`. No state change
   otherwise — non-destructive, no undo entry needed.

2. **Paste** (`pasteSelection(anchorX, anchorY)`)
   Writes clipboard pixels starting at the anchor (the marquee's
   top-left if one exists, else the selected cell's top-left). Uses
   existing `setSpritePixel()` so empty cells auto-assign free tiles
   and flipH/flipV are respected. New `selectedRegion` matches the
   pasted rect. Clipped to sprite bounds — pixels that would fall off
   the right/bottom edge are discarded silently. Standard `Ctrl-V`
   plus a `📥 Paste` toolbar button.

3. **Flip H / Flip V** (`flipSelection(axis)`)
   In-place mirror. Reads region into a buffer, writes back reversed
   on the chosen axis. Dimensions unchanged, marquee unchanged.

4. **Rotate 90° CW / CCW** (`rotateSelection(dir)`)
   Swaps dimensions. Workflow:
   - Copy region to buffer B.
   - Transform: `cw: out[y][x] = B[w - 1 - x][y]`,
     `ccw: out[y][x] = B[x][h - 1 - y]`. Output is `h × w`.
   - Zero the original region.
   - Write B' anchored at `(x0, y0)` with new dimensions; clip at
     sprite bounds. If any pixel would fall outside, show a warning
     toast (`↻ Rotation clipped at sprite edge`) but still apply.
   - Update `selectedRegion` to the new bounding box.

5. **Grab-to-move** (drag inside marquee)
   Click-detection change in the Select-tool `toolPointerDown`:
   - If `selectedRegion` exists **and** the pointer is inside it,
     begin a drag-move instead of starting a new marquee.
     - Copy region pixels to `floatingSelection.pixels`.
     - Zero the source region (no `setSpritePixel` — write zeros
       directly via a helper `zeroSpritePixel(sp, x, y)` so we don't
       accidentally auto-assign tiles here).
     - Seed `floatingSelection.offsetX/Y = x0, y0` and record
       `grabDX = pointerX - x0, grabDY = pointerY - y0`.
   - `toolPointerMove`: update `offsetX = pointerX - grabDX`,
     clamp so the rect stays inside the sprite, re-render.
   - `toolPointerUp`: write floating pixels at the new offset via
     `setSpritePixel`; set `selectedRegion` to the new bounding box;
     clear `floatingSelection`.
   - Escape key or clicking outside the marquee while floating: drop
     back at the original origin (cancel the move).

## UI — selection actions toolbar

A small strip just below the sprite canvas, visible only when
`selectedRegion` is non-null (or `floatingSelection`). Six buttons
plus a size readout:

```
Selection 5×4 · 📋 Copy  📥 Paste  ↺ Rot-L  ↻ Rot-R  ⇔ Flip H  ⇕ Flip V  ✕ Clear
```

- `Clear` zeroes the selection (same as `Delete` key — keeps the
  discovery path visible).
- All buttons disabled when the current tool ≠ `select` or the sprite
  has changed since the selection was made.

CSS: one new `.selection-actions` flex row, buttons share the existing
toolbar styling.

## Keyboard (only while Select tool is active)

- `Ctrl-C` / `Cmd-C` → Copy (preventDefault to swallow browser copy)
- `Ctrl-V` / `Cmd-V` → Paste
- `R` → Rotate CW (Shift+R → CCW)
- `H` → Flip horizontal
- Flip vertical via button only (no free letter — `V` is paste).
- `Escape` → cancel floating move, or clear selection if not floating.
- `Delete` / `Backspace` → zero inside marquee (already shipped).

All of these are scoped behind `currentTool === 'select'` so they
don't interfere with the existing tile-level `C` / `V` / `D` bindings.

## Preview rendering

`drawToolPreview(ctx, sp, px)` grows two extras:

- If `floatingSelection` is non-null, draw its pixels as a ghost
  overlay at `(offsetX, offsetY)` using full opacity for the pixel
  colours plus a dashed outline so the pupil can see both "this is
  where the pixels are now" and "this is where they'll land".
- Existing marquee outline logic unchanged.

## Files touched

- [tools/tile_editor_web/sprites.html](tools/tile_editor_web/sprites.html)
  - HTML: one new `<div id="selection-actions">` strip after
    `.sprite-canvas-wrap`.
  - CSS: `.selection-actions` + button styles (reuse toolbar look).
  - JS: new module-level `selectionClipboard` / `floatingSelection`,
    `copySelection`, `pasteSelection`, `flipSelection`,
    `rotateSelection`, `zeroSpritePixel`, `clampRegionToSprite`,
    plus the Select-tool pointer-handler branches for grab-to-move,
    plus keybindings and the actions-strip render/wire-up.

Nothing in the build pipeline, `state` schema, or prefs needs to
change — everything lives in session-only runtime state.

## Verification

- `node --check` on the extracted script block.
- Manual checklist (mouse-first, Sprites page):
  1. Select a 3×3 region → `Ctrl-C` → `Ctrl-V` pastes at the same
     spot (no visible change, but marquee re-appears).
  2. Select 3×5 → paste → new marquee is 3×5. Paste across a cell
     boundary — pixels land in both tiles.
  3. Flip H on an asymmetric region — visible mirror, marquee
     unchanged.
  4. Rotate CW on a 3×5 region — becomes a 5×3 at the same top-left.
     Rotate again three times — returns to original orientation.
  5. Rotate a region that would extend past the sprite edge —
     pixels clip, warn toast shows, undo restores.
  6. Grab inside a marquee and drag — source goes blank, ghost
     follows cursor; release → pixels land at new spot; `Ctrl-Z`
     reverts both the lift and the drop in one step.
  7. Grab, drag, then press `Escape` — pixels return to original.
  8. Cross-sprite paste: copy in sprite A, switch to sprite B,
     paste.
  9. Pencil tool still works unaffected; other tools unaffected.
- `▶ Play in NES` still builds — no state-schema changes.

## Effort estimate

M. ~300–400 lines (clipboard + three transforms + move state
machine + actions strip + keybindings). The move state machine is
the only tricky piece — everything else is read-buffer, transform,
write-buffer.

## Open questions

1. **Paste anchor when no marquee exists.** Default plan: top-left
   of the selected cell. Alternative: last marquee's origin (even
   after it was cleared). Pupils will likely expect "paste where I'm
   looking," so selected-cell wins.
2. **Rotate direction default.** `R` = CW, `Shift+R` = CCW. If
   pupils complain about the modifier, reconsider — maybe two
   separate keys or a toolbar-only approach.
3. **Floating-move clamp vs. clip.** Plan is to clamp (can't drag
   off-sprite). Clipping (pixels that fall off get lost) is lossy
   and easy to do by accident — clamp is safer.
