# NES Studio redesign — execution tracker — 2026-07-05

> **Scope.** The executable work-tracker for the UI/UX redesign that
> collapses the seven pages into one **Studio**. This is the *plan* half
> of the pair the design folder describes: the design intent lives in
> [`docs/design/`](../../design/) (start at
> [`phased-plan.md`](../../design/phased-plan.md)); **this file tracks
> what is done and what is left, as a checklist.**
>
> Branch: `redesign/ui-ux`. The Studio ships as a new page
> (`tools/tile_editor_web/studio.html`) alongside the untouched seven
> pages, which stay the default until parity lands and the switch-over is
> made (see the design plan's "Migration strategy").

## Companion docs

- [`design/phased-plan.md`](../../design/phased-plan.md) — the roadmap &
  per-phase intent (has per-phase status notes mirroring this tracker).
- [`design/feature-parity.md`](../../design/feature-parity.md) — the parity
  yardstick every retiring page is measured against.
- [`design/ui-architecture.md`](../../design/ui-architecture.md),
  [`design/design-principles.md`](../../design/design-principles.md),
  [`design/target-data-model.md`](../../design/target-data-model.md).

## How it is built (for anyone picking this up)

- **Shell:** `studio.js` exposes a `ctx` (getState, markDirty, renderLive,
  renderDock, pushUndo, getActiveTool, levelAtLeast, refresh…) and a
  `window.StudioModes` registry.
- **Modes:** one file each — `studio-world/chars/pals/rules/tiles/sound/
  code.js` — registering `{renderDock, stageTools/moreTools, renderTV?,
  onRenderOverlay?, onTv*?, onKey?}`. Shared helpers in `studio-ui.js`.
- **Tests:** Playwright suites in `tools/studio-tests/` (`npm run
  test:e2e`; the config auto-boots `playground_server.py`). The node
  `tools/builder-tests/` must stay green (`node
  tools/builder-tests/run-all.mjs`); it also `node --check`s the Studio
  modules.

---

## Branch state (2026-07-05)

The redesign **merged to `main`** (commit "Merge redesign/ui-ux…"). Engine
work now happens on **`feature/nes-engine`**, which added, on top of the
merge:

- **NES-engine versioning** (`docs/design/engine-versioning.md`): every
  project stamped `engineVersion`; `tools/engines/ENGINE_VERSION` +
  `engine-version.js`; per-version snapshots (`tools/engines/v1`, `v2`) via
  `scripts/snapshot-engine.mjs`; `CHANGELOG.md`; builder-tests enforce
  version-agreement + snapshot-integrity. **Still open:** E-V2 (build-time
  fallback to a game's target engine) and E-V3 (in-Studio "what changed"
  upgrade advisor).
- **Engine v2 — per-door destinations** (same-room + cross-room): each Door
  tile has its own spawn/target, edited in WORLD → Doors. Empty door list =
  byte-identical v1 ROM (golden-ROM safe); the new C compiles via cc65.
- **The 7 `notes.md` bugs** fixed (see that file's Resolutions).
- **Tile default-behaviour** (auto-type on place) + **tile-type overlay**.
- **Richer starter game** (platforms, ladder, enemy, NPC + dialogue, door,
  hearts) + "Load a starter game" in the account dropdown + resilient boot.

## Landed ✅ (2026-07-05)

**Phase 0 — shell & foundation**
- [x] Studio shell: mode rail · dock · CRT TV · quest log · chrome, on the
      64-colour NES palette.
- [x] Shared project state via `Storage` + additive `migrateState`;
      autosave, 30 s snapshots, 5 min backups, flush-on-unload.
- [x] TV LIVE nametable render (+ metatile expand) and PLAY
      (`before_play` snapshot → `PlayPipeline` → `NesEmulator`).
- [x] Progress-safety uplift: Time Machine (restore-snapshots-first),
      "keeps 8" copy fix.
- [x] Chrome mounts: a11y, account menu, feedback, storage notice.

**Phase 1 — core modes**
- [x] WORLD: stamp / erase / fill / 2×2 Colour / Type painting on the live
      TV; background new/dup/rename/delete; grid + attribute-chunk overlay;
      right-click eyedropper. **Entity placement** (drop/drag scene
      instances, per-instance character/AI/speed/x/y).
- [x] CHARS: character list, all 11 roles, flying flag, W×H resize,
      shared-tile drawing (pencil/erase/fill, auto-allocate free tile),
      **animations** (frames, fps, walk/jump/attack assignment; new
      auto-wires walk).
- [x] PALS: backdrop + 4 BG + 4 sprite palettes, slot-0 lock, used-by
      counts, master 64-colour picker.
- [x] RULES: the whole `BuilderModules` tree as schema-driven cards
      (enum/int/bool/text/spriteRef; per-module on/off; reset).
- [x] SOUND: FamiStudio `.s` song/sfx upload + symbol extraction,
      `/starter/audio` pack, default-song star, ROM-size audit.
- [x] CODE: read-first generated C view.
- [x] RULES: **sprite-reactions matrix** — per character × tile-type →
      ignore/block/land/land_top/bounce/exit/call_handler, Maker-gated;
      `behaviour_reactions` kept index-aligned when characters are added/
      duplicated/deleted in CHARS.
- [x] Quest log + "Needs attention" validators with **"Fix in ‹Mode› →"**
      jumps; self-ticking quests.
- [x] Level-gated mode rail (Beginner/Maker/Advanced), persisted.
- [x] **Publish to gallery** (build → 60-frame preview → `/gallery/publish`).

**Phase 2 — TILES primitive**
- [x] 8×8 editor over both banks: 256-tile grid (free/used/shared/orphan),
      zoomed paint canvas, ops (clear/flip/rotate/duplicate), per-tile
      name, used-by readout, `[`/`]` + arrow stepping.

**Phase 3 — correctness & round-trips**
- [x] 3.1 CHR/OAM budget meters (used/256 per bank + characters/64).
- [x] 3.5 (partial) whole-project JSON export/import round-trip
      (before_import snapshot; lossless).

---

## Remaining ⬜ (the backlog)

Grouped by design-plan phase. Each line is the next unit of work; check it
off here and update the status note in
[`phased-plan.md`](../../design/phased-plan.md) when it lands.

### Phase 1 — finish parity
- [x] **RULES: sprite-reactions matrix** (per sprite × tile-type →
      ignore/block/land/land_top/bounce/exit/call_handler), Maker-gated.
      Ported from `behaviour.html` — `studio-rules.js` `renderReactionsCard`
      (per-character picker + friendlier KS3 verb labels), writes
      `state.behaviour_reactions`, syncs on CHARS add/dup/delete, tested in
      `studio-tests/rules.spec.js:81-126`. **At full parity** with the legacy
      page (which was *also* data-only). ⚠️ **Runtime dispatch is NOT done**
      (the deferred "Phase C" engine hook): the shipped engine hardcodes
      collision by behaviour-ID and never calls `reaction_for()`, so the verbs
      (bounce/land_top/exit/call_handler) have no per-sprite in-game effect yet
      (only block-like solidity, which is ID-driven). Making the matrix
      *mean* something at runtime is a separate engine sprint, not a parity port.
- [x] **Finer expertise gating (1.7):** per-tool `minLevel` on the stage
      toolbar (WORLD ⛰ Type / ▦ Select are Maker+); dock sections gated by
      `ctx.levelAtLeast` (WORLD Tile-type + Selection, CHARS Animations +
      Flip); Beginner "Needs attention" shows only build-blocking errors
      (warnings wait for Maker). Level change now re-renders toolbar + dock
      + attention live.
- [~] **WORLD parity gaps vs `index.html`:** ✅ region select/copy/paste
      (▦ Select tool + clipboard); ✅ full-screen preview modal (clean NES
      render, expands metatile bgs); ✅ **16×16 metatile block library**
      (🧱 promote / ↩ revert, block library strip, per-block quadrant + palette
      + whole-block-type mini-editor, drag-stamp onto the mtmap, delete-block
      via `MetatileLib.deleteBlock`; LIVE render already expanded the map).
      **Still open (minor):** pop-out tileset window; in-TV zoom.
      (Palette-rectangle is covered by drag-painting the 🎨 Colour tool.)
- [~] **CHARS parity gaps vs `sprites.html`:** ✅ shared-tile "also used
      by… / Duplicate first" conflict dialog on edit; ✅ animation preview
      player; ✅ whole-character Flip H/V (non-destructive) + flip-aware
      editor canvas; ✅ tile-swap (drag) that rewrites every reference (TILES
      2.3, both banks); ✅ **marquee *region* select** (▦ Select tool, Maker+)
      with copy/paste, rotate CW/CCW, flip H/V, scale ×2/÷2, clear — sprite-
      pixel ops over a dragged box (`studio-chars.js`), tested end-to-end
      (`studio-tests/chars-marquee.spec.js`, incl. a real mouse-drag). **Still
      open (minor polish):** drag-to-*move* a floating selection, and the
      keyboard shortcuts (Ctrl+C/V, Delete, arrow-nudge) — the button ops cover
      the same actions.

### Phase 2 — deepen TILES
- [x] 2.3 Drag-to-swap in the TILES bank grid that rewrites *every*
      reference (nametables+metatiles / metasprite cells) so the picture is
      unchanged. (The paint-time "Duplicate first" dialog lives in CHARS,
      where editing a shared tile is unexpected; TILES is the mode where
      global edits are the whole point.)
- [x] 2.4 In-context jump-ins: "✎ Edit these tiles" from CHARS and
      "✎ Edit tile #N" from WORLD hop into TILES focused on that tile/bank.
- [~] 2.5 Attribute teaching: ✅ 2×2 attribute-conflict overlay + count/fix
      hint (colouring visibly respects the 2×2 rule). **Still open:** making
      per-quadrant palette the *sole* stored source of truth (retiring
      per-8×8-cell palette) — a shared-schema + cc65-emitter change across
      the old pages; tracked to protect the golden-ROM contract.
- [x] 2.6 Dialogue reserved-slot overlay: when the dialogue module is on,
      TILES marks the BG glyph slots (space, 0-9, A-Z, a-z) as reserved so
      the CHR budget a pupil sees matches the build.

### Phase 3 — correctness, budgets & honest round-trips
- [x] 3.2 8-sprites-per-scanline analysis + flicker/drop-out warning in
      "Needs attention" (Maker+), with a Fix-in-World jump.
      `Studio.scanlineLoad()` exposes the per-line tally.
- [ ] 3.3 8×16 sprite mode. **BLOCKED / needs decision:** the build has no
      8×16 (PPUCTRL sprite-size) path today, so a Studio toggle would be a
      lie until the cc65 engine emits 8×16 OAM. Per-cell flip/palette/
      priority already exist — the gap is the engine, not the editor.
- [x] 3.4 De-overloaded, game-type-aware tile-type labels in WORLD
      (racer → Checkpoint 1 / Checkpoint 2 / Finish line; platformer →
      Trigger / Ladder / Spike). Fully separate *stored* slots per game
      type remains a shared-schema + build change (flagged with 2.5).
- [x] 3.5 Round-trippable exports **and** imports: `.chr` (both banks),
      `.pal` (32-byte NES palette), `.nam` (960 tiles + 64 attribute bytes,
      active 8×8 screen) — each with a lossless round-trip test; whole-
      project JSON already round-trips. *(Still open, lower priority:
      `my_tiles.txt` / `sprites.inc`+`.h` text/asm imports for external
      toolchains.)*
- [~] 3.6 Advanced level: ✅ **raw whole-file C editing via a real ejected
      state** — "✂ Edit as hand-coded C" (Advanced) assembles the current
      C into `state.customMainC`, sets `state.ejected`, and PLAY compiles
      *that* (play-pipeline `customMainC` path); RULES shows a hand-coded
      banner with a "Go to CODE" jump; "↩ Return to visual editor" flips
      back. This replaces the old silently-inert-Builder eject trap (1.5).
      **Now also landed:** a **CodeMirror** editor (C syntax highlighting,
      line numbers, active-line, dracula theme) for the ejected code, plus a
      **snippet palette** of common C helpers that insert at the cursor.
      **Still open (CODE-port polish):** guided editable *regions* on the
      non-ejected generated C, the lessons library plugged into the quest
      log, a full symbol reference, the C/asm toggle, and
      attribute-bytes-at-Advanced.

### Phase 4 — reach (genuinely not built)

> **All Phase 4 items edit the shipped cc65 ROM pipeline, backend, or need
> product scoping — they need a decision before autonomous work.** Feasibility
> + risk assessed in
> [`decisions/2026-07-05-engine-items-feasibility.md`](../../design/decisions/2026-07-05-engine-items-feasibility.md).
> **Recommended next engine sprint (lowest risk):** per-door *same-room*
> spawns (4.5), module-gated so the golden-ROM `everything-on` hash is
> preserved. The rest (8×16, CHR banks, bigger worlds) are HIGH-risk /
> LARGE and belong in reviewed engine sprints.

- [ ] 4.1 Accounts completion (P3–P6 of
      [`2026-06-21-pupil-accounts.md`](2026-06-21-pupil-accounts.md)). *(backend/product)*
- [ ] 4.2 Teacher tools: class progress, real moderation queue, showcase
      pinning (gallery Remove is currently unauthenticated). *(backend/auth)*
- [ ] 4.3 New game types beyond the shipped four (shoot-'em-up, puzzle…). *(engine: new BW_GAME_STYLE + starters)*
- [ ] 4.4 Bigger scrolling worlds (>2×2 screens; needs NES-side compact
      metatile storage). *(engine — MEDIUM-HIGH risk, rewrites `scroll.c`)*
- [ ] 4.5 Per-door destinations + in-runner dialogue. *(engine — **recommended
      same-room variant is the lowest-risk item**; cross-room + in-runner
      dialogue are blocked on the NMI frame-model rework)*
- [ ] 4.6 CHR bank switching; audio growth. *(engine — HIGH risk, mapper + header post-patch)*
- [ ] 4.7 In-browser cc65 → `.nes` compile (server-optional); groundwork in
      [`2026-06-22-wasm-emulator-spike.md`](2026-06-22-wasm-emulator-spike.md). *(large spike)*

### Cross-cutting, before the switch-over
- [~] Walk every line of [`feature-parity.md`](../../design/feature-parity.md)
      against the Studio; record any *deliberate* drops in
      `docs/design/decisions/`. Started: deliberate drops recorded in
      [`2026-07-05-deliberate-parity-drops.md`](../../design/decisions/2026-07-05-deliberate-parity-drops.md).
      A full line-by-line walk remains a review pass before switch-over.
- [x] Consolidate the emulator variants → the Studio already runs on the
      **single shared `emulator.js` (`NesEmulator`)** for PLAY; the three
      per-page variants were the *old pages'* inline emulators, which retire
      with those pages. No separate Studio emulator to fold in. *(If the old
      pages are kept as a fallback, their variants live on there only.)*
- [x] 0.1 Data-model audit written up as tracked tickets (DM-1..DM-5) in
      [`design/decisions/2026-07-05-data-model-audit.md`](../../design/decisions/2026-07-05-data-model-audit.md).
      DM-2/DM-4 closed; DM-5 partly (CHR); DM-1/DM-3 need coordinated
      schema/engine work.
- [ ] Flip the default to Studio at Phase 1 exit; keep old pages one
      release as a fallback; retire a page only when *all* its parity lines
      are covered.

---

*This tracker is the redesign entry the design docs point at. Update the
checkboxes here and the matching status note in `phased-plan.md` as work
lands.*
