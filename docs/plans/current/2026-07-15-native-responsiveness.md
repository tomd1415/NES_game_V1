# Native responsiveness — the work after the follow-through

**Status: Phase 1 done; Phase 2 deferred (documented trigger).** Successor to
[`2026-07-15-native-followthrough.md`](2026-07-15-native-followthrough.md).

**Result of Phase 1:** a 30-cell WORLD paint-drag went from **9.5 → 4.5 ms/cell**,
and the problem panel now rebuilds **once at stroke end** instead of 30 times
mid-drag (measured; four tests in `test_attention.py::StrokeBatchingTests` assert
the shape). No QWidget is created or destroyed mid-drag any more.

**Phase 2 not started, deliberately.** After Phase 1 the remaining 4.5 ms/cell is
almost entirely `redraw()` — so on paper redraw now "dominates". But 4.5 ms is
comfortably inside the 16.7 ms frame budget on real hardware here, and incremental
blitting is the risky change described below. Its trigger — *per-cell cost over
budget on the target school hardware* — cannot be measured without that hardware,
so starting it now would be trading a real correctness risk for an unmeasured
gain. Left with the trigger written down, to be picked up if a slow machine
actually stutters.

The pixel-drag bug (fixed in `a81e337`) was instructive beyond itself: the offscreen
test harness dispatches events straight to a handler, so it cannot see cost or
grab behaviour on a real display. The bug's shape — **heavy work on every
mouse-move** — is a family, and the pixel grid was only one member. This plan is
about the rest of that family, found by measuring, not guessing.

## What was measured

On this (fast) machine, a 30-cell WORLD paint-drag costs **9.5 ms per cell**.
Every cell of a single stroke runs, synchronously between mouse-move events:

| Per cell | Cost | Needed mid-drag? |
| --- | --- | --- |
| `redraw()` — re-render the whole 256×240 nametable | 4.3 ms | **Yes** — it is the live paint feedback |
| `attention.refresh()` — run all ~30 validators, then tear down and rebuild the problem panel's widgets | 4.5 ms | **No** — nobody reads the problem list between two cells of one stroke |
| `tutorial.check()` | ~0 ms | No |
| document serialize for the undo snapshot | ~6 ms *(already suspended during a stroke — the macro defers it)* | No |

A 16.7 ms frame is one refresh at 60 Hz. At 9.5 ms/cell on this box, a machine
3–4× slower already drops frames, and the wasted half is worse than slow: it
**tears down and rebuilds QWidgets on every mouse-move**, which is the same class
of mid-drag widget churn that dropped the grab in the pixel editor.

## Phase 1 — batch the expensive work to stroke end

The stroke boundaries already exist: `ModeContext.begin_stroke()` / `end_stroke()`
wrap the undo macro, and every canvas (WORLD, CHARS, TILES) routes its
press→move→release through them. The undo system already uses those boundaries to
group a drag into one step; the expensive document-level work should use the same
boundary to run **once**, at the end.

- Route `begin_stroke`/`end_stroke` through `MainWindow`, which keeps a stroke
  depth alongside the store's macro.
- `document_edited()` runs `attention.refresh()` and `tutorial.check()` immediately
  only when no stroke is active. During a stroke it defers them.
- `end_stroke()`, when the depth returns to zero, runs them once.
- The cheap, live parts stay per-cell: the canvas `redraw()` (feedback) and the
  window-title dirty marker.

This aligns the expensive refresh with the undo grouping — the same boundary, one
concept — and removes the per-cell widget churn. Single clicks are already wrapped
in a stroke (press emits `stroke_began`, release `stroke_ended`), so a click
batches and flushes exactly once; nothing regresses for non-drag edits, which run
outside a stroke and refresh immediately as before.

**Expected:** ~9.5 → ~5 ms/cell, and no QWidget is created or destroyed mid-drag.

**Tests.** Assert the shape, not a wall-clock number (which is machine-dependent
and flaky): during a stroke the attention panel does **not** rebuild, and on
stroke end it rebuilds exactly once and shows the correct final problems. A drag
that introduces a palette conflict shows the conflict after release, not during.

## Phase 2 — only if Phase 1 leaves redraw dominating

`redraw()` re-renders the entire 256×240 screen when one cell changed. Incremental
blitting (re-render only the changed cell, or its 2×2 attribute quadrant for a
palette edit) would take it from 4.3 ms to ~0.1 ms. But it is genuinely more
error-prone — attribute conflicts span quadrants, a palette edit touches four
cells, the universal-backdrop change touches every cell — so it is **not** worth
the risk unless Phase 1 leaves the per-cell cost above budget on the target
hardware. Recorded as a deliberate deferral with a clear trigger, not started.

## Not doing

- Throttling `redraw()` (e.g. every Nth cell) — it would make the paint feedback
  stutter, which is worse than the cost it saves.
- Moving validators off-thread — they are 2.5 ms and pure-Python over plain dicts;
  the thread hand-off would cost more than it saves, and Phase 1 removes the
  per-cell calls entirely.
