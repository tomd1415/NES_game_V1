# NES Studio — native Linux application

The genuine native Linux sibling of the web Studio. PySide6/Qt Widgets, sharing
the project, engine and ROM contracts with the browser product — `tests/contract/`
is where the two targets are held to **byte-identical ROMs** and **identical
validation problems**.

> ⚠ **As of 2026-08-06 the ROM half of that is not actually running.** The seven
> `game.nes` baselines it compares against were never committed (`.gitignore:3` is
> `*.nes`), and the native baseline manifest is still pinned to engine v63 while
> the engine is at v75. Both are listed under "Known failures" below. Do not quote
> the byte-identical claim as established until they are fixed.
>
> The **validator** half is fine, and was re-run to confirm it:
> `tests/contract/test_validator_parity.py` → *2 passed, 31 subtests passed* in
> 1.07 s, running the real `builder-validators.js` in node and diffing it against
> the Python. That one is doing its job.

Build order and current state:
[`docs/plans/current/2026-07-14-native-build-plan.md`](../docs/plans/current/2026-07-14-native-build-plan.md).

## Running it

```bash
native/.venv/bin/nes-studio
```

## What works today

- **The game runs in the Studio.** ▶ Play builds the ROM if needed and plays it in
  the CRT stage, with audio and two-player input, via an embedded NES core
  (`nes_core/`). FCEUX is now only an optional "Open in FCEUX".
- **Eight modes**, each owning its own editor and its own inspector dock:
  WORLD, CHARS, TILES, PALS, STYLE, RULES, SOUND, CODE.
- **WORLD shows the real game** — actual tile art and palettes, entities drawn as
  their own sprites, 2×2 attribute conflicts flagged on-canvas, right-click
  eyedropper, zoom, and a full-screen preview (F11).
