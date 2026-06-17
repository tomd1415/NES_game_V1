# Web-form feedback — check-and-fix plan, 2026-06-17

> **Source.**  The 25 in-editor *💬 Leave feedback* submissions captured in
> [`../../feedback/web-feedback-2026-06.md`](../../feedback/web-feedback-2026-06.md)
> (dated 2026-04-25 → 2026-06-16), which had never been transcribed into the
> repo.  New bugs are also filed as items 30–38 in
> [`../../feedback/recently-observed-bugs.md`](../../feedback/recently-observed-bugs.md).
> This plan complements — does not replace — the tier plan in
> [`2026-04-26-fixes-and-features.md`](2026-04-26-fixes-and-features.md);
> where a request matches an existing tier item, that's flagged (e.g. T2.9).

All root causes below were verified against the current code on 2026-06-17
(file:line are approximate — they drift; search the named symbol).  Each
fix should land a regression entry in
[`../../changelog/changelog-implemented.md`](../../changelog/changelog-implemented.md)
and, where headlessly testable, a guard in
[`../../../tools/builder-tests/`](../../../tools/builder-tests/).  The
`tools/builder-tests/run-all.mjs` suite (incl. the byte-identical-ROM
invariant) must stay green.

---

## Part A — Bugs

Ordered *highest confidence × highest pupil-visible value first*.  The first
three are concrete fixes ready to write; the middle two are verify-then-
close; the last four need a reproduction with the pupil before any code (the
project's standing rule — see item 16's "don't fix blind" note).

### B-4 — Trigger / win freeze turns the screen green  ⭐ do first

- **Feedback:** F5 (K).  **Bug item:** 33.  **Status:** OPEN, high confidence.
- **Root cause:** `tools/tile_editor_web/builder-modules.js` ≈1305–1309 —
  `win_condition`'s freeze does `PPU_MASK = 0x1F | 0x20` (= 0x3F).  The
  comment intends "greyscale + pale-red emphasis", but jsnes decodes
  `(mask >> 5) & 7 == 1` as a **solid green** backdrop fill, so stepping on
  the default TRIGGER tile floods the in-browser screen green.  The death
  tint `0x1F | 0x80` (= 0x9F → blue) is the same bug.
- **Fix:** drop the greyscale bit (bit 0).  Use `PPU_MASK = 0x1E | 0x20` for
  the win freeze and `0x1E | 0x80` for death.  Re-check the actual tint in
  jsnes (it renders emphasis as a flat colour fill, *not* the subtle NTSC
  wash a real PPU shows), and pick whatever reads as a clear "game over" cue
  there — a non-emphasis approach (e.g. swap the backdrop palette entry) may
  read better than emphasis in jsnes.  Whatever ships must look sane in
  **both** jsnes and FCEUX.
- **Test:** static guard in `run-all.mjs` that the emitted freeze/death code
  no longer contains `PPU_MASK = 0x1F`; if practical, a jsnes frame-grab
  assertion that the backdrop isn't pure green after a trigger.
- **Success:** stepping on a trigger shows a readable end-state tint (not
  full green) in the browser preview; death tint likewise.

### B-1 — Enemies pass through solids / don't bounce off blocks  ⭐

- **Feedback:** F1a + F10 (K).  **Bug item:** 30.  **Status:** OPEN, high
  confidence.  Two pupil reports → one root cause.
- **Root cause:** `tools/tile_editor_web/builder-modules.js` `scene` module
  ≈409–434.  Walker AI steps `ss_x[i] += 1` and only reverses at the screen
  edge using a literal `255`; chaser steps `ss_x/ss_y += 1` toward the
  player.  **Neither calls `behaviour_at()`**, so enemies ignore
  SOLID_GROUND / WALL / PLATFORM and walk through walls instead of turning
  around.  The literal `255` (should be `WORLD_W_PX`) is also why a sprite
  near the right edge jitters "one to the side".
- **Fix:** before committing each step, probe the leading column at the
  sprite's body rows with `behaviour_at()` — mirror the player's walk-block
  test (`platformer.c` walk-collision, ≈582–619).  On a solid hit, reverse
  `bw_dir` (walker) / stop that axis (chaser) instead of stepping.  Replace
  the literal `255` with `WORLD_W_PX`.  Optionally treat "no floor ahead" as
  a ledge turn so walkers don't fall off platforms.  Keep `+= 1` for now
  (speed is a separate feature, R-4) but make this read the *prospective*
  position so it composes with R-4 later.
