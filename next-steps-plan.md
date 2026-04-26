# Next-steps plan (post pupil-fix pass)

> **Status stamp (2026-04-25).**  Phase 1 complete except 1.1 C2
> (parked pending teacher investigation; debug guide at
> [DEBUGGING_FCEUX.md](DEBUGGING_FCEUX.md) supports the workflow).
> **Phase 2 done** (2.1 drawing tools + 2.2 palette QoL + 2.3
> animation strip).  **Phase 3 done** — all four items shipped in
> a single session: 3.1 RPG / top-down preset (BW_GAME_STYLE
> macro, both templates symmetrically gated, new topdown smoke
> suite), 3.2 multi-line dialogue (1-3 rows, BW_DIALOG_ROW_COUNT
> + table indirection + per-row vblank loop), 3.3 per-NPC
> dialogue text (each NPC instance can override the shared
> dialogue line, falls back when empty), 3.4 P2 jump animation
> (priority jump > walk > static with proper cycle reset).  Still
> deferred: 2.1 Select → resize drag handles.  1.1 C2 scroll
> flicker is **closed** (2026-04-25): FCEUX PPU-Viewer pinned the
> cause to cc65 eliding the `PPU_CTRL = +32 stride` write before the
> column-burst in `scroll.c`; fixed by qualifying the PPU/OAM
> register macros `volatile` in `scroll.c`, `main.c`, and the
> builder platformer template.  See the "Phase 3.1 / 3.2 / 3.3 / 3.4" entries in
> [changelog-implemented.md](changelog-implemented.md).  **Next:
> Phase 4** (big standalone initiatives — accessibility first,
> then gallery, then audio).

Where to go from here, as of 2026-04-24.  Two preceding plan docs
remain useful history:

- [plan-batches.md](plan-batches.md) — the three-batch pupil-feedback
  pass.  All of Batch A, C1, B4, plus the OAM-DMA / stale-ROM /
  embedded-emulator follow-ups shipped.
- [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) — the long-running log of
  pupil comments; its "Proposed roadmap — next sprints" already sketches
  Sprints 6–9.  Sprints 6 and 7 are done; Sprints 8 and 9 are what
  this plan is really about.

Work is grouped into four phases, in order of value-per-hour.
**Phase 1** closes the pupil-feedback pass outright.  **Phase 2**
is the delight-per-day polish Sprint 8 already scoped.  **Phase 3**
is content expansion (presets, dialogue, animation pairs).  **Phase
4** collects the bigger-but-standalone initiatives — do them one at
a time, safest first.

Effort key: **S** ≈ half a day, **M** ≈ one focused day, **L** ≈ a
sprint (2–4 days).

---

## Phase 1 — Close the pupil-feedback backlog

The last four items from [plan-batches.md](plan-batches.md).  Each is
small on its own; grouping them into one session gives pupils a
visibly nicer editor next time they sit down.  Total effort:
**half a day to two days**, depending on C2.

### 1.1 — Verify C2 (scroll flicker) (S) — DONE 2026-04-25

**Outcome.**  Confirmed not fixed by the OAM-DMA work.  FCEUX
PPU-Viewer screenshots of a 2×1 scrolling project showed the camera
starting clean, then accumulating horizontal-stripe corruption across
NT0/NT1 the moment scrolling began — every scroll-step laid 30 tiles
across one nametable row instead of stepping down a column, and the
floor row vanished while scrolling left.

**Cause.**  cc65's optimiser was eliding the
`PPU_CTRL = PPU_CTRL_BASE | PPU_CTRL_STRIDE_COL` write that precedes
the 30-tile `PPU_DATA` column burst in [scroll.c](steps/Step_Playground/src/scroll.c),
because the next syntactic access to the same address was another
assignment further down (`PPU_CTRL = PPU_CTRL_BASE`) — so the column
burst ran with whatever stride `scroll_apply_ppu` had left behind
(+1) and smeared the column across one nametable row.

**Fix.**  Qualified the PPU/OAM register macros `volatile` in
[scroll.c](steps/Step_Playground/src/scroll.c),
[main.c](steps/Step_Playground/src/main.c), and
[platformer.c](tools/tile_editor_web/builder-templates/platformer.c).
Builder regression suite (10 smoke suites + byte-identical-ROM
invariant) green after the change.  The earlier preventive measures
(stride reset at the end of `scroll_stream`, one-transfer-per-vblank
cap) are still load-bearing — they were necessary but not sufficient.

