# NES Game-Making Platform — Codebase Cleanup Plan

## Executive Summary

The repository is in good overall health: there is no large-scale rot, no third-party bloat masquerading as source, and the most "suspicious-looking" files (the 578-line `tools/tile_editor.py`, the two parallel game engines, the per-step `graphics.s` copies) turn out to be intentional and load-bearing. The real burden is concentrated in two places: (1) the seven browser-editor HTML pages, which hand-synchronise their chrome CSS, tab-bar nav, and large blocks of state/emulator/project-menu/undo/palette JavaScript with measurable drift already shipped (including a real P2-key bug that prompted a dedicated regression test), and (2) a cluster of regenerable build artifacts and one tracked `.pyc` that leaked past existing `.gitignore` rules (~2 MB of committed, regenerable blobs: `assets/pupil/my_project.json` 596 KB, `tools/gallery/.../project.json` 696 KB, plus generated `.inc`/PNG files). Secondary themes are modest `playground_server.py` C/asm emitter duplication (with one genuine asm world-clamp parity gap), a handful of dead functions/exports, test-suite fixture boilerplate, and stale documentation (a 252 KB append-only changelog, five shipped plans left in `plans/current/`, and several broken/contradictory doc instructions).

## How to read this

- **Impact** — how much pain the issue causes (maintenance fan-out, repo size, contributor confusion, latent-bug risk). high / medium / low.
- **Risk** — chance that *fixing* it breaks something. low = mechanical/behaviour-preserving; high = touches shared behaviour, build paths, or pedagogy.
- **Effort** — work to implement the fix. low = minutes/one file; high = multi-file refactor needing careful diffing and test runs.
- **Confidence** — how sure we are the finding is real and the recommendation is correct.

All paths are repo-relative to `/home/duguid/projects/nesgame/attempt1`.

---

## Theme 1 — Committed build artifacts & repo hygiene

