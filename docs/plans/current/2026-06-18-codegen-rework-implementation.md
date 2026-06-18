# Codegen rework — implementation plan, 2026-06-18

> **Source.**  The roadmap in
> [`../../reference/codegen-and-nes-architecture-review.md`](../../reference/codegen-and-nes-architecture-review.md)
> (§6).  This doc turns that roadmap into ordered sprints with file-level
> detail, records what shipped 2026-06-18, and specifies the deferred work
> precisely enough to pick up cold.

## Guiding rule

Every change keeps `node tools/builder-tests/run-all.mjs` green — including
the **byte-identical-ROM invariant** (a no-modules Builder ROM must equal the
hand-written `Step_Playground` baseline).  Anything that can't be verified
headlessly (visual/timing/hardware) is **planned, not blindly applied** — it
is handed over with an explicit verification checklist.

## What shipped 2026-06-18 vs deferred

| Sprint | What | Status | Why this call |
|--------|------|--------|---------------|
| 1 | All-modules compile smoke test | ✅ done | Pure test add; closes the worst gap (nothing compiled module *combinations*). |
| 2 | Migrate win/death **tints** into the engine | ✅ done | Small, byte-identical-safe slice that *proves the data-driven migration* and retires the hand-written-hex-in-strings pattern (the green-screen bug class). |
| 3 | Dialogue **font seeding** into CHR | ✅ done | The *live* user fix that finishes web-feedback bug 31 (B-2) — pupils get working dialogue without painting a font. |
| 4 | `-Os` optimisation unblock | ⏸ deferred | Re-founds the sacred invariant **and** flips compiler flags on a timing-fragile engine; the payoff needs FCEUX/hardware eyes I don't have headlessly. Detailed below. |
| 5 | NMI frame-model + dialogue vblank routing | ⏸ deferred | Architectural; touches the boot/NMI path; needs visual verification. |
| 6 | 16×16 metatiles | ⏸ deferred | Multi-day feature; its own design doc first. |
| 7 | Reconcile the asm `/play` path; finish module migrations | ⏸ deferred | Follows the Sprint-2 pattern once proven; larger surface. |

---

## Sprint 1 — All-modules compile smoke test ✅

**Gap (review §S2).**  The byte-identical invariant only exercises the
*zero-module* template; no test ever compiled an arbitrary *combination* of
modules.  A symbol clash, slot-ordering bug, or shared-`i` collision between,
say, `pickups` + `damage` + `dialogue` + `win_condition` would reach a pupil
as a raw cc65 error.

**Shipped.**  New suite `tools/builder-tests/all-modules.mjs`: builds one
project with **every** module enabled and its prerequisites (P1+P2 players,
enemy walker, NPC with dialogue, pickup, HUD heart, a door + trigger painted
in the behaviour map, globals, top-down off), assembles via
`BuilderAssembler.assemble`, POSTs to `/play`, and asserts the ROM **builds**
(`r.ok`).  Picked up automatically by `run-all.mjs`'s suite glob.

---

## Sprint 2 — Migrate win/death tints into the engine ✅

**Gap (review §S1 + §S4).**  The win and death "game-over" tints were
hand-written hex *inside emitted JS strings* (`PPU_MASK = 0x1E | 0x20` /
`0x1E | 0x80`).  That is exactly where the 2026-06-17 green-screen bug
(`0x1F` vs `0x1E`) lived — a typo in a string literal, compile-checked by
nothing.

**Shipped (the data-driven pattern, proven on the smallest safe slice).**

- The engine template (`platformer.c`) now owns the tint, in a fixed block
  right after the `//@ insert: per_frame` slot (so it runs after the modules'
  detection sets `player_dead` / `player2_dead` / `bw_won`), gated:
  `#if PLAYER_HP_ENABLED` (death, with the P1/P2/both permutations) and
  `#if BW_WIN_ENABLED` (win).
