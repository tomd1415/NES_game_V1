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

## What it does NOT give you — read this before believing a test count

**No Qt, no PySide6, no Rust/maturin.** So the native app does not run in this image and
`native/.venv` does not exist. The native suite's **161 skips are the UI layer skipping,
not passing** (`native/README.md` says the same). Making them run needs three things
nobody has done and tested yet: the Qt runtime apt packages, a `maturin` build of
`native/nes_core`, and the venv from `native/README.md` — see `post-create.sh`, which
encodes the ordering and is currently orphaned.

Nothing here is hand-written from scratch: the `Dockerfile` is a rendered instance of
`Dockerfile.tmpl` in the `isolated-project-containers` skill (`~/.claude/skills/`), and
`new-project.sh` generates the directory. The template is the place to fix a bug that
affects every project; this copy is the place to record what *this* project needs.
