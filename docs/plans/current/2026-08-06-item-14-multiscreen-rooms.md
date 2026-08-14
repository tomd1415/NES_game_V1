# #14 — per-room scene instances for multi-screen rooms

**Status:** planned, not started. Written 2026-08-06 in an unattended session.
**Engine impact:** yes — this ships as **v79** and needs the full versioning
ritual (bump both constants, changelog entry, commit, snapshot).

This refines the "remaining slice" line in
[`STATUS.md`](../../STATUS.md) — *"#14 Multi-screen rooms still fall back to the
shared scene (v75 is v1)"* — into steps that can each be checked independently.
Nothing here has been implemented.

---

## What is already true (v75, verified 2026-08-06)

Per-room scene instances work, but only for **single-screen rooms**.

- `_scene_is_perroom()` (`tools/playground_server.py`) decides whether to emit
  per-room data at all. It returns **False** — falling back to the shared,
  every-entity-always-present scene — when either:
  1. every entity is in room 0 (nothing to do), **or**
  2. **any** entity has `x > 255` or `y > 255`.
- When it returns True the server emits `BW_SCENE_PERROOM`, plus `ss_room[]`,
  `ss_home_x[]`, `ss_home_y[]` into `scene.inc`.
- `scene_set_active_bg(n)` (`builder-templates/platformer.c`) restores room `n`'s
  entities to their home position and parks every other entity with
  `ss_y[k] = 0xFF`.

## Why condition (2) exists — the actual blocker

Parking does not have its own flag. It **reuses the engine's existing "not
alive" sentinel**: the AI bodies and the draw loop skip any entity failing
`ss_y < 0xEF`. That is an 8-bit assumption, and it is load-bearing in ~5 places.

A wide or tall project promotes `ss_x[]`/`ss_y[]` to 16-bit (`wide_pos` in
`playground_server.py`, set when any coordinate exceeds 255). Two things then go
wrong, and they are worth separating because only the second is fatal:

- **Wide but one screen tall** (`x > 255`, `y ≤ 238` — see the Step 1 measurement;
  239 is already parked): parking at `ss_y = 0xFF`
  still reads as "not alive", so this case may in fact already be safe. The
  current guard rejects it anyway, because it tests `x` as well as `y`.
- **Two screens tall** (`y` up to 479): a *legitimately placed* entity can have
  `ss_y > 0xEF` and is then silently treated as parked/defeated — it never draws
  and never collides. This is the case that genuinely cannot work without
  replacing the sentinel.

> **This distinction is a hypothesis from reading the code, not a measured
> result.** Step 1 exists to settle it, because if it holds, the cheap fix in
> Step 2 delivers most of the value for a fraction of the risk.

## Guardrails that apply to every step

- **Golden ROMs stay byte-identical.** Everything new must be behind
  `BW_SCENE_PERROOM` (already off unless multi-room) so the preprocessor and
  cc65 strip it. `_rom-equiv.mjs` is the check.
- **Test the emitted C *and* the ROM behaviour**, not one or the other.
- No `PPU`-timing work here, so the vblank budget is not in play.

---

## Step 1 — Settle whether "wide but short" already works

*No production change. This is a measurement.*

*Done 2026-08-13 — the result and its corrections are recorded below. The steps here
have been updated to what actually works, so re-running or extending this measurement
does not repeat the three false starts it took.*

- Enumerate every site that tests `0xEF` and record, for each, whether it is
  reachable in a wide build. **There are four code sites in two languages**: two
  draw-loop guards in `builder-templates/*.c`, and the chaser and flyer in
  `steps/Step_Playground/src/ai_asm.s` — the ASM AI is the shipped default and is
  easy to miss. Grep hits in `playground_server.py` and several in the templates are
  comments; count code only.
- Build a project **2 screens wide, 1 screen tall, 2 rooms**, with
  `_scene_is_perroom`'s `x > 255` clause temporarily relaxed. **2, not more** —
  the multi-bg door path is gated on
  `BW_DOORS_MULTIBG_ENABLED && (BG_WORLD_COLS <= 64) && (BG_WORLD_ROWS <= 60)`
  (`platformer.c`), so a wider room compiles the door code out and the transition can
  never fire. 2 screens still forces the 16-bit path (`x` up to 511), which is what
  the measurement needs.
- **Verifiable when:** a render test shows room 0's entities present and room 1's
  absent, and the reverse after a door transition. The first half is measured; the
  second is still unproven — no suite in this project can drive a door in a render
  test, which is why it is item 1 of the queued work-list.

