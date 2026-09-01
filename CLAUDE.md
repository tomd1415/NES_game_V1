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
> (That paragraph carried a list of eight dead path constants left over from the
> old scheme. `main` deleted them in `4c108ec` and they are not in the merged
> tree — `grep -c` returns 0 — so the list is gone rather than repeated here.
> `DEFAULT_MAIN_C`/`DEFAULT_MAIN_S` remain and *are* live: they serve the
> pupil-facing starter files.)

## Tests (keep green)

- **Node build/regression:** `node tools/builder-tests/run-all.mjs` — includes
  golden/byte-identical-ROM hashes; the lever that keeps engine changes safe
  is that unused features are stripped by the preprocessor/cc65 so ROMs stay
  byte-identical (gate new engine behaviour behind an off-by-default flag).
- **Studio E2E:** `npx playwright test` from repo root (config auto-boots the
  server). Specs in `tools/studio-tests/`.
- **Native:** `cd native && QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest`
  on a set-up machine. **In a dev container there is no `.venv`** — it is created by
  the setup in `native/README.md` and gitignored — so use the `pytest` already on
  `$PATH`: `cd native && QT_QPA_PLATFORM=offscreen pytest -q`. It is a pipx install,
  so `python3 -m pytest` will *never* work here and says nothing about availability;
  that exact confusion once had this suite declared unrunnable for nine days
  (`docs/LESSONS-LEARNT.md` §1, *"The tool is not installed" is a claim*).

  Count: **204 passed, 161 skipped** here (no Qt). The often-quoted "404 tests, ~5
  min" was measured with the full venv and is unconfirmed since — see
  `native/README.md` for the bounds.

  Three hard-won rules for native tests. The suite was once **fully green while the
  app rendered a transparent emulator frame, a white-on-white panel, and crashed on
  every background switch** — because the tests asserted `document.field == X` and
  never asserted that anything *rendered*. So: **assert pixels, not document
  fields**, for anything visual (`assertRenders()` in `tests/ui/support.py`).
  **Destroy your windows, don't just close them** — `processEvents()` does not
  deliver `DeferredDelete`, so `deleteLater()` alone frees nothing, and a leaked
  `MainWindow` keeps ~1,170 widgets that every later `setStyleSheet()` re-polishes;
  use `StudioTest._dispose`. And **never put expensive work in a refresh that runs
  for a mode nobody is looking at** — CODE's refresh invokes the cc65 codegen.
  (Three more traps, with the tests that guard them, are listed in
  [`native/README.md`](native/README.md#six-traps-all-of-which-have-bitten).)

## Where to start

- **⚠ `main` has moved on (checked 2026-08-12):** 33 commits ahead, now at engine
  **v78**, and it has its own **`v76`** — a different one from this branch's. A
  project stamped `engineVersion: 76` is currently ambiguous. Read
  [`docs/handoffs/2026-08-12-main-divergence-and-the-v76-collision.md`](docs/handoffs/2026-08-12-main-divergence-and-the-v76-collision.md)
  **before merging or bumping the engine.** The line below describes the state as of
  2026-08-06 and its first clause is now stale.
- **⚠ `.devcontainer/` is gitignored on this branch and tracked on `main`.** The
  Dockerfile on this disk installs the Qt runtime libraries and runs a
  `post-create.sh` that builds the `nes_core` wheel and creates `native/.venv`;
  `main`'s installs no Qt at all. **None of it is in the repository here**, so a fresh
  clone cannot build a container that runs the native app, and `git add
  .devcontainer/…` will decline in silence. Same handoff, section "The container
  provisioning exists only on this disk".
- **Active thread (2026-08-06, updated):** `main` ~~is merged into~~ *was merged into*
  the native branch
  and the v64–v75 codegen port into `nes_studio_core` is **done** — builder suite
  green. **Both of the real native failures are now fixed**, and the engine is at
  **v76**:
  - the seven `game.nes` baselines are committed (`.gitignore` negates
    `native/tests/fixtures/**/*.nes`), so the cross-target ROM assertion executes
    — confirmed by flipping a byte and watching it go red. It pins **drift from a
    named commit**, not correctness: the baselines are generated by the code they
    check, and the manifest says so;
  - `baseline-v63.json` is now `baseline.json`, re-verified at the current commit
    rather than inherited, with the 2026-07-10 attended attestation marked as
    v63-only and **not** re-attested;
  - **v76** adds `tools/nes_studio_core/` to the engine snapshot (30 files → 41),
    closing the blind spot where a codegen change could not turn the gate red.
    **v1–v75 were taken without Python and are not comparable** — see the two-era
    table in `tools/engines/README.md`.

  **The native suite now runs clean here** — 204 passed, 161 skipped, **0 errors
  and 0 failures** (F3 fixed 2026-08-07). A red line means a real one. The 161
  skips mean one thing only: this box has no Qt, so the **UI layer is untested,
  not passing**, until the container is rebuilt.

  **But green does not yet mean sound.** Probing the gates on purpose found four
  that pass for reasons unrelated to what they claim to watch — two holes still
  open (**F14**, **F17**: both enumerate part of the program with a regex over raw
  source, so a comment satisfies one and a changed quote character defeats the
  other) and two registries with no gate at all (**F15** `MODE_CLASSES`, **F16**
  the starter picker — in both, a thing written but not registered is silently
  absent from the app). Before quoting any suite here as evidence, read
  [`docs/guides/what-the-gates-prove.md`](docs/guides/what-the-gates-prove.md):
  one row per gate, what a pass does and does not establish, and which have
  actually been watched go red. All four fixes are additive and written out in
  step 9 of the close-out plan.

  **Still open:** three starter ROMs (`smb`, `runner`, `geodash`) changed between
  v63 and v75 — recorded in
  [`docs/handoffs/2026-08-06-starter-fixture-rebaseline.md`](docs/handoffs/2026-08-06-starter-fixture-rebaseline.md);
  whether that was intended is an owner question. Studio E2E still unrun (no
  Chromium). See
  [`docs/handoffs/2026-07-28-native-main-integration.md`](docs/handoffs/2026-07-28-native-main-integration.md)
  and [`docs/LESSONS-LEARNT.md`](docs/LESSONS-LEARNT.md). The
  ordered route from here to a defensible merge, with acceptance checks and the
  two owner decisions marked, is
  [`docs/plans/current/2026-08-06-close-out-native-branch.md`](docs/plans/current/2026-08-06-close-out-native-branch.md).
  Remove this line when both suites have run clean.
- Docs index: [`docs/README.md`](docs/README.md).
- Studio redesign status: `docs/plans/current/2026-07-05-studio-redesign.md`.
- Native Linux app: `docs/plans/current/2026-07-14-native-build-plan.md`.
- Engine work sequencing/risk:
  `docs/design/decisions/2026-07-05-engine-items-feasibility.md`.
