# Pupil Feedback Log

A running log of pupil feedback on the Visual Tile Editor and the wider
workspace, with a concrete mitigation idea for each item. Append freely.

---

## How to use this doc

When a pupil gives you feedback:

1. Add a row to the **Summary table** below.
2. Add a block under the matching **theme section** with:
   - **Said:** a short, close-to-verbatim quote
   - **Mitigation:** one concrete change to make
   - **Status / date:** `[new]`, `[planned]`, `[in progress]`, `[done]`,
     `[won't fix]`, plus ISO date
3. Add a one-line entry at the bottom of the **Changelog**.

Use pupil initials (not full names) for anonymity.

---

## Summary table

| Date       | Theme              | Short comment                                                     | Status    |
| ---------- | ------------------ | ----------------------------------------------------------------- | --------- |
| 2026-04-13 | Help               | Need more help creating a sprite; example of the first one        | [new]     |
| 2026-04-13 | Tileset management | Hard to delete or clear a single tile                             | [new]     |
| 2026-04-13 | Tileset management | Would like a "start fresh" tileset                                | [new]     |
| 2026-04-13 | Tileset management | Want to save and revisit different tilesets                       | [new]     |
| 2026-04-13 | Tileset management | Project folders for different games                               | [new]     |
| 2026-04-13 | Tileset management | Mark tiles in use on the tileset; per-sprite outline colour       | [new]     |
| 2026-04-13 | Tileset management | See which tiles a selected sprite uses; flag shared tiles         | [new]     |
| 2026-04-13 | Project templates  | Choice of starter demo: platformer vs Pac-man/Pokémon top-down    | [new]     |
| 2026-04-13 | Sprite UX          | Easier way to tag sprites by role (player, npc, enemy, etc.)      | [new]     |
| 2026-04-13 | Sprite UX          | Active palette swatches at top of sprite editor, click to pick    | [new]     |
| 2026-04-13 | Sprite UX          | Per-tile palette selector (compact, not in the way)               | [new]     |
| 2026-04-13 | Background UX      | Changing palette often changes the tile too — needs to be clear   | [new]     |
| 2026-04-13 | Background UX      | Warn that tile 0 is the background; allow changing BG colour      | [new]     |
| 2026-04-13 | Background UX      | Easier per-section palette change                                 | [new]     |
| 2026-04-13 | Grid               | Thicker/darker grid lines, with coarser and finer grid options    | [new]     |
| 2026-04-13 | Sprite UX          | New sprite should auto-pick next empty tiles; easier replace flow | [new]     |
| 2026-04-13 | Modes              | Distinct modes (paint tile / set palette) on both pages           | [new]     |
| 2026-04-13 | Emulator           | Offline FCEUX sometimes runs a stale build; browser one is fresh  | [new]     |
| 2026-04-13 | Help               | Getting-started videos and animations                             | [new]     |

---

## Feedback by theme

### Help and getting started

#### Creating the first sprite is unclear

- **Said:** "More help needed on creating sprites. Some example of creating
  the first sprite."
- **Mitigation:** ship a built-in "Make your first sprite" walkthrough that
  opens the first time the editor loads — a short overlay that highlights
  the palette, the tile grid, then the sprite area, each step one click to
  advance. Ship a pre-made example sprite (e.g. `hero_basic`) pupils can
  open, inspect, and copy.
- **Status / date:** [new] 2026-04-13

#### Getting-started videos / animations

- **Said:** "Help needs to be improved. Getting started videos and
  animations would be useful."
- **Mitigation:** record 30–60 s GIFs for the three core flows (draw a
  tile, build a sprite, lay a background) and embed them in the editor's
  Help panel plus `PUPIL_GUIDE.md`. GIFs play without sound, loop, and
  don't need a player plugin.
- **Status / date:** [new] 2026-04-13

---

### Tileset management

#### Clearing a single tile is awkward

- **Said:** "Deleting or clearing individual tiles from the sprite tileset
  is not easy."
- **Mitigation:** add a **Clear tile** button to the tile editor toolbar
  (zeros all 64 pixels, keeps the tile slot). Bind to `Del`. Confirm only
  if the tile is referenced by a sprite.
- **Status / date:** [new] 2026-04-13

