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

Each suite spawns its own throwaway Playground Server on a unique
port (18768–18776 range) and exits 0 on success, non-zero on
first failed assertion.

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
