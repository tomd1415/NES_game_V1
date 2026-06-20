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
  - ⏳ **Left for the UI half (your call/build):** the metatile **library panel
    + mini-editor + stamping** on the canvas in `index.html`, a per-bg
    `8x8 | 16x16` toggle wired to a **Promote** button calling
    `MetatileLib.promote`, read-only-palette swatches (the "correct by
    construction" UI cue), and region copy/paste (R-9) on the metatile grid.
    Use `MetatileLib.expand` for live swatch/preview rendering.
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
E2-0 spike ✅ **DONE (2026-06-20)** → E2-1 Builder option + validators (require a
horizontally-scrolling world; warn if no spike painted) → E2-2 spike behaviour +
respawn (render-tested) → E2-3 polish (death flash/sound, distance counter,
A-to-jump remap) → E2-4 authoring ergonomics (metatiles; optional level-loop).

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
Heading resolution (8/16/32 dirs — lean 16); fixed-point format + friction model;
sin/cos table size + CHR cost; track authoring vocabulary (metatiles strongly
recommended); lap model (N ordered checkpoints + finish line + editor affordance
to order them); multiplayer (P2 already exists → split/shared-screen is natural
extra scope).

## 3.4 High-level phases
E3-0 design doc (settle §3.3, prototype the math off-target) → E3-1 movement spike
(`BW_GAME_STYLE == 3`, drivable car, no collision/laps) → E3-2 track-edge
collision → E3-3 rotated car art + Builder option → E3-4 laps & checkpoints →
E3-5 polish & 2-player.

## 3.5 Open questions (flagged)
CHR budget for rotated frames (may force ≤16 dirs); fixed-point trig perf under
cc65 (the one place `-Os` genuinely matters — measure); checkpoint-ordering UX on
a stateless grid; whether `scroll_follow` suffices for a fast car; 8×8 collision
granularity for racing.

## 3.6 Dependencies
The heaviest stack: Arc A + **`-Os`** + **metatiles** + benefits from T3.1/T3.2.
Correctly sequenced **last**.

---

# Appendix — dependency & sequencing

| Initiative | Hard prereqs | Soft prereqs | First-slice risk | Pupil ask |
|---|---|---|---|---|
| **§1 Metatiles** | Arc A (E1-1+) | migration; T3.1/T3.2 (E1-4) | **Low** — server expansion, no baseline change | bigger worlds, F4 (reframed), kills desync (N4) |
| **§2 Runner** | Arc A spawn helper | §1 metatiles; migration | **Low** — reuses jump/scroll/respawn | F24 / T3.4 / R-11 |
| **§3 Racer** | Arc A, `-Os`, §1 | T3.1/T3.2 | **High** — new physics, art, laps | T3.5 |

**Recommendation:** §1 metatiles first (structural, low first-slice risk, unblocks
"bigger worlds", removes a bug class), §2 runner next (highest demand, cheapest
add), §3 racer last behind its own design doc. All `#if`-gated so the default ROM
+ byte-identical invariant are never disturbed.
