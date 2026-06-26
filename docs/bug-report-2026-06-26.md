# Bug Report — 2026-06-26

Automated sweep of the full codebase. Issues are grouped by severity.

---

## Critical (data loss / unsafe memory)

### BR-01 · Top-down projects generated as platformers

**Files:** `tools/tile_editor_web/index.html`, `sprites.html`, `builder-modules.js`

New-project dialogs set `state.template = "topdown"` but the assembler reads only
`builder.modules.game.config.type`, which defaults to `"platformer"`. The two sources
of truth are never synchronised during project creation, so selecting "Top-down" produces
a ROM with platformer gravity and jump physics.

---

### BR-02 · Code-page edits lost on fast navigation

**File:** `tools/tile_editor_web/code.html`

CodeMirror syncs to state after a 400 ms debounce. Switching projects before the
callback fires calls `saveState()` on stale data, silently discarding the recent
edits. Builder and Behaviour pages have a shorter (150 ms) equivalent window. None
of the three pages have a synchronous `pagehide`/`beforeunload` save.

---

### BR-03 · OAM buffer overflow with two large player sprites

**File:** `tools/tile_editor_web/builder-templates/platformer.c`

Two 8×8-tile player sprites attempt to write 128 OAM entries (512 bytes) into the
256-byte OAM shadow buffer. The rendering loop has no `oam_idx <= 252` bounds check,
causing out-of-bounds writes that corrupt `$0300–$04FF`.

**Workaround:** Keep each player to ≤4×4 tiles.

---

## High (functional failures)

### BR-04 · Invalid spawn-effect sprite index causes late compiler failure

**File:** `tools/playground_server.py` (around lines 1234–1239)

The Builder UI accepts a free numeric field (0–31) for spawn-effect sprite index
with no validation against the actual sprite count. Entering an out-of-range value
(e.g. 31 in a 2-sprite project) produces no UI error; `cc65` later fails with
`undefined 'SPAWN_W'`.

**Fix:** Validate index < actual sprite count in the UI before generation.

---

### BR-05 · Trigger and Damage spawn effects silently override each other

**File:** `tools/playground_server.py` (spawn emitters, around lines 1000–1150)

Both the Trigger and Damage modules write to a single `bw_spawn()` pool with a
shared `SPAWN_TTL`. Trigger's art/lifetime settings overwrite Damage's. The UI
shows them as independent configurations but the generated game can only honour one
at a time.

---

### BR-06 · Player 2 uncontrollable on Sprites-page preview

**File:** `tools/tile_editor_web/sprites.html`

The Sprites page contains a private emulator whose `EMU_KEY_MAP` only has Player 1
entries, and `onEmuKey()` is hardcoded to controller 1. A co-op ROM that works
correctly in the Builder/Code preview appears broken here.

---

## Medium (partial failures)

### BR-07 · Rename updates header only, not the project catalog

**Files:** `tools/tile_editor_web/builder.html`, `code.html`

Rename handlers on Builder and Code pages update `state.name` but do not call
`Storage.renameProject()`. The page header shows the new name but the project
list, duplicate dialog, and delete confirmation still show the old name.
Backgrounds, Sprites, and Behaviour pages call the correct method.

---

### BR-08 · Respawn HP can exceed max HP

**File:** `tools/tile_editor_web/builder.html` (Checkpoints + Damage modules)

Max HP and Respawn HP fields accept independent values 0–9. The generated code
assigns without clamping, so setting Max HP = 1 and Respawn HP = 9 produces a
player that respawns with 9 hearts.

**Fix:** Add a cross-field validator or clamp in generated code to
`min(BW_RESPAWN_HP, PLAYER_MAX_HP)`.

---

## Code duplication with drift risk

### P1 · Scene-data computation diverged between C and Assembly generators

**File:** `tools/playground_server.py` (C: lines ~1004–1146, Assembly: ~1510–1918)

The C generator clamps positions to world bounds and emits 16-bit values; the
Assembly generator only masks `& 0xFF`. This is a real parity gap for multi-screen
assembly projects.

