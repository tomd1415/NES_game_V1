# Planned UI improvements — Sprites & Backgrounds pages

Goal: make the editor feel obvious on first contact without losing power-user
features. Pupils have only been using this for a short time, so it's fine to
break muscle memory if the new design is clearer.

---

## Part A — Layout & proximity (Sprites page)

**A1. Active-colour row above the composition canvas.**
Fold the `0/1/2/3` colour buttons and the pinned swatches into the existing
`sprite-side-controls` strip that already sits above the composition canvas.
The pixel editor keeps a secondary view so painting individual pixels still
has its swatches right there, but the *primary* picker lives where the
painting happens.

**A2. NES master palette next to the SP/BG palette editor.**
Move `master-grid` out of the right panel and into `palettes-sub` directly
beneath the sprite & background palette blocks. Mirrors how the Backgrounds
page already lays out "Universal BG → BG palettes → Sprite palettes → NES
master" in one column.

**A3. Right column becomes pure tileset.**
With the master grid gone, the right panel is just the shared tileset
(canvas + hints). Cleaner "source of tiles" vs. "paint + palette" split.

**A4. Collapsible sections (both pages).**
Every sub-section becomes a `<details>` with a consistent header style.
Affected sections:
- Sprites page: Sprite list, Animations, Cell inspector, Pixel editor,
  Palettes, Tileset, NES master.
- Backgrounds page: Universal BG, Background palettes, Sprite palettes,
  NES master.

Collapsed state persists in localStorage so a pupil who hides "Animations"
doesn't have to re-hide it next session.

**A5. Style parity.**
Reuse the Backgrounds `palettes-panel` h3 treatment inside the Sprites
`palettes-sub`. Harmonise header spacing and the collapsible headers across
both pages.

**Deferred — detach / floating.**
The page already has floating pop-outs for tileset and palette. Extending
detach to the pixel editor / sprite list is substantial JS work (drag infra,
two-way state sync) and is better handled in a dedicated follow-up so the
current change stays reviewable.

---

## Part B — Tile-selection flow (Sprites page)

The biggest source of pupil confusion. Two linked objects (a cell in the
sprite, a tile in the 256-slot tileset) and four different paths to bridge
them.

**B1. Auto-assign on first paint.** *(biggest single win)*
If the selected cell is empty and the pupil starts painting in the pixel
editor, silently find a free tile, assign it, and paint. No explicit "pick
a tile first" step. A subtle 2-second toast says `✨ Used tile 0x37 for
this cell` so the action isn't invisible. `Ctrl-Z` undoes both the assign
and the first stroke.

**B2. Kill the highlight → Assign two-step.**
Single-click a tile in the tileset = assign to selected cell immediately.
No "highlight, then click the Assign button" dance. Keyboard `[`/`]` +
Enter still works. The `📥 Assign 0x## to this cell` button is removed
from the cell inspector (the tile picker dialog keeps a Use-tile button
because double-click-to-commit is an intentional dialog pattern).

**B3. Cell inspector becomes the decision centre.**
The cell inspector shows one of three state messages in plain English,
each with the obvious next action:

- **Empty cell.** Buttons: `📄 New blank tile`, `📋 Pick existing tile`.
- **Using tile 0x05 — only in this sprite.** Safe to paint.
  Buttons: `🔄 Change tile`, `Clear`.
- **Using tile 0x05 — also in _enemy_walk_, _enemy_walk2_.** Painting
  will change them too. Buttons: `✂️ Make my own copy`, `🔄 Change tile`.

The raw tile-index number input stays under a small "advanced" disclosure
for pupils who want it.

**B4. Colour-code the tileset.**
Four visual states on each tile thumbnail:
- Blank + free → faint dotted outline ("fresh paper").
- In use by *this* sprite → green corner mark.
- In use by *other* sprites → amber corner mark (touch at your own risk).
- Has pixels, used nowhere → no marker.

Same treatment on the tile-picker dialog and the floating tileset pop-out.

**B5. Empty cells look visibly empty in the composition canvas.**
Today an empty cell renders whatever pixels happen to live in tile 0 —
often the blank background — so pupils can't distinguish "nothing here
yet" from "assigned but blank". Draw a dotted `+ draw here` placeholder
client-side for empty cells.

**B6. Surface fork (`D`) as a visible action.**
When a pupil paints on a tile shared with other sprites, show a one-time
inline nudge with a button: `✂️ Copy it into a free slot so only this
sprite changes`. The `D` shortcut still works for power users.

**B7. Terminology cleanup.**
Pick one noun and one verb throughout user-visible UI strings:
- **Cell** = the 8×8 slot inside the sprite composition.
- **Tile** = the bitmap in the shared 256-slot tileset.
- **Put** = the action of placing a tile into a cell.

Retire *highlighted* / *assigned* / *selected tile* from user-visible
copy. Internal code keeps its existing identifiers.

---

## Implementation order

1. **Collapsible helper** — generic `<details>` styling + localStorage
   persistence. Apply to sprite-page sub-sections first, then backgrounds.
2. **Layout moves (A1, A2, A3)** — move active-colour row, relocate the
   NES master grid, thin out the right panel.
3. **Empty-cell rendering (B5)** — placeholder for empty cells in the
   composition canvas.
4. **Cell-inspector rewrite (B3 + B2)** — three-state inspector, remove
   the highlight/assign two-step, rename buttons.
5. **Auto-assign on paint (B1)** — hook first-paint on an empty cell,
   toast notification, undo integration.
6. **Tileset colour-coding (B4)** — four-state overlay, applied to main
   tileset + picker dialog + pop-out.
7. **Fork nudge (B6)** — inline prompt on first shared-tile paint.
8. **Terminology cleanup (B7)** — pass over user-visible strings.
9. **Style parity (A5)** — cross-page polish.

After each numbered step the page should still boot and be usable; no
half-implemented states left between steps.

---

## Acceptance checks (per step)

- Both pages still load from `Open Editor via Playground Server` with no
  console errors.
- `▶ Play in NES` round-trip still builds a ROM (C path + asm path).
- `localStorage` for existing projects still loads (no schema break).
- Tile-editor shortcuts (`0-3`, `[`, `]`, `D`, `Del`, `Shift+click`) still
  work where documented.
