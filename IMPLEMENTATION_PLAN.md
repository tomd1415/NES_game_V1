# Implementation Plan — Pupil Feedback Response

Companion to [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md). Five sprints, ordered
by "what hurts pupils most, right now". Each sprint is independently
shippable: land it, watch the next pupil session, adjust.

Effort key: **S** ≈ under a day, **M** ≈ 1–3 days, **L** ≈ a week.

---

## Guiding constraints

- **Pupils are testing live**, so no session-breaking regressions. Every
  sprint ends with a manual walkthrough of Steps 1–5 before it's declared
  done.
- **Data safety is non-negotiable** — pupils have weeks of work in
  `localStorage`. Any storage-schema change ships with a one-shot
  migration and a pre-migration JSON export dumped to disk.
- **Shared state lives in `localStorage`**: [index.html:1304-1308](tools/tile_editor_web/index.html#L1304-L1308)
  and [sprites.html:1725-1729](tools/tile_editor_web/sprites.html#L1725-L1729)
  duplicate the same keys. The Storage object is currently copied across
  files; Sprint 2 extracts it to a shared module.
- **Reuse before building**: `validateState`, `tileToChrBytes`,
  `emptyTile`, `resizeNametable`, `Storage.*`, exporters, snapshot/backup
  ring are already in place — new features wrap them, they don't replace
  them.

---

## Sprint 1 — Stop the footguns (effort: M)

The pupils' three biggest "broke my work by accident" moments.

### 1.1 Clear-tile button + `Del` shortcut (S)

- Add **Clear tile** to the tile editor toolbar on [tools/tile_editor_web/index.html](tools/tile_editor_web/index.html).
- Calls the existing `emptyTile()` factory and writes back to
  `state.tiles[idx].pixels`.
- Bind `Del` when the tile editor canvas has focus.
- If the tile is used by any sprite, confirm first ("This tile is used by
  `hero`, `enemy1` — clear it anyway?").

### 1.2 Tile 0 lock + background explainer (S)

- In the tileset grid, render tile 0 with a padlock overlay and the
  tooltip "This is the background. Change it in the Background section."
- Clicking it opens the tile editor in read-only mode (pixels greyed, no
  paint cursor).
- On the background panel, add a **Background colour** swatch bound to
  `state.universal_bg`. Clicking it opens the existing NES-palette picker.
- Add a two-sentence explainer under the swatch.

### 1.3 Explicit modes on the background canvas (M)

The root cause of "changing palette often changes the tile as well".

- Introduce a `bgMode` state variable: `'paintTile' | 'paintPalette' |
  'erase'` (default `paintTile`).
- Three radio buttons on the background toolbar; each changes the cursor
  (brush / swatch / eraser).
- Click dispatch on the nametable canvas routes through `bgMode`:
  - `paintTile` — current behaviour.
  - `paintPalette` — snaps to the 2×2 attribute block, cycles/sets the
    palette for that block. Hover shows the block outline.
  - `erase` — writes tile 0 + palette 0.
- Persist `bgMode` in `prefs` so it survives reload.

### 1.4 Sprint-1 verification

- Manual: draw a tile, clear it with `Del`, confirm prompt when shared.
- Manual: click tile 0, confirm read-only; change BG colour via new
  swatch and reload — colour persists.
- Manual: switch to `paintPalette`, click across two 2×2 blocks, confirm
  no tile indices changed.
- Automated: extend `/tmp/tile_editor_test.js` with
  `clearTile(state, idx)` and `setAttribute(state, x, y, paletteIdx)`
  cases. Run: all green.
- Run Steps 1–5 once in FCEUX — nothing renders differently.

---

## Sprint 2 — Named projects (effort: L)

Lets pupils save work between sessions, start fresh without losing old
work, and teachers swap pupils on the same machine.

### 2.1 Storage schema v2

New keys, namespaced per project:

```
nes_tile_editor.projects.v1           → { version, activeId, projects: [...] }
nes_tile_editor.project.<id>.current  → state (existing shape)
nes_tile_editor.project.<id>.snap.<t> → snapshot
nes_tile_editor.project.<id>.backup.<t> → backup
nes_tile_editor.prefs.v1              → (unchanged, app-wide)
```

Each entry in `projects[]`: `{ id, name, created, modified, template }`.

### 2.2 One-shot migration

On editor boot, if `nes_tile_editor.projects.v1` is missing **and**
`nes_tile_editor.current.v1` exists:

1. Dump every pre-migration key to a JSON file
   (`tile_editor_pre_migration_<timestamp>.json`) — silent download, via
   the existing `triggerDownload` helper.
2. Create project id `default`, name "My First Project".
3. Rewrite keys under the new scheme.
4. Delete old keys only after writes confirm.
5. Record the migration timestamp in `meta` so it never runs twice.

### 2.3 Shared storage module

Extract the duplicated Storage object from
[index.html:1304-1770](tools/tile_editor_web/index.html#L1304) and
[sprites.html:1725-1770](tools/tile_editor_web/sprites.html#L1725)
into a new `tools/tile_editor_web/storage.js`. Both pages `<script
src>` it. This pays down an existing debt and gives the named-projects
logic a single implementation.

### 2.4 Projects dropdown in the header

`New / Rename / Duplicate / Delete / Export .json / Import .json` plus
**Recent projects** (last 5).  Switching projects re-runs
`loadCurrent()` against the new id and re-renders.

### 2.5 Sprint-2 verification

- Manual: fresh browser profile → create project, add a tile, close tab,
  reopen → tile persists; create second project, confirm isolation.
- Manual: simulate a pupil with pre-migration data by pre-seeding
  localStorage with the old keys, reload, confirm migration download +
  smooth switch.
- Automated: smoke-test `Storage.listProjects`, `createProject`,
  `switchProject`, and migration in `/tmp/tile_editor_test.js`.
- Run Steps 1–5 — exports still produce identical `.chr` / `.nam` /
  `.pal` bytes (binary-diff against a pre-sprint build).

---

## Sprint 3 — Sprite workshop polish (effort: M)

Addresses six feedback items that all live on [sprites.html](tools/tile_editor_web/sprites.html).

### 3.1 Use-count overlay on the tileset grid (M)

- Helper `getTileUsage(state)` → `Map<tileIdx, { count, sprites: [names] }>`.
- Each tileset cell renders a small coloured dot:
  `0 = none, 1 = single-use, 2+ = shared` with a distinct stripe.
- Hover tooltip lists the sprite names.
- When a sprite is selected, its tiles get a coloured border (one colour
  per role, see 3.3). Shared tiles get a striped border so the highlight
  is visible even when another sprite's border is also on that tile.
- Colour-blind-friendly palette (ColorBrewer "Dark2").

### 3.2 Auto-pick next empty tiles on New Sprite (S)

- On **New Sprite**, call `findFreeTileRun(state, width*height)` which
  scans tile indices forward from 1 for a contiguous empty run.
- Pre-fill the new sprite's tile list with that run.
- Offer a **Change tiles…** secondary button if the pupil wants to
  override.

### 3.3 Role tag per sprite (S)

- Extend the sprite model: `sprite.role = 'player' | 'npc' | 'enemy' |
  'item' | 'other'` (default `'other'`).
- Render as a coloured chip next to the sprite name in the sprite list
  and in the sprite editor header.
- Filter dropdown above the sprite list.
- `validateState` extended to accept old sprites without the field
  (default to `'other'` in a load-time fixup).

### 3.4 Pinned palette swatches above the tile canvas (S)

- Four swatches for the active palette (BG + 3) pinned to the top of the
  tile editor canvas.
- Click = pick paint colour. Mirrors the existing palette panel; doesn't
  replace it.

### 3.5 Per-tile palette chip on the sprite grid (M)

- Extend each sprite cell: `{ tileIdx, paletteIdx }`.
- Render a small coloured chip top-right of the cell.
- Click opens a four-palette popover.
- Export: `paletteIdx` maps to OAM attribute bits in the `.sprites.json`
  export (already used by `main.c` stubs; no CHR change needed).

### 3.6 Sprint-3 verification

- Manual: create two sprites sharing a tile, confirm striped overlay;
  hover shows both names.
- Manual: create a new sprite → tiles auto-picked from the next empty
  slots; override path still works.
- Manual: change a sprite's role → chip colour updates in the list.
- Manual: click per-tile palette chip, confirm preview uses the new
  palette; export + re-import → round-trips.
- Automated: extend smoke test for `getTileUsage`, `findFreeTileRun`,
  and per-tile palette round-trip.

---

## Sprint 4 — Onboarding + polish (effort: M)

Turns the editor from "usable" into "a pupil can sit down alone and get
somewhere".

### 4.1 First-run walkthrough overlay (M)

- A three-step highlight tour on first load per project: palette →
  tile grid → sprite area. Each step is a single "Next" click.
- Skippable; stored in `prefs.walkthroughSeen = true`.
- Reusable across index/sprites/code pages (shared module).

### 4.2 Auto-save indicator (S)

- Small "Saved 3 s ago" badge next to the project name. Updates on every
  debounced save. Goes red if a save errors.

### 4.3 Undo / redo affordance (M)

- The current undo/redo stack is JSON snapshots (cap 50).
- Add two toolbar buttons + `Ctrl+Z` / `Ctrl+Shift+Z`.
- A `?` key opens a keyboard-shortcut overlay (content lives in
  `docs/shortcuts.md` so it's editable).

### 4.4 Grid control (S)

- View menu: line-width (off / 1 px / 2 px), light/dark/custom colour,
  optional chunk lines every 8 or 16 px.
- Persist per-project in `prefs`.

### 4.5 Copy / paste tile + duplicate sprite (S)

- `Ctrl+C` / `Ctrl+V` in the tile editor — copies the 8×8 pixel array.
- **Duplicate sprite** button in the sprite list — copies the sprite
  metadata and points to fresh tile copies (via `findFreeTileRun`).

### 4.6 Sprint-4 verification

- Manual: brand-new project → walkthrough fires; **Skip** works;
  reopening → walkthrough does not fire again.
- Manual: type rapidly → indicator cycles correctly; throttle dev-tools
  `localStorage.setItem` to force an error → indicator goes red.
- Manual: paint, undo, redo, copy a tile, paste into a blank — all
  correct.

---

## Sprint 5 — Templates and emulator (effort: M)

The last bucket of feedback, plus one bug.

### 5.1 New Project templates (M)

**New Project** dialog (post-Sprint-2) offers:

1. **Platformer** — current behaviour. Seed: existing default tiles,
   `hero` sprite, `ground_strip` background, `main.c` with gravity/jump.
2. **Top-down (Pac-man / Pokémon)** — new seeds:
   - `hero` sprite with a front/back/side triplet.
   - `maze_floor` background.
   - `main.c` template with 4-way movement, no gravity, wrap-or-collide
     at screen edges.

Seeds live under `tools/tile_editor_web/templates/`:

```
templates/platformer/{tiles.json, sprites.json, nametable.json, main.c}
templates/topdown/{tiles.json, sprites.json, nametable.json, main.c}
```

Loaded by the **New Project** action; the templates are just JSON + C.

### 5.2 FCEUX stale-build investigation (S)

- Likely cause: one of the `steps/*/Makefile` files doesn't list a
  transitive header / include as a prerequisite, so `make run` declares
  the ROM up-to-date.
- Reproduce on Step 1: edit an included `.inc` and check if the ROM
  rebuilds. If not, add the missing deps.
- Add a `rebuild-run` target that does `clean && run`, wire up a
  **Rebuild & Run Current Step** task in `.vscode/tasks.json` as a safety
  belt.
- Stretch: embed the ROM's build timestamp in the game's HUD so the
  pupil can see "this is build 14:03" at a glance.

### 5.3 Sprint-5 verification

- Manual: create a platformer project → Step-1 `main.c` appears
  identical to current; create a top-down project → WASD/arrows move
  without gravity in FCEUX.
- Manual: edit a header in Step 1, run, confirm ROM now rebuilds.

---

## Not in this plan (parked)

- Getting-started GIFs/videos — content work, happens outside the code
  repo. Drop exported `.gif` / `.mp4` files into `docs/media/` and wire
  references from the walkthrough.
- Import-from-image (drop a PNG, auto-quantise to NES palette) — stretch
  goal; dependency-free implementations are available but ~300 lines
  each. Revisit after Sprint 5.
- Shareable read-only links — requires a backend or a "dump state as a
  URL fragment" scheme. Worth it only if pupils ask.
- "Check my sprite" validator — useful but nice-to-have.

---

## Risks and mitigations

| Risk                                                 | Mitigation                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Sprint 2 migration corrupts an existing pupil's data | Pre-migration JSON dump to disk. Migration is idempotent and logged.       |
| Sprint 1 mode refactor breaks existing background UX | Feature lands behind a `prefs.useExplicitModes` flag; default on only once verified. |
| Per-tile palette change breaks `.nam` / `.pal` export | Add a round-trip test to the smoke suite (state → export → import → state) before landing. |
| Walkthrough overlay clashes with screen readers      | Built with semantic `<dialog>` + focus management; `aria-live` on step change. |

---

## Order of play

Sprints 1 → 2 → 3 → 4 → 5. Each is shippable on its own.

A cautious alternative: land 1.1 (`Clear tile`) and 1.2 (tile 0 lock) as
a hotfix this week — they're both small, both high-value, and neither
needs the mode refactor.

---

## Verification at the end

After all sprints:

1. All items in [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) tagged `[done]` or
   explicitly `[won't fix]`.
2. `/tmp/tile_editor_test.js` green (expanded to ~40 cases).
3. A fresh pupil can open the editor, complete the walkthrough, make a
   sprite, drop it into a background, and export — without a teacher
   sitting next to them.
4. Run Steps 1–5 in FCEUX — outputs byte-identical to a pre-Sprint-1 build
   unless the pupil actively changed something.
