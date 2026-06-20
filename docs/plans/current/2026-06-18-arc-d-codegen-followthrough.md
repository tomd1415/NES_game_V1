# Arc D — codegen architecture follow-through (deferred sprints)

> **Source.** Roadmap in
> [`../../reference/codegen-and-nes-architecture-review.md`](../../reference/codegen-and-nes-architecture-review.md)
> (§3.1, §5, §6) and the partial plan
> [`2026-06-18-codegen-rework-implementation.md`](2026-06-18-codegen-rework-implementation.md)
> (Sprints 1–3 DONE, 4–7 deferred). This doc turns the deferred sprints into
> task-level work, grounded in the real code (`file:line`, real symbols, real
> test names). Sprint 6 (metatiles) is out of scope here — it needs its own
> design doc as the plan already records.
>
> **Order of work:** **Sprint 4** (contained quick win) → **Sprint 7**
> (incremental, one module per change) → **Sprint 5** (architectural,
> design-first). Each sprint below ends with an explicit verification gate.

## The one rule everything is measured against

`node tools/builder-tests/run-all.mjs` must stay green. Today that runner does
**three** things that constrain every change (all in
`tools/builder-tests/run-all.mjs`):

1. **JS/PY syntax checks** of every shipped file (lines 51–101).
2. **Regex regression guards** (lines 105–471) — including the tint guard
   (`run-all.mjs:375`), the `bw_sprite_blocked` guard (`:397`), the dialogue
   font/uppercase guards (`:425`, `:450`), and the OAM-DMA / volatile-macro
   guards. **Any module migration that deletes an emitted string a guard
   greps for must move that guard, not just delete the string** (Sprint 2
   already did this for the tint — `:375` now asserts the *engine* owns it).
3. **The byte-identical-ROM invariant** (lines 481–501): builds
   `steps/Step_Playground` stock `main.c` (sha1 of `game.nes`), then overwrites
   `src/main.c` with `builder-templates/platformer.c`, rebuilds, and asserts
   **equal sha1**. No module is ticked and no `scene.inc` is re-emitted, so the
   only thing this proves is "the template with no modules == the stock engine."

**Grounding facts gathered for this plan (verified, today):**

- Toolchain present: `cc65 V2.18`, `ca65`, `ld65`, `fceux` all on PATH.
- A clean `make -s` of `Step_Playground` is **0.073 s**; baseline ROM sha1 is
  `00e156fb69cc390fb2e6669379dad335fae8992c`. So rebuild cost is negligible —
  the suite's wall-clock is dominated by per-suite server spawns, not builds.
- File sizes: `steps/Step_Playground/src/main.c` = **779 lines**;
  `builder-templates/platformer.c` = **1473 lines**. They are genuinely
  different files and converge to identical *bytes* only on the no-modules path
  (that is the whole point of §3.1).

---

# Sprint 4 — `-Os` optimisation unblock  ⚠ test-net DONE; flip TRIED + REVERTED (regressed)

> **Status (2026-06-20).**
>
> **T4.1 + T4.2 DONE and kept** (the valuable, safe part): the byte-identical
> invariant in `run-all.mjs` is re-founded on **two frozen golden hashes**
> (`GOLDEN_STOCK` / `GOLDEN_TEMPLATE`) instead of a cross-file comparison, plus
> an advisory `GOLDEN_STOCK === GOLDEN_TEMPLATE`. Clean improvement regardless of
> `-Os`.
>
> **T4.3/T4.4 flip ATTEMPTED then REVERTED.** Flipping `CFLAGS = -Os` built
> cleanly and even kept the no-modules ROM cross-file-identical (stock == template
> == `1730448e…` under `-Os` — better than the plan predicted), BUT the **Arc A
> render harness caught two real regressions under jsnes**:
> - `render-dialogue-box.mjs` — in the **SCROLL_BUILD** path the dialogue banner
>   **stopped drawing** (tiles read as scenery, not letters). This is exactly the
>   timing-sensitive scroll/vblank-burst hazard the verification gate warned
>   about — a genuine visual bug that would have shipped to pupils.
> - `render-walker-wall-stop.mjs` — walker spawn timing shifted (x 80 → 87).
>
> Reverting `CFLAGS` to empty makes both green again, confirming `-Os` is the
> cause. So **`-Os` is not safe as-is.** Re-enabling it is no longer a "flip +
> FCEUX" task — it needs a **cc65 codegen investigation of the scroll burst**
> first (candidates: `volatile`/compiler barriers on the unrolled `$2007` writes
> in `scroll.c`, a per-file optimisation pragma, or `-O` without the `i`/`r`
> bundle). The golden-hash net + the captured `-Os` hashes (in `run-all.mjs` and
> the Makefile comments) make the next attempt cheap to retry once the codegen
> issue is fixed.
>
> **Lesson:** the render harness paid for itself here — it caught a real `-Os`
> timing regression headlessly, before FCEUX or a pupil ever saw it.

## Goal

Compile the whole playground engine with cc65 optimisation (`-Os`/`-Osir`)
instead of the current empty `CFLAGS`, so every cold path stops paying the
no-optimisation tax that today exists purely to keep a *test artefact* (the
byte-identical invariant) honest.

## The exact mechanism (cited)

The blocker is **not** "regenerate the baseline with `-Os`." It is that the
test compares **two different files** and asserts equal bytes:

- `steps/Step_Playground/Makefile:26` — `CFLAGS =` (empty), with the reason
  spelled out at `Makefile:16–25`: *"cc65 with optimisation enabled makes
  different inline/register decisions for the stock main.c vs the Builder's
  platformer.c template … without -O both compile to literally identical
  bytes; with -O they diverge and the byte-identical-ROM invariant fires."*