**Outcome decides the rest.** If it passes, Step 2 is a two-line change and
Steps 3–5 become optional. If it fails, skip to Step 3.

### MEASURED 2026-08-13 — the hypothesis holds, with three corrections to this plan

**Result: parking survives a wide (16-bit) build.** With `_scene_is_perroom`'s
`x > 255` clause temporarily relaxed, a 2-room project carrying an entity at
`x = 400` builds a real ROM in which **room 0's entity draws and room 1's does
not** — parked at `ss_y = 0xFF` and correctly skipped despite 16-bit positions.

The control matters as much as the result: **unrelaxed, the same project draws
both entities** (the shared-scene fallback). So the absence is the parking working,
not the sprite failing to render for some unrelated reason.

**Correction 1 — the enumeration was wrong, and Step 1 above now carries the fix.**
The original asked for sites in `builder-templates/*.c` and `playground_server.py`
only, and counted comments among them. The real tally is **four code sites in two
languages**:

| Site | Wide-build behaviour |
| ---- | -------------------- |
| `platformer.c:2960`, `:3022` (draw loops) | `ss_y` is u16; parked `0xFF >= 0xEF` → skipped ✓ |
| `ai_asm.s` chaser (~385), flyer (~441) | under `SS_POS_WIDE`, high byte tested first (`bne` → skip when `ss_y >= 256`), then `cmp #$EF` on the low byte — parked `0x00FF` → skipped ✓ |

That the ASM checks the high byte *before* the sentinel is why the wide case works;
it was not obvious from the C alone, and it is the mechanism the hypothesis rests on.

**Correction 2 — off-by-one in the safe range.** The safe range is **`y ≤ 238`**:
`0xEF` *is* 239 and the engine's test is `>= 0xEF` → skip, so an entity at exactly
239 is already treated as parked, in every build, today. An earlier draft of this
plan put the boundary one higher, which would have admitted exactly one row of
entities that then vanish silently. **Step 1 and Step 2 above now both carry the
measured figure** — this note records why it changed, and the superseded number is
deliberately not repeated, because a correction printed beside the claim it corrects
gets read as the claim.

**Correction 3 — the test size was unbuildable, and Step 1 above now carries the
fix.** The multi-bg door path is gated on `BG_WORLD_COLS <= 64`, so a room wider than
two screens compiles the door code out and the transition half can never run. This
cost three attempts before the gate was found.

**Not achieved: the door-transition half.** After three attempts the player never
reached the door in the harness (4 wide, then 2 wide after finding the gate above,
with `doors.enabled` + `targetBgIdx = 1` and a door tile painted two tiles right of
the player start). The parked/present half is measured and controlled; **restoration
after a transition is still unproven**, so Step 2 should not be treated as fully
de-risked. What remains is a harness question (how to drive a door in a render
test — no existing suite does it; `chunk-c-doors.mjs` is validator-level only),
not an engine question.

*Measurement script: `item14-step1.mjs`, kept in the session scratchpad rather than
committed — it needs the production `x > 255` relaxation to mean anything, so as a
suite it would be either red or dishonest.*

## Step 2 — Narrow the restriction to the case that actually breaks

*Only if Step 1 passes.*

- Change `_scene_is_perroom` to reject on **`y > 238`** rather than on
  `x > 255 or y > 255`. **238, not 239** — `0xEF` *is* 239 and the engine's test is
  `>= 0xEF`, so an entity at exactly 239 is already treated as parked in every build.
  Measured 2026-08-13; see the Step 1 result above. Using 239 here admits one row of
  entities that then vanish silently, which is the bug this step exists to avoid.
- **Verifiable when:** a new suite asserts `BW_SCENE_PERROOM` **is** emitted for
  a wide/short multi-room project and **is not** emitted for a 2-screen-tall
  one; and `_rom-equiv.mjs` still passes (no golden project is multi-room, so
  the hashes must not move at all).

### Ride-along when Step 2 does the v79 ritual

**Two** stale comments are stranded in frozen engine files. Neither can be fixed on
its own, because any committed byte-change turns `engine snapshot matches live
sources` red and demands a version bump, a changelog entry and a re-snapshot —
spending an engine version on a comment, and leaving a no-op entry in the engine
changelog. Both are free on the back of a bump that is already happening.

