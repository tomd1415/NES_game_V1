# Implemented UI improvements — Sprites & Backgrounds pages

Companion to `changelog-planned.md`. Records what actually shipped, what
was unnecessary, and what was deferred.

---

## Done

### Layout & proximity (Sprites page)

- **A1 — Active-colour row above the composition canvas.**
  The `#sprite-side-swatches` strip in `sprite-side-controls` was inert
  HTML before — `renderPinnedSwatches()` only populated the pixel
  editor's swatch row. Now it populates *both* targets, so the primary
  colour picker sits directly above the composition canvas while the
  pixel editor keeps its secondary swatches.

- **A2 — NES master next to the palette editor.**
  `#master-grid` moved out of the right panel and into `palettes-sub`,
  immediately under the sprite & background palette blocks. Picking a
  swatch and assigning it now happens within one visual group.

- **A3 — Right column is pure tileset.**
  With the master grid gone, the right panel hosts only the shared
  tileset canvas, the four-state legend, and the existing hint copy.

- **A4 — Collapsible sub-sections (partial).**
  Generic helper added: any `<details class="collapsible"
  data-collapse-key="…">` persists its open/closed state in
  localStorage via `initCollapsiblePersistence()`. Applied to
  Animations and Cell-inspector "Advanced tile properties". Other
  sections were left expanded by default — hands-on testing suggested
  too many collapsed groups made the page feel hidden rather than
  tidy.

### Tile-selection flow (Sprites page)

- **B1 — Auto-assign on first paint.**
  `autoAssignFreeTileToCell()` is called from both `spApply()`
  (composition canvas) and `teApply()` (pixel editor) when the
  selected cell is empty and the pupil starts painting. A 2-second
  toast (`✨ Used tile 0xNN for this cell`) confirms the action.
  `pushUndo()` is called once via the `undoAlreadyPushed` flag so a
  single Ctrl-Z reverses both the assignment and the first stroke.

- **B2 — One-click tile assignment.**
  Single-click on a tile in the shared tileset assigns it to the
  selected cell straight away. The previous "highlight, then press
  Assign" two-step is gone; the `📥 Assign 0x## to this cell` button
  was removed from the cell inspector. `[`/`]` + `Enter` and the tile
  picker dialog still work for power users.

- **B3 — Three-state cell inspector.**
  `renderCellStateBanner()` renders one of three banners with the
  obvious next action:
  - **Empty cell** → `📄 New blank tile`, `📋 Pick existing tile`.
  - **Using tile 0xNN — only in this sprite** → `🔄 Change tile`,
    `Clear`.
  - **Using tile 0xNN — also in *other_sprite*…** → `✂️ Make my own
    copy`, `🔄 Change tile`, `Clear`.
  The raw tile-index number input plus flip / palette / priority
  controls live under the collapsed "Advanced tile properties"
  disclosure.

- **B4 — Colour-coded tileset.**
  The tileset render already drew teal outlines for "in this sprite"
  and orange dashed outlines for "shared with other sprites". The
  legend swatches in the right panel now match those colours
  (`#1b9e77` teal, `#d95f02` orange, `#7570b3` purple) so the legend
  and the canvas read as the same system.

- **B5 — Empty cells look empty.**
  Already in place — `drawEmptyCellPlaceholder()` paints a dotted
  outline plus `?` glyph for unassigned cells in the composition
  canvas. Verified, no change needed.

- **B6 — Visible fork action.**
  Surfaced through the `✂️ Make my own copy` button in the
  shared-state banner (B3) and through the existing shared-tile
  dialog's duplicate option. The standalone "first time you paint a
  shared tile" inline nudge was *not* added — testing showed the
  banner button covers the same case earlier in the workflow, before
  the pupil paints anything they would regret.

### Misc

- `duplicateTileForCurrentCell()` extracted as a shared helper used
  by the `D` shortcut, the cell-state banner button, and any future
  "fork" entry points.

### Sprint 6 — 2026-04-20 gap-fillers

- **6.1 Tile 0 padlock on Sprites page + BG-colour explainer.**
  The read-only BG palettes under the pixel editor now mark slot 0
  with a 🔒 glyph, a yellow dashed outline, and a tooltip pointing
  pupils back to the Backgrounds page to change the universal BG.
  A short explainer paragraph sits above the four BG palette rows.
  On the Backgrounds page the `Background colour` swatch label gained
  two sentences ("Fills every empty spot and shows through tile 0." /
  "Shared by all four BG palettes — change it here once.") so the
  meaning is visible without opening the tooltip.

- **6.2 Explicit BG painting modes.** Already shipped in the
  2026-04-13 round (`nt-mode` radio buttons for 🖌 Paint tile / 🎨
  Paint palette / 🧽 Erase, persisted in `prefs.ntMode`, with
  mode-specific canvas cursors). Verified during this sprint.

- **6.3 Grid control (line width / colour / chunk lines).** Replaced
  the single "fine grid" checkbox with a `⊞ Grid ▾` popover that
  holds four controls: fine 8×8 grid on/off, chunk lines (2×2 attr
  blocks) on/off, line-width (1 or 2 px) and colour preset
  (yellow / cyan / white / dark). Settings persist to `prefs.grid`
  via `Storage.writePrefs`, so each pupil keeps their preferred grid
  across sessions and projects.

- **6.4 Keyboard shortcut overlay on Code page.** The Backgrounds
  and Sprites pages already bound `?` to a `<dialog>`-based cheat
  sheet. The Code page now matches: a `?` button in the toolbar and
  a global `?`-key handler (scoped to skip CodeMirror + form fields)
  open a help dialog listing the Guided/Advanced toggle, lesson /
  snippet / symbols buttons, and the in-browser emulator's F / P / R
  / Ctrl-Space / Ctrl-S shortcuts.

- **6.5 Build timestamp + safe rebuild task.** `run_play` in
  [tools/playground_server.py](tools/playground_server.py) now
  returns `built_iso`, `built_epoch` and `build_time_ms` with every
  ROM. The Sprites-page status banner and the Code-page build
  summary display the build time (e.g. "built 14:02:37 · 1120 ms"),
  so a pupil who sees stale art in FCEUX can confirm whether the
  latest build actually ran. `.vscode/tasks.json` gained a `Safe
  Rebuild & Run (make rebuild-run)` task that runs the Makefile
  `rebuild-run` target directly — one make invocation, clean build
  guaranteed — as the official "try this if FCEUX looks stale"
  escape hatch. All six step Makefiles already declare the
  `rebuild-run` target and proper `.inc`/`.chr`/`.nam`
  prerequisites, so no Makefile changes were needed.

### Sprint 7 — 2026-04-20 snippet library expansion

- **7.1 Extended sprite roles.** Five new role options —
  `tool`, `powerup`, `pickup`, `projectile`, `decoration` — joined
  the existing `player` / `npc` / `enemy` / `item` / `other` set in
  [tools/tile_editor_web/sprites.html](tools/tile_editor_web/sprites.html)
  (both `ROLE_COLOURS` / `ROLE_LABELS` maps, the filter `<select>`,
  the per-sprite role `<select>`, and the state migrator). Colour
  coding now drives ten distinct hues in the scene-sprite list.
  `playground_server.py` gained a `ROLE_CODES` dict plus
  `_role_code(sp)` helper, emits `#define ROLE_PLAYER 0` …
  `ROLE_OTHER 9` into `scene.inc` and `.define ROLE_*` into
  `scene.asminc`, and appends an `ss_role[]` byte table so snippets
  can filter by role. The zero-sprite stub and the
  [code.html](tools/tile_editor_web/code.html) `HINT_SYMBOLS`
  autocomplete list both pick up the new identifiers.
- **7.2 Enemy walker + chaser snippets.** New
  [snippets/enemy-walker.c](snippets/enemy-walker.c) paces every
  ROLE_ENEMY scene sprite left-right (with per-sprite direction in
  a static `enemy_dir[16]` ring) and flips at the screen edge.
  [snippets/enemy-chaser.c](snippets/enemy-chaser.c) nudges each
  ROLE_ENEMY sprite one pixel towards `(px, py)` per frame. For
  these to work, `playground_server.build_scene_inc` now emits
  `ss_x` / `ss_y` as mutable `static unsigned char` arrays (all
  other `ss_*` tables stay `static const`). The cc65 linker's DATA
  segment copies the ROM initialisers into RAM at startup, so the
  snippets can freely write to the arrays and existing read-only
  snippets like `solid-obstacles` keep working.
- **7.3 Follower snippet.**
  [snippets/follower-npc.c](snippets/follower-npc.c) keeps the
  last 32 `(px, py)` samples in a static ring buffer and snaps the
  first ROLE_NPC sprite to the tail entry. Pupils tweak
  `#define FOLLOW_LAG 24` for a closer or more distant trail.
  `trail_primed` guards the first `FOLLOW_LAG` frames so the
  follower doesn't teleport through garbage.
- **7.4 NPC dialogue snippet + `draw_text` helper.**
  [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
  now defines `draw_text(row, col, text)` and
  `clear_text_row(row, col, width)`. Each wraps its PPU writes in
  its own `waitvsync()` + `PPU_MASK = 0` window, so they are safe
  to call from the `magic_button` region (which runs before the
  main vblank). The helpers are exposed to autocomplete via
  `HINT_SYMBOLS`.
  [snippets/npc-dialogue.c](snippets/npc-dialogue.c) detects when
  the player overlaps the first ROLE_NPC scene sprite, and on a B
  edge toggles the dialogue text on or off. The string is a
  zero-terminated array of CHR tile indices exposed at the top of
  the snippet body so pupils can edit it without wrestling with
  string literals.

### Sprint 9 — 2026-04-21 selection-tool actions

- **Selection actions (Sprites page).** Sprint 8's `Select` marquee
  grew the actions pupils actually want: **Copy / Paste**, **Rotate
  90° CW / CCW**, **Flip H / V**, **Grab-to-move**, plus **Clear**
  (same as `Delete`). All routes push one `pushUndo()` at the start
  so a single `Ctrl-Z` reverts the whole operation. Paste anchors at
  the current marquee's top-left (falling back to the selected cell's
  top-left when no marquee exists); clipboard pixels that would fall
  off the right/bottom edge are silently discarded. Rotate swaps the
  marquee's dimensions; if the rotated rect would extend past the
  sprite edge the pixels off the edge are dropped and a toast warns
  `↻ Rotation clipped at sprite edge`. Grab-to-move lifts the region
  into a `floatingSelection` (source pixels zeroed, ghost overlay
  follows the cursor, clamped inside sprite bounds) and commits on
  mouseup; `Escape` or clicking outside the marquee while floating
  cancels and restores the source. The selection clipboard is
  session-only and cross-sprite, so pupils can copy in sprite A and
  paste in sprite B. A new **selection-actions strip** below the
  sprite canvas surfaces every action with size readout
  (`Selection W×H`) and disables buttons when they don't apply.
  Keyboard, scoped to the Select tool only: `Ctrl-C` copy, `Ctrl-V`
  paste, `R` rotate CW, `Shift+R` rotate CCW, `H` flip horizontal,
  `Escape` cancel float / clear selection. Flip V is toolbar-only by
  design (lowercase `v` is already paste).
- **Scale selection (`🔎+ ×2` / `🔎− ÷2`).** Toolbar-only integer
  nearest-neighbour scaling. `×2` doubles each pixel into a 2×2
  block (anchored at the marquee's top-left; clipped at the sprite
  edge with a toast). `÷2` samples every other pixel (top-left
  nearest-neighbour) and refuses to act below 2×2; odd dimensions
  drop the last row/column with a toast. Both follow the rotate path:
  one `pushUndo()` up-front, source zeroed, new `selectedRegion`
  matches the clipped output rect. No keyboard shortcut — toolbar
  only, to keep the key surface minimal.
  All changes in
  [sprites.html](tools/tile_editor_web/sprites.html); Backgrounds page
  untouched. Session-only state — no schema changes.

### Sprint 8 — 2026-04-20 palette UX + drawing tools

- **8.2 Palette editor refactor.** Both pages now share one palette
  idiom: an **active-palette editor** with the NES master grid inline,
  and an **overview list** showing every palette with a radio selector.
  On [index.html](tools/tile_editor_web/index.html) the editor has a
  BG / Sprite kind toggle + `P0..P3` buttons and the overview shows
  eight rows (BG0–BG3, SP0–SP3). On
  [sprites.html](tools/tile_editor_web/sprites.html) the editor is
  locked to the sprite kind (BG palettes live in a collapsible
  read-only ref) and the overview shows the four sprite palettes.
  A single `assignColourToSlot(kind, palIdx, slot, nesIdx)` helper is
  the only mutation path; both click-assign from the master grid and
  **drag-and-drop** from a master cell onto any non-read-only slot
  route through it, so undo stays consistent. `paletteEditor` state
  ({kind, row, slot}) persists in `prefs.paletteEditor`.
  Removed: the `#floating-palettes` popout + `🎨 Pop-out palettes`
  button + `initFloatingPalettes`/`renderFloatingPalettes`/`buildFpSwatch`
  and their CSS on the Backgrounds page; `#sprite-side-palettes` pills
  kept but now also open that palette in the editor on click; the
  duplicated `#sp-palettes` compact strip and side-panel `#master-grid`
  on the Sprites page (and their `.sp-palettes-compact` /
  `.master-grid-compact` / `.master-palette` CSS).
- **8.1 Drawing-tools popover (Sprites page).** A `🛠 Tools ▾` button
  in the sprite-composition toolbar opens a compact popover with
  **Pencil / Fill / Line / Rect / Circle / Select**. Pencil keeps the
  existing `spApply` flow (auto-assign free tile, shared-tile guard,
  eyedrop). The other tools work in **sprite-pixel coordinates**
  (`width*8 × height*8`), writing through a new `setSpritePixel(sp,
  x, y, colour)` helper that auto-assigns a free tile to any empty
  cell the stroke touches and respects each cell's flipH/flipV. Shapes
  therefore cross tile boundaries without losing pixels. Fill is a
  4-connected flood, line is Bresenham, rect is an outlined rectangle,
  circle is a midpoint ellipse over the drag bounding box. Holding
  `Shift` snaps the line to 45° steps and the rect/circle to a
  square/circle. Select is a marquee; `Delete` zeroes pixels inside
  the selection (crossing tiles). All operations push one `pushUndo()`
  at the start of the shape so a single `Ctrl-Z` reverts the whole
  thing. Active tool persists in `prefs.spriteTool`.

### Sprint 10 — 2026-04-21 behaviour page + shareable bundle

- **Phase A — Behaviour page (`tools/tile_editor_web/behaviour.html`).**
  Fourth editor page sitting next to Backgrounds / Sprites / Code. It
  shows the active background's 32×30 nametable with a coloured overlay
  of the pupil's current behaviour painting: each cell carries an id
  0..7 where `0 = none`, 1..5 are built-ins (`solid_ground`, `wall`,
  `platform`, `door`, `trigger`) and 6..7 are rename-able custom slots.
  Shared draw tools (pencil / fill / rect) write into
  `state.backgrounds[i].behaviour` and respect `pushUndo()`, so a
  misclick is one `Ctrl-Z`. A per-sprite reactions panel binds every
  sprite × behaviour pair to one verb (`ignore`, `block`, `land`,
  `land_top`, `bounce`, `exit`, `call_handler`). Reactions live in
  `state.behaviour_reactions` keyed by sprite index. Migration fills
  both fields in any older project on load so pre-Sprint-10 saves
  open cleanly on all four pages. The two custom slots carry colour
  pickers and name fields so a pupil's *Spikes* tile paints pink and
  exports as `BEHAVIOUR_SPIKES` without needing to touch code.
- **16×16 metatile toggle.** A `🔲 Snap to 16×16 blocks` checkbox in
  the Behaviour page toolbar expands every paint to cover the 2×2 block
  containing the clicked cell. Per-tile is the default (levels are
  small early on); toggling persists on the page.
- **Phase B — C codegen for the behaviour map.** The playground
  server writes two new files alongside `scene.inc` / `palettes.inc`:
  `src/collision.h` (enum-style `#define`s for the eight
  `BEHAVIOUR_*` ids and the seven `REACT_*` verbs, plus
  `WORLD_COLS` / `WORLD_ROWS` covering the full
  `screens_x × screens_y` world so the data is scroll-ready when
  scrolling lands in a later sprint) and `src/behaviour.c` (a flat
  `const unsigned char behaviour_map[]` and `sprite_reactions[]`
  lookup table plus the two query functions `behaviour_at()` and
  `reaction_for()`). Both ship from the shared-dir *and* tempdir
  build paths in `_build_rom`. Custom-slot names are uppercased and
  stripped to `[A-Z0-9_]`; empty or digit-leading names fall back to
  `CUSTOM6` / `CUSTOM7`. `steps/Step_Playground/Makefile` gains a
  `behaviour.c` object and a `collision.h` dependency on `main.o`
  so a fresh paint triggers a full rebuild. Stub `collision.h` and
  `behaviour.c` are committed so `make -C steps/Step_Playground`
  works from a fresh checkout with the server not running.
  Hook-dispatch from `main.c` is deferred to Phase C; pupils call
  the two functions themselves for now.
- **`💾 Save all my work` / `📂 Open saved work` bundle.** A pair of
  header buttons on all four pages (Backgrounds / Sprites / Behaviour
  / Code) exports the full `state` blob as a single
  `<project>.nesgame.json` file and re-imports it with a confirm +
  auto-snapshot guard. Complements the page-scoped import/export
  buttons (which only bring in the slice relevant to the current
  page) — pupils now have one "save all my work" action for USB
  sticks and email attachments.
- **Snippet: `behaviour-walls-from-map`.** First Behaviour-aware
  snippet: reads `behaviour_at()` in front of the player and uses
  `reaction_for(0, id)` to push them back when the tile is marked
  `BLOCK`. Seed code for the future hook-dispatch lesson.
- **Default gravity for scene sprites + 🕊 Flying toggle.** Every
  scene sprite now falls 1 px/frame until `behaviour_at()` under its
  bottom edge returns `BEHAVIOUR_SOLID_GROUND` or
  `BEHAVIOUR_PLATFORM`. A new `flying` boolean on each sprite (tick
  `🕊 Flying (ignore gravity)` on the Sprites page) exports as
  `ss_flying[]` alongside `ss_role[]` in both `scene.inc` and
  `scene.asminc`. The gravity loop lives inside a `//>> gravity`
  guided region in the default `main.c` so Advanced-mode pupils
  can tweak or remove it. Migration fills `sp.flying = false` for
  any pre-existing sprite. RPG-style grid-step behaviour (Pokémon
  overhead movement) is deferred — tracked in
  `project_rpg_starting_option.md` — the user asked for "default
  gravity for all for now".
- **Player drops to painted ground + 4-way solidity.** The default
  `main.c` no longer pins the player to a hard-coded `ground_y`
  line. Gravity now consults `behaviour_at()` under both feet every
  frame, so the player falls from the editor's start Y until the
  tiles under them are painted `SOLID_GROUND`, `WALL`, or
  `PLATFORM`. Walking off a ledge drops them naturally. Follow-up
  the same day: `SOLID_GROUND` and `WALL` are now 4-way solid.
  Horizontal `LEFT`/`RIGHT` steps probe the column one step ahead
  at every body row and cancel the move if the column contains a
  solid tile; the jump ascent checks the row above the head at
  both player columns and sets `jmp_up = 0` to convert a ceiling
  bonk into a fall. `PLATFORM` stays one-way (land on top, pass
  through from below and sideways) so ledge-up-jumps still work.
  Scene-sprite gravity also treats `WALL` as a landing surface.
- **Player landing snap (stuck-in-ground fix).** The foot-check
  (`(py + PLAYER_H*8) >> 3`) is one tile below the player's body,
  so a non-aligned starting `PLAYER_Y` (e.g. 185) could leave the
  player's bottom pixel inside the ground row — which then made
  the horizontal walk check's `bot_row` see that row as
  `SOLID_GROUND` and refuse every step.  When gravity detects a
  landing tile, `py` is now snapped to `(foot_row << 3) -
  PLAYER_H * 8` so the body never overlaps the row below, and
  walking works from frame 1.
- **`BEHAVIOUR_LADDER` (builtin slot 6).** A sixth built-in
  behaviour id with a wood-amber swatch (`#c08a3c`).  Paint ladder
  tiles on the Behaviour page and the default `main.c` lets the
  player climb: while any body cell is a ladder, `UP` / `DOWN`
  move `py` by a tunable `climb_speed` (new `//>> climb_speed`
  guided region), gravity is suspended, and stepping sideways off
  the ladder resumes normal falling.  Custom slot count drops
  from 2 to 1 (slot 7 only).  A one-time migration in all three
  editor pages relocates any older custom-6 to slot 7 and remaps
  painted cells `6→7` so pupils don't silently lose named
  behaviours.  Emitter: `BUILTIN_BEHAVIOUR_NAMES[6] = "LADDER"`
  so the `BEHAVIOUR_LADDER` `#define` appears in the generated
  `collision.h`.

### Sprint 11 S-1 slice 1 — 2026-04-21 full-world nametable data

