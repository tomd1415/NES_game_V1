# Phased plan — UI/UX redesign to the unified NES Studio

**Status:** planning · **Branch:** `redesign/ui-ux` · **Started:** 2026-07-05

> This is the roadmap that turns the approved design direction into
> sequenced, shippable work. Read the companions first — they are the
> "why" and "what", this is the "in what order":
>
> - [`design-principles.md`](design-principles.md) — the settled direction & NES constraints
> - [`ui-architecture.md`](ui-architecture.md) — the unified-workspace IA (modes, dock, TV, quest log)
> - [`target-data-model.md`](target-data-model.md) — the tile-first model + gap analysis vs current code
> - [`feature-parity.md`](feature-parity.md) — **the parity yardstick**: everything the current
>   seven pages do, from a code audit; no page retires until its lines are covered
>
> Source material: **NES Studio – Design Handover.dc.html** (direction)
> and **SpriteMaker Studio.dc.html** (approved look; illustrative-only
> data/mechanics). The prototype is a *vision piece*, not a foundation to
> extend.

## The reframing that shapes this plan

Inspecting `tools/tile_editor_web/` changes the picture the handover
paints — in two ways, not one.

**First, the data model.** The handover's headline warning — *rebuild the
graphics data model* — is aimed at the **prototype's** regression, not
the current app. The current seven-page build **already** has the correct
tile-first foundation: shared `bg_tiles`/`sprite_tiles` pools, metatiles
as `{tiles:[TL,TR,BL,BR], palette}`, metasprites as `cells[][]` of shared
references with per-cell palette/flip/priority, a real 32×30 nametable,
and 4+4 palettes of 3. (Details and receipts in
[`target-data-model.md`](target-data-model.md).)

**Second, the feature surface.** The current app is much further along
than a naïve read of the handover's P1/P2 backlog suggests. Already
shipped and in classroom use: **four game types** (platformer, top-down,
auto-runner, and a feature-complete two-player racer), scrolling
multi-screen worlds, checkpoints, spawn effects, NPC dialogue, a
29-rule build validator with jump-to-fix, the sprite-reactions matrix,
shared-tile "duplicate first" safeguards, reference-rewriting tile swap,
real FamiStudio audio import, real `.chr`/`.nam`/`.pal`/ROM outputs via
the server's cc65 build, a lessons + snippets + guided-regions Code page,
a working gallery with publish/remix, and the accounts backend with a
working sign-in/cloud-save menu. Several items the handover files under
"future" are **parity requirements**, not reach.

So the effort splits like this:

- **Data model:** mostly *keep + verify + tighten a few real gaps*, not
  green-field rebuild.
- **UI/UX:** the *big* build — collapse seven pages into one game-first
  studio, on the approved retro-NES surface, with quest-driven learning
  and progressive disclosure.
- **The dominant risk is parity loss, not construction.** Seven mature
  pages hold hundreds of small, classroom-tested affordances. The
  phases below therefore lean on
  [`feature-parity.md`](feature-parity.md) as a hard exit check, and
  they *port and re-house* working machinery (validators, renderers,
  storage, play pipeline) rather than rebuild it.

## Guardrails for every phase

Non-negotiable, checked at the end of each phase:

- **Never regress progress-safety.** Concretely, what exists today:
  autosave on every change; reason-tagged snapshots every 30 s;
  emergency backups every 5 min (plus optional auto-download); recovery
  that snapshots current state before restoring; cross-tab catalog
  reconciliation; flush-before-navigation hooks; in-memory undo/redo.
  The prototype's "Time Machine" is the **new UI over this existing
  store**, not a new system; snapshot-before-Play is a small *addition*
  (Phase 0). All of it survives every change.
- **NES palette only**, including the app's own chrome.
- **The old seven pages keep working** until the mode that replaces them
  covers their [`feature-parity.md`](feature-parity.md) checklist and is
  switched over (see "Migration strategy"). Studio and old pages share
  **one storage schema** — migrations stay additive; never fork state.
- **All four shipped game types keep working** — platformer, top-down,
  auto-runner, racer — including two-player. They are parity, not reach.
