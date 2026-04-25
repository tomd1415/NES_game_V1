# Next-steps plan (post pupil-fix pass)

> **Status stamp (2026-04-25).**  Phase 1 complete except 1.1 C2
> (parked pending teacher investigation).  **Phase 2 is done** —
> 2.2 (palette picker QoL: hover-to-preview + recent colours),
> 2.3 (inline animation strip above the composition canvas) and
> 2.1 (drawing tools) all shipped.  2.1 was mostly already in place
> from Sprint 9; this session closed the remaining gaps (filled
> Rect + filled Circle tool variants, Alt-letter keyboard shortcuts
> for tool switching, centralised tool-type check).  Still deferred
> from 2.1's spec: Select → resize drag handles, shelved as a
> self-contained follow-up.  All Phase 1 polish items landed:
> shared `help.js` page-tabs + Feedback toggle (1.2), project-
> dropdown parity (1.3), Backgrounds paint-with-palette row (1.4).
> See the "Phase 1", "Scroll-flicker follow-up", and "Phase 2.1 /
> 2.2 / 2.3" entries in
> [changelog-implemented.md](changelog-implemented.md).  **Next:
> Phase 3** (content & templates — RPG top-down preset, multi-line
> dialogue, per-NPC dialogue, P2 jump animation).

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

### 1.1 — Verify C2 (scroll flicker) (S)

**Why first.**  The OAM-DMA fix we shipped addresses the most common
fceux-visible-but-jsnes-clean timing issue.  It may already have
killed the scroll flicker pupils reported.  Worth measuring before
doing any deeper scroll-stream refactoring.

**Plan.**

1. Build (or load) a two-screen horizontal-scroll test project with
   several scene sprites that move.
2. Play in Local mode (fceux).  Compare against the pre-OAM-DMA
   behaviour if possible (git stash + pre-fix build, or screenshots
   the user already has).
3. **If clean:** mark C2 done in the changelog and close the
   pupil-feedback pass entirely.
4. **If flicker remains:** dig into `scroll.c`'s `scroll_stream()` +
   `scroll_apply_ppu()` timing.  Leading candidates from the
   plan-batches.md Batch C section:
   - Scroll column + row transfer in the same vblank overruns
     budget.  Fix: cap `scroll_stream` to one transfer per vblank
     and carry the other to the next frame.
   - `PPU_CTRL` stride bit (+32 vs +1) left at the wrong value.
     Fix: always reset to +1 at the end of `scroll_stream`.
   - Dialogue vblank writes interleaving with scroll writes.  Fix:
     reorder so dialogue finishes before scroll_stream starts.

**Deliverable.**  Either a confirm-clean note in the changelog, or
a targeted scroll-timing fix plus regression guard.  This step is
**manual** — automated glitch detection on jsnes isn't meaningful
when jsnes already tolerates the timing our ROM used to have.

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

### 1.3 — Project-dropdown parity (S)

**Goal.**  Every page shows the same project menu (New / Open /
Save / Rename / Duplicate / Delete / Import / Export).  Today
Backgrounds has the full menu and the others are sparser.

**Plan.**

1. Catalogue each page's current `<details class="projects-menu">`
   contents.
2. Add `Storage.projectMenuEntries(pageId)` returning a canonical
   list of `{ id, label, handler, section }` entries.  Handlers move
   into `storage.js` too so they're not duplicated five times (the
   Backgrounds page handlers are the most complete; those become
   the canonical implementations).
3. A `Storage.renderProjectMenu(hostElement, pageId)` helper
   renders the dropdown from that list.  Each page calls it after
   loading state.
4. Page-specific extras (e.g. the Backgrounds-page Import/Export of
   `.chr` / `.nam` / `.pal` files) stay local — the shared menu
   only covers project-level actions.
5. Test: project lifecycle (New → edit → Save → Rename → Duplicate
   → Delete → Open) works identically from every page.  Storage is
   already well-covered by smoke tests, so the new helper just
   delegates.

**Files touched.**  `storage.js`; every `*.html`.

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

### 4.1 — Accessibility pass (M)

Starting here because it's the lowest-risk and most immediately
helpful — pupils with small laptops, big monitors, or low-vision
needs all benefit.

**Plan.**

- `--ui-scale` CSS custom property driven by a header dropdown
  (`100% / 125% / 150% / 175%`), persisted in `prefs.uiScale`.
  Applied to `body` font-size so headings + buttons + tooltips
  all grow.
- Canvas scaling so the 8×8 tile editor + sprite preview + nametable
  enlarge with the text — use CSS `transform: scale()` on the
  canvas parent so the bitmaps stay crisp.
- High-contrast theme toggle alongside the existing `bgTheme`
  (dark / mid / light).  New "high-contrast" theme with WCAG-AA
  pairings; one extra row in the theme selector.
- Update the tour to mention the UI-scale control on the first
  load so pupils who need it find it immediately.
- Tests: new `a11y.mjs` suite that smoke-checks
  `document.querySelector(':root').style.getPropertyValue('--ui-scale')`
  round-trips correctly after a toggle.

### 4.2 — Gallery / showcase (L)

Pupils asked for a way to share their work.  Medium risk — mostly
a server-side file dance with a moderation UI.

**Plan.**

- `tools/playground_server.py` grows a **Publish to gallery**
  endpoint that copies the current `game.nes`, a preview PNG (the
  first frame captured via jsnes), and project metadata into
  `tools/gallery/<slug>/`.
- A new `/gallery` page lists every published project with
  card-style previews.  Clicking a card loads the ROM into the
  shared embedded emulator (`emulator.js`) read-only.
- Publish-from-page button on Builder + Code pages: opens a
  confirm dialog with a title + description + "Remove" link
  shown to the teacher account.
- No accounts — gallery entries are per-machine, teacher curates
  by deleting folders.
- Stretch: **Export gallery bundle** zips
  `tools/gallery/` for cross-machine sharing.
- Tests: new `gallery.mjs` suite — publish → list → load → unpublish
  round-trip.

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

### 4.4 — Nice-to-haves worth keeping on the list

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
9. **Phase 4.4 nice-to-haves** picked up opportunistically — OAM
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
