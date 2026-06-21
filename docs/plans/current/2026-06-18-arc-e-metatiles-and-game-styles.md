# Arc E — Bigger Reach: Metatiles and New Game Styles

> **Source.** The roadmap in
> [`../../reference/codegen-and-nes-architecture-review.md`](../../reference/codegen-and-nes-architecture-review.md)
> (§N4) and the Arc-E sketch in
> [`2026-06-18-next-phase-suggestions.md`](2026-06-18-next-phase-suggestions.md).
> Design-doc-first for three multi-week initiatives — **16×16 metatiles**, the
> **infinite-runner / Geometry-Dash style (T3.4)**, and the **top-down racer
> (T3.5)** — answering the pupil asks for "bigger worlds", "make the squares
> half" (F4), an infinite runner (F24), and a racer.

## Guiding rule (inherited)
Every change keeps `node tools/builder-tests/run-all.mjs` green, **including the
byte-identical-ROM invariant**. All three initiatives are gated behind opt-in
flags (`#if BW_METATILES`, `#if BW_GAME_STYLE == 2/3`) so the default platformer
ROM is untouched. Anything not verifiable headlessly is planned, not blindly
applied.

## Why grouped, and shared dependencies
- **Arc A render harness** is a prerequisite for all three (do the
  deterministic-spawn helper before the new game styles, or runner/racer tests
  are as flaky as the dialogue repro was).
- **The data-driven migration (Arc D Sprint 7)** makes all three cheaper — each
  adds engine logic; better to add an `#if` branch to compiled C than interleave
  with string-emitted loops.
- **Metatiles pairs with scroll-beyond-2×2 (T3.1/T3.2)** — both touch the
  `bg_world_*[]` streaming path in `scroll.c`. Metatiles also *reduce* T3.2's
  urgency (~75% smaller maps).
- **`-Os` (Arc D Sprint 4)** matters most for the racer's per-frame angle math.

**Recommended sequence: Metatiles → Infinite-runner → Racer.**

---

# 1. 16×16 Metatiles — the structural background change

## 1.1 Goal & the pupil ask
A metatile = *2×2 tiles + one palette*; the world is authored as a grid of
metatile IDs. Answers three asks at once:
- **"Bigger worlds"** — ~75% fewer cells and ~75% smaller map data → more screens
  fit. Metatiles are the realistic lever; raw 8×8 maps hit ROM/streaming limits.
- **"Make the squares half" (F4)** — must be *reframed*, not literally granted:
  NES tiles are physically 8×8 (logged HW-LIMIT). The pupil's real intent is a
  *bigger block brush* (paint a "grass block" in one click), not a sub-8×8 tile.
  Sell metatiles as "paint whole blocks / make much bigger levels."
- **Palette correctness by construction** — the latent win (§1.2).

## 1.2 The desync this kills (investigated)
Today the browser stores palette **per 8×8 cell** (`index.html` `emptyNametable`),
but NES attribute granularity is **16×16**; at emit the server **downsamples** —
reads only the top-left 8×8 cell of each quadrant and **discards the other three**
(`playground_server.py` `_nametable_bytes_for`, `_world_nametable`), silently. A
metatile makes the mismatch structurally impossible: **1 metatile = 1 palette = 1
attribute quadrant.** This removes a whole bug class, not one bug.

## 1.3 How the engine streams today (investigated)
`scroll.c` is gated behind `#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)`.
`load_world_bg()` loads tiles and attributes in **separate passes** from
`bg_world_tiles[]` / `bg_world_attrs[]`; the streamer re-streams **tiles only**
(attributes never re-stream mid-scroll — a latent artefact source). Collision is a
parallel 8×8 `behaviour_map`. **Key insight:** because tiles and attributes are
emitted/loaded *separately*, a metatile layer can be a **build-time expansion**
emitting correct, consistent arrays — **zero engine change for the first slice.**

## 1.4 Key decisions
- **D1 — what a metatile is:** 4 tile indices (TL,TR,BL,BR) + 1 palette + 1
  behaviour id. Bundling behaviour sets look + collision in one paint action.