- The `damage` and `win_condition` modules **stop emitting `PPU_MASK`** —
  they now emit only state + the freeze, plus `win_condition` defines
  `#define BW_WIN_ENABLED 1`.
- The `run-all.mjs` tint guard moved from "no `0x1F|` in `builder-modules.js`"
  to "the engine's tint is `0x1E` and no `0x1F|emphasis` survives anywhere".

**Why this is byte-identical-safe.**  At no-modules both `PLAYER_HP_ENABLED`
and `BW_WIN_ENABLED` are undefined → the whole block is `#if`-excluded → the
ROM is unchanged.  Same gating pattern the engine already uses for HP/HUD/P2.

**Why only the tints (not the whole AABB loops) this round.**  The tint was
the proven bug *and* the smallest self-contained move — enough to validate
the "modules emit state + data; the compiled engine owns logic" direction
before committing to the larger `pickups`/`damage`/`scene` loop migrations
(Sprint 7).

---

## Sprint 3 — Dialogue font seeding ✅

**Gap (review §N3).**  Dialogue renders text as raw ASCII tile indices, but
`build_chr()` never guarantees glyph tiles exist — so a project with no
hand-painted font (most, especially gallery loads) shows garbage.  The
2026-06-17 `dialogue-no-font` validator only *warned*; this *fixes* it.

**Shipped.**

- A built-in 8×8 font (`_DIALOGUE_FONT` in `playground_server.py`) covering
  space, `0-9`, `A-Z`, and common punctuation, authored as readable
  bitmaps → 2bpp CHR (colour 1).
- `build_chr()` seeds glyphs into the **bg** pool (the dialogue pattern
  table, `$1000`) at their ASCII indices **only when dialogue is enabled and
  only into blank slots** — pupil art in an occupied slot is never
  overwritten.  No encoding change (text is still `tile = ascii`), so the
  emitted `bw_dialogue_text_*` arrays and `round2-dialogue.mjs` are unchanged.
- Byte-identical-safe: `build_chr` font seeding runs server-side for `/play`
  builds only, gated on dialogue-enabled; the byte-identical test builds
  `Step_Playground` via `make` (no font seed) and is untouched.
- The `dialogue-no-font` validator is relaxed: it no longer warns about blank
  slots (now auto-filled); it warns only if a needed glyph slot is **occupied
  by non-font art** (which auto-seed must skip), so the message stays truthful.
- New `tools/builder-tests/dialogue-font.mjs`: builds a dialogue project with
  a blank tileset and asserts the resulting CHR contains the seeded glyphs at
  the expected indices, and that occupied slots are preserved.

**Deferred to Sprint 5 (the *other* half of B-2):** routing `draw_text`
through the engine's single vblank window instead of its own main-loop
forced-blank.  That's the "split-second stage glitch" and is a frame-model
change (below), not a font change.

---

## Sprint 4 — `-Os` optimisation unblock ⏸ (deferred — needs your eyes)

**Why it's worth doing (review §N7/§3.1).**  The whole engine compiles with
**no cc65 optimisation** (`CFLAGS` empty) purely so the Builder template and
the stock `Step_Playground/src/main.c` stay byte-identical for the regression
invariant (`Makefile` comment).  Optimisation today reaches only the
hand-unrolled hot loops; every cold path pays the no-opt tax for a *test
artefact*.

**Why deferred.**  Flipping `-Os` on a timing-fragile NES engine (the scroll
column/row bursts live on a per-cycle vblank budget) can shift timing in ways
the headless jsnes suite won't catch.  It must be eyeballed in FCEUX/Mesen.

**Exact mechanism (when you're ready):**

1. The blocker is that the test compares *stock `main.c`* vs *template*, and
   under `-O` those structurally-different files diverge.  Re-found the test:
   in `run-all.mjs`, replace the "stock == template" build with **"template
   (no modules) == a frozen golden SHA1"** stored in the test (regenerated
   deliberately when the template legitimately changes).  Optionally pin
   `main.c`'s own ROM to its own golden hash too.
