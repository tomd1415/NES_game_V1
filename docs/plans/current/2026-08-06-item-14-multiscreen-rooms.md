# #14 — per-room scene instances for multi-screen rooms

**Status:** Steps 1 and 2 are **done** (Step 2 shipped as v79, 2026-08-20).
Step 3 is planned and **blocked on an owner decision** — see the bottom of this
file, question 2. Steps 4 and 5 follow it. Written 2026-08-06.
**Engine impact:** yes. Step 2 shipped as **v79** on 2026-08-20; the remaining
steps ship as **v80** and need the full versioning ritual (bump both constants,
changelog entry, commit, snapshot). Do not reuse v79 — snapshots are immutable.

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
`ss_y < 0xEF`. That is an 8-bit assumption, and it is load-bearing at **~21
sites** — enumerated in Step 3, sub-step 4. This said "~5 places" until
2026-08-27, and that undercount is what made the byte-flag-versus-sentinel
recommendation look one-sided when it is not.

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
  `steps/Step_Playground/src/ai_asm.s`, which is easy to miss. **Be precise about
  when that ASM is linked**: `nes_asm_ai` is gated on
  `not _scene_is_perroom(scene_sprites)`, so it is the default for ordinary
  single-room projects and is switched OFF for multi-room ones. Saying flatly
  that it is "the shipped default" misled two readings of this plan. Grep hits in `playground_server.py` and several in the templates are
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

**The door-transition half — resolved 2026-08-14, and it was never an engine
problem.** Three attempts had failed to get the player onto a door in a wide build,
and this section previously concluded that no suite could drive a door at all. That
was wrong twice over:

- `per-room.mjs` has driven a door and asserted the room changed since v75. It was
  missed by searching for suites that *mention* doors; it is named for the feature,
  not the mechanism. (Recorded in `docs/LESSONS-LEARNT.md` — searching the wrong
  dimension, not a badly written pattern.)
- The wide case genuinely was untested, and now is:
  **`tools/builder-tests/door-transition-wide.mjs`**. Both rooms are 2 screens wide,
  so `SCROLL_BUILD` is on and `px` is a u16 world coordinate.

Measured, in a wide build: the near door transitions room 0 → 1 after 26 frames; a
door at **world x=320 — past the 8-bit boundary — fires after 290 frames**, with the
player reaching world x=496 and `cam_x=256`. So the 16-bit world position does reach
the door table, and the earlier failures were the harness, not the engine.

The suite reads `current_bg` out of RAM (poked at `0x0702`) rather than inferring the
room from what is on screen. That is deliberate: `_scene_is_perroom` disables per-room
activation whenever **any entity sits past x=255 or y=255** — note it keys on the
entity coordinates, not on the room's width, so a 2-screen room whose entities all sit
below 255 keeps per-room today. The layouts #14 exists to fix are exactly the ones that
trip it, so for those, "which entities are visible" cannot identify the room until
Step 2 lands. Reading `current_bg` is independent of all of that and works either
side of the change, which is the point.

**Restoration after a transition is therefore now drivable, but still not asserted** —
that needs Step 2's narrowed guard first, and is the assertion Step 2 should add.

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

> **Re-planned 2026-08-15, before any code.** Two things below were not in the
> original and change the order of work: the ASM engine implements the same
> sentinel and must move with the C, and nothing in the suite would currently
> notice if it did not. Sub-step 0 exists because of that and must come first.

**Sub-step 0 — understand why the ASM AI is switched off here, before changing it.**

> **Correction, same day.** An earlier version of this sub-step said the ASM AI
> is the shipped default for these projects and that Step 3 would silently split
> it from the C. **That was wrong** and the alarm was misplaced. The server
> disables the ASM AI for multi-room projects outright:
> `nes_asm_ai = bool(... and not _scene_is_perroom(scene_sprites))`.
> So no divergence is possible today, and the reason no `asm-*` suite covers
> multi-room is by design, not oversight.

The gating exists for a concrete reason worth carrying into Step 3: of the four
ASM AI routines, **`chaser` (ai_asm.s:379) and `flyer` (:435) test the parking
sentinel; `walker` (:306) and `patrol` (:334) do not.** Without the fallback a
parked walker would crawl back on screen, so multi-room takes the C AI, which
guards `ss_y < 0xEF` in every body.