- **D2 — expansion site:** **(A) server-side first** (expand metatile map →
  existing `bg_world_tiles[]`/`bg_world_attrs[]`/`behaviour_map`; no engine change,
  palette-correct, reuses all of `scroll.c`), then **(B) NES-side compact storage
  later** (`mt_map[]`+`mt_defs[]`; realises the ROM saving + fixes attribute
  re-streaming, but rewrites the streamer — vblank-sensitive). Browser-only is
  rejected (doesn't kill desync, doesn't shrink ROM).
- **D3 — per-bg mode, not global replace:** `background.tileMode: '8x8'|'16x16'`
  (default `8x8`); existing projects stay 8×8; a one-way "promote to metatiles"
  infers a starter library from current art.
- **D4 — collision stays 8×8 internally:** a metatile's behaviour id expands to
  its 2×2 block at emit.
- **D5 — dimensions:** in metatile units a 2×2-screen world is 32×30; with Option
  B the same ROM holds ~a 4×4-screen world — the honest "bigger worlds" answer.

## 1.5 Storage & migration
Add `migrateMetatileFields(s)` to `migrateState` — **do not bump STATE_VERSION**
(additive/optional fields default `tileMode='8x8'` when absent). New per-bg fields:
`tileMode`, `metatiles[]` (the library), `mtmap[][]` (metatile IDs). Legacy
`nametable`/`behaviour` remain the source of truth for 8×8 bgs (kept for safe
downgrade). The promote helper scans the nametable in 2×2 chunks → library entries.

## 1.6 Editor UI (`index.html`)
Per-bg mode toggle; a metatile library panel (16×16 swatches composited via the
existing tile-draw path) + a mini-editor (pick 4 tiles + palette + behaviour); the
canvas cell becomes `16*zoom` and one click stamps a metatile id; **palette is
read-only per metatile** (the UI expression of "correct by construction"); region
copy/paste (R-9) is trivial on the metatile grid and should be built here.

## 1.7 Phase plan
- **E1-0** — Spike: server-side expansion, no engine change (§1.8). ✅ **DONE
  (2026-06-20).** `_expand_metatiles(state)` in `playground_server.py` expands
  any `tileMode:'16x16'` background (`metatiles[]` library + `mtmap[][]`) into the
  ordinary 8×8 `nametable`/`behaviour` grids before any emitter reads them, and
  sets `dimensions` to span it. Called once at the top of the `/play` build, so
  every path (single nam, world nametable, behaviour map) is reused unchanged —
  **no `scroll.c`/`platformer.c`/baseline change** (verified: byte-identical
  invariant still green; 8×8 bgs are a no-op). Test: `tools/builder-tests/
  metatiles.mjs` — asserts (A) every 16×16 attribute quadrant is single-palette
  against the real expansion, and (B) a hand-authored checkerboard metatile
  project builds a real iNES ROM through `/play`. This banks the §1.2 desync kill
  (palette correct by construction) at the data layer.
