# Fix plan — bug report 2026-06-20

Companion to [`../../bug-report-2026-06-20.md`](../../bug-report-2026-06-20.md).
Turns the eight confirmed defects (BR-01 … BR-08) into sequenced, actionable
tasks and slots them into the
[next-phase master plan](2026-06-18-next-phase-master-plan.md).

These are correctness / data-loss / unsafe-memory defects on current `main`
(`7a7c707`), so they take priority over new feature arcs. They run as a new
**Wave 0.5 — bug-fix sweep**, after landing the uncommitted work (Wave 0) and
before / overlapping Arc A.

## Guiding rules carried over
- The **byte-identical-ROM invariant** still holds: engine changes (BR-03,
  BR-08) are `#if`/`#ifndef`-gated so a no-modules ROM equals the
  `Step_Playground` baseline. A two-8x8-player or checkpoint-restore project is
  *not* the baseline, so these guards only affect already-divergent ROMs.
- **One concern per change, suite green at each step** — `run-all.mjs` (incl.
  byte-identical + render suites) stays green throughout.
- Each fix lands with a regression test where a harness can see it; pure
  browser-UI fixes are syntax-checked + code-reviewed with a manual note.

## Status — all fixed 2026-06-20

| ID | Sev | Area | Status | Regression test |
| -- | --- | ---- | ------ | --------------- |
| BR-02 | High | Persistence — debounced saves lose edits | ✅ fixed | `flush-save.mjs` |
| BR-01 | High | New Top-down project assembled as Platformer | ✅ fixed | `topdown-new-project.mjs` |
| BR-03 | High | Large 2-player sprites overflow OAM shadow | ✅ fixed | `player-oam-budget.mjs` |
| BR-04 | Med | Invalid spawn-effect index → late cc65 failure | ✅ fixed | `spawn-effect-refs.mjs` |
| BR-05 | Med | Trigger & damage effects silently share one pool | ✅ fixed (model B) | `spawn-effect-refs.mjs`, `spawn.mjs` |
| BR-06 | Med | Player 2 uncontrollable in Sprites preview | ✅ fixed | `emulator-p2-keys.mjs` |
| BR-07 | Low | Builder/Code rename only half a project | ✅ fixed | `rename-project.mjs` |
| BR-08 | Low | Checkpoint respawn HP can exceed Max HP | ✅ fixed | `respawn-hp.mjs` |

All file paths are under `tools/` (`tools/tile_editor_web/` for the editor pages
and modules, `tools/playground_server.py` for the server; tests in
`tools/builder-tests/`).  Full `node tools/builder-tests/run-all.mjs` (incl. the
byte-identical-ROM invariant, all ROM builds, and the six new suites above) is
green.  This environment ran the server-backed render tests successfully — the
report's `EPERM` sandbox limitation did not apply here.

**BR-05 is fully fixed via model B** (the user chose independent effects). The
trigger effect and the damage hit effect are now genuinely independent in the
engine — each owns its art and lifetime (kind 0 / kind 1) — so neither overrides
the other. The earlier interim conflict warning was removed (there is no
conflict to warn about any more). All eight bugs are complete fixes.

## Recommended order (from the report)

1. **BR-02** — silent data loss (most damaging, touches pupil work directly).
2. **BR-01** — a primary advertised workflow (Top-down) generates the wrong game.
3. **BR-03** — out-of-bounds OAM writes.
4. **BR-04 + BR-05 together** — one shared spawn-effect data-model decision.
5. **BR-06**.
6. **BR-07 + BR-08**.

---

## BR-02 — Add a synchronous save flush to Code / Builder / Behaviour

**Chosen solution:** report option 1–4 (the full set).

1. Add one `flushSave()` per page. On **Code** it must first copy the current
   CodeMirror value (`cm.getValue()`) into the correct language field of `state`
   *before* persisting — today that copy only happens on the 400 ms debounce.
2. Call `flushSave()` at every exit point: project switch, duplicate, recovery,
   import, and navigation to another editor page. On Builder/Behaviour this
   replaces the 150 ms debounce window at those exits.
3. Register `flushSave()` on `pagehide` (and `beforeunload` as a fallback).
4. Mirror the synchronous-save pattern Backgrounds and Sprites already implement
   (use them as the reference).

**Test:** fake-timer browser/unit test — edit, then immediately project-switch
within the debounce window, assert the edit survives. Add to the builder-tests
suite.

**Why first:** highest blast radius and the only defect that destroys
pupil-authored content.

---

## BR-01 — Make the Builder game type canonical for new Top-down projects

**Chosen solution:** report options 1 + 2 (+ 4 for the test); option 3 (retire
`template`/`movement`) is a follow-up tidy, not required to fix the bug.

