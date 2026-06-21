# Next-phase master plan — 2026-06-18

The detailed, sequenced plan to complete every suggestion in
[`2026-06-18-next-phase-suggestions.md`](2026-06-18-next-phase-suggestions.md).
This is the **entry point**: it gives the cross-arc sequence, dependencies,
milestones, effort, and cross-cutting work, and links to the per-arc detail.

## Per-arc detailed plans

| Arc | Theme | Detailed plan |
|-----|-------|---------------|
| **A** | Visual render-test harness | [`2026-06-18-arc-a-render-test-harness.md`](2026-06-18-arc-a-render-test-harness.md) |
| **B** | Readable dialogue box | [`2026-06-18-arc-b-readable-dialogue-box.md`](2026-06-18-arc-b-readable-dialogue-box.md) |
| **C** | Pupil feature backlog (Tier 2) | [`2026-06-18-arc-c-tier2-backlog.md`](2026-06-18-arc-c-tier2-backlog.md) |
| **D** | Codegen architecture follow-through | [`2026-06-18-arc-d-codegen-followthrough.md`](2026-06-18-arc-d-codegen-followthrough.md) |
| **E** | Metatiles + new game styles | [`2026-06-18-arc-e-metatiles-and-game-styles.md`](2026-06-18-arc-e-metatiles-and-game-styles.md) |

Builds on the earlier codegen rework
([`2026-06-18-codegen-rework-implementation.md`](2026-06-18-codegen-rework-implementation.md),
Sprints 1–3 done) and the web-feedback fixes
([`2026-06-17-web-feedback-fixes.md`](2026-06-17-web-feedback-fixes.md)).

**Interrupt — bug-fix sweep (Wave 0.5):** the 2026-06-20 bug report found eight
confirmed defects on current `main` (data loss, wrong game from the Top-down
workflow, out-of-bounds OAM writes, …). These take priority over the feature
arcs and run as a new wave; see the
[bug-report fix plan](2026-06-20-bug-report-fix-plan.md). A few cross-link into
the arcs (BR-03 ↔ Arc D OAM budget, BR-04/05 ↔ Arc C spawn pool, BR-01 ↔ Arc E
game styles, BR-06 ↔ shared emulator), noted in that plan.

## Guiding rules (apply to every arc)
1. **The byte-identical-ROM invariant is sacred.** Every engine change is
   `#if`-gated so a no-modules ROM equals the `Step_Playground` baseline; macros
   self-default via `#ifndef`. New module logic moves *into* the compiled engine
   (the data-driven direction), not into emitted strings.
2. **Verify before shipping anything visual.** The recurring failure mode is
   visual bugs reaching pupils because the suite can't see the screen. Arc A
   removes that — so it comes first, and every later visual change ships with a
   render test.
3. **One concern per change, suite green at each step.** `run-all.mjs` (incl.
   byte-identical + the new render suites) stays green throughout.

## Cross-arc dependency graph

```
            ┌─────────────────────────────────────────────┐
            │  Arc A — render-test harness  ⭐ FIRST        │
            │  (deterministic-spawn helper = T4)           │
            └──────┬───────────────┬───────────────┬───────┘
                   │ verifies       │ verifies      │ verifies
                   ▼                ▼               ▼
      ┌────────────────────┐  ┌──────────────┐  ┌─────────────────────┐
      │ Arc B — dialogue   │  │ Arc C — Tier-2│  │ Arc E — metatiles + │
      │ box (palette)      │  │ features      │  │ new game styles     │
      └────────────────────┘  └──────┬───────┘  └──────────┬──────────┘
                                      │ R-9 copy/paste       │ needs Arc A spawn
                                      │ lands better on ─────┘ + (racer) -Os
                                      ▼ the metatile grid
      ┌──────────────────────────────────────────────────────────────┐
      │ Arc D — codegen sprints (runs alongside; not gated by A)      │
      │  S4 -Os (quick win) · S7 migration+asm · S5 NMI frame model   │
      │  S7 migration makes B/C/E engine work cleaner; -Os helps racer │
      └──────────────────────────────────────────────────────────────┘
```

