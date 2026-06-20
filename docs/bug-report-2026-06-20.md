# Codebase bug report — 2026-06-20

## Summary

This review found eight defects that are still present in the current `main`
branch (`7a7c707`). Historical defects already recorded as fixed in the June 15
bug sweep are not repeated.

| ID | Severity | Area | Summary |
| --- | --- | --- | --- |
| BR-01 | High | Project creation / Builder | A new Top-down project is assembled as a Platformer |
| BR-02 | High | Persistence | Recent edits can be lost when navigating or switching projects |
| BR-03 | High | NES runtime | Large two-player sprites write past the 256-byte OAM shadow buffer |
| BR-04 | Medium | Spawn effects | A missing effect-sprite index produces a late C build failure |
| BR-05 | Medium | Spawn effects | Trigger and damage effects silently share one module's art and lifetime |
| BR-06 | Medium | Sprites preview | Player 2 cannot be controlled in the Sprites-page emulator |
| BR-07 | Low | Project management | Renaming in Builder or Code does not update the project catalog |
| BR-08 | Low | Checkpoints / HP | Respawn HP can exceed the configured maximum HP |

Severity used here:

- **High:** data loss, unsafe memory access, or a primary advertised workflow
  produces the wrong game.
- **Medium:** a feature fails for a valid or easily entered configuration, but
  the rest of the project remains usable.
- **Low:** inconsistent state or behaviour with a limited workaround/impact.

## Findings

### BR-01 — New Top-down projects are assembled as Platformers

**Severity:** High  
**Confidence:** Confirmed by source trace and a targeted assembler check.

**Reproduction**

1. On Backgrounds or Sprites, create a new project and select **Top-down**.
2. Open Builder or use **Play in NES**.
3. Inspect the generated C, or run the game.
4. The generated C does not contain an active `#define BW_GAME_STYLE 1`, and
   the player uses platformer gravity/jump physics.

**Impact**

The project-creation dialog promises a four-way, no-gravity game, but the
generated ROM is a platformer. Legacy Top-down states that do not already have
a Builder tree are migrated into the same incorrect state.

**Cause**

There are two sources of truth for game style:

- The new-project handlers set `state.template = "topdown"` and
  `state.movement = "fourway"` in
  [`index.html`](../tools/tile_editor_web/index.html) and
  [`sprites.html`](../tools/tile_editor_web/sprites.html).
- The assembler reads only `state.builder.modules.game.config.type` through
  [`builder-modules.js`](../tools/tile_editor_web/builder-modules.js).

`createDefaultState()`/`migrateBuilderFields()` seed the Builder game module as
`platformer`, and neither new-project handler changes it. A targeted check of
the resulting state found zero anchored `#define BW_GAME_STYLE 1` directives in
the assembled output.

**Possible solutions**

1. Make `builder.modules.game.config.type` the canonical field and set it in
   both new-project handlers.
2. During migration, initialise the Builder game type from `state.template`
   before defaulting to `platformer`.
3. Remove or derive the legacy `template`/`movement` fields so the values cannot
   drift again.
4. Add a regression test that creates state through each real new-project path,
   rather than constructing a Top-down Builder state manually.

### BR-02 — Debounced saves can lose recent edits

**Severity:** High  
**Confidence:** Confirmed by control-flow inspection.

**Reproduction**

1. Edit C/assembly on the Code page.
2. Within 400 ms, switch to another project from the project list, duplicate
   the project, or navigate to another editor page.
3. Return to the original project. The last edit is absent.

A similar, narrower 150 ms loss window exists after Builder and Behaviour
changes when navigating away.

**Impact**

Pupil-authored code or configuration can be silently discarded. The Code-page
case is especially risky because CodeMirror content is not copied into `state`
until the delayed callback runs.

**Cause**

- [`code.html`](../tools/tile_editor_web/code.html) waits 400 ms before copying
  `cm.getValue()` into the project state. Its project switcher saves the stale
  in-memory `state` and immediately reloads.
- [`builder.html`](../tools/tile_editor_web/builder.html) and
  [`behaviour.html`](../tools/tile_editor_web/behaviour.html) wait 150 ms before
  writing their already-mutated state to local storage.
- These three pages have no final `pagehide`/`beforeunload` flush. Backgrounds
  and Sprites already implement a final synchronous save and demonstrate the
  intended pattern.

**Possible solutions**

1. Add one synchronous `flushSave()` per page. On Code, it must first copy the
   current CodeMirror value into the correct language field.