- **Progressive disclosure holds** — every new control passes the
  "could a confused KS3 pupil ignore this and still finish a game?" test
  ([`design-principles.md`](design-principles.md) §4).
- **The inclusive chrome survives**: accessibility controls (text size,
  high contrast), the no-real-names account model, the feedback channel,
  and the storage notice are present in the Studio from Phase 0.
- Existing golden-hash / byte-identical-ROM / builder tests stay green;
  new structures get round-trip tests.

## Mapping to the handover backlog

The handover's P0/P1/P2 are *priorities*; the phases below are *delivery
order*. Two corrections to the handover's picture: the shell is a UI
prerequisite its data-first backlog doesn't call out, and several of its
P1/P2 items (game types, FamiStudio, accounts backend, reactions matrix,
scrolling worlds) are already shipped and become parity work in Phase 1.

| Phase | Theme | Handover items |
| ----- | ----- | -------------- |
| **0** | Foundation audit + Studio shell | P0 (data-model verification), sets up P0/P1 |
| **1** | Core modes at parity on the shell | P0 (nametable/attr honesty), P1 (quest/validator, disclosure) — parity now includes shipped "P2" features |
| **2** | The missing primitive: 8×8 TILES mode | P0 (8×8 editor), P1 (attribute teaching) |
| **3** | Correctness, budgets & honest round-trips | P0 (import round-trip, 8×16 OAM), P1 (budget meter, scanline visualiser) |
| **4** | Reach — the genuinely-not-built remainder | P1 (teacher tools, account completion) + P2 (new game types, bigger worlds, in-browser compile, CHR banks) |

---

## Phase 0 — Foundation audit & the Studio shell

**Status: in progress (started 2026-07-05).** The Studio shell is up at
`tools/tile_editor_web/studio.html` (a new page, so it is naturally
opt-in — the seven pages remain the default). It boots game-first into a
starter platformer, renders it LIVE in the CRT-framed TV, and plays it
(real cc65 `/play` → jsnes) — 0.2 / 0.3 / 0.4 / 0.5 landed. Covered by a
new Playwright suite (`tools/studio-tests/`) plus the node
`builder-tests` staying green. Still open in Phase 0: **0.1** the
data-model audit → tickets, and folding the three emulator variants into
one consolidated component (today PLAY reuses the shipped `emulator.js`
modal as-is). See "Phase 0 — landed so far" below.

**Goal:** a single-page Studio shell exists (mode rail · dock · TV ·
quest log · chrome) running the *existing* engine, on the *existing*
data model, behind a flag — with the data model's remaining gaps
documented as tracked tickets.

- **0.1 Data-model audit → tickets.** Confirm the mappings in
  [`target-data-model.md`](target-data-model.md) against live state; open
  a ticket per real gap. The audit so far narrows them to: attribute
  granularity (8×8-mode palettes), consolidating the two per-page 8×8
  tile editors into TILES, **8×16 sprite mode** (per-cell
  flip/palette/priority already exist — the OAM gap is smaller than the
  handover assumed), budget surfacing, and import round-trips (exports
  already exist). Add round-trip tests for the structures that will be
  serialised.
- **0.2 Shared project state.** One canonical in-memory project + storage
  layer serving all modes (extend `DefaultState` / `storage.js`), so mode
  switches never reload or lose work. Preserve the storage layer's
  hidden machinery — multi-project catalog, legacy migration + backup
  download, cross-tab reconciliation, flush hooks — it is load-bearing.
- **0.3 Studio shell + the TV decision.** Static shell implementing the
  four regions ([`ui-architecture.md`](ui-architecture.md)): mode rail,
  empty contextual dock, quest-log scaffold, top chrome. The TV gets an
  explicit **two-state design** the prototype hand-waves:
  - **LIVE** — the default: the current screen rendered live from real
    project state (the existing canvas renderers — nametable painter,
    `drawSpriteIntoCtx`, the Builder's world preview — already do this),
    edited in place.
  - **PLAY** — ▶ compiles via the server `/play` pipeline and swaps in
    the jsnes emulator; ■ returns to LIVE.
  "The game always running in the TV" from the prototype really means
  *always LIVE, one click from PLAY* — compiling is a server round-trip
  and cannot be per-keystroke. Build **one** consolidated emulator
  component with the union of today's three variants (pause, reset,
  fullscreen, mute, 2-player legend) and keep the capability probe /
  native-fceux gating. Reuse existing modules; do not fork the engine.
