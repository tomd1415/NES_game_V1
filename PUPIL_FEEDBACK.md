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
| 2026-04-13 | Tileset management | Mark tiles in use on the tileset; per-sprite outline colour       | [done]    |
| 2026-04-13 | Tileset management | See which tiles a selected sprite uses; flag shared tiles         | [done]    |
| 2026-04-13 | Project templates  | Choice of starter demo: platformer vs Pac-man/Pokémon top-down    | [done]    |
| 2026-04-13 | Sprite UX          | Easier way to tag sprites by role (player, npc, enemy, etc.)      | [done]    |
| 2026-04-13 | Sprite UX          | Active palette swatches at top of sprite editor, click to pick    | [done]    |
| 2026-04-13 | Sprite UX          | Per-tile palette selector (compact, not in the way)               | [done]    |
| 2026-04-13 | Background UX      | Changing palette often changes the tile too — needs to be clear   | [new]     |
| 2026-04-13 | Background UX      | Warn that tile 0 is the background; allow changing BG colour      | [new]     |
| 2026-04-13 | Background UX      | Easier per-section palette change                                 | [new]     |
| 2026-04-13 | Grid               | Thicker/darker grid lines, with coarser and finer grid options    | [new]     |
| 2026-04-13 | Sprite UX          | New sprite should auto-pick next empty tiles; easier replace flow | [done]    |
| 2026-04-13 | Modes              | Distinct modes (paint tile / set palette) on both pages           | [new]     |
| 2026-04-13 | Emulator           | Offline FCEUX sometimes runs a stale build; browser one is fresh  | [done]    |
| 2026-04-13 | Help               | Getting-started videos and animations                             | [new]     |
| 2026-04-20 | Gameplay snippets  | Enemy sprite that moves around as a bad guy                       | [done]    |
| 2026-04-20 | Gameplay snippets  | NPC dialogue snippet                                              | [done]    |
| 2026-04-20 | Gameplay snippets  | Follower sprite that tracks the player                            | [done]    |
| 2026-04-20 | Sprite UX          | More sprite role labels (tools, power-ups) for future snippets    | [done]    |
| 2026-04-20 | Sprite UX          | Make the Animation panel easier to find and use                   | [done]    |
| 2026-04-20 | Drawing tools      | Fill, shape select (rect/circle), resize regions, shape delete    | [done]    |
| 2026-04-20 | Palette UX         | Pick colours for palettes more easily                             | [done]    |
| 2026-04-20 | Scenes             | Trigger next-scene load (uses existing multi-background support)  | [done]    |
| 2026-04-20 | Audio              | Import FamiStudio music/SFX files                                 | [new]     |
| 2026-04-20 | Sharing            | Gallery to upload screenshots / ROMs for others to play           | [done]    |
| 2026-04-20 | Accessibility      | Make text size configurable / bigger                              | [done]    |
| 2026-04-23 | Code page          | Simpler, no-C "module builder" alternative to the Code page       | [done]    |
| 2026-04-24 | Builder            | Two-player co-op (P2 controller, HP, walk animation)              | [done]    |
| 2026-04-24 | Builder            | NPC dialogue boxes from inside the Builder (module, no C)         | [done]    |
| 2026-04-24 | Builder            | Multi-background doors / room transitions                         | [done]    |
| 2026-04-25 | Play pipeline      | Arrow keys move the player AND scroll the tileset on Backgrounds  | [done]    |
| 2026-04-25 | Play pipeline      | Code-page ▶ Play stops working after first edit; Backgrounds OK   | [new]     |
| 2026-04-25 | Scrolling          | C2 scroll flicker — column-burst stride elided by cc65 optimiser  | [done]    |
| 2026-04-25 | Scrolling          | 2×2 background draws wrong section in top-down (4-screen unsupp.) | [planned] |
| 2026-04-25 | Scrolling          | 1×2 vertical scroll has the same V-mirror corruption as 2×2       | [planned] |

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
- **Status / date:** [done] 2026-04-13 — see `changelog-implemented.md`
  (teal outline for "in this sprite", orange dashed for "shared"; hover
  tooltip lists sprites using the tile).

#### See which tiles the selected sprite uses

- **Said:** "Able to see which tiles are used by a selected sprite on the
  tile set and if they are used by another sprite."
- **Mitigation:** same mechanism as above — selection highlights that
  sprite's tiles; a shared-tile badge (small number) on any tile also used
  by at least one other sprite.
- **Status / date:** [done] 2026-04-13 — see `changelog-implemented.md`
  (B4 colour-coded tileset + right-click-on-tileset "jump to sprite").

---

### Sprite workshop UX

#### Palette swatches visible on the sprite page

- **Said:** "There needs to be the selected palette to click on to select
  the colour of the pixel you are about to click on, in the top part of
  the sprite creation place as well."
- **Mitigation:** pin the active palette's four swatches (BG + 3) at the
  top of the tile editor canvas. Click a swatch to pick that paint colour.
  Mirror the existing palette panel — don't replace it.
- **Status / date:** [done] 2026-04-13 — see `changelog-implemented.md`
  (A1 pinned swatches in `#sprite-side-swatches`).

#### Per-tile palette selector

- **Said:** "There should be some way of signifying and selecting the
  palette for each tile in the sprite (drop-down menu or something similar
  that does not get in the way of the sprite creation)."
