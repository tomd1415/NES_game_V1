# Next-steps plan (post pupil-fix pass)

Where to go from here, as of 2026-04-24.  The two preceding plan docs
remain useful history:

- [plan-batches.md](plan-batches.md) — the three-batch pupil-feedback
  pass.  All of Batch A, C1, B4, plus the OAM-DMA / stale-ROM /
  embedded-emulator follow-ups shipped in that pass.
- [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) — the long-running log of
  pupil comments; its "Proposed roadmap — next sprints" already sketches
  Sprints 6–9.  Sprints 6 and 7 are done; Sprints 8 and 9 are what
  this plan is really about.

This document groups the remaining work into four phases, in order of
value-per-hour.  **Phase 1** closes the pupil-feedback pass outright.
**Phase 2** is the delight-per-day polish Sprint 8 already scoped.
**Phase 3** is content expansion (presets, dialogue, animation pairs).
**Phase 4** collects the bigger-but-standalone initiatives — do them
one at a time.

Effort key: **S** ≈ half a day, **M** ≈ one focused day, **L** ≈ a
sprint (2–4 days).

---

## Phase 1 — Close the pupil-feedback backlog

The last four items from [plan-batches.md](plan-batches.md).  Each is
small on its own; grouping them into one session gives pupils a
visibly nicer editor next time they sit down.

### 1.1 — Verify C2 (scroll flicker) (S)

**Why first.**  The OAM-DMA fix we shipped addresses the most common
fceux-visible-but-jsnes-clean timing issue.  It may already have
killed the scroll flicker pupils reported.  Worth measuring before
doing any deeper scroll-stream refactoring.

**Plan.**

1. Build a two-screen horizontal-scroll test project with several
   scene sprites that move.
2. Play in Local mode (fceux).  Compare against the pre-OAM-DMA
   behaviour if possible (git stash + pre-fix build, or screenshots
   the user already has).
3. **If clean:** mark C2 done in the changelog and close.
4. **If flicker remains:** dig into `scroll.c`'s `scroll_stream()` +
   `scroll_apply_ppu()` timing.  Hypotheses already captured in
   plan-batches.md Batch C section — leading candidates: scroll
   column + row transfer in the same vblank overruns budget, or
   the `PPU_CTRL` stride bit is being left at +32 at the wrong
   moment.  Measure, then fix with minimal targeted change.

### 1.2 — Batch B3: Help popover tabs + feedback tab (M)

**Goal.**  One `?` button opens a tabbed help dialog: current page
first, tabs for every other page, a Feedback tab always present.

**Plan.**

1. Factor the tab-shell into `tools/tile_editor_web/help.js`.
   Exposes `HelpPopover.register(pageId, htmlString)` and
   `HelpPopover.open(currentPageId)`.
2. Each page calls `register` once with its own copy (carries
   forward whatever inline help content the page already had).
3. Rewire every `btn-help` / `?`-key handler to
   `HelpPopover.open(thisPage)`.
4. Feedback tab wraps `feedback.js`'s existing form and passes
   `source: pageId` so teacher-side analytics know which page the
   feedback came from.
5. Test: open each page, check tab ordering + the Feedback tab
   submits successfully; run `run-all.mjs`.

### 1.3 — Batch B4: Project-dropdown parity (S)

**Goal.**  Every page shows the same project menu (New / Open / Save /
Rename / Duplicate / Delete / Import / Export).  Today, Backgrounds
has the full menu and the others are sparser.

**Plan.**

1. Audit each page's current menu contents.
2. Add `Storage.projectMenuEntries(pageId)` returning a canonical list
   + handlers to `storage.js`.
3. Each page renders the dropdown from that helper — handlers move
   into `storage.js` too so they're not duplicated five times.

### 1.4 — Batch B5: Backgrounds palette selector facelift (S)

**Goal.**  Promote the active-palette swatches above the nametable
canvas so pupils can see + switch the painting palette without
hunting in the right-hand panel.  Mirror the pattern that already
works well on Sprites.

**Plan.**

1. Compare the Sprites page's `#sprite-side-swatches` behaviour.
2. Add a horizontal strip (BG palette N + three colour cells) right
   above the nametable canvas.  Clicking a cell picks the paint
   colour; clicking the palette label switches to BG N.
3. Keep the "All palettes" overview panel untouched — it's for
   editing, not picking.
4. Update the tour (`tour.js`) so the first step highlights the new
   strip.