- `tools/builder-tests/run-all.mjs:481–501` — the invariant. It reads
  `STEP/src/main.c`, builds, hashes; then `fs.writeFileSync(stockPath,
  fs.readFileSync(TEMPLATE))` (`:488`) swaps the **1473-line** template over the
  **779-line** stock file, rebuilds, and compares sha1 (`:492`).

So under `-Os`, *stock 779-line main.c* and *1473-line template* legitimately
diverge (different functions present, different inlining) even though they are
semantically equal on the no-modules path. The fix is to **change what the
invariant compares** — from *cross-file equality* to *each file vs its own
frozen golden hash*.

The review's two-part recommendation (§3.1 lines 153–162):
1. Make `Step_Playground/src/main.c` *be* the template (one source of truth) →
   "stock vs template" is trivially identical at any `-O`; **or**
2. Re-base the test on **template (no modules) vs a frozen golden SHA1**, stored
   in the test, regenerated deliberately when the template legitimately changes.

**This plan picks (2)** and explicitly rejects (1): the two files are
deliberately different artefacts (`main.c` is the readable 779-line teaching
file pupils open on the Code page in Guided mode; `platformer.c` is the
1473-line slotted engine). Collapsing them would either bloat the teaching file
with `//@ insert:` slots and gated P2/HP/dialogue globals, or strip the engine —
both bad. Keep them separate; pin each to its own golden hash.

## Task breakdown

**T4.1 — Re-found the invariant on frozen golden hashes.** In
`run-all.mjs`, replace the single cross-file check (`:481–501`) with two
independent golden-hash checks:

- `invariant: Step_Playground stock ROM matches golden hash` — build
  `STEP` as-is, assert `sha1(game.nes) === GOLDEN_STOCK`.
- `invariant: template (no modules) ROM matches golden hash` — swap the
  template in (reuse the existing `writeFileSync(stockPath,
  readFileSync(TEMPLATE))` + `make clean`/`make`/`finally`-restore dance at
  `:487–500`), assert `sha1 === GOLDEN_TEMPLATE`.

  Store both constants at the top of the check with a loud comment:
  ```
  // FROZEN GOLDEN HASHES — regenerate DELIBERATELY (see procedure below) only
  // when the engine source legitimately changes. A surprise mismatch here means
  // a code change altered the no-modules ROM — confirm that was intended.
  ```
  Keep the **cross-file** equality as a *third, advisory* assertion **only while
  `CFLAGS` is empty** — i.e. assert `GOLDEN_STOCK === GOLDEN_TEMPLATE` so that,
  until `-Os` flips, the old guarantee ("template adds nothing at no-modules")
  is still mechanically enforced. After T4.3 flips `-Os`, the two goldens will
  differ and this advisory line is dropped.

**T4.2 — Capture the goldens.** With `CFLAGS` still empty, run a tiny helper
(or inline node) that prints `sha1sum` of both builds and paste the two hex
strings into the constants. (Today both equal
`00e156fb69cc390fb2e6669379dad335fae8992c`; that is `GOLDEN_STOCK ==
GOLDEN_TEMPLATE` under no-opt — exactly the current invariant, now frozen.)

