# NES Studio native Linux application

This directory contains the genuine native Linux sibling of the supported web
application. It uses PySide6/Qt Widgets and shares project, engine and ROM
contracts with the browser product.

The current contents are the Phase-1 development shell. They intentionally do
not extract or change the production build pipeline yet.

## Requirements

- Python 3.11 or newer;
- the matching Python `venv` package (`python3-venv` or, on this server,
  `python3.13-venv`);
- a supported Linux desktop session or Qt's offscreen test platform;
- PySide6 for the application;
- pytest and pytest-qt for the complete future test suite.

## Development setup

From this directory:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
nes-studio
```

The first installation needs access to the configured Python package index.
Do not commit `.venv` or downloaded wheels.

On the current Debian/Ubuntu-style server, `python3 -m venv .venv` reports that
`ensurepip` is unavailable. A server administrator must install the matching
`python3.13-venv` package before the isolated PySide6 environment can be
created. Do not install PySide6 into the system Python as a workaround.

## Tests that work before Qt is installed

The metadata and resource-location tests use only the standard library:

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

The UI smoke test skips itself when PySide6 is unavailable. After installing
the development dependencies, also run:

```bash
pytest
```

## Run from a source checkout

The application discovers the repository root by locating `tools/engines/` and
`steps/Step_Playground/`. Override discovery for diagnostics or packaging work:

```bash
NES_STUDIO_RESOURCE_ROOT=/path/to/NES_game_V1 nes-studio
```

The development application ID is
`io.github.tomd1415.NESStudio.Devel`. It is intentionally distinct from the
eventual production ID so the product owner can approve the permanent identity
before user settings and packaging depend on it.

## Boundaries

- Do not import `tools/playground_server.py` from the UI.
- Do not add QtWebEngine, a WebView, or a required HTTP listener.
- Do not change project JSON or ROM behavior without cross-target contracts and
  the review described in [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- Keep source resources read-only; mutable state belongs in XDG paths exposed
  by Qt's `QStandardPaths`.