- **Mitigation:** a small coloured palette chip on the top-right of each
  tile in the sprite grid. Clicking opens a four-palette popover. Collapse
  to a dot when the sprite is small.
- **Status / date:** [done] 2026-04-13 — per-cell `palette` field landed
  in `state.sprites[].cells[r][c]`; minimap exposes SP0–SP3 buttons per
  cell; cell inspector has a palette dropdown.

#### Tag sprites by role

- **Said:** "Make it easier to tag the sprites with the type of sprite
  they are intended to be (player, npc, bad guy etc.)"
- **Mitigation:** add a `role` field to sprite metadata (`player | npc |
  enemy | item | other`) rendered as a colour-coded chip next to the
  sprite name. Filter the sprite list by role.
- **Status / date:** [done] 2026-04-13 — `ROLE_LABELS` / `ROLE_COLOURS`
  drive a chip on each sprite list entry. Filter dropdown above the
  list. See the 2026-04-20 "More sprite role labels" item below for the
  pupil's follow-up asking for extra roles (tool / power-up).

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
- **Status / date:** [done] 2026-04-13 — `findFreeTileRun()` +
  `assignFreshTiles()` auto-claim a contiguous run of empty tiles for
  every new sprite, including the starter hero on a fresh project.
  Empty cells also auto-claim a tile on the very first paint stroke
  (`autoAssignFreeTileToCell` in `spApply`/`teApply`) so the pupil
  never needs to pick a tile before drawing.

#### More sprite role labels (tools, power-ups)

- **Said:** "Make sprites into 'tools' and 'power ups'. Increase the
  possible labeling for sprites so that they can be used with future
  code snippets." *(MH, 2026-04-20)*
- **Mitigation:** extend `ROLE_LABELS` / `ROLE_COLOURS` in
  [tools/tile_editor_web/sprites.html](tools/tile_editor_web/sprites.html)
  with `tool`, `powerup`, `pickup`, `projectile`, `decoration`. Emit the
  role in the generated `.sprites.json` so snippets can key off it
  (e.g. a `pickup-gives-double-jump` snippet looks up sprites whose
  role is `powerup`). Keep the existing filter dropdown; it already
  scales.
- **Status / date:** [new] 2026-04-20

#### Animation panel easier to find and use

- **Said:** "Make the animation section easier to find and use." *(MH,
  2026-04-20)*
- **Mitigation:** promote **Animations** out of a collapsed `<details>`
  on the Sprites page: show the current frame strip inline above the
  composition canvas with a **+ Add frame** button right there. Keep the
  collapsible master list for power users, but land pupils on the
  strip. Add a one-line "What's an animation?" tooltip that links to
  the matching lesson.
- **Status / date:** [done] 2026-04-24 — shipped as Phase 2.3 of
  [next-steps-plan.md](next-steps-plan.md).  Strip sits above the
  composition canvas with frame thumbnails + **+ Add frame** + a
  `full editor →` link that opens the collapsed Animations panel
  below.  Full editor stays put for power users.  See the
  "Phase 2.3" entry in
  [changelog-implemented.md](changelog-implemented.md).

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
- **Status / date:** [done] 2026-04-25 — shipped as Phase 3.1 of
  [next-steps-plan.md](next-steps-plan.md).  The Builder's `game`
  module's "Top-down (four-way, no gravity)" radio is now live;
  picking it emits `#define BW_GAME_STYLE 1` which the template's
  `#if BW_GAME_STYLE == 1` blocks pick up to swap player physics.
  No second template file — both styles share `platformer.c` (and
  Step_Playground's `main.c`) via symmetric preprocessor gates,
  keeping the byte-identical-baseline test passing.  Damage,
  dialogue, doors, pickups, HUD, win conditions, scene-instance AI
  all work unchanged in either style.  See the "Phase 3.1" entry
  in [changelog-implemented.md](changelog-implemented.md).

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
- **Status / date:** [done] 2026-04-24 — a second wave of this
  complaint after Local (fceux) mode was re-enabled on every page
  led to the real root cause: `/play`'s `customMainC` path builds
  in a throwaway tempdir and returns the bytes, but the native
  branch used to launch fceux against the stale `steps/Step_Playground/game.nes`
  instead.  Fixed by writing the just-built ROM to a dedicated
  `steps/Step_Playground/_play_latest.nes` and pointing fceux at
  that.  See the "native fceux now runs the SAME ROM as the browser"
  entry in [changelog-implemented.md](changelog-implemented.md).
  Sprint-6 also added `built_iso` / `build_time_ms` stamps on
  every `/play` response so pupils can tell which build they're
  looking at regardless of emulator.

---

### Gameplay snippets

The Code page already ships a snippet library (see
[snippets/](snippets/)); pupils want it wider so they can build more
of a game without writing new C themselves.

#### Enemy sprite that moves around

- **Said:** "Have the option to include a sprite as a bad guy and it
  will move around." *(MH, 2026-04-20)*
- **Mitigation:** ship an `enemy-walker` snippet that spawns an OAM
  sprite keyed on `role === 'enemy'`, walks it left/right, flips at
  screen edges, and collides with the player. Uses the existing
  `ss_x[] / ss_y[]` static-sprite table so the snippet stays
  contained. Pair with a companion `enemy-chaser` that steers towards
  `(px, py)` each frame.
- **Status / date:** [new] 2026-04-20

#### NPC dialogue snippet

- **Said:** "Snippets to add dialogue to NPC Sprites." *(MH,
  2026-04-20)*
- **Mitigation:** ship a `talk-to-npc` snippet that, when the player
  overlaps a sprite with `role === 'npc'` and presses **A**, pauses the
  main loop and renders a 2-line text box at the bottom of the screen.
  Requires a small text-draw helper (`draw_text(x, y, "...")`) added to
  [src/](src/). The snippet takes the dialogue string as a commented
  knob the pupil can edit.
- **Status / date:** [new] 2026-04-20

#### Follower sprite that tracks the player

- **Said:** "Adding the ability to include a sprite that follows the
  player around." *(MH, 2026-04-20)*
- **Mitigation:** ship a `follower` snippet that records the last N
  positions of the player and draws a chosen sprite at position
  `N` frames ago (classic Mario-coin-trail trick). Pupil chooses which
  sprite follows via its `role` or name. No physics — just trail
  rendering — so the snippet stays small.
- **Status / date:** [new] 2026-04-20

---

### Drawing tools

#### Fill, shape select, resize, shape delete

- **Said:** "Add tools for changing the size of parts of the sprite as
  well as fill and select to delete, squares, circles etc." *(MH,
  2026-04-20)*