**T4.3 — Flip the flag.** `steps/Step_Playground/Makefile:26` → `CFLAGS = -Os`
(start with `-Os`; `-Osir` is the more aggressive `i`/`r`/`s` bundle — try `-Os`
first, it is the safest of the set). Rewrite the `Makefile:16–25` comment to
explain the new contract ("optimised; the byte-identical test is now
golden-hash-based, not cross-file").

**T4.4 — Re-capture goldens under `-Os` and commit them.** Rebuild both,
update `GOLDEN_STOCK`/`GOLDEN_TEMPLATE` to the new optimised hashes, drop the
advisory equality line from T4.1. Document the **regeneration procedure** in a
comment so the next person who legitimately edits the engine knows the drill:
`make -s` both configs, read `sha1sum game.nes`, paste, note why in the commit.

**T4.5 — `USE_AUDIO` interaction.** `Makefile:51` does `CFLAGS += -DUSE_AUDIO=1`
inside `ifeq ($(USE_AUDIO),1)`. `-Os` composes fine with `+=`. No audio golden
is tested by `run-all.mjs` (the byte-identical path is no-audio), but the audio
smoke suite (`tools/builder-tests/audio.mjs`) builds real audio ROMs — it must
stay green, which it will as long as the optimised engine still links.

## Verification gate (what proves it is safe)

1. **Headless:** `node tools/builder-tests/run-all.mjs` green — the two golden
   checks pass and every smoke suite (which builds real ROMs through `/play`)
   still compiles under `-Os`. This catches any `-Os`-induced miscompile that
   breaks the *build*. It does **not** catch timing regressions.
2. **FCEUX / Mesen render-harness (manual — REQUIRED before relying on it):**
   the engine is timing-fragile (the scroll column/row bursts live on the
   ~2273-cycle NTSC vblank budget — see the volatile-macro guard at
   `run-all.mjs:233` and `scroll.c`). `-Os` can change instruction selection in
   the unrolled bursts. Build and eyeball:
   - A **scrolling 2×1** project and a **1×2** project (matches the existing
     `round3-multi-bg.mjs` / `dialogue-scroll.mjs` shapes). In FCEUX confirm
     **no new tearing/flicker at the nametable boundary** vs a no-opt build of
     the same project (A/B the two ROMs). Use FCEUX PPU-Viewer to confirm the
     +32 column stride still lands (that was the 2026-04-25 bug the volatile
     guard exists for).
   - A **dialogue** project: open a box while scrolling — text still renders,
     no extra blanking.
   - An **audio** project (`USE_AUDIO=1`): music still plays in time (the
     `famistudio_update` call site is unchanged; `-Os` shouldn't move it, but
     confirm no tempo regression).
3. **Revert is one line** (`CFLAGS =`) plus restoring the no-opt goldens — keep
   the no-opt hex in a comment so revert is instant.

## Effort / risk / ordering

- **Effort:** Small. ~1 file of test edits + 1 Makefile line + 2 hash captures.
  Build cost is 0.073 s, so iteration is instant. The cost is the *manual FCEUX
  pass*, not the code.
- **Risk:** Low-to-medium. The change itself is contained and one-line
  revertible; the residual risk is a subtle `-Os` timing shift in the scroll
  burst that only shows on the render-harness — which is exactly why the
  manual gate is mandatory and non-negotiable.
- **Ordering:** **First.** It is self-contained, unblocks nothing else
  structurally, but is the cleanest single performance lever and de-risks the
  test net (golden-hash framing) that Sprints 5/7 also lean on.

---

# Sprint 7 — finish the data-driven migration + reconcile the asm path  ⏸ (partly DONE)

> **Status (2026-06-20).** The **safe, additive, headless-verifiable** parts are
> DONE and suite-green: **T7.7** (dead `events` id removed), **T7.6a** (role
> table de-duplicated onto one `ROLE_TABLE` source rendered into both asm + C),
> **T7.6b** (honest asm-scope banner in `build_scene_asminc` output + the asm
> starter), **T7.6c** (asm/C parity guard in `run-all.mjs`), **T7.6d**
> (`asm-play.mjs` smoke test — the asm `/play` path now has coverage). A new
> `tools/builder-tests/_rom-equiv.mjs` standing guard pins the everything-on ROM
> hash (`ce62ec47…`) so any accidental codegen drift is caught.
>
> **The per-frame module migrations (T7.1–T7.5) are DEFERRED pending a design
> decision — see the finding below.**
>
> ### ⚠ Finding: partial per-frame migration is NOT byte-preserving
>
> The plan's "ROM-equality diff (module on, before vs after) should be
> identical" premise does **not** hold for a *partial* migration, because of how
> the per-frame slot is assembled. `appendToSlot` (`builder-assembler.js`)
> accumulates **every** enabled module's per-frame loop at the single
> `//@ insert: per_frame` marker (`platformer.c:1085`), in `MODULE_ORDER`
> (scene → pickups → spawn → damage → doors → dialogue → win_condition). Moving
> *one* module's loop into a `#if`-gated block in the engine (a fixed position)
> while its neighbours stay appended at the marker **reorders** the final
> statement sequence — e.g. migrating `pickups` (currently 2nd, between `scene`
> and `spawn`) moves it to one side of the whole appended run. Independent loops
> so reordering is behaviour-equivalent, but the **emitted C statement order
> changes → cc65 output bytes change → the everything-on ROM hash changes.**
>
> Byte-identical is only achievable if the migrated modules form a **contiguous
> run** at one end of the per-frame order — in practice, migrating **all** the
> per-frame-slot modules together (incl. the hard `scene` T7.5 and
> `win_condition`), which contradicts "one module per change" and is too large to
> land safely without the FCEUX/behavioural review the plan reserves for visual
> changes.
>
> **Recommended path when picking this up (your call):**
> 1. **All-at-once, order-preserving (keeps byte-identical):** migrate every
>    per-frame-slot module in `MODULE_ORDER` in a single change that *replaces*
>    the marker with the in-engine `#if` blocks in the same order. Verify with
>    `_rom-equiv.mjs` (hash must stay `ce62ec47…`). Biggest, but provably
>    behaviour-preserving.
> 2. **Incremental, re-pin per step (accepts byte drift):** migrate one module
>    at a time; after each, re-pin `_rom-equiv.mjs`'s `EXPECT` and rely on the
>    chunk suites + `all-modules.mjs` for behaviour. Loses the "identical ROM"
>    proof; each step needs a behavioural argument (the loop is independent of
>    its neighbours, so reordering is safe) and ideally an FCEUX glance.
> 3. **Leave the per-frame loops string-emitted; only migrate file-scope
>    helpers** (e.g. `bw_sprite_blocked`, T7.5's reusable part) which don't sit
>    in the ordered slot. Smallest; banks the cleanup without the ordering risk.
>
> The remainder of this section (T7.1–T7.5) is the original task detail, valid
> once the approach above is chosen.

Three independent threads, each small, each separately gated. Do them in the
order T7.0 → T7.1 → … (cheapest/safest first). **One module per change**, and
**re-run `all-modules.mjs` after each** (`tools/builder-tests/all-modules.mjs`,
which ticks every module at once — see `all-modules.mjs:1–11`).

## 7.0 Goal & shared mechanism

Push the remaining **string-emitted per-frame C loops** out of
`builder-modules.js` and into `builder-templates/platformer.c` behind
`#if *_ENABLED`, exactly as the **tint** was in Sprint 2 (see the
`[engine] Game-over tint` block at `platformer.c:977–996`, gated
`#if PLAYER_HP_ENABLED` / `#if BW_WIN_ENABLED`) and as **HUD/P2** already are.
After migration each module emits **only** `#define`s + `const` tables; the
compiled engine owns the control flow.

**The slots (mechanism, cited `builder-assembler.js`):** modules transform the
template by `appendToSlot(template, slot, text)` (`:71`) or
`replaceRegion(template, id, body)` (`:35`). The per-frame loops all land in the
`//@ insert: per_frame` slot (`platformer.c:975`); declarations go to
`//@ insert: declarations` (`:166`); one-time setup to `//@ insert: init`
(`:568`). `stripSlotMarkers` (`:86`) removes empty slots last, so a migrated
module that stops appending leaves **no residue** — byte-identical-safe by
construction at no-modules (the `#if *_ENABLED` macro is simply never defined).

**The proven pattern (the recipe for each module):**
1. Move the loop body verbatim into `platformer.c`, wrapped in
   `#if <MODULE>_ENABLED … #endif`, placed at the per_frame point (i.e. where
   `//@ insert: per_frame` is consumed, **before** the game-over tint block so
   detection still precedes the tint — the tint reads `player_dead`/`bw_won`).
2. Replace the module's `appendToSlot(..., 'per_frame', body)` with the
   `#define <MODULE>_ENABLED 1` + any config `#define`s it already emits.
3. Move any `run-all.mjs` regex guard that grepped the deleted string so it now
   asserts the engine owns the logic (mirror what `:375` did for the tint).
4. `node tools/builder-tests/run-all.mjs` — byte-identical goldens unchanged
   (no-modules ROM untouched), `all-modules.mjs` re-compiles, the module's own
   chunk suite stays green.

### Per-module task list (ordered easiest → hardest)

**T7.1 — `pickups`** (`builder-modules.js:535–563`). Pure role loop over
`ROLE_PICKUP` with AABB vs P1 and (under `#if PLAYER2_ENABLED`) P2; sets
`ss_y[i]=0xFF` and `bw_pickup_count++`. No per-instance state, no config except
the implicit role. Also has an **init** emission (`:527–534`, counts
`bw_pickup_total`) — move that into the engine too behind the new flag, or keep
it as the module's only emission. Emit `#define PICKUPS_ENABLED 1` +
`unsigned char bw_pickup_count, bw_pickup_total;` decls. **Caveat (S5
coupling):** `win_condition` reads `bw_pickup_total`/`bw_pickup_count`
(`:1344`); keep those symbols defined whenever pickups is on, and keep
MODULE_ORDER `pickups` before `win_condition` (`builder-assembler.js:130`).
*Easiest — do first to re-prove the recipe end-to-end.*

**T7.2 — `damage`** (`builder-modules.js:634–693`). Two role loops over
`ROLE_ENEMY` (P1 block `#if PLAYER_HP_ENABLED`, P2 block `#if
PLAYER2_HP_ENABLED`) doing AABB + i-frames + `player_dead`. Config:
`DAMAGE_AMOUNT`, `INVINCIBILITY_FRAMES` (already `#define`d at `:631–632`). The
death **tint** is *already* engine-owned (Sprint 2) — the module comment at
`:690–692` even says so. So the migration is: move the two AABB blocks into the
engine behind `#if DAMAGE_ENABLED && PLAYER_HP_ENABLED` / `… && PLAYER2_HP_ENABLED`,
module emits only the two `#define`s + `#define DAMAGE_ENABLED 1`. **Self-contained.**

**T7.3 — `doors`** (`builder-modules.js:802–830`). A `behaviour_at` probe at the
player centre vs `BEHAVIOUR_DOOR`; on match teleports to `spawnX/spawnY` and
(multi-bg) calls `load_background_n(BW_DOOR_TARGET_BG)`. Config: `spawnX`,
`spawnY`, optional `BW_DOOR_TARGET_BG` + `BW_DOORS_MULTIBG_ENABLED` (`:787–790`).
Migration: emit `#define BW_DOOR_SPAWN_X <n>` / `…_Y <n>` (replacing the inlined
literals at `:811–812`,`:822–823`) + `#define BW_DOORS_ENABLED 1`; move the probe
into the engine behind `#if BW_DOORS_ENABLED`, P2 half behind the existing
nested `#if PLAYER2_ENABLED`. The multi-bg `init` emission (`current_bg =`,
`:796–797`) stays a module emission (it depends on `state.selectedBgIdx`).
*Slightly more surface because of the multi-bg `#if` nesting and the existing
`BW_DOORS_MULTIBG_ENABLED` interplay — but still a fixed shape.*

**T7.4 — `dialogue` *trigger*** (`builder-modules.js:1052–1142`, the `perFrame`
block). This is the proximity/B-edge detector that sets `bw_dialog_cmd`/`_open`.
It is highly `#if`-parameterised already (`BW_DIALOG_AUTOCLOSE`, `BW_DIALOG_PAUSE`,
`BW_DIALOG_PER_NPC`, `PLAYER2_ENABLED`). Migration: move the whole `{ … }` block
into the engine behind `#if BW_DIALOGUE_ENABLED`, since every sub-feature is
already a macro the module emits (`:1027–1036`). **Do NOT touch the
`vblank_writes` emission (`:1149–1266`) here** — that is the PPU-write half and
belongs to Sprint 5's frame-model question; leave it emitting for now (it is
correctly routed through `//@ insert: vblank_writes`, `:1429`). *Largest body,
but mechanically the same move; the macros make it a clean lift.*

**T7.5 — `scene` AI** (`builder-modules.js:395–498`). **The hard one — plan it
last and differently.** Unlike the others, this is **not** a role loop: it emits
**per-instance** code with hard-coded sprite indices and per-instance `static`
state — e.g. `static signed char bw_dir_<i> = 1;` and `ss_x[<i>] += 1`
(`:415–422` walker, `:429–438` chaser), one unrolled block per manually-placed
enemy whose AI dropdown is `walker`/`chaser`. The shared probe
`bw_sprite_blocked()` (`:454–494`) is already a clean file-scope helper and
**should move into the engine wholesale** behind `#if BW_SCENE_AI_ENABLED`
(it is guarded by `run-all.mjs:397` — move that guard onto the engine copy).
For the per-instance loops, two honest options:
  - **(a) Data table + engine loop (preferred direction).** Emit a small
    `const` table the module already has the data for — e.g.
    `ss_ai[]` (0=static,1=walker,2=chaser) sized `NUM_STATIC_SPRITES` (the
    server's `build_scene_inc` already emits `ss_role[]`, `ss_x[]` … as parallel
    arrays — add `ss_ai[]` there, *not* in the JS module). Then a single engine
    loop `for(i…){ switch(ss_ai[i]) … }` with a per-sprite direction array
    `bw_dir[i]` in BSS. This kills the index-unrolling entirely and is the true
    data-driven endpoint. **Cost:** touches `playground_server.py`
    `build_scene_inc` (add the `ss_ai` array) **and** the engine — bigger, and
    it changes the no-modules ROM **only if** the array is emitted
    unconditionally (it must be gated/absent when scene-AI is off to keep the
    golden). Verify the golden is unaffected.
  - **(b) Scope-limit (cheaper hedge).** Leave `scene` string-emitting the
    per-instance loops for now, but move *only* `bw_sprite_blocked` into the
    engine (it is the reusable part and the one with a regression guard). Note
    in the module why the per-instance loops stay (per-instance `static` state +
    expressive per-enemy dropdown). This is the "smaller hedge" the review
    flags in §5 for the typed-emitter alternative.
  **Recommendation:** ship **(a)** if Sprint 4+T7.1–T7.4 land cleanly and there
  is appetite; otherwise **(b)** so `scene` stops *spreading* string-codegen
  while staying honest. Either way, **do this module last**.

## 7.6 Reconcile the asm `/play` path (review §S3)

**Goal:** stop `build_scene_asminc` silently rotting behind `build_scene_inc`,
and make the asm path's limits honest.

**Mechanism (cited):** the asm path is reached from the Code page → **Asm**
language button (`code.html:467`) → `state.customMainAsm` (`code.html:873`) →
POST `/play` with `customMainAsm` → `playground_server.py:2068` →
`build_scene_asminc(state, player_idx, scene_sprites, start_x, start_y)`
(`:837`, signature has **no P2 args**) → `_build_asm_in_tempdir` (`:2134`), which
**deletes `main.c`/`scene.inc`** (`:2143`) and builds a self-contained ca65 ROM
via `ASM_MAKEFILE` (`:2101`).

The divergence is real and quantified:
- `build_scene_inc` (`:1086`, signature `…, player_idx2=-1, start_x2, start_y2`)
  emits P2 (`PLAYER2_ENABLED`/tables `:1150–1181`), HUD (`hud_tiles` `:1231–1239`),
  scene animation, per-NPC dialogue tables — **none of which `build_scene_asminc`
  emits** (it stops at player tiles + walk/jump + `ss_*` + role table).
- The **role-code table is duplicated verbatim**: asm `.define ROLE_* …`
  (`:904–914`) vs C `#define ROLE_* …` (`:1107–1117`). Identical values, two
  copies — exactly S3's "duplicated verbatim."

**Crucial framing:** the Builder modules emit **C** and POST `customMainC`; they
**never** touch the asm path. So the asm path is *already* a "pupil writes raw
6502, no Builder modules" mode — it just isn't *labelled* as one, and its scene
emitter pretends to be a peer of the C one. The review (§S3, §6 item 6) gives
two options; this plan recommends **scope-the-asm-path-honest + parity guard**,
not "generate both from one source" (the latter is a large build for a
second-class path that, by design, can't carry Builder modules anyway).

**Tasks:**

**T7.6a — De-duplicate the role table.** Lift the 11 role codes to one Python
constant (e.g. `ROLE_CODES = [("PLAYER",0), …]`) and have both emitters render
it (`.define {n} {v}` vs `#define {n} {v}`). Kills the verbatim dup; a single
edit can't desync them.

**T7.6b — Label the asm path's scope honestly.** Add a header banner to
`build_scene_asminc`'s output (and a one-liner in the Asm starter
`steps/Step_Playground/src/main.s.starter`) stating: *"asm `/play` is the raw
6502 path — single player, no Builder modules (HUD/P2/dialogue/win are C-only).
Use the C language mode for those."* This converts a silent gap into a
documented contract.

**T7.6c — Add a parity guard** (`run-all.mjs`, a cheap regex assertion in the
Step-2 block). Assert the two emitters agree on the **shared contract** they
both must keep: same role codes (post-T7.6a, grep both for the 11 names + the
`ROLE_*` count) and same player-symbol names (`player_tiles`, `player_attrs`,
`NUM_STATIC_SPRITES`, `ss_x/ss_y/ss_w/ss_h/ss_role/ss_offset/ss_tiles/ss_attrs/
ss_flying`). The guard's job is **not** to force feature parity (the asm path is
deliberately a subset) — it is to fail loudly if the *shared* identifiers drift,
so a future `ss_*` rename in the C emitter can't silently break the asm path's
pedagogy ("the names carry across", `:842`).