**Hard dependencies:**
- Arc B, the visual parts of Arc C (R-10 bob, R-3/R-6 spawn), and Arc E all
  depend on **Arc A's deterministic-spawn helper** (task A-T4) to be testable.
- Arc C **R-6** (hurt sprite) hard-depends on **R-3** (the spawn pool).
- Arc E **racer** depends on Arc A + **`-Os` (D-S4)** + **metatiles (E §1)**.

**Soft dependencies (cheaper-after, not blocking):**
- Arc E authoring (runner tracks, racer tracks, R-9 copy/paste) is much nicer
  **after metatiles**.
- Arc B/C/E engine work is cleaner **after the Arc D Sprint-7 migration** (engine
  owns the loops), but none is blocked by it.
- Arc D Sprint 4 (`-Os`)'s *regression* side is automated by Arc A; its *visual*
  side still wants an FCEUX/Mesen pass.

## Milestones (waves)

### Wave 0 — Land the current work ✅ DONE
That batch (web-feedback fixes, dialogue scroll + per-NPC fixes, editor
letter-tile UI, codegen Sprints 1–3, plan docs) is long since committed on
`main`. The **Cross-cutting → Commit cadence** section below is historical.

### Wave 0.5 — Bug-fix sweep ✅ DONE (2026-06-20)
The eight confirmed defects in the 2026-06-20 bug report are fixed, each with a
regression test in `tools/builder-tests/`; full `run-all.mjs` (incl. the
byte-identical invariant + all ROM builds) is green. Detail and per-bug
solutions: [bug-report fix plan](2026-06-20-bug-report-fix-plan.md).
**All eight are complete.** **BR-05 shipped as model B** (independent effects,
per the user's call): the trigger and damage effects now each own their art +
lifetime in the engine (per-slot `spawn_kind`, `SPAWN0_*`/`SPAWN1_*`,
`SPAWN_TTL_0`/`SPAWN_TTL_1`), byte-identical baseline preserved. The BR-03
in-emulator overflow render test (`render-player-oam-overflow.mjs`) has now been
backfilled on Arc A's harness, so the sweep has no deferred items.

### Wave 1 — Foundation: Arc A (~4–4.5 days)
The render-test harness + the deterministic-spawn helper + backfill render
regressions for the four recent visual fixes (dialogue-on-scroll, tint-not-flood,
font glyph, walker-wall-stop). **Everything after Wave 1 is verifiable.**

### Wave 2 — Finish dialogue + quick wins (parallelisable, ~1–1.5 weeks)
- **Arc B** — the readable dialogue box (verified by Arc A). Decisions to confirm:
  full-width attribute-aligned banner (avoids palette bleed); ship "white text,
  box body = universal_bg" now, defer the backdrop-independent dark box.
- **Arc C quick wins in parallel:** **R-10 character bob** (Quick), **R-4 enemy
  speed** (JS-only), **R-9 background copy/paste** (editor-only, isolated). Also
  **Arc D Sprint 4 (`-Os`)** — ✅ DONE (2026-06-20): byte-identical test
  re-founded on golden hashes, `CFLAGS = -Os` enabled, suite green, FCEUX/Mesen
  A/B pass confirmed clean on both emulators.

### Wave 3 — The meaty features (~1.5–2 weeks)
- **Arc C R-7** (button → attack animation) — proves the tagged-animation art
  path; then **R-3** (spawn pool, the one new engine subsystem) + **R-6** (hurt
  sprite, its first consumer) together; then **R-8** (checkpoints, coordinate the
  death-tint suppression with B-4).
- **Arc D Sprint 7** — *partly DONE (2026-06-20):* the safe slices landed —
  dead `events` id retired, role table de-duplicated, asm `/play` path made
  honest (scope banner + parity guard + first-ever asm smoke test). **The
  per-frame loop migrations (`pickups`/`damage`/`doors`/`dialogue`/`scene`) are
  deferred:** they can't be done byte-identically one-at-a-time (the per-frame
  slot accumulates all modules at one ordered marker, so migrating one reorders
  the rest). Needs an all-at-once order-preserving migration or per-step
  re-pin + behavioural review — see the finding in
  [`2026-06-18-arc-d-codegen-followthrough.md`](2026-06-18-arc-d-codegen-followthrough.md).

