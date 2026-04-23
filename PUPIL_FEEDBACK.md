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
| 2026-04-13 | Project templates  | Choice of starter demo: platformer vs Pac-man/Pokémon top-down    | [new]     |
| 2026-04-13 | Sprite UX          | Easier way to tag sprites by role (player, npc, enemy, etc.)      | [done]    |
| 2026-04-13 | Sprite UX          | Active palette swatches at top of sprite editor, click to pick    | [done]    |
| 2026-04-13 | Sprite UX          | Per-tile palette selector (compact, not in the way)               | [done]    |
| 2026-04-13 | Background UX      | Changing palette often changes the tile too — needs to be clear   | [new]     |
| 2026-04-13 | Background UX      | Warn that tile 0 is the background; allow changing BG colour      | [new]     |
| 2026-04-13 | Background UX      | Easier per-section palette change                                 | [new]     |
| 2026-04-13 | Grid               | Thicker/darker grid lines, with coarser and finer grid options    | [new]     |
| 2026-04-13 | Sprite UX          | New sprite should auto-pick next empty tiles; easier replace flow | [done]    |
| 2026-04-13 | Modes              | Distinct modes (paint tile / set palette) on both pages           | [new]     |
| 2026-04-13 | Emulator           | Offline FCEUX sometimes runs a stale build; browser one is fresh  | [new]     |
| 2026-04-13 | Help               | Getting-started videos and animations                             | [new]     |
| 2026-04-20 | Gameplay snippets  | Enemy sprite that moves around as a bad guy                       | [done]    |
| 2026-04-20 | Gameplay snippets  | NPC dialogue snippet                                              | [done]    |
| 2026-04-20 | Gameplay snippets  | Follower sprite that tracks the player                            | [done]    |
| 2026-04-20 | Sprite UX          | More sprite role labels (tools, power-ups) for future snippets    | [done]    |
| 2026-04-20 | Sprite UX          | Make the Animation panel easier to find and use                   | [new]     |
| 2026-04-20 | Drawing tools      | Fill, shape select (rect/circle), resize regions, shape delete    | [new]     |
| 2026-04-20 | Palette UX         | Pick colours for palettes more easily                             | [new]     |
| 2026-04-20 | Scenes             | Trigger next-scene load (uses existing multi-background support)  | [new]     |
| 2026-04-20 | Audio              | Import FamiStudio music/SFX files                                 | [new]     |
| 2026-04-20 | Sharing            | Gallery to upload screenshots / ROMs for others to play           | [new]     |
| 2026-04-20 | Accessibility      | Make text size configurable / bigger                              | [new]     |
| 2026-04-23 | Code page          | Simpler, no-C "module builder" alternative to the Code page       | [planned] |

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
- **Status / date:** [new] 2026-04-20

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
- **Status / date:** [new] 2026-04-20

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
- **Status / date:** [new] 2026-04-20

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
- **Mitigation:** an in-browser gallery index served by
  `tools/playground_server.py`: each pupil project can **Publish to
  gallery** which copies the current `game.nes`, a thumbnail PNG
  (grabbed from the preview canvas) and the project metadata to
  `tools/gallery/<slug>/`. The gallery page lists them; clicking a
  card loads the ROM into the in-browser emulator read-only. No
  account system — gallery entries are per-machine, teacher curates.
  Stretch: **Export gallery bundle** zips the folder for sharing
  across machines.
- **Status / date:** [new] 2026-04-20

---

### Accessibility

#### Bigger / configurable text size

- **Said:** "Ability to set the text size bigger." *(MH, 2026-04-20)*
- **Mitigation:** add a `--ui-scale` CSS custom property set via a
  header dropdown (`100% / 125% / 150% / 175%`). Apply it to `body`
  font-size + canvas scaling so both text *and* the 8×8 tile-editor
  zoom enlarge together. Persist in `prefs.uiScale`. Pair with a
  high-contrast theme toggle later. Note: the existing `bgTheme`
  (dark/mid/light) already helps low-contrast vision.
- **Status / date:** [new] 2026-04-20

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