**T7.6d — Asm smoke coverage (optional but recommended).** There is no
`run-all.mjs` suite that actually builds an asm `/play` ROM today (the byte-
identical test and chunk suites are all C). Add a tiny `asm-play.mjs` that POSTs
the Asm starter as `customMainAsm` and asserts `r.ok` — so the asm path can't
silently stop compiling. (Effort: clone the shape of `dialogue-scroll.mjs`,
swap `customMainC` → `customMainAsm`.)

## 7.7 Retire the dead `events` id (review §S5)

**Verified dead:** `'events'` appears **only** in `MODULE_ORDER`
(`builder-assembler.js:131`) — there is **no** `modules['events']` catalogue
entry in `builder-modules.js`, no `events` in `builder-validators.js`, and
`builder.html` references to "events" are all DOM `addEventListener` noise. The
assembler loop at `:141–143` does `const node = modules[id]; if (!node …)
continue;` so it is silently skipped every build.

**Task:** delete the `'events',` token from the `MODULE_ORDER` array
(`builder-assembler.js:131`). Zero behaviour change (it was a no-op), so the
byte-identical golden and every suite stay green. *Trivial; bundle it with
T7.1.*

## Verification gate (Sprint 7)

- **Per module:** `node tools/builder-tests/run-all.mjs` after **each** of
  T7.1–T7.5 — the **byte-identical goldens stay unchanged** (proof the
  migration is gated, no-modules ROM untouched), `all-modules.mjs` re-compiles
  the everything-on permutation, and the module's own chunk suite stays green
  (`chunk-a-hp-hud.mjs` for damage/HUD, `chunk-c-doors.mjs` for doors,
  `round2-dialogue.mjs`/`dialogue-scroll.mjs` for dialogue, the scene guards at
  `run-all.mjs:397`).
