# Phased plan — UI/UX redesign to the unified NES Studio

**Status:** planning · **Branch:** `redesign/ui-ux` · **Started:** 2026-07-05

> This is the roadmap that turns the approved design direction into
> sequenced, shippable work. Read the three companions first — they are
> the "why" and "what", this is the "in what order":
>
> - [`design-principles.md`](design-principles.md) — the settled direction & NES constraints
> - [`ui-architecture.md`](ui-architecture.md) — the unified-workspace IA (modes, dock, TV, quest log)
> - [`target-data-model.md`](target-data-model.md) — the tile-first model + gap analysis vs current code
>
> Source material: **NES Studio – Design Handover.dc.html** (direction)
> and **SpriteMaker Studio.dc.html** (approved look; illustrative-only
> data/mechanics). The prototype is a *vision piece*, not a foundation to
> extend.

## The reframing that shapes this plan

Inspecting `tools/tile_editor_web/` changes the picture the handover
paints. The handover's headline warning — *rebuild the graphics data
model* — is aimed at the **prototype's** regression, not the current app.
The current seven-page build **already** has the correct tile-first
foundation: shared `bg_tiles`/`sprite_tiles` pools, metatiles as
`{tiles:[TL,TR,BL,BR], palette}`, metasprites as `cells[][]` of shared
references, a real 32×30 nametable, and 4+4 palettes of 3. (Details and
receipts in [`target-data-model.md`](target-data-model.md).)

So the effort splits differently than a naïve read of the handover
suggests:

- **Data model:** mostly *keep + verify + tighten five real gaps*, not
  green-field rebuild.
- **UI/UX:** the *big* build — collapse seven pages into one game-first
  studio, on the approved retro-NES surface, with quest-driven learning
  and progressive disclosure.

That is what the phases below optimise for: get the unified shell and
mode parity landed on the existing correct model early, then add the
missing primitive (8×8 editor), then correctness/teaching depth, then
reach.

## Guardrails for every phase

Non-negotiable, checked at the end of each phase:

- **Never regress progress-safety** — autosave, snapshots,
  snapshot-before-Play, Time Machine survive every change.
- **NES palette only**, including the app's own chrome.
- **The old seven pages keep working** until the mode that replaces them
  reaches parity and is switched over (see "Migration strategy").
- **Progressive disclosure holds** — every new control passes the
  "could a confused KS3 pupil ignore this and still finish a game?" test
  ([`design-principles.md`](design-principles.md) §4).
- Existing golden-hash / builder tests stay green; new structures get
  round-trip tests.

## Mapping to the handover backlog