- **CHARS is a drawing canvas.** You paint the character, and the pixel lands in
  whichever 8×8 tile owns it — through cell flips, and stopping to ask when that
  tile belongs to another character too ("Used by Villager… Duplicate first /
  Change everywhere / Cancel").
- **Validators**: ~30 checks ported from the web, each with a **Fix in ‹Mode› →**
  button that takes you to the mode that can fix it.
- **Budget meters**: background tiles N/256, sprite tiles N/256, sprites on screen
  N/64 (OAM), audio N/32 KB.
- **Guided tutorials** (6), whose steps advance on their own and whose "Show me"
  flashes the *real control*, where it lives.
- **Time Machine** (`Ctrl+H`): browse and restore the snapshots the store has
  always taken. Restoring is an *edit*, so `Ctrl+Z` really does bring your version
  back.
- **Expertise levels** (Beginner / Maker / Advanced) gate the modes. A locked mode
  stays **visible**, with a padlock and a nudge, rather than disappearing.
- **Undo/redo in every mode** (40 deep), grouping a paint drag into one step, and
  surviving a switch of screen or background.
- **Asset import/export**: `.chr`, `.pal`, `.nam`, both ways.
- **Accessibility**: text scale, high contrast, reduced flashing while playing.
- Persistence: SQLite store, 500 ms debounced saves, 30 s deduplicated snapshots,
  atomic import/export, XDG recovery.
- **Desktop integration**: an app icon, mode-rail icons, a `.desktop` launcher
  entry and AppStream metainfo. Install with
  `packaging/install-desktop-entry.sh` (no root needed; `--uninstall` reverses
  it). The icons are generated from NES pixel art by `scripts/generate_icons.py`,
  and every colour in them is an index into the real NES system palette.

## What is not there yet

- No gallery / accounts / cloud publish — a deliberate deferral (server-coupled).
- SOUND has no on-host player: a `.s` file is ca65 assembly for the APU and there
  is nothing on a PC that can play it. "Hear this song" therefore builds a
  **throwaway** ROM that starts with it and plays that; your project is not
  changed. A real on-host preview would need an APU-only harness around
  `nes_core`.
- Editing a tile in TILES does not live-repaint an *already open* WORLD — but only
  one mode is visible at a time and every mode refreshes when opened, so this is
  close to moot. See the follow-through plan for why it is a deliberate deferral.

## Keyboard

| Key | Action |
| --- | --- |
| `1`–`8` | Switch mode (disabled while a game is running) |
| `Ctrl+S` | Save (flushes to the local store) |
| `F5` / `F6` | Build ROM / Play |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+M` | My Games |
| `Ctrl+H` | Time Machine |
| `Ctrl+,` | Preferences |
| `F11` | Full-screen WORLD preview |
| `Escape` | Stop the running game |

While playing, controls match the web exactly so pupils do not relearn them:
P1 = arrows, `F`=A, `D`=B, `Enter`=Start; P2 = `I/J/K/L`, `O`=A, `U`=B, `1`=Start.

## Architecture

The shell owns the chrome and **no editor**. It was once 3,008 lines and 176
methods with all seven modes built inline in a single 597-line method; adding a
mode meant editing four places in one file.

```
nes_studio/
  ui/
    main_window.py     The shell: app bar, rail, stage, dock host. ~800 lines.
    modes/             One module per mode, behind the protocol in base.py.
      base.py          Mode + ModeContext + Level
      world.py chars.py tiles.py pals.py style.py rules.py sound.py code.py
    build_play.py      Threaded cc65 build; playing the ROM in the stage
    project_actions.py New / open / save / catalog / time machine
    attention.py       Quests + validator problems, with their Fix-in buttons
    tutorial.py        The step runner, and the "Show me" that flashes a control
    theme.py           resources/theme.qss + accessibility preferences
    icons.py           Generated NES pixel-art icons (scripts/generate_icons.py)
    widgets/           world_canvas, sprite_canvas, budget, forms, visuals, …
  core/
    validators.py      ~30 checks, contract-tested against the web's JS
    tutorials.py       Declarative tutorials; re-baselined, lenient checks
    assets.py          .chr / .pal / .nam
  render/ emulator/ state/ persistence/ codegen/ integrations/
  resources/icons/     Generated PNGs; regenerate with scripts/generate_icons.py
packaging/             .desktop entry, AppStream metainfo, installer
```

A mode implements `build_dock()`, `refresh()`, optionally `stage_widget()`, and
reaches the project only through `ModeContext` — never by caching the document,
which an undo or a project switch would strand.

## Development setup

Requires Python 3.11+ and the matching `venv` package.

```bash
cd native
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e ../tools          # nes-studio-build-core — see below
python -m pip install -e '.[dev]' --find-links nes_core/dist
nes-studio
```

**The `../tools` line is not optional.** `nes-studio-build-core` (the shared build
core in the repo's `tools/` directory, which `tools/playground_server.py` also
imports) is a hard dependency in `pyproject.toml` and is **not on PyPI**, and
`--find-links nes_core/dist` does not supply it. Install it first or the second
command cannot resolve its dependency graph.

`--find-links nes_core/dist` is required for the same class of reason: the
embedded NES core is a **vendored wheel**, not a PyPI package. It is self-contained (`manylinux`, abi3), so the
target machine needs **no Rust, no compiler and no apt packages** — which is the
point for locked-down school images.

Do not commit `.venv` or downloaded wheels.

### Rebuilding the NES core

Only needed if you change `nes_core/src/lib.rs`. Needs Rust ≥ 1.85 on the *build*
machine.

```bash
cd native/nes_core
pip install maturin                        # NOT in .venv — see below
maturin build --release --out dist
../.venv/bin/pip install --force-reinstall dist/*.whl
```

`maturin` is a **build-system** requirement of `nes_core/pyproject.toml`, which
means PEP 517 fetches it into a throwaway isolated environment at build time. It
is *not* a dependency of the native app, so `.venv/bin/maturin` does not exist
after the setup above — install it wherever you like (a pipx install is tidy) and
run it from there.

See [`nes_core/README.md`](nes_core/README.md) — it documents two traps that will
bite you (a panicking audio API, and an alpha byte that renders every frame
transparent).

## Tests

```bash
cd native
QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest
```

**404 tests, ~5 minutes** (last measured with the full venv; unverified since).

### Running it without PySide6

Most of the suite works on a headless box with nothing but `python3`, `node`,
`cc65` and a `pytest` on `$PATH` — useful in a dev container where PySide6 is not
installed:

```bash
cd native
pytest -q --continue-on-collection-errors
```

Expect roughly `189 passed, 149 skipped` in about six seconds, plus noise you have
to learn to read:

* **149 skips** are correct — `tests/ui/support.py` guards `StudioTest` with
  `@unittest.skipUnless(PYSIDE_AVAILABLE, …)`.
* **12 collection errors** are *not* real: those modules import PySide6 at module
  scope, so they error instead of skipping. Likewise
  `tests/contract/test_palette_parity.py` (×2) and `tests/unit/test_icons.py` (×1)
  import it inside the test body and therefore report as ordinary **failures**.
  Three of the eleven "failures" you will see are this.

### Known failures (2026-08-06, both real)

1. `tests/contract/test_baseline_manifest.py::test_manifest_tracks_the_live_engine_baseline`
   — `63 != 75`. `tests/contract/baseline-v63.json` was frozen at engine v63 and
   the engine is now v75. Needs a re-baseline, which is a product decision (what
   the v75 native baseline *should* be), not a number to edit.
2. `tests/contract/test_phase0_starter_fixtures.py::test_artifact_hashes_and_input_immutability_match`
   — `FileNotFoundError` on all seven fixtures. `game.nes` is matched by
   `.gitignore:3` (`*.nes`) and no `.nes` file is tracked anywhere in the repo, so
   the ROM baselines never landed. The other three artefacts per fixture (`.gz`)
   are committed, which is why the directory looks complete. Fixing it needs a
   `!` un-ignore for the fixture path *and* a trustworthy set of baseline ROMs.

| Directory | Holds |
| --- | --- |
| `tests/contract/` | Cross-target invariants: ROM/codegen parity with the web, the NES palette table, and **validator parity** (runs the real `builder-validators.js` in node and diffs it against the Python). **The most valuable tests here.** |
| `tests/unit/` | Document, persistence, renderer (pixel assertions), emulator, validators, assets, tutorials, budget meters. |
| `tests/ui/` | One file per mode, plus the shell, the attention panel, the tutorial, undo, the Time Machine, **real mouse events** (`test_mouse.py`) and **failure paths** (`test_failure_paths.py`). |

### Six traps, all of which have bitten

1. **Assert pixels, not document fields.** The suite was once fully green while
   the app rendered a transparent emulator frame, a white-on-white PALS panel, and
   crashed on every background switch — because every test asserted
   `document.field == X` and none asserted that anything had been *drawn*. Use
   `assertRenders()` from `tests/ui/support.py` for anything visual.
2. **Destroy your windows, do not merely close them.** `processEvents()` does
   **not** deliver `DeferredDelete`, so `deleteLater()` alone frees nothing. A
   leaked `MainWindow` keeps ~1,170 widgets alive, and the theme is applied to the
   *application* — so every later `setStyleSheet()` re-polishes all of them. One
   test file went from 1.4 s for its first test to 12 s for its ninth before this
   was found. `tests/ui/support.py::_dispose` is the fix; `test_shell.py` guards it.
3. **Never put expensive work in a refresh that runs for a mode nobody is looking
   at.** CODE's refresh invokes the cc65 codegen; refreshing every mode on every
   undo made one test file take 178 seconds. Refresh is lazy: the visible mode
   refreshes, the rest are marked stale.
4. **A clipped control is invisible to a field assertion.** The dock has no
   horizontal scrollbar, so a control wider than the dock is not scrolled to — it
   is cut in half, and `Duplicate` renders as `Du`.
   `test_no_dock_clips_its_own_controls` guards it — and measures the viewport
   *per mode*, because sampling it once before the layout had settled let a
   clipped dock pass.
5. **A modal dialog hangs the suite.** `QMessageBox.warning(...)` is a static
   helper you can patch, but a failed build *constructs* a `QMessageBox` and calls
   `.exec()` on it — which blocks forever with nobody to click it. Patch `.exec`
   too; `tests/ui/test_failure_paths.py::DialogRecorder` does.
6. **`QTest.mouseMove` does not carry the button state**, so a drag driven with it
   reads as a hover and paints nothing. `tests/ui/test_mouse.py` builds the
   `QMouseEvent`s by hand, and is the only thing covering the coordinate maths.

## Run from a source checkout

The app finds the repository root by locating `tools/engines/` and
`steps/Step_Playground/`. Override it for diagnostics or packaging:

```bash
NES_STUDIO_RESOURCE_ROOT=/path/to/NES_game_V1 nes-studio
```

The development application ID is `io.github.tomd1415.NESStudio.Devel`,
intentionally distinct from the eventual production ID.

## Boundaries

- Do not import `tools/playground_server.py` from the UI.
- Do not add QtWebEngine, a WebView, or a required HTTP listener.
- Do not change project JSON or ROM behaviour without cross-target contracts and
  the review in [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- Keep source resources read-only; mutable state belongs in the XDG paths exposed
  by `QStandardPaths`.
- The app is **MIT**, and so is every dependency. The embedded core is
  `MIT OR Apache-2.0` deliberately: every mature libretro NES core is GPL and
  would relicense the product. Do not swap it without reading
  [`nes_core/README.md`](nes_core/README.md).