- **Full-world nametable emitter.** New `build_bg_world_h()` +
  `build_bg_world_c()` in [playground_server.py](tools/playground_server.py)
  write `src/bg_world.h` and `src/bg_world.c` alongside the existing
  `scene.inc` / `collision.h` / `behaviour.c`.  Covers the full
  `SCREEN_COLS × screens_x` by `SCREEN_ROWS × screens_y` painted
  area, row-major, as two flat `const unsigned char[]` arrays
  (`bg_world_tiles[]` and `bg_world_attrs[]`).  Attribute bytes
  follow the NES 2×2-quad packing per screen, tiled across the
  world so the scroll core can copy one attribute column per 16
  px of travel.
- **Committed 1×1 stubs** at
  [steps/Step_Playground/src/bg_world.h](steps/Step_Playground/src/bg_world.h)
  and [bg_world.c](steps/Step_Playground/src/bg_world.c) so a fresh
  `make -C steps/Step_Playground` works from a clean checkout
  before the server has ever run — same pattern as the Sprint 10
  `collision.h` / `behaviour.c` stubs.
- **Makefile wired up:** `bg_world.c` compiled unconditionally
  alongside `main.c` and `behaviour.c`.  No runtime yet references
  the symbols, so the data sits unused in the ROM image.  Fixed
  NROM cartridge size (49168 bytes) is unchanged.
- **Scope note:** this is the first of three planned slices for
  S-1.  Slice 2 will add `src/scroll.c` + `src/scroll.h` (column
  streaming, camera deadzone, world ↔ screen coords).  Slice 3
  rewires `main.c` to actually consume `bg_world_tiles[]` and
  scroll.  Multi-screen projects compile today but still play as
  a single screen until those slices land.

### Sprint 11 S-1 slice 2 — 2026-04-21 scroll core API

- **New engine files** at
  [steps/Step_Playground/src/scroll.h](steps/Step_Playground/src/scroll.h)
  and [scroll.c](steps/Step_Playground/src/scroll.c).  Committed as
  hand-written engine sources (copied into builds via the existing
  `shutil.copytree(STEP_DIR, ...)` path, same as `graphics.s`), so
  no server-side emitter is needed.
- **Camera state:** `extern unsigned int cam_x, cam_y;` in world
  pixels.  `scroll_init()` zeroes them; `scroll_apply_ppu()` writes
  the low byte of each to `$2005` (PPU_SCROLL) after vblank.  The
  full beyond-256-px path (high-bit via `PPU_CTRL` nametable
  select) is wired in slice 3 together with column streaming.
- **Deadzone-follow math:** `scroll_follow(target_world_x,
  target_world_y)` pulls the camera toward the target, keeping it
  inside a rectangle of `DEADZONE_LEFT..DEADZONE_RIGHT` ×
  `DEADZONE_TOP..DEADZONE_BOTTOM` (all four overridable via
  `#ifndef` so a `//>> camera_deadzone` guided region in main.c
  can retune them).  Clamped at world edges using
  `WORLD_W_PX - SCREEN_W_PX` / `WORLD_H_PX - SCREEN_H_PX`, with
  the axis disabled entirely when the world equals the screen
  (1×1 projects, or the non-scrolling axis of a single-axis
  project).
- **Coord helpers:** `world_to_screen_x()` / `world_to_screen_y()`
  return `0xFF` for world coordinates outside the current visible
  window.  Sprite code in slice 3 uses the sentinel to mask OAM
  slots for off-screen entities without a per-frame branch chain.
- **Makefile:** `scroll.c` added to `C_SRC` with a rule that
  depends on `scroll.h` and `bg_world.h` so a Backgrounds-page
  edit that changes the world dimensions also rebuilds the scroll
  core.  Same unconditional-compile pattern as `bg_world.c`.
- **Benign 1×1 warnings.**  cc65 emits
  `"Result of comparison is constant"` / `"Unreachable code"` on
  the `WORLD_W_PX > SCREEN_W_PX` / `WORLD_H_PX > SCREEN_H_PX`
  guards when the stub world matches the screen exactly.  Expected
  on a 1×1 project (the axis is literally a no-op there) and
  disappears as soon as the pupil expands the world.  Build still
  succeeds; ROM size unchanged at 49168 bytes.
- **Scope note:** nothing in `main.c` calls these functions yet,
  so runtime behaviour is unchanged.  Slice 3 wires the main loop
  to `scroll_follow()` + `scroll_apply_ppu()`, converts sprite
  positions to world-space `unsigned int`, and adds the column /
  row streaming during vblank.

### Sprint 11 S-1 slice 3 — 2026-04-21 main.c scroll wire-up

Split into three landing steps so the 1x1 fast path stayed
buildable after each.

**3a — scaffolding.**

- `main.c` now always `#include "bg_world.h"`.  A new
  `#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)` guard defines
  `SCROLL_BUILD` and pulls in `scroll.h`.  For 1x1 worlds the guard
  is false, so every later `#ifdef SCROLL_BUILD` block is excluded
  by the preprocessor and the pupil's existing 1x1 ROM compiles to
  the same bytes as before.
- Added `//>> camera_deadzone` guided region defining
  `DEADZONE_LEFT/RIGHT/TOP/BOTTOM` before `#include "scroll.h"` so
  the pupil can retune camera follow without editing the engine.
- `scroll_init()` + `scroll_apply_ppu()` are wired into the boot
  sequence under `SCROLL_BUILD`; the 1x1 branch keeps the literal
  `PPU_SCROLL = 0` writes.

**3b — world coordinates.**

- Player position is now `pxcoord_t` — `unsigned int` under
  `SCROLL_BUILD`, `unsigned char` on the 1x1 fast path.  cc65
  generates the same single-byte compares / loads as before for
  1x1, so no regressions there.
- Replaced hard-coded `256` / `232` right / bottom bounds with
  `WORLD_W_PX - PLAYER_W*8` / `WORLD_H_PX - 8`.  These resolve to
  the same literals for 1x1 (256/240 → 240/232) and extend to the
  full painted world for scroll builds.
- `scroll_follow((unsigned int)px + PLAYER_W*4, (unsigned int)py +
  PLAYER_H*4)` runs every frame under `SCROLL_BUILD`, pulling the
  camera toward the player's centre.
- OAM writes for the player and static scene sprites are split:
  the scroll branch computes screen coords via
  `world_to_screen_x/y()`, which conveniently returns `0xFF`
  (off-screen sentinel) for sprites outside the visible window.
  Scene sprites stay u8 world-space (inside screen 1) for slice 3;
  they scroll out of view cleanly as the camera moves.

**3c — nametable load + column streaming.**

- `scroll.c` body is now gated on
  `(BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)`.  1x1 builds
  compile scroll.c to an empty object (13-line cc65 header only) —
  the `extern` declarations in `scroll.h` dangle but are never
  referenced on the 1x1 path, so the linker is happy.
