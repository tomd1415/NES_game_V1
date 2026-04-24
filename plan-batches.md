# Pupil-feedback batches — implementation plan

> **Status (2026-04-24).**  Shipped: Batch A (unified Play pipeline
> with stub-player fallback, Download-ROM button, fceux selector), C1
> (ladders no longer climb through solid ground), B4 (Builder
> scene-instance row layout), and the Play-experience follow-up —
> `capabilities()` now probes `/health` so Local (fceux) works on
> every page, and the Builder's embedded NES emulator is extracted to
> a shared `emulator.js` module that Backgrounds + Behaviour now use
> too (so "Play in NES" gives the same in-page dialog everywhere).
> Remaining: Batch B items 3 (help popover tabs), 4 (project-menu
> consistency), 5 (Backgrounds palette selector), and C2 (scroll
> flicker).  See `changelog-implemented.md` for the full write-ups.

Follow-up to the 2026-04-24 pupil testing round. The ten outstanding
items from that list are grouped into three batches that each fit into
roughly one focused session.  Batch A is the architectural core and
unblocks four of the items on its own, so do it first.

- **Batch A — Unified Play pipeline** — items 1, 2, 8, 10
- **Batch B — UI polish** — items 3, 4, 5, 9
- **Batch C — Runtime bugs** — items 6, 7

Each section below has the goal, the exact sub-tasks, the files to
touch, a testing plan, and known risks.

---

## Batch A — Unified Play pipeline

### Goal

Every editor page uses **one** "assemble + build + launch" code path,
driven entirely by the Builder's module state (`state.builder.modules`).
Missing sprites, empty nametables, or a brand-new project all produce
a working ROM via fallback defaults — even "one empty background"
should Play and show an empty screen.  Once that path exists, the
Download-ROM button and the native-emulator selector hang off it
almost for free.

### Current state (2026-04-24)

Audit before starting:

- Every page (`index.html`, `sprites.html`, `behaviour.html`,
  `builder.html`, `code.html`) has its own Play flow.
- `builder.html:1569` hardcodes `mode: 'browser'` and uses
  `BuilderAssembler.assemble(...)` + `customMainC`.
- `sprites.html:6665-6684` and `code.html:1542-1555` probe
  `/capabilities` for `fceux` and expose a "native" emulator option;
  the other pages do not.  The Builder page therefore can't launch the
  local emulator even when one is installed.
- `playground_server.py:1882-1948` — `/play` accepts `mode` ∈
  {`browser`, `native`}, returns ROM bytes for browser, launches
  `fceux` for native.  It **always** builds the ROM, so the bytes are
  already available — no need for a new endpoint for download.

### Sub-tasks

**A1. Fortify `BuilderAssembler` + `BuilderDefaults` so every minimal
state produces a valid ROM.**

- No-player fallback: if no sprite has `role: 'player'`, assemble
  skips the player-drive block (or substitutes a static 1×1 stub
  sprite).  Gate every `players.player1` code emission behind a
  "player sprite exists" check — today it assumes the player sprite
  is present.
- No-scene-sprites fallback: `NUM_STATIC_SPRITES = 0` already works
  in `scene.inc` (stub array emitted), but verify every
  `applyToTemplate` that iterates `ss_*` is guarded by a `count > 0`
  check.
