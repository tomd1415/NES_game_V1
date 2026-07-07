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

## What each suite covers

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

Each suite spawns its own throwaway Playground Server on a unique
port (18768–18776 for the original suites, 18820–18823 for the
render suites) and exits 0 on success, non-zero on first failed
assertion.  The runner runs them one at a time, so ports never
collide.

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
server); the server-based suites use ports 18790–18795 (asm-play: 18835). Like
every suite they're picked up automatically by `run-all.mjs`.

## The invariants `run-all.mjs` enforces

1. **JS / Python syntax** — every module + every inline
   `<script>` block in builder.html / sprites.html / index.html /
   behaviour.html / code.html + playground_server.py must parse
   cleanly.
2. **Byte-identical baseline** —
   `steps/Step_Playground/src/main.c` compiles to a baseline
   ROM hash.  After swapping in the Builder's
   `builder-templates/platformer.c` (no modules ticked), the
   resulting ROM must have the same sha1sum.  Guards the
   "Builder additions are strictly gated behind `#if`" rule
   that protects every existing pupil project.
3. **Every suite passes.**

Anything less and the Builder release should not ship.

## Adding a new test

Drop a new `.mjs` file in this directory.  Expected shape: spawn
a server on a fresh port, POST `/play` payloads with the
scenarios you care about, assert on the response + any emitted
strings, exit 0 / non-0.  The runner picks it up automatically
— no registration needed.
