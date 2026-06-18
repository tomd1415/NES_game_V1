# Codegen & NES architecture review — 2026-06-17

A review of the **Builder codegen** (how pupil choices become a compilable
NES program) and an audit of the **NES engine** against established
nesdev / cc65 best practice.  Written after the 2026-06-17 web-feedback bug
fixes, because two of those bugs (enemy collision, the green-screen tint)
lived in string-emitted codegen and a third (dialogue garbage) is a missing
NES convention — i.e. they were symptoms, and this doc is about the disease.

Companion to [`nes-resources.md`](nes-resources.md) (the link list) and the
fix plan [`../plans/current/2026-06-17-web-feedback-fixes.md`](../plans/current/2026-06-17-web-feedback-fixes.md).
Evidence is cited as `file:line`; line numbers drift, search the symbol.

---

## TL;DR — answering the four questions

> *"Are there better ways to achieve the same goals?  Would going completely
> in assembly be better?  Is there another approach that's better in some
> way?  Or is it just a good tidy-up the current code needs?"*

1. **Better way to do codegen: yes — finish the migration you already
   started.**  The codebase has two layers: a **fat, compiled engine**
   (`platformer.c`) configured by `#define`s, and **thin string-emitted C**
   from the Builder modules.  The good subsystems (player movement, Player 2,
   HUD, animation, the door loader) already live in the engine behind
   `#if BW_*` and are configured by emitting only macros + data tables.  Six
   modules (`scene`, `pickups`, `damage`, `doors`, `win_condition`,
   `dialogue`) still hand-build per-frame C loops as strings — and *that is
   where the bugs concentrate*.  The single highest-value change is to keep
   pushing logic **out of string-codegen and into the compiled engine behind
   flags**, so the Builder emits configuration, not control flow.