- Empty-background fallback: if the active background has no tiles
  painted, emit a valid one-screen nametable filled with tile 0 (we
  already do this, but verify no assumption about "at least one
  painted tile").
- Empty dialogue / HUD / damage modules stay off by default
  (already true) — just confirm nothing still expects them.

**A2. Extract `play-pipeline.js` shared helper.**

New file `tools/tile_editor_web/play-pipeline.js` exporting:

```js
window.PlayPipeline = {
  // Build the body for POST /play from the current page's state.
  // Callers pass { mode: 'browser'|'native', download: bool }.
  buildPlayRequest(state, opts) { ... },

  // Run the whole flow: assemble customMainC, POST /play, show the
  // result (browser ROM in an <iframe>/jsnes, native launches fceux,
  // or download triggers a file save).  Returns a Promise.
  play(state, opts) { ... },

  // Probe /capabilities once and cache; the emulator selector reads
  // from here.
  capabilities() { ... },
};
```

Move from `builder.html` into the helper:

- The `assemble(state, templateText)` + error-report path
- The `findSpritesByRole('player')` + `playerStart` lookup
- The `sceneSprites` array construction
- The POST + response handling

Each page becomes ~10 lines: load state, call
`PlayPipeline.play(state, { mode: selectedMode })`.

**A3. Add a reusable `<play-controls>` block.**

Each page's header gets a small control group:

```html
<div class="play-controls">
  <button id="btn-play">▶ Play</button>
  <button id="btn-download">⬇ Download ROM</button>
  <select id="play-mode">
    <option value="browser">In browser</option>
    <option value="native">Local emulator (fceux)</option>
  </select>
</div>
```

- `#btn-play` → `PlayPipeline.play(state, { mode })`
- `#btn-download` → `PlayPipeline.play(state, { mode: 'browser', download: true })`
  (the ROM bytes are already returned; just trigger a
  `<a download>`-style save).
- `#play-mode` → populated from `PlayPipeline.capabilities()`.
  Native option is disabled + tooltip-explained when fceux is
  absent.

**A4. Settle on where the "Builder state" lives for pages that don't
have the Builder tree visible.**

The Builder state is a property of the project (`state.builder`).  Every
page already loads + saves the same project via `Storage.loadCurrent /
saveCurrent`, so `state.builder` is available everywhere — no new
storage needed.  Verify:

- `createDefaultState()` in each page includes a `builder:
  BuilderDefaults()` entry when creating a fresh project (it may
  only be set when the Builder page first runs — needs checking).
- Migrating a pre-Builder project on load fills in the default
  Builder tree.

**A5. Surface the native-emulator selector on every page.**

After A3 this is automatic — the shared control group reads
capabilities and enables/disables the native option.  For item 8 add a
one-liner explanation tooltip: "Local emulator uses fceux on the
playground server's machine; switch the server to a computer with
fceux installed to enable this."

**A6. Tests.**

Extend `tools/builder-tests/run-all.mjs` with a new suite
`shared-play.mjs`:

- State with *only* a background (no sprites at all) → `/play` returns
  `ok=true`, non-empty ROM.
- State with no player sprite → ROM builds; the emitted main
  contains the player-sprite stub (or omits the player-drive block
  entirely, whichever we chose).
- State with one enemy, no walker AI → ROM builds; enemy is static.
- `buildPlayRequest` produces identical output regardless of which
  page "type" loaded the state.

Also a manual check matrix: open every page, click Play, confirm it
plays; click Download, confirm a `.nes` file is saved; toggle to
native and back.

### Files touched

- New: `tools/tile_editor_web/play-pipeline.js`
- Modified: every page's HTML (`index.html`, `sprites.html`,
  `behaviour.html`, `builder.html`, `code.html`) — add
  `<script src="play-pipeline.js">`, add `<play-controls>` header
  block, delete local Play code, wire events to the shared helper.
- Modified: `tools/tile_editor_web/builder-modules.js` +
  `builder-assembler.js` — no-player / empty-scene fallbacks.
- Modified: `tools/builder-tests/run-all.mjs` — add `shared-play.mjs`
  to the suite list.
- New: `tools/builder-tests/shared-play.mjs`.

### Risks / open questions

- **Assembler fallbacks might break the byte-identical baseline
  invariant.**  If we change how `players.player1` emits when no
  player sprite exists, we must gate that behind "no player exists"
  so the baseline path is untouched.  Verify with `run-all.mjs`
  before finalising.
- **Native emulator on a pupil's laptop.**  fceux runs on the
  *server's* machine, not the pupil's.  This is fine in a classroom
  where the server is the teacher's computer, but the wording of the
  selector tooltip must make that explicit.
- **Preview canvas in the Builder page.**  The current Builder page
  has its own in-page preview canvas; moving the Play button up to
  the shared header doesn't break it, but verify layout survives.

### Rough effort

One focused session (~half a day), mostly refactoring.  A1 is the
slowest piece because it requires walking every `applyToTemplate`.

---

## Batch B — UI polish

### Goal

Consistency across pages so pupils are not surprised when they
navigate.  Four independent UI fixes; do them in any order.

### B1 — Help popover: page-specific first, tabs for the rest,
feedback tab always present (item 3)

**Current state.**  Each page has its own `<dialog id="help-dialog">`
with bespoke content and no tab navigation.  Backgrounds page already
has tabs; others do not.  The feedback form exists (via `feedback.js`)
but is only surfaced on some pages.

**Plan.**

1. Extract the tabbed help shell into `tools/tile_editor_web/help.js`:
   - `HelpPopover.open(currentPage, opts)` — renders a dialog with
     tabs in the order `[current, Backgrounds, Sprites, Behaviour,
     Builder, Code, Feedback]`; current tab is first + auto-selected.
   - Each tab's body loads from a page-local
     `HelpPopover.register(pageId, html)` call so each page can
     still author its own copy.
2. Replace every page's inline `<dialog id="help-dialog">` with the
   shared template (minimal markup, the rest is built by the helper).
