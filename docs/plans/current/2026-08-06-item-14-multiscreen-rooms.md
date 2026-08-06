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

- **Wide but one screen tall** (`x > 255`, `y ≤ 239`): parking at `ss_y = 0xFF`
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

- Enumerate every site that tests `0xEF` (5 matches today across
  `builder-templates/*.c` and `playground_server.py`) and write down, for each,
  whether it is reachable in a wide build.
- Build a project that is **4 screens wide, 1 screen tall, 2 rooms**, with
  `_scene_is_perroom`'s `x > 255` clause temporarily relaxed.
- **Verifiable when:** a render test shows room 0's entities present and room 1's
  absent, and the reverse after a door transition.

**Outcome decides the rest.** If it passes, Step 2 is a two-line change and
Steps 3–5 become optional. If it fails, skip to Step 3.

## Step 2 — Narrow the restriction to the case that actually breaks

*Only if Step 1 passes.*

- Change `_scene_is_perroom` to reject on **`y > 239`** rather than on
  `x > 255 or y > 255`.
- **Verifiable when:** a new suite asserts `BW_SCENE_PERROOM` **is** emitted for
  a wide/short multi-room project and **is not** emitted for a 2-screen-tall
  one; and `_rom-equiv.mjs` still passes (no golden project is multi-room, so
  the hashes must not move at all).

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
