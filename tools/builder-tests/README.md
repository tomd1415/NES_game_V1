# Builder regression tests

Smoke tests for the Builder page and its pipeline.  Run them all
from the repo root:

```
node tools/builder-tests/run-all.mjs
```

or an individual suite:

```
node tools/builder-tests/round2-dialogue.mjs
```

## What some of the suites cover

**This table is a selection — 8 of the 110 suites, not a directory.** It was headed
"What each suite covers" until 2026-08-13, which is a completeness claim over 7% of
them: a reader looking up a suite that is not here would reasonably conclude it does
not exist. The suites are self-describing (each prints what it asserts), so rather than
hand-maintain a 110-row table that would drift the same way, list them from the disk:

```
ls tools/builder-tests/*.mjs | grep -vE 'run-all|ports-unique'
```

## Adding a suite

`run-all.mjs` **auto-discovers** every `.mjs` file in this directory — there is
no list to register in. Drop a file here that spawns its own server on a unique
port and exits non-zero on failure, and it runs. (That is also why the helper
`_rom-equiv.mjs` is named with a leading underscore: it is self-asserting and
harmless to run, so it can stay in the sweep.)

## What some suites cover

> The tables below are a **selective guide, not an index.** There are ~113
> suites and ~29 are described here; the newer ones (engine v50+, the Studio
> era) mostly are not. Auto-discovery means an undocumented suite still runs,
> so treat a gap here as missing prose, never as missing coverage. To see the
> real list: `ls tools/builder-tests/*.mjs`, or read the header comment of any
> suite — each one opens with what it guards and why.

| File                     | Scope                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| `preview.mjs`            | NesRender headless load + same-sprite-reuse in scene instances.       |
| `player2.mjs`            | Player 2 end-to-end: server emission, validator, cc65 build.          |
| `chunk-a-hp-hud.mjs`     | HP + damage + HUD (ROLE_HUD sprite).                                  |
| `chunk-b-anim.mjs`       | `enemy + walk` tagged-animation runtime playback.                     |
| `chunk-c-doors.mjs`      | Teleport doors (same-room variant).                                   |
| `round1-polish.mjs`      | P2 HP + P2 walk anim + `enemy+idle` + `pickup+idle`.                  |
| `round2-dialogue.mjs`    | Dialogue module, including a regression guard against the pre-fix `draw_text` pattern. |
| `round3-multi-bg.mjs`    | Multi-background doors.                                               |

