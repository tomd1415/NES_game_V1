# NES Studio — native Linux application

The genuine native Linux sibling of the web Studio. PySide6/Qt Widgets, sharing
the project, engine and ROM contracts with the browser product — `tests/contract/`
proves the two targets emit **byte-identical ROMs**.

Build order, current state and what is next:
[`docs/plans/current/2026-07-14-native-build-plan.md`](../docs/plans/current/2026-07-14-native-build-plan.md).

## Running it

```bash
native/.venv/bin/nes-studio
```

## What works today

- **The game runs in the Studio.** ▶ PLAY builds the ROM if needed and plays it
  in the CRT stage, with audio and two-player input, via an embedded NES core
  (`nes_core/`). FCEUX is now only an optional "Open in FCEUX".
- **WORLD shows the real game** — actual tile art and palettes, entities drawn as
  their real sprites, and 2×2 attribute conflicts flagged on-canvas before the
  build.
- **Undo/redo works in every mode** (40 deep), grouping a paint drag into one
  step. It survives switching screen or background.
- **Project catalog** (`File → My Games`, `Ctrl+M`): switch, rename, duplicate,
  delete, and start from any of the seven starters.
- Editing: WORLD (paint/fill/palette/behaviour, metatiles, entity placement),
  TILES (256-tile library, pixel editor, transforms, reference-safe swaps),
  CHARS (sprites, roles, cells, animations), PALS (true 64-colour NES master
  palette), RULES, SOUND (import), CODE (editable C/ASM).
- Persistence: SQLite store, 500 ms debounced saves, 30 s deduplicated snapshots,
  atomic import/export, XDG recovery.

## What is not there yet

Honest list — see the build plan for the ordered work:

- No dock outside WORLD; the other modes are a single editor panel.
- No validators, no guided tutorial, no Time Machine UI, no budget meters.
- No CHARS painting canvas (you jump to TILES to draw), no STYLE mode.
- No asset `.chr`/`.pal`/`.nam` import/export, no SOUND preview.
- No gallery/accounts (a deliberate deferral — server-coupled).

## Keyboard

| Key | Action |
| --- | --- |
| `1`–`7` | Switch mode (disabled while a game is running) |
| `Ctrl+S` | Save (flushes to the local store) |
| `F5` | Build ROM |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+M` | My Games |
| `Escape` | Stop the running game |

While playing, controls match the web exactly so pupils do not relearn them:
P1 = arrows, `F`=A, `D`=B, `Enter`=Start; P2 = `I/J/K/L`, `O`=A, `U`=B, `1`=Start.

## Development setup

Requires Python 3.11+ and the matching `venv` package.

```bash
cd native
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]' --find-links nes_core/dist
nes-studio
```

`--find-links nes_core/dist` is required: the embedded NES core is a **vendored
wheel**, not a PyPI package. It is self-contained (`manylinux`, abi3), so the
target machine needs **no Rust, no compiler and no apt packages** — which is the
point for locked-down school images.

Do not commit `.venv` or downloaded wheels.

### Rebuilding the NES core

Only needed if you change `nes_core/src/lib.rs`. Needs Rust ≥ 1.85 on the *build*
machine.

```bash
cd native/nes_core
../.venv/bin/maturin build --release --out dist
../.venv/bin/pip install --force-reinstall dist/*.whl
```

See [`nes_core/README.md`](nes_core/README.md) — it documents two traps that will
bite you (a panicking audio API, and an alpha byte that renders every frame
transparent).

## Tests

```bash
cd native
QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest
```

214 tests. The suite takes ~2 minutes, mostly constructing `MainWindow`.

| Directory | Holds |
| --- | --- |
| `tests/contract/` | Cross-target invariants: ROM/codegen parity with the web, and the NES palette table. **The most valuable tests here.** |
| `tests/unit/` | Document, persistence, renderer (pixel assertions), emulator. |
| `tests/ui/` | Shell, triage regressions, undo-everywhere. |

**Testing rule learned the hard way:** the suite was fully green while the app
rendered a transparent emulator frame, a white-on-white PALS panel, and crashed on
background switch — because the tests asserted `document.field == X` and never
asserted that anything *rendered*. New visual work needs a pixel assertion, not a
document assertion.

Two more traps, both of which have bitten:

- **Close your windows in tests** (`self.addCleanup(window.close)`). A live
  `MainWindow` keeps a 30 s snapshot timer and an open session; leaking them makes
  two sessions race on one project and raise `StaleRevisionError` inside a *later*
  test.
- **Never put expensive work in a refresh that runs for modes nobody is looking
  at.** `_refresh_code_preview()` invokes the cc65 codegen; refreshing every mode
  on every undo made one test file take 178 seconds.

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