- **E1-1** — Authoring UI + state + migration + promote helper. *Headless half
  DONE (2026-06-20); UI half is what's left.*
  - ✅ **`tools/tile_editor_web/metatiles.js`** — a shared, UI-agnostic
    `MetatileLib` with `migrate` (additive; 8×8 bgs untouched so saves stay
    stable, 16×16 bgs get their arrays, unknown→8×8), `promote(bg)` (8×8→16×16:
    scans 2×2 blocks, dedups into a library, builds the id map; palette+behaviour
    from each block's TOP-LEFT cell = render-equivalent to the old emit), and
    `expand(bg)` (16×16→8×8 for live preview). `expand` mirrors the server
    `_expand_metatile_bg` **byte-for-byte** (cross-checked in tests).
  - ✅ Wired into `index.html` (script tag + `MetatileLib.migrate(s)` in
    `migrateState`). No UI yet — additive, no behaviour change for 8×8.
  - ✅ Centralised in ONE module (not duplicated per page) — deliberately
    avoiding the per-page migration drift that caused BR-01.
  - ✅ Test `tools/builder-tests/metatile-lib.mjs`: migrate additivity,
    promote dedup/map, promote→expand round-trip, JS↔server `expand` parity,
    non-uniform-block→TL-palette.
  - **UI Slice 1 DONE (2026-06-20):** `index.html` gained a **🧱 Promote to
    metatiles** button (calls `MetatileLib.promote`) + **↩ Back to 8×8** (flattens
    via `MetatileLib.expand`). `renderNametable` + `renderFullPreview` render a
    16×16 bg by expanding its mtmap (so the canvas matches the ROM), with a bold
    16×16 grid overlay; the 8×8 paint tools + size selector are locked in metatile
    mode (`syncMetatileControls`). Headless guard `promote-roundtrip.mjs`: a
    palette+behaviour-block-uniform 8×8 bg builds to the **same ROM** after
    promote (editor→server path non-destructive). *Pupil-facing caveat surfaced:
    promote coarsens per-8×8-cell palette **and** behaviour to one-per-16×16-block
    (takes the block's top-left) — by design for metatiles.*
  - **UI Slice 2 DONE (2026-06-20):** a **block library** strip (one 16×16
    swatch per metatile, drawn from its 4 tiles + palette) appears in metatile
    mode; click a swatch to select it, then **click/drag the grid to stamp** it
    (`stampMetatileAt` writes `mtmap[y>>1][x>>1]`, one undo per stroke).
    **User-confirmed working (2026-06-20).**
  - **UI Slice 3 DONE (2026-06-20):** an inline **mini-editor** for the selected
    block — a 4× preview (`drawMetatileSwatch` now takes a zoom), a palette
    select, a behaviour select, and **+ New block** (copies the selected block;
    edit its tiles after). Pick a tileset tile then click a corner of the
    preview to set it; palette/behaviour apply to the whole block. Edits apply
    immediately and re-render library + canvas. **User-confirmed working
    (2026-06-20).**
  - **UI Slice 4 (partial) DONE (2026-06-20):** **block delete** —
    `MetatileLib.deleteBlock(bg, id)` removes a block, falls its usages back to
    block 0, and shifts higher ids down to stay valid (refuses to delete the
    last block); wired to a **🗑 Delete block** button. Unit-tested in
    `metatile-lib.mjs`. The palette select carries a tooltip stating the
    one-palette-per-block rule (the "read-only-palette" cue). **Metatile block
    CRUD is now complete** (promote → stamp → edit → +new → delete). *Built +
    suite-green; visual test outstanding (non-blocking — user moved on).*
  - **UI Slice 5 DONE (2026-06-20): R-9 region copy/paste on the metatile grid.**
    The **Select** tool is re-enabled in metatile mode; `copyNtRegion` /
    `pasteNtRegion` gained 16×16 branches that copy/paste **whole blocks**
    (mtmap ids, tile coords → metatile by `>>1`) via a separate
    `mtRegionClipboard`; pasted ids out of range fall back to block 0. Marquee +
    "Copy region" + "Paste here" now build big block-levels fast. (The marquee
    overlay is tile-granular; copy/paste snap to whole blocks.) **The metatile
    authoring feature is now complete** (promote · stamp · edit · +new · delete ·
    copy/paste). *Built + suite-green; visual test of delete + copy/paste
    outstanding (non-blocking — user moved on to the next initiative).*
- **E1-2** — Behaviour bundling (metatile behaviour → 8×8 `behaviour_map`).
- **E1-3** — Bigger-world authoring cap (surface honestly that >2×2 scrolling
  needs T3.1/T3.2).
- **E1-4 (later)** — NES-side compact storage: rewrite `load_world_bg` + stream
  paths to expand metatile→4 tiles + attribute in vblank-safe bursts; gate
  `#if BW_METATILES`. The multi-day, timing-sensitive phase — do last, with the
  harness and ideally `-Os`.

## 1.8 Scoped first build (the spike)
"One hand-authored metatile project compiles to a correct ROM via server-side
expansion." Add the fields to one test JSON by hand; add
`_world_nametable_from_metatiles(state)` to `playground_server.py` that expands
`mtmap`+`metatiles` into the same `bg_world_tiles[]`/`bg_world_attrs[]`/
`behaviour_map` byte layout (palette taken directly from each metatile →
guaranteed uniform per quadrant); build via `/play`; assert in the harness that
every attribute quadrant is single-palette. **No `scroll.c`/`platformer.c`/
baseline change.**

## 1.9 Risks
R1 (high) attributes-don't-re-stream while scrolling (Option A inherits it,
Option B fixes it — keep big maps within the 2×2 load until E1-4); R2 (med)
vblank budget on NES-side expansion; R3 (med) pupil confusion ("where did per-tile
colour go?") → UI copy + keep 8×8 mode + promote helper; R4 (low) two background
models; R5 (low) library size vs RAM/ROM (cap + validate).

## 1.10 Dependencies
Arc A harness (strongly recommended before E1-1). E1-4 should follow/coordinate
with T3.1/T3.2 (both rewrite the streamer).

---

# 2. Infinite-runner / Geometry-Dash game style (T3.4)

## 2.1 Goal & ask
Forced auto-scroll, **tap to jump**, **touch a spike → instant restart**.
Feedback **F24**, logged **T3.4 / R-11**; most-requested new style.

## 2.2 What exists already (investigated) — why it's cheap
- **Game-style seam:** styles are `#if BW_GAME_STYLE == N` blocks; a new style is
  `== 2` alongside platformer (`== 0`) / top-down (`== 1`). Undefined-stays-0
  keeps the baseline byte-identical.
- **Jump physics exist:** edge-triggered impulse + `BW_APPLY_GRAVITY`/
  `BW_APPLY_JUMP_RISE` macros — reuse almost verbatim.
- **Forced scroll is a one-line injection:** the camera is normally
  `scroll_follow(...)`; for a runner, advance `cam_x += AUTOSCROLL_SPEED;`. `cam_x`
  is a plain `unsigned int` from `scroll.c`; player `px` is independent.
- **Respawn is trivial:** re-run `px = PLAYER_X; py = PLAYER_Y;` (+ zero `cam_x`,
  `jumping`, `jmp_up`).
- **Spike detection reuses `behaviour_at`:** slot 7 (`BEHAVIOUR_CUSTOM7`) is free.

## 2.3 What's missing
No constant-scroll camera mode; no hazard/death-on-touch-tile (damage only does
sprite-overlap HP → freeze, no respawn); no `game.type` beyond platformer/top-down.

## 2.4 Decisions
- **D1 — player x under auto-scroll:** lock player to a fixed screen x (classic
  GD — vertical-only input) for v1. `px = cam_x + RUNNER_SCREEN_X` each frame.
- **D2 — death trigger:** a dedicated `BEHAVIOUR_SPIKE` reaction (slot 7),
  independent of HP/HUD; also respawn on falling below `WORLD_H_PX`.
- **D3 — forced scroll:** reuse `scroll.c` unchanged — inject the `cam_x` advance
  under `#if BW_GAME_STYLE == 2`; the streamer already streams new columns.
- **D4 — authoring:** the 8×8 painter works for a sideways spike-field; metatiles
  (§1) make long ribbons far nicer → a reason to do §1 first/in parallel.

## 2.5 Builder schema
`game` module: add `{ value:'runner', label:'🏃 Auto-runner (tap to jump)' }` +
an `applyToTemplate` branch emitting `#define BW_GAME_STYLE 2` + tunables
(`autoscrollSpeed` 1–4, jump height). Surface a "Spike tile" on the Behaviour
page (slot 7).

## 2.6 Engine branch (`#if BW_GAME_STYLE == 2`)
A `runner_respawn()` helper; reuse the platformer jump/gravity block (guard shared
code `== 0 || == 2` rather than copy-paste); lock `px = cam_x + RUNNER_SCREEN_X`;
spike/pit probe → respawn; replace the follow call with `cam_x += AUTOSCROLL_SPEED`.

## 2.7 Phases
E2-0 spike ✅ **DONE (2026-06-20)** → E2-1 Builder option ✅ + validators ✅
**(DONE 2026-06-20)**; spike palette affordance ⏳ (UI) → E2-2 spike behaviour +
respawn ✅ (already in E2-0; render-tested by `runner.mjs`) → E2-3 polish
(A-to-jump remap ✅ **DONE 2026-06-20**; death flash/sound + distance counter
remain) → E2-4 authoring ergonomics (metatiles; optional level-loop).

> **E2-3 (partial — A-to-jump done).** The runner now also jumps on **A**
> (Geometry-Dash "tap to jump"), `#if BW_GAME_STYLE == 2`-gated alongside the
> shared UP control so the platformer is unchanged (byte-identical golden holds).
> `runner.mjs` taps A for its jump check. Remaining E2-3 polish: a death
> flash/sound and an on-screen distance counter (both want a visual pass).

> **Pupil-reported finding (2026-06-20): dialogue is disabled in auto-runner
> builds.** In-person testing showed the dialogue box glitches the screen in a
> runner — its in-vblank PPU writes fight the constant auto-scroll. Fix: the
> dialogue module's `applyToTemplate` now **emits nothing when the game type is
> runner** (no `BW_DIALOGUE_ENABLED`, no per-frame trigger, no vblank writes), and
> a `runner-dialogue-unsupported` **warn** validator tells the pupil. (A proper
> in-runner dialogue would need the Sprint-5 NMI/queue frame model; out of scope
> for §2.) Covered by `runner.mjs` (no `#define` emitted) + `runner-validators.mjs`.
>
> **E2-1 (validators done).** `builder-validators.js` gained three runner
> validators (tested by `tools/builder-tests/runner-validators.mjs`):
> - `runner-needs-scrolling-world` (**error**) — a runner on a <2-screen-wide
>   background can't scroll; blocks Play.
> - `runner-no-spike` (**warn**) — a runner with no spike tile (behaviour slot 7)
>   painted has no hazards; the player can never lose.
> - `runner-dialogue-unsupported` (**warn**) — dialogue is auto-disabled in
>   runner builds (see the finding above).
>
> The Builder runner option + `AUTOSCROLL_SPEED` tunable already shipped in E2-0.
>
> *Remaining (UI, needs a visual pass — deferred):* a **"Spike" palette
> affordance on the Behaviour page** — label/seed the custom slot (id 7) as
> "spike" when the game type is runner, so pupils don't have to know "slot 7 =
> spike". The validators' fix-text points at slot 7 in the meantime. Spike
> *render/respawn behaviour* is already engine-side + covered by `runner.mjs`.

> **E2-0 spike (done).** Engine: `#if BW_GAME_STYLE == 2` in `platformer.c` —
> `cam_x += AUTOSCROLL_SPEED` each frame, `px = cam_x + RUNNER_SCREEN_X` (rides
> the camera, manual L/R skipped), shared platformer jump/gravity via the
> extended `#if BW_GAME_STYLE == 0 || == 2` guard, `runner_respawn()` on touching
> a spike (behaviour slot 7, `BW_RUNNER_SPIKE_ID`), falling below `WORLD_H_PX`, or
> reaching the end. The camera `scroll_follow` is `#if BW_GAME_STYLE != 2`-gated.
> Builder: the `game` module gained a **🏃‍➡️ Auto-runner** type emitting
> `#define BW_GAME_STYLE 2` + `AUTOSCROLL_SPEED` (1–4 tunable). Test
> `tools/builder-tests/runner.mjs` drives a 4×1 world and asserts autoscroll,
> camera-lock, tap-UP jump, and spike→reset. **Byte-identical golden unchanged**
> (all `==2`/`!=2`-gated; the `==0` no-modules path compiles identically) and
> topdown/platformer suites still green.
>
> *Carried to later phases:* E2-1 needs the validators (screens_x ≥ 2; warn if no
> spike painted) + a "Spike tile" affordance on the Behaviour page (slot 7); the
> jump is currently **UP** (shared block) — the **A-to-jump remap** is the E2-3
> polish item; authoring long spike ribbons is much nicer once §1 metatiles land
> (E2-4).

> **Track-length limit (audited 2026-06-20).** The Backgrounds editor only
> offers up to **2×2** screens (`index.html` `#nt-size`: 1×1 / 2×1 / 1×2 / 2×2 —
> the Phase 4.4 cap), and `scroll.c load_world_bg` only fully loads 2 screens per
> axis (wider relies on `scroll_stream`; worlds **beyond 2×2 are T3.2 territory**
> and not shipped). So a pupil-authored runner is **at most a 2-screen-wide
> track** today — short, and it loops/respawns quickly. The engine handles
> wider worlds (the tests use 4×1 via a hand-built state and they scroll), but
> the editor won't author them until metatiles (§1, ~75% smaller maps) and/or
> T3.1/T3.2 land. **No ">2×2" validator is warranted** — the editor already caps
> it; documenting the limit is the honest move. Longer/varied runner tracks are
> the E2-4 ("metatiles") payoff.
>
> **Runner + other modules:** verified to compile + run + keep scrolling with
> HP/damage/HUD/pickups/win all on — `tools/builder-tests/runner-modules.mjs`.
> **Dialogue** is auto-disabled in runner builds (pupil-reported glitch).

## 2.8 Scoped first build
"A 2×4 horizontal world auto-scrolls, player tap-jumps, touching slot-7 tiles
snaps to start." `BW_GAME_STYLE 2`, `cam_x += 2`/frame, reused jump,
`behaviour_at` respawn. Verify in the harness: drive jump for N frames, assert
`cam_x` advanced and a spike reset `px`/`cam_x`. No new scroll code, no persistence.

## 2.9 Risks
R1 (med) auto-scroll + streamer budget at high speed (cap speed); R2 (low) shared
jump duplication (guard, don't copy); R3 (low) runner on a 1×1 world (validator
`screens_x ≥ 2`); R4 (scope) "infinite" expectation — v1 restarts a finite track.

## 2.10 Dependencies
Arc A spawn helper; nicer after §1; independent of the racer.

---

# 3. Top-down racer (Micro Machines) (T3.5)

> **Framing.** The **largest and last** Arc-E initiative, most novel — introduces
> physics the engine has never had (angle-based velocity). **Design-note-first
> with its own future design doc**; below is a high-level phase plan + key
> unknowns, deliberately not full detail.
>
> **Status (2026-06-21): STARTED.** The dedicated design doc is written
> ([`2026-06-21-topdown-racer.md`](2026-06-21-topdown-racer.md)) and the **E3-1
> movement spike is done** — `BW_GAME_STYLE == 3` drivable car, headless-green,
> golden ROM unchanged. Awaiting the user's visual/feel pass before E3-2. See
> §3.4 for per-phase status.

## 3.1 Goal & ask
Top-down racing: a car with **angle-based velocity** (steer rotates heading,
accelerate adds velocity along heading), **track-edge collision**, **lap
counting**. Extends the top-down style into the racing genre (T3.5).

## 3.2 Reusable vs genuinely new
Reusable: the top-down branch (`BW_GAME_STYLE == 1`, no-gravity model); the 8×8
`behaviour_at` grid (track vs edge); the game-style + Builder + scroll plumbing.
New (why it's the hard one): **angle-based velocity** (today all movement is
axis-aligned integer steps — needs a heading, 8.8 fixed-point `vx/vy`,
accel/friction, a sin/cos table); **rotated sprite rendering** (per-angle CHR);
**lap counting / ordered checkpoints** (sequence-sensitive, unlike stateless
`behaviour_at`); **camera for a free car** (`scroll_follow` deadzone likely
reusable with tuning).

## 3.3 Decisions for the dedicated design doc
**Settled in [`2026-06-21-topdown-racer.md`](2026-06-21-topdown-racer.md) §3:**
heading resolution = **16 dirs** (D1); fixed-point = **signed 8.8** with sub-pixel
accumulators (D2); **16-entry Q7 cosine table** `COS16`, `sin(h)=COS16[(h+12)&15]`
(D3); accel/friction tunables with `#ifndef` defaults (D4); steering = ±1 heading
(D5); track authoring = metatiles, track vs edge via `behaviour_at` (D6); collision
= hard slow + push-back (D7); camera = reuse `scroll_follow` (D8); rotated art =
per-heading CHR, **deferred to E3-3** (D9); laps = N ordered checkpoints + finish
(D10); 2-player deferred (D11).

## 3.4 High-level phases
- **E3-0 design doc** — ✅ done ([`2026-06-21-topdown-racer.md`](2026-06-21-topdown-racer.md)).
- **E3-1 movement spike** (`BW_GAME_STYLE == 3`, drivable car, no collision/laps)
  — ✅ **done**: engine block in [`platformer.c`](../../../tools/tile_editor_web/builder-templates/platformer.c)
  (heading/speed/COS16/sub-pixel, all `== 3`-gated), Builder `🏎 Racer` option +
  `racerTopSpeed` tunable, `racer-needs-scrolling-world` validator, tests
  `racer.mjs` + `racer-validators.mjs` (green), golden ROM unchanged. **E3-1 feel
  pass confirmed good by the user.**
- **E3-2 track-edge collision** — ✅ **done + feel-confirmed**: `racer_on_edge()`
  (SOLID_GROUND/WALL), per-axis push-back + dominant-axis speed bleed (head-on
  stops/bleeds, graze slides at speed), `racer-collision.mjs` green.
- **E3-4 laps & race goal** — ✅ **done** (before E3-3): finish + checkpoint
  alternation (no ordering needed), `RACER_LAPS_TO_WIN` tunable, win-tint + freeze,
  `racer-laps-need-markers` validator, `racer-laps.mjs` green (anti-farm + win).
  *Pending the user's feel pass.*
- **E3-3 rotated car art** — ✅ **done** (option A: server auto-rotates one
  right-facing drawn car into 8 frames in spare CHR; engine draws by heading,
  `racer-rotation.mjs` green; no-op for non-racers). *Pending the user's visual pass.*
- **E3-5 polish & 2-player** (+ numeric lap HUD, ordered checkpoints, reverse/brake,
  flip-shared rotation CHR) — pending.

## 3.5 Open questions (flagged)
CHR budget for rotated frames (may force ≤16 dirs); fixed-point trig perf under
cc65 (the one place `-Os` genuinely matters — measure); checkpoint-ordering UX on
a stateless grid; whether `scroll_follow` suffices for a fast car; 8×8 collision
granularity for racing.

**Perf update (E3-1):** the spike's per-frame math is **2 long multiplies +
2 long position updates** (heading→vx/vy via `COS16`, sub-pixel accumulate) —
estimated ~1–1.5k cycles/frame (~5% of the ~29.8k NTSC budget), and it *replaces*
the platformer's horizontal-walk probing. Comfortably affordable on paper; the
**visual/feel pass confirms no real-hardware slowdown** (watch for laggy/sluggish
movement). `scroll_follow` reuse and CHR budget are deferred to E3-2/E3-3 as
planned.

## 3.6 Dependencies
The heaviest stack: Arc A + **`-Os`** + **metatiles** + benefits from T3.1/T3.2.
Correctly sequenced **last**.

---

# Appendix — dependency & sequencing

| Initiative | Hard prereqs | Soft prereqs | First-slice risk | Pupil ask |
|---|---|---|---|---|
| **§1 Metatiles** | Arc A (E1-1+) | migration; T3.1/T3.2 (E1-4) | **Low** — server expansion, no baseline change | bigger worlds, F4 (reframed), kills desync (N4) |
| **§2 Runner** | Arc A spawn helper | §1 metatiles; migration | **Low** — reuses jump/scroll/respawn | F24 / T3.4 / R-11 |
| **§3 Racer** | Arc A, `-Os`, §1 | T3.1/T3.2 | **High** — new physics, art, laps | T3.5 — **E3-0/E3-1 done** |

**Recommendation:** §1 metatiles first (structural, low first-slice risk, unblocks
"bigger worlds", removes a bug class), §2 runner next (highest demand, cheapest
add), §3 racer last behind its own design doc. All `#if`-gated so the default ROM
+ byte-identical invariant are never disturbed.