1. Treat `builder.modules.game.config.type` as the single source of truth (the
   assembler already reads only this via `builder-modules.js`).
2. Set it in **both** new-project handlers (`index.html`, `sprites.html`):
   selecting Top-down must seed `config.type` to the four-way/no-gravity style,
   not leave the `platformer` default from `createDefaultState()`.
3. In `migrateBuilderFields()`, initialise the Builder game type from
   `state.template` before falling back to `platformer`, so legacy Top-down
   states migrate correctly instead of into the platformer state.
4. **Test:** construct state through each *real* new-project path (not a
   hand-built Builder state) and assert an anchored `#define BW_GAME_STYLE 1`
   appears in the assembled Top-down output, and is absent for Platformer.

**Note for Arc E:** Arc E adds more game styles; this fix makes
`config.type` the canonical style field they extend, so do BR-01 first.

---

## BR-03 — Guard player OAM writes and validate combined player cell budget

**Chosen solution:** report options 1 + 2 + 3 (option 4 — a lower player-size cap
— is an optional UX hardening to confirm with the user).

1. In [`builder-templates/platformer.c`](../../../tools/tile_editor_web/builder-templates/platformer.c),
   guard **every** four-byte player write with `oam_idx <= 252` — Player 1 and
   *both* Player 2 rendering branches (the later spawn/HUD/scene writers already
   do this).
2. Stop the **outer** loops once the buffer is full, not just `break` the inner
   loop, so a full buffer halts cleanly.
3. Add a Builder validator in `builder-validators.js`:
   - **Blocking** when Player 1 + Player 2 cells alone exceed 64 (the hardware
     sprite count) — two 8x8 players = 128 entries = 512 bytes vs the 256-byte
     `oam_buf`.
   - **Warning** based on the full player + HUD + scene + effect OAM budget.
4. (Optional, confirm) cap player dimensions below the 8x8 general-art maximum.

**Test:** render test (Arc A harness) — two players that fit render both;
an over-budget config is blocked by the validator before generation. Confirms
no write past `oam_buf[255]`.

**Cross-link:** this is the OAM-budget concern that Arc D's codegen migration
(Sprint 7) should preserve when player rendering moves into the engine.

---

## BR-04 + BR-05 — Spawn-effect data model (do together)

These share one decision: **are the trigger-tile Spawn effect and the Damage
"show an effect sprite" one shared effect, or two independent ones?** Both bugs
stem from the current "two UIs, one `bw_spawn()` pool / one art table / one
`SPAWN_TTL`" reality.

> **Open decision for the user — settle before coding:**
> - **(A) One shared effect** (simplest, matches the engine today): expose a
>   single Effect configuration (art + lifetime) that both the trigger tile and
>   Damage reference. Removes the conflict by construction. *Recommended* unless
>   pupils need distinct trigger vs damage visuals.
> - **(B) Two independent effects**: give each pool entry its own art/type field
>   and use distinct TTLs at runtime — more engine work, real per-source art.

### BR-04 — reject invalid spawn-effect sprite indices in Builder
**Chosen solution:** report options 1 + 2 (+ 3 as defence in depth).

1. Replace both free numeric 0–31 fields with **sprite dropdowns** populated from
   the live sprite list; store a stable sprite ID so deletion/reordering stays
   safe.
2. Add **blocking** validators in `builder-validators.js` for both the trigger
   Spawn-effect reference and the Damage effect-sprite reference.
3. Make `playground_server.py` generation **fail early** with an input-stage
   message naming the missing sprite, instead of emitting C that defines
   `BW_SPAWN_ENABLED` but omits `SPAWN_W/H/TILES/ATTRS`.

### BR-05 — stop the two features silently overriding each other

**Decision: model B (independent effects)** — chosen by the user. The trigger
tile effect and the damage hit effect are now two genuinely separate effects,
each with its own art and lifetime. The UI already had independent fields
(`spawn.config.{spriteIdx,ttl}` vs `damage.config.{spawnSpriteIdx,spawnTtl}`);
the bug was the engine/server collapsing them into one. Model B wires them
through end to end, so **no new UI was needed**.

**Shipped:**

- **Engine** (`builder-templates/platformer.c`): the spawn pool gained a
  per-slot `spawn_kind` (0 = trigger, 1 = hit), two lifetimes (`SPAWN_TTL_0` /
  `SPAWN_TTL_1`) and two art tables (`SPAWN0_*` / `SPAWN1_*`).
  `bw_spawn(x, y, kind)` stamps the slot's kind + TTL; the render branch picks
  that kind's art via `#if BW_SPAWN0_ENABLED` / `#if BW_SPAWN1_ENABLED`. All
  inside `#if BW_SPAWN_ENABLED` (= `BW_SPAWN0_ENABLED || BW_SPAWN1_ENABLED`), so
  the no-module ROM is still byte-identical.