- **Test:** new `builder-tests` case — a walker placed on a platform with a
  wall column reverses at the wall (assert direction flip in the emitted C,
  or a short jsnes run asserting the enemy never enters the wall column).
- **Success:** walkers turn at walls and platform edges; chasers stop at
  solids; no one-pixel edge jitter.  (Enemy-vs-enemy overlap is out of scope
  here — note it as a follow-up; needs an AABB pass.)

### B-8 — A "jump" animation plays the walk animation in the air  ⭐

- **Feedback:** F16 (T).  **Bug item:** 38.  **Status:** OPEN, high confidence.
- **Root cause:** `tools/playground_server.py` `_resolve_animation`
  ≈863–892 **silently drops** any frame whose sprite `(width, height)` ≠ the
  player's `(PLAYER_W, PLAYER_H)` and returns `None` if none survive, so the
  server emits `JUMP_FRAME_COUNT 0`.  The engine plays the jump animation
  only when that count `> 0` (`main.c` ≈538 / `platformer.c` ≈790) and
  otherwise falls through to `anim_mode = 1` (walk).  Net effect: a jump
  animation authored at a different sprite size plays as **walk** mid-air,
  with no obvious warning.  (The docstring claims "the editor also warns" —
  there is no prominent size-mismatch warning on the Sprites page animation
  UI; confirm and add one.)
- **Fix (two parts):**
  1. **Editor warning** — on the Sprites page, when an animation assigned to
     `walk`/`jump` (or tagged) contains a frame whose size differs from the
     player sprite, show a visible warning near the assignment dropdown
     (`sprites.html` `renderAnimationAssignments`, ≈4049) so the pupil knows
     the frame will be ignored.  Reuse the existing `setStatus('warn', …)` /
     `--warn` styling.
  2. **Optional engine relax** — consider rendering the jump animation at its
     own `W×H` instead of forcing the player footprint, so a differently
     sized jump pose plays.  Higher risk (touches OAM build); gate behind the
     byte-identical baseline.  Ship part 1 first.
- **Test:** server unit/guard — an animation with a mismatched frame size
  yields `JUMP_FRAME_COUNT 0` *and* the editor surfaces a warning (static
  check that the warning code path exists).
- **Success:** a pupil who builds a jump animation either sees it play, or is
  told *why* it didn't — never a silent swap to walk.

### B-2 — NPC dialogue glitches the stage, esp. on gallery projects