- **Equivalence check (per module):** because the loop body is *moved
  verbatim* behind a flag, build one project with the module **on** before and
  after the migration and diff the two `/play` ROM sha1s — they should be
  **identical** (the engine-gated path produces the same machine code as the
  string-emitted path did). This is the strongest possible proof a migration is
  behaviour-preserving, and it is cheap (two `/play` builds). If they differ,
  the move changed something (declaration order, a stray macro) — investigate
  before moving on.
- **Asm path:** T7.6c parity guard green; T7.6d asm smoke (if added) builds.
- **No FCEUX needed** for the migrations (verbatim moves + ROM-equality diff
  cover it) — this is why Sprint 7 is lower-risk than Sprint 5 despite touching
  the engine.

## Effort / risk / ordering

- **Effort:** Medium, but **incremental** — each of T7.1–T7.4 is an afternoon
  (verbatim lift + flag + guard-move + ROM-equality diff). T7.5 (a) is the only
  larger one (server + engine); T7.5 (b) is small. T7.6 is small. T7.7 is
  one line.
- **Risk:** Low per step thanks to the ROM-equality diff. The only real risk is
  the **cross-module symbol coupling** (S5): `win_condition` reads pickups'
  counters; the dialogue `vblank_writes` half stays string-emitted for now;
  MODULE_ORDER position is load-bearing. The per-step `all-modules.mjs` re-run
  is the net for that.