### Wave 4 — Bigger reach (multi-week)
- **Arc E §1 Metatiles — ✅ DONE through E1-1 (2026-06-20/21).** Server-side
  expansion (E1-0: `_expand_metatiles` + `metatiles.mjs`, palette-correct by
  construction, no baseline change); the shared `MetatileLib`
  (migrate/promote/expand/deleteBlock, headless-tested); and the **full
  Backgrounds-page authoring UI** (Slices 1–5: promote/revert · 16×16 render ·
  block library + click/drag stamp · mini-editor · delete · region copy/paste).
  Builds non-destructively (`promote-roundtrip.mjs`). *Remaining: **E1-4** —
  NES-side compact storage (`mt_map[]`+`mt_defs[]`) for genuinely huge worlds /
  longer runner tracks; multi-day, vblank-sensitive, do with/after T3.1–2.*
- **Arc E §2 Infinite-runner — ✅ DONE through E2-1/E2-3 (2026-06-20); pupil-
  tested.** Auto-runner game style (`BW_GAME_STYLE == 2`: autoscroll + shared
  jump + A-to-jump + spike/pit/end respawn), Builder option + `AUTOSCROLL_SPEED`,
  validators, dialogue auto-disabled in runner (pupil-reported), runner+modules
  compatibility. *Remaining: death flash / distance counter (visual), the
  Behaviour-page "spike" palette label, and longer tracks (needs E1-4/T3.2 — the
  editor caps worlds at 2×2 today).*
- **Arc D Sprint 5 (NMI frame model)** — the deeper rework; a VRAM ring buffer is
  *already linked* via nes.lib (`ppubuf_flush`), just bypassed — decompose into
  (1) per-frame byte budget on the in-window Builder dialogue, (2) safe snippet
  primitives, (3) the architecture change. Design-first. *(Also the prerequisite
  for in-runner dialogue, which is currently disabled.)*

### Wave 5 — Largest initiative (own design doc)
- **Arc E §3 Top-down racer** — angle-based velocity, rotated art, laps. Write
  `docs/plans/current/<date>-topdown-racer.md` first; needs Arc A + `-Os` +
  metatiles. Last.

## Rough effort
- Wave 0: ~0.5 d. Wave 1: ~4–4.5 d. Wave 2: ~1–1.5 wk. Wave 3: ~1.5–2 wk.
- Wave 4: multi-week (metatiles is the big one; runner is small). Wave 5: its own
  initiative.
- **Through Wave 3 ≈ 4–5 focused weeks**; Waves 4–5 are open-ended by design.

## Cross-cutting work

### Commit cadence (Wave 0 — ✅ historical, completed)
That batch is long since committed on `main`. The grouping below is kept as a
record of what landed:
1. Web-feedback triage + bug fixes (B-1 enemy collision, B-4 tint, B-8 animation
   warning, B-2 dialogue font) + the docs.
2. Dialogue: per-NPC build fix + camera-relative scroll fix + the font-set sync
   guard + tests.
3. Editor: the letter-tile reservation UI (`index.html` + the validator + sync).
4. Codegen rework Sprints 1–3 + the all-modules test.
5. Config tidy-up (`.vscode`, `.code-workspace`, `.claude/settings.json`,
   `.gitignore`, the `.pyc` untrack, the ca65 extension swap).
6. The plan docs (this set + the architecture review + suggestions).
End commit messages with the standard co-author trailer.

### Feedback-intake cadence
The web-form stream went untranscribed for ~2 months. Adopt a light routine — a
periodic pass over `spritemaker.co.uk/feedback`, or a scheduled reminder — and
record verbatim into `docs/feedback/` (per the
[`project_web_feedback_stream`] memory). "Handled" in the viewer ≠ fixed.