That has three consequences for this step, and they replace the alarm:

- **The fallback's stated reason expires with Step 3.** It is written in terms of
  `ss_y = 0xFF` parking. Once "parked" is `ss_active[k] == 0`, the comment on that
  gate is describing a mechanism that no longer exists, and the gate itself is
  either unnecessary or needs re-deriving from the new flag. Do not leave it
  saying something untrue about the engine.
- **`chaser`/`flyer`'s sentinel checks become dead** — they test for a value the
  engine has stopped writing. Harmless, and exactly the kind of dead guard that
  reads as live protection later.
- **Lifting the fallback is a separate, later decision.** If multi-room is ever to
  get the ASM AI back (~1.2x faster, per `asm-ai-bench`), `walker` and `patrol`
  must learn `ss_active` first. THAT is when a multi-room A/B fixture becomes
  necessary — and it must be added and watched passing *before* the fallback is
  lifted, not after.

**Sub-step 1 — emit the flag.** `ss_active[]`, one byte per entity, alongside
`ss_room[]`, under `BW_SCENE_PERROOM` only. There is no cap on entity count in
the server (`n = len(scene_sprites)`), so the RAM cost is unbounded in principle
and worth a measured figure on a realistic project rather than an estimate.

**Sub-step 2 — C side.** `scene_set_active_bg` sets `ss_active[k] = (ss_room[k]
== n)` and restores home positions instead of writing the `0xFF` sentinel. Add
`&& ss_active[k]` to the draw loop and each C AI body, **only inside
`#ifdef BW_SCENE_PERROOM`**, so non-per-room builds emit identical code.

**Sub-step 3 — ASM side, and it is not urgent.** `steps/Step_Playground/src/ai_asm.s`
tests the sentinel itself — the chaser at ~384 (`lda _ss_y+1,y / bne` then
`cmp #$EF`) and the flyer likewise, four `cmp #$EF` sites in all. Those tests must
move with the C or they become dead guards that read as live protection later.

**It is NOT the shipped default for these projects, and nothing divergent can
happen today.** The server disables the ASM AI outright for multi-room projects
(`nes_asm_ai = bool(… and not _scene_is_perroom(scene_sprites))`), so the C AI —
which guards `ss_y < 0xEF` in every body — is what runs. An earlier version of this
sub-step said the opposite and warned of "invisible enemies that can still hit you"
if the two halves diverged. That warning was wrong and is withdrawn: it came from
checking that `ai_asm.s` *contains* the sentinel and never checking whether it is
*linked*. Do the second check before believing the first.

**And it fixes a bug much wider than this plan assumes — the lower half of every
tall level is decorative.** Two measurements, both on an **ordinary single-room 1×2
level** with no per-room involved:

- **2026-08-21:** a chaser or flyer below y=238 renders correctly and **never runs
  its AI**, because its world `y` fails the `ss_y < 0xEF` guard exactly as a parked
  actor does. Walker and patrol are unaffected (they never test the sentinel), so a
  pupil sees one enemy work and the one beside it sit still.
- **2026-08-27:** an enemy at **y ≥ 240 cannot damage the player at all**, and is
  drawn perfectly normally while failing to. Driving the player down onto it with
  the D-pad: at y=150, 238 and 239 it takes a hit (hp 5→4); at **y=240 it does
  not**, and the only thing that changed is the damage loop's
  `if (ss_y[i] >= 240) continue;` (`builder-modules.js:1522`), which exists to skip
  the `0xFF` "defeated" sentinel and cannot tell it from a legitimate world `y`.

Together: in a 1×2 level, enemies below the halfway line neither move nor hurt
anyone, while looking entirely correct. That is the case a pupil actually hits, and
it is the strongest argument for doing Step 3 at all.

> **A prediction I got wrong, kept because the shape of the error is instructive.**
> I expected y=239 to be *invisible and still damaging* — the draw loops guard on
> `>= 0xEF` (239) and the damage loop on `>= 240`, so a legitimate 239 looked like
> it would fall between them. Measured, it is wrong in both halves: the enemy **is**
> drawn at 239 (both draw guards sit inside `#ifdef BW_SCENE_PERROOM`, so a
> single-room build has no draw guard at all) and it **does** damage there. The real
> boundary is one pixel lower and the polarity is reversed. I had checked the guards
> existed without checking they were compiled in — the same mistake as the ASM claim
> above, made twice in one plan.
>
> Note also, from the same run and not chased: **the player's spawn `y` is clamped
> to 200** however high `player1.config.startY` is set, though the player can walk
> to py=464. Possibly a separate bug; recorded rather than investigated.