- **Mitigation:** add a toolbar above the 8×8 tile editor on the
  Sprites page with: **Pencil** (current), **Fill** (flood-fill 4-way
  by colour), **Line**, **Rect**, **Circle**, **Select** (rectangular
  marquee with delete / move). The tools all write to
  `state.sprite_tiles[idx].pixels` so they piggyback on the existing
  paint + undo path. "Change the size of parts" maps to the **Select →
  resize** flow: marquee a region, drag a handle to scale — one stroke,
  no menus. Shift-constrains to the same palette.
- **Status / date:** [done] 2026-04-25 — most of this shipped in
  Sprint 9 (Pencil, Fill, Line, Rect outline, Circle outline,
  Select with marquee + Delete + drag-to-move + clipboard copy/
  paste).  Phase 2.1 of
  [next-steps-plan.md](next-steps-plan.md) closed the rest:
  **Rect fill** + **Circle fill** as dedicated tools (■ / ● icons
  in the Tools popover) + Alt+P/F/L/R/C/S keyboard shortcuts
  (Alt+Shift+R / Alt+Shift+C for the filled variants).  See the
  "Phase 2.1" entry in
  [changelog-implemented.md](changelog-implemented.md).  **Still
  deferred:** Select → resize drag handles — filed as a separate
  follow-up for when a pupil specifically asks; the rest of the
  workflow (marquee, delete, move, copy/paste) is in place.

---

### Palette UX

#### Pick colours for palettes more easily

- **Said:** "Select colours for palets easier." *(MH, 2026-04-20)*
- **Mitigation:** the NES master-grid picker works but takes two
  clicks (select slot, then click a colour). Shortcut: click a palette
  slot, then the grid follows your mouse — first click on any colour
  assigns and closes. Also, drag a colour from the master grid onto a
  palette slot (native HTML5 drag). Add a **Recent colours** strip of
  the last 8 picks above the master grid so common edits are one
  click.
- **Status / date:** [done] 2026-04-24 — shipped as Phase 2.2 of
  [next-steps-plan.md](next-steps-plan.md).  Hover-to-preview:
  hovering a master-grid cell (or a recent-colour swatch) while a
  palette slot is selected temporarily recolours that slot so
  pupils see the effect before committing.  Drag-and-drop from the
  master grid onto any palette slot was already wired in 2026-04-13
  work.  Recent-colours strip at the top of the palette picker holds
  the last 8 picks (persisted in `prefs.recentColours`, shared
  across projects).  Both Backgrounds and Sprites pages.  See the
  "Phase 2.2" entry in
  [changelog-implemented.md](changelog-implemented.md).

---

### Scenes

#### Trigger next-scene load

- **Said:** "Allow the next scene to load on a trigger of some sort
  (there is already the ability to add more backgrounds)." *(MH,
  2026-04-20)*
- **Mitigation:** the editor already stores multiple named
  backgrounds in `state.backgrounds[]`. Add a **Scene transitions**
  lightweight editor: for the active background, mark one or more
  edge bands (top/bottom/left/right) as "→ scene name". The `/play`
  pipeline exports a per-background `scene_exits[]` structure and the
  `main.c` template grows a small state machine that loads the next
  scene's nametable + sprite list when the player crosses an exit.
  First pass supports only horizontal exits (right/left), since that
  matches the pupil's Zelda-2-ish target.
- **Status / date:** [new] 2026-04-20

---

### Audio

#### Import FamiStudio music and SFX

- **Said:** "Add sound (big project) add sound by importing files
  form famistudio." *(MH, 2026-04-20)*
- **Mitigation:** flagged by the pupil as a big piece of work. Scope:
  add an **Audio** page to the editor that accepts FamiStudio `.ftm`
  exports as `.s` (ca65 assembly) via the stock FamiStudio sound
  engine (LGPL, already built for cc65/ca65 projects). The editor
  stores the uploaded `.s` next to `src/`; the Makefile assembles
  and links it. The Code page grows a `play_music(n)` helper and two
  snippets (`music-on-start`, `jump-sfx`). Deferred decision: whether
  to ship the FamiStudio engine vendored in-tree or to pull it from
  an npm-ish cache on build. See also `tools/audio/` placeholder.