**Outstanding.**  Manual playtest on the pupil's project to confirm
the in-game scroll is clean.  Worth adding a regression guard that
diffs `*((unsigned char*)0x2000)` against `(*(volatile unsigned char*)0x2000)`
in a build-time text scan of `main.c` / `scroll.c` / `platformer.c`,
so a future contributor can't accidentally drop the qualifier.

### 1.2 — Help popover tabs + Feedback tab (M)

**Goal.**  One `?` button opens a tabbed help dialog: current page
first, tabs for every other page, a Feedback tab always present.

**Plan.**

1. Factor the tab-shell into `tools/tile_editor_web/help.js`.
   Exposes:
   - `HelpPopover.register(pageId, { title, html })` — each page
     declares its own help content once at load.
   - `HelpPopover.open(currentPageId)` — shows the dialog with
     `currentPageId` pre-selected, other pages as sibling tabs,
     Feedback tab always last.
   - The module lazily creates `<dialog id="help-popover">` on first
     open (same pattern as `emulator.js`).  CSS scoped to
     `.help-popover-*` so it doesn't clash with any page's own help
     markup.
2. Each existing page calls `register(pageId, { html })` once with
   its own copy (port whatever inline help content the page already
   had).  Content stays owned by the page; only the shell is
   shared.
3. Rewire every `btn-help` click + `?`-key binding to
   `HelpPopover.open(pageId)`.  Old `<dialog id="help-dialog">`
   elements removed along with their local open/close handlers.
4. Feedback tab wraps `feedback.js`'s existing form and passes
   `source: pageId` so submissions are attributable.
5. Test: open each page, check tab ordering + Feedback tab submits;
   `run-all.mjs` syntax + smoke remain green.

**Files touched.**  New `help.js`; modifications to `index.html`,
`sprites.html`, `behaviour.html`, `builder.html`, `code.html`.

### 1.3 — Project-dropdown parity (S) — DONE 2026-04-25

**Outcome.**  Every editor page now exposes the same project-
lifecycle controls.  Behaviour, Builder and Code previously shipped
a thinner subset (no **Migration backup**, no **Recover from
snapshot**); both now appear in their menus and work via a shared
[project-menu.js](tools/tile_editor_web/project-menu.js) module that
lazily injects a recovery dialog and wires the handlers without
clashing with Backgrounds' / Sprites' existing inline wiring.

**What shipped.**

- New [project-menu.js](tools/tile_editor_web/project-menu.js) —
  exposes `ProjectMenu.wire(opts)` (idempotent — won't double-attach
  on a second call) and `ProjectMenu.openRecoveryDialog(opts)`.
  Lazily injects a `<dialog id="recovery-dialog">` if the page
  doesn't already carry one (Backgrounds does), reads snapshots +
  backups via the existing `Storage.list*` API, and on Restore
  saves the loaded state back through `Storage.saveCurrent` then
  reloads — works on every page because they all read state from
  Storage on init.
- HTML additions: `<button id="btn-recover">` and `<button
  id="btn-migration-download" hidden>` added to
  [behaviour.html](tools/tile_editor_web/behaviour.html),
  [builder.html](tools/tile_editor_web/builder.html), and
  [code.html](tools/tile_editor_web/code.html); each page now
  loads `project-menu.js` after `storage.js` and calls
  `ProjectMenu.wire()` once during init.
- Backgrounds + Sprites untouched — their inline handlers already
  cover everything, and `ProjectMenu.wire` is a no-op for buttons
  it sees an existing `dataset.projectMenuWired` flag on (or, more
  defensively, that already have a non-null `onclick`).

**Note on the New-project gap.**  Builder and Code intentionally
omit `+ New project…` and instead show a hint pointing pupils at
the Sprites page so a starter hero gets seeded.  Preserved that
design choice; the parity fix is about the universal lifecycle
controls (Duplicate / Delete / Migration / Save / Open / Recover)
that Behaviour, Builder and Code were missing.