- **0.4 Progress-safety uplift.** Add the `before_play` snapshot reason;
  ship the Time Machine UI as a re-skin of the existing recovery dialog
  (snapshots + backups, restore-snapshots-first). Fix the "keeps 5"
  copy (code keeps 8).
- **0.5 Entry & flag.** New Studio entry page reachable behind a
  flag/URL; the seven pages remain the default until parity lands.
  A11y controls, account menu, feedback, and the storage notice mount in
  the Studio chrome from day one (they are shared modules already).

**Exit:** the starter game renders LIVE and plays (PLAY) inside the
Studio TV; mode rail switches empty docks; nothing is lost on switch;
old pages untouched.

### Phase 0 — landed so far (2026-07-05)

Files added under `tools/tile_editor_web/`:

- **`studio.html`** — the shell: four regions (mode rail · contextual
  dock · CRT TV · quest log + needs-attention) and the persistent chrome,
  drawn entirely from the 64-colour NES palette. Loads the *existing*
  shared modules unchanged.
- **`studio.js`** — the shell logic: shared `Storage` + additive
  migration (0.2); the seven-mode rail with **level-gated progressive
  disclosure** (Beginner/Maker/Advanced, persisted in prefs); the TV's
  **LIVE** renderer (nametable + metatile-expand + hero preview) and
  **PLAY** (`before_play` snapshot → `PlayPipeline.play` → `NesEmulator`)
  (0.3); autosave + 30 s snapshots + 5 min backups + flush-on-unload; the
  **Time Machine** dialog (restore-snapshots-first, "keeps 8" copy fixed)
  (0.4); self-ticking quests + the ported `BuilderValidators` in
  needs-attention; and the chrome mounts — a11y, account menu, feedback,
  storage notice (0.5).
- **`studio-starter.js`** — the game-first starter (a small platformer
  written to the real tile-first schema: shared bg/sprite tiles, a floor
  on the nametable with solid-ground behaviour, and a 2×2 hero
  metasprite).

Tests: `tools/studio-tests/` (Playwright, 13 checks incl. the real
compile+emulator PLAY path); `playwright.config.js`; `package.json`. The
node `builder-tests` were also repaired — 31 suites hardcoded a stale
absolute repo path from a prior checkout location and now derive it from
`import.meta.url`; `run-all.mjs` additionally syntax-checks the two new
Studio modules. Whole suite green.

**Still open in Phase 0:** *0.1* — write the data-model audit up as
tracked tickets (the gaps are already enumerated in
[`target-data-model.md`](target-data-model.md); this is the paperwork).
And consolidate the three emulator variants into one component with the
union of controls (pause/reset/fullscreen/mute/2-player legend) — today
PLAY reuses the shipped `emulator.js` modal as-is, which satisfies the
exit criterion but not the "one consolidated emulator" intent of 0.3.

## Phase 1 — Core modes at parity

**Goal:** WORLD, CHARS, PALS, RULES, SOUND, CODE work inside the Studio
at parity with the pages they replace —
[`feature-parity.md`](feature-parity.md) is the checklist — plus the
quest/validator learning layer. This is the phase that *earns the
switch-over*. Parity explicitly includes the four game types and
two-player.