The four `render-*.mjs` suites are described under
[The render harness](#the-render-harness-librender-harnessmjs) below.

Each suite spawns its own throwaway Playground Server and exits 0 on success,
non-zero on first failed assertion.

**Suites do not choose their port — `run-all.mjs` assigns one.** Each gets a
reserved block of 3 starting at 18800 (so 111 suites reach 19132), passed as
`BUILDER_TEST_PORT`, and asks for it via `lib/test-port.mjs`:

```js
import { testPort } from './lib/test-port.mjs';
const PORT = testPort(18783);          // 18783 only when run standalone
const SECOND = testPort(18784, 1);     // a suite needing two servers
```

The number in the call is a **fallback for a standalone run**, where nothing else
is running and so nothing can clash. `ports-unique.mjs` fails the run if a suite
mentions a port outside a `testPort(...)` call — the one rule with no spellings to
miss, after three separate audits of "who claims which port" gave three different
answers.

The runner also **reaps**: each suite runs detached, as its own process-group
leader, and the group is signalled after it exits. 23 of the 33 suites that spawn
a server can exit from inside their own `try`/`finally`, so the reap never runs and
the server squats the port — which does not fail loudly, because
`playground_server.py` finds a healthy server there, prints `already running --
nothing to do`, exits 0 **without binding**, and discards the environment the
caller set.
Each suite spawns its own throwaway Playground Server on its own
port and exits 0 on success, non-zero on first failed assertion.
The runner runs them one at a time, so ports never collide within a
run — a dozen or so pairs deliberately share one.

**Ports are catalogued in [`docs/guides/TEST-SERVERS.md`](../../docs/guides/TEST-SERVERS.md)** —
the range in use, how to pick one for a new suite (don't grep for
`PORT =`; the suites spell it four different ways).  **18790 used to
be shared with the Studio E2E server**, which made running both suites
concurrently fail *silently*; the three suites involved were moved to
18895–18897 on 2026-08-06 and `run-all.mjs` now fails if any suite
names the E2E port.  The ranges this file used to quote had drifted
and were the source of that overlap.

## The render harness (`lib/render-harness.mjs`)

| Render suite | What it asserts on the booted ROM |
| --- | --- |
| `render-dialogue-visible.mjs` | Box opens on B; "HELLO" reaches the nametable + screen; clears on close. |
| `render-tint-not-flood.mjs` | Win/death tint fires but keeps its colour (no B-4 greyscale wash-out). |
| `render-font-glyph.mjs` | The seeded dialogue font lands in the CHR (read straight from the ROM). |
| `render-walker-wall-stop.mjs` | A walker enemy stops/bounces at a wall instead of walking through (B-1). |

The `render-*.mjs` suites don't just check that a project *compiles* —
they boot the compiled ROM in **jsnes (headless, in Node)** and assert
on what actually renders: nametable tiles, OAM sprites, and the RGB
framebuffer.  This closes the gap that let every recent *visual* bug
(green screen, dialogue garbage, dialogue-invisible) reach pupils
despite a green suite.  `lib/` is a directory, so the runner's
`*.mjs` glob never mistakes the harness for a suite.

Key helpers: `startServer/buildRom` (build a ROM through `/play`),
`openRom` (load it, with `frame`/`frames`/`tap`/`hold`/`pressFor`),
readers `ntTile` / `oamSprite` / `findSpriteByTile` / `pixelAt` /
`countNonBg` / `dominantColor` / `saturatedFraction` / `frameDiffFraction`,
the CHR reader `chrTile` / `chrTileBlank` / `chrTileArt`, and fixture
builders `mkCells` / `blankPool` / `flatBackground` / `BEHAVIOUR_TYPES`.

**Three gotchas the harness encodes — read before writing a render suite:**

1. **jsnes has a one-frame input latency.**  The `frame()` right after
   `buttonDown()` still reads `pad == 0`; the press only appears on the
   *second* frame.  A single-frame press never registers.  `tap()` holds
   ≥2 frames then releases; use it for edge-triggered inputs (dialogue B).
2. **Deterministic positioning without `playerStart`.**  `playerStart`
   is ignored on the customMainC build path — the player always spawns at
   the default `(60,120)` and falls.  Park a **flying** NPC/enemy at the
   player's *resting* spot (`y=208` on a row-28 floor) so proximity is
   exact and physics-independent.
3. **Nametable/OAM/CHR reads are reliable; absolute framebuffer
   *positions* are not.**  jsnes doesn't faithfully restore the PPU scroll
   after the engine's mid-vblank `$2006`/`$2005` writes, so dialogue text
   renders at the wrong *scanline* (it's correct on real hardware).  Assert
   on the nametable/OAM/CHR, or on scroll-independent framebuffer facts
   ("some lit pixels appear / disappear", colour saturation), never on a
   fixed pixel box.

## Behavioural game-mechanic + trust suites (2026-07-05)

These boot the compiled ROM in jsnes and assert on **what the engine actually
does**, not just what it emits — closing the gap that let codegen-green-but-
broken mechanics reach pupils. Most use `lib/render-harness.mjs`; they set the
spawn via `players.player1.config.startX/startY` (baked into the ROM — the
payload `playerStart` is ignored on the customMainC path, see gotcha 2 above).

| Suite | What it drives + asserts |
| --- | --- |
| `topdown-movement.mjs` | Top-down four-way motion: RIGHT/LEFT move X, UP/DOWN move Y, no gravity when idle, and a WALL column stops the player (bug #26 — top-down was codegen-only). |
| `smb-speed.mjs` | The SMB Speed 1–5 preset changes **real** walk distance (Speed 5 ≫ Speed 1) and holding B runs faster than walking — locks the "walk speed does nothing" fix behaviourally. |
| `smb-stomp.mjs` | Dropping on a Goomba (penned in walls for determinism) defeats it — its OAM cell parks off-screen (`ss_y=0xFF`). |
| `smb-flagpole-validators.mjs` | Flagpole needs Win condition (error) + flagpole past the level width (warn). |
| `smb-block-validators.mjs` | A ? block set to a power-up while Power-ups is off → warn (engine falls back to a coin). |
| `sprites-per-scanline.mjs` | The 8-sprites-per-scanline validator (256px window so scrolling levels don't false-positive). |
| `win-reach-tile.mjs` | Reaching a TRIGGER tile fires the win + freezes the player (stops early vs the no-trigger edge-clamp control). |
| `pickup-collect.mjs` | Walking into a ROLE_PICKUP sprite collects it (parks off-screen); a Pickups-off control confirms no false collection. |
| `preview-capture.mjs` | The shared `NesEmulator.stepPreviewFrames` renders a non-blank, deterministic gallery preview (bug #25). |
| `gallery-auth.mjs` | Route-level gallery/feedback authorization matrix (owner/teacher/anon → 200/401/403). |
| `csrf-origin.mjs` | The CSRF Origin check blocks cross-site state-changes on cookie-authed routes; exempts `/play` + no-Origin clients. |

## ASM-engine equivalence suites (`asm-*.mjs`)

The shipped engine now runs several subsystems as **hand-written 6502** (see
`docs/plans/current/2026-07-06-asm-engine-generator.md`). The ASM ROM is
*deliberately not* byte-identical to the pure-C ROM, so the byte-golden baseline
(invariant 2 below) can't guard it. These suites do instead — each dual-builds a
project **two ways** (pure C via `PLAYGROUND_NO_ASM=1` vs the shipped ASM) and
asserts the two are behaviourally identical.

| Suite | What it dual-builds + compares |
| --- | --- |
| `asm-ab.mjs` | Stock fixture, built directly with `make` (C) vs `make NES_ASM_LEAF=1 NES_ASM_SCROLL=1`. Walks RIGHT then LEFT (both scroll directions), an in-place JUMP (world_to_screen_y + gravity), and into the RIGHT world edge (camera clamp) — identical at matched progress each time. |
| `asm-corpus.mjs` | 14 project *shapes* (platformer/topdown/smb/racer/runner × world sizes incl. WORLD_COLS=96, four-screen, multi-enemy, all-modules) compared **at rest** (OAM+palette+nametables). |
| `asm-vscroll.mjs` | Open top-down worlds walked DOWN (1x3) and DOWN+RIGHT (2x2) — the row streamer, `world_to_screen_y`, both streamers at once, the PPU vertical wrap (cam_y > 240) and the bottom-edge camera clamp. |
| `asm-enemy.mjs` | The hot `behaviour_at`/`reaction_for` path under 300 frames of walker MOTION in a 1x1 (non-scrolling) world. |
| `asm-benchmark.mjs` | Size (CODE segment via `ld65 -m`) and speed (dropped frames over a standard scroll): asserts ASM ≤ C on both (a perf/size-regression guard). |
| `asm-play.mjs` | Older raw-6502 `/play` smoke (the `customMainAsm` single-player starter) — unrelated to the generator; just keeps that assemble+link path alive. |

**Two methodology facts these encode — read before touching them:**

1. **Matched *progress*, not matched vblank.** The C engine overruns the NTSC
   vblank budget on a stream burst and drops a frame; the ASM holds 60fps. So at
   the *same absolute frame* the C build is physically behind. The correct
   equivalence lens is to advance each build until a mirrored progress variable
   (px / py) reaches the **same value**, then compare — never to compare at the
   same frame count. `asm-benchmark` measures exactly that gap (C needs ~5 more
   vblanks to reach px=184).
2. **Constant phase offset ⇒ align once.** Even a non-scrolling world's one-screen
   boot blit finishes a frame sooner on the faster ASM, leaving the two builds a
   *constant* phase apart forever. Where there's no scroll (so the offset never
   grows — `asm-enemy`), inject a per-frame tick counter and step only the lagging
   build until the counters match; after that they run in lockstep and OAM can be
   compared frame-by-frame. To read a build's internal state, inject a scratch-RAM
   mirror of `px`/`py`/`cam_x`/`cam_y` into `customMainC` (it works for both builds
   because those stay C globals the ASM shares).

`asm-ab` and `asm-benchmark` build the stock fixture directly with `make` (no
server); the server-based suites use ports in the 18788–18791 band plus
18895–18897 (asm-play: 18835).  The 18895+ numbers are where the old **18790**
overlap with the Studio E2E server was moved to — see
[`docs/guides/TEST-SERVERS.md`](../../docs/guides/TEST-SERVERS.md).
Like every suite they're picked up automatically by `run-all.mjs`.

## The invariants `run-all.mjs` enforces

1. **JS / Python syntax** — every module + every inline
   `<script>` block in builder.html / sprites.html / index.html /
   behaviour.html / code.html + playground_server.py must parse
   cleanly. The module list is **enumerated from disk at runtime**
   (`*.js` minus vendored `*.min.js`), not hand-written: it used to be a
   list of 14 filenames with a silent `existsSync → continue`, and on
   2026-08-07 that meant 18 of the 32 shipped modules were unchecked —
   including *every* Studio mode module. Adding a file now covers it
   automatically; renaming one cannot silently drop it.
2. **Byte-identical baseline** —
   `steps/Step_Playground/src/main.c` compiles to a baseline
   ROM hash.  After swapping in the Builder's
   `builder-templates/platformer.c` (no modules ticked), the
   resulting ROM must have the same sha1sum.  Guards the
   "Builder additions are strictly gated behind `#if`" rule
   that protects every existing pupil project.
3. **Engine version constants agree** — `tools/engines/ENGINE_VERSION` and
   `tools/tile_editor_web/engine-version.js` must hold the same integer.
4. **Engine snapshot matches HEAD** — `scripts/snapshot-engine.mjs --check`.
5. **No suite claims the Studio E2E port** — added 2026-08-06; reads the port
   out of `playwright.config.js` and fails if any `.mjs` here names it.
6. **Every suite passes.**

Anything less and the Builder release should not ship.

## These gates have been watched failing (2026-08-06 → 2026-08-12)

A check nobody has seen fail is decoration. Each of the above was deliberately
broken, confirmed red, and restored. Recorded so the next person does not have to
repeat it — and so the one **limitation** found is not rediscovered the hard way.

| Mutation | Gate | Result |
| -------- | ---- | ------ |
| Put `asm-corpus.mjs` back on 18790 | E2E-port guard | ✅ FAIL, naming the file and suggesting a free port |
| `ENGINE_VERSION` 78 → 79 | version constants agree | ✅ FAIL — `ENGINE_VERSION (79) != engine-version.js (78)` |
| (same mutation) | snapshot matches HEAD | ✅ FAIL — `No snapshot for v79` |
| Corrupt a recorded sha1 in `v78/manifest.json` | snapshot matches HEAD | ✅ FAIL — `DRIFT (vs HEAD): …/builder-modules.js` |
| Append a line to the *snapshot copy* of `builder-modules.js` | snapshot matches HEAD | ⚠️ **PASSED — did not detect it** |
| Call `startServer(8765)` while the dev server holds it | harness `startServer` pre-flight (added 2026-08-07) | ✅ FAIL in ~90 ms, explaining that a playground server would *not* have failed here |
| Call `startServer` on a free port | (positive control for the above) | ✅ ready in ~340 ms, child alive, banner confirmed |
| Break the syntax of `studio-world.js` | JS syntax check (runtime-enumerated, 2026-08-07) | ✅ FAIL — and it would **not** have been caught by the old hand-written list |
| Point the suite enumeration at an extension matching nothing | suite list non-empty (added 2026-08-12) | ✅ FAIL — before it, 0 suites ran and the runner still printed "✅ All Builder regression checks pass" |
| `mv steps/Step_Playground/src/asm_macros.inc` aside | snapshot matches HEAD | ✅ FAIL — `MISSING (in the v78 snapshot, not in the engine any more)`. **Before 2026-08-12 this PASSED**, green, "(30 files)" |
| Corrupt a recorded sha1 (re-run after the above fix) | snapshot matches HEAD | ✅ FAIL — `DRIFT (vs HEAD)`, confirming the pre-existing direction still works |
| `BUILDER_GUIDE.md` claims 19 modules, code has 18 | guide module accounting (added 2026-08-12) | ✅ FAIL, naming both numbers and listing all 18 real modules |
| Rename a tabled module to `ghostmodule` (count still 8) | guide module accounting | ✅ FAIL, naming the phantom — proves the row check fires independently of the count check |
| Rewrite 26 `modules['x']` → `modules["x"]` (valid JS) | guide module accounting | ✅ FAIL — "the declaration form changed, and this check cannot see anything" |
| Make `stopServer`'s child ignore every signal | harness `stopServer` (2026-08-12) | ✅ throws after 4067 ms, naming the pid, matching the 3s+1s budget |
| Hand `stopServer` an already-dead child | (positive control for the above) | ✅ returns quietly, and never signals it |

The `startServer` pair is listed because **the first version of that guard was
wrong and the positive control is what caught it.** It polled `/health` after
spawning and allowed the child 150 ms to have died; against the dev server on 8765
it reported success, because Python had not finished starting up, let alone
surrendered the port. It now pre-checks the port *before* spawning and waits for
the child's own `listening on` banner rather than for the port to answer — a
stranger's server answers just as well.

**The limitation, stated plainly.** `--check` compares the **committed (HEAD)**
bytes of each live source against the sha1s recorded in `manifest.json`. It
therefore cannot see (a) edits to the snapshot *copies* under `tools/engines/vN/`,
or (b) any uncommitted working-tree change at all. This is deliberate — reading
from HEAD is what makes the check deterministic — but it means **a green snapshot
check does not mean your working tree is clean**. Commit first, then trust it.

There used to be a third blind spot, and it is worth knowing it was there:
**a deleted or renamed engine file was invisible.** The check walked the live
files and looked each up in the manifest, so it saw changes and additions but
never a disappearance — that file is not in the live enumeration, so the loop
never visited it. Fixed 2026-08-12; the row in the table above records what it
did before. The lesson generalises past this file: **watching a gate fail proves
it can fail, not that it covers the ground you think.** This gate *had* been
watched failing, at the one thing it checked.

**Does everything on disk actually run?** Both runners enumerate at runtime, so
this should be true by construction — verified end-to-end on 2026-08-12 anyway,
because "should be" is how coverage gaps survive. 34/34 spec files and 114/114
suites, nothing skipped. To re-check, compare a run's output against the
directory:

```bash
# builder — every .mjs except the runner should appear as a "suite … OK" line
diff <(node tools/builder-tests/run-all.mjs | grep -oE '^suite [^ ]+' | sed 's/^suite //' | sort -u) \
     <(ls tools/builder-tests/*.mjs | xargs -n1 basename | grep -v '^run-all.mjs$' | sort)
```

Playwright needs no equivalent guard: it exits **1** with "No tests found" when
nothing matches, so an empty run cannot be mistaken for a passing one (checked
both `--list` and a real run).

## A suite that records bugs rather than asserting they are gone

`tall-level-entities.mjs` is the only suite of this shape, and the shape is worth
knowing before you write a second one.

It measures what an entity in the **lower half of an ordinary single-room 1×2
level** actually does — a configuration a pupil reaches just by making their level
taller — and finds two holes with two different boundaries: a chaser or flyer at
`y >= 239` never runs its AI, and an enemy at `y >= 240` cannot damage the player
at all. Both look entirely normal on screen. #14 Step 3 fixes them; until it does,
the suite records them **exactly**, as a `KNOWN_HOLES` map.

Exact means both directions, and the second is the one people leave out:

- a `y` that stops working and is **not** listed fails the suite — a regression;
- a listed `y` that **starts** working *also* fails it — the list is stale.

Without the second, the list quietly becomes permanent and the suite ends up
enforcing the bugs. So when Step 3 lands this suite goes red until `KNOWN_HOLES` is
emptied, and that is the intended way to find out the fix worked. There is a third
check too: an entry the run never scores fails as unreachable, because an entry
protecting nothing is worse than no entry.

**Use this shape only when the bug is real, understood, and scheduled.** For
anything else, a suite that records a bug is a suite that tolerates it.

**The positive control is load-bearing here and is not optional.** Every case is
"did the player get hurt / did the enemy move", so the quiet way to pass is a
fixture in which nothing could ever happen — and then every hole "confirms". Two
earlier versions of this measurement failed exactly that way: once the player and
the probe sat at different `x` and never overlapped, once the player's spawn `y`
turned out to be clamped to 200 however high it was set. Both produced a clean "no
damage" that meant nothing. The control at `y=150` must come out *working*, and is
checked before any hole is believed.

Watched failing in all four directions on 2026-09-01, against the suite as it
actually stands: widening the damage guard produced `NEW HOLE`; removing it
produced `STALE ENTRY`; moving the probe out of the player's column produced the
control failure; a `KNOWN_HOLES` key outside `PROBE_YS` produced the unreachable
error. Restored and green after each.

> The first version put both probes in one build and the meta-test caught it: where
> the chaser's AI still runs, the chaser reaches the player and damages them
> itself, so `damage=yes` did not mean the *static* enemy had done anything. One
> probe per build now. That is the whole argument for meta-testing a gate against
> the version you are shipping rather than the one you started with.

## Re-proving the gates: `mutations/*.json`

The table above is a *record* of gates that were broken by hand. Most of those breaks
are now **executable**, so the next person does not have to trust the record — they
can re-run it. There are four specs, and **which one your break belongs in is decided
by what it expects, not by taste**:

```bash
# fast (~1 min): every break whose expected assertion is a check or invariant,
# i.e. decided before the first suite spawns. Runs with RUNALL_CHECKS_ONLY=1.
mutate tools/builder-tests/mutations/gates-checks.json

# slow (~11 min per run): breaks whose expected assertion is a `suite X` line
# and therefore need the suites to actually run. Runs with RUNALL_SUITES_ONLY=1.
mutate tools/builder-tests/mutations/gates.json

# the two golden ROM hashes (real cc65 builds).
mutate tools/builder-tests/mutations/golden-rom.json

# the Studio E2E suite, via its own adapter (~5 min per break).
mutate tools/studio-tests/mutations-e2e.json

mutate <spec> --list      # what a spec claims, without running anything
```

Counts are deliberately not written here. They were, and went stale the same week.
`--list` prints them and cannot be wrong.

**Why the builder specs are split.** A full `run-all.mjs` is ~11 minutes, so proving
a dozen check-level gates through it costs an afternoon, and a gate that expensive to
verify does not get verified. `RUNALL_CHECKS_ONLY=1` skips the suites — seconds
instead of minutes — and every gate decided before the first suite spawns can be
proved that way. Measured before the split: the seven breaks then in `gates.json`
cost about 80 minutes, and the six of them that were check-level now cost about four.

**The split enforces itself, in both directions.** `gates-checks.json` runs under
`RUNALL_CHECKS_ONLY=1`, so its baseline holds only check and invariant names;
`gates.json` runs under `RUNALL_SUITES_ONLY=1`, so its baseline holds only `suite X`
names. `mutate` refuses a break whose `expect` names an assertion the baseline does
not have — and refuses it *before* editing anything — so a break filed into the wrong
spec fails loudly with *"names an assertion the suite does not have"* instead of
passing quietly. That is why `RUNALL_SUITES_ONLY` exists: without it the full run
prints both kinds of name, and the split would be enforced by nothing but this
paragraph. Proved in both directions on 2026-08-26 rather than assumed.

Both modes are silent-success hazards and are built as such: each announces itself,
neither prints the green headline, and each closing line states what did **not** run
(*0 of N suites*, or *0 of N checks and invariants*). If you ever see one of those
sentences in something reported as a full pass, it is not one. Setting both at once
runs nothing at all, so `run-all.mjs` refuses it and exits 2.

Run them **alone** — they edit source in place, so anything else reading the tree at
the same time is reading deliberately broken code — and restart the dev server on
8765 afterwards, because restoring a file moves its mtime.

### Writing a break that actually proves something

Five traps, each of which produced a wrong conclusion here before it was understood:

- **An anchor that quotes a version number dies at the next bump — and takes the
  whole spec with it.** mutate refuses a spec whose anchor no longer matches, so one
  stale break disables every break beside it. Three of `gates.json`'s seven quoted
  `78`; v79 shipped on 2026-08-20 and from that moment the builder gates could not be
  proved at all, with nothing saying so until someone tried on the 26th. Two were
  rewritten to be version-agnostic — anchor on `global.NES_ENGINE_VERSION = ` and
  prefix a digit, rather than quoting the digits. The third cannot be: the snapshot
  check derives its directory from `ENGINE_VERSION`, so the manifest path must name
  the current version to mean anything, and `invariant: mutation specs name the
  current engine snapshot` now enumerates every spec's `breaks[].file` and fails the
  9-second run if one has fallen behind.
- **The anchor must match exactly once.** mutate refuses zero or many, because a
  break landing in more places than it claims makes a red assertion evidence about
  something other than the guard named. Check with `grep -Fc` *on the exact string
  you are going to use* — checking one spelling and then pasting another out of
  grep's output has happened.
- **An existence clause can only be probed where the thing exists once.** The OAM DMA
  check requires its pattern once per template, and `platformer.c` contains it twice:
  breaking one site leaves the other matching and proves nothing. `main.c` has one, so
  the break lives there. Same for the game-over tint's positive half, which is why
  only its *negative* clause has a break.
- **Do not break compilation.** The golden ROM builds run even under
  `RUNALL_CHECKS_ONLY`, so a template that no longer compiles reddens the goldens and
  tells you nothing about the guard under test. Prefer a change that compiles and is
  behaviour-identical — swapping `BEHAVIOUR_LADDER` for its literal `6`, or adding a
  `continue;` as the last statement of a loop body.
- **"Nothing caught this" is ambiguous.** It means the guard is hollow *or* your break
  was a no-op, and the output cannot tell you which. Four times here it was the break.
  Before reporting a hollow guard, run the guard's own pattern against the before and
  after text and confirm it changed.

Each break names the assertion it expects to turn red, and the run fails if that
assertion stays green, if nothing anywhere goes red, if the anchor matched zero times
or more than once, if the baseline was not green first, or if a file does not come
back byte-identical. A break that genuinely should not be caught is allowed but must
carry `expect_none_because` — `gates-checks.json` uses that for the one real
limitation, the snapshot check's blindness to edits of its own frozen copies.

**`mutate-report.sh` is why this works at all.** `mutate` parses unittest output and
bash `PASS name` / `FAIL name`; `run-all.mjs` prints `<label> ... OK`, and **not one
of its lines matches** (measured, by testing the regexes against real output rather
than reading them). The adapter re-reports results in the form mutate understands,
prefixes the raw output with `| ` so a suite's own `FAIL: message` cannot be mistaken
for a result line, and exits with the runner's status rather than the pipeline's.

**Two traps, both paid for here:**

- **`: ` is rewritten to ` - ` in emitted names.** mutate's FAIL regex stops at the
  first colon, so `invariant: X` is recorded as `invariant` when red but by its full
  name when green — `expect` could never match. Applied to PASS and FAIL alike;
  rewriting one side would leave the spellings disagreeing, which is the bug rather
  than the fix. The cost: a spec names something `run-all.mjs` does not literally
  print.
- **Verify by hand that a break changes the output before trusting it.** Two golden
  anchors did not, and each produced "nothing anywhere caught this" — output
  identical to a hollow guard. `#define DEADZONE_LEFT` is dead in its translation
  unit (`scroll.c` takes `scroll.h`'s own default), and one `jmp_up` site sits inside
  `#if BW_GAME_STYLE == 2 && PLAYER2_ENABLED`, stripped from a no-modules build — a
  break landing in precisely the code that invariant exists to strip. **"Stayed
  green" cannot tell you which of the two you have.** Both dead ends are recorded in
  `golden-rom.json`'s `anchor_note`, because they are the most natural anchors in
  those files.

## Adding a new test

Drop a new `.mjs` file in this directory.  Expected shape: spawn
a server on a fresh port, POST `/play` payloads with the
scenarios you care about, assert on the response + any emitted
strings, exit 0 / non-0.  The runner picks it up automatically
— no registration needed.
