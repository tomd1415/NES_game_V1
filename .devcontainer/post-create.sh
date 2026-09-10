#!/usr/bin/env bash
# Runs ONCE at container creation, via devcontainer.json's postCreateCommand.
#
# It was orphaned between 2026-08-14 and 2026-09-10 — the reconstruction of
# devcontainer.json could not recover that key — and the Dockerfile had lost the Rust
# and Qt provisioning these steps depend on. Both are restored: the image now carries
# the Qt runtime libraries, a pinned rustup toolchain and maturin, and this script is
# wired back in. `native/README.md` documents the same steps for a non-container setup
# and is the place to keep in step with this one.
#
# WHY HERE AND NOT IN THE DOCKERFILE: every step below needs the *workspace*, which
# is bind-mounted at run time and does not exist during the image build. And why not
# at postStart: postCreate runs BEFORE init-firewall.sh, so egress is still open —
# PyPI, crates.io and the npm registry are all blocked once the firewall lands.
#
# Everything is idempotent, so re-running it after a rebuild is cheap and safe.
set -euo pipefail

cd /workspace

say() { printf '\n=== %s\n' "$1"; }

# 1. The embedded NES core's wheel. Not on PyPI, and dist/ is gitignored, so it has
#    to be built from the Rust source before anything can pip-install the native app.
say 'nes_core wheel'
if compgen -G 'native/nes_core/dist/*.whl' > /dev/null; then
  echo 'already built, skipping'
else
  ( cd native/nes_core && maturin build --release --out dist )
fi

# 2. The native app's venv. Two local path installs: the build core under tools/ is a
#    sibling package (nes-studio-build-core), not a PyPI one, so it must go in first
#    or the native install cannot resolve it.
say 'native/.venv'
[ -d native/.venv ] || python3 -m venv native/.venv
native/.venv/bin/python -m pip install --upgrade --quiet pip
native/.venv/bin/python -m pip install --quiet -e ./tools
native/.venv/bin/python -m pip install --quiet -e './native[dev]' \
  --find-links native/nes_core/dist

# 3. The Playwright harness. The browser binary itself is already baked into the
#    image; this is only the node client, and it must match that browser's version.
say 'node deps'
npm ci

# 4. Prove the two things this whole rebuild existed to enable actually import/run,
#    so a broken toolchain fails HERE, loudly, instead of looking like a test failure
#    days later. Offscreen because the container has no display.
#
#    THIS IS THE TEST FOR THE WHOLE Qt CHANGE. It cannot be run from inside a container
#    whose firewall blocks PyPI, so the person doing the rebuild is the one who finds
#    out. `set -euo pipefail` above means a failure here fails container creation rather
#    than leaving a container that looks fine and skips 161 tests.
say 'smoke checks'
QT_QPA_PLATFORM=offscreen native/.venv/bin/python -c \
  'import PySide6, nes_core, nes_studio; print("PySide6", PySide6.__version__, "+ nes_core + nes_studio OK")'
npx playwright --version

say 'post-create OK'