1. **`tools/tile_editor_web/builder-modules.js`** (frozen, sha1 `cfe5e665…`) — its
   header says *"Chunk 1 ships two modules — `game` and `players`"*. There are **18**.
   It also documents six entry keys but omits two that are in active use:
   `detailedHelp` (10 modules) and `customRender` (3).
2. **`steps/Step_Playground/Makefile`** (frozen, sha1 `d0ee844f…`) — see below.


`steps/Step_Playground/Makefile`'s header comment is stale and **cannot be fixed on
its own**. It says the playground server "writes src/scene.inc, src/palettes.inc,
assets/sprites/game.chr and assets/backgrounds/level.nam" into that folder "then
invokes `make run` here". Neither half is true: every build clones into a
`tempfile.TemporaryDirectory` and runs plain `make -C <tmpdir>`.

It is stuck because that Makefile is a **frozen engine file** — it is in the v78
snapshot manifest, and its HEAD bytes hash `d0ee844f…` exactly as the manifest
records. Any committed content change, comment included, makes those differ and turns
`engine snapshot matches live sources` red, which then demands a version bump, a
changelog entry and a re-snapshot. Spending a version number on a comment would also
put a no-op entry in the engine changelog.

So: when Step 2 bumps to v79 anyway, correct that comment in the same commit. The
fix costs nothing on the back of a bump that is already happening, and the golden ROM
hashes are unaffected because no emitted byte changes.

## Step 3 — Give "parked" its own flag

*The real fix; needed for tall rooms regardless of Step 1's outcome.*

- Emit `ss_active[]` (one byte per entity) alongside `ss_room[]`, under
  `BW_SCENE_PERROOM` only.
- `scene_set_active_bg` sets `ss_active[k] = (ss_room[k] == n)` and restores home
  positions, instead of writing the `0xFF` sentinel.
- Add `&& ss_active[k]` to the draw loop and each AI body — **but only inside
  `#ifdef BW_SCENE_PERROOM`**, so non-per-room builds emit the identical code
  they do today.
- **Verifiable when:** (a) `_rom-equiv.mjs` unchanged; (b) a generated-C guard
  asserts `ss_active` appears in a multi-room build and is *absent* from a
  single-room one; (c) the Step 1 render test passes for a 2-screen-tall project.

**Cost to weigh:** one byte of RAM per placed entity, and one extra branch per
entity per frame in the draw and AI loops. Worth measuring against
`asm-benchmark.mjs` before committing to it.

## Step 4 — Remove the coordinate restriction

- `_scene_is_perroom` drops the coordinate clauses entirely; multi-room is
  decided purely by "entities span more than one background".
- **Verifiable when:** a matrix suite covers {1 screen, 4 wide, 2 tall, 4×2} ×
  {2 rooms, 3 rooms} and each shows only the active room's entities.

## Step 5 — Ship it as v79

- Bump `tools/engines/ENGINE_VERSION` **and**
  `tools/tile_editor_web/engine-version.js` to 79.
- Add a `tools/engines/CHANGELOG.md` entry under **Changed-migration** (existing
  multi-room projects that were silently falling back will start behaving
  per-room — that is the fix, but it *is* a behaviour change for saved projects).
- Commit, **then** `node scripts/snapshot-engine.mjs` (it reads from git HEAD, so
  snapshotting before committing freezes the previous state).
- **Verifiable when:** `node tools/builder-tests/run-all.mjs` is green, including
  the version-agreement and snapshot-drift checks.

---

## Needs a decision from the owner

Flagged rather than guessed, per the unattended-work rules:

1. **Should re-entering a room respawn its entities?** Today it does — parking is
   undone on every transition, so a defeated enemy returns. That is classic NES
   behaviour and is documented as deliberate, but it interacts with #35's
   invincibility work and with any future "persistent world" idea. Step 3 makes
   the alternative cheap to implement, so it is worth answering before, not after.
2. **Is one byte per entity of RAM acceptable?** Step 3's `ss_active[]` costs
   `NUM_STATIC_SPRITES` bytes. There is a zero-RAM alternative — park at a
   16-bit off-world Y such as `0xFFFF` and widen the aliveness test — but it
   touches all 5 guard sites rather than adding one array, so it is more
   invasive for less clarity. Recommendation: take the RAM.
3. **Does the vertical 2-screen cap (#10) stay?** If vertical scrolling is never
   going beyond 2 screens, the tall case is bounded at 479 and a 16-bit sentinel
   is comfortably safe. If it might grow, say so now.