2. Set `CFLAGS = -Os` (or `-Osir`) in `steps/Step_Playground/Makefile` and
   update the `Makefile` comment.
3. Run `run-all.mjs` (must stay green: it now compares against golden hashes,
   not cross-file equality).
4. **Verification checklist (manual, before relying on it):** build a
   scrolling 2×1 project and a 1×2 project; in FCEUX confirm no new
   scroll tearing/flicker at boundaries; confirm audio still plays in time;
   confirm a dialogue box still renders.  Revert is one line (`CFLAGS =`).

---

## Sprint 5 — NMI frame model + dialogue vblank routing ⏸

**Gap (review §N1/§N2).**  The playground engine uses a `waitvsync()`
busy-wait and writes PPU from the main loop; `draw_text`/`clear_text_row`
force-blank (`PPU_MASK = 0`) mid-loop with no length bound, so a long line's
`$2007` writes spill past the ~2273-cycle vblank → the reported "dialogue
glitches the stage for a split second."  The *correct* NMI-driven model
already exists in `src/reset.s` (OAM DMA + flush inside the NMI) but the
pipeline doesn't use it.

**Plan.**  (a) Route all dialogue text through the engine's existing
`//@ insert: vblank_writes` window (the engine already does row-buffered
writes there for `BW_DIALOGUE_ENABLED`); retire the standalone
`waitvsync`+force-blank in `draw_text`/`clear_text_row`.  (b) Cap to one row +
a per-frame byte budget (≤~120 bytes after OAM DMA + any scroll burst).
(c) Longer-term, move OAM DMA + a bounded VRAM-update queue into the crt0 NMI.
**Verification:** visual — open a long dialogue while scrolling; the picture
must not blank.  Deferred for the same reason as Sprint 4.

---

## Sprint 6 — 16×16 metatiles ⏸ (own design doc first)

**Gap (review §N4).**  Backgrounds are raw 8×8 nametables with attributes
stored separately — the structural cause of the recurring attribute/palette
desync, and the blocker for the pupils' "bigger worlds" + "make the squares
half" asks (web-feedback F3/F4, plan T3.1/T3.2).  A 16×16 metatile layer
aligns 1:1 with attribute granularity (palettes correct by construction) and
shrinks maps ~75 %.  This is a multi-day feature with editor + engine +
server + storage-migration surface; it needs its own
`docs/plans/current/<date>-metatiles.md` before code.  Pairs with the
deferred scroll-streamer work (T3.1/T3.2).

---

## Sprint 7 — Reconcile the asm path; finish module migrations ⏸

- **Asm `/play` divergence (review §S3).**  `build_scene_asminc` (~130 ln) is
  a frozen subset of `build_scene_inc` (~480 ln) — no P2/HUD/anim/dialogue,
  no parity test.  Either generate both includes from one source of truth, or
  scope the asm path to an explicitly-labelled "no Builder modules" mode so
  its limits are honest.  Add a parity guard.
- **Finish the data-driven migration (review §S4).**  Using the Sprint-2
  pattern, absorb the remaining string-emitted per-frame loops
  (`pickups`/`damage` AABB, `scene` AI, `doors` probe, `dialogue` trigger)
  into the engine behind `#if *_ENABLED`, leaving the modules to emit only
  `#define`s + `const` tables.  Do one module per change, byte-identical-
  gated, each with an all-modules-test re-run.
- **Retire the dead `events` id** sitting in `MODULE_ORDER` with no catalogue
  entry.

---

## Verification log (2026-06-18)

`node tools/builder-tests/run-all.mjs` green after each sprint, including the
byte-identical-ROM invariant and the two new suites (`all-modules.mjs`,
`dialogue-font.mjs`).  See `docs/changelog/changelog-implemented.md`.
