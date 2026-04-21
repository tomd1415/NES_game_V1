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