### Parked (Tier 4 — own design conversation, not in this plan)
- **Tablet/mobile UX** (T4.1) — the editor assumes pointer + keyboard; in-browser
  play assumes a keyboard.
- **Pupil accounts + cross-device project save** (T4.2) — biggest item, now
  **under way.** Design doc:
  [`2026-06-21-pupil-accounts.md`](2026-06-21-pupil-accounts.md) (account stores
  **only a non-real-name username + a hashed password**); all 5 decisions
  resolved (class join-code, both recovery routes, manual sync, many projects,
  HTTPS). **P1 backend DONE** — `tools/accounts.py` (SQLite + scrypt + sessions +
  rate-limit + join-code) wired into `playground_server.py` as `/auth/*`, tested
  by `accounts.mjs` (20 assertions), ROM golden untouched. **P2 project storage
  DONE** — authenticated `/me/projects` CRUD with SQL-enforced ownership, tested
  by `account-projects.mjs` (16 assertions incl. cross-user isolation). **Remaining:**
  P3 editor UI (needs an in-person pass) → P4 recovery/gate UI →
  P5 gallery ownership (answers feedback item 24) → P6 lifecycle. (Anonymous
  per-browser gallery-deletion nonce remains a promotable Tier-2-sized first step.)
Listed so they're not forgotten; each needs its own doc before code.

## Status snapshot (2026-06-21)
Waves 0–3 and the Wave-4 features (metatiles E1-0/E1-1, runner E2) are **done**;
the 2026-06-20 bug sweep (BR-01…08) is done. Earlier "open decisions" are all
**resolved**: Arc B shipped the full-width banner; Arc C R-3/R-6/R-7 shipped;
Arc D Sprint 4 enabled `-Os` (golden-hash test, FCEUX-verified); Sprint 7 did the
safe slices and **deferred** the per-frame migration (pickups→win ordering
coupling — see the Arc D plan); Arc E did metatiles server-side-expansion-first.
**Arc E §3 racer started:** E3-0 design doc + E3-1 movement spike (`BW_GAME_STYLE
== 3`) are **done** — drivable car (16-dir heading, 8.8 fixed-point speed,
COS16 table, accel/friction), Builder `🏎 Racer` option + `racerTopSpeed` tunable
+ `racer-needs-scrolling-world` validator, headless-green (`racer.mjs`,
`racer-validators.mjs`), golden ROM unchanged. **E3-1 feel pass: confirmed good
by the user.** **E3-2 track-edge collision also done** — push-back + dominant-axis
speed rule (head-on stops/bleeds, graze slides), `racer-collision.mjs` green.

## Open decisions / next big initiative (pick one)
The remaining work is large and design-first — these are the genuine forks:
- **Arc E §3 Top-down racer — IN PROGRESS.** E3-0/E3-1/E3-2 done (see above + the
  [racer design doc](2026-06-21-topdown-racer.md)). Remaining: E3-3 rotated car
  art → E3-4 laps & checkpoints → E3-5 polish/2P.
- **Arc D Sprint 5 (NMI frame model)** — architectural; also unblocks in-runner
  dialogue. Highest risk; design-first; ship the dialogue-budget slice first.
- **Arc E §1 E1-4 (NES-side compact metatile storage)** — genuinely huge worlds /
  longer runner tracks; multi-day, vblank-sensitive; pairs with T3.1–2.
- **Smaller polish** (not design-first): runner death-flash / distance counter,
  the Behaviour-page "spike" palette label, metatile marquee block-snap.

## Suggested next steps
1. **Racer E3-2 feel pass** (user, in person) — drive into / along walls and
   confirm the push-back + slide feel. (E3-1 movement was already confirmed good.)
2. Then **E3-3 rotated car art** (CHR-budget call: 16-dir vs 8-dir-reused-for-16),
   **E3-4 laps & ordered checkpoints**, **E3-5 polish + 2-player**.
3. In parallel, **accounts P3** (editor UI for sign-in + save/load) whenever you
   want the cross-device save wired into the editor — backend (P1/P2) is ready.
4. Or pivot to Sprint 5 / E1-4 above if those matter more to you.