### Phase 1 definition of done

- `run-all.mjs` green.
- Byte-identical baseline still holds (no template changes in these
  items, so this should be trivially true).
- Changelog entries under `changelog-implemented.md` with the usual
  root-cause + fix + test shape.
- `plan-batches.md` status stamp updated to "all 10 items closed".

Rough total: **half a day to a day** if C2 is clean; up to **two days**
if C2 needs scroll-timing surgery.

---

## Phase 2 — UX polish (Sprint 8 from PUPIL_FEEDBACK)

Sprint 8 was scoped in [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) and
never shipped — it's the "make every pupil session more fun"
bucket.

### 2.1 — Drawing tool palette (L)

Currently the tile editor is pencil-only.  Pupils asked for fill,
shape, select, resize.

**Plan.**

1. Toolbar above the 8×8 tile editor on the Sprites page:
   **Pencil** (current), **Fill** (flood-fill), **Line**, **Rect**,
   **Circle**, **Select** (marquee: delete / move / resize).
2. All tools write to `state.sprite_tiles[idx].pixels` and go
   through the existing undo stack.
3. **Select → drag handle** implements "change the size of parts"
   (pupil request) without a separate resize tool.  Shift constrains
   to one colour.
4. Match styling: existing `.color-btn` + `.pe-kind-btn` patterns.
5. Tests: per-tool unit tests that feed a known pixel grid + a stroke
   and assert the result.  Ship as a new `drawing-tools.mjs` suite
   if it gets big.

### 2.2 — Palette picker QoL (S)

Two small speed-ups to the NES master-grid picker.

**Plan.**

1. After clicking a palette slot, the master grid enters "hover
   follows mouse" mode — first click on any colour assigns and
   closes.
2. Drag a colour from the master grid onto a palette slot (native
   HTML5 drag).
3. **Recent colours** strip (last 8 picks) above the master grid,
   persisted per project.

### 2.3 — Inline animation strip (M)

Pupils struggle to find the Animations panel because it's hidden in
a collapsed `<details>` on the Sprites page.

**Plan.**

1. Promote the current-frame strip inline above the composition
   canvas, with **+ Add frame** right there.
2. Keep the full Animations editor inside the collapsible `<details>`
   for power users.
3. One-line "What's an animation?" tooltip linking to the matching
   Code-page lesson.

### Phase 2 definition of done

Each piece is independently shippable — don't gate them on each
other.  Per piece: code + screenshot in `changelog-implemented.md`,
new test cases in `run-all.mjs`, manual walk-through with pupils (or
at minimum: the teacher).

Rough total: **2–3 focused days**, can split across sessions.

---

## Phase 3 — Content & templates

Adds new game styles + finishes half-done Builder pieces.

### 3.1 — RPG / top-down preset (M)

Deferred from the pupil-fix pass (noted in auto-memory).  The current
Builder template is platformer-only: gravity, jump, left/right walk.

**Plan.**

1. Add `BuilderDefaults().modules.game.config.style = 'platformer' |
   'topdown'` (platformer stays the default).
2. Introduce a second template
   `builder-templates/topdown.c` — 4-way movement, no gravity, no
   jump, tile-step movement like Pokémon.
3. `game.applyToTemplate` picks the template based on `style`.
4. Assembler's template loader becomes template-aware (per the plan
   doc comment "game module picks the template").
5. New smoke suite `topdown.mjs`: assemble + /play build + verify
   the emitted main.c has the top-down movement block and not the
   gravity loop.

### 3.2 — Multi-line dialogue (M)

Current dialogue boxes are 28 × 1 characters.  Pupils asked for a
proper text window.

**Plan.**

1. Extend `BW_DIALOG_WIDTH / HEIGHT` macros; the dialogue module
   accepts a 2-D `text` array (or `"\n"`-separated string).
2. The bg-nametable-0 restore loop already exists — generalise it
   to N rows.
3. Test: `round2-dialogue.mjs` gets a new case B6 asserting the
   two-row emission + restore both rows on close.

### 3.3 — Per-NPC dialogue text (M)

Today every NPC shares one dialogue string.  Move the string to the
Scene instance so each NPC can have its own.

**Plan.**

1. Add `text` field to `scene.instances[i]` when the sprite's role
   is `npc`.
2. Builder's scene-instance UI gets a text input for NPC instances.
3. Emit one `bw_dialogue_text_N[]` per NPC; the dialogue trigger
   picks the matching one by the NPC's `ss_index`.