#### Start a fresh tileset

- **Said:** "Starting a fresh tile set would be helpful."
- **Mitigation:** **New tileset** action in the header with a confirm
  modal, so pupils don't trash work by accident. Offer to save the current
  project first.
- **Status / date:** [new] 2026-04-13

#### Save multiple tilesets and come back to them

- **Said:** "Being able to store different tilesets to come back to later."
- **Mitigation:** promote the existing localStorage snapshot/backup ring to
  named projects. Header dropdown with `New / Rename / Duplicate / Delete /
  Export .json / Import .json`.
- **Status / date:** [new] 2026-04-13

#### Project folders for different games

- **Said:** "Project folders for different games would be helpful."
- **Mitigation:** covered by the named-projects dropdown above — each
  project is an independent save slot. Add a recent-projects list on the
  launch screen.
- **Status / date:** [new] 2026-04-13

#### Show which tiles are in use

- **Said:** "Mark the tiles in use for the sprite tileset, maybe a
  different colour outline for each different sprite, but could be tricky
  if the same tile is used for different sprites as they often are. A way
  of easily seeing which tiles are already claimed by at least one other
  sprite on the sprite tileset."
- **Mitigation:** overlay a small coloured dot on each tileset cell
  indicating **use count** (0 = none, 1 = one sprite, 2+ = shared).
  Hovering a cell lists the sprites that use it. Selecting a sprite adds a
  coloured border to its tiles; shared tiles get a striped border so
  they're visible in any selection.
- **Status / date:** [new] 2026-04-13

#### See which tiles the selected sprite uses

- **Said:** "Able to see which tiles are used by a selected sprite on the
  tile set and if they are used by another sprite."
- **Mitigation:** same mechanism as above — selection highlights that
  sprite's tiles; a shared-tile badge (small number) on any tile also used
  by at least one other sprite.
- **Status / date:** [new] 2026-04-13

---

### Sprite workshop UX

#### Palette swatches visible on the sprite page

- **Said:** "There needs to be the selected palette to click on to select
  the colour of the pixel you are about to click on, in the top part of
  the sprite creation place as well."
- **Mitigation:** pin the active palette's four swatches (BG + 3) at the
  top of the tile editor canvas. Click a swatch to pick that paint colour.
  Mirror the existing palette panel — don't replace it.
- **Status / date:** [new] 2026-04-13

#### Per-tile palette selector

- **Said:** "There should be some way of signifying and selecting the
  palette for each tile in the sprite (drop-down menu or something similar
  that does not get in the way of the sprite creation)."
- **Mitigation:** a small coloured palette chip on the top-right of each
  tile in the sprite grid. Clicking opens a four-palette popover. Collapse
  to a dot when the sprite is small.
- **Status / date:** [new] 2026-04-13

#### Tag sprites by role

- **Said:** "Make it easier to tag the sprites with the type of sprite
  they are intended to be (player, npc, bad guy etc.)"
- **Mitigation:** add a `role` field to sprite metadata (`player | npc |
  enemy | item | other`) rendered as a colour-coded chip next to the
  sprite name. Filter the sprite list by role.
- **Status / date:** [new] 2026-04-13

#### Auto-pick next empty tiles for a new sprite

- **Said:** "When a new sprite is created it should automatically select
  the next empty sprite tiles for the sprite (by default) unless the user
  wants to select them themselves. It should be easier and more intuitive
  to replace and select tiles for the sprites as it is currently
  confusing."
- **Mitigation:** on **New sprite**, scan the tileset for the next run of
  empty cells matching the sprite's dimensions and pre-assign them. Offer
  **Change tiles…** as a secondary button. In the replace flow, clicking a
  sprite cell opens a tile picker overlay instead of requiring two
  independent selections.
- **Status / date:** [new] 2026-04-13

---

### Background editor UX

#### Palette edits accidentally change the tile

- **Said:** "Easier ways to change palettes in backgrounds — at the moment
  it often changes the tile as well as the palette. It needs to be clear
  to the user how to do either."
- **Mitigation:** split into two explicit modes on the background canvas —
  **Paint tile** (default) and **Paint palette** (attribute-table 2×2
  granularity). Toolbar toggle top-left. The cursor changes (brush vs
  swatch) so the current mode is always visible.
