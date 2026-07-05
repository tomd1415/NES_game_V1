# First working tutorial — MVP implementation plan

**Started:** 2026-07-05 · **Branch:** `feature/smb-engine`
**Design:** [`docs/design/quest-tutorials.md`](../../design/quest-tutorials.md)
(manifest + declarative checks + teacher toggles + easy editing).

## Goal

A **real, wired-into-Studio** tutorial that walks a pupil from a ready-made
game to a playable one they tweaked themselves — one **light edit per Studio
section**, ending in Play. Tilesets ship **complete and ready** (no drawing from
scratch). Steps are data, easy to add / reorder / remove.

## Approach (additive, low-risk)

Reuse the existing **`basics` starter** (`studio-starter.js:create`) — it already
ships a complete drawn tileset (ground/brick/ladder/door + a hero + enemies) and
is a working platformer. The tutorial guides light edits on top of it.

### Pieces

1. **`tutorial-first-game.js`** (new) — the manifest: `window.STUDIO_TUTORIALS`,
   a flat, id-keyed step array. Each step: `{id, chapter, mode, title,
   instruction, why, hint, finishedEnough, check:{type,params}}`. Editing steps =
   editing this array; nothing references step position.
2. **`studio-tutorial.js`** (new) — `window.StudioTutorial` runtime: renders the
   current step into the panel, dispatches declarative checks against
   `Studio.getState()`, advances on pass (persisting `state.tutorial.step`),
   `Show me` (→ `ctx.selectMode(step.mode)`), `Hint`, silent celebration.
3. **Tutorial starter** — `createTutorial(opts)` + a `list()` entry in
   `studio-starter.js`. Returns the `basics` state plus
   `state.tutorial = {active:true, step:0, base:{…}}` where `base` snapshots the
   small scalars/hashes the checks diff against (player name, palette hash, tile
   hash, solid-ground count, builder-module hash).
4. **Panel** — a collapsible **5th grid column** (`--tutorial-w`, 0 when off) with
   `<aside class="tutorial-region">`, reusing the `.attn-item` card CSS. Shown
   only while a tutorial is active (`.studio-main.tutorial-on`).
5. **Launch** — `#btn-tutorial` header button → `makeStarter('tutorial')`; the
   starter also appears in the New-game picker automatically. On load, if
   `state.tutorial.active`, `studio.js` calls `StudioTutorial.start(ctx)`.
6. **Progress** — per-project in `state.tutorial.step` (persists via `saveCurrent`,
   survives reload + export).

### Declarative checks (registry in studio-tutorial.js)

`spriteRenamed` (player name ≠ base), `paletteChanged` (palette hash ≠ base),
`tileChanged` (tile-pool hash ≠ base), `groundAdded` (solid-ground count >
base + N), `builderChanged` (module hash ≠ base — a Rules/Style edit), `played`
(a one-shot listener on `#btn-play`). All read the live state; none require the
pupil to match an exact target — any light edit passes.

### Steps (First Game)

| # | Section | Light edit | Check |
|---|---|---|---|
| 1 | Chars | Give your hero a name | `spriteRenamed` |
| 2 | Pals | Change a colour | `paletteChanged` |
| 3 | Tiles | Draw on a tile | `tileChanged` |
| 4 | World | Paint a bit more ground | `groundAdded` (+3) |
| 5 | Rules | Change how it plays (jump/speed) | `builderChanged` |
| 6 | Play | Press ▶ and watch it | `played` |

Each step has a `finishedEnough` line and a hint.

## Testing

- `tools/studio-tests/tutorial.spec.js` — boot → launch tutorial → for each step,
  perform the edit via `Studio.getState()` mutation + `Studio.ctx.markDirty()`
  (or the real dock controls), click **Check my work**, assert the panel advances;
  finally assert completion.
- Full Studio E2E (`npx playwright test`) + builder suite must stay green
  (changes are additive; the panel is hidden unless a tutorial is active).

## Out of scope for the MVP (design captured, not built)

Pair variant, teacher toggles UI, in-Studio step editor, audio narration,
the other four game-style tutorials. The manifest + check registry are shaped so
these slot in later without rework.