- Matching gate in `bg_world.c` (the committed stub and the
  server's emitter) so 1x1 builds emit no `bg_world_tiles[]` /
  `bg_world_attrs[]` symbols either.  ROM size is still the fixed
  49168 byte NROM image; the 1x1 ROM contents are functionally
  identical to pre-Sprint-11 (same main.c compile path, no scroll
  code linked), with a byte shuffle in the RODATA fill area from
  the new objects.  Plan explicitly allows this.
- **One-shot nametable load.**  New
  [load_world_bg()](steps/Step_Playground/src/scroll.c) copies up
  to two screens per scrolling axis from `bg_world_tiles[]` +
  `bg_world_attrs[]` into `$2000` / `$2400` / `$2800` / `$2C00`.
  Replaces the `graphics.s` `load_background()` call under
  `SCROLL_BUILD`; the 1x1 path still calls the asm routine, so the
  committed `level.nam` path is untouched.
- **Column / row streaming.**  New
  [scroll_stream()](steps/Step_Playground/src/scroll.c) runs in
  VBlank.  When `cam_x >> 3` changes it writes a 30-tile column
  into the off-screen nametable; when `cam_y >> 3` changes it
  writes a 32-tile row.  Bit 5 of the target column / row picks
  which nametable (`$2000` vs `$2400` or `$2800`) via the mirror
  aliasing, so arbitrarily wide / tall worlds stream cleanly
  without special-casing the second screen.
- **Beyond-256-px scrolling.**  `scroll_apply_ppu()` now toggles
  PPU_CTRL bits 0 / 1 based on `cam_x & 0x100` / `cam_y & 0x100`
  so the "left" nametable flips when the camera crosses a screen
  boundary.  Also resets the stride bit to +1 in case
  `scroll_stream()` left it at +32.
- **VBlank ordering.**  Each frame:
    1. `waitvsync()`
    2. `scroll_stream()` (PPU_ADDR/DATA writes, trashes scroll latch)
    3. OAM writes (one sprite byte at a time via `$2004`)
    4. `scroll_apply_ppu()` as the last PPU register write so the
       final scroll latch is correct when rendering resumes.

**Verification.**

- 1x1 build produces `49168` byte NROM with the same main.c
  assembly as slice 2 (scroll.o + bg_world.o are empty headers
  only).  Hash shifts on each slice because the linker redistributes
  fill bytes, but the executable code is unchanged.
- Simulated 2x1 world (manual `BG_WORLD_COLS=64` test) compiles
  cleanly with only the expected "constant comparison" / "unreachable"
  warnings on the disabled vertical axis.

**Known limitations (slice 3d / follow-ups).**

- **iNES mirror byte** in [cfg/nes.cfg](steps/Step_Playground/cfg/nes.cfg)
  is hard-coded to `NES_MIRRORING = 1` (V-mirror, good for
  H-scroll).  Pure-V-scroll worlds will show mirror-seam artefacts
  until the server picks cfg based on which axis scrolls.
- **Attribute streaming** is absent.  `load_world_bg()` loads
  attrs for the first two screens up front; `scroll_stream()` only
  walks tile data.  3+ screen worlds will show 16-px attribute
  seams at screen-3+ boundaries until per-16-px attribute writes
  are added.
- **Scene sprites** stay in screen 1 (u8 world coords).  Multi-
  screen sprite placement requires promoting `ss_x[]` / `ss_y[]`
  to u16 in the scene.inc emitter — deferred to S-2.

### Pupil feedback — 2026-04-22 in-editor feedback form

Lightweight "tell us what you think" channel wired into the four
editor pages without touching the header toolbar.  Plan document
at [feedback-plan.md](feedback-plan.md).

- **UI placement.**  On the tabbed help dialog (index.html,
  sprites.html) a new `💬 Feedback` tab sits after *Tips / FAQ*.
  The matching `.help-tab-panel` holds an empty
  `.feedback-form-host` that the shared module populates on first
  click.  Zero new header buttons, zero layout shift on other
  pages.
- **UI placement (non-tabbed).**  On behaviour.html and code.html
  the help dialog is a single panel, so the form goes in a
  `<details class="feedback-block">` just above the dialog's
  *Close / Got it* row.  Closed by default; expands in place.
- **Shared module.**  New
  [feedback.js](tools/tile_editor_web/feedback.js) (~200 lines)
  builds a three-radio + textarea + optional-name form, shows a
  live `n / 500` character count, disables *Send* until a category
  is picked and the message is non-empty, POSTs JSON to
  `/feedback`, and flashes an inline green *"Thanks — sent!"*
  banner on success (red banner on failure, form preserved).
  Styles are injected from the module itself so the four HTML
  files stay clean.
- **Server endpoint.**  `POST /feedback` handled in
  [playground_server.py](tools/playground_server.py) alongside the
  existing `/play` branch.  Validates category ∈ `{feature,
  broken, general}`, message 1-500 chars, name / project ≤ 80,
  body ≤ 4 kB; appends a single JSONL line to
  `feedback.jsonl` at the repo root guarded by a module-level
  `threading.Lock`.  Record carries timestamp, client IP,
  category, message, name, page, projectName, and truncated
  User-Agent.
- **Privacy.**  Submissions land in a local file the teacher
  owns; no external services involved.  Project state is
  deliberately *not* attached (~100 kB per click and contains the
  pupil's work).  `feedback.jsonl` is `.gitignore`d so it never
  enters the repo.
- **Verification.**  Smoke-tested the endpoint on port 18765:
  valid payload returned `{"ok": true}` and appended a correct
  JSONL line; missing category, empty message, and oversize
  message each returned 400 with a descriptive `error` field.
  `python3 -c 'ast.parse(...)'` clean on the server; `node
  --check` clean on feedback.js.

### Pupil feedback — 2026-04-22 follow-ups

Three tweaks after pupil testing of the first cut:

- **Shared radio-group name.**  The three category radios each
  had a different random `name` attribute, which meant they
  behaved like independent checkboxes — picking a second category
  left the first still highlighted.  Fixed by generating one
  `name` per form instance and reusing it across the three
  radios, restoring native radio-group behaviour.
- **Click-to-clear category.**  Native radios can't normally be
  un-checked by clicking them a second time.  Added a
  `mousedown`/`click` pair that records whether the radio was
  already checked at press time, then clears the whole group on
  the click if so.  *Send* disables itself again, matching the
  empty-category state.
- **Wider textarea.**  Bumped `rows` from 5 to 7, `min-height`
  from 90 px to 140 px, and added `min-width: min(520px, 85vw)`
  to `.fb-form` so the text area (and the form as a whole) has a
  proper writing surface — in particular on behaviour.html and
  code.html where the surrounding help dialog was otherwise
  narrow.
- **Include-my-project checkbox.**  New optional control under
  the name field: *"Include my project so the teacher can see
  what I was doing (sends your tiles, palette and background to
  the teacher)."*  Default off.  Only rendered when the page's
  `mountInto` call provides a `getProjectState` callback — all
  four pages now do.  When ticked, the pupil's full editor
  `state` is attached to the submission under the `project` key.
  Server body cap raised from 4 kB to 1 MB to fit typical
  snapshots (~30-100 kB).  Server validates
  `isinstance(project, dict)` before storing, so malformed
  payloads are silently dropped rather than saved.
- **Verification.**  Smoke-tested both payload shapes (with and
  without `project`) on port 18765 — each returned `{"ok":
  true}` and produced the expected JSONL line.

---

## Not done / deferred

- **B7 — Terminology cleanup.** The vocabulary
  (cell / tile / put) is consistent in the new banners and toasts.
  A whole-file sweep of older copy ("highlighted", "assigned",
  "selected tile") was deferred — most remaining occurrences are in
  hint paragraphs and tooltips that pupils rarely read mid-task.
  Worth a separate small PR with the pupils watching, so we change
  language they actually notice.

- **A4 (rest) — Collapse Sprite list, Pixel editor, Palettes, Tileset,
  Master.** Helper is in place; wrapping the remaining sections is
  one-line-per-section work but was left out for now: collapsing the
  always-on sections risks pupils losing the canvas they were just
  looking at, and the layout already fits a 1280-wide window.

- **A5 — Style parity pass.** The Backgrounds page already supplied
  the visual idiom (`palettes-panel` h3 treatment) that the Sprites
  page now uses. A deeper cross-page polish (consistent header
  spacing, summary chevron placement) is queued behind getting more
  pupil sessions on the new layout first.

- **Detach / floating for pixel editor & sprite list.** Out of scope
  for this round, as flagged in the plan. Tileset and palette
  pop-outs were already in place.

- **8.3 Inline animation strip.** Deferred to a later sprint as flagged
  in [sprint8-plan.md](sprint8-plan.md) — the animation panel
  restructure is independent of palette/tool UX.

- **Mobile / touch drag-and-drop for palettes.** The HTML5 DnD API
  is mouse-first; touch fallback (a pointer-events polyfill) is
  deferred until we see pupils on tablets.

---

## Verification

- `node --check` on the extracted JS block: OK.
- `▶ Play in NES` round-trip not re-tested in this session (no JS
  paths feeding the build pipeline were touched — only render,
  inspector, and helper code).
- localStorage schema unchanged; existing projects load.
- Shortcuts still bound: `0–3`, `[`, `]`, `D`, `Del`, `Shift+click`,
  `M`, `F`.

---

## Menu reorganisation — 2026-04-22 toolbar grouped into four zones

Plan: [menu-plan.md](menu-plan.md) (Plan B — grouped toolbar).

The header toolbar on all four editor pages was wrapping onto two
rows on 1366-wide laptops because every action sat at the top level.
The actions are now bucketed into four visually distinct groups
separated by thin dividers, matching the browser's own File / Edit
/ View / Window idiom.

- **Shared target layout.**
  `[🎮 Title] [tabs…] │ ● [📁 project ▾] │ ↶ ↷ [Clear …] │ [page tools] │ [▶ Play] [?]`.
  `.tb-group` + `border-left` on each subsequent group gives the
  dividers without any JS.  Each page has its own inline style
  block so the CSS additions landed in all four files.
- **File ▾ absorbs Projects ▾ and most file actions.**  The single
  dropdown now contains: Projects list → Rename this project
  (moved in from the standalone `#project-name` input) → New /
  Duplicate / Delete → Save all my work / Open saved work →
  Recover (index + sprites only) → Import / Export (index +
  sprites only) → auto-download backups checkbox (index only).
  The summary stays `📁 <project-name> ▾` so pupils' muscle-memory
  click target is unchanged.
- **Save-status pill shrunk to a dot.**  130-px "● Saved just now"
  pill became a 1.6-em coloured dot; the full message moved into
  the `title` attribute so hovering still shows it.  `setStatus()`
  on each page now sets both `textContent` and `title`; error
  state still shows the full text inline so something going wrong
  can't be missed.
- **Edit group — three items per page.**  Undo, Redo, and one
  "Clear X" (🗑 Clear project on index + sprites, 🗑 Clear map on
  behaviour, ↻ Restore default on code).  All kept their existing
  ids so click handlers are unchanged.
- **code.html gets two new dropdowns.**  Mode ▾ (🎓 Guided · C)
  bundles the two mode-toggle `<span>`s — Guided/Advanced and
  C/Asm — with a live summary label that updates whenever either
  sub-toggle flips.  Code tools ▾ (🧰) hides Snippets… and
  Symbols… behind one click.  The lesson chip stays visible in
  the group because pupils need to see which lesson is loaded.
- **All button ids preserved.**  The change is pure DOM location
  (and CSS) — no event handler was touched, keyboard shortcuts
  (Ctrl+Z/Y/S, `?`) still work, and saved projects load
  unchanged.

### Verification — menu reorganisation

- `node --check` clean on the extracted inline JS block of each of
  the four pages after the restructure.
- Each page's header now fits on one row at 1366 px.

---

## Feedback viewer — 2026-04-23 `GET /feedback` teacher page

Plan: [feedback-viewer-plan.md](feedback-viewer-plan.md).
Follow-up to the pupil feedback form shipped the day before.

- **`GET /feedback` renders a dark-themed page.**  Reads
  `feedback.jsonl` and `feedback-handled.json`, groups each
  submission into a card — category chip (✨/🐛/💭), pupil name
  (or *"anonymous"* italics), page, project name, timestamp,
  message in a wrapping `<pre>`.  Newest first.  Top-right of each
  card has a ✓ handled checkbox.  Opens at
  `http://localhost:8765/feedback` — no separate UI to launch.
- **Project snapshot fold-out.**  If the submission included the
  pupil's project (via the "include my project" checkbox in the
  form), the card gets a `<details>` labelled *"📎 project
  snapshot (N KB)"* with pretty-printed JSON inside.  Closed by
  default so long snapshots don't dominate the page.
- **`POST /feedback/handled` persists the toggle.**  Body is
  `{"index": N, "handled": true|false}`; server writes
  `feedback-handled.json` next to the JSONL via a temp-file
  rename under a module-level `RLock`.  Index is the 1-based line
  number in `feedback.jsonl` — stable as long as the file is only
  appended to.
- **Show handled toggle at the top.**  Default off; preference
  persisted in `localStorage` so the teacher doesn't have to
  re-tick on every reload.  Handled cards stay counted in the
  stats line but get hidden via a `body.hide-handled .handled`
  CSS rule.
- **Deadlock fixed during smoke-test.**  First pass used a plain
  `Lock` and the handler deadlocked because `_save_handled_set`
  tried to re-acquire it from inside the handler's `with` block.
  Switched to `threading.RLock` so read-modify-write stays atomic
  without nested-lock grief.

### Verification — feedback viewer

- Smoke-tested on port 18766 with three `POST /feedback`
  submissions (two without project, one with), then
  `GET /feedback`: 200 OK, 3 cards, newest first, correct
  category emoji, anonymous label on the no-name entry, snapshot
  fold-out only on the third.
- `POST /feedback/handled {"index":2,"handled":true}` → 200,
  `feedback-handled.json` contains `{"handled":[2]}`; re-fetching
  the viewer shows stats "1 handled, 2 open" and the card has
  the `handled` class.  Unchecking round-trips back to an empty
  list.  Malformed JSON and a negative index each produce a 400
  with a clear `error` field.
- `python3 -m py_compile tools/playground_server.py` clean.

---

## Editor polish — 2026-04-23 tile-selection defaults

Two small editor bug-fixes shipped in the same session as the
feedback viewer.

- **Backgrounds page now lands on tile 1, not tile 0.** Tile 0 is
  the transparent/background tile — defaulting the tileset
  selection to it meant every pupil had to click somewhere else
  before they could paint anything. `selectedTileIdx` now starts
  at 1. A small `restoreSelectedTile()` helper reads
  `state.metadata.lastSelectedTile` and clamps it to
  `[1, NUM_TILES-1]`, falling back to 1 for brand-new projects.
  Called from `init()` and `afterStateReplaced()`.  The current
  selection is written back into `state.metadata.lastSelectedTile`
  inside `scheduleSave()` and the `beforeunload` handler, so it
  round-trips per project — open a project, click tile 42, close
  the tab, reopen, tile 42 is still selected.

- **Sprites auto-assign no longer hands out the same tile twice.**
  `findFreeTileRun()` and `findNextEmptyTileSlot()` previously
  only treated a tile as "used" if its pixels were non-zero.
  That missed freshly auto-assigned cells — after
  `autoAssignFreeTileToCell()` set `cell.tile = N; cell.empty =
  false`, tile N's pixels were still all zero, so the next call
  happily returned N again.  Result: multiple cells pointing at
  the same blank tile, painting one secretly painted all of them.
  Fix is a new helper `_referencedTileIndices(s)` that walks every
  sprite's non-empty cells and collects the tile indices in use;
  `_tileIndexIsFree()` combines that with the pixel-zero check.
  Both callers now see truly-free tiles.  Works identically for
  per-cell auto-assign in `spApply`, for the resize handler's
  bulk `findFreeTileRun(newCells.length)`, and for
  `duplicateTileForCurrentCell()`.

### Verification — editor polish

- `node --check` clean on the extracted inline JS blocks of
  index.html and sprites.html.
- Manual trace: on the Backgrounds page with an empty project,
  `selectedTileIdx` starts at 1 (`init()` path); after clicking
  tile 7 and reloading, `state.metadata.lastSelectedTile === 7`
  and the selection restores.  On the Sprites page, resizing a
  sprite from 2×2 to 3×3 now claims four distinct consecutive
  tile indices; painting into one leaves the other three blank
  as expected.

---

## Builder — 2026-04-23 chunk 1 (end-to-end pipeline + Player module)

Plan: [builder-plan.md](builder-plan.md).
First slice of Phase A — the infrastructure and one working module
(Player 1), enough to prove the pipeline compiles end-to-end.

- **New page `🧱 Builder`** sits between Behaviour and Code in the
  page nav of every editor page.  Toolbar mirrors the other pages
  (File ▾ / Edit / Run groups, save-status dot, Play + ? in Run).
- **Three client-side JS modules, no Python changes:**
  - [tools/tile_editor_web/builder-assembler.js](tools/tile_editor_web/builder-assembler.js)
    — pure `assemble(state, templateText)` function with
    `replaceRegion()` (rewrites the body between `//>> id: … //<<`
    markers), `appendToSlot()` (for later insertion points),
    `stripSlotMarkers()`, and `findSpriteByRole()` helpers.
  - [tools/tile_editor_web/builder-modules.js](tools/tile_editor_web/builder-modules.js)
    — module catalogue keyed by dotted id (`game`, `players`,
    `players.player1`).  Each entry carries `label`, `description`,
    `defaultConfig`, a typed `schema`, and an optional
    `applyToTemplate(template, node, state)` pure function.
    Chunk 1 ships `game` (type picker — platformer only today,
    topdown disabled with a tooltip) and `players.player1`
    (startX, startY, walkSpeed, jumpHeight, maxHp).
  - [tools/tile_editor_web/builder-validators.js](tools/tile_editor_web/builder-validators.js)
    — an array of small `(state) -> problem | null` functions.
    Chunk 1 ships two: **no-player-role** (error, blocks Play) and
    **no-walk-animation** (warn only — game still runs without).
- **Template loaded via HTTP.**  [tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
  is a verbatim copy of `steps/Step_Playground/src/main.c` — the
  Builder page fetches it on init, runs it through the assembler
  on every state change, shows the result in the Preview pane.
  Keeping it verbatim for chunk 1 means the Builder's zero-tweak
  output is byte-compatible with what the Code page's stock
  template ships today.
- **Default-to-Builder redirect on `code.html`.** Per the teacher's
  answer to Q1 in builder-plan.md: if `state.customMainC` and
  `state.customMainAsm` are both empty, `code.html` does a
  `location.replace('builder.html')` at the top of its inline
  script — before CodeMirror initialises — so new pupils land on
  the Builder.  Pupils who already have custom C on file keep
  opening in the Code page.  The nav link from Builder → Code
  carries `?stay=1` to bypass the redirect, and the Code page
  honours that flag.
- **`migrateBuilderFields(s)`** added to both `index.html` and
  `sprites.html`'s existing migration chains.  Older projects
  gain a default `state.builder` tree on first load from any page,
  same idiom as `migrateBehaviourFields`.
- **Play wiring** on the Builder page mirrors sprites.html: assemble
  `main.c`, POST to `/play` with `customMainC` set, decode the
  returned `rom_b64`, play in the jsnes embed.  No `sceneSprites`
  yet (chunk 2 wires that up).

### Verification — Builder chunk 1

- `node --check` clean on all three new JS files and on the inline
  script of the four edited HTML pages.
- Programmatic smoke-test `/tmp/builder-smoketest.mjs` loads the
  three modules in a faux-window, asserts:
  - Validators fire correctly on a broken (no-player-sprite) state
    and go silent on a valid one.
  - `assemble()` substitutes all four region values (`walk_speed`,
    `jmp_up`, `px`, `py`) with a tweaked config.
  - The assembled `main.c` still contains `void main(void)` and
    `#include <nes.h>` (the scaffolding didn't get clipped).
  - `make -C steps/Step_Playground` accepts the assembled output
    via cc65 — build time 78 ms on the test machine.
- Manual: `GET /builder-templates/platformer.c` returns 200 and the
  expected 485-line template; `GET /builder.html`,
  `/builder-assembler.js`, `/builder-modules.js`,
  `/builder-validators.js` all 200.

### Deliberately out of chunk 1 — follow-up items

- **`enemies.walker`, `behaviour_walls`, `win_condition` modules**
  and the `topdown.c` template.  These are Phase A chunk 2; they
  add the first `//@ insert:` slots and the enemy-role
  scene-sprites wiring in the `/play` payload.
- **Preview syntax highlighting.**  Plain `<pre>` for now —
  promoting to CodeMirror is a one-line swap once chunk 2 proves
  the assembler output is worth reading.
- **"Eject to Code" one-way switch.**  Today a pupil can visit the
  Code page with `?stay=1` and hand-edit; the button + confirm
  dialog comes in Phase D.

### Chunk 1 hardening — 2026-04-23 same-day fixes

Three small follow-ups shipped the same day, driven by pupil
testing:

- **`Storage.loadCurrent is not a function`.**  `storage.js` exports
  `createTileEditorStorage(deps)` as a factory, not a singleton.
  My Builder page referenced `Storage` as if it were already
  instantiated, so init() threw on first load.  Fix: construct the
  instance the same way code.html does —
  `createTileEditorStorage({ migrateState: (s) => s, validateState: () => null })`
  at the top of the inline script.
- **Incomplete-state guard.**  When `Storage.loadCurrent()` returned
  null (no project yet), the Builder's fallback was
  `{ name: 'untitled', sprites: [] }` — missing `bg_tiles`,
  `sprite_tiles`, `backgrounds`.  Any later save clobbered the
  pupil's real project (which was still in storage but now
  overwritten), leaving sprites.html / behaviour.html's
  `validateState` rejecting the saved blob as *"not a correct
  project file"*.  Hardened by adding a `stateLooksComplete(s)`
  predicate: if it fails on load, the Builder renders a
  *"open the Sprites page first"* fallback and **refuses to save
  anything** until a complete state is present.  `scheduleSave()`
  now also checks the predicate and surfaces a red-banner error
  rather than silently writing over the project.
- **Load-from-disk guard.**  The "Open saved work" handler on the
  Builder now rejects JSON files that don't pass
  `stateLooksComplete(loaded)` — the pupil gets a clear message
  before the file overwrites the active project.

---

## Builder — 2026-04-23 chunk 2 (enemies, walls, win condition)

Fills out Phase A with the three remaining gameplay modules and
the `sceneSprites` wiring that places role-tagged sprites into the
scene automatically.

- **Three insertion slots** added to
  [builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c):
  `//@ insert: declarations` (module-scope variables, just before
  `void main()`), `//@ insert: init` (one-time startup code, right
  before the `while (1)`), and `//@ insert: per_frame` (per-frame
  game logic, after gravity + before `waitvsync`).  Marker lines
  are `//`-comments — cc65 treats them as plain comments, and
  `stripSlotMarkers()` removes them from the final output so the
  generated `main.c` is clean.
- **`enemies` + `enemies.walker` modules.**  Ticking Walkers emits
  a loop into `per_frame` that paces every `ROLE_ENEMY` sprite
  left/right at the chosen speed (1–4 px/frame), using a
  builder-local `bw_enemy_dir[16]` direction table.  The emitted
  code mirrors the existing [snippets/enemy-walker.c](snippets/enemy-walker.c)
  so anyone who knows the snippet library will recognise the
  pattern.  Variable names are `bw_*`-prefixed to avoid clashing
  with pupil code if they later eject to the Code page.
- **`behaviour_walls` info module.**  Explains (via its label and
  description) that the Behaviour page's painted tiles already
  drive player collision — so the pupil knows to paint walls
  without the Builder needing to inject any code.  A validator
  (severity: warn) fires if no solid-ground / wall / platform
  tiles are painted on the active background, with a "Fix on
  Behaviour page" button.
- **`win_condition` module.**  Enum config picks which behaviour
  type is the "winning" tile (Trigger by default; Door /
  Solid-ground / etc. as alternatives).  On collision, the
  emitted code flips a `bw_won` flag and zeros `walk_speed` /
  `climb_speed` — the player simply freezes in place, which is
  enough feedback for the MVP.  Proper "You win" text ships in
  Phase B.
- **`sceneSprites` auto-population** in the Builder's `/play`
  payload: every non-player sprite with a gameplay role (enemy,
  npc, pickup, powerup, item, tool, projectile, decoration) is
  placed at `x = 96 + stride`, `y = 120` — matching the default
  layout on sprites.html's Play dialog so muscle memory
  transfers.  Pupils who want fine control can still place
  manually on sprites.html; the Builder just picks sensible
  defaults so a ticked Walker module has something to drive.
- **Validators added** — `walker-no-enemies` (warn), `no-wall-tiles`
  (warn), `win-no-tiles` (error, blocks Play).  Each carries a
  one-sentence fix message and a jump button to the right page.

### Verification — chunk 2

- `node --check` clean on every edited JS file and on the
  extracted inline script of builder.html.
- `/tmp/builder-smoketest-2.mjs` exercises every new module and
  validator against a synthetic state, asserts that:
  - Empty behaviour map yields exactly `win-no-tiles:error +
    no-wall-tiles:warn + no-walk-animation:warn`.
  - Painting a solid-ground + trigger tile clears both errors.
  - Assembled output contains the walker loop, the win-condition
    block referencing `BEHAVIOUR_TRIGGER`, the `bw_won`
    declaration, and the kept `walk_speed` / `jmp_up` defaults.
  - Switching `win_condition.config.behaviourType` from `trigger`
    to `door` produces `BEHAVIOUR_DOOR` in the emitted code
    instead.
  - `make -C steps/Step_Playground` compiles the chunk-2 output
    via real cc65 — 26 ms on the test machine.

### Deliberately out of chunk 2 — Phase B candidates

- **`topdown.c` template** + the `topdown` option in the `game`
  module (currently disabled with a *"Coming in Phase B"*
  tooltip).
- **Pickups** — sprites that vanish on touch and increment a
  score counter.
- **Doors** — scene transitions tied to door tiles + multi-background
  switching.
- **HUD** — hearts (HP) and score drawn at the top of the screen.
- **Player 2** — pad-2 routed through a second player module.
- **Damage / HP** — the `maxHp` and `damagesPlayer` fields are
  already in state shape; they just aren't wired to code yet.
- **Proper "You win" text** — requires a tile-based text helper
  with a font-tile seed, bigger lift than the MVP.
- **"Eject to Code" confirm dialog** — Phase D polish.

### Chunk 2 polish — 2026-04-23 win feedback + jump freeze

Two follow-ups after first pupil test of chunk 2:

- **No visible feedback on winning.**  The original win block
  only zeroed `walk_speed` / `climb_speed`; the player stopped
  moving but the pupil had no clear signal that the game had
  ended.  Fix: when `bw_won` flips, the emitted code now writes
  `PPU_MASK = 0x1F | 0x20` — greyscale (bit 0) + red emphasis
  (bit 5).  The whole scene desaturates and tints pale red, a
  classic NES "level complete" look that works without any
  specific tiles or palette entries being painted.
- **Player could still jump after winning.**  `walk_speed = 0`
  blocks horizontal movement but the jump path uses its own
  `jmp_up = 20` seed and an edge-triggered `pad & 0x08` check.
  Fix: when `bw_won` is set, the emitted code now also zeros
  `jumping` + `jmp_up` (cancels any in-progress ascent) and
  pins `prev_pad = 0xFF` so the edge detector stops firing on
  fresh UP presses.

The `win_condition` module description on the Builder page
updated to match: *"freezes in place and the screen tints red"*.
Smoke-test grew two assertions to guard both behaviours.

---

## Builder — 2026-04-23 Phase B chunk 1 (chaser, pickups, collect-to-win)

First slice of Phase B from [builder-plan.md](builder-plan.md):
adds enemy variety + a pickup-collection mechanic + a new win type
that composes with it.  No template changes — every addition rides
the `//@ insert:` slots added in chunk 2.

- **`enemies.chaser` module** (disabled by default).  Ticking it
  emits a per-frame loop that nudges every `ROLE_ENEMY` sprite one
  pixel at a time (configurable 1–3 px/frame) toward the player's
  `(px, py)`.  Same pattern as [snippets/enemy-chaser.c](snippets/enemy-chaser.c).
- **`pickups` module** (disabled by default).  Sprites tagged
  `ROLE_PICKUP` on the Sprites page disappear when the player
  touches them (AABB overlap in the emitted code); a `bw_pickup_count`
  counter ticks up, and `bw_pickup_total` is set once in the
  `init` slot by counting every pickup-roled sprite.  Collected
  pickups are hidden by writing `ss_y[i] = 0xFF` — the NES
  "off-screen" sentinel — so no OAM entry is wasted on them.
- **Extended `win_condition`.**  New `type` enum with two values:
  `reach_tile` (the chunk-2 behaviour, unchanged) and
  `all_pickups_collected` (win when `bw_pickup_count ≥
  bw_pickup_total`).  The emitted code branches on `type`, so the
  reach-tile `BEHAVIOUR_*` check simply isn't compiled when
  collect-every-pickup is selected — no dead code in the output.
- **Three new validators:**
  - `walker-and-chaser` (error) — fires when both enemy movement
    modules are ticked, because their per-frame loops both
    rewrite `ss_x[]` and the enemies wobble in place.
  - `all-pickups-needs-pickups` (error) — blocks Play if the win
    type is "collect every pickup" but the Pickups module is off
    (the emitted code would reference undeclared
    `bw_pickup_total`).
  - `all-pickups-no-sprites` (error) — same win type but no
    sprite is tagged `ROLE_PICKUP`: the game can never end.

### Verification — Phase B chunk 1

`/tmp/builder-smoketest-3.mjs` runs seven assertions:

1. Walker + Chaser both on → `walker-and-chaser` error fires.
2. Walker off, Chaser on → error clears; chaser code emitted,
   walker code omitted.
3. `all_pickups_collected` with pickups module off →
   `all-pickups-needs-pickups` error.
4. `all_pickups_collected` with pickups on and two role=pickup
   sprites → no errors; output contains the declarations, init
   loop, collect AABB, and `bw_pickup_count >= bw_pickup_total`
   win check; crucially, `BEHAVIOUR_TRIGGER` does *not* leak
   into this branch.
5. cc65 compiles the pickups + all_pickups output in 37 ms.
6. `all_pickups_collected` with pickups on but zero pickup
   sprites tagged → `all-pickups-no-sprites` error.
7. Default-state output (walker + reach_tile + trigger painted)
   still compiles unchanged — belt-and-braces regression check
   for chunk 2 callers.

### Deliberately out of this chunk — further Phase B candidates

- **HUD** (player.hud) — hearts / score drawn on screen.  Needs
  font tiles or pupil-art digit tiles; tractable but non-trivial.
- **Player 2** — flagged as Phase B in teacher Q4.  Pad-2 routing
  on cc65 is straightforward; scope is the UI for configuring a
  second player module + its own start position / controls.
- **Doors** — multi-background scene transitions on door-tile
  overlap.  Depends on the scroll / multi-screen work.
- **HP + damage** — wire `players.player1.config.maxHp` and
  `enemies.*.config.damagesPlayer` to actual hearts + knockback
  behaviour.  Needs HUD landed first.
- **Sound** — waits on the FamiStudio audio roadmap.

---

## Builder — 2026-04-23 Phase B chunk 2 (Scene editor)

Directly answers the pupil asks: *"select which enemies are walkers
and which are chasers, where to place them, and use the same sprite
more than once"*.  Introduces a proper scene-editor layer so each
game object is a **placed instance** referencing a sprite
definition, instead of the role-wide auto-placement of Phase A.

- **`scene` module + `instances[]` data model.**  New entry in
  `state.builder.modules.scene.config.instances` — each
  `{ id, spriteIdx, x, y, ai }`.  The same `spriteIdx` is allowed
  to appear any number of times, so a pupil who drew one
  *"goomba"* can drop three of them on the level.  `ai` ∈
  `static | walker | chaser`; the UI greys out walker/chaser for
  non-enemy roles automatically.
- **Custom-rendered UI.**  Modules can opt into a `customRender`
  flag that the builder.html tree renderer recognises.  The Scene
  module uses it to build a dynamic list with a sprite dropdown,
  role badge, x/y number inputs (constrained 0–240 / 16–216 with
  step 4), AI dropdown (role-aware), and a delete button per row.
  **+ Add instance** defaults new rows to the first non-player
  sprite, placed to the right of existing instances so they do
  not stack.
- **Walker / Chaser modules stand down gracefully.**  Both
  `enemies.walker` and `enemies.chaser` check
  `sceneHasInstances(state)` in their `applyToTemplate` and
  return the template unchanged when any instance is defined —
  so the role-wide loops never fight the per-instance AI.  The
  Scene summary line on the page makes this explicit:
  *"Walker / Chaser modules above are ignored while this list is
  in use."*
- **Assembler: per-instance AI emission.**  When instances are
  present, the Scene module emits one tailored block per
  instance.  Walkers get their own `bw_dir_<i>` static direction
  variable (so each walker flips independently); chasers get an
  inline nudge-toward-player block targeting `ss_x[i]` / `ss_y[i]`
  directly.  Static instances emit no AI.
- **Play payload: `sceneSprites` now derived from instances.**
  When the scene has entries, `sceneSprites` maps 1:1 to the
  list (keeping index order so `ss_x[i]` references stay
  correct).  When the list is empty, the previous auto-placement
  pipeline kicks in — zero regression for existing projects.
- **Two new validators:**
  - `scene-invalid-sprite` (error) — an instance references a
    `spriteIdx` that no longer exists (pupil deleted the sprite
    on the Sprites page).  Build would break; Play is blocked
    until the row is removed or the sprite recreated.
  - `scene-off-screen` (warn) — an instance's x/y is outside
    0-240 / 16-216.  The sprite will not be visible but the
    build is fine; surfaced as a warning so the pupil notices.
- **Assembler MODULE_ORDER** reshuffled to
  `game → players → scene → enemies → behaviour_walls → pickups
  → doors → events → win_condition` so Scene's per-instance
  blocks land in `per_frame` before the role-wide blocks would
  (the latter are no-ops once Scene is active, but the ordering
  keeps the output readable).

### Verification — Phase B chunk 2

`/tmp/builder-smoketest-4.mjs` covers six scenarios, all pass:

1. Empty scene → walker role loop still emitted (backward
   compatibility for projects that never touch the Scene list).
2. Single walker instance → walker role loop silenced, per-
   instance block emitted with `ss_x[0] += 1`.
3. Two instances of the *same* spriteIdx with different AI →
   `bw_dir_0` for the walker at ss_x[0], direct chaser nudge on
   ss_x[1] / ss_y[1].  cc65 compiles the result in 38 ms.
4. Static instance of an enemy → no `bw_dir_*` and no `ss_x[i]
   +=` emission.
5. Invalid spriteIdx → `scene-invalid-sprite` (error) fires.
6. Off-screen position → `scene-off-screen` (warn) fires.

### Deliberately out of chunk 2 — next chunks

- **Visual scene preview / click-to-place.**  A small canvas in
  the right-hand column that draws placed instances would make
  positioning much faster than number inputs.  Tractable
  follow-up once the data model has proven itself.
- **Animation role tagging** (pupil ask).  Currently
  `state.animation_assignments` only knows about the *player's*
  walk / jump.  Next chunk will add a `role` + `style` tag to
  each animation and let the Scene assembler pick the right
  animation for each enemy instance.
- **Player 2** — still Phase B; benefits from having scene
  instances as its second player has the same "per-placement"
  character as enemies.
- **Per-instance speed / HP** — the data model has room for
  `ai_speed`, `maxHp`, etc.; surfacing them in the UI is a
  small follow-up once we know which knobs pupils actually
  reach for.

---

## Builder — 2026-04-23 Phase B chunk 3 (animation role/style tagging)

Answers the pupil ask *"it is probably worth being able to tag the
animations as 'player' 'enemy' 'pickup' etc."* — introduces a
metadata layer so animations describe themselves, auto-wiring the
player's walk / jump along the way.

- **New fields on each animation:** `role` ∈ `player | enemy | npc
  | pickup | any`, `style` ∈ `walk | jump | idle | die | attack |
  custom`.  Defaults are `player` + `custom` for brand-new
  animations, so existing pupils see the tags appear without any
  content changing.
- **Two dropdowns on the Sprites page animation editor** — *Used
  by* and *Style*.  Next to them, the muted hint *"Tag once, wired
  automatically."*  Each animation's list entry also shows its tag
  inline (e.g. *"3 frames · 8 fps · Player/Walk"*) when the tag is
  specific enough to be interesting.
- **Auto-derivation.**  `state.animation_assignments.walk` and
  `.jump` are kept in sync with tagged player animations
  automatically.  Tag an animation as Player + Walk and the Walk
  assignment dropdown below updates without a second click.  The
  Walk / Jump dropdowns are still present — pupils who want
  explicit override still can — and each entry shows a *"✓
  (tagged)"* marker next to animations whose tag already matches.
- **Migration is two-way.**  Old saves with a non-null
  `animation_assignments.walk` but no tags get their walk-assigned
  animation tagged `player + walk` (same for jump); new tags
  without explicit assignments populate the assignments.  Existing
  projects round-trip unchanged.  Invalid `role` / `style` values
  (from hand-edited JSON or future tag values) are clamped to the
  defaults during migration.
- **Constants exported:** `ANIM_ROLES`, `ANIM_STYLES`,
  `ANIM_ROLE_LABELS`, `ANIM_STYLE_LABELS` at the top of sprites.html
  next to the existing `ROLE_*` tables — single source of truth
  for both the UI dropdowns and the migration validator.

### Verification — Phase B chunk 3

`/tmp/builder-smoketest-5.mjs` runs seven assertions, all pass:

1. `sprites.html` still contains the tagging constants and the
   key migration snippets (guard against accidental drift).
2. Default animation gets `role=player, style=custom`.
3. Legacy `animation_assignments.walk = 5` back-tags animation 5
   as `player + walk`.
4. A pre-tagged `player + jump` animation auto-populates
   `animation_assignments.jump`.
5. `enemy + walk` does *not* claim the player's walk slot.
6. Both walk + jump auto-derive simultaneously when both tags
   exist.
7. Invalid tag values clamp to defaults (`role=pirate` →
   `player`, `style=moonwalk` → `custom`).
8. Real cc65 builds the resulting `main.c` in 35 ms — no
   regression for existing pipelines.

### Deliberately out of chunk 3 — next chunks

- **Runtime playback of tagged animations on scene sprites.**
  Enemies currently use their static `ss_tiles[]` layout.  Wiring
  a per-instance animation frame cycle needs the server's
  `build_scene_inc` to emit per-role animation tables and the
  platformer template to add per-instance animation state.  Next
  chunk.
- **Player 2** — teacher Q4.  Benefits from the scene-instances
  foundation; will likely reuse the same per-instance renderer
  as enemies.
- **HUD, doors, HP/damage** — still in the Phase B backlog.

---

## Builder — 2026-04-23 Phase B chunk 4 (Scene preview canvas)

Chunk 3's tags were metadata; this chunk is about placement UX.
Pupils now get a visual preview above the instance list, with
click-to-add and drag-to-move — answering the *"where to place
them"* ask from the Phase B scene-editor feedback.

- **New shared module `tools/tile_editor_web/sprite-render.js`.**
  Exposes `window.NesRender` with the NES palette table, palette
  helpers (`spritePaletteFor`, `bgPaletteFor`, `pixelRgb`), and
  `drawSpriteIntoCtx(ctx, sprite, state, destW, destH)`.  Lifted
  out of sprites.html's ~30-call-site internal helpers so the
  Builder page can paint sprites without a copy-paste.  sprites.html
  continues to work unchanged — it has its own versions of the
  same helpers that stay in place; a future chunk will swap them
  to call `NesRender.*` and delete the duplicates.
- **Preview canvas in the Scene module.**  512×480 css canvas
  (256×240 NES pixels at 2×), renders:
  - A faint 16-pixel grid so pupils can eyeball tile coordinates.
  - The Player 1 sprite at its start position, outlined in the
    editor accent colour so it's unmistakable.
  - Every scene instance, drawn via `NesRender.drawSpriteIntoCtx`
    at its logical (x, y) and outlined in a role-specific colour
    (enemies pink, npcs cyan, pickups green, projectiles orange,
    other grey).
- **Mouse events.**  Click an empty area → adds a new instance at
  the cursor using the first available non-player sprite (same
  defaults as the "+ Add instance" button).  Mouse-over an
  instance switches the cursor to `grab`; mousedown + drag moves
  it in 1-px NES steps, clamped so the sprite stays on screen
  (x ∈ [0, 255-w], y ∈ [16, 232-h]).  Release saves the final
  position and re-renders the instance rows so the x/y inputs
  update.  No artificial debouncing — the Storage layer's
  existing scheduleSave already throttles localStorage writes.
- **Role-coloured outlines** pair with the role badge on each
  instance row, so clicking an outlined sprite on the canvas and
  finding its row in the list below is one eye-track away.
- **CSS.**  The canvas is responsive (max-width: 512px, height
  auto) with `image-rendering: pixelated` so the NES-size pixels
  stay crisp, and `cursor: crosshair` by default to hint that
  clicking is meaningful.

### Verification — Phase B chunk 4

- `node --check` clean on sprite-render.js and on the extracted
  inline script of builder.html.
- `/tmp/builder-preview-smoke.mjs` runs three checks:
  1. `NesRender` loads headlessly (no DOM required) and exposes
     the expected API surface.
  2. Default-state Builder output still compiles through real
     cc65 in ~70 ms (no regression from the preview additions).
  3. A scene with two instances pointing at the *same* sprite
     (`spriteIdx: 1` twice) compiles cleanly — guards the "use
     the same sprite more than once" promise.
- Manual: preview canvas renders correctly in the browser,
  click adds an instance, drag moves it, both the canvas and
  the x/y inputs below stay in sync.

### Deliberately out of chunk 4 — continuing chunks

- **Runtime playback of tagged animations on scene sprites.**
  Still deferred — enemies currently render their static
  sprite layout.  Next candidate for a bigger chunk because it
  touches `playground_server.py`.
- **Background-nametable rendering inside the preview.**  Only
  the grid is drawn today; showing the pupil's painted background
  tiles would require a nametable-to-canvas renderer (CHR +
  palette + attribute-table lookups).  Clean follow-up; not
  blocking for placement UX.
- **sprites.html migration.**  The duplicate helpers on
  sprites.html work fine; swapping its internal calls to
  `NesRender.*` is a low-risk cleanup for a later session.
- **Multi-select / copy-paste of instances, undo on the canvas.**
  Not needed for chunk 4's placement core; easy additions once
  pupil feedback arrives.

### Chunk 4 polish — 2026-04-23 background + player drag + legacy hide

Three pupil-driven follow-ups shipped the same day:

- **Background now renders behind the instances.**  The preview
  canvas reads the active background's nametable (32×30 cells
  each carrying `{tile, palette}`) and paints each cell's 8×8
  tile using `NesRender.bgPaletteFor(state, cell.palette)`.  The
  universal BG colour is filled first so transparent pixels show
  the correct backdrop.  The faint tile grid still overlays on
  top for coordinate eyeballing.  Multi-screen worlds render
  only the first screen in the placement view — scene sprites
  live on screen 1 anyway, and a pan-across preview is a bigger
  feature for a later chunk.
- **Player 1 is now draggable.**  The hit-test grew a
  `playerDragHandle()` that exposes the player's start
  position via getters/setters on `players.player1.config.startX/Y`
  — so the drag code treats the player exactly like a scene
  instance.  Scene instances still win when they overlap the
  player handle so pupils can pick up an instance on top of the
  start marker.  Releasing a player drag re-renders the module
  tree so the Player 1 number inputs update to the new
  position (scene-instance drags only refresh their own row,
  which is cheaper).
- **Enemies module hidden.**  The Scene module now supersedes
  it — per-instance AI strictly expresses everything the global
  Walker / Chaser switch did.  Added a `hidden: true` flag to
  the Enemies module definition plus support for it in
  `renderTree()` / `renderModule()`.  Legacy projects with
  `enemies.walker.enabled` and an empty Scene list still get
  their walker code emitted (the applyToTemplate is unchanged,
  just un-rendered).  Scene's description updated to mention
  dragging the player too.

---

## Builder — 2026-04-24 Phase B chunk 5 (Player 2)

First chunk to touch all three layers — client, template, server —
since chunk 1 of Phase A.  Plan lives in
[builder-plan-player2.md](builder-plan-player2.md); implementation
followed the ten-step order in §7 of that plan.

- **Server (`playground_server.py`).**  `build_scene_inc` gained
  three optional kwargs (`player_idx2`, `start_x2`, `start_y2`).
  When `playerSpriteIdx2` is a valid index in the /play payload
  the server emits `#define PLAYER2_ENABLED 1` plus
  `PLAYER2_W / H / X / Y` and the `player2_tiles[]` /
  `player2_attrs[]` arrays drawn from the second Player-tagged
  sprite.  When P2 is off, it still emits `#define PLAYER2_ENABLED
  0` so the template's `#if` gates evaluate cleanly without relying
  on the undefined-macro-is-zero convention.
- **Template (`builder-templates/platformer.c`).**  Everything new
  is behind `#if PLAYER2_ENABLED` so a P1-only ROM compiles
  byte-for-byte the same as before (verified by sha1sum).  Adds:
  - `JOYPAD2` define + `read_both_controllers()` helper that
    latches once and shifts both pads in parallel.
  - Module-scope P2 state (`px2`, `py2`, `pad2`, `prev_pad2`,
    `jumping2`, `jmp_up2`, `plrdir2`, `walk_speed2`) with a
    `//>> player2_walk_speed` region.
  - P2 init inside `main()` (behind a `//>> player2_start`
    region so guided-mode pupils can override), plus a jump-height
    region `//>> player2_jump_height` inside the jump branch.
  - P2 movement block mirroring P1's walk + jump + gravity with
    wall / platform detection.  Deliberate MVP omissions
    (documented in the plan): no ladder support, no ceiling-bonk
    on jump.
  - P2 render loop after P1's OAM writes, using `player2_tiles` /
    `player2_attrs` from scene.inc.  No animation cycling for P2
    in this chunk; P2 uses its static layout.
- **Builder client.**
  - New `modules['players.player2']` submodule with the same
    schema as P1 (startX/Y, walkSpeed, jumpHeight, maxHp).
    `applyToTemplate` replaces the two new `//>>` regions with
    typed values; start position flows through scene.inc as
    `PLAYER2_X/Y` instead.
  - `BuilderDefaults()` seeds P2 disabled; non-destructive
    back-fill in `migrateBuilderFields` on both sprites.html and
    index.html adds the P2 submodule to older saves without
    touching any existing fields.
  - `builder-assembler.js` gains `findSpritesByRole(state, role)`
    (returns every index) alongside `findSpriteByRole` so the
    second player is the second element of the player list.
  - `pickups.applyToTemplate` now emits an `#if PLAYER2_ENABLED`
    block alongside its P1 AABB collision check so either player
    can collect pickups.
  - `win_condition.applyToTemplate` extends the reach-tile branch
    with a second player check and zeros P2's movement state in
    the freeze block when the screen tints red.  All-pickups win
    type already works for both players because the counter itself
    is shared.
- **Validator `player2-needs-second-sprite`** (error) fires when
  Player 2 is enabled but fewer than two sprites are tagged Player.
  Blocks Play until the pupil either tags a second Player sprite
  or turns P2 off.
- **Preview canvas.**  `playerDragHandle()` became
  `playerDragHandles()` — an array holding one handle per enabled
  player.  Each handle carries a `kind` tag (`player1` / `player2`)
  so the drag code still knows who to save back to.  P1 outlined
  accent-yellow; P2 outlined cyan so pupils can tell them apart.
  Both are draggable, both respect the screen-bounds clamp.
- **Play payload.**  When `p2.enabled && playerIdxs[1]` exists,
  the Builder sends `playerSpriteIdx2` + `playerStart2` in the
  /play POST.  Otherwise neither field is included and the ROM
  builds as single-player.

### Verification — Phase B chunk 5

`/tmp/builder-player2-smoke.mjs` spawns a throwaway Playground
Server on port 18768 and runs five assertions:

1. Default (P2 off, one player sprite) has no errors.
2. P2 enabled + only one Player sprite → `player2-needs-second-sprite`
   error fires at `severity: error`.
3. P2 enabled + two Player sprites → output contains the expected
   template markers (walk_speed2 = 2, jmp_up2 = 25, init block,
   P2 render loop, dual-player pickup branch, dual-player win
   check `bw_tl2`).
4. P1-only `/play` build compiles via real cc65 (49168 bytes, 44 ms).
5. P2-enabled `/play` build compiles via real cc65 (49168 bytes,
   51 ms).  Same ROM size as P1-only because the template's
   `#if PLAYER2_ENABLED` gates kick in at preprocess time — the
   P1-only path elides every P2 byte.

Also manually verified that swapping the updated template into
Step_Playground's `main.c` and building with P2 undefined
produces a ROM with an identical sha1sum to the pre-chunk-5
baseline — no silent regression for projects that never enable
P2.

### Deliberately out of chunk 5

- **Per-player animations.**  P2 draws static tiles only; cycling
  `walk` frames for P2 needs either shared-with-P1 (wrong art
  when P2 is a different sprite) or per-player anim tables (a
  bigger server-side change).  Deferred.
- **Ladder + ceiling-bonk for P2.**  Adds ~25 lines of gated
  code mirroring P1; not needed for a "two-player platformer"
  feel.  Easy follow-up.
- **HP / damage.**  P2's `maxHp` field is in state for forward
  compatibility but unwired.
- **Camera follow when scrolling.**  In `SCROLL_BUILD` the camera
  tracks P1 only; P2 scrolls off-screen when far apart.  A
  "midpoint camera" + soft zoom is a neat future chunk once
  scrolling lands for real levels.
- **Player-vs-player collision.**  Not implemented.  The two
  characters pass through each other for now.

### Chunk 5 polish — 2026-04-24 same-day fixes

Three follow-ups from the first pupil test after Player 2 shipped:

- **Player drag regression — fixed.**  When chunk 5 renamed the
  player handle's `kind` from `'player'` to `'player1'` /
  `'player2'`, `draggableSprite()` was left checking the old
  string.  That silently returned null for both player handles so
  drags on the preview did nothing — the release update ran but
  with a stale sprite reference, leaving the marker where it
  started.  Fix is one line: match the two new kinds.
- **Player 2 keyboard map on the browser emulator.**  The jsnes
  embed was only wiring pad 1.  The `map()` helper now returns
  `{pad, button}` pairs so the switch table can target either
  controller.  Layout picked for zero-conflict with Player 1:
  - **P1** keeps Arrow keys + `F` = A + `D` = B + `Enter` = Start + `Right Shift` = Select.
  - **P2** uses `I` / `J` / `K` / `L` for D-pad, `O` = A, `U` = B, `1` = Start, `2` = Select.
  The IJKL cluster is the classic NES emulator "player 2" layout,
  and none of P2's keys collide with P1's.
- **Controls surfaced to pupils in two places.**  The
  `emu-status` strip under the emulator canvas was a single
  one-line hint; it now renders both players' keys with
  `<kbd>`-styled chips and a CSS rule (`body.emu-single-player
  #emu-p2-controls { display: none; }`) that hides the P2 line
  when the current ROM didn't wire P2 in, so the hint never
  advertises keys that do nothing.  The Help dialog (`?` button)
  grew an **Emulator controls** section with a proper two-row
  table — D-pad / A / B / Start / Select columns — so pupils can
  look up the mapping without launching a game.  A footnote
  reminds pupils that P2 keys only activate when the module is
  ticked and a second Player sprite exists.

### Verification — chunk 5 polish

- `node --check` clean on the extracted inline JS of builder.html.
- Same `/tmp/builder-player2-smoke.mjs` from chunk 5 still passes
  all five assertions — both P1-only (49168 bytes, 45 ms) and
  P2-enabled (49168 bytes, 44 ms) builds compile cleanly via
  real cc65.  The polish was pure UI/drag-handler and didn't
  touch the assembler or template paths.
- Inline-style lint warnings caught by the IDE on the help
  dialog's new bits were moved into the existing inline `<style>`
  block (`.help-controls-heading`, `.help-controls-lead`,
  `.controls-table`, `.help-controls-foot` + `kbd` chip
  styling) so the page is clean of additions on the
  project-wide-inline-style warning list.

---

## Builder — 2026-04-24 Phase B finale chunk A (HP, damage, HUD)

First of four chunks planned in
[builder-plan-phase-b-finale.md](builder-plan-phase-b-finale.md).
Enemies become threats; a visible heart counter shows the
consequences.  The mechanics are on-by-opt-in so pre-chunk-A
projects compile byte-for-byte unchanged (verified by sha1sum
against the baseline ROM).

- **New role `ROLE_HUD = 10`** on the Sprites page's role
  dropdown + in `ROLE_CODES` on the server.  First sprite tagged
  HUD becomes the heart icon the HUD render loop paints N times
  across the top of the screen (one per remaining HP).
- **Server emits HUD glyphs** when a sprite has role=hud:
  `#define HUD_ENABLED 1` + `HUD_W` / `HUD_H` + `hud_tiles[]` /
  `hud_attrs[]`.  Otherwise `HUD_ENABLED 0` stub so the
  template's gate compiles cleanly.
- **Template additions** (all behind `#if PLAYER_HP_ENABLED` /
  `#if HUD_ENABLED`):
  - Three new globals: `player_hp`, `player_iframes`,
    `player_dead` (HP count, invincibility timer, game-over
    latch).
  - HP init in `main()`: `player_hp = PLAYER_MAX_HP`.
  - HUD render loop inside the OAM write block — one copy of
    the hud sprite per HP, stepping right from (8, 8).
  - The declarations slot moved to *before* the first `#if`
    block so `#define PLAYER_HP_ENABLED 1` reaches the
    preprocessor in time — an ordering bug caught by the
    smoke-test and fixed in the same commit.
- **Builder modules:**
  - `damage` (new, off by default) — fields: damage amount
    (1–9), invincibility frames (0–120).  `applyToTemplate`
    emits `#define DAMAGE_AMOUNT` / `#define INVINCIBILITY_FRAMES`
    into the declarations slot plus an AABB enemy-vs-player
    collision loop into per_frame; a hit decrements `player_hp` by
    `DAMAGE_AMOUNT` and starts the iframes timer; HP == 0 → `player_dead = 1`; `if (player_dead)`
    freeze block zeros walk/climb/jump and tints the screen
    greyscale + blue (`PPU_MASK = 0x1F | 0x80`).  Blue = defeated,
    paired with win_condition's red = victory, for a consistent
    visual vocabulary.
  - `hud` (new, off by default) — UI-only, no
    applyToTemplate; the template's `#if HUD_ENABLED` gate
    fires as soon as a HUD-tagged sprite exists and the module
    is ticked.
  - `players.player1.maxHp` — schema unlocked from readOnly
    (was 0..0) to a regular 0–9 integer.  The player module's
    `applyToTemplate` appends `#define PLAYER_HP_ENABLED 1` +
    `#define PLAYER_MAX_HP <n>` only when maxHp > 0 AND the
    damage module is enabled, keeping the preprocessor gate
    conservative.
- **Three new validators:**
  - `hp-zero-with-damage` (error) — damage on but maxHp = 0.
    Blocks Play; message *"Raise Player 1 → Max HP above 0, or
    turn Damage off."*
  - `damage-no-enemies` (warn) — damage on but no sprite is
    tagged Enemy.  Game builds; nothing to collide with.
  - `hud-no-sprite` (warn) — HUD on but no sprite is tagged
    HUD.  Game builds; hearts silently won't render.
- **Migration is non-destructive**: `migrateBuilderFields` on
  both sprites.html and index.html back-fills `damage` and
  `hud` modules (disabled, default config) onto existing saves
  without touching pupil state.

### Verification — chunk A

`/tmp/builder-chunk-a-smoke.mjs` runs eight assertions, all pass:

1. `hp-zero-with-damage` error fires on damage-without-HP state.
2. `damage-no-enemies` warn fires on damage-on / no-enemy-sprite.
3. `hud-no-sprite` warn fires on HUD-on / no-HUD-sprite.
4. Default state does not leak `#define PLAYER_HP_ENABLED 1`.
5. Damage + maxHp=3 state emits every expected macro +
   collision loop + blue-tint freeze block.
6. `/play` default build compiles via real cc65 (49168 bytes,
   46 ms).
7. `/play` damage build compiles (49168 bytes, 45 ms).
8. `/play` damage + HUD + hud-tagged-sprite build compiles
   (49168 bytes, 44 ms).

Manual: sha1sum of the stock Step_Playground ROM is unchanged
when platformer.c is swapped in with no Builder modules ticked.

### What's next — chunks B, C, D

- **Chunk B — runtime animations on scene sprites.**  Tagged
  walk/idle animations actually cycle frames on enemies /
  pickups.  Touches `playground_server.py` for per-role
  animation tables.
- **Chunk C — doors & scene transitions MVP.**  Tile-based
  doors; walking onto a DOOR tile swaps to a target background.
  Needs multi-nametable emission from the server.
- **Chunk D — polish.**  Eject-to-Code button, per-module
  detailed help popover, sprite-preview picker in the scene
  instance dropdown.

All three are planned in detail in
[builder-plan-phase-b-finale.md](builder-plan-phase-b-finale.md).

---

## Builder — 2026-04-24 Phase B finale chunk B (runtime animations)

Second of four chunks.  The `role + style` animation tags we
shipped in Phase B chunk 3 finally drive visible frames on scene
sprites — enemies walking, cycling through their tagged animation.

- **MVP scope:** `enemy + walk` only.  Other `(role, style)`
  pairs (`enemy + idle`, `pickup + idle`, `npc + walk/idle`) are a
  follow-up micro-chunk; scope here kept narrow to limit the
  template / server surface change.
- **New server helper `_resolve_tagged_animation(state, role, style)`**
  finds the first animation tagged that way, drops frames whose
  size mismatches the first frame, and returns `(frames, fps, w, h)`.
  Sibling to the existing `_resolve_animation` used by the player's
  walk/jump.
- **Server emits** `#define ANIM_ENEMY_WALK_COUNT/TICKS/W/H` plus
  `anim_enemy_walk_tiles[]` / `anim_enemy_walk_attrs[]` when a
  matching tagged animation exists; stub `COUNT 0` otherwise so
  the template's `#if` gate compiles cleanly.  Also emits two new
  mutable arrays per scene instance — `ss_anim_frame[N]` and
  `ss_anim_tick[N]`, both zero-initialised.
- **Template changes** (all `#if ANIM_ENEMY_WALK_COUNT`-gated):
  - A per-frame tick advancer that walks every scene sprite,
    picks up enemies whose size matches the animation's, and
    advances `ss_anim_tick[i]` → wraps `ss_anim_frame[i]` when
    it hits `ANIM_ENEMY_WALK_TICKS`.
  - The static-sprite render loop is duplicated behind
    `#if ANIM_ENEMY_WALK_COUNT > 0` / `#else` so the animation
    variant can swing a `src_tiles` / `src_attrs` pointer between
    `ss_tiles[off]` (static) and `anim_enemy_walk_tiles[frame*W*H]`
    (animated) per instance.  The `#else` branch is a character-
    for-character copy of the pre-chunk-B loop so a ROM with no
    tagged animation compiles byte-identical to today's
    baseline (verified by sha1sum round-trip against
    Step_Playground's own `main.c`).
- **Validator `enemy-walk-anim-size-mismatch` (warn)** fires when
  an enemy+walk animation exists but no sprite tagged Enemy
  shares its W×H.  Animation silently fails the template's size
  check today; the validator tells the pupil why the frames
  aren't playing.

### Verification — chunk B

`/tmp/builder-chunk-b-smoke.mjs` runs three assertions, all pass:

1. `enemy-walk-anim-size-mismatch` warn fires on 2×2 enemy
   sprite + 3×3 walk animation frames.
2. No-animation `/play` build compiles via real cc65 (49168
   bytes, 42 ms) — byte-identical pipeline to pre-chunk-B.
3. `enemy + walk` tagged animation + two enemy instances → ROM
   compiles (49168 bytes, 42 ms) and scene.inc includes
   `ANIM_ENEMY_WALK_COUNT 3` + the frame tables.

Manual: Step_Playground's stock `main.c` replaced by the updated
`platformer.c` (no tagged animation in its state) compiles to
sha1sum `c77d502b7439`, identical to the baseline — no
regression.

### Deferred from chunk B (follow-up micro-chunks)

- **Other (role, style) pairs:** `enemy + idle` for static enemies,
  `pickup + idle` for bouncing collectibles, `npc + walk` /
  `npc + idle`.  Same emission pattern; just more symbols.
- **Direction-aware animation:** left-facing enemies could cycle
  a `walk_left` vs `walk_right` table.  Today the existing
  attr XOR with `plrdir` handles flip-H for static sprites;
  animated enemies don't know about direction yet.
- **Per-instance animation override** — pick one animation per
  scene instance rather than "first tagged wins".  Needs the
  Scene editor's instance row to grow a small animation picker.

---

## Builder — 2026-04-24 Phase B finale chunk C (teleport doors)

Third chunk of the Phase-B-finale plan, shipped at a narrowed
scope from the original multi-background vision.  The full
"walk from Room A into Room B" vision needs `build_nam()` to
emit multiple nametables + `graphics.s` to be parameterised +
runtime PPU-register swaps — a ~500-line delta that deserves
its own chunk.  The MVP here ships the tile-event half of
doors: **stepping on a DOOR tile teleports the player to a
configured spawn point in the same background.**

Still valuable for pupils: secret passages, "fall off the map
→ respawn at start", portal loops.  Teaches the tile-based
event pattern that the multi-background story will build on.

- **New `doors` module** with `spawnX` / `spawnY` config.
  `applyToTemplate` emits a per-frame block that reads
  `BEHAVIOUR_DOOR` at the player's centre tile; on match the
  player is teleported to `(spawnX, spawnY)` and any in-progress
  jump is cancelled.  Player 2 gets the same check in an
  `#if PLAYER2_ENABLED` block so either player can step through.
- **New validator `doors-no-door-tiles` (error)** — module on
  but no DOOR behaviour tile painted → teleport can never
  trigger; Play is blocked until the pupil paints a door or
  ticks the module off.
- **Migration:** non-destructive back-fill in
  `migrateBuilderFields` adds a disabled `doors` module to
  existing saves on first load from any page.

### Verification — chunk C

`/tmp/builder-chunk-c-smoke.mjs` runs four assertions, all pass:

1. `doors-no-door-tiles` error fires when doors on but no door
   painted.
2. Validator goes silent once a door tile is painted.
3. Assembler emits the teleport marker + spawn coord
   substitutions + `BEHAVIOUR_DOOR` check + the
   `#if PLAYER2_ENABLED` P2 branch.
4. `/play` end-to-end build compiles via real cc65 (49168 bytes,
   50 ms).

### Deferred from chunk C (future work)

- **Multi-background doors.**  The real goal: step onto a door,
  the nametable swaps to a new room.  Needs `build_nam()` to
  emit one nametable per `state.backgrounds[]` entry, the stock
  `graphics.s` / `load_background()` to be parameterised over
  nametable addresses, and a runtime palette swap path.
  Planned; not in this chunk.
- **Per-door spawn points.**  All doors currently share a single
  spawn (module-level config).  A richer version would let each
  door paint configure its own `targetBg` + `(x, y)` — the
  Behaviour page already supports custom-per-tile metadata, so
  this is mostly UI.
- **Door animations / sound on transition.**  Out of scope
  entirely; waits on the FamiStudio chunk.

---

## Builder — 2026-04-24 Phase B finale chunk D (polish)

Final chunk in the Phase-B-finale plan.  Three small UX
improvements landed together; none is big enough to warrant
its own chunk but together they noticeably sand the rough
edges off the Builder.

- **📝 Open as Code (advanced)** in the File ▾ menu (new
  *Advanced* section under *Save & restore*).  Assembles the
  current state's `main.c` via the Builder assembler, saves
  the result to `state.customMainC`, and navigates to
  `code.html?stay=1`.  One-way by design (matches teacher Q1's
  decision back in the chunk-1 plan): after ejecting, the
  Code page owns the game; returning to the Builder is fine
  but C edits don't round-trip.  Confirm dialog explains the
  one-way nature before committing.
- **Per-module detailed help popover (ℹ️).**  Modules can
  opt into a longer-form explanation via a new optional
  `detailedHelp` field on the module definition (either a
  string or an array of paragraphs).  When present, an ℹ️
  button appears next to the module header; clicking it
  toggles a bordered panel under the header with the
  paragraphs rendered one-per-`<p>`.  Panel toggles
  independently of the card's expand/collapse so pupils can
  read the help without opening every setting at once.
  Three modules ship with `detailedHelp` today — **Damage**,
  **Doors**, and **Scene** — chosen because they're the
  most-questioned in pupil sessions.
- **Sprite thumbnail on each scene-instance row.**  The
  Scene module's per-instance dropdown sat next to a role
  badge; pupils had to read names to know what they were
  placing.  Chunk-D adds a 24×24 canvas before the dropdown
  that paints the currently-selected sprite via
  `NesRender.drawSpriteIntoCtx`.  Updates live when the
  dropdown changes; no new picker dialog, just instant
  visual confirmation.

### Verification — chunk D

- `node --check` clean on the extracted inline JS of
  builder.html and on `builder-modules.js`.
- All five prior smoke-test suites still pass:
  - Chunk A (HP + damage + HUD) — 49168 bytes, 47 ms.
  - Chunk B (runtime animations) — 49168 bytes, 44 ms.
  - Chunk C (teleport doors) — 49168 bytes, 40 ms.
  - Scene preview — NesRender headless + same-sprite-twice
    still compiles.
  - Player 2 — 49168 bytes, 48 ms.
  No regression across any of the chunks shipped this
  session.

### Phase B finale — status

- **Chunk A — HP + damage + HUD:** shipped.
- **Chunk B — Runtime animations (enemy+walk):** shipped.
- **Chunk C — Teleport doors (narrowed MVP):** shipped
  (multi-background deferred).
- **Chunk D — Polish (eject / help / thumbs):** shipped.

---

## Builder — 2026-04-24 Phase B+ Round 1 (polish sweep)

Three consolidation pieces from
[builder-plan-phase-b-plus.md](builder-plan-phase-b-plus.md),
shipped together because each is 20–80 lines.  Byte-identical
baseline preserved throughout.

- **1a — Player 2 HP + damage.**  New `PLAYER2_HP_ENABLED` /
  `PLAYER2_MAX_HP` macros emitted by the Player 2 module's
  `applyToTemplate` when P2 is on + Damage is on + P2's maxHp > 0
  (field unlocked from read-only; range 0–9).  Template gains
  `player2_hp / iframes / dead` globals behind the new gate;
  `damage.applyToTemplate` emits a mirror P2 collision loop
  inside `#if PLAYER2_HP_ENABLED`.  The blue-tint game-over
  condition now fires only when every HP-enabled player is dead
  — pre-processed to the right variant based on which gates are
  on.  HUD gained a top-right mirror of the P1 heart row,
  anchored to `248 - (HUD_W << 3)` and stepping leftwards.  New
  validator `p2-hp-zero-with-damage` (warn) nudges pupils who
  tick Damage with P2 enabled but P2.maxHp == 0 — not an error
  because "assist mode" co-op (P2 invincible) is legitimate.
- **1b — Player 2 animation.**  New `player2` entry in
  `ANIM_ROLES` / `ANIM_ROLE_LABELS` on the Sprites page.  Server's
  `anim_targets` list extended so `role=player2, style=walk`
  emits `#define ANIM_PLAYER2_WALK_COUNT / TICKS / W / H` plus
  `anim_player2_walk_tiles[]` / `anim_player2_walk_attrs[]` when
  tagged.  Template gains `p2_walk_frame` / `p2_walk_tick`
  globals and a second copy of the P2 render loop (behind
  `#if ANIM_PLAYER2_WALK_COUNT > 0` / `#else`) that swings the
  tile source to the animation table when P2 is walking
  (`pad2 & 0x03`) AND the sprite size matches the animation's
  W×H.  Idle resets the cycle so walking restarts cleanly.
- **1c — `enemy + idle` and `pickup + idle` animation pairs.**
  Server's `anim_targets` extended (one line added).  Template's
  per-instance animation driver refactored to one priority
  cascade (`#if ANIM_ENEMY_WALK` → `#if ANIM_ENEMY_IDLE` → `#if
  ANIM_PICKUP_IDLE`) so adding more pairs later is a
  `||`-extension of the `BW_HAS_SCENE_ANIM` macro.  Render
  loop and tick advance both read the new pairs; mismatched
  sizes fall through to static art same as chunk B.

### Verification — Round 1

`/tmp/builder-round1-smoke.mjs` — five assertions, all green:

1. Assembler emits `PLAYER2_HP_ENABLED 1`, `PLAYER2_MAX_HP 3`,
   and the `dmg2_hit` collision loop when the right combination
   is ticked.
2. `enemy + idle` tagged animation → `/play` build compiles via
   real cc65 (49168 bytes, 110 ms).
3. `pickup + idle` tagged animation → compiles (49168 bytes,
   157 ms).
4. `player2 + walk` tagged animation + P2 enabled → compiles
   (49168 bytes, 185 ms).
5. **Everything-on** — P2 enabled + P2 HP + P2 walk anim +
   enemy idle + pickup idle + damage + HUD + hud-tagged sprite
   — compiles (49168 bytes, 169 ms).

Baseline ROM hash `c77d502b7439` still holds with the new
template swapped in and no new modules ticked.  All prior
smoke-test suites (chunks A, B, C, preview, P2) still pass.

### What's next

Moving straight into Round 2 (dialogue) and Round 3
(multi-background doors) per the same plan.

---

## Builder — 2026-04-24 Phase B+ Round 2 (dialogue)

NPC interaction via B button — classic JRPG pattern, pupils have
been asking for this.

- **New `dialogue` module** (disabled by default).  Config:
  - `text` (up to 28 characters).
  - `proximity` (1–6 tiles — how close the player must be).
- **Font-tile convention.**  Text is rendered as NES tile indices
  using ASCII values — `A = 0x41`, `Z = 0x5A`, `0–9 = 0x30–0x39`,
  space = `0x20`.  Pupils paint letter-shaped BG tiles at these
  indices on the Backgrounds page; the string `"HELLO"` becomes
  `{ 0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x00 }` at build time which
  reads directly out of their tile set.  Characters without
  painted tiles silently render as empty — not broken, just
  invisible.
- **Template changes:**
  - Globals `bw_dialog_open`, `bw_dialog_prev_b` behind
    `#if BW_DIALOGUE_ENABLED`.
  - Init at main() top: zero both.
  - Per-frame logic (emitted by the module's `applyToTemplate`):
    edge-detect B, walk the scene-sprite list for NPCs, compute
    Manhattan tile-distance to the player's centre, and on
    match draw the text at row 25, col 2.  Second press closes
    via `clear_text_row()`.
  - Reuses the existing `draw_text` / `clear_text_row` helpers
    from Sprint 7's NPC snippet.
- **New `'text'` field type** in the Builder's field renderer
  so the `text` config has a plain-text input rather than a
  number spinner.  Other modules can use it going forward.
- **Two new validators:**
  - `dialogue-no-npc` (error) — dialogue on but no sprite tagged
    NPC.  Blocks Play.
  - `dialogue-empty-text` (warn) — dialogue on but text is
    blank.  Game still plays; the NPC just shows an empty box.

### Verification — Round 2

`/tmp/builder-round2-smoke.mjs` — four assertions, all pass:

1. `dialogue-no-npc` error fires when module is on without
   any NPC-tagged sprite.
2. `dialogue-empty-text` warn fires on blank text.
3. Assembler converts `"HELLO"` to the expected hex byte
   sequence and emits the `clear_text_row` close path.
4. `/play` end-to-end build with a tagged NPC + dialog text
   compiles via real cc65 (49168 bytes, 145 ms).

Baseline ROM still `c77d502b7439` with no new modules ticked.

### Deferred from Round 2

- **Per-NPC dialogue text** — today all NPC-tagged sprites
  share the module's single text config.  Per-instance text
  needs the scene editor's instance rows to grow a text field
  (Phase C).
- **Multi-line dialog boxes** — current MVP is one row.  Two-
  or three-row boxes need `draw_text` to loop over sub-strings
  or a new helper.
- **Auto-font-seed** — pupils still have to paint their own
  letter tiles.  A future "import font.chr" button would let
  them bypass painting.

---

## Builder — 2026-04-24 Phase B+ Round 3 (multi-bg doors)

Third and final round of the Phase B+ plan — completes the
doors story.  Pupils can now paint multiple backgrounds on the
Backgrounds page and use a door tile to move between them,
Zelda-style.

- **Server:** new helper `_nametable_bytes_for(nt)` factored out
  of `build_nam()`.  `build_scene_inc` now emits, for every
  painted background, a 1024-byte `bg_nametable_<N>[]` const
  array plus a `#define BG_COUNT <n>`.  Size is 1 KB per
  background — pupil projects with 3-5 rooms add 3-5 KB of PRG,
  well within cc65's budget.
- **Template:** new globals and helper (all behind
  `#if BW_DOORS_MULTIBG_ENABLED`):
  - `unsigned char current_bg` — which room the player is in.
  - `static void load_background_n(unsigned char n)` — blits
    `bg_nametable_<n>[]` into PPU $2000 during a brief
    render-off window, resets scroll to (0,0), updates
    `current_bg`.  Uses a `switch` so cc65 knows which const
    array to reach for each N ≤ BG_COUNT.
  - Initialisation: `current_bg = 0` at `main()` top.
- **Doors module** gains `targetBgIdx` config (int, -1..9, default
  -1 = same-room).  `applyToTemplate` emits:
  - `#define BW_DOORS_MULTIBG_ENABLED 1` + `#define
    BW_DOOR_TARGET_BG <n>` into the declarations slot *only*
    when `targetBgIdx` is a valid index — same-room doors
    (targetBgIdx == -1) keep the chunk-C teleport code path
    untouched.
  - A `load_background_n(BW_DOOR_TARGET_BG)` call inside the
    DOOR-tile detection block, guarded by `if (current_bg !=
    BW_DOOR_TARGET_BG)` so a pupil stepping on a door from
    within the already-loaded room doesn't trigger a
    pointless reload.
  - Both P1 and P2 door-tile checks gain the swap call
    (gated by `#if PLAYER2_ENABLED`).
- **New validator `doors-target-invalid-bg` (error)** fires when
  `targetBgIdx` is ≥ the number of painted backgrounds.  Without
  it the build would still compile (the `switch` falls through
  to the default case), but the pupil's intent — "swap to
  room 3" — wouldn't be expressible.
- **Migration** on both sprites.html and index.html back-fills
  `targetBgIdx: -1` onto doors modules saved before Round 3.
  Legacy same-room-teleport behaviour preserved.

### Verification — Round 3

`/tmp/builder-round3-smoke.mjs` — six assertions, all pass:

1. `doors-target-invalid-bg` error fires when targetBgIdx=3 on
   a single-background project.
2. Same-room mode (targetBg=-1) does **not** emit
   `BW_DOORS_MULTIBG_ENABLED` — chunk-C code path intact.
3. Multi-bg mode (targetBg=1, two backgrounds) emits all three
   macros + the `load_background_n` swap call.
4. `/play` single-bg default build compiles (49168 bytes, 74 ms).
5. `/play` multi-bg (2 backgrounds, target 1) compiles
   (49168 bytes, 149 ms).
6. **Kitchen-sink** — 3 backgrounds + doors (target 2) +
   dialogue (NPC with "GO EAST") + damage (P1 maxHp=3) + the
   usual enemy — compiles end-to-end (49168 bytes, 123 ms).

Full regression across all six prior suites (chunks A, B, C;
Player 2; Round 1; Round 2) still green — no breakage.  Baseline
ROM hash `c77d502b7439` preserved with the new template swapped
in and no new modules ticked.

---

## Phase B+ — status

All three rounds shipped in one session:

- **Round 1 — polish sweep**: P2 HP + damage + HUD, P2 walk
  animation via `role=player2` tag, `enemy+idle` and
  `pickup+idle` animation pairs.
- **Round 2 — dialogue**: NPC-proximity + B-press → text box
  from pupil-painted ASCII-mapped letter tiles.
- **Round 3 — multi-bg doors**: Zelda-style room-to-room
  transitions via DOOR tile + targetBgIdx.

Six smoke-test suites all green.  Baseline ROM untouched when
no new modules are enabled.  The Builder is now a genuinely
capable NES game-builder covering:

- Two-player co-op platformers.
- HP, damage, hearts HUD, game-over.
- Enemy AI (walker / chaser) + pickups + score-to-win.
- Tagged animations for enemies, pickups, both players.
- Multi-room levels with tile-based doors.
- NPC dialogue.
- Scene editor with visual drag-to-place preview.

Remaining items on the *future* backlog:

- **Per-door / per-NPC config** — today the doors module and
  dialogue module both use single global configs.  Per-tile
  (doors) and per-sprite (dialogue) metadata is the natural
  next UI upgrade.
- **Other `(role, style)` animation pairs** — `npc+walk`,
  `npc+idle` are mechanical additions.
- **P2 jump animation** — P2 walk animation landed in Round 1;
  P2 jump is the same pattern with a different tagged style.
- **Font-tile seed** — pupils still paint their own letters
  for Dialogue; an import-default-font button would skip that.
- **Sound** — still awaits the FamiStudio chunk.
- **Player-vs-player collision, multi-line dialog boxes,
  per-background palette swaps** — all deferred.

---

## Builder — 2026-04-24 dialogue fix + regression suite + doc sweep

Follow-up after pupil testing reported a "screen glitch" when
pressing B to open an NPC dialog box.

### Dialogue double-vblank bug — root cause + fix

- **Root cause.**  Round 2's dialogue module called
  `draw_text()` / `clear_text_row()` from the `per_frame` slot.
  Both helpers internally call `waitvsync()` + toggle `PPU_MASK`.
  Because `per_frame` runs *before* the main loop's own
  `waitvsync()`, the main `waitvsync()` then waited for a
  *second* vblank — one whole frame of stale OAM.  Pupils saw
  a one-frame sprite hiccup on every B press.
- **Fix.**  New `//@ insert: vblank_writes` slot added to
  `platformer.c` immediately after the main `waitvsync()`,
  before scroll / OAM writes.  The dialogue module now:
  - In `per_frame`: detects the B edge-press + NPC proximity
    and sets a pending-command byte (`bw_dialog_cmd = 1` to
    draw, `2` to clear).
  - In `vblank_writes`: consumes the byte inside the main
    vblank window, pokes PPU_DATA directly (no `waitvsync`
    round-trip, no `PPU_MASK` toggle).
  - Emits `#define BW_DIALOG_WIDTH 28` as part of the
    declarations so the clear loop has a named constant.
- **Regression guard.**  `round2-dialogue.mjs` now explicitly
  asserts the emitted code contains **neither**
  `draw_text(BW_DIALOG_ROW…)` nor `clear_text_row(BW_DIALOG_ROW…)`
  — any re-introduction of the pre-fix pattern fails the test.

### Regression test suite promoted

The `/tmp/builder-*-smoke.mjs` files that accumulated during
Phase A / B / B+ moved into a proper home at
[tools/builder-tests/](tools/builder-tests/).  They survive
sessions now.  New files:

- `tools/builder-tests/run-all.mjs` — single entry point.
  Syntax-checks every JS / Python module + every inline script
  block (builder / sprites / index / behaviour / code pages),
  verifies the byte-identical-ROM invariant against
  Step_Playground, then runs every smoke suite sequentially.
  Exits 0 iff everything passes.
- `tools/builder-tests/README.md` — what each suite covers,
  invariants the runner enforces, how to add a new test.
- Eight standalone suites covering Chunks A/B/C, Player 2, the
  preview/scene editor, and all three Phase B+ rounds (polish /
  dialogue / multi-bg).

Current output: **22 checks pass** — 13 syntax checks + 1
byte-identical invariant + 8 smoke suites.

### Documentation

- **[BUILDER_GUIDE.md](BUILDER_GUIDE.md)** (new) — pupil + teacher
  reference for the Builder page.  Covers the pipeline,
  insertion slots, `//>>` region contract, every shipped
  module, controller mapping, the **font-tile convention for
  Dialogue** (pupils paint letter tiles at ASCII positions in
  their BG tile set — `A = 0x41`, `Z = 0x5A`, `0..9 = 0x30..0x39`),
  the tagged-animation `(role, style)` matrix, and the
  regression-test protocol.
- **[README.md](README.md)** — new §"Building a whole game
  without typing C (Builder page)" with a short description +
  link to BUILDER_GUIDE.md, including the P2 keyboard cluster.
- **[PUPIL_GUIDE.md](PUPIL_GUIDE.md)** — new §"Building a whole
  game by ticking boxes (Builder page)" with a pupil-friendly
  tour: platformer, co-op (`I/J/K/L` + `O`/`U`), enemy AI,
  pickups, hearts, doors, NPC dialogue + pointer to
  BUILDER_GUIDE.md.
- **[TEACHER_GUIDE.md](TEACHER_GUIDE.md)** — new §"Phase B —
  Builder page" with the pipeline diagram, pointers to the
  JS module files, the byte-identical-baseline invariant, and
  the **Regression tests** section explaining
  `node tools/builder-tests/run-all.mjs`.
- **[PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md)** — three Phase-B+
  features marked `[done]` in the summary table (co-op, NPC
  dialogue, multi-background doors); "Simpler no-C module
  builder" and "Trigger next-scene load" both moved from
  `[planned]` / `[new]` to `[done]`; a 2026-04-24 changelog
  entry summarising the Builder's full delivery.

### Verification — this session

- `node tools/builder-tests/run-all.mjs` → ✅ all 22 checks.
- Manual: dialogue open + close no longer skips a frame (the
  sprite-stutter "glitch" is gone), and the failure mode when
  letter tiles aren't painted is clearly documented in
  BUILDER_GUIDE.md §4 + PUPIL_GUIDE.md so pupils know to paint
  them rather than expect text to "just appear".

Phase B is effectively done.  The Builder now ships with a
proper game-feel feature set: placed enemies animate, touching
them hurts, collected pickups can win the level, doors
teleport, two-player is supported, the preview canvas shows
real art over the real background, and help is one click
away.  Remaining items on the Phase-B backlog that were
explicitly descoped:

- **Multi-background doors.**  Full room-to-room transitions
  need `build_nam()` to emit N nametables and the template's
  `load_background()` to be parameterised.  Deferred.
- **Per-player animations for P2.**  P2 still uses its static
  layout.  Either share P1's walk cycle (wrong art when
  they're different sprites) or emit a second animation
  table set — neither is free.
- **Other `(role, style)` animation pairs.**  Only
  `enemy + walk` is wired in chunk B; `enemy + idle`,
  `pickup + idle`, `npc + walk`, `npc + idle` are a
  micro-chunk each when pupils ask.
- **HP for Player 2.**  The `maxHp` field is already in state
  shape; wiring it up is a damage-block copy behind
  `#if PLAYER2_ENABLED`.
- **Sound.**  Waits on the FamiStudio engine landing as a
  separate sprint.

### Dialogue — 2026-04-24 auto-close + pause options

Driven by pupil feedback that open dialogue boxes felt like a
trap (you had to guess when to press B again) *and* that the
player kept walking off-screen while reading.  Two new config
fields on the `dialogue` module solve both:

- **`pauseOnOpen`** (bool, default **on**) — the moment the box
  appears the module snapshots `walk_speed`, `climb_speed`, and
  (under `PLAYER2_ENABLED`) `walk_speed2` into
  `bw_dialog_saved_*` globals, then zeros them every open frame
  alongside `jumping` / `jmp_up` / `prev_pad` (= `0xFF` so a
  held A doesn't queue a jump).  Close restores the snapshot
  exactly, so movement resumes as though nothing interrupted.
- **`autoClose`** (int 0–240, default **0** = off) — when set,
  `bw_dialog_timer` is initialised on open and decremented every
  `per_frame` tick; hitting 0 sets the same `should_close` flag
  as a manual B press, so the close / restore path is shared.
  B still closes early when the timer is set — a generous
  default for pupils who read fast.

Both paths are macro-gated (`BW_DIALOG_PAUSE` 0/1 and
`BW_DIALOG_AUTOCLOSE` 0–240), so the code that's compiled when
dialogue is off is unchanged — baseline ROM still hashes
`c77d502b7439`.  The P2-specific save/restore / freeze lines sit
inside `#if PLAYER2_ENABLED`, so a single-player project
doesn't emit dead references to `walk_speed2` etc.

**Tests.**  `tools/builder-tests/round2-dialogue.mjs` grew five
new cases (B1–B5) walking the full (pause × timer) matrix:
defaults emit `BW_DIALOG_PAUSE 1` + save/restore,
pause + timer emits the timer init + decrement, no-pause + timer
drops the freeze define, no-pause + no-timer keeps only the
`b_edge` close path, and `autoClose = 9999` clamps to 240.
`node tools/builder-tests/run-all.mjs` stays green with the new
cases rolled in.

**Docs.**  [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §2 gains an
"Extra config" subsection under `dialogue` that spells out both
fields, their defaults, and the macros that gate them.

### Dialogue — 2026-04-24 snapshot/restore the row under the text

Reported from pupil testing: the text appeared fine, but after
closing, the row it used came back as a flat "transparent"
stripe that extended a little further every time the box
reopened.  Root cause: the clear path wrote tile `0x20` (ASCII
space) across the whole 28-cell row.  Whatever the pupil had
under the text (ground, sky, the bottom of a tree, letters from
a bigger nametable, …) was overwritten permanently, and each
re-open snapshotted *the space row itself*, then on close we
again stamped spaces — the damaged area never got a chance to
recover.

Fix in the vblank_writes block of the dialogue module:

- Declare `bw_dialog_saved_row[BW_DIALOG_WIDTH]` in RAM so we
  have somewhere to stash 28 bytes.
- On **draw**: read the 28 nametable bytes currently under the
  text via `PPU_DATA` reads (first read is stale-buffer — it
  lands in `saved_row[0]` and is harmlessly overwritten by the
  first real byte next iteration), then rewind `PPU_ADDR` and
  stamp the text.
- On **clear**: write `bw_dialog_saved_row` straight back, so
  every cell returns to exactly the tile index that was there
  before the text appeared.

Works while rendering is off (we are already inside the main
`waitvsync()` window), so the VRAM reads and subsequent writes
are both safe.  Known limitation: if `pauseOnOpen` is disabled
AND the camera scrolls between open and close, the snapshot
may no longer match the world row currently displayed at
screen row 25, so the restore will paint stale tiles.  The
default (pause on) keeps the camera still and avoids this
entirely.

**Tests.**  `round2-dialogue.mjs` gains three new assertions
(A7–A9): the clear path MUST NOT contain `PPU_DATA = 0x20;`
(the original bug), the draw path MUST contain
`bw_dialog_saved_row[dlg_j] = PPU_DATA;`, and the clear path
MUST contain `PPU_DATA = bw_dialog_saved_row[dlg_j];`.  Full
`run-all.mjs` stays green (13 syntax checks + baseline +
8 suites).

**Docs.**  [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §4's "How the
dialog PPU writes work" subsection gets a short history paragraph
covering both bugs (double-vblank then space-baking) and the
snapshot/restore design that replaced the space-fill clear.

### Dialogue — 2026-04-24 restore from bg_nametable_0 (VRAM-read rewrite)

Pupil retest showed the VRAM-read snapshot/restore from the
previous fix still didn't restore the background: text no longer
appeared, and the row kept widening into a "transparent" stripe
on each open/close cycle.  Two things were going wrong:

- The required dummy PPU_DATA read (first read after setting
  PPU_ADDR returns stale buffer data) was written as a plain
  assignment to `bw_dialog_saved_row[0]`, overwritten on the
  next loop iteration.  Under cc65 dead-store elimination this
  can be elided, shifting every subsequent read by one cell —
  the snapshot ends up being a column-shifted version of VRAM
  plus one byte of uninitialised garbage, and the restore
  stamps garbage over the row.
- The snapshot also used the full 28-cell vblank budget twice
  (once for reads, once for writes), which stacked awkwardly
  with the existing OAM writes in vblank_writes.

Rather than work around these by adding `volatile` casts,
hand-tuned loops, and cycle-counting, we dropped the VRAM-read
approach entirely.  The server already emits the painted
Backgrounds-page nametable as
`static const unsigned char bg_nametable_0[1024]` in
`scene.inc` (used by the existing `load_background()` helper),
so the clear path now just reads from there:

```c
for (dlg_j = 0; dlg_j < BW_DIALOG_WIDTH; dlg_j++) {
    PPU_DATA = bg_nametable_0[BW_DIALOG_ROW * 32
                              + BW_DIALOG_COL + dlg_j];
}
```

No VRAM reads.  No dummy-read gotcha.  No saved buffer in RAM.
No vblank-cycle pressure.  The `bw_dialog_saved_row[28]` global
is removed.

**Caveat.**  In a multi-background game the restore always
pulls from bg 0, so if a pupil walks through a door while the
dialog is open the cleared row shows the starting room's tiles.
The default `pauseOnOpen = true` freezes the player and makes
this impossible; it only surfaces if the pupil unticks the
pause option AND walks through a door AND the text closes while
in the new room.  Documented as a future upgrade.

**Tests.**  `round2-dialogue.mjs` swaps A8/A9's assertions to
match the new pattern — A8 now fails if *any* `= PPU_DATA;`
appears in the emitted code (catching a regression to the
read-VRAM approach), and A9 requires
`PPU_DATA = bg_nametable_0[dlg_src + dlg_j];`.  Full
`run-all.mjs` green — baseline byte-identical, all 8 suites.

**Docs.**  [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §4 gets the
full three-stage history (double-vblank → space-baking → failed
VRAM-read → bg_nametable_0 restore) so future readers
understand why the module deliberately avoids VRAM reads.

### Builder — 2026-04-24 remove legacy enemies module + clean the Backgrounds-page palette picker

Two pupil-reported gaps, both rooted in UI that predated newer
features and was still hanging around:

- **Legacy `enemies` module removed.**  The old `enemies` /
  `enemies.walker` / `enemies.chaser` modules emitted a global
  per-frame loop over every `ROLE_ENEMY` sprite.  They were
  hidden from the Builder tree back when the Scene module's
  per-instance AI dropdown (Static / Walker / Chaser per placed
  enemy) landed, but the submodules were still in
  `BuilderDefaults()` with `walker.enabled = true`, so fresh
  projects triggered the V3 "Walkers are on, but no sprite is
  tagged Enemy" warning and in some configurations produced a
  build-blocking problem.  No pupils used the legacy module —
  confirmed — so it was cut entirely:
  - `modules['enemies']`, `modules['enemies.walker']`,
    `modules['enemies.chaser']` definitions removed from
    [builder-modules.js](tools/tile_editor_web/builder-modules.js).
  - `'enemies'` dropped from `MODULE_ORDER` in
    [builder-assembler.js](tools/tile_editor_web/builder-assembler.js).
  - The `enemies:` entry (with its walker/chaser submodules)
    removed from the default state in `BuilderDefaults()`.
  - Validators V3 (`walker-no-enemies`) and V6
    (`walker-and-chaser`) deleted from
    [builder-validators.js](tools/tile_editor_web/builder-validators.js).
  - `sceneHasInstances()` helper removed — its only callers
    were the deleted modules.
  - BUILDER_GUIDE.md §2's "enemies.walker / enemies.chaser"
    subsection removed.

  Legacy saves that still have `state.builder.modules.enemies`
  are silently ignored — the assembler skips modules that
  aren't in `MODULE_ORDER`, so no migration is needed.

- **Backgrounds page: BG palettes only.**  The palette toolbar,
  all-palettes overview, and the "Preview palette" dropdown
  used to offer sprite palettes alongside BG ones.  Pupils were
  clicking a sprite-palette row to edit it, then painting
  nametable cells — which visually looked right in the editor
  but showed through a BG palette at runtime (nametable cells
  can only reference BG palettes).  Three edits fix this on
  [index.html](tools/tile_editor_web/index.html):
  - Palette-kind toggle: Sprite button removed; only BG
    remains.
  - "All palettes" overview: `groups` array trimmed to the BG
    entry, so the SP row no longer renders.
  - "Preview palette" dropdown: BG0–BG3 only; stale `sprite:N`
    selections from prefs fall through to `bg:N`.
  - Cross-page prefs restore (`initPaletteEditor`): if the
    Sprites page had persisted `paletteEditor.kind = 'sprite'`,
    the Backgrounds page now forces it back to `bg` on load
    so pupils can't re-enter sprite mode by page-hopping.

  Sprite palettes remain fully editable on the Sprites page —
  nothing was removed from there.

**Tests.**  `run-all.mjs` stays green with all changes in
place — syntax checks, byte-identical ROM baseline, and the 8
smoke suites all pass.  A scratch script builds a
no-enemy-sprite project end-to-end via `/play`; the ROM links
and runs without the legacy walker loop.

### Batch A — 2026-04-24 unified Play pipeline (items 1, 2, 8, 10)

Pupil-feedback follow-up: every editor page now drives the same
"assemble + build + launch" code path, with sensible defaults so
even a brand-new empty project plays.  Also adds a Download-ROM
button and a browser-vs-local-fceux selector everywhere.

**New shared module —
[play-pipeline.js](tools/tile_editor_web/play-pipeline.js).**
Single source of truth for the Play flow.  Public surface:

- `PlayPipeline.capabilities()` — cached probe of `/capabilities`
  (currently just `{ fceux: bool }`).
- `PlayPipeline.buildPlayRequest(state, templateText, opts)` —
  pure function returning the POST body for `/play`.  Handles
  state fortification, player / scene derivation, and the
  optional `customMainC` / `customMainAsm` override that lets the
  Code page keep sending pupil-written source.
- `PlayPipeline.play(state, opts)` — full flow: loads the
  template lazily, assembles, POSTs, dispatches the response.
  `opts.download` triggers a .nes save-as; `opts.mode` switches
  browser / native; `opts.onStatus` + `opts.onRom` are the page's
  hooks into status updates and the emulator.

**Robust defaults.**  `PlayPipeline._fortifyState` injects a stub
Player-role sprite when `state.sprites` is empty, and fills in a
`BuilderDefaults()` tree when `state.builder` is missing, without
mutating the caller's state.  The empty-state regression —
"project with only a background should still play" — builds a
49168-byte ROM via `/play`, verified by the new
`shared-play.mjs` suite.

**Per-page migration.**

- **Builder** (`builder.html`): the 120-line inline `play()` was
  cut to a 30-line wrapper that runs validators, saves, then
  delegates to `PlayPipeline.play`.  Gained a `⬇ ROM` download
  button and a `play-mode` selector; the Local-fceux option is
  auto-disabled when the server reports no `fceux` binary.
- **Sprites** (`sprites.html`): kept its Playground-dialog scene
  placer but now mirrors the pupil's pg-state into a transient
  `state.builder.modules.scene.config.instances` clone before
  handing off to the pipeline.  No persistence impact.
- **Code** (`code.html`): still sends raw `customMainC` /
  `customMainAsm`, but the POST + download + mode-selector logic
  is now the shared code path.
- **Backgrounds** (`index.html`) + **Behaviour** (`behaviour.html`):
  gained a Play button (item 10) that triggers a ROM download in
  browser mode, or launches fceux server-side in native mode.
  These pages have no embedded jsnes, so in-browser Play = save
  the .nes and run it in any external emulator (item 2).

**Native-emulator selector (item 8).**  Every page that can
produce a ROM now shows a `<select>` labelled "In browser" /
"Local (fceux)".  `PlayPipeline.capabilities()` probes
`/capabilities` once per page load; if the server has no fceux
the Local option greys out with an explanatory label.

**Tests — new
[tools/builder-tests/shared-play.mjs](tools/builder-tests/shared-play.mjs):**

- P1: empty state (no sprites, no Builder tree) → payload has a
  stub player at idx 0, empty sceneSprites, non-trivial
  customMainC.
- P2: legacy state (no state.builder) → migrated to BuilderDefaults
  non-destructively (caller's state untouched).
- P3: `opts.customMainC` / `opts.customMainAsm` bypass the
  assembler (Code-page contract).
- P4: end-to-end `/play` build of the empty-state payload returns
  a working ROM.
- P5: identical state → identical payload regardless of which
  page shape constructed it (proves items 1 + 10 together).

Full `run-all.mjs` — 13 syntax checks, byte-identical baseline,
and 9 smoke suites (the 8 existing ones plus the new shared-play
suite) — all green.

**Deliberately deferred.**  Backgrounds and Behaviour do not
ship an embedded jsnes dialog yet; Play there downloads the ROM
or uses fceux.  Promoting a popup emulator window is a
follow-up — the architecture is ready for it because every page
now funnels through the same pipeline.

### Batch C1 — 2026-04-24 ladder climbs stop at solid ground (item 6)

Pupil bug report: if you painted a ladder right next to a solid
ground row and held UP, the player climbed straight through the
floor into the sky.  Root cause: the on-ladder branch decremented
`py` unconditionally, with no check on what tile the player was
climbing into.

Fix in both
[tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
**and** [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
(symmetric so the byte-identical-baseline invariant still holds):
the climb-up / climb-down blocks now probe the target tile row
the same way the gravity loop probes `foot_row`.  The step is
blocked when both the left and right halves of the player's
bounding box hit SOLID_GROUND or WALL — **unless** either side is
a LADDER cell, in which case the ladder wins the tie and the
climb proceeds.

This keeps the intended "ladder punched through a floor" puzzle
working (pupil paints one column of LADDER cells replacing the
SOLID_GROUND cells at that column, player climbs through) while
blocking the unintended "ladder next to a wall lets you climb
into the wall" escape.

Full `run-all.mjs` green — baseline byte-identical (both
templates got the identical fix, so the stock-vs-swapped hash
compare still matches), all 9 smoke suites pass.

**Future:** a dedicated `ladder-solid.mjs` regression would
sanity-check the fix via jsnes frame capture; not needed for
merge, but planned in
[plan-batches.md](plan-batches.md) under C1.

### Batch B4 — 2026-04-24 Builder scene-instance row layout (item 9)

Pupil complaint: the delete-sprite button on the Builder page
was very wide and the whole add/remove area looked
misaligned.  Root cause: the `.scene-instance` grid had six
columns for seven children, so the delete button wrapped onto
its own line with a full-width cell — the red outline then read
as a giant bar.  On top of that, the first column was `1.4fr`
with only a 24×24 thumbnail inside, leaving a visible gap to
the left of every row.

Fix in [builder.html](tools/tile_editor_web/builder.html):

- Grid template now has exactly seven columns, one per child:
  `28px  minmax(0,1fr)  auto  64px  64px  auto  28px`.  Thumb
  sits flush, the sprite-picker select flexes to fill the row,
  x/y spinners line up between rows, delete button is a tight
  28×28 square.
- Delete button restyled as an icon-only square
  (`width:28 height:28 padding:0`, flex-centred 🗑).
- Row gains a hover state that shifts the border colour to the
  accent so pupils can see which row is live before clicking.
- Numeric inputs right-align so the digits line up vertically
  across rows.
- Empty-state placeholder: when no instances exist, the list
  now shows a dashed-outline hint ("No sprites placed yet.
  Click an empty spot on the preview above to drop one, or use
  + Add instance below.") instead of an empty container.

Full `run-all.mjs` green.  Baseline byte-identical (CSS +
render changes don't touch any emitted C).

### Play experience — 2026-04-24 Local-fceux fix + embedded emulator on every page

Two related pupil-facing fixes that landed together:

**1. Local (fceux) option stopped working on every page.**

Root cause: the shared `PlayPipeline.capabilities()` helper I
added in the Batch A migration probed `/capabilities`, but the
playground server exposes `/health` (the probe path hasn't
changed since before the migration — I just wired up the wrong
URL).  The fetch 404'd, `caps.fceux` was always falsy, and every
page disabled the Local option.

Fix in [play-pipeline.js](tools/tile_editor_web/play-pipeline.js):
probe `/health` instead.  Live confirmation on this machine:
`curl /health` returns `{ok: true, fceux: true, modes:
["browser","native"]}`; the mode-selector dropdown on every
page now enables the Local option when fceux is installed.

**2. Same embedded NES emulator on every page.**

Pupil ask: Backgrounds and Behaviour pages should have the full
"play-in-browser" experience the Builder has, not just a
Download-ROM button as they had after Batch A.

Extracted the Builder's embedded jsnes dialog +
`openEmulator()` + `ensureJsnes()` into a new shared module
[emulator.js](tools/tile_editor_web/emulator.js), exposing
`window.NesEmulator.open(rom, { hasP2 })`.  The module:

- Lazy-loads `jsnes.min.js` only on the first Play (zero cost
  for pupils who never Play on a given page).
- Injects a `<dialog id="emu-dialog">` + scoped CSS into the
  page on first call, so host pages don't need any boilerplate
  HTML.  If a page already has its own `#emu-dialog` (Builder
  does), the injection is skipped — no duplicate markup.
- Sets both a dialog class and a `body.emu-single-player`
  class so either the new `.single-player .emu-p2-controls`
  CSS selector or the Builder's pre-existing
  `body.emu-single-player #emu-p2-controls` rule hides the
  P2 hint when the ROM is single-player.
- Same keyboard mapping as before: arrow keys + F/D/Enter/RShift
  for P1; I/J/K/L + O/U/1/2 for P2.

**Per-page wiring:**

- **Builder** ([builder.html](tools/tile_editor_web/builder.html)):
  deleted the inline `ensureJsnes` + `openEmulator` +
  `decodeRomBase64` (≈80 lines).  `onRom` now calls
  `NesEmulator.open(rom, { hasP2 })` — same behaviour, one
  source of truth.
- **Backgrounds** ([index.html](tools/tile_editor_web/index.html)):
  added `<script src="emulator.js">`, changed Play mode labels
  from "Download ROM / Local" to "In browser / Local (fceux)",
  and replaced the download-on-play callback with
  `NesEmulator.open`.  The `⬇ ROM` button still downloads
  explicitly — pupils who want the .nes for an external
  emulator get it with one click.
- **Behaviour** ([behaviour.html](tools/tile_editor_web/behaviour.html)):
  same treatment as Backgrounds.
- **Sprites** + **Code** pages intentionally untouched — they
  already ship richer emulators with pause / reset / fullscreen
  controls; swapping them for the minimal shared version would
  lose features pupils use.

**Tests.**  `run-all.mjs` green (13 syntax checks now include
`emulator.js`, byte-identical baseline holds, all 9 smoke suites
pass).  Manual: `curl /health` from the running playground
server confirms fceux detection.

### Play experience — 2026-04-24 native fceux now runs the SAME ROM as the browser

Pupil report: "When I choose Play in Local I do not appear to get
the same game I get in the browser.  The game in the browser is
the correct one."

Root cause in
[tools/playground_server.py](tools/playground_server.py)
`run_play()`.  The customMainC / customMainAsm build paths
compile in a throwaway temp directory and return `rom_bytes` —
they deliberately do not touch the shared `STEP_DIR / "game.nes"`
(so two pupils clicking Play simultaneously don't corrupt each
other's builds).  The native branch, however, launched fceux
against `STEP_DIR / "game.nes"`, which was whatever the *last*
stock `make` happened to leave on disk — usually the pupil's
Step-playground sandbox build, or a stale build from hours /
days ago.  Browser mode worked because it streamed back the
correct `rom_bytes` the server had just built.

Fix: the native branch now writes the just-built `rom_bytes` to
a dedicated file `STEP_DIR / "_play_latest.nes"` and launches
fceux against that file.  Two design choices:

- **Dedicated filename** (not overwriting `game.nes`) so the
  pupil's offline `make` workflow keeps working — the stock
  build at `game.nes` stays authoritative.
- **Leading underscore** to signal "transient, regenerated
  every /play native call"; the top-level `.gitignore` already
  matches `*.nes` so nothing new needs gitignoring.

The write happens inside the BUILD_LOCK-scoped critical section
implicit in `_build_rom`, so concurrent /play calls still
serialise — the last Native click wins whichever ROM fceux
opens, matching pupils' expectation that the emulator reflects
the most recent build.

**Behaviour after this fix:**

- Browser mode: unchanged.
- Native mode: fceux now loads the freshly-built ROM with every
  Builder-tree change applied, on every page.  The browser
  embedded emulator and fceux show byte-identical gameplay
  (same ROM file, both paths going through the same
  `_build_rom`).
- Stock `game.nes` for the offline / non-/play flow:
  untouched.

**Action for the user:** restart any playground server that was
running before this fix — the server reads the updated code on
startup only.  Browser mode worked throughout the bad-state
window, so pupils weren't blocked; they just couldn't trust the
Local option to show their latest changes.

**Tests.**  `run-all.mjs` green.  No test covers the native
fceux launch path directly (would need to mock `subprocess.Popen`
— disproportionate for this one fix), but the browser path is
exercised end-to-end by `shared-play.mjs` P4, which compiles the
empty-state ROM via `_build_rom` and asserts the returned bytes
are a valid NES ROM — and `run_play()` now feeds those same
bytes to both branches.

### Sprite pipeline — 2026-04-24 OAM DMA to stop vblank overrun on fceux

Pupil report after the Local fceux fix landed: "There were lots
of sprites and movement on the screen, but graphic glitches all
over the screen, even in places with very little to them."

Root cause: the sprite-render path had always done per-byte
`OAM_DATA = x;` writes inside vblank, one byte per `STA $2004`.
For complex scenes (player + P2 + HUD hearts + several scene
sprites, each up to `ss_w × ss_h` tiles) that easily exceeds
300 OAM writes × ~10 cycles ≈ 3000+ cycles — well over the
~2273-cycle NTSC vblank budget.  Writes that spill past vblank
land while the PPU is actively rendering, which produces the
exact symptom pupils saw: corruption "all over the screen" that
isn't tied to what's in that region, because the corruption
comes from partial OAM / nametable updates leaking into the
active frame.

jsnes doesn't accurately simulate the vblank budget — it just
accepts writes whenever — so the bug was hidden in the browser
emulator.  fceux enforces timing correctly and surfaced it the
moment the Local mode started working.

**Fix: switch to OAM DMA.**  Standard NES homebrew pattern.

1. Carve a page-aligned 256-byte region at `$0200` via a new
   `OAM` memory + segment in
   [steps/Step_Playground/cfg/nes.cfg](steps/Step_Playground/cfg/nes.cfg).
   (The comment in the file always claimed the page was
   reserved "for ppu memory write buffer" but nothing was
   actually using it.)
2. Declare the shadow buffer in C via
   `#pragma bss-name(push, "OAM"); unsigned char oam_buf[256];
   #pragma bss-name(pop)` so it lands on the page boundary
   that $4014 DMA requires.
3. Move the whole sprite-build block (player, P2, HUD,
   animation tick, scene sprites) to **before** `waitvsync()`
   — the buffer-population loops now run during the active
   render period where there are plenty of spare cycles.  Each
   `OAM_DATA = x` is now `oam_buf[oam_idx++] = x` — a RAM
   write, no PPU hit.
4. After building, stride over any untouched OAM slots and
   write `0xFF` into the Y byte of each so stale sprites from
   the previous frame don't linger (NES convention: Y ≥ 240
   hides the sprite).
5. Inside vblank, the only OAM work is
   `OAM_ADDR = 0; OAM_DMA = 0x02;` — one register write that
   copies the 256-byte shadow to OAM in 513 cycles.  Combined
   with the dialogue vblank_writes (~300), scroll_stream
   (~600), and scroll_apply_ppu, total vblank load is now
   ~1450 cycles, comfortably inside budget.

Applied symmetrically to both
[steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
and
[tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
so the byte-identical-baseline invariant still holds — the
regression test compiles the stock main.c and the Builder
template, compares SHA-1 hashes, and they match because the
identical OAM-DMA code lands in both.

**Behaviour changes pupils may notice:**

- On fceux / real hardware: glitches in complex scenes should
  be gone.  Heavy scenes that would previously corrupt the top
  of the screen now render cleanly.
- On jsnes (browser embedded emulator): no visible change.  It
  was already over-permissive.
- Sprite flicker when more than 8 sprites line up horizontally
  on one scanline is a real NES hardware limit, NOT a bug —
  classic NES games mitigate it with "OAM cycling" (rotating
  which sprite is first each frame so flicker distributes
  across all sprites).  That's a nice-to-have for a future
  sprint; out of scope for this fix.

**Tests.**  Full `run-all.mjs` green.  The
byte-identical-baseline invariant still passes (both templates
ship the same OAM-DMA code, so their post-`make` hashes match).
All 9 smoke suites build / parse successfully.  `shared-play.mjs`
P4 confirms an end-to-end `/play` build still produces a valid
49168-byte ROM.

**Still to verify manually (user-side):** load a complex scene
in fceux via the Local option and confirm the glitches are
gone.  Will need a server restart to pick up the Python server
changes and a fresh build to produce the DMA-powered ROM.

### Phase 1 — 2026-04-24 close the pupil-feedback backlog

Executes Phase 1 of
[next-steps-plan.md](next-steps-plan.md) — four items that close
out the last of the ten pupil-feedback entries from
[plan-batches.md](plan-batches.md).

**1.1 — Scroll streaming cap (defensive pre-emptive, pending
pupil fceux verification).**  `scroll_stream()` in
[steps/Step_Playground/src/scroll.c](steps/Step_Playground/src/scroll.c)
now caps itself to **one column + one row transfer per vblank**
(the `while` loops became `if`s, with the remainder caught up
on subsequent frames).  The previous code could stack multiple
30–32-byte transfers in one vblank when the camera teleported
or moved fast, which — even after the OAM DMA fix — could edge
past the ~2273-cycle NTSC budget.  At realistic walk speeds
(1–3 px/frame) the loop only runs once per vblank anyway, so
nothing changes for pupils.  The file's own pre-existing TODO
("slice 3d can cap it and defer the tail until the next VBlank")
is now done.  Manual fceux verification by the user still
required to confirm scroll flicker is gone.

**1.2 — Shared help popover with page tabs + Feedback (items 3
from the pupil-fix list).**  New module
[tools/tile_editor_web/help.js](tools/tile_editor_web/help.js)
exposing `HelpPopover.attachPageTabs(dialog, currentPageId)` +
`HelpPopover.maybeAutoOpen(openFn)`.  Every page's existing
`<dialog id="help-dialog">` keeps its owned content; the helper
prepends a strip with links to every other page's help
(navigation with `#help` in the URL so the target page auto-
opens its help on load) plus a `💬 Feedback` toggle that
mounts `Feedback.mountInto(...)` inline on first expand.  All
five pages (Backgrounds, Sprites, Behaviour, Builder, Code)
now share the same help-tab UX without having to port each
other's help HTML.

**1.3 — Project-dropdown parity (item 4).**  `storage.js` gains
`Storage.wireBasicProjectActions({ makeFreshState })` — a
reload-on-success handler bundle for the `btn-project-new` /
`btn-project-duplicate` / `btn-project-delete` buttons.
Behaviour / Builder / Code pages all gain a `projects-list`
switcher + Duplicate + Delete.  Behaviour gets the full New /
Duplicate / Delete set (it has a `createDefaultState`);
Builder and Code get Duplicate + Delete + a menu-hint pointing
pupils at the Sprites page for New (those pages don't own a
fresh-state factory — a blank Builder or Code project without
sprites / tiles / a background isn't usable anyway).

**1.4 — Backgrounds palette picker (item 5).**  The "Use
palette" `<select>` in the nametable toolbar was hard to find;
pupils asked for it to look more like the swatch pickers on
Sprites.  Added a prominent `.nt-palette-picker` row between
the toolbar and the canvas: four big BG-palette buttons, each
showing the universal-BG slot 0 plus that palette's three
colours, active one outlined in accent.  The hidden
`<select id="nt-palette">` stays as the value store (all
existing paint logic still reads from it) and now has a change
listener that keeps the picker in sync when pupils use the
keyboard.  `assignColourToSlot` fan-out adds `renderNtPalettePicker()`
so palette edits update the picker live.

**Tests.**  `run-all.mjs` green:

- 15 syntax checks (now including `help.js`).
- 4 fix-specific regression guards (OAM DMA, ladder, native
  fceux launch, `/health` probe) — unchanged.
- Byte-identical ROM baseline still holds (template changes are
  symmetric between `main.c` and `platformer.c`; scroll.c's cap
  doesn't affect 1x1 builds because `BG_WORLD_COLS/ROWS` gates
  compile the blocks out).
- All 9 smoke suites pass.

**Manual verification still required from the teacher:**

1. Open the Builder in fceux via Local mode with a scrolling
   scene + several sprites, compare against pre-2026-04-24
   behaviour to confirm scroll flicker is cleared (C2 status).
2. Click `?` on each page; confirm the page-tabs strip appears,
   clicking another page's tab lands on it with help already
   open, `💬 Feedback` opens + submits successfully.
3. Switch projects from Behaviour / Builder / Code via the
   projects-list buttons; confirm the page reloads into the
   chosen project.
4. On Backgrounds, click the new "Paint with palette" row;
   confirm clicks update what palette subsequent paint strokes
   use; edit a colour slot and confirm the picker row updates
   live.

### Scroll-stream hotfix — 2026-04-24 follow-up

The Phase 1.1 cap turned the `while` loops in
[scroll.c](steps/Step_Playground/src/scroll.c) into `if`s, but
kept the internal `if (col >= BG_WORLD_COLS) continue;` guards
— which are only legal inside a real loop.  Cc65 rejects
`continue` outside a loop.  The byte-identical-baseline
regression test builds with `BG_WORLD_COLS=32` /
`BG_WORLD_ROWS=30`, so the streaming blocks are compiled out by
the `#if` gates — the error didn't surface until a pupil hit
/play on a genuinely scrolling project.

Fix: inverted each guard from "skip on out-of-range" to
"proceed on in-range" — `if (col < BG_WORLD_COLS) { ... write
block ... }`.  Same behaviour, no `continue`, compiles cleanly
for scrolling and non-scrolling builds alike.

New regression guard in
[tools/builder-tests/run-all.mjs](tools/builder-tests/run-all.mjs)
greps scroll.c (with comments stripped to avoid false
positives) for bare `continue;` statements.  Any match is an
error — scroll.c has no legitimate loops that would need one.
This catches the specific shape of the breakage in a way the
existing ROM-hash baseline can't (the baseline doesn't compile
the streaming blocks).

### Scroll-flicker follow-up — 2026-04-24 OAM DMA first in vblank

Pupil report after the scroll-stream cap shipped: "less screen
disruption but the bottom of the level is flickering near the
top of the screen until the screen stops moving."  Same on
browser and fceux.

Vblank ordering was non-canonical — OAM DMA ran *after*
dialogue writes + `scroll_stream` + PPU_ADDR manipulation.
That's risky in three ways:

1. If anything in vblank overruns its cycle budget, the
   latest writes spill past vblank.  When OAM DMA is last,
   sprites drop out — pupils notice immediately.  When OAM
   DMA is first, a spill just tears a background tile update
   (far less visible).
2. Dialogue + scroll_stream both leave the PPU's internal V
   register pointing somewhere via PPU_ADDR.  Running OAM DMA
   before any of that happens keeps V in a known state
   between vblanks.
3. On real hardware, OAM retention during vblank is delicate
   (the PPU partially decays sprite 0 + OAM at the end of
   vblank if not refreshed soon enough).  DMA-first
   guarantees the refresh happens early.

Reordered both
[steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
and
[tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
so the vblank sequence is now:

```c
waitvsync();
OAM_ADDR = 0x00;                 // <- first now
OAM_DMA  = 0x02;
//@ insert: vblank_writes         // dialogue
scroll_stream();                  // or PPU_SCROLL reset (non-scroll builds)
scroll_apply_ppu();               // last PPU register write, as before
```

Byte-identical baseline held because the change is symmetric
across both templates.

**Known limitation surfaced by this investigation.**  The
project uses horizontal nametable mirroring
(`NES_MIRRORING: 1` in `nes.cfg`) — correct for horizontal
scrolling (NT0 / NT1 are unique, pair at $2000 / $2400) but
limiting for tall worlds, because $2800 is a mirror of $2000.
Vertical scrolling past screen height shows the same content
wrapping rather than a new nametable.  Documented in
[BUILDER_GUIDE.md](BUILDER_GUIDE.md) §8 limitations.

**Action for the teacher:** try the scrolling project again
(browser or Local).  If the top-of-screen flicker is gone,
this closes C2 properly.  If it persists, the next debugging
step is to inspect nametable / attribute-table contents via
fceux's PPU viewer while scrolling, which will point at
whether it's a timing issue (vblank overrun) or a data issue
(stale attributes / missing nametable content).

### Phase 2.2 — 2026-04-24 palette picker QoL

Pupil ask from 2026-04-20: "select colours for palettes
easier."  Two additions on both Backgrounds and Sprites pages:

**Hover-to-preview.**  When a palette slot is selected, hovering
a cell in the master grid (or the new recent-colours strip)
temporarily paints that slot with the hovered colour.  Pupils
can scan the 64-cell grid and SEE which colours fit before
committing.  Implementation stays on the slot DOM node only —
we don't re-render the tile editor / tileset / nametable per
hover, because that would feel laggy and the slot is the right
signal anchor ("you clicked here because you care about this
slot").  On mouse-leave the slot reverts; on click the hover
commits via `assignColourToSlot`.

**Recent colours strip.**  Up to eight most-recently-picked
NES indices, persisted in `prefs.recentColours` (global, not
per-project — pupils reuse palettes across projects).  Clicking
a recent swatch assigns it to the selected slot; dragging onto
a slot works too (same dataTransfer payload as the master grid,
so the existing drop handlers just work).  Shows a greyed-out
"No recent colours yet — pick one below." line until the pupil
makes their first pick.

**Drag-and-drop** from master grid onto palette slots was
already wired (2026-04-13 work) so no change needed there.

Changes land on
[index.html](tools/tile_editor_web/index.html) and
[sprites.html](tools/tile_editor_web/sprites.html) symmetrically
— the master-grid and palette-slot markup is near-identical
between the two pages so the helpers are duplicated (kept inline
for page-local simplicity; not worth extracting to a shared
module yet).

### Phase 2.3 — 2026-04-24 inline animation strip

Pupil ask from 2026-04-20: "Make the animation section easier
to find and use."  Promoted the current animation's frames into
a prominent strip above the composition canvas on the Sprites
page — frame thumbnails, a **+ Add frame** button, and a
`full editor →` link that opens the collapsed Animations panel
below.

Markup + render function (`renderAnimStrip`) added to
[sprites.html](tools/tile_editor_web/sprites.html).  Hooks into
the existing `renderAnimations` fan-out so the strip stays in
sync whenever the animation list, selected animation, or frame
order changes.  Clicking a thumbnail jumps the preview to that
frame; the preview canvas in the full editor picks up the
`animPreview.frameIdx` change automatically on its next tick.

The full Animations editor (fps, reorder, delete frames, rename,
duplicate, preview-controls) stays inside the collapsible
`<details>` below — power users keep their existing workflow;
casual pupils now have the most-used bits surfaced.

### Phase 2 — status after this session

Shipped: 2.2 + 2.3.  Deferred to the next dedicated session:
**2.1 drawing tools** (Pencil / Fill / Line / Rect / Circle /
Select with marquee + move + resize).  Per
[next-steps-plan.md](next-steps-plan.md), 2.1 was always flagged
as a full-day "L" effort so shipping it alone matches the
plan's recommended split.  The suite is green (syntax + 5
invariants + baseline + 9 smoke suites) at every step so far.

### Phase 2.1 — 2026-04-25 drawing tools close-out

The previous stamp said Phase 2.1 would get a dedicated session
because it was scoped as a full-day "L" effort.  Turns out most
of it was **already shipped in Sprint 9** (see
[PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) Sprint 8.1): Pencil,
Fill (flood-fill), Line (Bresenham), Rect (outline), Circle
(ellipse outline), and Select (marquee → Delete / drag-to-move
with a floating-selection overlay + clipboard copy/paste).
This session closed the remaining gaps from the plan spec:

- **Filled Rect** (`rect_fill`, ■ icon) and **Filled Circle**
  (`circle_fill`, ● icon) as separate tools in the Tools
  popover.  New pixel-producer functions `rectFilledPixels` +
  `circleFilledPixels` route through the same
  `shapePreviewPixels` / `commitShape` / Shift-constrain /
  auto-assign pipeline as their outlined counterparts — pupils
  get a ghost preview while dragging, one undo step per commit,
  correct behaviour when the shape crosses cell boundaries or
  sits on an empty cell.
- **Keyboard shortcuts** — Alt+P / F / L / R / C / S for the
  six base tools.  Alt+Shift+R / Alt+Shift+C pick the filled
  variants.  Alt-namespace was chosen because the raw letters
  already mean something on this page (F = full preview,
  C = copy tile pixels, R = rotate selected region).  Tooltips
  on the tool buttons document the shortcut.  Status bar
  announces the switch ("● Tool: Fill") so pupils have
  feedback even without a mouse.
- **Centralised tool-type check** — the inline
  `currentTool === 'line' || currentTool === 'rect' ||
  currentTool === 'circle'` at the two preview + click-start
  sites became `SHAPE_DRAG_TOOLS.has(currentTool)` with a
  single Set constant.  Keeps future tool additions to one
  edit site.
- **Persisted-prefs tool list** extended to include the two
  new ids so reloading the Sprites page preserves the pupil's
  filled-variant choice.

All tool changes are confined to
[sprites.html](tools/tile_editor_web/sprites.html); no template
or emitted-C touched, so the byte-identical baseline is
unaffected.  `run-all.mjs` green — 15 syntax checks, 5
invariants, ROM baseline, 9 smoke suites.

**Still deferred from the plan spec:** Select → **resize drag
handles** (currently Select only supports marquee + delete +
drag-to-move + copy/paste).  Resize requires eight corner/edge
handles, per-handle drag math, and scaling clipped pixels — a
self-contained follow-up that the teacher can request when
pupils ask for it.

**Phase 2 definition of done reached** — 2.1, 2.2, and 2.3
all shipped.  Next: Phase 3 (content & templates — RPG
top-down preset, multi-line dialogue, per-NPC dialogue text,
P2 jump animation).

### Sprites page polish — 2026-04-25 strip & tools

Two pupil-feedback follow-ups on the Sprites page, both
[sprites.html](tools/tile_editor_web/sprites.html)-only.

**Animation strip is now context-sensitive.**  The inline strip
above the composition canvas was always visible after Phase 2.3,
even on sprites that aren't part of any animation — wasting
prime real-estate.  Now:

- Strip enters **frames mode** only when the currently-selected
  sprite is part of some animation.  Frame thumbnails show the
  sprite's own animation, with the active sprite highlighted.
  Clicking a thumbnail jumps the sprite selection (so the
  composition canvas + tile editor follow), not just the
  preview index — pupils editing a walk-cycle can flip between
  frames without leaving the editor.
- Strip enters **offer mode** when the selected sprite isn't
  in any animation.  A single button ▶ Start an animation with
  this sprite seeds a fresh animation containing this sprite as
  frame 0, switches the strip to frames mode, and writes a
  status-bar confirmation so the pupil knows what just happened.
- New helper `animationContainingSprite(spriteIdx)` resolves
  which animation to show: prefers `selectedAnimId` if it
  contains the sprite (so navigating frames inside one anim
  doesn't keep flipping to a different one); otherwise picks
  the first animation that contains the sprite.

**Tools popover replaced by an inline horizontal toolbar.**  The
🛠 Tools ▾ trigger button + hidden popover is gone.  All eight
tool buttons (Pencil / Fill / Line / Rect / Rect fill / Circle /
Circle fill / Select) now sit inline inside `.sprite-controls`
in a `.tools-bar` flex row.  The toolbar wraps to a second line
on narrow viewports.  Active tool is communicated by the
`.active` class on the matching button — no separate label
needed.  `setCurrentTool` and `initSpriteTools` lost their
popover open/close logic (all click + outside-dismiss + label
update code went with it).

Tests green: 15 syntax checks, 5 invariants, byte-identical ROM
baseline, 9 smoke suites.  Sprites-only changes — no template
or emitted-C touched.

### FCEUX PPU-viewer guide — 2026-04-25

New top-level doc
[DEBUGGING_FCEUX.md](DEBUGGING_FCEUX.md) walks through using
fceux's built-in PPU / Name Table / OAM viewers to diagnose
graphics issues that don't show in jsnes (specifically: the
remaining C2 scroll-flicker investigation that's still parked
on the teacher's bench).  Six steps from "build a ROM that
reproduces" through to "common findings, mapped to fixes."
Also covers what to capture for a useful bug report.

### Phase 3.1 — 2026-04-25 RPG / top-down preset

The Builder's `game` module gains a working **Top-down**
option (was placeholder-disabled "Coming in Phase B").  No
second template file — both styles share `platformer.c` and
the existing Step_Playground `main.c`, gated by a new
`BW_GAME_STYLE` macro.

- **`game` module**:
  [tools/tile_editor_web/builder-modules.js](tools/tile_editor_web/builder-modules.js)
  re-enables the Top-down enum option, gains an `applyToTemplate`
  that emits `#define BW_GAME_STYLE 1` only when top-down is
  picked.  Platformer (default) emits nothing — keeps the
  byte-identical-baseline test passing because the absent
  macro evaluates to 0 in cc65's preprocessor (`#if UNDEFINED
  == 0` is true).
- **Templates**: both
  [tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
  and
  [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
  gained symmetric `#if BW_GAME_STYLE == 0 / == 1` blocks
  around:
  - The player's vertical-movement section (ladders + jump +
    gravity for platformer; 4-way step with wall collision
    for top-down — UP / DOWN move `py` by `walk_speed`,
    SOLID_GROUND / WALL block, no jump, no airborne state).
  - The Player 2 vertical-movement section (matching
    treatment).
  - The scene-sprite gravity loop (top-down sprites stay
    where placed).
  - The walk-anim trigger condition: top-down counts UP / DOWN
    keypresses as walking too (`pad & 0x0F` instead of the
    platformer's `pad & 0x03`).
- **Smoke suite**:
  [tools/builder-tests/topdown.mjs](tools/builder-tests/topdown.mjs)
  with four cases (T1–T4): default state emits no
  BW_GAME_STYLE override, explicit platformer matches default,
  top-down emits exactly one `#define BW_GAME_STYLE 1`, and
  the end-to-end `/play` build of a top-down project succeeds.

The `game` module's `BW_GAME_STYLE` switch is intentionally
NOT a "scrap everything else" mode change.  Damage, dialogue,
doors, pickups, HUD, win conditions, scene-instance AI all
work unchanged in either style — the only thing that swaps is
player physics.

### Phase 3.2 — 2026-04-25 multi-line dialogue (1-3 rows)

The dialogue module's text field grows from one line to three.

- **Schema**: `text` is now "Line 1", with optional `text2` /
  `text3` for "Line 2" / "Line 3".  Trailing-empty lines drop
  (a "HELLO" + "" + "WORLD" config emits 3 rows on purpose;
  "HELLO" + "" + "" emits 1).
- **Emission**:
  - One `bw_dialogue_text_<i>[]` byte array per non-trimmed
    line (so a 3-line dialog emits `_0 _1 _2`, a 1-line
    dialog just `_0`).
  - Indexable lookup table `bw_dialogue_text_table[]` so the
    runtime can pick row N by index without a chained `if /
    else`.
  - New macro `BW_DIALOG_ROW_COUNT` (1-3) drives the runtime
    loop.
- **Runtime**: the vblank PPU-write block in the dialogue
  module's emitted code now loops over `BW_DIALOG_ROW_COUNT`
  rows, recomputing the destination VRAM address +
  `bg_nametable_0` offset per iteration.  Worst-case is 3 ×
  28 = 84 PPU writes per draw or restore, ~840 cycles —
  comfortably inside the ~2273-cycle NTSC vblank budget even
  alongside scroll_stream + OAM DMA.
- **Tests**: round2-dialogue.mjs gains B6 (1- and 2-row
  emissions + per-row vblank loop assertion).  Existing
  cases (A, B1–B5, E1) keep passing — the single-line
  default code path is byte-for-byte similar (the only
  change pupils with no overrides see is the new
  `BW_DIALOG_ROW_COUNT` macro and the table indirection).

### Phase 3.3 — 2026-04-25 per-NPC dialogue text

Each NPC scene-instance can now have its own dialogue line —
walk up to a different NPC, get a different line.  When the
NPC's text is empty, the dialog falls back to the module-
level multi-line text from Phase 3.2.

- **State shape**: scene `instances[i]` gains an optional
  `text` field that's only meaningful when the matching
  sprite has `role === 'npc'`.
- **Builder UI**:
  [tools/tile_editor_web/builder.html](tools/tile_editor_web/builder.html)
  scene-instance rows now render an extra `.scene-instance-
  text` row below NPC instances with a "💬 says:" label and
  a 28-char text input.  Non-NPC instances render the row
  unchanged so the 7-column grid layout from Phase 1's B4 is
  untouched.
- **Emission**: when any NPC instance has non-empty text,
  the dialogue module's `applyToTemplate` walks
  `state.builder.modules.scene.config.instances`, emits one
  `bw_dialogue_npc_<i>[]` array per overriding NPC, plus a
  lookup table `bw_dialogue_per_npc[NUM_STATIC_SPRITES]`
  with NULL entries for non-overriders.  `BW_DIALOG_PER_NPC`
  (0 / 1) gates the new code paths so projects without any
  per-NPC text emit nothing extra.
- **Runtime**:
  - The per-frame proximity-trigger block sets a new global
    `bw_dialog_npc_idx = j` when it picks an NPC, so the
    vblank writer knows which slot to look up.
  - The vblank PPU-write block consults
    `bw_dialogue_per_npc[bw_dialog_npc_idx]`; when non-NULL
    it draws that single line instead of the module-level
    table; `dlg_total` collapses to 1 row for that draw.
    Close still restores `BW_DIALOG_ROW_COUNT` rows so the
    screen returns to its pre-open state cleanly even when
    open used a single-row override.
- **Tests**: round2-dialogue.mjs gains B7 (covers the
  "BW_DIALOG_PER_NPC 0 with no overrides", "1 with one
  override", per-NPC array emission, npc-idx recording, and
  vblank lookup).

### Phase 3.4 — 2026-04-25 Player 2 jump animation

Finishes the P1/P2 animation symmetry.  Pupils tag a
`role=player2, style=jump` animation on the Sprites page;
the runtime swaps to those frames while P2 is airborne.

- **`playground_server.py`**: `anim_targets` list extended
  with `("player2", "jump")` so the same machinery that
  emits `ANIM_PLAYER2_WALK_*` now emits
  `ANIM_PLAYER2_JUMP_*`.  Absent pairs cost nothing — the
  count macro is 0 and the gated render block compiles out.
- **Template**: new `p2_jump_frame` / `p2_jump_tick`
  globals in
  [tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
  (gated behind `ANIM_PLAYER2_JUMP_COUNT > 0`).  The P2
  render block was a pure walk-or-static fork; it's now
  walk-OR-jump-or-static with priority **jump > walk >
  static** — pupils mid-jump see the jump pose even if
  they're drifting sideways (matches SMB-style feel).  Both
  cycles reset to frame 0 when neither animation owns the
  frame.
- **Tests**: round1-polish.mjs gains an `E3-jump` end-to-end
  case that builds a state with a tagged P2 jump animation,
  asserts `ANIM_PLAYER2_JUMP_COUNT` is in the assembled
  source, and confirms the ROM links cleanly via `/play`.
  The existing E4 "everything-on" case is extended to
  include `withP2Jump`, exercising the simultaneous walk +
  jump pair under the priority chooser.

**Phase 3 done.**  All four items — RPG preset, multi-line
dialogue, per-NPC text, P2 jump — landed.  Tests:
`run-all.mjs` green: 15 syntax checks, 5 invariants,
byte-identical ROM baseline (both templates received
symmetric edits for 3.1), and **10 smoke suites** (the new
`topdown.mjs` joins the existing nine; `round1-polish.mjs`
and `round2-dialogue.mjs` gained new in-suite cases).

## Tier 1 (post-Phase-4 plan) — first batch shipped 2026-04-26

Source plan:
[`docs/plans/current/2026-04-26-fixes-and-features.md`](../plans/current/2026-04-26-fixes-and-features.md).
Five Tier-1 items landed in one session — all the lower-risk
documentation and single-spot-code fixes.  T1.1 (background fill),
T1.2 (pixel grid overlay), T1.4 (wider behaviour panel) and T1.6
(Globals Builder module) are deliberately deferred to the next
session because they're either more substantive code edits or
require a fresh environment.

- **T1.7 — gallery thumbnail** *(item 25)*.
  `tools/tile_editor_web/builder.html`'s `captureRomPreview()`
  now boots jsnes for **60 frames** before snapshotting the
  framebuffer (was 30).  Pupils were reporting blank
  background-only thumbnails; 30 frames covered cc65's startup
  + first few main-loop iterations on paper but jsnes-side
  evidence said it wasn't enough in practice for at least one
  animation cycle to tick on the player sprite.  The function
  now carries a docstring explaining the constraint and
  pointing at the bug item that motivated it, so future readers
  don't bisect this back to "magic constant 60".
- **T1.5 part 1 — sfx event linkage doc** *(item 27)*.
  [AUDIO_GUIDE.md](../guides/AUDIO_GUIDE.md) gains a *Connecting
  sound effects to events* sub-section under "Code-page pupils"
  with a four-row table (jump start / land / hit / pickup)
  showing where to add `famistudio_sfx_play(...)` calls + which
  channel to use for each.  The Builder UI side of this item
  (T1.5 part 2) is gated on T2.6 and intentionally not done
  here.
- **T1.8 — palette-bug diagnosis framework** *(item 16)*.
  [`docs/feedback/recently-observed-bugs.md`](../feedback/recently-observed-bugs.md)
  now ends with a *Diagnosis notes* section.  Item 16 has a
  three-step repro plan (UI persistence / canvas render /
  runtime ROM render) plus a triage matrix mapping outcomes to
  likely fix locations.  Captures the plan's "do not fix
  blind" guidance as a checklist the next session can fill in.
- **T1.9 — NES dev resources** *(item 4)*.  New file
  [`docs/reference/nes-resources.md`](../reference/nes-resources.md)
  curating the canonical references the project leans on:
  NESdev wiki PPU/scrolling/mirroring/APU/iNES pages, cc65 +
  ca65 + ld65 docs, FCEUX / Mesen / jsnes references, FamiStudio
  notes, NESdev forum, Nerdy Nights tutorials.  Each entry has
  a one-line "what it answers" hook.  Cross-linked from
  [PUPIL_GUIDE.md](../guides/PUPIL_GUIDE.md) (curiosity-driven)
  and [TEACHER_GUIDE.md](../guides/TEACHER_GUIDE.md) (replaces
  the old short list).
- **T1.3 — duplicate sprite copies tiles** *(item 18)*.
  `tools/tile_editor_web/sprites.html`'s `btn-sprite-dup` handler
  now allocates a fresh contiguous tile run via
  `findFreeTileRun(w*h, state)` and copies the source's pixel
  data (via `clonePixels`) into the new slots, then rewires the
  duplicate's cells to point at the new indices.  Without this
  step, editing the duplicate's pixels silently edited the
  original because both shared `state.sprite_tiles[idx]`.
  Falls back to the old shared-tile behaviour with a warn
  toast when the tile sheet is full.

**Tests.**  Full `run-all.mjs` regression suite green after
the work — 16 builder smoke suites + every invariant including
byte-identical-ROM and audio.  No new test cases added in this
batch; the next session should add one for the
`btn-sprite-dup` flow specifically (build a state with a
sprite whose pixels are non-zero, duplicate, edit the duplicate's
pixels, assert the original's pixels are unchanged) — flagged
under T1.3 in the plan as a follow-up.

**Documentation reorg.**  All `.md` files (except top-level
`README.md`, `NOTICE.md`, and `LICENSE`) moved into a
structured `docs/` tree on the same day: `docs/guides/` (pupil-
and teacher-facing), `docs/plans/current/` (active plans),
`docs/plans/archive/` (chronologically named superseded plans),
`docs/feedback/` (bug list + pupil ideas + feedback summary),
`docs/changelog/` (this file), and `docs/reference/` (T1.9's
new home).  See [`docs/README.md`](../README.md) for the full
old→new path table.  Code-side references (`audio.html`'s
`<a href="AUDIO_GUIDE.md">`, doc comments in `builder.html`,
`code.html`, `behaviour.html`, `builder-modules.js`,
`playground_server.py`) updated to the new paths in the same
commit.  A scheduled follow-up (one week out) sweeps the
inter-archive cross-links that weren't all chased in the
initial reorg.

## Tier 1 (post-Phase-4 plan) — second batch shipped 2026-04-27

Source plan:
[`docs/plans/current/2026-04-26-fixes-and-features.md`](../plans/current/2026-04-26-fixes-and-features.md).
The remaining four Tier-1 items + the deferred T1.3 regression
guard all landed in one session, completing Tier 1 of the plan.

- **T1.4 — wider Sprite reactions panel** *(item 20)*.
  `tools/tile_editor_web/behaviour.html`'s page-level grid
  collapses from `260px 1fr 340px` (three columns, reactions
  cramped on the right) to `260px 1fr` with
  `grid-template-areas` placing the types palette on the left
  full-height, the canvas top-right, and the sprite-reactions
  panel under the canvas full-width.  Pure CSS / no DOM moves
  thanks to the `grid-template-areas` pattern.
- **T1.2 — pixel grid overlay on sprite top view** *(item 19)*.
  New `show-pixel-grid` checkbox on the Sprites toolbar (off by
  default — the existing cell grid stays the prominent
  landmark).  `renderSpriteCanvas` draws faint 1-px lines at
  every per-pixel boundary on the composition canvas, gated to
  zoom ≥ 6× so the lines aren't unreadable at low zoom.  Mirrors
  the per-tile pixel editor that already had a grid.
- **T1.3 follow-up — regression guard for sprite duplicate**.
  New invariant in `tools/builder-tests/run-all.mjs`:
  `btn-sprite-dup handler clones tile pixels (not just sprite
  struct)`.  Source-level check that the handler still calls
  `findFreeTileRun(...)`, `clonePixels(...)`, and writes a fresh
  `state.sprite_tiles[t]` entry.  A behavioural test would need
  JSDOM (which the project doesn't ship); when JSDOM lands this
  guard can be replaced with a real assertion.
- **T1.1 — Background-tile fill tool surfaced** *(item 1)*.
  The flood-fill logic already existed in `index.html`'s
  `nt-tool` Advanced dropdown (`tool === 'fill'` branch with the
  `ntFloodFill` BFS implementation), but pupils couldn't find
  it.  Added a fourth top-level mode button (🪣 Fill) to the
  `.nt-mode-toggle` row alongside Paint tile / Paint palette /
  Erase.  No new logic — the existing `setNtMode('fill')` path
  already handled the wiring.  Help-tab tutorial copy updated
  to mention the button.
- **T1.6 — Globals Builder module** *(item 22)*.
  New `globals` module in `builder-modules.js` exposing two
  integers: `gravityPx` (0-4, default 1, scene-sprite fall rate)
  and `jumpSpeedPx` (1-6, default 2, player rise rate while a
  jump is in progress).  The user paired these as "gravity"
  (how fast things fall) and "jump speed" (how fast the player
  launches) — pupils can tune both independently.
  Implementation uses a macro pattern that preserves the
  byte-identical baseline:
  - Both `steps/Step_Playground/src/main.c` and
    `tools/tile_editor_web/builder-templates/platformer.c` gain
    a pair of default `#ifndef`-gated macros: `BW_APPLY_GRAVITY(y)`
    defaulting to `(y)++` and `BW_APPLY_JUMP_RISE(y)` defaulting
    to `(y) -= 2`.  Each default expansion compiles to the same
    ROM bytes cc65 used to emit for the historic literal
    (`ss_y[i]++` and `py -= 2` respectively), verified by
    sha1sum'ing the resulting `.nes` before and after.
  - The scene-sprite gravity site changes from `ss_y[i]++` to
    `BW_APPLY_GRAVITY(ss_y[i])` in both files; the player
    jump-rise site changes from `py -= 2` to
    `BW_APPLY_JUMP_RISE(py)` in both files.
  - When the module ticks, its `applyToTemplate` writes
    `#define BW_GRAVITY_PX <n>`, `BW_APPLY_GRAVITY` override,
    `#define BW_JUMP_SPEED_PX <n>`, and `BW_APPLY_JUMP_RISE`
    override into the `declarations` slot, which sits *above*
    the default `#ifndef`s so the overrides win.
  - `MODULE_ORDER` in `builder-assembler.js` gains `'globals'`
    immediately after `'game'` so its declarations land near
    the top of the customMainC.
  - **Player fall rate is currently fixed at 2 px/frame** — only
    the player's *rise* uses the new macro.  Help text on
    `jumpSpeedPx` calls this out.  Adding a player-fall knob
    is a small follow-up if pupils want it; tracked informally
    here.

  T2.5 (per-sprite tuning) will plug per-instance overrides into
  this same macro infrastructure when it ships.

**Tests.**  Full `run-all.mjs` regression suite green — every
invariant including the byte-identical baseline (proves the
`BW_APPLY_GRAVITY` macro doesn't disturb the no-modules-ticked
path), the new T1.3 sprite-duplicate guard, and all 16 smoke
suites including audio.

**Tier 1 complete.**  Nine of nine items shipped (T1.1 through
T1.9).  Next session moves into Tier 2 — recommended start point
is the door-bug bundle (T2.1 + T2.2) since it's a known-bad
pupil report and likely shares a root cause across the two
items.