3. Standardise the Feedback tab: call into `feedback.js` the same way
   on every page, pass `{ source: pageId }` so submissions are
   attributable.
4. Wire the `?` button + `?` keybinding on every page to call
   `HelpPopover.open(pageId)`.

**Files.**  New `help.js`; touches every `*.html`.

### B2 — Project dropdown consistency (item 4)

**Current state.**  `index.html` (Backgrounds) has a richer project
menu than the others.

**Plan.**

1. Catalogue every menu item currently on index.html.  Candidates:
   New, Open, Save, Rename, Duplicate, Delete, Export (.json),
   Import (.json).
2. Define the canonical menu in `storage.js` (already the central
   state-persistence module): export
   `Storage.projectMenuEntries(pageId)` returning the list.
3. Each page renders the dropdown from that list.  Handlers live
   in the shared module too — today they're duplicated per page.

**Files.**  `storage.js`; every `*.html`.

### B3 — Palette selector on Backgrounds page (item 5)

**Current state.**  `index.html` lines 1085-1110 host a palette
toolbar + "All palettes" overview.  Pupils report it's hard to find —
probably because it's in the right-hand panel while the "paint"
action happens in the central canvas, and the currently-active
palette isn't shown prominently in the flow.

**Plan.**

1. Compare side-by-side with Sprites-page palette selector
   (`sprites.html` — look at how `#sprite-side-swatches` works).
   That pattern — the active row of four colour squares sits
   immediately above the canvas where the pupil is painting — is
   what pupils expect.
2. Promote the four active BG-palette swatches into a horizontal
   strip directly above the nametable canvas; keep the full
   "All palettes" overview in the right panel as before.
3. Make the strip click-to-pick: clicking swatch 1/2/3 sets
   `currentColour`; clicking the small palette-number label to its
   left switches which BG palette is active for the next paint.
4. Update the onboarding tour (`tour.js`) so the first step points
   at the new strip.

**Files.**  `index.html`; possibly `tour.js`.

### B4 — Builder sprite-list layout (item 9)

**Current state.**  The instance list (scene module) is rendered by
the scene module's `customRender` path in `builder.html`.  Delete
button is wide; columns are not aligned.

**Plan.**

1. Find the render function (search `scheduleSave` + `draggableSprite`
   + `del.textContent = '🗑'` region — around `builder.html:1074`).
2. Re-do as a CSS grid row:
   `[thumb] [name/role] [x spinner] [y spinner] [ai select] [🗑]` with
   fixed column widths.
3. Delete button → 32×32 icon-only button with a tooltip; remove the
   wide text label.