4. Back-compat: if no per-instance text is set, fall back to the
   module-level `text` field (current behaviour).

### 3.4 — P2 jump animation (S)

P2 walk animation works; jump still uses the static layout.  Finish
the symmetry with P1.

**Plan.**

1. Add `role=player2, style=jump` to the tagged-animation set in
   playground_server.py.
2. Template: pick the jump animation frames when `jumping2` is
   true, mirroring the P1 block.
3. Test in `round1-polish.mjs` (P2 animation coverage is already
   there).

### Phase 3 definition of done

Each item tested + changelogged + docs updated (BUILDER_GUIDE module
reference + PUPIL_GUIDE mention).  Top-down preset gets its own
paragraph in PUPIL_GUIDE because it's a visibly new capability.

Rough total: **2–3 days** across the four items.

---

## Phase 4 — Big, standalone initiatives

Each item here is a sprint on its own.  Don't stack them.

### 4.1 — Audio (L, possibly XL)

Pupils want sound.  Scoped in PUPIL_FEEDBACK.md Sprint 9.2.

**Strategy.**  Vendor the FamiStudio sound engine (`famitone2`-style
engine, LGPL) under `tools/audio/`.  Teach the Makefile to assemble
and link it.  Add an **Audio** page that accepts FamiStudio `.s`
exports and stores them alongside `src/`.  Ship `play_music(n)` and
two snippets (`music-on-start`, `jump-sfx`).

**Risk.**  FamiStudio engine wiring on NTSC/PAL, ROM-size budget
(sound engine adds ~2 KB), and classroom-friendliness (pupils need
a way to author tunes that doesn't require a separate tool on every
laptop).  Worth a discovery sprint before committing.

### 4.2 — Gallery / showcase (L)

Pupils asked for a way to share their work.

**Strategy.**  `tools/playground_server.py` grows a **Publish to
gallery** endpoint that copies the current `game.nes`, a preview
PNG, and project metadata into `tools/gallery/<slug>/`.  A new
`/gallery` page lists them + plays each in the browser.  No
accounts; teacher curates.  Stretch: "Export gallery bundle" zips
the folder for cross-machine sharing.

**Risk.**  Low technically; higher socially — need a moderation
policy + a way for pupils to remove their own entries.

### 4.3 — Accessibility pass (M)

- `--ui-scale` CSS custom property driven by a header dropdown
  (`100% / 125% / 150% / 175%`), persisted in `prefs.uiScale`.
- Canvas scaling so the 8×8 tile editor enlarges with the text.
- High-contrast theme toggle alongside the existing `bgTheme`
  (dark / mid / light).

### 4.4 — Nice-to-haves worth keeping on the list

Not big enough for their own phase row, but still worth tracking:

- **Getting-started GIFs/videos** — content production, outside
  this engineering plan but pupil-requested.
- **Sprite flicker mitigation (OAM cycling)** — rotate the OAM
  draw order each frame so scanlines with >8 sprites distribute
  the flicker evenly instead of always dropping the same ones.
  Classic NES trick, maybe 30 lines of code in the DMA-build path.
- **Player-vs-player collision** — not implemented in Builder
  templates; trivial to add behind a checkbox.
- **Scene exits (Sprint 9.1 from PUPIL_FEEDBACK)** — partially
  superseded by multi-background doors, but horizontal-edge exits
  are a different UX pupils have asked for.
- **Animation pairs** — `enemy + idle`, `npc + walk`, `npc + idle`
  are one-micro-chunk-each once pupils ask.

---

## Recommended ordering

1. **Phase 1.1 first** (verify C2).  ~half-day if it's already clean,
   ~a day if scroll timing needs surgery.
2. **Phase 1.2–1.4 together** as one session — three small polish
   items, close out plan-batches.md entirely.
3. **Phase 2** across two sessions — drawing tools alone is a day;
   palette QoL + animation strip fit together in another.
4. **Phase 3.1 (RPG preset)** when pupils ask for it.  High
   motivation, visible scope.
5. **Phase 3.2–3.4** folded in as follow-up asks come — they're all
   small continuations of existing work.
6. **Phase 4** one sprint at a time, starting with **4.3
   accessibility** because it's the lowest-risk and most
   immediately helpful.  Audio and Gallery are L/L sprints; pick
   based on which pupils push hardest for.

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