2. Call it before project switch, duplicate, recovery, import, and navigation.
3. Register it on `pagehide` (and optionally `beforeunload` as a fallback).
4. Add a fake-timer browser/unit test covering an edit immediately followed by
   project switching.

### BR-03 — Large two-player sprites overflow the OAM shadow buffer

**Severity:** High  
**Confidence:** Confirmed by bounds calculation and source inspection.

**Reproduction**

1. Create two sprites sized 8x8 tiles and tag both as Player.
2. Enable Player 2 in Builder and play the game.
3. Player 1 consumes all 64 hardware-sprite entries. Player 2 is partly or
   wholly absent; the CPU still writes its OAM data beyond the shadow buffer.

**Impact**

The generated game performs out-of-bounds RAM writes and does not render the
configured players correctly. Today `$0300-$04ff` is intentionally unused, so
the common symptom is missing/truncated sprite output rather than immediate game
state corruption. That memory is explicitly reserved for future buffers,
making this an unsafe latent corruption bug as well.

**Cause**

The editor permits each sprite to be up to 8x8 cells (64 hardware sprites).
[`platformer.c`](../tools/tile_editor_web/builder-templates/platformer.c)
writes Player 1 and both Player 2 rendering branches without checking
`oam_idx <= 252`. Later spawn, HUD, and scene writers do have this guard.
There is also no Builder validation of the combined player OAM cost.

Two 8x8 players attempt 128 entries, or 512 bytes, against
`unsigned char oam_buf[256]` in the linker `OAM` segment.

**Possible solutions**

1. Guard every four-byte player write, including both Player 2 branches.
2. Stop the outer loops once the buffer is full; do not merely break the inner
   loop.
3. Add a blocking Builder validator when Player 1 + Player 2 alone exceed 64
   cells, and a warning based on the full player/HUD/scene/effect budget.
4. Consider a lower supported maximum for player dimensions than for general
   art sprites.

### BR-04 — Invalid spawn-effect sprite indices fail during C compilation

**Severity:** Medium  
**Confidence:** Confirmed by emitter/validator checks.

**Reproduction**

1. Keep a project with fewer than 32 sprites.
2. Enable **Spawn effect** or Damage's **Show an effect sprite**.
3. Enter an effect sprite number that does not exist, such as 31 in a
   two-sprite project.
4. Builder shows no validation error. Play reaches cc65 and fails because
   `SPAWN_W`, `SPAWN_H`, `SPAWN_TILES`, and `SPAWN_ATTRS` were never emitted.

**Impact**

An ordinary UI input causes a late, technical compiler error instead of a clear
Builder problem. Imported/deleted-sprite projects can reach the same state.

**Cause**

The UI uses a free numeric field with a fixed range 0-31, unrelated to the
actual sprite list. [`playground_server.py`](../tools/playground_server.py)
returns no spawn-art declarations for an out-of-range index, while the JS
module still defines `BW_SPAWN_ENABLED`. [`builder-validators.js`](../tools/tile_editor_web/builder-validators.js)
has no validator for either spawn reference.

**Possible solutions**

1. Replace both numeric fields with sprite dropdowns populated from the live
   sprite list (store a stable sprite ID if deletion/reordering must be safe).
2. Add blocking validation for both effect references.
3. Make generation fail early with an input-stage message naming the missing
   sprite rather than emitting internally inconsistent C.

### BR-05 — The two spawn features silently override each other

**Severity:** Medium  
**Confidence:** Confirmed with targeted emitter and assembler checks.

**Reproduction**

1. Enable trigger-tile **Spawn effect**, choose sprite A and lifetime 7.
2. Enable Damage's **Show an effect sprite**, choose sprite B and lifetime 99.
3. Build and trigger both effects.
4. Both use sprite A and lifetime 7; Damage's separate art/lifetime settings
   are ignored.

**Impact**

The UI presents independent configurations but the generated game cannot
honour them. This is silent and therefore looks like broken or unreliable
Builder state.

**Cause**

Both features drive one `bw_spawn()` pool with one compile-time art table and
one `SPAWN_TTL`. The server's `_spawn_art_index()` always prefers the trigger
module when it is enabled. Module order applies `spawn` before `damage`, and
the first `#ifndef SPAWN_TTL` definition wins. An invalid trigger-effect index
also prevents the server from falling back to a valid Damage effect index.

**Possible solutions**

1. If one shared effect is intentional, expose one shared Effect configuration
   and let both event sources reference it.
2. If independent effects are intended, add an art/type field per pool entry
   and use distinct TTLs at runtime.
3. Until either design is implemented, add a validator that rejects conflicting
   art/lifetime settings and clearly states which shared value is used.