The handover's P0/P1/P2 are *priorities*; the phases below are *delivery
order*, which interleaves the shell (a UI prerequisite the handover's
data-first backlog doesn't call out) with those priorities.

| Phase | Theme | Handover items |
| ----- | ----- | -------------- |
| **0** | Foundation audit + Studio shell | P0 (data-model verification), sets up P0/P1 |
| **1** | Core modes at parity on the shell | P0 (nametable/attr honesty), P1 (quest/validator, disclosure) |
| **2** | The missing primitive: 8×8 TILES mode | P0 (8×8 editor), P1 (attribute teaching) |
| **3** | Correctness, budgets & honest exports | P0 (exports/import, metasprite OAM), P1 (budget meter, scanline visualiser, reactions matrix) |
| **4** | Reach | P1 (accounts, teacher tools) + P2 (game types, scrolling, compile-to-.nes, music) |

---

## Phase 0 — Foundation audit & the Studio shell

**Goal:** a single-page Studio shell exists (mode rail · dock · TV ·
quest log · chrome) running the *existing* engine, on the *existing*
data model, behind a flag — with the data model's five gaps documented
as tracked tickets.

- **0.1 Data-model audit → tickets.** Confirm the mappings in
  [`target-data-model.md`](target-data-model.md) against live state; open
  a ticket per real gap (attribute granularity, 8×8 editor, OAM cell
  detail, budgets, round-trip exports). Add round-trip tests for the
  structures that will be serialised.
- **0.2 Shared project state.** One canonical in-memory project + storage
  layer serving all modes (extend `DefaultState` / `storage.js`), so mode
  switches never reload or lose work. This is the substrate the whole
  Studio sits on.
- **0.3 Studio shell.** Static shell implementing the four regions
  ([`ui-architecture.md`](ui-architecture.md)): mode rail, empty
  contextual dock, the CRT TV wired to `play-pipeline.js` + `emulator.js`
  so the starter game *runs in the centre*, quest-log panel scaffold, top
  chrome (project name, ▶ PLAY, save state, Time Machine entry, level
  switch). Reuse existing modules; do not fork the engine.
- **0.4 Entry & flag.** New Studio entry page reachable behind a flag/URL;
  the seven pages remain the default until parity lands.

**Exit:** the starter game boots and plays inside the Studio TV; mode
rail switches empty docks; nothing is lost on switch; old pages
untouched.

## Phase 1 — Core modes at parity

**Goal:** WORLD, CHARS, PALS, RULES, SOUND, CODE work inside the Studio at
functional parity with the pages they replace, plus the quest/validator
learning layer. This is the phase that *earns the switch-over*.

- **1.1 WORLD.** Stamp blocks & entities onto the live nametable in the
  TV. Tile-*type* assignment (solid/platform/ladder/spike/door/win) with
  the ⚙ per-tile override; 🎨 palette painting through the real attribute
  table; an **Assembly view** exposing how screens/blocks are built from
  shared tiles. *(Answers [`notes.md`](notes.md): world-assembly page,
  tile-type + override, assembly mode.)*
- **1.2 CHARS.** The character list + **role assignment** in the dock
  (Player/Enemy/Pickup/NPC/…), redraw-by-assembling-shared-tiles.
  Background-tile drawing is **not** here — it moves to TILES (Phase 2),
  fixing the prototype's two-jobs dock.
- **1.3 PALS.** Backdrop + 4 BG + 4 sprite palettes of 3 from the
  64-colour set, with "used by" readouts. *(Answers [`notes.md`](notes.md):
  "where to set the colour palettes".)*
- **1.4 RULES.** Card-based behaviour (movement, damage, win). Cards
  filtered to the current game type; search/grouping stubbed for growth.
  *(The full sprite-reactions matrix is Phase 3.)*
- **1.5 SOUND & CODE.** SOUND ports the audio editor into a mode; CODE
  shows the generated C read-first (asm/edit gated to Advanced later).
- **1.6 Quest Log + Needs-attention.** Self-ticking quests and the
  validator with *Fix →* / *Show me* jumps. This replaces intro dialogs —
  no modal tutorials.
- **1.7 Expertise-level scaffolding.** The Beginner/Maker/Advanced switch
  reveals/hides modes & dock controls; contextual stage toolbar (common
  two tools + "more"). Full gating filled in as later modes land.

**Exit:** a pupil can build, play, and publish a platformer end-to-end
entirely in the Studio, learning via quests, at Beginner level. **Decide
the switch-over:** make Studio the default; keep old pages reachable as a
fallback for one release.

## Phase 2 — The missing primitive: TILES mode

**Goal:** the 8×8 tile editor exists as a first-class Maker-level mode —
the primitive everything already references (handover §5).

- **2.1 TILES mode.** 16×16 grid of the 256 tiles per bank (BG/sprite),
  large 8×8 paint canvas with the 4-value pen previewed under a chosen
  palette, `[`/`]` stepping, arrow-key move.
- **2.2 Tile operations.** New/duplicate/delete/clear, flip H/V, rotate,
  copy/paste — recover the old site's shortcuts.
- **2.3 Reference integrity.** Drag-to-swap that rewrites *every*
  reference; live "used by" (which blocks/metasprites/screens use this
  tile); "also used by… / Duplicate first" on shared-edit.
- **2.4 In-context jump-ins.** "Edit the tiles of this block/sprite" from
  WORLD and CHARS, so the primitive is discoverable without being a wall
  of 256 squares.
- **2.5 Attribute teaching.** Overlay the 2×2 quadrant grid at the point
  of colouring; make per-quadrant attribute the source of truth and
  retire per-8×8-cell palette (gap #1 in
  [`target-data-model.md`](target-data-model.md)).

**Exit:** a Maker-level pupil can draw a tile once and see it update
everywhere it's used; colouring visibly respects the 2×2 rule.

## Phase 3 — Correctness, budgets & honest exports

**Goal:** the tool teaches the hardware truthfully and the outputs are
real.

- **3.1 CHR budget meter.** Live `used/256` per bank, wired into
  quests/validator as a positive "reuse tiles to fit the cartridge"
  challenge.
- **3.2 8-sprites-per-scanline visualiser** + the flicker/drop-out
  warning, surfaced in the validator.
- **3.3 Metasprite/OAM completion.** Per-cell flip + palette, 8×8/8×16
  modes as true OAM entries (gap #3).
- **3.4 Sprite-reactions matrix** (per sprite × per tile-type: block /
  land / bounce / exit / ignore / call_handler) — real depth restored
  from the old behaviour page, at Maker/Advanced.
- **3.5 Honest, round-trippable exports + import.** `.chr` / `.nam` /
  `.pal` and cc65 C/asm serialised straight from the real structures;
  matching import; round-trip tests (gap #5).
- **3.6 Advanced level filled in.** Raw C/asm editing, CHR banks,
  attribute bytes visible only at Advanced.

**Exit:** budgets and limits are visible and enforced; exported files
round-trip; nothing on screen contradicts the hardware.

## Phase 4 — Reach

**Goal:** grow toward a complete NES game maker without clutter (handover
P2). Each item ships behind the appropriate level/disclosure.

- **4.1 Accounts + server saves**, preserving the snapshot/Time-Machine
  guarantees on top of cloud storage.
- **4.2 Teacher tools for real** — class progress, arcade moderation
  queue, showcase pinning (mocked in the prototype today).
- **4.3 More game types** — top-down, auto-runner, racer (engine
  templates already exist in the old builder).
- **4.4 Scrolling multi-screen worlds** rather than discrete rooms.
- **4.5 Spawn-effect sprites on triggers; checkpoints; per-door
  destinations.**
- **4.6 CHR bank switching** for larger games; **FamiStudio music
  import** made real.
- **4.7 In-browser cc65 → .nes compile** so "Download ROM" produces a
  real cartridge image, played in-browser via the bundled jsnes.
  *(Groundwork: `docs/plans/current/2026-06-22-wasm-emulator-spike.md`.)*

**Exit:** the studio supports multiple real game types and produces real
ROMs, still calm enough for a Year-7's first lesson.

---

## Migration strategy (seven pages → one studio)

1. Build the shell and modes **alongside** the existing pages (Phase 0–1),
   sharing one project-state layer so both read the same saves.
2. Reach parity mode-by-mode; a mode only replaces its page once it
   matches it.
3. Flip the default to Studio at the Phase 1 exit; keep the old pages
   reachable one release as a fallback.
4. Remove the superseded pages once the Studio has carried a full term of
   real classroom use without regressions.

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
| What is **missing** from the new UI? | The 8×8 TILES primitive (Phase 2) + the five gaps in [`target-data-model.md`](target-data-model.md) |

## Open questions to settle with the team

- **Rebuild vs. re-skin the current app?** Given the model is already
  correct, the recommendation is to **evolve `tools/tile_editor_web/` in
  place** (new shell + modes over the existing state/engine), not start a
  new codebase. Confirm before Phase 0.3.
- **Framework for the shell.** The current pages are vanilla JS + HTML;
  the prototype is a static mockup. Decide whether the Studio stays
  vanilla or adopts a light component layer — before Phase 0.3.
- **Level defaults per key stage** (who sees Maker/Advanced by default,
  and the teacher override surface) — needed before Phase 1.7.

---

*This plan supersedes ad-hoc redesign notes. It is tracked from
`docs/plans/current/` (see the redesign entry there) and reviewed at each
phase exit.*