- **1.1 WORLD.** Absorbs three old surfaces: the Backgrounds nametable
  editor, the Behaviour page's *map painting*, and the Builder's *entity
  placement*.
  - Stamping: 8×8 tiles **and** the metatile block library
    (promote/revert, block mini-editor, drag-stamp) onto the live
    nametable in the TV; multiple named backgrounds; 1×1→2×2 screen
    layouts; region select/copy/paste, flood fill, palette rectangle;
    grid options; full preview.
  - Tile-*type* assignment (solid/platform/ladder/spike/door/win + the
    custom slot) with the ⚙ per-tile override, find-same highlight, and
    per-game-type slot labels; 🎨 palette painting through the real
    attribute table.
  - Entity placement: click-to-place / drag scene instances and player
    starts on the TV; per-instance config (sprite, AI, speed, "says")
    surfaces in the dock on selection.
  - An **Assembly view** exposing how screens/blocks are built from
    shared tiles. *(Answers [`notes.md`](notes.md): world-assembly page,
    tile-type + override, assembly mode.)*
- **1.2 CHARS.** The character list + **role assignment** in the dock
  (all 11 shipped roles), redraw-by-assembling-shared-tiles with the
  full drawing toolset (pencil/fill/line/rect/circle/select with
  rotate/flip/scale), per-cell palette/flip/priority, the
  **animation system** (frames, fps, tagging, walk/jump/attack
  auto-wiring), the flying flag, and the shared-tile conflict dialog.
  Background-tile drawing is **not** here — it moves to TILES (Phase 2),
  fixing the prototype's two-jobs dock.