- **Feedback:** F1b + F23 (K, A).  **Bug item:** 31.  **Status:** OPEN.  This
  is the still-open half of the long-standing **item 28** / the June sweep's
  partial dialogue fix (camera-snap was fixed; text rendering wasn't).
- **Root cause:** dialogue draws text as **raw ASCII tile indices** (`A` =
  0x41 …) — `platformer.c` `draw_text` / `clear_text_row` ≈347–394 — and the
  clear-restore reads `bg_nametable_0[]` only (the `vblank_writes` block in
  `builder-modules.js` ≈1093–1176).  A gallery-loaded project rarely has
  glyph tiles painted at 0x41–0x5A, so the box shows garbage; the
  "split-second" flash is the `PPU_MASK = 0` render-off window plus the
  always-bg-0 restore on a multi-background / scrolled project.
- **Fix:**
  1. When the dialogue module is enabled, have `playground_server.py`
     **guarantee a font** is present (seed glyph tiles into CHR / the
     nametable, or fail the build with a clear "your project needs the
     dialogue font tiles" message) rather than rendering whatever the author
     painted at 0x41–0x5A.
  2. Make `clear_text_row` restore from the **current room's** nametable, not
     always `bg_nametable_0`.
  3. Keep the camera-restore-via-`scroll_apply_ppu()` already added in June.
- **Test:** build a project with no glyph tiles + dialogue enabled and assert
  the build either seeds a font or fails with the explanatory message; a
  scrolling-dialogue smoke case (ties into deferred item 11 in the undocumented
  fix plan).
- **Success:** turning on "talk" never shows garbage tiles or a stage flash,
  including on a project loaded from the gallery.

### B-6 — Enemy contact can kill the player instantly  (verify + harden)

- **Feedback:** F9 (A).  **Bug item:** 35.  **Status:** VERIFY (likely fixed).
- **Finding:** the `damage` module (`builder-modules.js` ≈568–644) already
  grants invincibility frames (default 30) and only dies at HP 0, with an
  i-frame gate blocking repeat hits.  The report predates this.  It can still
  reproduce **only** if a pupil sets *Invincibility frames* = 0 (schema
  `min: 0`), where every overlapping frame re-hits.
- **Fix:** confirm with a default-config build that one touch = one hit.  Then
  harden the schema: raise the *Invincibility frames* minimum to ~10 (or
  always enforce a small floor in the emitted C) so a pupil can't
  accidentally configure instant death.
- **Test:** guard that the emitted damage code keeps the i-frame gate; schema
  test that the minimum is non-zero.
- **Success:** no default or near-default config produces instant death.

### B-9 — Arrow keys drive both the page and the emulator  (verify)

- **Feedback:** F12 + F25 (D, M).  **Bug item:** 36.  **Status:** VERIFY
  (guards now exist).
- **Finding:** Backgrounds (`index.html` ≈4374) and Sprites (`sprites.html`
  ≈8546) both bail their page key handler while `#emu-dialog` is open, and
  the shared `emulator.js` owns its own listeners.  The latest commit fixed a
  *different* sprites-page bug (ROM byte-format), not keys.
- **Fix:** manual confirm on **Backgrounds specifically** (Markus's report).
  Audit every page that can open an emulator: if any opens a *private*
  emulator with a dialog id other than `emu-dialog`, its guard won't match —
  align the id or the guard.  Add a static guard in `run-all.mjs` that each
  page mounting an emulator also has the open-dialog keydown bail.
- **Success:** with a game running in any page's preview, arrow keys move only
  the player — never the tile cursor or the page scroll.

### B-3 — Deleting the 2nd sprite animation appears to delete the 1st

- **Feedback:** F1c (K).  **Bug item:** 32.  **Status:** NEEDS REPRO.
- **Finding:** the delete handlers in `sprites.html` (`removeAnimFrame`
  ≈4039; `btn-anim-del` ≈4145) splice the *selected* item and are
  index-correct.  The only suspicious line is the post-delete re-selection
  `selectedAnimId = state.animations[Math.max(0, idx - 1)].id` (≈4156), which
  after deleting #2 selects #1 — correct, but *looks* like the wrong one went.
- **Action:** **do not write a fix yet.**  Capture the pupil's exact steps
  using the reproduction checklist filed under item 32 in
  `recently-observed-bugs.md` (frame strip ✕ vs whole-animation 🗑?  which
  item was actually gone vs merely deselected?).  If it's purely the
  re-selection optics, the fix is to keep the deleted item's *neighbour to
  the right* selected (or select nothing) so it never highlights #1.
- **Success:** reproduction recorded; fix only if a real off-by-one surfaces.

### B-5 — Collision feels "1 pixel across" when pressing Start

- **Feedback:** F6 (K).  **Bug item:** 34.  **Status:** NEEDS REPRO.
- **Finding:** the engine reads no Start/pause button, so the button can't
  move collision.  Most likely the one-time landing-snap on the first
  grounded frame (`platformer.c` ≈737) rounding the player to a tile
  boundary, perceived as a shift.  The 8-bit truncation that *did* teleport
  tall worlds was fixed in June.
- **Action:** reproduce on FCEUX (item 34 checklist) to decide between the
  spawn-snap theory and an emulator input artefact before any code.  If it's
  the spawn snap, align the placed spawn Y to the tile grid in the editor so
  there's no first-frame jump.
- **Success:** reproduction recorded; no first-frame visual jump on spawn.

### B-10 — "Game keeps crashing" / "emulator froze for no reason"

- **Feedback:** F2, F11, F13 (D, A).  **Bug item:** 37.  **Status:** NEEDS
  REPRO + opportunistic hardening.
- **Finding:** OAM-overflow guards from June cover the scene-sprite + HUD
  loops, but the **player / P2 OAM loops** (`platformer.c` ≈999, ≈1099) are
  unguarded (bounded by sprite size, so only a risk with a huge player), and
  the in-browser jsnes frame loop (`emulator.js` ≈287) has **no watchdog** —
  a malformed/oversized ROM or a heavy vblank can hang it with no recovery.
- **Fix (hardening, independent of repro):**
  1. Bound the player/P2 OAM loops like the others (`if (oam_idx <= 252)`).
  2. Make the HUD overflow `break` exit the outer heart loop too.
  3. Wrap the jsnes step in try/catch + a frame-time watchdog that shows a
     "the game stopped — reset?" banner instead of freezing the tab.
- **Action:** gather repro via item 37 checklist (which page? sprite count?
  audio on? boot vs door vs random?).
- **Success:** no unguarded OAM loop remains; a hung ROM shows a banner, not a
  frozen tab; specific repro captured for the root cause.

---

## Part B — Feature requests

Ordered by effort.  R-numbers are referenced from the feedback record.  Where
a request maps to an existing tier item, build it there rather than spinning a
new workstream.

### Already shipped — discoverability / explanation only (no engine code)

**R-1 — "Make the scene move to the second one"** *(F3 — SHIPPED, nudge)*
The **Doors** module already transitions backgrounds, but *Target background*
defaults to `-1` (= same-room teleport, `builder-modules.js` ≈701/719), so a
freshly-painted door does nothing across screens, and it's labelled "Doors"
not "next level".  **Do:** (a) change the default target to the next
background when one exists, or surface an inline hint when target is `-1`;
(b) rename/relabel toward "Door / go to another background"; (c) add a
one-paragraph "moving between screens" note to the Builder guide.  Pure
editor + docs.

**R-5 — "Add more colours"** *(F14 — HW-LIMIT, explain)*
The editor already exposes the full 64-entry NES master palette and all four
BG + four sprite sub-palettes (`index.html` ≈1406/1971) — that is the entire
hardware capability (4 palettes × 3 colours + shared backdrop per layer).
**Do:** add a short "Why only these colours?" tooltip/help panel near the
palette picker explaining the NES limit and how to make the most of the 4
sub-palettes.  No code beyond a help string.

**R-2 — "Make the squares half"** *(F4 — HW-LIMIT)*
NES background tiles are a fixed 8×8 with 16×16 attribute-colour granularity;
sub-8px tiles don't exist.  The per-tile pixel grid is already 8×8 with a
fine grid overlay.  **Do:** confirm what K actually wants next session — if
it's finer *detail*, that's already pixel-level; if it's bigger composite
pieces, a **16×16 metatile authoring helper** is the nearest feasible thing
(Medium, editor-only) but should not be built until the intent is confirmed.

### Quick (single focused session)

**R-10 — "Character bob when walking"** *(F22 — NEW, Quick)*
A 1px sprite-Y nudge tied to the walk-animation tick.  The player OAM Y and a
walk-cycle counter already exist (`platformer.c` anim tick ≈295–300 / 804).
**Do:** add a `bobWhenWalking` bool to the Player/Globals module schema; in
the template, offset OAM Y by 1 on alternate walk-anim frames when moving and
grounded.  No NES constraint.  Test: guard that the toggle emits the offset.

### Medium (½–1 day; several map to existing Tier-2 items)

**R-4 — Enemy / per-sprite speed** *(F8 + F17 — PARTIAL → = T2.5/T2.8)*
Player walk speed + the Globals module already ship; *enemy* speed does not —
walker/chaser AI hard-codes `+= 1` (`builder-modules.js` ≈418/430).  **Do:**
add a `speed` field to the scene-instance schema and parametrise the step.
Compose with B-1 (do B-1 first so the prospective-position probe is in place).
This is the concrete first slice of tier item **T2.5** (per-sprite tuning) /
**T2.8** (enemy paths).

**R-3 — Spawn a sprite when you hit a block/sprite** *(F7 — NEW → = T2.9)*
No spawn reaction exists; behaviour reactions are collision verbs only
(`behaviour.html` ≈1375).  This is tier item **T2.9** (per-instance trigger
effects).  **Do:** add a `spawn` effect to a trigger/block instance in
`builder-modules.js` + emit an OAM-slot activation in the assembler.  NES
limit: 64 OAM sprites / 8-per-scanline — cap concurrent spawns.

**R-6 — On hit, a sprite plays an animation that stays** *(F18 — NEW)*
A persistent hurt/effect sprite on damage.  Needs the spawn machinery (R-3)
plus non-player animation (tier item **T2.10**).  **Do after R-3.**  The
`damage` module (`builder-modules.js` ≈568–644) gains an optional
"spawn effect sprite on hit" that activates a looping 2-frame OAM sprite.

**R-7 — Press a button to play an animation (attack)** *(F19 — NEW, kin T2.4)*
No module binds a controller button to an animation; `anim_mode` is
movement-driven only (`platformer.c` ≈789–800), and A is read for jump only.
**Do:** add an "attack" animation style + a button-edge check in the template
and a Builder toggle (which button → which animation).  Closely related to
**T2.4** ("press a button to fire") — design them together.

**R-8 — Make checkpoints work** *(F20 — NEW)*
No checkpoint/respawn exists; on death the damage module only freezes
(`builder-modules.js` ≈599).  **Do:** a checkpoint behaviour tile that saves
a respawn `(x, y)`, plus respawn-on-death in the damage block (reset position
+ restore some HP instead of permanent freeze).  Pairs naturally with the
death-tint fix in B-4.

**R-9 — Copy and paste background elements** *(F21 — NEW)*
Backgrounds has *fill* (T1.1, done) and single-tile *pixel* copy, but no
marquee region select + paste of placed tiles (`index.html`).  **Do:** add
rubber-band region selection on the nametable canvas + a clipboard of cell
tile/attribute values + paste at the cursor.  Pure editor work; reuse the
existing undo (`pushUndo`) and dirty-marking.

### Architectural (design note before code)

**R-11 — Infinite-runner game mode** *(F24 — NEW → = T3.4)*
This is tier item **T3.4** (Geometry-Dash-style auto-scroll: forced cam
scroll, tap-to-jump, instant restart) — explicitly design-before-code.  No
auto-scroll style exists (`game.type` is platformer/topdown only,
`builder-modules.js` ≈54).  **Do:** write the T3.4 design note (auto-scroll
mechanism, death/respawn loop, level authoring) before any code; the death/
respawn half overlaps R-8.

---

## Part C — Recommended sequencing

1. **Session 1 — three concrete bug fixes (one editor/codegen sweep):**
   **B-4** (green screen — tiny, highest confidence) → **B-1** (enemy
   collision/bounce — two reports) → **B-8** part 1 (jump-animation warning).
   All three touch `builder-modules.js` / `playground_server.py` and ship
   with `run-all.mjs` guards.
2. **Session 2 — verify-and-close + a quick win:** **B-6** (confirm + harden
   i-frame schema), **B-9** (confirm keyboard focus on Backgrounds), **R-10**
   (character bob).  Low-risk, closes three feedback items and ships a
   pupil-visible feature.
3. **Next pupil session — capture reproductions:** fill the item 32 / 34 / 37
   checklists for **B-3**, **B-5**, **B-10** (and ask K for the "and others"
   from F1).  Apply the B-10 hardening (player-loop OAM bound + jsnes
   watchdog) regardless, since it's repro-independent.
4. **Session 3 — dialogue:** **B-2** (font-guarantee + current-room restore),
   which also advances long-standing item 28 and deferred item 11.
5. **Feature track (slot alongside the above):** **R-1**/**R-5** nudges
   (cheap, high pupil value), then the Tier-2 builds **R-4 → R-3 → R-6/R-7**,
   then **R-8**, **R-9**.  **R-11** (infinite runner) and the R-2 metatile
   question wait on design notes / pupil clarification.

## Open questions for the pupils

- **F1 "and others"** (K) — list the remaining bugs.
- **F4** (K) — does "make the squares half" mean finer detail (already
  possible) or larger composite pieces (16×16 metatiles)?
- **B-3 / B-5 / B-10** — the reproduction checklists in
  `recently-observed-bugs.md` need a hands-on session to fill in.
