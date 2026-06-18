# Next-phase suggestions — 2026-06-18

A prioritised set of suggestions for where to take the project next, grounded
in the recent work and the standing backlog.  Cross-references:
[`codegen-and-nes-architecture-review.md`](../../reference/codegen-and-nes-architecture-review.md),
[`2026-06-18-codegen-rework-implementation.md`](2026-06-18-codegen-rework-implementation.md),
[`2026-06-17-web-feedback-fixes.md`](2026-06-17-web-feedback-fixes.md),
[`2026-04-26-fixes-and-features.md`](2026-04-26-fixes-and-features.md).

## Where we are

Recently shipped: web-feedback triage + bug fixes (green-screen tint, enemy
collision, jump-animation warning, dialogue font + uppercasing, the per-NPC
dialogue build error, dialogue-on-scrolling-maps), the editor letter-tile
reservation UI, and codegen-rework Sprints 1–3 (all-modules compile test,
tint → engine migration, dialogue font seeding).  Foundations now in place: a
**jsnes-in-Node capability** (used to reproduce the dialogue bug), a stronger
test suite (compile + byte-identical + source guards), and a documented
architecture review.

Two facts shape the next phase:

1. **Most bugs that reach pupils are *visual*** — green screen, dialogue
   garbage, dialogue invisible while scrolling.  The suite proves code
   *compiles* and stays *byte-identical*, but it can't *see the screen*, so
   these only surfaced via pupil reports (and were slow to reproduce headlessly).
2. **A healthy, recurring feature backlog** from pupils (enemy speed,
   spawn-on-hit, checkpoints, new game styles) plus a clear architecture
   roadmap (metatiles, finish the data-driven migration).

## Recommended theme: **"Trustworthy, then bigger"**

Make the platform *verifiably correct* and *finish* the half-done dialogue work
first, then build out requested features and architectural reach on that
foundation.  Rationale: every recent visual bug was unverifiable headlessly —
a render-test harness pays back on everything that follows.

---

## Arc A — Close the visual-verification gap ⭐ *highest leverage*

The single biggest cause of bugs reaching pupils is that nothing checks the
*rendered output*.  We now have jsnes loading in Node (this session), so the
foundation exists.

- **A reusable render-test harness** (`tools/builder-tests/`): build a project
  through `/play`, load the ROM in jsnes, run N frames, drive the controller,
  and read OAM / nametable / framebuffer to assert.
- **Solve deterministic positioning** — the thing that fought the dialogue
  repro.  A test-only helper to spawn the player adjacent to an NPC (or a
  "teleport to" hook) so interaction tests are reliable, not physics-dependent.
- **Backfill render regressions for the bugs just fixed**: dialogue text is
  visible on a 2×1 scrolled map; the win/death tint isn't a green/blue flood;
  seeded font glyphs render; enemies stop at a wall.
- **Payoff:** every future visual feature (the dialogue box below, metatiles,
  new game styles, editor UI) becomes testable instead of report-driven.

*Effort: ~1 focused arc. Value: very high — changes the whole quality model.*

## Arc B — Finish dialogue (a readable box)

Dialogue is 90% there but has one real gap and one cosmetic one.

- **A proper dialogue box with its own palette (the real gap).**  Text
  currently renders in whatever background palette sits under the box, so its
  colour is uncontrolled — it can blend into the scenery.  Draw a solid box
  background (a known dark tile) over the dialogue rows and assign that region a
  dedicated palette with a readable text colour, so dialogue is legible on *any*
  project.  This is the natural completion of the font + scroll work.
- **The brief forced-blank flash** when the box opens (cosmetic) — folds into
  the frame-model rework (codegen Sprint 5).
- Nice-to-haves: word-wrap / auto-pagination for long text; a small "▼" prompt.

*Effort: small–medium. Value: high — removes the last dialogue surprise, and
Arc A can verify it.*

## Arc C — Pupil feature backlog (Tier 2)

The still-open requests pupils actually asked for, ordered value-per-effort
(R-/T- numbers from the feedback + tier plans):

- **R-10 character bob when walking** — quick, fun, pure render nudge.
- **R-4 / R-8 enemy & per-sprite speed** — repeatedly requested; parametrise the
  hard-coded `+= 1` in the scene AI (builds on the collision fix).
- **R-3 spawn-a-sprite-on-hit** (= T2.9) and **R-7 press-a-button-to-animate /
  attack** (kin T2.4) — the "make my game *do* things" asks.
- **R-8 checkpoints** — respawn-on-death instead of a frozen game-over.
- **R-9 background region copy/paste** — pure editor productivity.
- **R-6 persistent hurt-effect sprite** — depends on R-3 + non-player animation.

*Effort: one Builder module per item. Value: directly answers pupil feedback.*

## Arc D — Architecture follow-through

From the architecture review / codegen rework (deferred sprints):

- **Sprint 4 — turn on cc65 optimisation (`-Os`).**  Re-found the byte-identical
  test on a frozen golden hash, then flip the flag.  Needs an FCEUX/Mesen visual
  pass (which you can now do) — Arc A could automate the regression side.
- **Sprint 7 — finish the data-driven migration** (move the remaining
  string-emitted `pickups`/`damage`/`scene`/`doors` loops into the engine behind
  `#if`), and **reconcile or retire the second-class asm `/play` path**.
- **Sprint 5 — NMI-driven VRAM update model** — the deeper frame-model fix that
  also kills the dialogue forced-blank flash.  Bigger; do after Arc A so it's
  verifiable.

## Arc E — Bigger reach (own design docs first)

- **Metatiles (16×16)** — the structural answer to pupils' "bigger worlds" and
  "make the squares half", and it eliminates the recurring attribute/palette
  desync class.  Multi-week; wants its own design doc (review §N4 / plan T3.1–2).
- **New game styles pupils keep asking for:** the **infinite-runner /
  Geometry-Dash** mode (R-11 / T3.4 — requested by many younger pupils) and the
  **top-down racer** (T3.5).  Design-note-first, Tier 3.

## Cross-cutting

- **Commit the current work.**  A large, valuable body of changes (all of the
  above-listed fixes + the editor UI + Sprints 1–3) is sitting **uncommitted**
  in the working tree — worth landing on a branch before building more.
- **A feedback-intake cadence.**  The web-form stream went untranscribed for
  ~2 months.  A light routine (e.g. a periodic pass over `/feedback`, or a
  scheduled reminder) keeps pupil reports from piling up — see
  [`project_web_feedback_stream`] notes.
- **Mobile/tablet + accounts (Tier 4)** remain parked pending a design
  conversation (plan T4.1 / T4.2) — list them so they're not forgotten.

---

## Suggested sequence (one recommended path)

1. **Commit** the current working tree (branch off `main`).
2. **Arc A** — the render-test harness + backfill regressions for the recent
   visual fixes.  *(Foundation everything else leans on.)*
3. **Arc B** — the readable dialogue box, verified by Arc A.
4. **Arc C** — pick 3–4 pupil features (start with R-10, R-4, then R-3/R-8).
5. **Arc D** — `-Os` (Sprint 4) as a contained win; begin Sprint 7 migration.
6. **Arc E** — write the metatiles **or** infinite-runner design doc and scope
   the first Tier-3 build.

> **If you'd rather lead with pupil-visible wins** instead of foundation:
> swap the order to Arc C first (R-10 character bob + R-4 enemy speed are quick,
> visible crowd-pleasers), then circle back to Arc A before the dialogue box and
> the bigger features.  Arc A still comes before metatiles / new game styles —
> those are too visual to build without a render test.
