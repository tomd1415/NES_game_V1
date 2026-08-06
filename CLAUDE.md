# Project guide for AI/dev sessions

A NES game-maker for schools: a browser editor (`tools/tile_editor_web/`) +
a Python build server (`tools/playground_server.py`) that runs **cc65** to
produce real `.nes` ROMs. Two front-ends exist today: the original seven
pages (default) and the new unified **Studio** (`studio.html`), which shipped
via the `redesign/ui-ux` → `main` merge.

## ⚠️ The NES engine is VERSIONED — read before changing ROM output

The **engine** = the C templates (`tools/tile_editor_web/builder-templates/`),
the assembler (`builder-assembler.js`), and the cc65 project
(`steps/Step_Playground/` + the server's codegen). If you change anything
that alters ROM output or the project↔ROM contract, you **must**:

1. Bump `tools/engines/ENGINE_VERSION` **and**
   `tools/tile_editor_web/engine-version.js` (keep the integers equal).
2. Add an entry to `tools/engines/CHANGELOG.md` (Added / Changed-migration /
   Breaking).
3. Run `node scripts/snapshot-engine.mjs` to freeze the new `tools/engines/v<N>/`.

`node tools/builder-tests/run-all.mjs` fails if the two version constants
disagree or the current snapshot drifts from git HEAD. New projects are
stamped `state.engineVersion`; snapshots let a future engine rebuild a game
with the engine it was authored for (rollback/fallback). Full design:
[`docs/design/engine-versioning.md`](docs/design/engine-versioning.md);
workflow: [`tools/engines/README.md`](tools/engines/README.md).

> Engine-source files under `steps/Step_Playground/src/` (behaviour.c,
> bg_world.*, scene.inc, main.c, level.nam, …) are **regenerated per build**
> by the server — they show as `M` in `git status` after any `/play`. Don't
> commit those build-mutations; the snapshot reads from HEAD to stay stable.

## The native Linux app (`native/`)

A **third front-end**: a PySide6/Qt desktop sibling of the web Studio, sharing the
project/engine/ROM contracts (`native/tests/contract/` is *intended* to prove both
targets emit byte-identical ROMs **and** report identical validator output — as of
2026-08-06 the ROM half does not actually execute; see the Active thread below). It plays games
in-app via an **embedded NES core** (`native/nes_core/`, a PyO3 binding around
tetanes-core). Eight modes, each in `native/src/nes_studio/ui/modes/<mode>.py`
behind the protocol in `modes/base.py`; the shell owns no editor.

Start at [`docs/plans/current/2026-07-14-native-build-plan.md`](docs/plans/current/2026-07-14-native-build-plan.md)
— what was built, why, and what is honestly still missing. Setup and traps:
[`native/README.md`](native/README.md).

> **Adding a native mode** = a new class in `ui/modes/`, added to `MODE_CLASSES`.
> Populate every `QComboBox` **before** connecting its signals: adding the first
> item to an empty one fires `currentIndexChanged`, and a handler that calls
> `refresh()` will re-enter the mode's own constructor.

> **⚠ Licensing.** The repo is **MIT**, and so is every dependency. The NES core is
> `MIT OR Apache-2.0` *deliberately* — every mature libretro core (fceumm,
> nestopia, quicknes = GPLv2; Mesen = GPLv3) would relicense the product. jsnes is
> Apache-2.0, so the web is clean too. Do not swap the core without reading
> [`native/nes_core/README.md`](native/nes_core/README.md).

## Tests (keep green)

- **Node build/regression:** `node tools/builder-tests/run-all.mjs` — includes
  golden/byte-identical-ROM hashes; the lever that keeps engine changes safe
  is that unused features are stripped by the preprocessor/cc65 so ROMs stay
  byte-identical (gate new engine behaviour behind an off-by-default flag).
- **Studio E2E:** `npx playwright test` from repo root (config auto-boots the
  server). Specs in `tools/studio-tests/`.
- **Native:** `cd native && QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest`
  (404 tests, ~5 min).

  Three hard-won rules for native tests. The suite was once **fully green while the
  app rendered a transparent emulator frame, a white-on-white panel, and crashed on
  every background switch** — because the tests asserted `document.field == X` and
  never asserted that anything *rendered*. So: **assert pixels, not document
  fields**, for anything visual (`assertRenders()` in `tests/ui/support.py`).
  **Destroy your windows, don't just close them** — `processEvents()` does not
  deliver `DeferredDelete`, so `deleteLater()` alone frees nothing, and a leaked
  `MainWindow` keeps ~1,170 widgets that every later `setStyleSheet()` re-polishes;
  use `StudioTest._dispose`. And **never put expensive work in a refresh that runs
  for a mode nobody is looking at** — CODE's refresh invokes the cc65 codegen.
  (Three more traps, with the tests that guard them, are listed in
  [`native/README.md`](native/README.md#six-traps-all-of-which-have-bitten).)

## Where to start

- **Active thread (2026-08-06):** `main` (engine v75) is merged into the native
  branch and the v64–v75 codegen port into `nes_studio_core` is **done** — builder
  suite green. The native suite has now been **partially** run in the `nesnative`
  container (`pytest` was there all along; only PySide6 and a browser binary are
  missing): 189 pass, 149 skip, and **two real failures** — the native baseline
  manifest is still pinned to engine v63, and the seven `game.nes` starter-fixture
  baselines were never committed because `.gitignore:3` is `*.nes`, so the
  cross-target ROM assertion has never executed. Treat "both targets emit
  byte-identical ROMs" as **unproven** until those are fixed. Studio E2E still
  unrun (no Chromium). See
  [`docs/handoffs/2026-07-28-native-main-integration.md`](docs/handoffs/2026-07-28-native-main-integration.md)
  and [`docs/guides/LESSONS_LEARNT.md`](docs/guides/LESSONS_LEARNT.md). The
  ordered route from here to a defensible merge, with acceptance checks and the
  two owner decisions marked, is
  [`docs/plans/current/2026-08-06-close-out-native-branch.md`](docs/plans/current/2026-08-06-close-out-native-branch.md).
  Remove this line when both suites have run clean.
- Docs index: [`docs/README.md`](docs/README.md).
- Studio redesign status: `docs/plans/current/2026-07-05-studio-redesign.md`.
- Native Linux app: `docs/plans/current/2026-07-14-native-build-plan.md`.
- Engine work sequencing/risk:
  `docs/design/decisions/2026-07-05-engine-items-feasibility.md`.