2. **Full assembly rewrite: no.**  The engine is already the
   *recommended* hybrid — C for game logic, hand-written ca65 only for the
   hot loops (`scroll.c` unrolled bursts, `graphics.s`, the audio crt0).  The
   real pain points are **architecture** (the dialogue forced-blank) and
   **missing assets/abstractions** (no font in CHR, no metatiles) — a rewrite
   fixes none of them and would gut the pedagogy (pupils read and edit the C).
   See [§4](#4-should-we-rewrite-the-engine-in-assembly).

3. **Another approach that's better in some way: yes, the data-driven
   direction (above), and one structural fix to the test net.**  A heavier
   alternative — a bytecode/behaviour VM — is *not* worth it here
   ([§5](#5-recommended-direction--alternatives-considered)).

4. **Is it "just a tidy-up"?  It's both — a targeted re-architecture *plus*
   adopting a handful of NES best practices the pipeline currently breaks.**
   None of it is a rewrite; most is incremental.  The roadmap is in
   [§6](#6-prioritised-roadmap).

**Bottom line:** the tool works and the engine's hard parts (OAM/DMA, scroll
bursts, struct-of-arrays) are done well.  What it needs is (a) to *finish*
moving module logic into the data-driven engine, (b) to fix three NES-
correctness gaps (dialogue frame model, a CHR font, metatiles), and (c) to
re-found the byte-identical test so it stops blocking compiler optimisation.

---

## 1. How the codegen works today

```
builder.html  ──fetch──▶  builder-templates/platformer.c   (the engine, with slots)
     │
     ▼
BuilderAssembler.assemble(state, template)        (builder-assembler.js:133)
     │   walks MODULE_ORDER; each enabled module's applyToTemplate() either:
     │     • replaceRegion('//>> id … //<<', body)        — swap a hint region
     │     • appendToSlot('//@ insert: <slot>', text)     — fill a slot
     │   slots: declarations, init, per_frame, vblank_writes  (platformer.c)
     ▼
customMainC  ──POST /play──▶  playground_server.py
     │   generates DATA includes: scene.inc, palettes.inc  (build_scene_inc, …)
     ▼
cc65 / ca65 / ld65 in a tempdir  ─▶  iNES ROM  ─▶  jsnes (browser) / fceux (native)
```

The crucial structural fact: **behaviour is split across two layers.**

- **Fat engine, data-driven** — already in `platformer.c`, gated by
  `#if BW_*` / `#if *_ENABLED`, configured purely by `#define`s and the
  `const` tables the server emits into `scene.inc`: *all* player movement /
  ladders / jump / gravity (`platformer.c` `#if BW_GAME_STYLE == 0`),
  top-down movement (`== 1`), **the entire Player 2 path**, the HUD hearts,
  the scene-sprite animation tick + render (`#if BW_HAS_SCENE_ANIM`), the
  multi-bg door *loader*, and the scroll/OAM/DMA core.  These modules emit
  only macros + small `replaceRegion` value swaps.

- **Thin codegen that isn't — string-emitted C per build** — six modules
  still hand-build multi-line C control flow:
  `scene` (walker/chaser AI + the new `bw_sprite_blocked` helper),
  `pickups` (AABB collision loop), `damage` (AABB + i-frames + death tint),
  `doors` (trigger probe), `win_condition` (detect/freeze + tint),
  `dialogue` (trigger block + the vblank PPU-write block).

The migration from layer 2 → layer 1 is **half done**.  HUD and Player 2 used
to be string-emitted and were absorbed into the engine; the six above are the
remainder, and they share near-identical `behaviour_at()` / AABB shapes that
could be absorbed the same way.

---

## 2. Structural smells (with severity)

| # | Smell | Why it bites | Evidence |
|---|-------|--------------|----------|
| S1 | **Hand-written constants inside emitted C strings** | The exact class of the green-screen bug — `PPU_MASK = 0x1F\|0x20` was a typo in a string literal, caught only after it shipped.  Guarded today by a *regex over source text*, not by compiling the logic. | `builder-modules.js` tint at win/death; guard `run-all.mjs` (`/PPU_MASK = 0x1F/`) |
| S2 | **The byte-identical invariant proves the opposite of what matters** | It builds the *zero-module* template and asserts it equals the stock `main.c`.  No module is ticked, no `scene.inc` is emitted — so **no `applyToTemplate` output is ever compiled by the test**, and no module *combination* is checked for "does it even compile." | `run-all.mjs` byte-identical check; comment "no modules ticked" |
| S3 | **`build_scene_inc` (~480 ln) vs `build_scene_asminc` (~130 ln) have silently diverged** | The asm `/play` path is a frozen subset — no P2, HUD, scene-animation or per-NPC dialogue.  Every feature added since the asm path was written exists only in the C emitter, and nothing enforces parity.  The role-code table is duplicated verbatim. | `playground_server.py` `build_scene_inc` / `build_scene_asminc` |
| S4 | **Six modules still string-build per-frame C loops** | These are where B-1 (enemy AI) and B-4 (tint) lived.  Their AABB/`behaviour_at` shapes are the same ones already absorbed into the engine for HUD/P2/anim — the seam between "data-driven" and "string-emitted" is exactly where fragility concentrates. | `scene` / `pickups` / `damage` / `doors` / `win_condition` / `dialogue` in `builder-modules.js` |
| S5 | **Cross-module coupling is convention-only** | `MODULE_ORDER` array position is the *sole* guarantee that `pickups` (declares `bw_pickup_total`) precedes `win_condition` (reads it).  File-scope emissions rely on a `bw_` prefix, not a namespace.  The loop var `i` is shared by every emitted loop.  A dead `events` id sits in `MODULE_ORDER` with **no catalogue entry** and is silently skipped. | `builder-assembler.js` `MODULE_ORDER`, `assemble()` |
| S6 | **No compile-check until a full ROM build** | `assemble()` is pure string concatenation; the first validation of emitted C is cc65 in the tempdir.  The validators catch *config* mistakes, not malformed emission (brace balance, typo'd symbol). | `builder-assembler.js` `assemble`; `builder-validators.js` |

None of these is a live crash today — the engine ships working ROMs.  They
are *latent* costs: each new module multiplies the untested combinations (S2),
the asm path rots further (S3), and every string-emitted constant is a
potential S1.

---

## 3. NES best-practices audit

The most important finding: **there are two frame architectures in this
repo.**  The hand-written Zelda-2 base (`src/reset.s`) uses the *correct*
NMI-driven model (OAM DMA inside the NMI handler) — but the **playground
pipeline that pupils actually ship** (`steps/Step_Playground`,
`builder-templates/platformer.c`) uses a `waitvsync()` busy-wait and does all
PPU work in the main-loop body.  The good model exists but the pipeline
doesn't use it.  The audit targets the pipeline.

| # | NES best practice | What the pipeline does | Severity | Direction |
|---|-------------------|------------------------|----------|-----------|
| N1 | **NMI-driven VRAM update**: main loop fills a buffer; the NMI flushes it to `$2006/$2007` in vblank; never write VRAM mid-frame. | `waitvsync()` then PPU writes from the **main loop**.  Works only because rendering is force-blanked around the scroll burst. | Med | Move OAM DMA + a bounded VRAM-update queue into the crt0 NMI (the model already exists in `src/reset.s`). |
| N2 | **Forced blank** (`PPUMASK=0` → write → `PPUMASK` on) is fine only wholly *within* vblank / at init. | `draw_text` / `clear_text_row` force-blank from the main loop with **no length bound** — a long string's `$2007` writes spill past the ~2273-cycle vblank into active render. **This is the "dialogue glitches the stage for a split second" bug (B-2 / item 31).** | **High** | Route text through the engine's single `vblank_writes` window; cap to one row + a byte budget/frame; never toggle `PPU_MASK` outside that window. |
| N3 | **A font must physically exist in CHR**; reserve a fixed glyph range (often `tile = ascii − offset`). A nametable byte is a tile index, not a character. | No font seeding at all — `build_chr()` packs the pupil's painted tiles (or blank CHR).  Dialogue writes raw ASCII indices, so a project without a hand-painted font shows **garbage** (B-2 / item 31). | **High** | Seed a default font into a reserved CHR sub-range when dialogue is enabled; convert text at emit time with one offset.  (The 2026-06-17 `dialogue-no-font` validator is the *warning*; this is the *fix*.) |
| N4 | **16×16 metatiles** for backgrounds — 1:1 with attribute granularity (32×32-px attr byte = 4 metatiles), ~75 % smaller maps, palettes correct by construction. | None — raw 8×8 nametables with attributes stored separately (`bg_world_attrs[]`), which is *why* the history has recurring attribute/palette-desync bugs. | Med | A metatile layer is the right answer to the pupils' "bigger worlds" + "make the squares half" asks **and** structurally prevents the palette bugs. |
| N5 | **Vblank budget ≈ 2273 cycles NTSC** — ~1 OAM DMA (513) + ~160 bytes to `$2007`. | Mostly disciplined (OAM DMA single + first; scroll bursts prepared outside vblank then unrolled inside) — **except** the unbudgeted `draw_text` (see N2). | Med | Enforce a per-frame byte ceiling; split long text across frames. |
| N6 | **OAM**: page-aligned shadow OAM, single `$4014` DMA, respect 64-sprite + 8-per-scanline limits. | **Strong.** Page-aligned shadow OAM, single DMA, 64-cap guarded, parked slots at Y=`0xFF`.  Minor: no 8-per-scanline awareness (wide player + HUD + scene row can silently flicker). | Low | Optional: document the 8/line limit; optional OAM round-robin to even out flicker. |
| N7 | **cc65**: `-Osir`, `unsigned char`, no recursion, static locals, zeropage hot vars, struct-of-arrays. | Follows the *manual* equivalents (globals not stack locals, `unsigned char`, struct-of-arrays `ss_x[]/ss_y[]…`, ZP-tight) — but compiles with **no optimisation at all** (empty `CFLAGS`) to keep the byte-identical invariant.  See [§3.1](#31-the-no-optimisation-tradeoff). | Med | Re-found the invariant on a frozen reference so the engine can be built `-Os` (below). |

### 3.1 The no-optimisation tradeoff (N7, the subtle one)

The Makefile disables `-O` on purpose, and the stated reason is sharper than
"the bytes change": with `-O`, cc65 makes **different inline/register
decisions for the stock `main.c` vs the Builder's `platformer.c` template** —
the two are semantically equal on the no-modules path but *structurally*
different (extra macros, slot markers, gated globals), so under `-O` they
**diverge from each other** and the byte-identical test (which compares the
two) fires.  (`Makefile` comment at the `CFLAGS =` line.)

So Agent-style advice of "just regenerate the baseline with `-Os`" does **not**
work as-is — the test compares *stock vs template*, not *template vs a stored
hash*.  The correct fix is to **change what the invariant compares**:

- Make `Step_Playground/src/main.c` *be* the template (one source of truth),
  so "stock vs template" is trivially identical at any `-O` level; then
- Re-base the reproducibility test on **template (no modules) vs a frozen
  golden ROM hash**, regenerated deliberately whenever the template changes.

That unblocks `-Os` for the **whole** engine — today optimisation reaches only
the hand-unrolled hot loops, and every cold path pays the no-opt tax for a
test artefact.  This is the cleanest single performance lever available.

---

## 4. Should we rewrite the engine in assembly?

**No.**  Grounded in this codebase, not dogma:

- **The C↔asm gap is small and already closed where it matters.**  cc65 runs
  ~1.2–1.4× slower than hand asm in typical code; the brutal cases are
  localized hot loops, and this engine *already* hand-writes exactly those —
  the unrolled scroll bursts (`scroll.c`), `graphics.s`, the asm crt0.  The
  per-frame budget is met by moving slow array indexing *out* of vblank
  (`scroll_stream_prepare`) — an algorithmic fix, not a language one.
- **The pain points aren't "C is too slow."**  They're architecture (N2
  forced-blank) and missing abstractions (N3 font, N4 metatiles).  A rewrite
  reintroduces all of them in a harder language.
- **For a teaching tool, C *is* the feature.**  Pupils read the main loop,
  edit the `//>>` hint regions, and the Advanced Code page lets them modify
  the real `main.c`.  Rewriting ~1,450 lines of teachable C into 6502 for a
  single-digit-percent win the engine doesn't need is a bad trade.
- **String-emitting *asm* is strictly worse than string-emitting *C*** — no
  compiler to catch a fat-fingered constant (S1 with the safety net removed).
  The existing asm `/play` path is already a frozen, second-class subset (S3);
  expanding it is the opposite of the right direction.

**Where asm *does* pay off** (and is already used, or worth extending): the
NMI/OAM/VRAM-flush kernel (N1), and any future hot loop proven by measurement.
If a design ever genuinely outgrows cc65, the modern move is **llvm-mos** or
**NESFab** (both keep a high-level language and beat cc65) — not hand asm.

---

## 5. Recommended direction & alternatives considered

**Chosen direction — finish the "fat engine, thin data codegen" migration.**
Move the six string-emitting modules' logic into `platformer.c` behind
`#if PICKUPS_ENABLED` / `#if DAMAGE_ENABLED` / … exactly as HUD and Player 2
were absorbed.  The Builder then emits **only** `#define`s + `const` data
tables (which it already does well, e.g. the dialogue byte arrays).  Wins:

- Kills S1 (constants like the tint live in compiled, reviewable engine code,
  not strings) and most of S4/S6.
- The engine becomes testable as a fixed artefact; combinations are
  `#if` permutations of one compiled file, not N strings glued at runtime.
- Pupils reading the Advanced Code page see the *real* loops, not a generated
  blob.

Two alternatives, and why they lose:

- **A bytecode / behaviour-script VM** (engine interprets a compact program
  the Builder emits as data).  Genuinely robust — codegen becomes pure data —
  but it's a large build, adds per-frame interpreter overhead on a 1.79 MHz
  CPU, and *removes* the readable C that makes this an educational tool.  Over-
  engineered for the module set here.
- **Keep string-codegen but add a typed C-emitter / mini-AST** (managed
  indentation, symbol table, can't fat-finger a hex literal).  A real
  improvement over raw `parts.push('…')`, and worth it *if* much logic stays
  in codegen — but if §5's migration succeeds, there's little logic left to
  emit, so this is a smaller hedge, not the main play.

---

## 6. Prioritised roadmap

Ordered safest/highest-value first.  Cross-linked to the bug list and the
fixes plan; none requires an asm rewrite.

**Now — close the loops the recent bugs exposed**
1. **Re-found the byte-identical test on a frozen golden ROM** and unify
   `Step_Playground/main.c` with the template (§3.1).  Unblocks `-Os` and
   fixes S2's "tests the wrong thing."  *Prereq for everything perf-related.*
2. **Add a real codegen test**: build one project with *every* module ticked
   and assert it compiles (closes the S2/S4 gap that lets a malformed emission
   reach pupils).

**Next — adopt the three NES conventions the pipeline breaks**
3. **Dialogue frame model + font** (N2 + N3): route text through the
   `vblank_writes` window with a per-frame byte budget, and seed a default
   CHR font when dialogue is enabled.  This is the *fix* behind the 2026-06-17
   `dialogue-no-font` *warning* — closes web-feedback bug 31 / item 28 / the
   deferred item 11, together.
4. **Begin the data-driven migration** with the two safest modules
   (`win_condition`, `damage` — their tint + AABB are small and self-
   contained) into `platformer.c` behind flags.  Proves the pattern; deletes
   the S1 tint strings for good.

**Later — structural & reach**
5. **Metatiles (N4)**: a 16×16 background layer — answers "bigger worlds" +
   "make the squares half", and structurally ends the attribute/palette
   desync class.  Pairs with the deferred scroll-streamer work (plan T3.1/T3.2).
6. **Reconcile or retire the asm `/play` path (S3)**: either generate both
   includes from one source of truth, or scope the asm path down to an
   explicitly-labelled "no Builder modules" mode so its limits are honest.
7. Finish migrating the remaining string-emitting modules (`scene`,
   `pickups`, `doors`, `dialogue`) as the pattern from step 4 settles.

---

## Sources

NES-dev correctness (nesdev.org wiki): The frame and NMIs · PPU programmer
reference · PPU scrolling · Init code · NMI · PPU frame timing · DMA · PPU
attribute tables · Fonts · PPU OAM · Sprite size.  cc65 docs: `cc65.html`,
`coding.html`, `cc65-intern.html`.  Guides: nesdoug (metatiles, sprite-zero,
"how cc65 works"), Shiru "Programming NES games in C", ilmenit
"CC65-Advanced-Optimizations", famicom.party, copetti.org NES architecture,
pubby.games/nesfab.  Full URL list: see the 2026-06-17 review thread; the
canonical link set lives in [`nes-resources.md`](nes-resources.md) — extend it
with the metatile + frame-timing pages above.