- **Ordering:** **Second** (after Sprint 4). T7.7 + T7.6a are free riders. Do
  T7.1→T7.4 to drain the easy AABB/probe loops, then decide on T7.5 (a vs b).

---

# Sprint 5 — NMI-driven frame model + dialogue vblank routing  ⏸ (architectural)

## Goal

Move the playground engine from a **main-loop PPU-write** model to the
**NMI-driven** model NES best practice (and this repo's own hand-written base)
already use: OAM DMA + a bounded VRAM-update queue flushed *inside the vblank
NMI*, with all VRAM writes (dialogue included) routed through that queue and
capped to a per-frame byte budget. **Frame this design-first with experiments —
it is the biggest and riskiest sprint and must not be applied blind.**

## The current model (cited) — and what is actually broken vs already fine

**The shipped playground loop does PPU work in the *main loop body*, not the
NMI.** In both `steps/Step_Playground/src/main.c` and
`builder-templates/platformer.c`:
- `waitvsync()` (`main.c:707`, `platformer.c:1406`) busy-waits for the NMI flag,
  then the **main loop** does `OAM_ADDR=0; OAM_DMA=0x02` (`main.c:727–728`,
  `platformer.c:1426–1427`) and, under `SCROLL_BUILD`, the scroll burst with
  `PPU_MASK=0` force-blank around it (`platformer.c:1417`/`:1448`).
- The **default crt0 is cc65's stock nes.lib crt0**, *not* `src/reset.s`.
  `Step_Playground`'s `ASM_SRC` is just `graphics.s` (`Makefile:41`); `reset.s`
  lives under the *separate* hand-written Zelda-2 base (`src/reset.s`) and is
  **not built** by the playground. So today's playground NMI is cc65's internal
  handler (does `ppubuf_flush` + scroll reset), and OAM DMA happens in the main
  loop after `waitvsync`. **This is precisely the review's N1 finding: "the good
  model exists (`src/reset.s`) but the pipeline doesn't use it."**

**`src/reset.s` is the reference correct model** (the one to port the *shape*
of, not the file itself): its NMI (`reset.s:76–121`) gates on `_nmi_ready`
(`:87`), does OAM DMA **inside the NMI** (`:94–97`), resets scroll, clears the
flag. `waitvsync` (`:202–210`) waits on `nmi_done`.

**The dialogue "flash" — important nuance, two different code paths:**
- The **standalone `draw_text`/`clear_text_row`** functions (`main.c:227–274`,
  `platformer.c:347–393`) do their *own* `waitvsync()` + `PPU_MASK=0` force-blank
  + unbounded `while(text[j])` PPU writes (`main.c:237–240`). This is the
  unbudgeted N2 hazard. **But:** these functions are **dead in the runtime** —
  verified, nothing calls them. The only references are the Code-page
  autocomplete catalogue (`code.html:813–814`). They exist as *snippet
  primitives* a pupil could paste on the Advanced Code page.
- The **Builder dialogue module does NOT use them.** It already routes its PPU
  writes through `//@ insert: vblank_writes` (`builder-modules.js:1266`), which
  the template consumes **inside** the vblank window, after OAM DMA
  (`platformer.c:1429`). `round2-dialogue.mjs:91–101` already **guards** that
  dialogue must not regress to the `draw_text` pattern. So the Builder dialogue
  path is *already* single-window — its remaining issue is that the in-vblank
  write loop is **bounded only by a comment** ("Worst case 3 × 28 = 84 PPU
  writes ~840 cycles", `builder-modules.js:1182–1183`), not by an enforced
  runtime byte budget.

**Net:** Sprint 5 is really three separable pieces, of increasing risk:
1. **Budget the dialogue vblank writes** (the Builder path is already in-window;
   just enforce the per-frame byte cap). *Lowest risk, real safety win.*
2. **Make the snippet `draw_text`/`clear_text_row` safe** (or route them through
   the queue) so the Code-page primitive can't blow the budget. *Medium.*
3. **Move OAM DMA + a VRAM-update queue into the crt0 NMI.** *Highest risk —
   this is the architecture change.*

## A precedent that de-risks piece 3 (found while investigating)

cc65's nes.lib **already provides a VRAM ring buffer flushed in the NMI** —
`ppubuf_flush`, fed by a `ringbuff` at $0300–$05FF with `ringread`/`ringwrite`/
`ringcount` cursors. The vendored audio crt0 imports and calls it
(`famistudio_crt0.s:38` `.import ppubuf_flush`; `:181` `jsr ppubuf_flush` inside
the NMI; ring init at `:93–104`). **So "a bounded VRAM-update queue flushed in
the NMI" is not a from-scratch build — the infrastructure is linked into every
ROM.** The playground engine simply *bypasses* it by poking `$2006/$2007`
directly. Two design directions fall out:
- **(D1) Use the existing cc65 conio queue.** Write dialogue rows via the cc65
  conio primitives that enqueue into `ringbuff` (the same buffer `ppubuf_flush`
  drains in NMI). Pro: zero new asm, the flush is already correct + budget-aware
  (cc65 sizes it). Con: couples the engine to cc65 conio semantics; need to
  verify the queue depth suffices for a 28-wide row and that conio's cursor
  model doesn't fight the engine's explicit addressing.
- **(D2) Hand-roll a small fixed queue + custom crt0.** A custom playground crt0
  (modelled on `famistudio_crt0.s`'s structure: own `VECTORS`, own NMI) that
  does OAM DMA + drains a tiny purpose-built queue (e.g. up to N (addr,len,bytes)
  spans, ≤120 bytes/frame). Pro: full control, honest budget. Con: a new crt0 on
  the boot path (the riskiest possible change) — and it would have to be `#if`-
  gated or it breaks the byte-identical golden (a new crt0 changes the ROM).
  This mirrors exactly the constraint that kept the audio crt0 behind
  `USE_AUDIO` (`Makefile:113–124`, `famistudio_crt0.s:28–30`).

**The famistudio crt0 also documents the trap to avoid** (`famistudio_crt0.s:141–165`,
`main.c:748–763`): a *failed* attempt to run `famistudio_update` inside the NMI
overran the ~2273-cycle vblank budget (engine tick 1500–5000 cyc + OAM DMA 513 +
scroll burst ~250) and corrupted frames. **Lesson for piece 3:** whatever goes
in the NMI must fit the budget — OAM DMA (513) + a *capped* VRAM drain (≤~160
bytes ≈ ~1600 cyc with overhead) is the ceiling. This is why the queue must be
*bounded* and dialogue *capped to one row/frame*.

## Task breakdown (design-first, with experiments)

**T5.1 — Design doc + budget model (no code).** Write `docs/plans/current/
<date>-nmi-frame-model.md`. Pin the NTSC vblank budget (~2273 cyc), subtract OAM
DMA (513), and derive the per-frame VRAM byte ceiling (the review says ≤~160
bytes to `$2007`; for dialogue, **one row of ≤28 tiles** + the `PPU_ADDR`
setup). Decide **D1 (reuse cc65 ppubuf) vs D2 (custom crt0)** — recommend
**starting with D1** because it adds no boot-path asm and the queue+flush
already exist and are proven (the audio path uses them). Define the queue API
the engine will call (enqueue-span) regardless of D1/D2 so the call sites don't
care which backend wins.

**T5.2 (piece 1, lowest risk — do first) — Budget the Builder dialogue vblank
writes.** The Builder path is already in-window (`vblank_writes`). Add an
**enforced** per-frame cap: draw/restore **at most one row per frame** (queue
the rest), or cap total `PPU_DATA` writes to the byte budget and continue next
frame. Concretely, replace the unbounded `for(dlg_r…)`/`for(dlg_j…)` double loop
(`builder-modules.js:1200–1262`) with a state-machine that advances ≤1 row/frame
when the box has 2–3 rows. Today's worst case (3×28=84 writes) *probably* fits,
but "probably" is the N2 bug — make it provably bounded. **Verification:** the
existing `round2-dialogue.mjs` (multi-row) + `dialogue-scroll.mjs` must stay
green; add an assertion that no single frame emits more than the budget
(static analysis of the emitted loop bound). **This delivers the safety win
without touching the boot path.**

**T5.3 (piece 2) — Make the snippet `draw_text`/`clear_text_row` safe.** Two
options: (a) route them through the same queue API from T5.1 (so a Code-page
pupil pasting `draw_text` gets a budgeted, in-NMI-flushed write — the "right"
fix), or (b) at minimum, bound the `while(text[j])` loop to the byte budget and
keep the force-blank, documenting the cap. These functions are pupil-facing
primitives (`code.html:813`), so (a) is the better teaching outcome but depends
on T5.4. **Verification:** a Code-page snippet that draws a long string while
scrolling — picture must not blank; FCEUX eyeball.

**T5.4 (piece 3, highest risk — gate it) — OAM DMA + VRAM queue in the NMI.**
Move `OAM_ADDR=0; OAM_DMA=0x02` out of the main loop (`platformer.c:1426–1427`,
`main.c:727–728`) and into the NMI, plus drain the VRAM queue there. Under
**D1**, this is mostly "stop poking `$2007` directly; enqueue into ppubuf; let
the stock crt0's `ppubuf_flush` NMI do the work" — but the stock crt0 NMI does
*not* do OAM DMA, so OAM DMA still needs a home: either keep it in the main loop
right after `waitvsync` (smallest change — OAM DMA in main loop is fine *as long
as it's the first thing post-vblank*, which it already is) **or** move to D2
custom crt0. **Recommend:** keep OAM DMA where it is (it is not the bug), and use
the NMI only for the *VRAM queue drain* via ppubuf. That sidesteps a new crt0
entirely and keeps the byte-identical golden intact (no boot-path change). Only
escalate to D2 if measurement shows the main-loop OAM-DMA timing is the
remaining hazard. **Any new/custom crt0 MUST be `#if`-gated** (like
`USE_AUDIO`'s) or the no-modules golden breaks — this is the hard constraint.

**T5.5 — Reconcile with audio.** `famistudio_update` runs at end-of-vblank in
the **main loop** on purpose (`main.c:748–763`) because it is too heavy for NMI.
The VRAM-queue-in-NMI change must **not** add the dialogue drain on top of an
audio NMI tick (there is no audio NMI tick — that attempt failed and was
reverted). Confirm the queue drain alone (≤~160 bytes) + OAM DMA fits, with
audio still ticking in the main loop. Re-run `audio.mjs`.

## Verification gate (Sprint 5)

1. **Headless:** `run-all.mjs` green — byte-identical golden **unchanged**
   (proof: any NMI/crt0 change is `#if`-gated and the no-modules ROM is
   untouched), `round2-dialogue.mjs`/`dialogue-scroll.mjs`/`all-modules.mjs`/
   `audio.mjs` all compile. Add a static-bound assertion for the dialogue
   per-frame byte cap (T5.2).
2. **FCEUX / Mesen render-harness (REQUIRED, this is a visual/timing change):**
   - **The headline test:** open a **long (2–3 row) dialogue box while the world
     is scrolling** (`dialogue-scroll.mjs` shape, run interactively) — **the
     picture must not blank/tear for even one frame** (this is the exact B-2
     "dialogue glitches the stage for a split second" bug). A/B against the
     current ROM to confirm the flash is gone.
   - Heavy scene (many sprites + HUD + scene row) — confirm OAM DMA timing is
     unchanged (no new sprite drop-out / flicker), since T5.4 touches the OAM
     path's neighbourhood.
   - Audio project — music still in time (T5.5).
   - Use FCEUX's frame-advance + PPU-Viewer to confirm VRAM writes land in
     vblank and the scroll pointer is clean at the top of frame.
3. **Mesen** as a second opinion (more accurate PPU/timing than jsnes/FCEUX) for
   the boundary cases if D2 (custom crt0) is taken.

## Effort / risk / ordering

- **Effort:** Large, but **decomposable**: T5.2 (budget Builder dialogue) is the
  cheap, high-value first slice and ships independently of the boot-path work.
  T5.4 is the multi-day piece.
- **Risk:** **Highest of the three sprints.** T5.4 sits on the boot/NMI/vblank
  path where a budget overrun corrupts visible frames (the famistudio NMI
  attempt is the cautionary tale, `famistudio_crt0.s:141–165`). Mitigations:
  prefer **D1** (reuse the already-linked `ppubuf` queue, no new crt0); keep OAM
  DMA in the main loop; `#if`-gate any crt0 change; cap the queue drain hard;
  ship T5.2 first to bank the dialogue-budget win even if T5.4 is deferred again.
- **Ordering:** **Third / last.** Do Sprint 4 and Sprint 7 first (they de-risk
  the test net and clear the codegen). Within Sprint 5, do **T5.1 (design) →
  T5.2 (budget Builder dialogue, ship it) → T5.3 → T5.4 (gated) → T5.5**.

---

## Cross-sprint summary

| Sprint | Nature | Touches | Headless-provable? | FCEUX needed? | Risk | Order |
|---|---|---|---|---|---|---|
| 4 `-Os` | Contained quick win | `Makefile:26`, `run-all.mjs:481` | Build yes, timing no | **Yes** (scroll/audio/dialogue A/B) | Low–Med | 1st |
| 7 migration + asm | Incremental, 1 module/change | `builder-modules.js`, `platformer.c`, `playground_server.py`, `builder-assembler.js:131` | **Yes** (golden unchanged + ROM-equality diff) | No | Low/step | 2nd |
| 5 NMI frame model | Architectural, design-first | `platformer.c` vblank/NMI, `main.c`, maybe a gated crt0, `builder-modules.js:1200` | Partly (golden + compile) | **Yes** (dialogue-while-scrolling) | **High** | 3rd |

**Invariants that gate all of it:** the byte-identical goldens
(`run-all.mjs:481`, golden-hash form after Sprint 4) must stay green —
**unchanged** for Sprints 5/7 (everything they add is `#if`-gated and absent at
no-modules), **deliberately re-frozen** for Sprint 4 (the `-Os` flip). Every
emitted-string deletion must **move** its `run-all.mjs` regex guard, never just
drop it (the tint at `:375` is the worked example). `all-modules.mjs` re-runs
after each Sprint-7 module. Anything visual/timing (Sprint 4's `-Os`, all of
Sprint 5) carries a mandatory FCEUX/Mesen pass — those are the parts a headless
jsnes suite cannot see.