- **Status / date:** [new] 2026-04-20 — big project, queue behind
  scene transitions + drawing tools.

---

### Sharing & showcase

#### Gallery for screenshots and ROMs

- **Said:** "Have a gallery section where you can upload your
  screenshots and games for others to play." *(MH, 2026-04-20)*
- **Mitigation:** Shipped 2026-04-25 as Phase 4.2.  Builder page
  gained a **📤 Publish to gallery** button that re-uses the existing
  `PlayPipeline.play()` build path, runs the freshly built ROM in a
  hidden jsnes instance for ~30 frames to capture a preview PNG,
  and POSTs `{ title, description, pupil_handle, project, rom_b64,
  preview_b64 }` to a new `/gallery/publish` endpoint.  Server writes
  `tools/gallery/<slug>/` with rom.nes, preview.png, project.json,
  and metadata.json.  New
  [gallery.html](tools/tile_editor_web/gallery.html) page renders a
  card grid with per-card ▶ Play (loads into the shared emulator
  dialog), ⬇ ROM, ⬇ Project (the JSON, so other pupils can remix
  in their own editor), and 🗑 Remove.  Gallery nav link added to
  every editor page so pupils can find it without typing the URL.
  No accounts yet — gallery is per-machine and the Remove button is
  ungated; the metadata schema reserves an `owner` slot (currently
  `null`) so the future-accounts work (queued as Phase 4.6) is
  purely additive: signing in will auto-fill the handle, populate
  `owner`, and gate Remove on the teacher of the owning handle's
  group.  Privacy: pupil_handle is pseudonymous and free-text today
  (`pixel-cactus-42` is fine), no real names or personal info ever
  collected.  New
  [gallery.mjs](tools/builder-tests/gallery.mjs) regression suite
  covers publish → list → fetch each artefact → path-traversal
  rejection → remove round-trip; full Builder regression green.
- **Status / date:** [done] 2026-04-25

---

### Accessibility

#### Bigger / configurable text size

- **Said:** "Ability to set the text size bigger." *(MH, 2026-04-20)*
- **Mitigation:** Shipped 2026-04-25 as Phase 4.1 — new shared
  [a11y.js](tools/tile_editor_web/a11y.js) module auto-injects
  two controls into every editor page's header on load: a Text-size
  dropdown (100 / 125 / 150 / 175%) that scales `body.style.fontSize`
  and exposes `--ui-scale` as a CSS custom property, and a Theme
  dropdown (Standard / High contrast) that swaps the page's `:root`
  CSS variables for WCAG-AA pairings.  Persisted via the existing
  `Storage.readPrefs / writePrefs` API as `prefs.uiScale` and
  `prefs.uiTheme`, so the choice follows the pupil across all five
  editor pages.  Canvas scaling deliberately not engineered —
  every canvas already has `image-rendering: pixelated` and browser
  zoom (Ctrl-+/-) handles low-vision pupils' canvas needs natively.
  Tour on the Backgrounds and Sprites pages now ends with a step
  pointing at the new controls.  Regression suite gained
  [a11y.mjs](tools/builder-tests/a11y.mjs) covering pref round-trip,
  DOM injection, and change-event persistence.
- **Status / date:** [done] 2026-04-25

---

### Code page — no-C module builder

#### Replace the Code page with ticks-and-dropdowns for the common cases

- **Said (multiple pupils, paraphrased):** *"The code page is great
  for exploring, but I just want to pick a platformer, say how many
  players, say walk + jump use these animations, drop some enemies
  in, and hit play. I don't want to read C to do that."* They
  suggested a version where you tick modules — platform game,
  number of players, enemies, doors, events — fill in attributes
  (starting position, HP, animations, damages-on-touch), and the
  system assembles compilable code from the selections. Conflicts
  should be flagged with fix-up instructions before Play is
  enabled.
- **Mitigation:** add a fifth editor page, tentatively **🧱
  Builder**, that edits a declarative *module tree* on the state
  blob. A pure-JS assembler stitches the selections into a
  compilable `main.c` by injecting values into the existing `//>>
  region //<<` markers and by expanding snippet templates into
  named insertion slots in a base platformer / top-down template.
  A validator runs on every change and disables Play while
  problems remain. The feature reuses most of the existing
  scaffolding — sprite roles, animation assignments,
  behaviour-map tile types, the snippet library with its `regions`
  / `tags` metadata, and the `/play` endpoint — so it's less a
  new engine and more a declarative wrapper. Full design doc with
  data model, module catalogue, assembly algorithm, validator
  spec, UI layout, phasing (MVP → richer content → events →
  polish) and open questions is in
  [builder-plan.md](builder-plan.md).
- **Status / date:** [planned] 2026-04-23 — plan documented; MVP
  is effort M (2–4 focused sessions). Awaiting teacher green-light
  on phase A.

---

### Play pipeline

- **Said:** "I am sure this bug is already known about but when I run
  the game from 'Backgrounds' the movement keys also navigate through
  the tileset. I think this is what's causing my game to not run
  smoothly." (15:30, 25 April 2026.)
- **Mitigation:** Each editor page's window-level `keydown` handler
  and the shared `emulator.js` listener were both attached to `window`,
  so arrow keys drove the NES pad *and* nudged the tile picker (or
  fired Ctrl-S, undo, etc.) at the same time — risking accidental edits
  to the project mid-play. Fixed by gating the page-level handlers on
  Backgrounds, Sprites, Behaviour and Code with an early
  `if (document.getElementById('emu-dialog')?.open) return;` so the
  keyboard belongs to the game while the shared emulator dialog is
  modal-open.