**Fix:** Extract a shared `_scene_data()` helper; both generators become thin
format wrappers.

---

### P2 · Palette computation duplicated

**File:** `tools/playground_server.py` (lines ~947–966 vs ~973–1001)

Two near-identical palette blocks; any palette logic fix must be applied twice.

---

### P3 · ROM build functions repeat preamble and tail

Three nearly-identical build functions share copy-pasted preamble and tail blocks.

---

### P4 · Hex-table helper defined three times with signature variance

Inconsistent signatures increase the chance of a silent mismatch after a partial update.

---

### G7 · NES tile codec reimplemented in three files

**Files:** `tools/generate_chr.py` (lines 17–34), `tools/png2chr.py` (lines 73–88),
`tools/generate_slide_assets.py` (lines 94–110)

`tools/chr_codec.py` was extracted as the canonical implementation but none of the
three files import it.

**Fix:** Replace the inline copies with `from chr_codec import encode_tile, decode_tile`.

---

## Repository hygiene

### H1 · Runtime-generated gallery entry committed (696 KB)

**Path:** `tools/gallery/for-testing-62c9/`

A live publish/remove directory is tracked as source.

**Fix:** `git rm -r --cached tools/gallery/for-testing-62c9`; add `tools/gallery/`
to `.gitignore`.

---

### H2 · Large regenerable pupil fixtures committed (784 KB)

**Paths:** `assets/pupil/my_project.json` (596 KB), `palette_reference.png`,
`preview.png`

All three are outputs of committed generators (`convert_my_tiles.py`,
`generate_palette_reference.py`).

**Fix:** `git rm --cached` all three; document "run generator first" in setup notes.

---

### H4 · CPython bytecode tracked

**Path:** `tools/audio/__pycache__/diagnose_song.cpython-313.pyc`

**Fix:** `git rm --cached`; existing `.gitignore` rules will prevent recurrence.

---

### H5 · Stale linker-config backup tracked

**Path:** `cfg/nes.cfg.bak`

Structurally different from the live config and unreferenced by any build rule.

**Fix:** `git rm cfg/nes.cfg.bak`.

---

### H6 · Playground server regenerates tracked files on every playtest

**File:** `tools/playground_server.py` (lines ~2650–2657)

Eight files (`scene.inc`, `palettes.inc`, `collision.h`, `behaviour.c`,
`bg_world.h`, `bg_world.c`, `game.chr`, `level.nam`) are written in-place to
the tracked Step_Playground source tree on every shared-dir playtest run,
dirtying the repo. Requires `git checkout -- steps/Step_Playground` after
each playtest to restore a clean state.

**Long-term fix:** Build into a temp directory; keep the tracked source as the
clean baseline.

---

## Dead / orphaned code

| ID | Location | Item |
|----|----------|------|
| J2 | `tools/tile_editor_web/sprite-render.js` | Docstring claims Sprites delegates to NesRender — it never did |
| J5 | Various JS modules | Unused exports: `ProjectMenu.openRecoveryDialog`, `wireNewButton`, `AccountMenu._refreshMe`, `AccountMenu._api`, `HelpPopover.PAGES`, `NesRender.spritePaletteFor`, 5× `PlayPipeline._*` internals, `BuilderAssembler.stripSlotMarkers` |
| P6 | `tools/playground_server.py` ~1234–1239 | Dead function `_spawn_required()` |
| P7 | `tools/playground_server.py` ~2017–2024 | Dead function `_behaviour_world_map()` |
| G1 | `src/hello.c` | Palette-only demo built by no Makefile, referenced nowhere |
| G6 | `tools/tile_editor.py` | Name implies obsolescence; is actually a maintained CLI library |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 3 |
| Medium | 2 |
| Duplication/drift | 5 |
| Hygiene | 5 |
| Dead code | 6 |
| **Total** | **24** |

Recommended fix order: BR-02 → BR-01 → BR-03 → BR-04 → BR-05 → BR-06.