**Tests.**  New
[project-menu.mjs](tools/builder-tests/project-menu.mjs) suite
asserts every page declares the universal buttons (with the New
exception explicit), the three thin-menu pages load and invoke
`project-menu.js`, the shared module wires both handlers as
expected on a minimal DOM shim, the recovery dialog injects + lists
mocked snapshots + restores via `Storage.saveCurrent` + reloads,
and a second `wire()` call doesn't double-attach.  Wired into
`run-all.mjs`; full suite green.

### 1.4 — Backgrounds palette selector facelift (S)

**Goal.**  Promote the active-palette swatches above the nametable
canvas so pupils can see + switch the painting palette without
hunting in the right-hand panel.  Mirror the pattern that already
works well on Sprites.

**Plan.**

1. Study Sprites page's `#sprite-side-swatches`: sits above the
   composition canvas, clickable cells switch paint colour, tiny
   palette-number label on the left switches which palette is
   active.
2. Add a horizontal strip above the Backgrounds page's nametable
   canvas:
   - BG-palette number label (click → cycles through BG0..BG3)
   - Four colour cells (slot 0 shared BG, slots 1/2/3 from active
     palette; click → sets `currentColour`)
   - Active cell outlined with the accent colour, matching the
     existing `.color-btn` style.
3. Keep the "All palettes" overview panel untouched — it's the
   editing target, not the picker.  The new strip is the picker.
4. Update `tour.js` so the first step highlights the new strip.

**Files touched.**  `index.html` (HTML + CSS + render function); maybe
`tour.js` if the tour targets palette elements.

### Phase 1 definition of done

- `run-all.mjs` green (syntax checks now cover `help.js`).
- Byte-identical baseline still holds (no template changes).
- Changelog entries under `changelog-implemented.md` with the usual
  root-cause + fix + test shape.
- `plan-batches.md` status stamp updated to "all 10 items closed"
  (if C2 is clean; otherwise "9 of 10, C2 needs scroll surgery").

---

## Phase 2 — UX polish (Sprint 8 from PUPIL_FEEDBACK)

Sprint 8 was scoped in [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) and
never shipped — it's the "make every pupil session more fun" bucket.
Total effort: **2–3 focused days**, can split.

### 2.1 — Drawing tool palette (L)

Currently the tile editor is pencil-only.  Pupils asked for fill,
shape, select, resize.

**Plan.**

1. Toolbar above the 8×8 tile editor on the Sprites page:
   **Pencil** (current), **Fill** (flood-fill 4-way by colour),
   **Line** (Bresenham), **Rect** (unfilled + filled variants),
   **Circle** (midpoint circle algorithm), **Select** (rectangular
   marquee → delete / move / resize drag handles).
2. All tools write to `state.sprite_tiles[idx].pixels` and go
   through the existing undo stack — `pushUndo()` called once per
   tool stroke start, not per pixel.
3. **Select → drag handle** implements "change the size of parts"
   (pupil request) without a separate resize tool.  Shift
   constrains to one colour (copies the source palette index to
   every resized cell).
4. Match styling: existing `.color-btn` + `.pe-kind-btn` patterns.
5. Keyboard shortcuts: P (Pencil), F (Fill), L (Line), R (Rect),
   C (Circle), S (Select).  Same one-letter convention as common
   image editors.
6. Tests: new `drawing-tools.mjs` suite.  Feed a known 8×8 pixel
   grid + a tool stroke + assert the expected pixel diff.
   - Flood-fill: single-pixel vs contiguous-region behaviour.
   - Rect/Circle: edge cases at the tile boundary.
   - Select → Move: preserves palette indices.
   - Undo: one Ctrl+Z reverses one tool stroke, not one pixel.

### 2.2 — Palette picker QoL (S)

Two small speed-ups to the NES master-grid picker.

**Plan.**