- **1.3 PALS.** Backdrop + 4 BG + 4 sprite palettes of 3 from the
  64-colour set — united in one mode (today they're split across two
  pages) — with "used by" readouts, recent colours, and the locked
  slots surfaced honestly (sprite slot 0 transparent; dialogue's
  reserved palette). *(Answers [`notes.md`](notes.md): "where to set the
  colour palettes".)*
- **1.4 RULES.** The Builder module tree re-housed as cards — game type
  + tunables, globals, players 1–2, pickups, spawn effects, damage +
  checkpoints, HUD, doors, dialogue, win condition — filtered to the
  current game type, search/grouping stubbed for growth. **Port the
  sprite-reactions matrix here too** (Maker-gated): it already exists on
  the Behaviour page, so porting it now is cheaper than rebuilding it
  later, and RULES cannot claim parity without it.
- **1.5 SOUND & CODE.** SOUND ports the audio page whole: FamiStudio
  song/sfx import, starter pack, default-song choice, ROM-size audit.
  CODE ports the real Code page: read-first generated C, **guided
  editable regions**, the lessons and snippets libraries, the symbols
  reference, and the C/asm toggle (asm + whole-file editing gated to
  Advanced). Fix the eject trap: "Open as Code" becomes an explicit
  **ejected state** — a visible banner in RULES ("this game is
  hand-coded now"), with a deliberate return path — instead of today's
  silently-inert Builder.
- **1.6 Quest Log + Needs-attention.** The validator side is a **port,
  not a build**: `builder-validators.js` already implements 29
  error/warn rules with jump-to-fix targets — re-house it in the
  right-hand panel as *Fix →* / *Show me*. Self-ticking quests are the
  new build; they replace the intro tours (retire tours deliberately).
  The Code lessons library plugs into the quest log rather than staying
  a separate dialog.
- **1.7 Expertise-level scaffolding.** The Beginner/Maker/Advanced
  switch reveals/hides modes & dock controls; contextual stage toolbar
  (common two tools + "more"). Full gating filled in as later modes
  land.

**Exit:** a pupil can build, play, and publish a platformer end-to-end
entirely in the Studio, learning via quests, at Beginner level — and a
top-down, runner, or racer project opened in the Studio still works.
**Decide the switch-over per page** (see Migration strategy): a page
flips only when its parity checklist is covered.

## Phase 2 — The missing primitive: TILES mode

**Goal:** the 8×8 tile editor exists as a first-class Maker-level mode —
the primitive everything already references (handover §5). This is a
**consolidation**: two nearly-complete tile editors exist today (one per
page); TILES merges them without losing either's operations.

- **2.1 TILES mode.** 16×16 grid of the 256 tiles per bank (BG/sprite),
  large 8×8 paint canvas with the 4-value pen previewed under a chosen
  palette, `[`/`]` stepping, arrow-key move, per-tile names, the
  free/in-use/shared/orphan colour-coding.
- **2.2 Tile operations.** New/duplicate/delete/clear, flip H/V, rotate,
  copy/paste — all shipped today; carry over the shortcuts verbatim.
- **2.3 Reference integrity.** Drag-to-swap that rewrites *every*
  reference and the "also used by… / Duplicate first" dialog **already
  exist** (Sprites page); extend them to cover both banks uniformly and
  add the live "used by" readout (which blocks/metasprites/screens use
  this tile).
- **2.4 In-context jump-ins.** "Edit the tiles of this block/sprite"
  from WORLD and CHARS, so the primitive is discoverable without being
  a wall of 256 squares.
- **2.5 Attribute teaching.** Overlay the 2×2 quadrant grid at the point
  of colouring; make per-quadrant attribute the source of truth and
  retire per-8×8-cell palette (gap #1 in
  [`target-data-model.md`](target-data-model.md)). The metatile mode is
  already correct-by-construction — the migration path is
  promote-to-metatiles, which ships today.
- **2.6 Reserved-slot honesty.** The dialogue glyph-reservation overlay
  (reserved letter tiles, conflict banner, claim-slot flow) moves into
  TILES so the budget a pupil sees is the budget the build uses.

**Exit:** a Maker-level pupil can draw a tile once and see it update
everywhere it's used; colouring visibly respects the 2×2 rule.

## Phase 3 — Correctness, budgets & honest round-trips

**Goal:** the tool teaches the hardware truthfully and the outputs
round-trip.

- **3.1 CHR budget meter.** Live `used/256` per bank (usage stats exist;
  this aggregates and surfaces them), wired into quests/validator as a
  positive "reuse tiles to fit the cartridge" challenge.
- **3.2 8-sprites-per-scanline visualiser** + the flicker/drop-out
  warning, surfaced in the validator (the OAM *total* budget rules
  already exist; per-scanline is the new analysis).
- **3.3 8×16 sprite mode.** The remaining OAM gap — per-cell
  flip/palette/priority already ship (gap #3, revised).
- **3.4 De-overload the tile-type slots.** Today trigger doubles as
  checkpoint 1, ladder as checkpoint 2, and slot 7 as spike *or* finish
  line depending on game type. Phase 1 labels them per game type; this
  phase gives game types their own named slots so the map stops
  teaching a lie. *(Replaces the old 3.4 — the reactions matrix ported
  in Phase 1.4.)*
- **3.5 Round-trippable exports + import.** `.chr` / `.nam` / `.pal` /
  `my_tiles.txt` / `sprites.inc`+`.h` and cc65 C already export straight
  from the real structures; add the **matching imports** and round-trip
  tests (gap #5, revised).
- **3.6 Advanced level filled in.** Raw C/asm editing and whole-file
  mode exist on the Code page — gate them at Advanced in the Studio;
  attribute bytes visible only at Advanced.

**Exit:** budgets and limits are visible and enforced; exported files
round-trip; nothing on screen contradicts the hardware.

## Phase 4 — Reach

**Goal:** grow toward a complete NES game maker without clutter
(handover P2) — scoped to what is *genuinely not built yet*. Each item
ships behind the appropriate level/disclosure.

- **4.1 Accounts completion.** The backend (auth, join codes, recovery
  codes, per-user project CRUD) and the basic sign-in/cloud-save menu
  **already ship** — the remaining work is the accounts plan's P3–P6:
  polished editor UI, the recovery/gate flows, gallery ownership, and
  lifecycle — preserving the snapshot guarantees on top of cloud
  storage. *(See `docs/plans/current/2026-06-21-pupil-accounts.md`.)*
- **4.2 Teacher tools for real** — class progress, a real moderation
  queue (today gallery Remove is an unauthenticated button), showcase
  pinning; join-code administration already exists server-side.
- **4.3 New game types beyond the shipped four** — e.g. shoot-'em-up,
  puzzle — as `BW_GAME_STYLE` additions with their own starters, plus
  per-type quest lines.
- **4.4 Bigger scrolling worlds.** Multi-screen scrolling ships today
  but the editor caps at 2×2 screens; raising it needs the NES-side
  compact metatile storage (`mt_map[]`/`mt_defs[]`, Arc E1-4).
- **4.5 Doors & dialogue depth.** Per-door destinations (today all
  doors share one spawn/target) and in-runner dialogue (blocked on the
  NMI frame-model rework, Arc D Sprint 5).
- **4.6 CHR bank switching** for larger games; audio growth (multiple
  sfx packs, maybe an in-app composer — FamiStudio *import* is already
  real).
- **4.7 In-browser cc65 → .nes compile.** ROMs are already real — the
  server builds genuine cartridge images today. This item removes the
  server dependency so the Studio compiles offline/static-hosted.
  *(Groundwork: `docs/plans/current/2026-06-22-wasm-emulator-spike.md`.)*

**Exit:** the studio supports more real game types, bigger worlds, and
server-optional builds — still calm enough for a Year-7's first lesson.

---

## Migration strategy (seven pages → one studio)

1. Build the shell and modes **alongside** the existing pages (Phase
   0–1), sharing one project-state layer so both read the same saves.
2. Reach parity mode-by-mode against
   [`feature-parity.md`](feature-parity.md); note the mapping is not
   1:1 — `behaviour.html` is replaced half by WORLD (map painting) and
   half by RULES (reactions matrix), `builder.html` half by RULES
   (modules) and half by WORLD (placement). **A page retires only when
   *all* of its parity lines are covered**, wherever they landed.
3. Flip the default to Studio at the Phase 1 exit; keep the old pages
   reachable one release as a fallback.
4. Remove the superseded pages once the Studio has carried a full term
   of real classroom use without regressions.

## Review questions from `notes.md` — where each is answered

The [`notes.md`](notes.md) review of the prototype is folded in:

| Question | Answered by |
| -------- | ----------- |
| Where do you choose a sprite's **role**? | Phase 1.2 (CHARS dock) · [`ui-architecture.md`](ui-architecture.md) |
| Keep the **world/assembly page** where elements come together | Phase 1.1 WORLD + Assembly view |
| Assign **tile type per tile**, with per-tile **override** | Phase 1.1 (⚙ type tool) · [`target-data-model.md`](target-data-model.md) |
| An **Assembly mode** on that page | Phase 1.1 Assembly view |
| Keep the whole site to the **NES palette** | Guardrail on every phase · [`design-principles.md`](design-principles.md) §2 |
| Ensure the UI/UX can **expand to a full game maker** | Progressive-disclosure guardrail + Phase 4 · [`design-principles.md`](design-principles.md) §5 |
| Where to **set the colour palettes**? | Phase 1.3 PALS mode |
| What is **missing** from the new UI? | The 8×8 TILES primitive (Phase 2) + the revised gaps in [`target-data-model.md`](target-data-model.md) — and, per the audit, everything in [`feature-parity.md`](feature-parity.md) the prototype leaves out |

## Open questions to settle with the team

- **Rebuild vs. re-skin the current app?** Given the model is already
  correct *and* the feature surface is large and classroom-tested, the
  recommendation is firmly to **evolve `tools/tile_editor_web/` in
  place** (new shell + modes over the existing state/engine/validators),
  not start a new codebase. Confirm before Phase 0.3.
- **Framework for the shell.** The current pages are vanilla JS + HTML;
  the prototype is a static mockup. Decide whether the Studio stays
  vanilla or adopts a light component layer — before Phase 0.3.
- **Where does per-instance entity config live?** Placement is in WORLD
  (on the TV); this plan puts the selected instance's settings (AI,
  speed, "says") in the WORLD dock on selection, keeping RULES for
  game-wide modules. Confirm the split feels right in the Phase 1
  design pass.
- **Level defaults per key stage** (who sees Maker/Advanced by default,
  and the teacher override surface) — needed before Phase 1.7.

---

*This plan supersedes ad-hoc redesign notes. It is tracked from
`docs/plans/current/` (see the redesign entry there) and reviewed at each
phase exit.*
