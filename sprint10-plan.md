# Sprint 10 — Behaviour map (collision / trigger editor)

A new page that lets pupils paint **behaviour types** onto the
background grid — *solid ground*, *wall*, *platform*, *door*,
*invisible trigger*, plus a couple of user-defined slots — and
configure **how each sprite reacts** to each type. The editor emits
a data table and a small runtime into the pupil's project, with
signpost comments in the existing code so the pupil can see where
the collision check happens and extend it.

References:
- [index.html](tools/tile_editor_web/index.html) — Backgrounds page
  (nametable model we'll layer on top of).
- [sprites.html](tools/tile_editor_web/sprites.html) — Sprites page
  (source of truth for the sprite list the reaction matrix needs).
- [code.html](tools/tile_editor_web/code.html) — Code page (guided /
  advanced modes; signpost comments need to land in regions that the
  pupil can see).
- [playground_server.py](tools/playground_server.py) — build pipeline
  (new `collision.inc` / `collision.h` artifacts need to be written
  into `assets/` and referenced by `main.c`).

---

## Problem & goal

The Backgrounds page gives pupils a painted nametable
(`state.backgrounds[i].nametable[y][x] = { tile, palette }`) — it
looks like a level but the game engine has no idea which tiles are
floor, wall, or door. Today every pupil who wants collision has to
write the table by hand in C and keep it in sync with the art.

Goal: a second layer (same grid, same dimensions as the nametable)
where each cell carries a **behaviour type id**. The pupil paints
the layer with a small palette of type-brushes. A **reaction matrix**
(sprite × type) says what each sprite does when it touches each
type. The editor emits ready-to-include data + helper functions and
drops a `/* --- behaviour-map hook --- */` marker into `main.c` so
the pupil can see where it plugs in.

## Scope

- **In:** new Behaviour page, type palette (built-in + pupil-named
  slots), paint tools (pencil, fill, rect, select-same, clear),
  sprite reaction matrix, code-gen (`collision.inc`, `collision.h`,
  `behaviour.c`), main.c signposts, build-pipeline wiring, round-
  trip save/load, undo integration.
- **Out for this sprint:** per-screen triggers with scripted actions
  (we emit a hook function the pupil fills in — we don't script
  it); multi-layer behaviour (one type per tile for now); animated
  behaviour (e.g. moving platforms); pixel-perfect collision
  (tile-granularity only). All flagged in *Out of scope*.

---

## Page layout — `behaviour.html`

Header/nav identical to the other pages (Backgrounds / Sprites /
**Behaviour** / Code) so pupils find it. Three columns:

```
┌─────────────────────────────┬──────────────────────┐
│ Behaviour canvas            │ Type palette         │
│ (nametable overlay)         │  ▢ solid ground      │
│                             │  ▦ wall              │
│                             │  ▬ platform          │
│                             │  🚪 door             │
│                             │  ✦ trigger           │
│                             │  …(custom)           │
│                             ├──────────────────────┤
│                             │ Legend / tools       │
│                             │  Pencil / Fill /     │
│                             │  Rect / Select-same  │
│                             │  / Clear             │
├─────────────────────────────┴──────────────────────┤
│ Sprite reaction matrix (scrollable)                │
│        │ solid │ wall │ platform │ door │ trigger  │
│ player │ land  │ block│ land-top │ exit │ call     │
│ goomba │ land  │ turn │ ignore   │ …    │ call     │
│ …                                                  │
└────────────────────────────────────────────────────┘
```

- **Canvas**: reuses the Backgrounds nametable render (call
  `renderNametable()` on a `<canvas>`-based host) as a *dimmed*
  under-layer. On top we draw a **semi-transparent coloured overlay**
  per tile (colour taken from the type's palette). Grid overlay
  matches the existing "grid" pref. Click a tile to paint the
  currently-selected type; Shift-click to eyedrop; right-click to
  clear back to `none`. Selected type highlighted in the palette.

- **Type palette**: six built-in types (see below) plus **up to two
  pupil-named slots** (`custom1`, `custom2`). Each row shows:
  - swatch (colour that represents the overlay),
  - built-in name (editable for custom slots only),
  - tile count badge (how many cells on the current background use
    it — "125 tiles", updates live),
  - delete/reset (custom slots only).

- **Tools**: mirror Sprint 8's drawing-tools idiom — pencil, fill
  (4-connected, same-type flood), rect (fills outlined rect),
  select-same (Ctrl-A-ish — highlight every tile of the current
  type), clear (resets to `none`).

- **Reaction matrix**: a table. Rows are sprites from the existing
  `state.sprites`; columns are the types in their current order.
  Each cell is a **dropdown** of "reaction verbs" (see below). The
  pupil's choice is stored as a string id (e.g. `"land"`, `"block"`,
  `"ignore"`, `"call_handler"`). Verb picks drive the code emitter.

## Built-in types

| Id | Label           | Overlay colour | Default purpose |
|----|-----------------|-----------------|-----------------|
| 0  | `none`          | transparent     | no behaviour (default for every cell) |
| 1  | `solid_ground`  | `#8d6e4b`       | standable from any side |
| 2  | `wall`          | `#555`          | blocks horizontal |
| 3  | `platform`      | `#6aa3ff`       | standable from above only, passable below |
| 4  | `door`          | `#ffd866`       | triggers a scene/screen change |
| 5  | `trigger`       | `#ff78a2`       | invisible; fires the pupil's custom hook |

Plus `custom1` / `custom2`: pupil-named, colour picked from the NES
palette (reuses the master-grid DnD from Sprint 8).

## Reaction verbs

Small, fixed vocabulary the emitter understands. Each verb is a
generated function + a comment explaining what it does. Pupil
never has to learn them unless they want to extend.

- `ignore` — collision skipped. No code emitted.
- `block` — stop the sprite at the tile edge on the axis of motion.
- `land` — like `block` but only when the sprite is moving *into*
  the tile from outside; used for floors / ceilings.
- `land_top` — land only when moving downward onto the top edge
  (pass-through platforms).
- `bounce` — reverse the sprite's velocity on the axis of motion
  (for enemies that turn around at walls).
- `exit` — call `on_door(sprite_id, tile_x, tile_y)`; the pupil
  fills in the body (scene change, fade, etc.).
- `call_handler` — call `on_trigger(sprite_id, tile_x, tile_y,
  type_id)`; generic hook for everything else.

## Reaction matrix defaults

Seed new sprites with sensible defaults so pupils aren't staring at
a grid of `ignore`:

- Player-role sprite (if exactly one sprite has `role === 'hero'`
  in existing state — verify this field exists; otherwise, first
  sprite): `solid_ground=land`, `wall=block`, `platform=land_top`,
  `door=exit`, `trigger=call_handler`.
- Every other sprite: `solid_ground=land`, `wall=bounce`,
  `platform=ignore`, `door=ignore`, `trigger=call_handler`.
- Custom slots default to `ignore` everywhere.

---

## State model

Extend `createDefaultState()` and bump `STATE_VERSION` from 1 to 2.
Add `migrateState` branch that fills the new fields on v1 projects.

```js
// Per-background, parallel to `nametable`. One byte (0..7) per tile.
// Same dimensions: SCREEN_H*screens_y rows × SCREEN_W*screens_x cols.
bg.behaviour = [[0, 0, …], …];   // 0 = none, 1..5 = built-in, 6..7 = custom

// Project-wide. Custom type definitions.
state.behaviour_types = [
  { id: 1, name: 'solid_ground', colour: '#8d6e4b', builtin: true  },
  …
  { id: 6, name: 'ladder',       colour: '#ac6f2e', builtin: false },
];

// Sprite × type reaction map. spriteIdx is the position in
// state.sprites; reactions[spriteIdx] is a dict keyed by type id.
state.behaviour_reactions = [
  { 1: 'land', 2: 'block', 3: 'land_top', 4: 'exit', 5: 'call_handler', 6: 'ignore', 7: 'ignore' },
  …
];
```

Migration (`v1 → v2`):
- For every bg, fill `bg.behaviour` with zeros matching nametable dims.
- Create `state.behaviour_types` with the six built-ins (no customs).
- Create `state.behaviour_reactions` with defaults for every sprite.

Resize semantics mirror nametable: when the pupil grows a background
(add screens), pad `bg.behaviour` with zeros; when they shrink, crop.
Reuse `resizeNametable`'s clamp logic — extract a shared helper
`resizeGrid(grid, newCols, newRows, fill)`.

---

## Paint tools (Behaviour page)

Pupil-facing: same toolbar idiom as Sprint 8 so they don't learn a
new UI.

- **Pencil**: single tile.
- **Fill**: 4-connected flood — replace every tile of the starting
  type with the currently-selected type.
- **Rect**: outlined rect (filled rect feels dangerous here; add
  a Shift modifier to make it filled, matching drawing tools
  convention).
- **Select-same**: pick a tile → highlight every tile of that type
  on the screen (not a marquee; a read-only overlay). Useful for
  counting and for spotting stragglers.
- **Clear**: set to `none`.

Each commits a `pushUndo()` like the sprite tools do.

Keyboard (scoped to this page):
- `1..6` — pick built-in types in palette order.
- `0` — pick `none`.
- `Shift+1` / `Shift+2` — pick custom slots.
- `P` pencil / `F` fill / `R` rect / `Shift+S` select-same / `X` clear.
- Arrow keys + Enter — tile-at-a-time painting, keyboard-only (matches
  the backgrounds-page accessibility pattern we already have).

---

## Sprite reaction matrix UI

- One row per sprite, one column per non-`none` type.
- Each cell is a `<select>` populated with the reaction verbs.
- Palette edits (rename, colour change, add custom) re-render the
  header.
- Deleting a type removes that column and drops the matching keys
  from each sprite's reaction map; undo restores both.
- "Reset to defaults" button per sprite row (small ↺ icon). No
  global reset — too destructive for pupils.

The matrix is the code emitter's only consumer — editing a cell
marks the project dirty, the code emitter picks the new state up
next save.

---

## Code emission

Three artifacts, all under `assets/behaviour/` in the playground
project (new folder; playground_server creates it if missing):

### 1. `behaviour_map.inc` (ca65 asm data)

```
; AUTO-GENERATED by the Behaviour editor — do not hand-edit.
; Grid is row-major, one byte per tile. 0 = none, 1..n = types.
.export _behaviour_map, _behaviour_map_cols, _behaviour_map_rows

_behaviour_map_cols: .byte 64   ; screens_x * 32
_behaviour_map_rows: .byte 30   ; screens_y * 30
_behaviour_map:
  .byte 0,0,0,0,…            ; one row per line, 16 per line for readability
  …
```

Binary size: one byte per tile. A 2×1 background is 1920 bytes
(fits comfortably in a ROM data segment).

### 2. `collision.h` (C header the pupil includes)

```
/* AUTO-GENERATED — edit with the Behaviour page, not by hand. */
#pragma once
#include <stdint.h>

enum behaviour_type {
  BEHAVIOUR_NONE          = 0,
  BEHAVIOUR_SOLID_GROUND  = 1,
  BEHAVIOUR_WALL          = 2,
  BEHAVIOUR_PLATFORM      = 3,
  BEHAVIOUR_DOOR          = 4,
  BEHAVIOUR_TRIGGER       = 5,
  BEHAVIOUR_LADDER        = 6,   /* custom — pupil-named */
};

/* Reaction constants from the matrix. */
enum reaction {
  REACT_IGNORE = 0, REACT_BLOCK, REACT_LAND, REACT_LAND_TOP,
  REACT_BOUNCE, REACT_EXIT, REACT_CALL,
};

/* Tile-granularity collision probe. Returns the behaviour at the
   tile that contains (x, y) in world-pixel space. */
uint8_t behaviour_at(uint16_t world_x, uint16_t world_y);

/* Per-sprite reaction lookup. spriteId is the index in your
   sprites list (same order as the Sprites page). */
uint8_t reaction_for(uint8_t sprite_id, uint8_t behaviour);

/* Hooks — YOU implement these in user_game.c. */
void on_door    (uint8_t sprite_id, uint8_t tx, uint8_t ty);
void on_trigger (uint8_t sprite_id, uint8_t tx, uint8_t ty,
                 uint8_t behaviour);
```

### 3. `behaviour.c` (C runtime the pupil doesn't touch)

```
/* AUTO-GENERATED — edit with the Behaviour page, not by hand. */
#include "collision.h"

extern const uint8_t _behaviour_map[];
extern const uint8_t _behaviour_map_cols;
extern const uint8_t _behaviour_map_rows;

/* reaction_table[sprite_id][type] = REACT_* */
static const uint8_t reaction_table[/*N*/][8] = {
  { 0, 2, 1, 3, 5, 6, 0, 0 },   /* player */
  { 0, 2, 4, 0, 0, 6, 0, 0 },   /* goomba */
  …
};

uint8_t behaviour_at(uint16_t world_x, uint16_t world_y) {
  uint16_t tx = world_x >> 3;
  uint16_t ty = world_y >> 3;
  if (tx >= _behaviour_map_cols) return BEHAVIOUR_NONE;
  if (ty >= _behaviour_map_rows) return BEHAVIOUR_NONE;
  return _behaviour_map[ty * _behaviour_map_cols + tx];
}

uint8_t reaction_for(uint8_t sprite_id, uint8_t behaviour) {
  return reaction_table[sprite_id][behaviour];
}
```

### `main.c` signpost

The emitter rewrites a well-known region marked by comment
delimiters so pupils know where the glue lives. If the markers are
absent (e.g. a pupil deleted them), the emitter *appends* at the
top of `main.c` with a warning toast ("couldn't find the
behaviour-map hook — added a new one, please check").

```
/* --- behaviour-map hook -------------------------------------- *
 * Generated by the Behaviour page. Your collision table lives   *
 * in behaviour.c + behaviour_map.inc. To change the map, open   *
 * the Behaviour page. To customise reactions, use that page too.*
 * Fill in on_door() and on_trigger() here or in a new file.     *
 * ---------------------------------------------------------- */

#include "collision.h"

void on_door(uint8_t sprite_id, uint8_t tx, uint8_t ty) {
  /* Your code goes here. */
}

void on_trigger(uint8_t sprite_id, uint8_t tx, uint8_t ty, uint8_t behaviour) {
  /* Your code goes here. */
}

/* --- end behaviour-map hook -------------------------------- */
```

Plus a one-liner emitted into the sprite-update loop (behind a second
pair of markers) that calls `behaviour_at` + `reaction_for` and
dispatches. Pupils can expand it; the emitter regenerates only the
lines inside the markers.

### Build-pipeline integration

[playground_server.py](tools/playground_server.py) currently copies
`level.nam`, `.chr`, and `.pal` into the step's `assets/` before
invoking `make`. Add:
- `assets/behaviour/behaviour_map.inc`
- `assets/behaviour/collision.h`
- `assets/behaviour/behaviour.c`
- `Makefile` update (or pattern rule) to compile `behaviour.c` and
  link `behaviour_map.inc`.

All three files are emitted from the JSON state on every `▶ Play
in NES` build, so the pupil's changes always round-trip.

---

## Code-page integration

- In **guided mode**, the `/* --- behaviour-map hook --- */` region
  shows up as an editable green region (just like the existing
  guided regions). Pupils can fill in `on_door` / `on_trigger`
  without leaving guided mode.
- A new **Snippets** category `"Behaviour hooks"` — example bodies
  for `on_door` (switch on `tx`/`ty` to pick next screen) and
  `on_trigger` (increment a score counter, spawn a sprite).
- The Code page gets a new link `"Edit the behaviour map →"` that
  jumps to behaviour.html; behaviour.html's banner has the
  reverse link.

---

## Files touched

**New**
- [tools/tile_editor_web/behaviour.html](tools/tile_editor_web/behaviour.html)
  — the new page, ~1200 lines net (markup + CSS + JS). Follows the
  sprites/backgrounds page template; reuses the nav, the palette-
  editor CSS, the tools-popover CSS, `Storage`, the undo stack,
  `showAutoToast`.
- `assets/behaviour/`-emitting helpers in the JS:
  `emitBehaviourInc()`, `emitCollisionH()`, `emitBehaviourC()`,
  `updateMainCMarkers()`.

**Edited**
- [tools/tile_editor_web/index.html](tools/tile_editor_web/index.html):
  bump `STATE_VERSION` to 2, add `migrateState` branch, add nav link
  to **Behaviour**.
- [tools/tile_editor_web/sprites.html](tools/tile_editor_web/sprites.html):
  same `STATE_VERSION` bump + migration copy; add nav link.
- [tools/tile_editor_web/code.html](tools/tile_editor_web/code.html):
  guided-mode region detection for the new markers; snippet
  category; cross-page link.
- [tools/tile_editor_web/storage.js](tools/tile_editor_web/storage.js)
  — if it has a schema-validation step, teach it the new fields
  (no-op otherwise; stored JSON is free-form).
- [tools/playground_server.py](tools/playground_server.py): write
  the three new artifacts under `assets/behaviour/` before `make`;
  teach the Makefile template to pick up `behaviour.c` +
  `behaviour_map.inc`.
- [changelog-implemented.md](changelog-implemented.md) — record
  shipped features.

**Possibly new**
- A per-step Makefile template update (if the playground Makefile
  is generated from a template elsewhere — verify during
  implementation).

---

## Phasing — suggest splitting into two sprints

### Phase A (Sprint 10a, M+): data model + painter UI
- STATE_VERSION bump + migration.
- Behaviour page shell, type palette, overlay render, paint tools,
  undo, round-trip save/load.
- Reaction matrix UI wired to state (read/write only — no code-gen
  yet).
- Verification: paint the grid, save, reload, paint some more,
  undo/redo. Build pipeline untouched so `▶ Play in NES` still
  runs the pre-Sprint-10 game.

### Phase B (Sprint 10b, M): code-gen + build integration
- `emitBehaviourInc` / `emitCollisionH` / `emitBehaviourC`.
- `main.c` marker rewrite + guided-region detection.
- Playground-server wiring.
- Verification: the full sprint-10 checklist (below).

Two sprints keeps the editor usable even if the code-gen piece hits
snags. If the pupil timeline doesn't allow two sprints, the whole
thing is one L sprint — roughly 1500–2000 lines total.

---

## Verification

1. `node --check` on each page's extracted script block.
2. Migration: load a pre-Sprint-10 project — all behaviour arrays
   zeroed, default reactions seeded for each sprite, no painted
   tiles.
3. Paint the player's starting screen: ground tiles become
   `solid_ground`, walls on the sides become `wall`, hanging
   platforms become `platform`. Place a `door` tile on the right
   edge.
4. Save + reload — painted behaviour persists, counts in the palette
   badges match.
5. Open the reaction matrix; set the player sprite's `wall` reaction
   to `block` (default), `solid_ground` to `land`. Save.
6. `▶ Play in NES` — the build succeeds; in-game, the player lands on
   ground tiles, stops at walls. `on_door` fires when the player
   walks into the door tile (default body is empty — verify via a
   printf in the emulator console or an on-screen log).
7. Edit `on_door` in **guided mode** on the Code page. Rebuild.
   The change shows up in the emulator.
8. Add a `custom1` type — "ladder". Paint some tiles. Set the
   player's reaction to `call_handler`. Rebuild. Custom tiles fire
   the generic hook; pupil can implement climbing.
9. Undo after any paint op / reaction change reverts cleanly.
10. Cross-page: click "Edit the behaviour map →" from the Code page
    → lands on behaviour.html. Reverse link returns.
11. Export JSON → import into a fresh tab → everything round-trips.

---

## Open questions

1. **Granularity.** Tile-level (8×8 per cell) vs. metatile-level
   (16×16, i.e. one behaviour byte per 2×2 tile block). Metatile
   cuts the map byte count 4× and is common in NES games but loses
   precision on thin walls. Tile-level is the plan; revisit if
   ROM-space pressure comes up.

2. **Per-screen vs. per-background.** Current plan has one flat
   grid per background (matches how `nametable` works). If pupils
   start making large scrolling levels we may want per-screen
   authoring (edit one screen at a time) even though the data is
   still flat. That's UX only, not a data-model change.

3. **Reaction composition.** `block` + `land_top` on the same tile
   is possible today (just a verb per type); if pupils want two
   reactions on one type, we need verb *combinations* and a
   bitmask format. Not for v1.

4. **Triggers with data.** `trigger` fires `on_trigger(sprite_id,
   tx, ty, behaviour)` — no extra payload. Zelda-style doors that
   pick the next screen by tile coordinate work; anything richer
   (e.g. "this trigger spawns an enemy of kind X") needs a
   per-tile data slot, which is a bigger state-model change.

5. **Authoring vs. runtime naming.** We expose the pupil's custom
   type name (e.g. `ladder`) as an enum `BEHAVIOUR_LADDER`. Sanitise
   the name (uppercase, strip non-alphanum, prefix `BEHAVIOUR_`) —
   pupils will inevitably try spaces and emoji. Fall back to
   `BEHAVIOUR_CUSTOM1` etc. if the sanitised name is empty.

6. **Reset paths.** "Reset reactions to defaults" per-sprite is in.
   "Reset the whole behaviour map" is not; too destructive, pupil
   would undo a week of work by accident. If they really want that
   they can export JSON, edit, re-import.

---

## Effort estimate

**L.** Split recommended: Phase A is M+ (~800 lines), Phase B is
M (~700 lines). Combined ~1500 lines across HTML/CSS/JS + Python
pipeline changes. The hardest single piece is the main.c marker
rewrite (handling pupil edits gracefully without stomping them) —
second-hardest is the Makefile/playground-server integration.
