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

> **A `/play` no longer dirties the working tree** (re-verified 2026-08-06).
> Engine sources under `steps/Step_Playground/` *are* generated per build, but
> `_build_rom()` writes them into a `tempfile.TemporaryDirectory` — both the C
> and the ASM paths — so `git status` stays clean. The only artifact left behind
> is `steps/Step_Playground/_play_latest.nes`, which `.gitignore` covers via
> `*.nes`. Evidence: a full `run-all.mjs` (2026-08-06: 114 suites at the time,
> all doing real cc65 builds) left `git status steps/Step_Playground/` completely
> empty — re-confirmed 2026-08-13 with a single real build. The suite count is
> whatever `tools/builder-tests/` holds; it is dated here because it is a record
> of one run, not a live figure.
>
> This paragraph used to say those files show as `M` after any `/play` and
> should not be committed. That was true of an earlier in-place build and is now
> wrong — worth knowing, because "expect modified engine sources and ignore
> them" is advice that would mask a real edit. If you *do* see them modified,
> something is wrong; don't wave it through.
>
> (Leftover from the old scheme: `playground_server.py` still defines
> `CHR_PATH`, `NAM_PATH`, `SCENE_INC`, `PAL_INC`, `COLLISION_H_PATH`,
> `BEHAVIOUR_C_PATH`, `BG_WORLD_H_PATH` and `BG_WORLD_C_PATH`, none of which are
> referenced anywhere. `DEFAULT_MAIN_C`/`DEFAULT_MAIN_S` next to them *are* live
> — they serve the pupil-facing starter files — so don't sweep the whole block.)

## Tests (keep green)

- **Node build/regression:** `node tools/builder-tests/run-all.mjs` — includes
  golden/byte-identical-ROM hashes; the lever that keeps engine changes safe
  is that unused features are stripped by the preprocessor/cc65 so ROMs stay
  byte-identical (gate new engine behaviour behind an off-by-default flag).
- **Studio E2E:** `npx playwright test` from repo root (config auto-boots the
  server). Specs in `tools/studio-tests/`.
- **Ports:** dev server `8765`, Studio E2E `18790`, builder-tests
  `18768–18897` (one at a time). The old 18790 double-claim was fixed on
  2026-08-06 and `run-all.mjs` now fails if any suite names the E2E port — but
  still run the two suites **sequentially**: this box has four cores and carries
  ten containers, so running both at once mostly loads the box. Do NOT read that
  as "the E2E fails under load" — measured, it is green at the committed timeout
  at load ~14.5, and only one test has ever exceeded it, at load 39. STATUS.md
  has the numbers; don't restate them here. Full table:
  [`docs/guides/TEST-SERVERS.md`](docs/guides/TEST-SERVERS.md).

## Where to start

- **Current status — read this first:** [`docs/STATUS.md`](docs/STATUS.md).
  Engine version, test state, what's open, what's blocked and on whom. It's a
  living file: refresh it when an engine version ships or a session ends.
- **Live handoff (delete this line when it's resolved):**
  [`HANDOVER.md`](HANDOVER.md) — v79 shipped; the two attended playtests and the
  redeploy (now **v79**) are still open and both need a human.
- Docs index: [`docs/README.md`](docs/README.md).
- Studio redesign status: `docs/plans/current/2026-07-05-studio-redesign.md`.
- Engine work sequencing/risk:
  `docs/design/decisions/2026-07-05-engine-items-feasibility.md`.