4. Row hover highlight so pupils can see the drag affordance.
5. When no instances yet, show a short placeholder ("Drag a sprite
   onto the preview to place it") instead of an empty list.

**Files.**  `builder.html` (inline CSS + render function only).

### Testing for Batch B

Every change is purely visual.  Test plan:

- Open each page, confirm help dialog has the right tab
  configuration and the Feedback tab submits successfully.
- Confirm the project dropdown is identical across pages (menu
  item order + wording).
- Backgrounds: paint a tile, swap palette via the new strip, paint
  again, confirm the second tile uses the new palette.
- Builder: place 3 scene sprites of varying name length; delete
  one; confirm row layout stays aligned and the delete button is
  compact.
- Re-run `run-all.mjs` to make sure syntax checks + smoke suites
  are untouched.

### Rough effort

Half a day across the four items; they're independent so can be
split across two shorter sessions.

---

## Batch C — Runtime bugs

### C1 — Ladders let player through solid ground (item 6)

**Hypothesis.**  Climbing input bypasses the solid-ground-foot
collision check.  When the player is on a ladder tile and presses up,
the Y position decreases unconditionally, so a ladder positioned
directly above a solid-ground tile lets the player pass through it.

**Investigation plan.**

1. Write a repro: 32×30 level, single ladder column, solid-ground
   row crossing through it, climb up from below.
2. Locate the climb code in `tools/tile_editor_web/builder-templates/platformer.c`
   (search `BEHAVIOUR_LADDER` / `climb_speed` — likely around the
   per-frame player-movement block).
3. Trace the exact condition: does climbing only update `py` if the
   target cell isn't solid ground?

**Likely fix.**

- Before applying `py -= climb_speed`, look up the target cell's
  behaviour.  Block if it is `SOLID_GROUND` **and** the current cell
  is not also solid ground (so the player can still leave a ladder
  by climbing into one).
- Or simpler: `solid_ground` is opaque from below but not from
  above — only block when the previous `py` puts the player's top
  edge in clear space and the new `py` would cross a solid-ground
  boundary.  Test both and pick the one that reads better.

**Test.**

- New `tools/builder-tests/ladder-solid.mjs` suite: build ROM,
  trace frame-by-frame Y position via jsnes, assert the player
  does not cross a solid-ground row when climbing.

### C2 — Scroll flicker (item 7)

**This is the hardest item — give it a session of its own.**

**Current state.**  Scrolling projects use `scroll_stream()` +
`scroll_apply_ppu()` in `steps/Step_Playground/src/scroll.c`.
Flickering points at a PPU-write timing problem: something is writing
while rendering is enabled, or scroll + sprite OAM writes are
overlapping in a way that confuses the PPU.

**Investigation plan.**

1. Get a reproducible case.  Pupil demo project + a scrolling test
   project.  Record the emulator output so we can watch frame-by-
   frame.
2. Enumerate every per-frame PPU access in the scrolling build in
   order:
   - `waitvsync()` — NMI fires
   - dialogue `vblank_writes` (if BW_DIALOGUE_ENABLED)
   - `scroll_stream()` — may write a whole column/row
   - Player + P2 sprite OAM writes
   - Scene-sprite OAM writes
   - `scroll_apply_ppu()` — final PPU_CTRL / PPU_SCROLL
3. Budget the cycles.  Typical NTSC vblank = ~2273 CPU cycles.
   Column write = 30 tiles × ~20 cycles = 600; row write = 32 × ~20
   = 640; + OAM + dialogue.  Worst-case frame (scroll-y change +
   scroll-x change + dialogue open) likely **over budget**.
4. Hypothesis A: vblank overrun when `scroll_stream` does both a row
   and a column in the same frame.  Fix: cap `scroll_stream` to one
   transfer per vblank; carry the other to the next frame.
5. Hypothesis B: `PPU_ADDR` / `PPU_SCROLL` race when the dialogue
   writes land between `scroll_stream` and `scroll_apply_ppu`.  Fix:
   reorder so dialogue writes are finished before any scroll PPU
   writes begin.
6. Hypothesis C: the +32-stride mode for column streaming is being
   left on when the dialogue vblank_writes runs on a subsequent
   frame.  Fix: always reset to +1 stride at the end of
   `scroll_stream`.

**Test.**

- `tools/builder-tests/scroll-timing.mjs`: build the repro, run
  through jsnes for N frames, compare screen buffer against a
  golden PNG.  Any pixels changed that shouldn't be → fail.

### Files touched

- `tools/tile_editor_web/builder-templates/platformer.c` — climbing
  collision fix.
- `steps/Step_Playground/src/scroll.c` — PPU-write reordering /
  cycle capping.
- New test suites: `ladder-solid.mjs`, `scroll-timing.mjs`.

### Risks

- **Scroll flicker may be hardware-corner-case dependent.**  jsnes
  tolerates more than real hardware; a green run on jsnes is
  necessary but not sufficient.  Pair with `fceux` run before
  calling it done.
- **Ladder fix could break existing climb feel.**  Hand-test one of
  the pupil demos that uses ladders before shipping.

### Rough effort

C1: ~1–2 hours.  C2: a full session, possibly more.

---

## Sequencing and dependencies

```
  ┌──────────────────────────┐
  │ Batch A: Play pipeline   │    ← do first; unblocks 4 items
  │   (items 1, 2, 8, 10)    │
  └──────────┬───────────────┘
             │
             ▼
  ┌──────────────────────────┐      ┌──────────────────────────┐
  │ Batch B: UI polish       │      │ Batch C: Runtime bugs    │
  │   (items 3, 4, 5, 9)     │      │   (items 6, 7)           │
  └──────────────────────────┘      └──────────────────────────┘
         (independent)                   (independent; C2 big)
```

After Batch A, B and C are parallel and low-coupling.  A reasonable
real-world order: **A → C1 → B1 → B2/B3/B4 → C2** so the scroll-flicker
investigation (the long one) lands last, when the rest of the codebase
is in its calmer post-refactor state.

## Definition of done

For each batch:

- Code changes merged with tests green (`node
  tools/builder-tests/run-all.mjs`).
- Byte-identical baseline ROM hash still matches
  `c77d502b7439` (Step_Playground stock build).
- Changelog entry under `changelog-implemented.md`.
- Short section in `BUILDER_GUIDE.md` / `PUPIL_GUIDE.md` /
  `TEACHER_GUIDE.md` if the pupil-facing UI changed.
- Manual smoke: open every page, exercise the new controls.

## Out of scope (for now)

Items already marked deferred in `PUPIL_FEEDBACK.md` (multi-line
dialogue, per-NPC text, P2 HP wiring, RPG grid-step preset, sound)
are not part of these batches.  Revisit once all ten pupil-reported
items are closed.
