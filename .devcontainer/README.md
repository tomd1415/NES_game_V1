# `.devcontainer/` — what this actually builds

Tracked since 2026-08-26. It was gitignored on this branch, and on **2026-08-14 21:40**
the `Dockerfile` and `devcontainer.json` were deleted with no copy in git to restore
from; `devcontainer.json` had to be reconstructed from `docker inspect` of the still
running container, and `init-firewall.sh` was not recovered at all until now. That is
the whole reason these files are in the repository: the loss already happened once.

## What it gives you

`node:20-bookworm` + cc65 + fceux, the egress firewall (`init-firewall.sh`, programmed
at container start by `/claude-guidance/container-init.sh`), `claude`, `pytest` via
pipx, vitest/jest, and **Playwright's Chromium baked in at image-build time**, pinned by
`ARG PLAYWRIGHT_VERSION`. `node tools/builder-tests/run-all.mjs` fails if that pin drifts
from `package-lock.json`'s resolved `@playwright/test`.

## What it does NOT give you — until someone rebuilds

**Nothing, in principle, as of 2026-09-10 — but this container has not been rebuilt since,
so the image you are sitting in is still the old one.** The Dockerfile now installs the Qt
runtime libraries, a pinned rustup toolchain and maturin, and `devcontainer.json` runs
`post-create.sh` again (it had lost that key on 2026-08-21, which is why `native/.venv`
never existed). Until a rebuild happens:

* `python -c "import PySide6"` still fails here, and the native suite's **161 skips are
  the UI layer skipping, not passing**;
* `native/.venv` and `native/nes_core/dist/*.whl` do not exist.

The apt list was **measured, not copied**: every package name was resolved and installed on
this exact base image before being written into the Dockerfile, and `libGL.so.1` /
`libxcb-cursor.so.0` were confirmed present afterwards. What could not be verified from in
here is `import PySide6` itself — the runtime firewall does not allow PyPI (deliberately;
`deb.debian.org` is allowed and PyPI is not), so the wheel cannot be fetched. **The rebuild
is the test**, and it is built to be a loud one: the Dockerfile fails the build if any of
four Qt libraries is missing afterwards, and `post-create.sh` runs under `set -euo
pipefail` ending in an `import PySide6, nes_core, nes_studio` smoke check, so a broken
toolchain fails container *creation* rather than producing an image that looks fine and
skips 161 tests.

`node tools/builder-tests/run-all.mjs` guards all of it — *"devcontainer still provisions
the native app"* — reading the Dockerfile with comment lines stripped and parsing
`devcontainer.json` rather than grepping it, so neither an explanation of a package nor a
mention of the key can stand in for the real thing.

## If you need PyPI inside a *running* container

`init-firewall.sh` reads `EXTRA_ALLOWED_DOMAINS` from `devcontainer.json`'s `containerEnv`,
so `pypi.org,files.pythonhosted.org` can be added per project. It is deliberately NOT set
here: `post-create.sh` runs before the firewall, so the build path does not need it, and
widening egress is the owner's call rather than a convenience.

## Where these files come from

Nothing here is hand-written from scratch: the `Dockerfile` began as a rendered instance of
`Dockerfile.tmpl` in the `isolated-project-containers` skill (`~/.claude/skills/`), and
`new-project.sh` generates the directory. The template is the place to fix a bug that
affects every project; this copy is the place to record what *this* project needs — the Qt
and Rust blocks are exactly that, and would be lost by a regeneration.
