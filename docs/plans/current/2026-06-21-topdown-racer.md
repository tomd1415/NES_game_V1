# Top-down racer (Arc E §3) — design doc + phase plan — 2026-06-21

> **Scope.** The dedicated design doc the master plan + Arc E §3 call for before
> any racer code. It settles the open decisions (Arc E §3.3/§3.5) with concrete
> choices, sketches the engine math, and sequences the build. Prereqs are now in:
> Arc A render harness, `-Os` (D-S4), and metatiles (E1-1).
>
> Source: [`2026-06-18-arc-e-metatiles-and-game-styles.md`](2026-06-18-arc-e-metatiles-and-game-styles.md) §3.

## 1. Goal
A top-down racing style (`BW_GAME_STYLE == 3`): a car with **angle-based
velocity** — steering rotates a heading, accelerating adds velocity along that
heading, friction bleeds it off — plus **track-edge collision** and **lap
counting**. Extends the top-down (`== 1`) genre into racing (T3.5).

## 2. What's reused vs genuinely new
**Reused:** the game-style seam (`#if BW_GAME_STYLE == N`, undefined→0 keeps the
baseline byte-identical — same pattern as the runner's `== 2`); the 8×8
`behaviour_at` grid (track vs edge); the Builder `game`-module + scroll +
`scroll_follow` camera plumbing; metatiles for authoring big tracks.

**New (why it's the hard one):** angle-based velocity (fixed-point `vx/vy`,
accel/friction, a cos/sin table) — all movement so far is axis-aligned integer
steps; **rotated car art** (per-angle CHR); **lap counting** (ordered
checkpoints — sequence-sensitive, unlike stateless `behaviour_at`).

## 3. Decisions (settling Arc E §3.3 / §3.5)

- **D1 — heading resolution: 16 directions** (22.5° steps). Good smoothness vs
  CHR cost; steering is ±1 step. (8 feels blocky; 32 doubles rotated-art CHR for
  little gain.)
- **D2 — fixed-point: signed 8.8 (16-bit).** `speed`, `vx`, `vy` are 8.8 (value
  ÷256 = pixels/frame). Position keeps the existing `pxcoord_t` world-pixel
  `px`/`py` **plus** an 8-bit sub-pixel accumulator each (`px_sub`/`py_sub`), so
  fractional velocity accumulates without widening `px`/`py`.
- **D3 — cos/sin table: a 16-entry Q7 cosine table** (`±127 ≈ ±1.0`), hardcoded
  (no `Math` on target). `COS16 = [127,117,90,49,0,-49,-90,-117,-127,-117,-90,
  -49,0,49,90,117]`. `sin(h) = COS16[(h + 12) & 15]` (sin θ = cos(θ−90°), 90°=4
  steps). `vx = (speed * COS16[h]) >> 7` (8.8 × Q7 → 8.8); `vy = (speed *
  sin) >> 7`. Note **screen y is down**, so `vy` adds to `py` for a heading that
  points "down-screen" — pick the table sign convention so heading 0 = right,
  4 = down, 8 = left, 12 = up (matches the pad mental model).
- **D4 — friction/accel:** accelerate (A/Up) `speed += ACCEL` capped at
  `MAX_SPEED`; otherwise `speed -= FRICTION` floored at 0. Reverse/brake (Down)
  optional later. All compile-time tunables (`RACER_ACCEL`, `RACER_FRICTION`,
  `RACER_MAX_SPEED`) with `#ifndef` defaults so the Builder can expose them.
- **D5 — steering:** Left/Right change `heading` by ∓1 (mod 16), rate-limited
  (e.g. every 4 frames, or only while `speed > 0` for a more "car" feel —
  start with always-on for the spike).
- **D6 — track authoring: metatiles** (now available) — paint the track with
  block brushes; `behaviour_at` distinguishes **track** (drivable) from **edge**
  (slow/block). Reuse a behaviour slot for "track edge" (candidate: WALL, or a
  custom slot). Decided at E3-2.
- **D7 — collision (E3-2): edge = push-back + dominant-axis slow.** ✅ *Built.*
  Each axis is moved and resolved independently, so a blocked move is undone on
  that axis only — the car **slides along walls** instead of sticking. Speed is
  halved **only when the dominant velocity axis is the one blocked** (a head-on /
  steep hit); a shallow graze keeps its speed and slides. (The first cut halved
  on *any* contact, which made sliding grind to a crawl — the dominant-axis rule
  fixed the feel.) Edge = `SOLID_GROUND`/`WALL` (D6). 8×8 granularity; fine for v1.
- **D8 — camera: reuse `scroll_follow`** centred on the car (it already eases via
  the deadzone). A fast car may want a smaller deadzone; tune at E3-2/E3-3.
- **D9 — rotated art (E3-3): per-heading CHR.** 16 headings × the car's tiles is
  a real CHR cost — mitigate by (a) supporting **8-direction art reused for 16**
  (each art frame covers two adjacent headings) or (b) a smaller car (2×2). For
  the **E3-1 spike, skip rotation**: draw a single fixed car sprite that *moves*
  in the heading direction (proves the physics); rotation lands at E3-3.
- **D10 — laps (E3-4): finish line + one checkpoint (alternation).** ✅ *Built —
  simpler than the original "N ordered checkpoints" idea, which sidesteps the
  flagged checkpoint-ordering UX (§3.5).* A lap = cross the **finish line**
  (behaviour slot 7, the editor's renamable custom slot), pass a **checkpoint**
  (the `trigger` slot, id 5), then cross the finish again — the checkpoint just
  *arms* the lap so a pupil can't farm laps on the line, and no ordering is
  needed. Reaching `RACER_LAPS_TO_WIN` (a Builder tunable, 1–9) ends the race:
  win tint (the existing "you win" cue) + the car freezes. No finish/checkpoint
  painted → no laps → free-drive (also valid). **Multiple ordered checkpoints +
  a numeric lap HUD remain future polish.**
- **D11 — multiplayer (E3-5): deferred.** P2 already exists; split/shared-screen
  is natural extra scope, last.

## 4. Open questions still to watch (Arc E §3.5)
- **CHR budget** for 16 rotated frames — may force 8-dir art (D9a) or a small
  car. Measure at E3-3.
- **Fixed-point trig perf under cc65** — the one place `-Os` (now on) genuinely
  matters; measure the per-frame cost of the `vx/vy` math at E3-1.
- **Checkpoint ordering UX** on a stateless grid — settle at E3-4.
- **`scroll_follow` for a fast car** — may need deadzone tuning.

## 5. Phase plan
- **E3-0 — this design doc.** ✅
- **E3-1 — movement spike.** `#if BW_GAME_STYLE == 3`: `heading` (0–15), `speed`
  (8.8), steer L/R, accel A/Up + friction, `vx/vy` from `COS16`, position via
  sub-pixel accumulators, camera via `scroll_follow`. **No collision, no laps, no
  rotated art** (single car sprite). Render-tested (drive → position moves along
  heading; steer → heading changes; friction → coasts to stop). Builder `game`
  option `🏎 Racer` emitting `BW_GAME_STYLE 3` + tunables. **Byte-identical golden
  unchanged** (all `== 3`-gated). Then a visual pass (does it *feel* like a car?).
- **E3-2 — track-edge collision.** ✅ **Built + headless-green.** `racer_on_edge()`
  scans the car's covered cells for `SOLID_GROUND`/`WALL`; per-axis push-back +
  the dominant-axis speed rule (D7). Test `racer-collision.mjs`: car pins at a
  wall (never through), head-on bleeds speed, shallow graze slides at speed.
  Golden ROM unchanged. **Feel pass: confirmed good by the user.**
- **E3-4 — laps & race goal.** ✅ **Built + headless-green** *(done before E3-3:
  fully headless-verifiable, no art-pipeline decision needed).* Finish +
  checkpoint alternation (D10), `RACER_LAPS_TO_WIN` Builder tunable, win tint +
  car-freeze on completion, `racer-laps-need-markers` validator. Test
  `racer-laps.mjs`: a lap counts, anti-farm holds, the last lap wins + freezes.
  Golden unchanged. **Pending the user's feel pass.**
- **E3-3 — rotated car art + Builder art hookup** (D9); FCEUX CHR check. **Next —
  but needs an art-pipeline decision** (auto-rotate one drawn car vs draw-each-
  frame vs a default car) — tee up with the user.
- **E3-5 — polish + 2-player** (D11). Also: numeric lap HUD, multiple ordered
  checkpoints, reverse/brake (D4).

## 6. Verification & invariants
Same rules as the runner: every block `#if BW_GAME_STYLE == 3`-gated so the
no-modules ROM stays byte-identical (golden + `_rom-equiv`); platformer/top-down/
runner suites stay green; the movement spike gets a headless render test
(`racer.mjs`) asserting the physics, then a mandatory **visual/feel pass** (the
part jsnes can't judge). Builder validators where sensible (e.g. racer wants a
≥2-screen track; later, ≥1 checkpoint + a finish line).