1. After clicking a palette slot, the master grid enters a
   "hover-to-preview" mode — the active-preview palette updates as
   the mouse moves over master-grid cells, first click assigns the
   colour and closes the mode.  (Today it takes two clicks and
   there's no preview.)
2. Drag a colour from the master grid onto a palette slot (native
   HTML5 drag).  Visual affordance: the slot highlights on
   dragover.  The existing click-then-click flow stays as a
   fallback.
3. **Recent colours** strip (last 8 picks) above the master grid,
   persisted per project in `state.recentPaletteColours[]`.

### 2.3 — Inline animation strip (M)

Pupils struggle to find the Animations panel because it's hidden in
a collapsed `<details>` on the Sprites page.

**Plan.**

1. Promote the current-frame strip inline above the composition
   canvas, with **+ Add frame** right there.  The strip shows the
   first ~6 frames with horizontal scroll for more.
2. Keep the full Animations editor inside the collapsible
   `<details>` for power users who need reordering, FPS tweaks,
   assignment dropdowns, etc.
3. One-line "What's an animation?" tooltip linking to the matching
   Code-page lesson.
4. Tour: add an Animations step that scrolls the strip into view.

### Phase 2 definition of done

Each piece is independently shippable — don't gate them on each
other.  Per piece: code + screenshot in `changelog-implemented.md`,
new test cases in `run-all.mjs`, manual walk-through with pupils (or
at minimum: the teacher).

---

## Phase 3 — Content & templates

Adds new game styles + finishes half-done Builder pieces.  Total
effort: **2–3 days** across four items.

### 3.1 — RPG / top-down preset (M)

Deferred from the pupil-fix pass (noted in auto-memory).  The current
Builder template is platformer-only: gravity, jump, left/right walk.

**Plan.**

1. Add `BuilderDefaults().modules.game.config.style` with values
   `'platformer' | 'topdown'` (platformer stays the default).  New
   radio in the Builder's `game` module UI.
2. New template `tools/tile_editor_web/builder-templates/topdown.c`:
   - 4-way movement (up/down also move py; no gravity).
   - No jump / jmp_up state.
   - Tile-step movement: player moves in `walk_speed`-pixel
     increments on a held direction, or a snap-to-grid step on
     edge-press (configurable).
   - Bounds: `behaviour_walls` still blocks WALL and
     SOLID_GROUND; LADDER is treated as walkable floor
     (simplifies the NES-RPG mental model).
3. Assembler's template loader grows a `chooseTemplate(state)`
   step that returns either `platformer.c` or `topdown.c` based on
   `state.builder.modules.game.config.style`.
4. Most non-player modules (damage, pickups, dialogue, doors, HUD,
   win condition, scene) work unchanged — the player movement and
   gravity are the only things that differ.  Verify by running
   each smoke suite against the top-down template too.
5. New smoke suite `topdown.mjs`: assemble + /play build a top-down
   project, verify the emitted main.c has 4-way movement and lacks
   the gravity loop, and the ROM runs.
6. Documentation: one new subsection in
   [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §1 explaining the
   `style` switch; [PUPIL_GUIDE.md](PUPIL_GUIDE.md) gets a short
   "Pokémon / Zelda-style games" paragraph.

### 3.2 — Multi-line dialogue (M)

Current dialogue boxes are 28 × 1 characters.  Pupils asked for a
proper text window.

**Plan.**

1. Extend the dialogue module's `text` config from `string` to
   `string[]` (up to 3 rows).  Pupil UI: three stacked text inputs
   labelled "Line 1 / Line 2 / Line 3".
2. Template: `BW_DIALOG_ROW_COUNT` macro, emitted as the length.
   `bw_dialogue_text_<r>[]` per row.
3. The bg-nametable-0 restore loop already exists for one row —
   generalise to N rows by looping over `BW_DIALOG_ROW_COUNT`.
4. Vblank budget check: 3 × 28 = 84 writes for a full restore.
   Plus 84 writes for a draw.  Total ~350 cycles worst case —
   well inside budget even with OAM DMA (513) + scroll_stream
   (600).
5. Test: `round2-dialogue.mjs` gets a new case B6 asserting the
   two-row emission + restore both rows on close.

### 3.3 — Per-NPC dialogue text (M)

Today every NPC shares one dialogue string.  Move the string to the
Scene instance so each NPC can have its own.

**Plan.**

1. Add `text` field to `scene.instances[i]` when the sprite's role
   is `npc`.  Builder's scene-instance UI gets a text input that
   only shows for NPC instances.
2. Emit one `bw_dialogue_text_<instance_i>[]` per NPC instance.
3. The dialogue trigger block (per_frame) picks the matching text
   array by the triggering instance's index.
4. Back-compat: if no per-instance text is set, fall back to the
   module-level `text` field (current behaviour).  Migration for
   existing projects: the module-level text stays as a default.
5. Test: `round2-dialogue.mjs` case B7 — two NPCs, distinct
   texts, each triggers its own string.

### 3.4 — P2 jump animation (S)

P2 walk animation works; jump still uses the static layout.  Finish
the symmetry with P1.

**Plan.**

1. Add `role=player2, style=jump` to the tagged-animation pair set
   in playground_server.py.
2. Template: pick the jump animation frames when `jumping2` is
   true, mirroring the P1 block.  Gate behind
   `#if ANIM_PLAYER2_JUMP_COUNT > 0`.
3. Test in `round1-polish.mjs` (P2 animation coverage is already
   there) — add a case J1.

### Phase 3 definition of done

Each item tested + changelogged + docs updated (BUILDER_GUIDE module
reference + PUPIL_GUIDE mention).  Top-down preset gets its own
paragraph in PUPIL_GUIDE because it's a visibly new capability.

---

## Phase 4 — Big, standalone initiatives

Each item here is a sprint on its own.  Don't stack them — each
needs its own focused session.  **Order by risk, safest first:**

### 4.1 — Accessibility pass (M) — DONE 2026-04-25

**Outcome.**  Shipped a shared
[a11y.js](tools/tile_editor_web/a11y.js) module that auto-injects
two controls into every editor page's `<header class="app-header">`
on load:

- **Text size** dropdown (100 / 125 / 150 / 175%) — sets
  `body.style.fontSize` (so `em` / `rem` children scale with it)
  and exposes `--ui-scale` as a CSS custom property.  Persisted as
  `prefs.uiScale`, follows the pupil across all five pages.
- **Theme** dropdown (Standard / High contrast) — toggles
  `<html data-ui-theme="high-contrast">` and an injected `<style>`
  block overrides the page's `:root` CSS variables with WCAG-AA
  pairings (true black bg, true white fg, bright yellow accent,
  forced borders on inputs / selects so they don't disappear).
  Persisted as `prefs.uiTheme`.

The first-run tour on the Backgrounds and Sprites pages now ends
with a step pointing at `.a11y-controls` so pupils discover them.
Canvas scaling was deliberately *not* engineered — every canvas
already has `image-rendering: pixelated`, and browser zoom (Ctrl-+/-)
already handles low-vision pupils' canvas needs without conflicting
with the existing px-sized layout.

**Wiring.**  `<script src="a11y.js"></script>` added once per page
right after `storage.js` so the module can use the existing
`Storage.readPrefs / writePrefs` API.  No per-page CSS or markup
changes beyond the script tag — every page shares the exact same
`:root` block, confirmed via diff.

**Tests.**  New
[tools/builder-tests/a11y.mjs](tools/builder-tests/a11y.mjs) smoke
suite drives a11y.js through a minimal DOM shim, asserts the public
`A11y.apply / A11y.current` API behaves, the high-contrast `<style>`
block injects, the controls land in `.app-header`, and a `change`
event on the dropdown round-trips through `Storage.writePrefs`.
Wired into the standard `run-all.mjs` runner.

### 4.2 — Gallery / showcase (L) — DONE 2026-04-25

**Outcome.**  Pupils can now hit **📤 Publish to gallery** on the
Builder page, type a title / optional description / optional
pseudonymous handle, and the project is captured to a shared gallery
that everyone in the class can browse.  Each entry exposes the ROM
*and* the project JSON for download, so other pupils can remix
each other's work.

**What shipped.**

- **Server endpoints** in
  [playground_server.py](tools/playground_server.py):
  `POST /gallery/publish` (validates body, slugifies title, writes
  rom.nes / preview.png / project.json / metadata.json into
  `tools/gallery/<slug>/`), `GET /gallery/list` (returns metadata
  for every entry, newest first), `GET /gallery/<slug>/<file>`
  (serves the four artefacts; ROM + project JSON sent with
  `Content-Disposition: attachment` so download links work), and
  `POST /gallery/remove` (deletes a folder).  Path-traversal
  rejected via a strict slug regex; payload caps at 4 MB per
  publish (1 MB ROM, 512 KB preview, the rest project state).
- **Gallery page** at
  [gallery.html](tools/tile_editor_web/gallery.html) — card grid
  (preview, title, description, pupil handle, timestamp), per-card
  ▶ Play (loads ROM into the shared `NesEmulator` dialog), ⬇ ROM,
  ⬇ Project (JSON for remix), 🗑 Remove.  Same `<header>` as the
  other pages, so `a11y.js` text-size + theme controls work here
  too.
- **Publish button** on the Builder page
  ([builder.html](tools/tile_editor_web/builder.html)) — opens a
  modal that re-uses the existing `PlayPipeline.play()` build path
  (no second build step), runs the freshly built ROM in a hidden
  jsnes instance for ~30 frames to capture the preview PNG, then
  POSTs `{ title, description, pupil_handle, project, rom_b64,
  preview_b64, source_page }` to `/gallery/publish`.
- **Gallery nav link** added to every editor page
  ([index](tools/tile_editor_web/index.html), [sprites](tools/tile_editor_web/sprites.html),
  [behaviour](tools/tile_editor_web/behaviour.html), [builder](tools/tile_editor_web/builder.html),
  [code](tools/tile_editor_web/code.html)).

**Forward-compatible with future accounts (§4.6).**  Each entry's
metadata.json reserves an `owner` slot (always `null` today) and
`pupil_handle` is already a first-class field — when accounts ship,
publish auto-fills the handle from the signed-in identity, populates
`owner`, and `/gallery/remove` becomes teacher-gated.

**Tests.**  New
[gallery.mjs](tools/builder-tests/gallery.mjs) covers the full
round-trip: empty list → reject missing title → publish (returns
slug) → all four files on disk → list shows the entry with handle +
null owner → ROM bytes match → project JSON round-trips →
path-traversal blocked → remove deletes → remove of unknown slug
returns 404.  Wired into `run-all.mjs`; full suite green.

**Code-page publish** deferred — the Builder is where pupils most
often "finish" something they want to share, and the publish flow
is identical apart from `source_page`.  Add later if pupils ask.

### 4.3 — Audio (L, possibly XL)

The biggest pupil ask but also the biggest engineering risk.  Leave
for last.

**Strategy.**  Vendor the FamiStudio sound engine under
`tools/audio/` (LGPL, NES-standard).  Teach the Makefile to assemble
and link it.  Add an **Audio** page that accepts FamiStudio `.ftm →
.s` exports and stores them alongside `src/`.  Ship `play_music(n)`
and two snippets (`music-on-start`, `jump-sfx`).

**Plan.**

1. Discovery spike (S): check FamiStudio export compatibility with
   cc65-linked projects, measure ROM-size impact of the engine
   (~2 KB), confirm NTSC/PAL handling.
2. Vendor `tools/audio/famistudio_ca65.s` + README on how to
   regenerate.
3. Makefile rule: assemble + link the engine, gated on a
   `USE_AUDIO` flag (0 = off, ROM stays the stock size).
4. Builder: new `audio` module with upload slot + track-index
   config.  Assembler emits `USE_AUDIO=1` + `#define AUDIO_INDEX N`
   when enabled.
5. Snippets: `music-on-start.c` calls `play_music(AUDIO_INDEX)`
   on init; `jump-sfx.c` calls `play_sfx(SFX_JUMP)` on A press.
6. Tests: new `audio.mjs` suite — build with audio off (baseline
   size), build with audio on + a stub .s file, ROM size increases
   but stays under the iNES limit.

**Risks.**  FamiStudio engine wiring on NTSC/PAL, ROM-size budget,
classroom-friendliness (pupils need a way to author tunes — either
ship a browser tracker or settle for importing pre-made .ftm
files).  Worth a discovery sprint before committing.

### 4.4 — Vertical + 2×2 (4-screen) backgrounds (M) — DONE 2026-04-26

**Outcome.**  Both `1×2 (vertical scroll)` and `2×2 (4-screen)`
size options are live again — the alert+revert gate is gone and
the dropdown labels are restored.  The playground server now sets
the iNES header's 4-screen-VRAM bit on every build whose project
has any background with `screens_y > 1`, so emulators allocate four
physically-distinct nametables and the existing scroll core's
`load_world_bg` + `scroll_stream` address arithmetic for `$2800`
/ `$2C00` lands in the right RAM.

**How the fix works (and why it isn't done in the cfg).**  cc65
v2.18's `nes.lib` ignores the `NES_MIRRORING` weak symbol — every
ROM produced by this toolchain comes back with iNES byte 6 = `0x03`
regardless of the cfg (verified empirically before committing the
fix).  Reaching the 4-screen bit through `cfg/nes.cfg` is therefore
a dead end on this toolchain.  Instead,
[playground_server.py](tools/playground_server.py) gained a tiny
`_patch_ines_four_screen` helper that, for builds whose state has
any vertical-scroll background, ORs `0x08` into byte 6 of the
returned ROM bytes after the build finishes.  Cost: one byte of
mutation per build, no header-segment overrides, no per-project
cfg generation.  Horizontal-only worlds (`2×1`) keep V-mirror —
that's the right choice and it's what the byte-identical-baseline
test pins down.

**Tests.**  New
[four-screen.mjs](tools/builder-tests/four-screen.mjs) regression
suite builds a 1×1, 2×1, 1×2 and 2×2 ROM and asserts the byte 6
4-screen bit reflects the project's `screens_y`.  Wired into
`run-all.mjs`; the byte-identical-baseline invariant for 1×1 still
passes (the patch is a no-op for that path).

**Outstanding (non-blocking).**

- **Two residual bugs surfaced on the pupil's 2026-04-26 playtest.**
  The catastrophic V-mirror corruption is gone but two narrower
  symptoms remain; pupil is collecting FCEUX captures before we dig
  in, so left as `[new]` rather than pre-emptively fixed.  See the
  matching PUPIL_FEEDBACK entry under *Scrolling* for the leading
  hypotheses; in brief:
    1. **First frame shows the wrong part of the BG.**  Suspected
       initial-state issue — PPU_CTRL bits 0/1 may be non-zero
       before the first `scroll_apply_ppu`, or the first pre-render
       T→V copy fires before scroll_apply_ppu writes T.
    2. **Reaching the bottom of the bottom screen wraps to the top
       screen.**  Likely the clamp in `scroll_follow` lets `cam_y`
       advance one tile too far, so PPU coarse-Y rolls past 29 and
       toggles NT_y back to the top.  Could also be a missing
       `row < BG_WORLD_ROWS` guard on `scroll_stream`'s vertical
       row write.
- Manual playtest in fceux + jsnes on a real 1×2 / 2×2 pupil project
  to confirm the in-game scroll is clean once the two residuals
  above are fixed.
- 4-screen VRAM is rare on real NROM hardware (most carts physically
  ship two banks of nametable RAM).  Browser jsnes and fceux honour
  the iNES bit regardless; pupils running on a 60-pin Famicom flash
  cart may still see corruption.  Document the caveat in pupil docs
  if/when that comes up.
- Worlds wider/taller than 2 screens (e.g. 3×3) still need streaming
  on *both* axes plus 4-screen.  Out of scope for this entry; track
  separately if a pupil ever asks.

### 4.6 — Pupil + teacher accounts (future, optional) (L)

**Why.**  A natural follow-up to the gallery (4.2) and to teacher
moderation generally — once pupils start publishing, teachers want
to see "everything pupil X has shared" / "open pupil X's project to
make a tweak" without copying files between machines.  Today the
gallery and per-machine project storage are entirely identity-less;
that's deliberate, and accounts must remain **opt-in** so a pupil
can keep working without ever signing in.

**Hard privacy constraints.**

- **No real names anywhere.**  Pupils pick a pseudonymous handle
  (`pixel-cactus-42`, `level-design-jen`, etc.) — the same field
  the gallery already exposes today.
- **No personal info collected.**  No email, no DOB, no class, no
  free-text "about me".  The handle and a teacher-issued group code
  are the only identifiers stored.
- **Teacher accounts** are issued out-of-band by whoever administers
  the install.  Teachers can list / open / edit / delete projects
  belonging to handles in their group; nothing more.
- **Local-first.**  Same single-machine classroom story still works
  with accounts disabled — accounts only matter when the playground
  is shared across machines (gallery export bundle, network deploy).

**Plan (sketch — flesh out when scheduled).**

1. **Identity model.**  Server gains `tools/accounts/` with
   `handles.json` (`{ handle, group, role, created_at }`) and
   `groups.json` (`{ group, teacher_handle, joined_handles }`).
   No per-handle password — login is "type your handle, type the
   group code" (the `joined_handles` check authenticates).  This
   matches how schools already manage shared-class kit; teachers
   can reset / reissue codes by editing the JSON.
2. **Wire the gallery's existing hooks.**  4.2 already records
   `pupil_handle` + a reserved `owner` slot in `metadata.json` —
   accounts populate `owner` and gate `/gallery/remove` on the
   teacher of the owning handle's group.
3. **Teacher dashboard** — new page listing every project + gallery
   entry by group, with "open" / "remove" / "rename" actions.  Uses
   the same `Storage.*` API the editor pages use, scoped to the
   teacher's group.
4. **Optional sign-in widget** in the editor header.  Stays signed
   out by default; signing in tags subsequent gallery publishes
   with the handle automatically.
5. **Audit log** — every teacher edit / remove writes a line to
   `tools/accounts/audit.jsonl` so a pupil who claims "the teacher
   broke my project" has a paper trail.

**Risks.**  Network-deploy story is a separate scope (today the
playground is a localhost server).  Don't ship accounts without a
matching deployment plan, or pupils will sign in on machine A and
not see their work on machine B.  Probably L+ once that's factored.

### 4.5 — Nice-to-haves worth keeping on the list

Not big enough for their own phase row, but still worth tracking:

- **Getting-started GIFs/videos** — content production, outside
  this engineering plan but pupil-requested.
- **Sprite flicker mitigation (OAM cycling)** — rotate the OAM
  draw order each frame so scanlines with >8 sprites distribute
  the flicker evenly instead of always dropping the same ones.
  Classic NES trick, maybe 30 lines of code in the DMA-build path.
  **Do this inside Phase 1.1 if C2 turns out to need a deeper
  fix**, otherwise defer.
- **Player-vs-player collision** — not implemented in Builder
  templates; trivial to add behind a checkbox.
- **Scene exits (Sprint 9.1 from PUPIL_FEEDBACK)** — partially
  superseded by multi-background doors, but horizontal-edge exits
  are a different UX pupils have asked for.
- **Animation pairs** — `enemy + idle`, `npc + walk`, `npc + idle`
  are one-micro-chunk-each once pupils ask.

---

## Recommended ordering

1. **Phase 1.1 first** (verify C2).
2. **Phase 1.2–1.4** as one session — three small polish items,
   close out plan-batches.md entirely.
3. **Phase 2** across two sessions — drawing tools alone is a day;
   palette QoL + animation strip fit together in another.
4. **Phase 3.1 (RPG preset)** when pupils ask for it.  High
   motivation, visible scope.
5. **Phase 3.2–3.4** folded in as follow-up asks come — they're
   small continuations of existing work.
6. **Phase 4.1 Accessibility** first.
7. **Phase 4.2 Gallery** second.
8. **Phase 4.3 Audio** last — discovery spike before committing.
9. **Phase 4.4 (2×2 backgrounds)** — schedule when a pupil hits
   the alert often enough to be a nuisance, or when the RPG /
   top-down content stream is producing 4-screen-shaped worlds.
10. **Phase 4.5 nice-to-haves** picked up opportunistically — OAM
    cycling may come early if scroll flicker needs it.

## Out of scope

- Networked multiplayer.
- Per-pupil accounts / cloud saves.
- Mobile / tablet support (every editor page assumes a keyboard).
- Audio engine rewrite from scratch (piggy-back on FamiStudio).
- Automatic pixel-art-from-PNG importer (nice, but big, and needs
  a palette quantiser pupils won't touch often).

## Definition of done per phase

Every phase closes with:

- All items landed with changelog entries.
- `node tools/builder-tests/run-all.mjs` green.
- Byte-identical baseline invariant still passing.
- Docs updated where the pupil-visible UX changed
  (BUILDER_GUIDE / PUPIL_GUIDE / TEACHER_GUIDE / README / feedback
  log).
- Pupil walkthrough at the start of the next classroom session to
  gather fresh feedback.