- **Status / date:** [done] 2026-04-25.

- **Said:** "There is strange behaviour on the 2 by 2 scrolling in
  the top down mode. It appears to sometime draw the wrong section
  of the background and then sometimes the correct part of the
  background." (Pupil report, 2026-04-25.)
- **Mitigation:** Hardware-level NES PPU constraint, not a code bug.
  The cartridge config in
  [cfg/nes.cfg](steps/Step_Playground/cfg/nes.cfg) sets
  `NES_MIRRORING = 1` (vertical), which gives only two distinct
  nametable RAM banks: NT0/NT2 share one, NT1/NT3 share the other.
  Horizontal scroll (2×1) works because it alternates between NT0
  and NT1.  *Any* vertical scroll — 1×2 *and* 2×2 — needs NT0 ≠ NT2,
  which V-mirror doesn't provide, so the off-screen row writes land
  in the same physical RAM as the visible screen and the bottom of
  the world overwrites the top.  Pupils see "sometimes wrong,
  sometimes correct" depending on which screen was written most
  recently.  Stop-gap (2026-04-25): the Backgrounds-page size
  selector now warns + reverts when *either* 1×2 or 2×2 is picked
  ([index.html:4148-4181](tools/tile_editor_web/index.html#L4148-L4181)),
  with both dropdown labels updated to `(… — not yet working)` so
  pupils see the hint before clicking.  Proper fix is tracked as
  Phase 4.4 of [next-steps-plan.md](next-steps-plan.md): emit a
  4-screen-VRAM cartridge config (iNES header byte 6 bit 3) for
  projects that need > 2 distinct nametables, drop the alert, and
  add a regression-suite check that the header bit lands.  Single
  fix closes both 1×2 and 2×2.
- **Status / date:** [planned] 2026-04-25 — alert+revert shipped
  for both vertical sizes, 4-screen build path queued under
  Phase 4.4.

- **Said:** *Investigation under the parked C2 scroll-flicker entry*
  — FCEUX PPU-Viewer of a 2×1 scrolling project showed corruption
  starting only when the camera began to move, with tile data smearing
  across multiple rows of NT0/NT1 (visible as horizontal stripes in
  empty-sky rows) and the floor row disappearing while scrolling left.
  Initial misread of the column-update routine; actual cause was
  compiler-level.
- **Mitigation:** Closed across four chained fixes (2026-04-25):
    1. **Volatile PPU macros.** cc65 was eliding the
       `PPU_CTRL = +32 stride` write before the column burst because
       the macros were plain `*((unsigned char*)0x2000)`. The 30-tile
       burst then ran at `+1` stride, smearing each column across one
       nametable row. Fixed by qualifying the PPU/OAM macros
       `volatile` in [scroll.c](steps/Step_Playground/src/scroll.c),
       [main.c](steps/Step_Playground/src/main.c), and
       [platformer.c](tools/tile_editor_web/builder-templates/platformer.c).
       Removed the catastrophic stripe corruption.
    2. **`PPU_MASK` wrap.** A residual one-frame ghost "a few tiles
       below" the BG appeared on each scroll-step — late writes from
       the column burst were spilling past the line-261 T→V copy and
       polluting the rendering V register mid-frame. Wrapped the
       vblank work in `PPU_MASK = 0` … `PPU_MASK = 0x1E` so any late
       write can't reach the screen.
    3. **Prepare / stream split.** [scroll.h](steps/Step_Playground/src/scroll.h)
       gained `scroll_stream_prepare()`, called BEFORE `waitvsync()`.
       The slow `bg_world_tiles[rr * BG_WORLD_COLS + col]` indexing now
       happens outside vblank into a 30-byte static buffer, so the
       in-vblank loop is just `*buf -> PPU_DATA`.
    4. **Unrolled 30-write burst.** cc65 is invoked without `-O`, so
       even the simplified loop cost ~50–65 cycles per iteration,
       still enough for the tail to spill (12-tile-below ghost,
       briefer but persistent). Unrolled the column and row bursts
       in `scroll_stream` to `lda buf+N; sta $2007` pairs (8 cycles
       each, ~250 cycles total). Fully clean across all scroll
       speeds and directions.
  Builder regression suite (10 smoke suites + byte-identical-ROM
  invariant) green after every step. Closes the parked C2 scroll-
  flicker investigation outright.
- **Status / date:** [done] 2026-04-25.

- **Said:** "When I first opened my project from my files I could use
  'Play in NES' from code section and all was well. Once I changed the
  value of `jmp_up` (line 278, value changed to 35 and I left the
  semicolon at the end of the line), I could only use Play in NES from
  'Backgrounds' section. The only change I made after opening project
  was changing jmp_up." (15:30, 25 April 2026.)
- **Mitigation:** Suggests the Code page's Play handler diverges from
  the shared `play-pipeline.js` flow after the first CodeMirror edit
  — the Backgrounds page rebuilds via `BuilderAssembler.assemble()` and
  still works, so the issue is specific to the Code-page custom-`main.c`
  branch. Probably the page caches a `customMainC` payload that becomes
  stale or malformed once CodeMirror's doc state mutates. Plan:
  reproduce by opening pupil's project, hitting Play (works), editing
  one constant on the Code page, hitting Play again; capture the
  request body sent to `/play` and the server's `stage`/`log` response.
  Likely fix is to re-read CodeMirror's current doc text on every Play
  click rather than reusing a snapshot.
- **Status / date:** [new] 2026-04-25.

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

## Proposed roadmap — next sprints

The original [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) worked
through Sprints 1–5 aimed at the 2026-04-13 feedback; large parts of
Sprints 1, 3 and 4 have shipped (see
[changelog-implemented.md](changelog-implemented.md)). The plan below
folds the remaining 2026-04-13 items together with the fresh
2026-04-20 ideas into four focused sprints. Each sprint is
independently shippable and ends with a manual pupil walkthrough
before it's declared done.

Effort key: **S** ≈ under a day, **M** ≈ 1–3 days, **L** ≈ a week.

### Sprint 6 — Close the 2026-04-13 gaps (effort: M)

Finishes the Sprints 1 / 4 / 5 items that never landed. **Status:
shipped 2026-04-20 — see [changelog-implemented.md](changelog-implemented.md#sprint-6--2026-04-20-gap-fillers).**

- **6.1 Tile 0 lock + BG-colour swatch (S).** [done] Padlock +
  explainer on the Sprites page's read-only BG palettes; BG-colour
  label on the Backgrounds page expanded to two sentences.
- **6.2 Explicit modes on the background canvas (M).** [done,
  2026-04-13] Paint tile / Paint palette / Erase radio buttons,
  persisted in `prefs.ntMode`.
- **6.3 Grid control (S).** [done] `⊞ Grid ▾` popover with fine
  grid, chunk lines, line-width and colour preset, persisted to
  `prefs.grid`.
- **6.4 Keyboard shortcut overlay (S).** [done] `?` opens a
  `<dialog>` cheat sheet on all three pages (Backgrounds / Sprites
  already had one; Code page added this sprint).
- **6.5 Offline FCEUX stale-build hunt (S).** [done] Server now
  returns `built_iso` + `build_time_ms`; both web pages show the
  stamp; VS Code gained a `Safe Rebuild & Run (make rebuild-run)`
  task. Existing Makefile dependency chains were already correct,
  so no `.inc` prerequisites needed adding.

### Sprint 7 — Snippet library expansion (effort: M)

Addresses the three 2026-04-20 gameplay asks in one coherent pass.

- **7.1 Extended sprite roles (S).** [done] Five new roles
  (`tool`, `powerup`, `pickup`, `projectile`, `decoration`) added to
  both role selectors on the Sprites page. `playground_server.py`
  emits `#define ROLE_*` plus an `ss_role[]` byte table in
  `scene.inc` / `scene.asminc`; snippets filter by role via those
  symbols. See `changelog-implemented.md`.
- **7.2 Enemy walker + chaser snippets (M).** [done]
  `snippets/enemy-walker.c` paces every ROLE_ENEMY sprite along the
  X axis, flipping direction at the screen edge.
  `snippets/enemy-chaser.c` nudges each ROLE_ENEMY sprite one pixel
  towards `(px, py)` per frame. `ss_x` / `ss_y` are now emitted as
  mutable arrays (cc65 DATA segment, ROM→RAM copy at startup) so
  snippets can write to them directly.
- **7.3 Follower snippet (S).** [done] `snippets/follower-npc.c`
  records the last 32 `(px, py)` samples in a ring buffer and places
  the first ROLE_NPC sprite at the tail entry. `FOLLOW_LAG` macro
  controls the gap.
- **7.4 NPC dialogue snippet (M).** [done] `draw_text()` /
  `clear_text_row()` helpers added to the Step_Playground `main.c`
  template — each call wraps its PPU writes in a `waitvsync()` +
  `PPU_MASK = 0` window. `snippets/npc-dialogue.c` shows a
  pupil-editable tile-index string when the player touches the first
  ROLE_NPC sprite and presses B (press B again to hide).

### Sprint 8 — Drawing, palette & animation UX (effort: L)

The 2026-04-20 "make editing easier" bucket.

- **8.1 Drawing tool palette (L).** Pencil (current), Fill (flood),
  Line, Rect, Circle, Select (marquee + delete / move). Tools write
  through the existing pixel + undo path. Select → drag handle
  implements "change the size of parts" without a separate resize
  tool. Shift-constrains to one colour.
- **8.2 Palette picker QoL (S).** One-click "pick and assign" by
  letting the master grid follow the mouse after a slot click;
  drag-and-drop colour onto a slot; `Recent colours` strip above
  the master grid.
- **8.3 Inline animation strip (M).** Promote Animations from a
  collapsed `<details>` to a strip above the composition canvas —
  keep the full editor inside the collapsible for power users.

### Sprint 9 — Scenes, audio groundwork, gallery, accessibility (effort: L)

The bigger, more speculative items. Land behind a feature flag per
sub-item so a half-baked piece never blocks a pupil session.

- **9.1 Scene exits + transition state machine (M).** Per-background
  edge bands in the editor; `scene_exits[]` exported from the
  playground; `main.c` template grows a scene-switch state machine.
  Horizontal exits first.
- **9.2 Audio spike (L, split over Sprints 9 and 10).** Vendor the
  FamiStudio sound engine in `tools/audio/`, teach the Makefile to
  assemble it, add a minimal Audio page that accepts `.ftm → .s`
  output and stores it next to `src/`. Ship `play_music(n)` plus two
  snippets (`music-on-start`, `jump-sfx`).
- **9.3 Gallery publish (M).** **Publish to gallery** action copies
  the current `game.nes`, a thumbnail PNG, and project metadata into
  `tools/gallery/<slug>/`. `playground_server.py` serves an
  `/gallery` index that loads each entry into the in-browser
  emulator.
- **9.4 UI scale + high contrast (S).** `--ui-scale` CSS variable
  wired to a header dropdown; persisted in `prefs.uiScale`. Pair
  with the existing `bgTheme` system.

### Ordering rationale

- **Sprint 6 first** because leftover 2026-04-13 items block existing
  pupils; they're small and land quickly.
- **Sprint 7 next** because it directly responds to MH's gameplay
  asks (enemy / NPC / follower) which are the most motivating pieces
  for a pupil building their first game.
- **Sprint 8 before Sprint 9** because it makes the editor more fun
  every day; Sprint 9 ships *new* capability but adds less delight
  per hour invested.
- Defer the "Getting-started GIFs/videos" content work outside this
  code roadmap (content production, not engineering).

### Out of scope for this roadmap

- Per-pupil accounts, networked sharing — gallery stays on-machine.
- Save-to-Git from the editor — pupils use the git CLI with teacher
  supervision.
- Audio-engine rewrite — piggyback on FamiStudio's tooling.

---

## Changelog

- 2026-04-13 — initial version; seeded with first pupil-testing
  session feedback and teacher / Claude suggestions.
- 2026-04-20 — added 11 ideas from the second pupil-testing session
  (enemy, gallery, palette picker, sprite roles, animations
  findability, scene transitions, NPC dialogue, audio, drawing
  tools, follower sprite, text size). Marked six 2026-04-13 items
  as `[done]` per `changelog-implemented.md`. Added the "Proposed
  roadmap" section with Sprints 6–9.
- 2026-04-23 — logged the most-common pupil request: a simpler,
  reliable, module-based alternative to the Code page ("tick
  platformer, pick sprites, fill in attributes, play"). Detailed
  design lives in [builder-plan.md](builder-plan.md); summary row
  and entry added under a new *Code page — no-C module builder*
  theme.
- 2026-04-24 — Builder shipped in full across Phase A (chunks 1–5,
  Player 2), Phase B (chunks 1–4, scene editor + animations +
  teleport doors + polish), and Phase B+ (rounds 1–3, P2 HP + P2
  animation + multi-pair animations + dialogue + multi-background
  doors).  See [BUILDER_GUIDE.md](BUILDER_GUIDE.md) for the pupil
  reference.  Marked the following earlier requests as `[done]`:
  the "Simpler, no-C module builder" ask, scene-transition
  triggers (now delivered via multi-background doors), and added
  three new `[done]` rows covering the Phase B+ additions
  (co-op, in-Builder NPC dialogue, room transitions).
- 2026-04-24 (later) — post-pupil-session fix pass captured in
  [plan-batches.md](plan-batches.md).  Shipped: unified Play
  pipeline across every editor page (one helper, one set of
  controls, sensible fallbacks so empty projects still build);
  ▶ Play + ⬇ ROM + In-browser/Local-fceux dropdown now on
  Backgrounds / Sprites / Behaviour / Builder / Code; shared
  embedded jsnes dialog on every page; ladder tiles now block
  climbing through solid ground unless the target row is also
  LADDER; Builder scene-instance row layout tidied (proper
  7-column grid, square delete button, empty-state placeholder);
  legacy `enemies` module removed (per-instance Scene AI
  superseded it); sprite palettes hidden from the Backgrounds
  page (they were confusing pupils); paint-colour swatches now
  update live when a palette is selected or recoloured; native
  fceux now loads the same ROM as the browser (stale-`game.nes`
  bug fixed via `_play_latest.nes`); OAM DMA pipeline replaces
  per-byte OAM_DATA writes so complex scenes stop glitching on
  real hardware / fceux.  Flipped this file's "Offline FCEUX
  runs a stale build" entry to `[done]`.  Remaining Batch-B
  polish items (help-popover tabs, project-dropdown parity,
  Backgrounds palette selector facelift) still on the list.
- 2026-04-25 — logged two new bugs from the 15:30 in-editor review
  session under a new *Play pipeline* theme: arrow keys driving the
  tileset *and* the player when the embedded emulator runs from the
  Backgrounds page, and the Code-page ▶ Play breaking after the first
  CodeMirror edit (Backgrounds-page Play still works on the same
  project). Fixed the keyboard-bleed bug the same day — every editor
  page now early-returns from its window-level `keydown` handler while
  the shared `<dialog id="emu-dialog">` is open, so arrow keys / Ctrl-S
  / undo / hotkeys can no longer mutate the project mid-play. The
  Code-page Play regression is still `[new]` pending repro.
- 2026-04-25 (later) — closed the parked **C2 scroll flicker** after
  FCEUX PPU-Viewer screenshots showed the corruption pattern was a
  stride bug: cc65 was eliding the `PPU_CTRL = +32 stride` write that
  precedes the column burst in [scroll.c](steps/Step_Playground/src/scroll.c),
  so 30-tile column writes ran at `+1` stride and smeared the column
  across one nametable row each scroll-step. Fixed by qualifying the
  PPU/OAM register macros `volatile` in `scroll.c`, `main.c`, and
  `tools/tile_editor_web/builder-templates/platformer.c`. Builder
  regression suite (10 smoke suites + byte-identical-ROM invariant)
  green after the change.
- 2026-04-25 (continued) — full C2 fix chain landed across three more
  passes: PPU_MASK = 0/0x1E wrap around the vblank work, prepare/
  stream split (slow array indexing moved before `waitvsync()`), and
  fully-unrolled 30-tile column / 32-tile row bursts to escape cc65's
  no-`O` per-iteration overhead.  Pupil confirmed clean across all
  scroll speeds and directions.  Audited the rest of the vblank-time
  PPU writes — only the dialogue module's row-write loop remains as a
  theoretical spill candidate (rare, only on open/close transition
  frames, and protected by the same PPU_MASK wrap), tracked but not
  acted on.  Tried a `cc65 -O` Makefile change as a global perf lever
  but reverted — even plain `-O` makes the byte-identical-baseline
  invariant fail because the optimiser handles the stock vs Builder
  template differently on the no-modules path.  Logged a separate
  pupil bug: 2×2 (4-screen) backgrounds in top-down mode draw the
  wrong section due to V-mirror only providing two distinct nametable
  banks; shipped an alert+revert gate on the dropdown
  ([index.html:4148-4170](tools/tile_editor_web/index.html#L4148-L4170))
  and queued the proper fix (4-screen-VRAM cartridge config) as
  Phase 4.4 of [next-steps-plan.md](next-steps-plan.md).
- 2026-04-25 (Phase 4.1) — accessibility pass shipped.  New shared
  [a11y.js](tools/tile_editor_web/a11y.js) module auto-injects two
  controls into every editor page's header: a Text-size dropdown
  (100 / 125 / 150 / 175%) that scales `body.style.fontSize` and
  exposes `--ui-scale` as a CSS custom property, and a Theme dropdown
  (Standard / High contrast) that swaps the page's `:root` CSS
  variables for WCAG-AA pairings (true black bg / true white fg /
  bright yellow accent / forced borders on inputs).  Persisted as
  `prefs.uiScale` and `prefs.uiTheme` so choices follow the pupil
  across all five editor pages.  Tour updated on Backgrounds and
  Sprites pages to point at the new controls.  New
  [a11y.mjs](tools/builder-tests/a11y.mjs) regression suite covers
  pref round-trip, DOM injection, and change-event persistence; full
  Builder regression suite green.  Closed the 2026-04-20
  "Make text size configurable / bigger" pupil ask in the same pass.
- 2026-04-25 (Phase 4.2) — gallery / showcase shipped.  New
  `/gallery/publish`, `/gallery/list`, `/gallery/<slug>/<file>` and
  `/gallery/remove` endpoints in
  [playground_server.py](tools/playground_server.py); per-entry
  storage at `tools/gallery/<slug>/` holds rom.nes, preview.png,
  project.json (so other pupils can remix), and metadata.json.  New
  [gallery.html](tools/tile_editor_web/gallery.html) card grid with
  ▶ Play (shared emulator), ⬇ ROM, ⬇ Project, 🗑 Remove.  Builder
  page gained a **📤 Publish to gallery** button that re-uses
  `PlayPipeline.play()` and captures a 30-frame preview via a hidden
  jsnes instance.  Gallery nav link added to all five editor pages.
  Forward-compatible with the planned pupil/teacher accounts (Phase
  4.6 of [next-steps-plan.md](next-steps-plan.md)): metadata schema
  reserves an `owner` slot, pupil_handle is already first-class,
  Remove will become teacher-gated.  No personal info collected today
  or planned for the accounts work — handles are pseudonymous, no
  real names anywhere.  New
  [gallery.mjs](tools/builder-tests/gallery.mjs) regression suite
  covers the full publish-list-fetch-remove round-trip plus
  path-traversal rejection; full suite green (12 smoke suites).
  Closed the 2026-04-20 "Gallery to upload screenshots / ROMs"
  pupil ask in the same pass.
- 2026-04-25 (continued) — pupil flagged the same V-mirror
  corruption on **1×2 vertical** worlds that broke 2×2 in top-down
  mode; same root cause (NT0/NT2 share one bank under V-mirror so
  any vertical scroll overwrites the visible screen).  Extended the
  Backgrounds-page size-selector gate to alert + revert on *both*
  vertical sizes, and merged the 1×N case into Phase 4.4 of
  [next-steps-plan.md](next-steps-plan.md) (one 4-screen-VRAM fix
  closes both).
- 2026-04-25 (Phase 1.3) — project-menu parity shipped.  Behaviour,
  Builder and Code now expose **Recover from snapshot** and
  **Migration backup** alongside Save / Open / Duplicate / Delete,
  matching the Backgrounds-page menu (Builder + Code intentionally
  keep their "new projects start on the Sprites page" hint).  New
  shared [project-menu.js](tools/tile_editor_web/project-menu.js)
  module lazily injects the recovery dialog on pages that don't
  ship one and wires the handlers via an idempotent
  `ProjectMenu.wire()` call.  Backgrounds + Sprites untouched — the
  module is a no-op on buttons that already have inline handlers.
  New
  [project-menu.mjs](tools/builder-tests/project-menu.mjs)
  regression suite covers HTML parity across all 5 pages, the
  shared module's wiring + idempotency, dialog injection,
  snapshot-list rendering, and the Restore → saveCurrent → reload
  path.