The highest impact-per-effort cleanup in the repo: regenerable outputs and bytecode that leaked into git. Most are pure `git rm --cached` operations.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| H1 | Runtime-generated gallery entry committed as source (696 KB `project.json`, the largest tracked blob); `tools/gallery/` is a live publish/remove dir not in `.gitignore`, so future pupil publishes become git churn | `tools/gallery/for-testing-62c9/{project.json,metadata.json,preview.png}` | medium | low | low | high | `git rm -r --cached tools/gallery/for-testing-62c9`; add `tools/gallery/` to `.gitignore` (keep dir live via server's `GALLERY_DIR.mkdir` or a `.gitkeep`). Nothing references this entry by name. |
| H2 | Large regenerable pupil fixtures committed (~784 KB): 596 KB JSON expansion of an 8 KB text source, plus two generated PNGs. Editor does NOT auto-load them at runtime (starter is `default-state.js`) | `assets/pupil/{my_project.json,palette_reference.png,preview.png}` | medium | medium | low | high | Keep only `my_tiles.txt`. `git rm --cached` the three derived files; gitignore them. Risk is medium because 4 docs tell pupils to import these — add a "run the generator first" step (`convert_my_tiles.py` / `generate_palette_reference.py`) to those guides. Middle ground: at minimum untrack the two PNGs. |
| H3 | Generated build outputs tracked despite "do not edit" headers; overwritten on every compile. `scene.inc` leaked past `.gitignore:6`; `palettes.inc` is tracked AND has **no** ignore rule | `steps/Step_Playground/src/scene.inc`, `steps/Step_Playground/src/palettes.inc` | low | low | low | high | `git rm --cached` both. `scene.inc` is already covered by `.gitignore:6`; `palettes.inc` needs a **new** rule (`palettes.inc`). Run one playground compile / `make -C steps/Step_Playground` first to confirm a clean checkout regenerates both. |
| H4 | Tracked CPython 3.13 bytecode — the only tracked `.pyc` in the repo, leaked past the `__pycache__/`+`*.pyc` rules by predating them | `tools/audio/__pycache__/diagnose_song.cpython-313.pyc` | low | low | low | high | `git rm --cached tools/audio/__pycache__/diagnose_song.cpython-313.pyc`. Existing ignore rules keep it out thereafter; no `.gitignore` change needed. |
| H5 | Stale committed linker-config backup, referenced by nothing; structurally different from current `nes.cfg` | `cfg/nes.cfg.bak` | low | low | low | high | `git rm cfg/nes.cfg.bak` (history preserved in git). Optionally add `*.bak` to `.gitignore`. (Fold into the H8 root-prototype decision if archiving root `cfg/`.) |

---

## Theme 2 — Editor HTML cross-page duplication

The seven pages under `tools/tile_editor_web/` maintain shared chrome and behaviour as hand-synchronised copies. Drift is not hypothetical (builder's `?stay=1` nav link, audio's mismatched `setStatus` signature, sprites' drifted undo/emulator/palette code, a shipped P2-key bug). Note: several extractions are interdependent — the `:root` CSS block, `#save-status` CSS, and `.palette-editor*` CSS should all land in one new `editor-chrome.css`.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| W1 | Global chrome CSS (theme `:root` vars, reset, buttons, dialog, header, nav) copied into all 7 pages with no shared `.css`. `:root` block is byte-identical; `.app-header`/`.page-link` are content-identical with whitespace/minor drift (gallery drops `flex-wrap`/`row-gap`) | `index/sprites/behaviour/builder/code/audio/gallery.html` (chrome `<style>` blocks, ~lines 9–130) | high | medium | medium | high | Create `editor-chrome.css` (theme vars, reset, base button/select/input, `.primary`, dialog/`::backdrop`, `.app-header`, `.page-nav`/`.page-link`, `#save-status`). Link from all 7 pages, delete duplicated rules, keep page-specific CSS inline. **Keep `:root` variable NAMES stable** — `a11y.js:78-99` high-contrast overrides depend on them. Reconcile the minor `.app-header`/gallery drift during extraction (not pure copy-paste). |
| W2 | Seven-link page-nav header HTML hand-copied into all 7 pages; real drift exists (builder's Code link uses `?stay=1`) | `index/sprites/behaviour/builder(:539)/code/audio(:209-215)/gallery.html` `<nav class="page-nav">` | medium | medium | medium | high | Render the nav from one shared module (small `nav.js` or extend `account-menu.js`) built from a single `PAGES` array, marking active via `location.pathname`, with per-link `href` overrides so builder keeps `code.html?stay=1`. Replace inline `<nav>` with a mount point. No nav test to update (`project-menu.mjs` does not assert nav HTML). |
| W3 | jsnes emulator/audio/keymap inlined (~200 lines each) in `sprites.html` and `code.html` instead of shared `emulator.js`; a real P2-key bug already shipped from the fork | `sprites.html:7261-7490`, `code.html:1716-1834`, `emulator.js` | high | medium | high | high | Migrate both pages to `<script src="emulator.js">` driving `window.Emulator.open(rom, opts)`; extend `emulator.js`'s public API rather than re-forking if they need a different host canvas. **Verify `emulator.js` self-loads jsnes via `ensureJsnes()` (emulator.js:28) before dropping the direct `jsnes.min.js` tag.** Verify with `emulator-p2-keys.mjs` + `render-*.mjs`. Do NOT touch vendored `jsnes.min.js`. |
| W4 | `createDefaultState`/`migrateState` + tile helpers inlined and drifted in 3 pages while `default-state.js` exists (index adds nametable resize + `bg_glyph_confirmed`; sprites carries animation migration behaviour lacks) | `index.html:1688,1732-1831`, `sprites.html:2654,2803-2973`, `behaviour.html:646,743-795`, `default-state.js:45-67` | high | medium | high | high | Consolidate into `default-state.js` taking the **superset** of migration logic; import into the 3 pages and delete inline copies, leaving thin page-specific wrappers. **Caution:** `project-menu.mjs` explicitly asserts behaviour keeps its own factory and only builder/code/audio import `default-state.js` — its `SHARED_FACTORY_PAGES` expectations must be updated. Diff all three `migrateState` bodies carefully; re-run `tools/builder-tests`. |
| W5 | `setStatus` + `#save-status` CSS + autosave (`markDirty`/`scheduleSave`/`updateSavedTimeLabel`) duplicated across state-editing pages; `audio.html` `setStatus(text, kind)` has a **different signature** | `index.html:2140`, `sprites.html:3215`, `behaviour.html:908`, `builder.html:769`, `audio.html:353`, `code.html` | medium | medium | medium | high | Extract `setStatus` + autosave glue into a shared module (extend `storage.js` or new `save-status.js`) taking a state-getter and the `#save-status` id; move `#save-status` CSS into `editor-chrome.css` (W1). **Reconcile audio's `(text, kind)` arg order during extraction** — do not assume callers match. |
| W6 | Palette-editor CSS (6 selectors, byte-identical) + ~9 JS helpers shared between index/sprites, partly drifted (`makePaletteSlot`, `renderPaletteEditor` have real per-page branches) | `index.html:2931,3082,3326`, `sprites.html:5167,5287,5298` | medium | medium | high | medium | Two-phase: (1) move `.palette-editor*` CSS into `editor-chrome.css` (safe, identical). (2) Extract only low-divergence helpers (`defaultBgPalettes`/`defaultSpritePalettes`, `persistPaletteEditor`, NES colour helpers) into `palette-editor.js`; keep `makePaletteSlot`/`renderPaletteEditor`/`renderPalettes` as thin per-page wrappers. Do NOT force-merge drifted branches. Coordinate the default-palette arrays with W4. |
| W7 | undo/redo/`pushUndo`/`updateUndoButtons` triplicated; index & behaviour byte-identical, sprites drifted (`cloneState` + `=== 0`) | `index.html:2082-2104`, `behaviour.html:859-881`, `sprites.html:3164-3186` | medium | low | medium | high | Extract `undo.js` exposing `makeUndoStack({getState,setState,limit})` → `pushUndo/undo/redo/updateUndoButtons` bound to `#btn-undo/#btn-redo`. Adopt the `cloneState` variant on all three; delete inline copies. Well-covered by undo/region tests — lowest-risk of this theme. |
| W8 | Projects-menu lifecycle (create/switch/duplicate/delete) inlined and drifted in index/sprites while 4 pages use `project-menu.js` + `storage.js`; the two paths are **behaviourally different** (index/sprites do in-place state swap preserving undo stacks; shared path does `window.location.reload()`) | `index.html:4139-4236`, `sprites.html:7992-8102`, `project-menu.js`, `storage.js:485`, `builder-tests/project-menu.mjs:1-58` | high | high | high | high | Larger than "call `ProjectMenu.wire`". First add a shared list-render+switch helper supporting **both** reload and in-place modes, then adopt it in index/sprites with the in-place callback (fold sprites' starter-hero seeding into a `makeFreshState` callback). Keep `project-menu.mjs` green and update its "Backgrounds + Sprites stay on inline handlers" note. Highest-risk item in this theme — plan carefully. |

---

## Theme 3 — Shared JS module duplication / dead code

`tools/tile_editor_web/*.js` modules carry an incomplete render-migration, one stale docstring, and several unused public exports. The dead exports are individually trivial but collectively imply test coverage that does not exist.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| J1 | `sprite-render.js` (NesRender) loaded by 6 pages but used only by builder; index/sprites/behaviour keep full inline copies of the byte-identical 64-entry palette table + rgb/pixel/draw helpers; **audio.html & code.html load it dead** | `sprite-render.js`, `builder.html:1222`, `index.html:1614,1632,2410`, `sprites.html:2587,3361,3366,4334`, `behaviour.html:570,588`, `audio.html:322`, `code.html:34` | medium | medium | medium | high | (1) Zero-risk now: delete the dead `<script src="sprite-render.js">` from `audio.html:322` and `code.html:34`. (2) Dedup the table/helpers in the 3 inline pages — note sprites' `spritePaletteFor`/`drawSpriteIntoCtx` have **different signatures** from the module (no naive find/replace); at minimum replace the verbatim `NES_PALETTE_RGB` with `window.NesRender.NES_PALETTE_RGB`. **Do NOT delete `sprite-render.js`** — ~12 test files + `run-all.mjs:68` depend on it. |
| J2 | `sprite-render.js` docstring claims sprites.html delegates to NesRender via thin wrappers — it never did (sprites defines its own helpers with different signatures) | `sprite-render.js:4,22-24` | low | low | low | high | Fix alongside J1: either make sprites actually delegate, or rewrite the docstring to state only builder.html consumes NesRender and the others keep inline copies. |
| J3 | `default-state.js` docstring claims it "mirrors the Sprites page (most complete)" but omits page-specific fields (`bg_glyph_confirmed`, `behaviour_types`/`behaviour_reactions`); inline copies have drifted | `default-state.js:7`, `index.html:1688`, `sprites.html:2654`, `behaviour.html:646` | low | low | low | high | Correct the docstring to describe it as a lowest-common-denominator blank project each page's `migrateState` upgrades. Respect `project-menu.mjs`'s intentional inline/shared split. Coordinate with W4. |
| J4 | Dead helper `BuilderAssembler.findSpriteByRole` (singular) — superseded by `findSpritesByRole` (plural); zero callers anywhere | `builder-assembler.js:95,194` | low | low | low | high | Delete the function (95-101) and remove from export (194). Future single-match need is `findSpritesByRole(...)[0]`. |
| J5 | Unused public exports across modules: `ProjectMenu.{openRecoveryDialog,wireNewButton}`, `AccountMenu.{_refreshMe,_api}`, `HelpPopover.PAGES`, `NesRender.{spritePaletteFor,NES_PALETTE_RGB}`, 5× `PlayPipeline._*` internals, `BuilderAssembler.stripSlotMarkers` | `project-menu.js:325`, `account-menu.js:393`, `help.js:163`, `sprite-render.js:113`, `play-pipeline.js:435`, `builder-assembler.js:193` | low | low | low | medium | Optional tidy: trim each to just the used entry point, keep the rest as module-locals. **Surgical** on NesRender — keep `nesRgb/bgPaletteFor/pixelRgb/drawSpriteIntoCtx` (live, asserted by `preview.mjs`). **Sequence with J1**: do not remove `NES_PALETTE_RGB` from the export if J1's lower-effort dedup references `window.NesRender.NES_PALETTE_RGB`. Re-grep each immediately before removal. |

---

## Theme 4 — playground_server.py duplication & dead code

`tools/playground_server.py` mixes data-computation with C-vs-ca65 output formatting in several emitter pairs. Only formatting should differ; the data logic is genuine copy-paste, and the scene emitter has already drifted into a real behavioural gap.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| P1 | Scene-data computation duplicated between C (`build_scene_inc`) and asm (`build_scene_asminc`) emitters; **already drifted** — C clamps positions to world bounds + emits 16-bit positions + `ss_anim` tables; asm only masks `& 0xFF` (real parity gap for multi-screen asm projects) | `playground_server.py:1004-1146`, `1510-1918` | high | medium | medium | high | Extract a pure `_scene_data(...) -> dict` (player tiles/attrs, anim tables, `ss_*` arrays) with the world-clamp applied once; make both builders thin formatters over it. This closes the asm parity gap. Keep C-only extras (P2, HUD icon, per-bg nametables, `ss_anim_frame/tick`) in `build_scene_inc`. **Preserve emitted identifier names** so the T7.6c parity guard (`run-all.mjs:205`) keeps passing. |
| P2 | Palette-table computation duplicated between `build_palettes_inc` and `build_palettes_asminc` (identical nested `emit()`, `ubg` calc, row construction; only `lines.append` vs `rows.append` differs) | `playground_server.py:947-966`, `973-1001` | medium | low | low | high | Extract `_palette_rows(state) -> list[list[int]]` (eight 4-byte rows); both builders format those rows in their own syntax. Removes the duplicated nested function. |
| P3 | Three ROM-build functions repeat the copytree preamble and the make/build-log/rom-check tail; audio-staging block duplicated. The two tempdir tails are character-identical; the shared-dir builder differs (runs under `BUILD_LOCK`, no tmp-prefix strip) | `playground_server.py:2621-2655`, `2658-2709`, `2712-2768` | medium | medium | medium | high | Extract `_run_make_and_collect(make_args, root, strip_prefix=False)` (prefix-strip is a **parameter** — shared-dir path has no tmp prefix) and `_clone_step_dir_with_assets(...)` for the two tempdir preambles; optionally `_stage_audio(...)`. Asm builder keeps its orphan-unlink + `ASM_MAKEFILE`. |
| P4 | `_hex_table` nested helper defined twice plus a third `arr()` variant, with subtly different signatures and empty-data handling | `playground_server.py:2141-2149`, `2338-2347` (+ `arr()` at 1823-1828) | low | low | medium | high | Add one module-level `_c_byte_array(name, data, size_expr=None, cols_per_line=16, qualifier='static const', ...)`; have all three callers delegate, normalising empty-data behaviour in one place. (Callers use different qualifiers — needs care.) |
| P5 | `_default_main_c` and `_default_main_s` are byte-identical static-file responders except the file constant + label | `playground_server.py:3341-3350`, `3352-3361` | low | low | low | high | Replace both with `_serve_text_file(self, path, label)` called from the two GET routes. Both routes stay live. |
| P6 | Dead function `_spawn_required()` — validation moved into `build_scene_inc` (BR-04 refactor); zero callers, no dynamic dispatch | `playground_server.py:1234-1239` | low | low | low | high | Delete lines 1234-1239. The live `_spawn_trigger_index`/`_spawn_hit_index`/`_spawn_art_*` helpers stay. |
| P7 | Dead function `_behaviour_world_map()` — superseded by per-bg `_behaviour_map_for_bg` (T2.2 refactor); zero callers | `playground_server.py:2017-2024` | low | low | low | high | Delete lines 2017-2024. `_behaviour_world_dims` and `_behaviour_map_for_bg` stay. |

---

## Theme 5 — Obsolete Python tooling & game source

A mix of one genuinely-dead demo, one legacy prototype with two divergent build paths, and several "do not delete" reference/legacy files recorded to prevent wrong cleanups.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| G1 | Orphaned `src/hello.c` — palette-only demo built by no Makefile, defines its own `main()` (cannot co-link with `src/main.c`), README never points to it | `src/hello.c`, `Makefile:34-35` | low | low | low | high | Delete `src/hello.c` (no build references it). If the intro is still wanted, move to `examples/` or `docs/snippets/`. A changelog doc links to it — accept the historical dead link or update it. |
| G2 | Repo-root `src/` + `Makefile` + `cfg/` is a legacy prototype duplicating Step_1: `graphics.s` + `walk1.chr` byte-identical to Step_1; root `main.c` diverges functionally at the vectors section and lacks teaching comments; **root `.` build path is exposed in BOTH workspaces** | `src/main.c`, `src/graphics.s`, `Makefile`, `cfg/nes.cfg`, `assets/sprites/walk1.chr`, `nesgame_pupil.code-workspace:4`, `nesgame_teacher.code-workspace:4` | medium | medium | medium | high | Decide explicitly. Preferred: archive/delete the root prototype (`src/main.c`, `src/graphics.s`, `Makefile`, `cfg/nes.cfg`, `cfg/nes.cfg.bak`, root `walk1.chr`) now that Step_1 is canonical, and drop the root `.` folder from **both** workspace files. **KEEP `src/reset.s`** (G3). Or move under `examples/standalone/`. Medium risk — both workspaces and `files.exclude`/guide behaviour may rely on root layout. |
| G3 | `src/reset.s` is a documented reference NMI/startup model compiled by no build; the misleading `src/main.c:293` comment claims vectors come from it when the build uses stock crt0 | `src/reset.s`, `Makefile:35`, `src/main.c:293` | low | low | low | high | Do NOT delete (referenced as reference material across 4 plan/reference/guide docs). Fix the stale comment: state the build uses cc65's stock `nes.lib` crt0 and `reset.s` is a separate reference model — or add a "reference only — not compiled" banner to `reset.s`. Preserve `reset.s` even if G2 archives the rest of root `src/`. |
| G4 | `graphics.s` byte-identical across Step_2..Step_5 (intentional self-contained teaching copies; a fix must be applied in up to 4 places) | `steps/Step_2..5/src/graphics.s`, `src/graphics.s`, `steps/Step_1/src/graphics.s` | low | medium | medium | high | Awareness-only — **leave as-is** (self-containment is by design). If maintenance grows, consider a shared `steps/_shared/graphics.s` pulled in via each Makefile by relative path (precedent: `Step_Playground/Makefile:47` does this for FamiStudio). Do NOT collapse per-step `main.c` — its divergence is the lesson. |
| G5 | Two parallel NES engines feed two editor pipelines (`builder-templates/platformer.c` 2053 lines via the Builder; `Step_Playground/src/main.c` 779 lines via the Code page) — intentional, but a long-term drift hazard | `tools/tile_editor_web/builder-templates/platformer.c`, `steps/Step_Playground/src/main.c`, `builder-modules.js:207` | medium | high | high | high | Do NOT delete or naively merge. Architectural item: continue the documented codegen consolidation toward one physics source of truth, or add a cross-linking CI check/comment so a change to one prompts review of the other. Medium-term, not a quick cleanup. |
| G6 | `tools/tile_editor.py` (578 lines) looks like an obsolete desktop GUI but is a headless argparse CLI text-format parser/renderer imported as a library by `convert_my_tiles.py` and `generate_palette_reference.py`, and a documented maintained pupil workflow | `tools/tile_editor.py`, `convert_my_tiles.py:29,248`, `generate_palette_reference.py:16`, `README.md:208`, guides | low | high | low | high | **Do NOT delete** (deletion breaks two importers + a supported path). Recorded to block wrong cleanup. Optional naming-only tidy: rename to `tile_text_renderer.py` and update ~5 references to reduce "obsolete desktop app" confusion. |
| G7 | NES 2-bit planar tile codec hand-reimplemented in three standalone scripts (two identical encoders + one inverse decoder); exactly the easy-to-drift bit-twiddling that already had a CHR-padding bug | `tools/generate_chr.py:17-34`, `tools/png2chr.py:73-88`, `tools/generate_slide_assets.py:94-110` | low | low | low | high | Extract a dependency-free `tools/chr_codec.py` (`pixels_to_tile(rows)->bytes`, `decode_tile(bytes)->rows`); import from all three. Keep it Pillow-free so `generate_chr.py` gains no dependency (sys.path idiom already used in `convert_my_tiles.py:27-29`). |

---

## Theme 6 — Test suite redundancy

`tools/builder-tests/` is largely healthy (auto-discovered, per-suite runnable). The issues are pre-harness fixture boilerplate, one near-duplicate suite, one port collision, and a mild racer overlap.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| T1 | ~1/3 of suites re-implement `mkCells`/`blankPool`/module-loader/server-spawn that `lib/render-harness.mjs` already exports (18 local `mkCells`, 22 local loaders, 17 inline `python3` spawns). Inline-spawn suites also miss the harness's temp-DB isolation (they touch the real `accounts.db`) | `lib/render-harness.mjs:41-82,227-248`, plus `all-modules/chunk-a/player2/topdown/round1-3/respawn-hp.mjs` and others | medium | low | medium | high | Incrementally migrate pre-harness suites to `H.loadBuilderModules`/`H.readTemplate`/`H.startServer`/`H.stopServer`/`H.mkCells`/`H.blankPool` — `startServer` adds temp-DB isolation for free. One suite at a time, re-run `node tools/builder-tests/<file>` after each. Skip the 26 already on the harness; loader-only for the parse/validator suites. |
| T2 | `all-modules.mjs` is a subset of `_rom-equiv.mjs` — same ~75-line everything-on fixture; the SHA1 hash assertion strictly supersedes all-modules' `r.ok`; only unique value is the validator no-errors check | `all-modules.mjs:41-114,148-170`, `_rom-equiv.mjs:34-117` | medium | low | medium | high | Prefer extracting `makeEverythingState`/`mkCells`/`blankPool` into a shared fixture module so the project is defined once (lower doc churn). Full merge is possible (fold all-modules' validator check into `_rom-equiv`, delete all-modules) **but `all-modules.mjs` is referenced by name in ~10 places across `docs/plans/current/`** as a re-run step — those must be updated in the same commit. |
| T3 | `promote-roundtrip.mjs` and `racer.mjs` both hard-code PORT 18839 — the only duplicated port in the suite; harmless under the sequential runner but a latent EADDRINUSE / invariant break | `promote-roundtrip.mjs:13`, `racer.mjs:17` | low | low | low | high | Bump one to a free port. Current max is 18862 (`account-projects.mjs`), so use **18863+**. One-line edit. |
| T4 | `racer-laps.mjs` and `racer-checkpoints.mjs` overlap on a single base lap-count assertion | `racer-laps.mjs`, `racer-checkpoints.mjs` | low | high | low | low | **Leave both.** The "strict superset" framing is wrong — they exercise different config paths (default 1-checkpoint vs `racerCheckpoints:2`) and racer-laps uniquely tests anti-farm/win/freeze. Trimming would lose coverage. Monitor for drift only. |

---

## Theme 7 — Documentation bloat & staleness

Docs are the largest staleness surface: completed plans left in `current/`, a quarter-MB append-only changelog, contradictory changelog-order guidance, a stale teacher roadmap, and broken slide paths. Most are zero-risk one-line edits; the plan-archive move is the only coordinated one.

| ID | Issue | Locations | Impact | Risk | Effort | Confidence | Recommendation |
|---|---|---|---|---|---|---|---|
| D1 | Five plan docs marked IMPLEMENTED/SHIPPED still sit in `plans/current/` (the doc's own definition puts superseded plans in `archive/`) | `docs/plans/current/2026-06-18-arc-{a,b,c}*.md`, `2026-06-20-bug-report-fix-plan.md`, `2026-06-18-codegen-rework-implementation.md`, `docs/README.md:14-15` | medium | medium | medium | high | `git mv` the five into `docs/plans/archive/` (keep names). It's a **move, not a delete** — they're cross-referenced from ~14 code/test files (D2), so update those references and add archive rows to the `docs/README.md` inventory **in the same commit**. |
| D2 | Code/tests reference `docs/plans/current/*.md` by path (comment-only); archiving D1 without updating them creates dangling links. This is the constraint on D1, not a standalone defect | 13 `builder-tests/*.mjs` (e.g. `render-walker-wall-stop.mjs:12`) + `lib/render-harness.mjs:5`; also `playground_server.py:629`, `all-modules.mjs:10`, `dialogue-font.mjs:9` for the codegen doc | low | low | low | high | If/when D1 proceeds, `grep -rl 'plans/current/<slug>'` and rewrite each comment to `plans/archive/<slug>` in the same commit. Pure comment edits. If D1 is not done, no action. |
| D3 | `changelog-implemented.md` is one 252 KB / 4870-line append-only file (64 sections); awkward to diff/review/load | `docs/changelog/changelog-implemented.md` | low | low | medium | medium | Only if it keeps growing: split per-period (`2026-04.md`/`2026-06.md`) with an index, or add a date-bucketed TOC. **Do NOT trim history.** Update the 2 comment refs + `docs/README.md:17` if the canonical filename changes. |
| D4 | `docs/README.md` says the changelog is "newest at the bottom" / "append" but it is actually newest-at-top (entries are prepended) — wrong contributor guidance | `docs/README.md:17,33`, `changelog-implemented.md:24,4787` | low | low | low | high | One-line edits: "newest at the bottom" → "newest at the top"; "Append a line…" → "Prepend a section at the top…". |
| D5 | `TEACHER_GUIDE` "Future development roadmap" lists already-shipped features (scrolling, enemies, attack, HP, audio) as future work — actively misleading to teachers | `docs/guides/TEACHER_GUIDE.md:838-858` | medium | low | low | high | Mark items 4-9 DONE (verified shipped in changelog) and keep only genuinely-future items 10-11 (bank switching/MMC1, overworld map); or replace with a pointer to the master plan. Verify each against the changelog before deleting. |
| D6 | `slides/README.md` uses pre-reorg `slides/step1.md` paths that don't resolve from repo root (the files moved to `docs/guides/slides/`) | `docs/guides/slides/README.md:13,20,21,27` (+ prose at :34) | low | low | low | high | Update the four path references to `docs/guides/slides/step1.md` (or note cwd assumption). Trivial. |
| D7 | A fix-PLAN doc is filed under `docs/changelog/` (a "what shipped" folder); three loose 2026-06-15 files are absent from the `docs/README.md` inventory | `docs/changelog/2026-06-15-{undocumented-issues-fix-plan,bug-sweep,undocumented-issues}.md`, `docs/README.md:17` | low | low | low | medium | Either (a) `git mv` the fix-plan to `docs/plans/archive/` and fix its companion relative links to the siblings; or (b) accept the grouping and add a `docs/README.md` row documenting these files. |
| D8 | Stale README docstrings on `sprite-render.js`/`default-state.js` — see J2, J3 | (see J2, J3) | low | low | low | high | Handled under Theme 3 (J2, J3). |
| D9 | Controller/key-binding tables overlap between README (FCEUX single-player) and BUILDER_GUIDE (browser dual-player) — audience-tailored, materially different, **not** the "triplicated" table originally claimed | `README.md:38-50`, `docs/guides/BUILDER_GUIDE.md:241-257` | low | low | low | medium | **Leave as-is** — intentional teaching repetition. Only these two tables genuinely overlap; apply any future default-binding change to both. Do NOT merge PUPIL_GUIDE C bit-codes or TEACHER_GUIDE serial-protocol content into a controls table. |

---

## Prioritized Action Plan

### Quick wins — high/medium impact, low risk (do first)
1. **Purge committed build artifacts (H1–H5).** Run, then commit together:
   - `git rm -r --cached tools/gallery/for-testing-62c9` and add `tools/gallery/` to `.gitignore`.
   - `git rm --cached assets/pupil/my_project.json assets/pupil/palette_reference.png assets/pupil/preview.png` and gitignore them (add a "generate first" note to the 4 guides — H2's only real cost).
   - `git rm --cached steps/Step_Playground/src/scene.inc steps/Step_Playground/src/palettes.inc`; add a new `palettes.inc` ignore rule; verify `make -C steps/Step_Playground` regenerates after a server compile.
   - `git rm --cached tools/audio/__pycache__/diagnose_song.cpython-313.pyc`.
   - `git rm cfg/nes.cfg.bak` (optionally add `*.bak` to `.gitignore`).
   - *Reclaims ~2 MB and stops ongoing gallery/`.inc` churn.*
2. **Doc one-liners (D4, D5, D6).** Fix the changelog newest-at-top guidance; mark TEACHER_GUIDE roadmap items 4-9 DONE; fix the four slide paths. Zero risk.
3. **Delete dead code (P6, P7, J4, G1).** Remove `_spawn_required`, `_behaviour_world_map`, `BuilderAssembler.findSpriteByRole`, `src/hello.c` — all verified zero-caller. Re-grep each immediately before deleting.
4. **Fix stale docstrings & misleading comments (J2, J3, G3).** Correct `sprite-render.js` and `default-state.js` headers; fix `src/main.c:293` vectors comment (or banner `reset.s`).
5. **Fix the port collision (T3).** Bump `racer.mjs` (or `promote-roundtrip.mjs`) PORT to 18863+.
6. **Remove dead `<script>` tags (J1 part 1).** Delete `sprite-render.js` script tags from `audio.html:322` and `code.html:34` — verified zero-risk.

### Medium — solid impact, contained risk
7. **Extract `editor-chrome.css` (W1).** The keystone refactor: pull the byte-identical `:root` block + reset + base controls + `.app-header`/`.page-nav`/`#save-status`/`.palette-editor*` CSS into one file linked by all 7 pages. Keep `:root` names stable (a11y.js). Reconcile minor `.app-header`/gallery drift. Unblocks W5/W6 CSS halves.
8. **Extract `undo.js` (W7).** Small, test-covered, isolated; adopt the `cloneState` variant on all three pages.
9. **Refactor playground emitters (P2, then P1).** Start with `_palette_rows` (P2, low risk), then `_scene_data` (P1) — the latter closes the real asm world-clamp parity gap. Preserve emitted identifier names for the T7.6c guard.
10. **De-boilerplate tests (T1, T2).** Migrate pre-harness suites to `lib/render-harness.mjs` one at a time (gains temp-DB isolation); extract the shared everything-on fixture for T2.
11. **Server build-fn + helper dedup (P3, P4, P5).** `_run_make_and_collect`/`_clone_step_dir_with_assets`, `_c_byte_array`, `_serve_text_file`.
12. **CHR codec module (G7).** Extract `tools/chr_codec.py`, import from the three scripts.
13. **Archive shipped plans (D1 + D2).** `git mv` the five completed plans to `archive/`, sweep the ~14 path references, update `docs/README.md` — one atomic commit. (Optionally D7, D3 in the same docs pass.)
14. **Shared nav module (W2).** Render the 7-link tab bar from one `PAGES` array with per-link href overrides.
15. **Trim unused exports (J5).** Surgical — keep live NesRender members; sequence with J1.

### Higher-risk / structural (plan carefully, behaviour-preserving)
16. **Consolidate state factory/migration (W4).** Superset merge into `default-state.js`; update `project-menu.mjs` `SHARED_FACTORY_PAGES`; diff all three `migrateState` bodies; re-run builder-tests.
17. **Unify the emulator fork (W3).** Move sprites/code onto `emulator.js`; verify `ensureJsnes` self-loads jsnes before dropping the direct tag; verify against `emulator-p2-keys.mjs`.
18. **Palette-editor partial extraction (W6).** CSS via W1; only low-divergence helpers shared; drifted renderers stay as wrappers.
19. **Projects-menu convergence (W8).** Requires a dual-mode (reload + in-place) shared helper to avoid regressing index/sprites' undo-preserving in-place swap. Highest behavioural risk of the editor work.
20. **Root prototype decision (G2).** Archive/delete root `src/`+`Makefile`+`cfg/` and drop `.` from both workspaces — **but keep `reset.s`** (G3). Medium risk: both workspaces and `files.exclude` may rely on root layout.
21. **Engine reconciliation (G5).** Long-term: continue codegen consolidation so the two engines share one physics source of truth. Architectural, not a cleanup sprint.

---

## Impact vs Risk matrix

**High/medium impact — LOW risk → do first:**
H1, H2 (with doc note), H3, P2, T1, T2, D5, J1(part 1) — plus all the trivial dead-code/doc one-liners (P6, P7, J4, G1, J2, J3, D4, D6, T3).

**High impact — MEDIUM/HIGH risk → plan carefully:**
W1 (medium), W3 (high), W4 (high), W8 (high), P1 (medium), P3 (medium), G2 (medium), D1 (medium), G5 (architectural).

**Low impact → optional / opportunistic:**
W7, W6, J5, P4, P5, G7, D3, D7, D9, J5, T4 (explicitly leave), G4 (awareness-only).

---

## Explicitly NOT recommended / verify-first

The adversarial verifier **refuted no findings outright** (the refuted list is empty), but it downgraded or carved out several into "do not act / do not delete" — recorded here so they are not re-raised:

- **Do NOT delete `tools/tile_editor.py` (G6).** Looks like an obsolete desktop GUI; it is actually a headless CLI library imported by `convert_my_tiles.py` and `generate_palette_reference.py` and a documented pupil workflow. At most rename for clarity.
- **Do NOT delete `src/reset.s` (G3).** Reference NMI/startup model cited across 4 docs; preserve it even if the rest of root `src/` is archived (G2). Fix only the misleading comment.
- **Do NOT delete `sprite-render.js` (J1).** Depended on by ~12 test files + `run-all.mjs:68`; only the dead `<script>` tags and inline duplicates are candidates.
- **Do NOT collapse per-step `graphics.s`/`main.c` (G4).** The self-containment and per-step `main.c` divergence are the pedagogy; awareness-only.
- **Do NOT naively merge the two engines (G5).** `platformer.c` and `Step_Playground/main.c` are intentional parallel pipelines; treat as a tracked architectural item.
- **Do NOT trim `racer-laps.mjs` against `racer-checkpoints.mjs` (T4).** The "strict superset" claim is false — they cover different racer config paths; trimming loses coverage. Leave both.
- **Do NOT merge the controls tables / treat them as "triplicated" (D9).** README (FCEUX single-player) and BUILDER_GUIDE (browser dual-player) tables are materially different and audience-tailored; PUPIL_GUIDE bit-codes and TEACHER_GUIDE serial-protocol content are not the same table at all.
- **Do NOT remove `NesRender.NES_PALETTE_RGB` from the export (J5) if J1's lower-effort dedup path uses it** — sequence the two findings together.
- **W8 / W3 are not "import + delete".** The inline project-menu (in-place undo-preserving swap vs reload) and the emulator fork (different host canvas, jsnes self-load) carry real behavioural differences; converging them changes behaviour unless done with a compatibility shim.