### BR-06 — Player 2 is uncontrollable in the Sprites-page preview

**Severity:** Medium  
**Confidence:** Confirmed by input-path inspection.

**Reproduction**

1. Enable Player 2 and ensure two sprites are tagged Player.
2. Open the Sprites-page Playground and run the project in-browser.
3. Try the documented/shared-emulator P2 keys: I/J/K/L, O/U, 1/2.
4. No Player 2 input reaches jsnes.

**Impact**

A valid co-op ROM appears broken when tested from the Sprites page. Builder,
Backgrounds, Behaviour, and Code can control Player 2, so behaviour differs by
the page used to launch the same project.

**Cause**

The Sprites page uses a private emulator implementation. Its `EMU_KEY_MAP`
contains only Player 1 entries and `onEmuKey()` hard-codes controller 1. The
shared [`emulator.js`](../tools/tile_editor_web/emulator.js) already implements
the complete two-controller mapping.

**Possible solutions**

1. Replace the private Sprites emulator with `NesEmulator.open()`.
2. As a smaller patch, port the shared `{pad, button}` map and show P2 controls
   only when P2 is enabled.
3. Add one cross-page emulator key-map regression test.

### BR-07 — Builder/Code rename only half of a project

**Severity:** Low  
**Confidence:** Confirmed by storage-path inspection.

**Reproduction**

1. Rename a project in Builder or Code.
2. Open the project menu, reload, or duplicate the project.
3. The header/state may show the new name while the catalog list, duplicate
   name, and delete confirmation retain the old name.

**Impact**

The same project has two visible names. This is confusing when switching,
duplicating, or deleting projects.

**Cause**

The project name exists in both the project state and the v2 catalog.
Builder/Code update only `state.name`; `Storage.saveCurrent()` updates the
catalog's modified time but not its name. Backgrounds, Sprites, and Behaviour
explicitly call `Storage.renameProject()`.

**Possible solutions**

1. Call `Storage.renameProject()` from Builder and Code name handlers.
2. Preferably centralise renaming in a storage method that updates state and
   catalog atomically, eliminating page-specific behaviour.

### BR-08 — Checkpoint respawn can grant more than Max HP

**Severity:** Low  
**Confidence:** Confirmed by generated-code inspection.

**Reproduction**

1. Set Player 1 Max HP to 1.
2. Enable Damage and Checkpoints; set **HP restored on respawn** to 9.
3. Die after reaching a checkpoint.
4. The player respawns with 9 HP, despite the configured maximum of 1; a HUD
   also draws nine hearts.

**Impact**

Checkpoint configuration can violate the HP invariant and substantially alter
game difficulty. The UI provides no warning that the restore value exceeds the
maximum.

**Cause**

Both fields allow 0/1-9 independently. Generated code assigns
`player_hp = BW_RESPAWN_HP` without clamping to `PLAYER_MAX_HP`, and there is no
cross-field validator.

**Possible solutions**

1. Clamp in generated C: `min(BW_RESPAWN_HP, PLAYER_MAX_HP)` (expressed without
   relying on a non-existent `min` macro).
2. Dynamically cap the Builder input at Player 1 Max HP and add a validator for
   imported/stale states.

## Verification performed

The following checks completed successfully:

- The root sample ROM and all six step/playground ROMs built with
  cc65/ca65/ld65: `make clean all` at the root and in all six `steps/*` build
  directories.
- Python syntax compilation for first-party scripts under `tools/` and
  `tools/audio/`.
- JavaScript syntax checks for the shared editor modules and extracted inline
  page scripts (the syntax portion of `run-all.mjs`).
- Standalone smoke tests:
  - `node tools/builder-tests/a11y.mjs`
  - `node tools/builder-tests/project-menu.mjs`
  - `node tools/builder-tests/region-copy-paste.mjs`
- Targeted state/emitter checks for BR-01, BR-04, and BR-05.
- Worktree cleanliness was rechecked before adding this report.

The complete `node tools/builder-tests/run-all.mjs` integration run could not
be treated as evidence in this environment: its localhost server connections
and one child-shell spawn are blocked by the managed sandbox with `EPERM`.
Those environment failures are not recorded as product defects. Server-backed
render tests should be rerun outside this sandbox before fixes are merged.

## Recommended fix order

1. BR-02 (silent data loss).
2. BR-01 (wrong game generated from a primary creation workflow).
3. BR-03 (out-of-bounds OAM writes).
4. BR-04 and BR-05 together (one spawn-effect data-model decision).
5. BR-06.
6. BR-07 and BR-08.
