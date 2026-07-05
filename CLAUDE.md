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

## Tests (keep green)

- **Node build/regression:** `node tools/builder-tests/run-all.mjs` — includes
  golden/byte-identical-ROM hashes; the lever that keeps engine changes safe
  is that unused features are stripped by the preprocessor/cc65 so ROMs stay
  byte-identical (gate new engine behaviour behind an off-by-default flag).
- **Studio E2E:** `npx playwright test` from repo root (config auto-boots the
  server). Specs in `tools/studio-tests/`.

## Where to start

- Docs index: [`docs/README.md`](docs/README.md).
- Studio redesign status: `docs/plans/current/2026-07-05-studio-redesign.md`.
- Engine work sequencing/risk:
  `docs/design/decisions/2026-07-05-engine-items-feasibility.md`.
