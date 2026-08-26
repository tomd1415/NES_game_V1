#!/usr/bin/env bash
# ⚠ ORPHANED AS OF 2026-08-26 — NOTHING RUNS THIS.
#
# `devcontainer.json` has no `postCreateCommand`; it was reconstructed on 2026-08-21
# from `docker inspect` of the live container and that key was not recovered. Tracked
# anyway because it is the only record of the *order* the two editable installs must
# go in — but do not simply wire it back up: the image this repo now builds has no
# Rust/maturin and no Qt runtime libraries, so steps 1, 2 and 4 below will fail. The
# same steps, with the reasons, are in `native/README.md` (the "nes_core wheel" and
# ".venv" sections), which is the maintained copy.
#
# Originally: runs ONCE at container creation, via devcontainer.json's postCreateCommand.
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
say 'smoke checks'
QT_QPA_PLATFORM=offscreen native/.venv/bin/python -c \
  'import PySide6, nes_core, nes_studio; print("PySide6", PySide6.__version__, "+ nes_core + nes_studio OK")'
npx playwright --version

say 'post-create OK'