- **Modules** (`builder-modules.js`): the spawn module emits
  `BW_SPAWN0_ENABLED` + `SPAWN_TTL_0` + `bw_spawn(px, py, 0)`; the damage module
  emits `BW_SPAWN1_ENABLED` + `SPAWN_TTL_1` + `bw_spawn(px, py, 1)`.
- **Server** (`playground_server.py`): `_spawn_trigger_index()` /
  `_spawn_hit_index()` resolve the two sources independently;
  `_spawn_art_lines()` emits `SPAWN0_*` and/or `SPAWN1_*`; the build path
  validates each source separately and fails early naming the bad one.
- **Validators**: the interim `spawnEffectConflict` warning was **removed** —
  there is no conflict any more. The BR-04 invalid-index validators stay.

**Cross-link to Arc C:** R-3 (spawn pool) / R-6 (hurt sprite) build on this same
`bw_spawn()` subsystem. The kind-based pool is the foundation those build on; if
a third effect source ever appears, add a kind 2 the same way.

---

## BR-06 — Player 2 controllable in the Sprites-page preview

**Chosen solution:** report option 1 (preferred) — replace the private Sprites
emulator with the shared `NesEmulator.open()`, which already implements the full
two-controller mapping. Option 2 (port the `{pad, button}` map into the private
emulator) is the fallback if replacing it is too invasive.

1. Switch the Sprites-page Playground to `NesEmulator.open()` from
   [`emulator.js`](../../../tools/tile_editor_web/emulator.js); drop the private
   `EMU_KEY_MAP` / hard-coded controller-1 `onEmuKey()`.
2. Show P2 controls only when P2 is enabled.
3. **Test:** a cross-page emulator key-map regression test asserting every page's
   launcher exposes the same two-controller map.

**Cross-link:** the June 15 sweep fixed the *Code* page's P2 controls (issue #3)
the same way; this brings Sprites into line. After this, consider whether any
other page still has a private emulator.

---

## BR-07 — Centralise project rename (Builder + Code)

**Chosen solution:** report option 2 (preferred) — a single atomic storage method
— with option 1 as the minimal patch.

1. Minimal: call `Storage.renameProject()` from the Builder and Code name
   handlers (Backgrounds/Sprites/Behaviour already do).
2. Preferred: centralise rename in one `Storage` method that updates both
   `state.name` and the v2 catalog atomically, so no page can update only one
   half again. `Storage.saveCurrent()` currently bumps the catalog modified-time
   but not its name.

**Test:** rename via Builder/Code, then assert the catalog list, duplicate name,
and delete-confirmation all show the new name.

---

## BR-08 — Clamp checkpoint respawn HP to Max HP

**Chosen solution:** report options 1 + 2 (defence in both the generated code and
the Builder UI).

1. In generated C, clamp: respawn assigns
   `player_hp = (BW_RESPAWN_HP < PLAYER_MAX_HP) ? BW_RESPAWN_HP : PLAYER_MAX_HP`
   (expressed without relying on a non-existent `min` macro).
2. Dynamically cap the Builder "HP restored on respawn" input at Player 1 Max HP,
   and add a cross-field validator for imported/stale states.

**Test:** Max HP 1 + respawn HP 9 → generated respawn assigns 1; validator flags
the stale config. Confirm the HUD draws no more than Max HP hearts.

---

## Verification

Per fix, run the relevant standalone test plus the full suite:
- `node tools/builder-tests/run-all.mjs` (incl. byte-identical-ROM invariant and
  Arc A render suites) green after each change.
- Targeted state/emitter checks for BR-01, BR-04, BR-05 (the report used these).
- `make clean all` at root + the six `steps/*` build dirs still build.

**Sandbox caveat (from the report):** `run-all.mjs`'s localhost-server and
child-shell parts fail with `EPERM` under the managed sandbox; the server-backed
render tests must be rerun **outside** the sandbox before these fixes merge. Pure
syntax/unit parts run anywhere.

Browser-UI-only fixes (parts of BR-02, BR-04, BR-06, BR-07, BR-08 UI) have no
headless harness — syntax-check + code-review, then a manual browser pass:
- BR-02: edit then immediately switch project; edit survives.
- BR-06: drive P2 from the Sprites preview.
- BR-07: rename in Builder/Code; catalog updates.
- BR-08: Max HP 1, respawn 9; respawn with 1 HP and 1 heart.

## Suggested first three steps
1. **BR-02** — flush-on-exit across Code/Builder/Behaviour (stop the bleeding).
2. **BR-01** — make `builder.modules.game.config.type` canonical in both
   new-project handlers + migration.
3. Settle the **BR-04/BR-05 shared-vs-independent effect** decision with the user,
   then implement BR-03 (OAM guard) in parallel since it's independent.