**Sub-step 4 — end with ONE spelling of the threshold.** It is currently written
four ways across ~21 sites — `>= 0xEF` (7), `< 0xEF` (4), `>= 240` (7), `< 240` (3),
plus 8 `= 0xFF` writes and 4 `cmp #$EF` in `ai_asm.s`. 239 and 240 disagree by one,
which is how the two bugs above ended up with different boundaries. Whatever
mechanism replaces the sentinel, no site should be left testing a coordinate.

**Verifiable when, in order:**
  a. sub-step 0's multi-room A/B fixture exists and passes BEFORE any change;
  b. `_rom-equiv.mjs` unchanged — safe by construction, its fixture has a single
     background so `_scene_is_perroom` returns False for it either way;
  c. a generated-C guard asserts `ss_active` appears in a multi-room build and is
     *absent* from a single-room one;
  d. `perroom-wide-gate.mjs` extended with a 2-screen-TALL case (it covers wide
     today), asserting the room-1 entity is parked rather than merely off-screen;
  e. a chaser at y=300 in a plain 1×2 single-room level RUNS its AI;
  f. an enemy at y=240 and at y=400 in a plain 1×2 single-room level DAMAGES the
     player on contact — with the y=150 control in the same suite, because without
     it "no damage" cannot be told from a fixture that never made them touch. That
     mistake voided two runs on 2026-08-27 before the control caught it;
  g. a defeated enemy and a collected pickup STAY gone across a room transition —
     the sentinel currently means parked, defeated *and* consumed, so whatever
     replaces it must carry all three or re-entering a room resurrects them;
  h. the multi-room A/B fixture from (a) still passes — this is the one that
     catches sub-step 3 being skipped, and it is worthless unless (a) was
     watched passing first.

**Cost to weigh:** one byte of RAM per placed entity, and one extra branch per
entity per frame in the draw and AI loops. Measure against `asm-benchmark.mjs`
before committing — the ASM AI exists because the C was too slow, so a per-entity
branch is exactly the kind of cost that motivated it.

## Step 4 — Remove the coordinate restriction

- `_scene_is_perroom` drops the coordinate clauses entirely; multi-room is
  decided purely by "entities span more than one background".
- **Verifiable when:** a matrix suite covers {1 screen, 4 wide, 2 tall, 4×2} ×
  {2 rooms, 3 rooms} and each shows only the active room's entities.

## Step 5 — Ship it as v80

- Bump `tools/engines/ENGINE_VERSION` **and**
  `tools/tile_editor_web/engine-version.js` to 80. (This said 79 until
  2026-08-27. v79 shipped on the 20th as **Step 2** — do not reuse it; a
  snapshot is immutable once written and `snapshot-engine.mjs` refuses.)
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
2. **Byte flag or 16-bit sentinel?** Step 3 needs "parked/defeated/consumed" to
   stop being a coordinate. Two ways: a per-entity `ss_active[]` byte, or park at a
   16-bit off-world Y such as `0xFFFF` and widen the test.

   > **This recommendation is withdrawn, 2026-08-27.** It read: *"[the sentinel]
   > touches all 5 guard sites rather than adding one array, so it is more invasive
   > for less clarity. Recommendation: take the RAM."* That is a false asymmetry.
   > `ss_active[]` has to be substituted at those same sites — `ss_y < 0xEF` cannot
   > be left standing — so **both options edit the same places**, and the flag
   > additionally costs a byte per entity plus an array index per entity per frame.
   > The sites are also **~21, not 5** (enumerated in sub-step 4 above).

   So the honest comparison is: same edit surface either way; the flag costs RAM and
   a per-frame index and reads more clearly; the sentinel costs neither and keeps
   the "is it alive" test as one 16-bit compare. **No recommendation** — I talked
   myself into the first one and would rather you chose. What would decide it for
   me is question 3 below.
3. **Does the vertical 2-screen cap (#10) stay?** If vertical scrolling is never
   going beyond 2 screens, the tall case is bounded at 479 and a 16-bit sentinel
   is comfortably safe. If it might grow, say so now.