- **Status / date:** [new] 2026-04-13

#### Tile 0 is the background

- **Said:** "On the background page it needs to make it clear that the
  first tile is not to be changed as it will change the background. More
  info about that is needed and the ability to change the background
  colour."
- **Mitigation:** lock tile 0 in the sprite page, with a tooltip on hover
  ("This tile shows through as the background colour on every screen").
  On the background page add a **Background colour** swatch that edits the
  universal BG entry directly; pair it with a short inline explainer.
- **Status / date:** [new] 2026-04-13

#### Easier per-section palette change

- **Said:** "Also easier here to change the palette used for each section."
- **Mitigation:** with **Paint palette** mode on, a 2×2 attribute block
  highlights on hover; one click cycles through the four BG palettes, or
  right-click opens a picker.
- **Status / date:** [new] 2026-04-13

---

### Grid rendering

#### Thicker, darker, configurable grid

- **Said:** "The ability to make the grid lines thicker and darker (both
  bigger and finer grids)."
- **Mitigation:** a **Grid** control in the view menu: line-width slider
  (off / 1 px / 2 px), colour picker (light / dark / custom), and chunk
  lines every 8 or 16 px. Persist per-project in prefs.
- **Status / date:** [new] 2026-04-13

---

### Mode model

#### Distinct paint / palette / erase modes

- **Said:** "Maybe have different modes, one for placing tiles in the
  background, one for selecting palettes for the background, similar for
  the sprite page etc."
- **Mitigation:** formalise modes on both pages:
  - Sprite page: **Paint pixel** / **Pick colour** / **Erase**.
  - Background page: **Paint tile** / **Paint palette** / **Erase**.
  Each mode has a distinct cursor and a highlighted toolbar button.
- **Status / date:** [new] 2026-04-13

---

### Project templates

#### Choose a starter demo

- **Said:** "Choice of default 'demo' game of platform or 'Pacman/Pokémon'
  style layout and controls."
- **Mitigation:** **New project** dialog offers two templates:
  - **Platformer** (current Step 1 — gravity, jump).
  - **Top-down** (4-way movement, no gravity; Pac-man-style).
  Each template seeds the correct starter tileset, sprite, background and
  `main.c`.
- **Status / date:** [new] 2026-04-13

---

### Emulator parity

#### Offline FCEUX runs a stale build

- **Said:** "The offline emulator does not always run the most recent
  changes to the code; the browser-based one does appear to."
- **Mitigation:** investigate the Makefile dependency chain — likely a
  missing prerequisite means the ROM isn't rebuilt when only a `.c` or
  include file changes. Add a hash check + "force clean rebuild" task. As
  a safety net, show the ROM's build timestamp on the first frame of the
  game (HUD) so the pupil can tell if they're playing old code.
- **Status / date:** [new] 2026-04-13

---

## Additional ideas (teacher / Claude)

Things no pupil has raised yet, but worth having on the list:

- **Undo / redo** with a visible affordance and a shortcut legend in the
  header (`Ctrl+Z / Ctrl+Shift+Z`). Pupils rarely ask for undo — they
  silently work around its absence.
- **Copy / paste tile** and **Duplicate sprite**. Speeds up iteration.
- **Auto-save indicator** ("Saved 3 s ago") so pupils trust the save
  system. Plays well with the existing snapshot/backup ring.
- **Colour-blind-friendly** outline palette for the "tile in use" markers.
- **Animated preview** for multi-frame sprites (loops at 8 fps in a corner
  of the sprite editor).
- **Tile name search / filter** on the tileset page.
- **Shareable read-only link** so a pupil can show their work to a teacher
  or classmate without exporting.
- **Keyboard shortcut legend** — a `?` key toggles an overlay.
- **Import from image** — drop a PNG, auto-quantise to an NES palette,
  slice into 8×8 tiles. A stretch goal; deals well with pupils who want to
  reproduce a character from a reference image.
- **"Check my sprite" validator** — flags sprites using more than 4
  colours in one tile, or using a palette slot no palette defines.

---

## Changelog

- 2026-04-13 — initial version; seeded with first pupil-testing session
  feedback and teacher / Claude suggestions.
