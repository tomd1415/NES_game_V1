# Project guide for AI/dev sessions

A NES game-maker for schools: a browser editor (`tools/tile_editor_web/`) +
a Python build server (`tools/playground_server.py`) that runs **cc65** to
produce real `.nes` ROMs. Two front-ends exist today: the unified **Studio**
(`studio.html`) is the **primary** one and where work happens; the original
seven pages are still served but are critical-fix-only. Build for the Studio
unless a change is specifically about keeping the legacy pages alive.

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
- **Ports:** dev server `8765`, Studio E2E `18790`, builder-tests
  `18768–18894` (one at a time). Don't run the E2E and the builder tests
  *concurrently* — they share 18790 and it fails silently. Full table:
  [`docs/guides/TEST-SERVERS.md`](docs/guides/TEST-SERVERS.md).

## Where to start

- **Current status — read this first:** [`docs/STATUS.md`](docs/STATUS.md).
  Engine version, test state, what's open, what's blocked and on whom. It's a
  living file: refresh it when an engine version ships or a session ends.
- **Live handoff (delete this line when it's resolved):**
  [`HANDOVER.md`](HANDOVER.md) — v78 shipped; the two attended playtests and the
  redeploy (now v78) are still open and both need a human.
- Docs index: [`docs/README.md`](docs/README.md).
- Studio redesign status: `docs/plans/current/2026-07-05-studio-redesign.md`.
- Engine work sequencing/risk:
  `docs/design/decisions/2026-07-05-engine-items-feasibility.md`.
