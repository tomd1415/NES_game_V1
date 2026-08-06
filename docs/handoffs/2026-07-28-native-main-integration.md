# Handoff: integrate main into native branch + server bind fix — 2026-07-28 (updated 2026-07-29)

**Status: the codegen port is DONE and the builder suite is fully green.** What
remains is native-side verification, which cannot run in this container.

**Standing user constraints, both still in force:** do NOT merge to main; do NOT
rewrite history ([decided]).

## Environment
- Container `nesnative`, `/workspace` bind-mounted from host `/home/proj_nesnative/NES_game_V1`.
- Toolchain present: `node` v20.20.2, `cc65/ca65/ld65` V2.18, **`pytest` 9.1.1**
  (pipx, `/root/.local/bin/pytest`), **`node_modules`** with `@playwright/test`
  1.61.1. **Absent:** pip, network, PySide6, fastapi, and the Playwright browser
  binary (`~/.cache/ms-playwright` is empty, so `npx playwright test` cannot run).
- **Correction (2026-08-06):** the 2026-07-29 version of this line listed pytest
  and `node_modules` as absent and marked it "re-confirmed". Both were wrong.
  `python3 -m pytest` fails here by design — pipx exposes only the console script —
  and that failure was read as "not installed". Nine days of native verification
  were skipped on the strength of it. Use `command -v <tool>`, not `python3 -m`.
  Written up in [`docs/guides/LESSONS_LEARNT.md`](../guides/LESSONS_LEARNT.md).

## Established (fact ← evidence)
- **The v64–v75 codegen port is complete.** All 20 hunks of
  `git diff $(git merge-base 6fb70ac 09df502)..09df502 -- tools/playground_server.py`
  are accounted for in `tools/nes_studio_core/`. Commits `8cf5b31`, `ccbd53a`, `c7c5531`.
- **`node tools/builder-tests/run-all.mjs` → `✅ All Builder regression checks pass`**
  — including `audio.mjs`, which the previous version of this handoff wrongly
  wrote off as environmental (see "Corrected" below).
- Engine snapshot intact ← `node scripts/snapshot-engine.mjs --check` →
  `✓ v75 snapshot matches HEAD (30 files)`. **No version bump was needed**: the
  snapshot deliberately excludes the server codegen, and the port restored the
  branch to emit what v75 already declared rather than changing engine behaviour.
- Cross-target contract holds by construction ← `build_project_inc`,
  `build_bg_world_h/c` and `build_scene_inc` in `tools/playground_server.py` are
  all pure one-line delegations to `nes_studio_core`, so the
  `playground_server.X(...) == core.X(...)` contract tests are tautological and
  both targets receive the port identically.
- Server bind fix live ← `curl http://127.0.0.1:8765/health` → 200;
  `.devcontainer/devcontainer.json` containerEnv has `"PLAYGROUND_HOST": "0.0.0.0"`.
  Documented in `CONTRIBUTING.md` (commit `0ce5c2a`).

## Corrected (the previous handoff got these wrong — do not re-inherit them)
- **`audio.mjs` was NOT environmental. It was a real branch regression.** Moving
  the audio stubs from `playground_server.py` into
  `tools/nes_studio_core/build_assets.py` turned the line-continuation `"""\`
  into `"""\\`, so `AUTO_SONGS_STUB_ASM` / `AUTO_SFX_STUB_ASM` / `ASM_MAKEFILE`
  each began with a **literal backslash**; ca65 rejected it with
  `Invalid input character: 0x5C`. It broke every asymmetric audio upload (a song
  without an sfx pack, or vice versa). Fixed in `ccbd53a`.
- **Why it looked environmental — the trap to avoid.** `tools/builder-tests/audio.mjs`
  uses a hard-coded `PORT = 18815` and, when it fails, **leaks its spawned
  `playground_server.py`**. Every later run then finds the port occupied, refuses
  to start its own server, and dies with a confusing
  `SocketError: other side closed` / `UND_ERR_SOCKET` that hides the real error.
  A "clean `main` worktree" comparison hits the *same* squatter and fails
  identically — which is exactly what made the previous session conclude
  "environmental, fails on main too".
  **Before trusting any `audio.mjs` result, free the port first.** The server
  itself prints the giveaway (`Port 18815 is in use by something else`) but only
  on stderr, which the suite swallows. This container has no `ss`/`lsof`/`netstat`,
  so find the squatter through `/proc` — and kill ONLY that PID, because the
  devcontainer's real server on 8765 must be left alone:

  ```sh
  python3 - <<'EOF'
  import glob, os, signal
  port = 18815
  inode = next((f[9] for f in (l.split() for l in open('/proc/net/tcp'))
                if len(f) > 9 and f[3] == '0A'
                and f[1].endswith(':' + format(port, '04X'))), None)
  for p in (glob.glob('/proc/[0-9]*/fd/*') if inode else []):
      try:
          if os.readlink(p) == f'socket:[{inode}]':
              os.kill(int(p.split('/')[2]), signal.SIGTERM)
              print('killed', p.split('/')[2])
      except OSError:
          pass
  EOF
  ```

- **The leak has a one-line root cause, and 32 suites share it** ← in
  `tools/builder-tests/*.mjs`, `fail()` calls `process.exit(1)`, which bypasses
  the `try/finally { srv.kill('SIGTERM') }` that would have reaped the server.
  So *every* failing suite that spawns a server leaks it. The fix is to register
  `process.on('exit', () => { try { srv.kill('SIGTERM') } catch {} })` right after
  each `spawn(...)`. **Not done here** — a 32-file harness change was out of scope
  for the port, and is the user's call.

## Ran 2026-08-06 (overnight, no decisions available)

`cd native && pytest -q --continue-on-collection-errors` — no venv, no PySide6, the
pipx pytest that was here the whole time. **`11 failed, 189 passed, 149 skipped,
12 errors` in 5.78 s.** Reading that summary:

- 149 skips + 12 collection errors + 3 of the 11 failures = "PySide6 is not
  installed". Correct behaviour badly reported; see `native/README.md` § Tests.
- `test_build_preparation.py` — **the one file the port touched — passes.**
- **Two genuine failures, neither caused by the port, both older than it:**
  1. `test_baseline_manifest.py` → `63 != 75`. `tests/contract/baseline-v63.json`
     was frozen at engine v63; the engine is v75.
  2. `test_phase0_starter_fixtures.py` → `FileNotFoundError` on all 7 fixtures.
     The `game.nes` baselines were never committed — `.gitignore:3` is `*.nes` and
     **no `.nes` file is tracked anywhere in this repo**. So the cross-target
     ROM-equality assertion has never once executed. The `.gz` artefacts *are*
     committed, which is why the fixture directories look complete.

**This retires the [assumed] line below in the worst way.** "Cross-target contract
holds by construction" was reasoning, and the test that would have checked it was
inert. The builder suite's green light covers the web/engine side and the shared
Python codegen (`tools/builder-tests/lib/render-harness.mjs` spawns the real
`tools/playground_server.py`, which imports `nes_studio_core`) — it does **not**
cover the native ROM baseline.

## Open questions
- **A re-baseline needs an owner decision, not an edit.** Both failures are fixed
  by writing new baselines, and a baseline you generate from the code under test is
  green by construction and worthless. Somebody has to say what a *trustworthy*
  v75 native baseline is. Raised in `.mc-ask-critic.md`.
- Studio E2E is still unrun: `node_modules` is present but the Chromium binary is
  not (`~/.cache/ms-playwright` empty, and the CDN is outside the egress allowlist).
  The pending container rebuild bakes it in.

## Next actions (in order)
1. Decide the re-baseline question above; then fix both failures together.
2. Un-ignore the fixture ROMs (`!native/tests/fixtures/**/*.nes`) as part of that —
   and add a test that asserts the fixture files *exist*, so the next time they go
   missing it fails as "baseline missing" rather than mid-assertion.
3. Rebuild the container (host-side) and run the Studio E2E.

## Provenance
[decided] = user chose it. [proposed] = suggested, not agreed. [assumed] = unverified.
- [decided] Merge main + port features into `nes_studio_core`; continue the port
  in this session; no rewrite history; no merge to main; bind server `0.0.0.0`
  durably via containerEnv; commit the `CONTRIBUTING.md` note.
- [assumed → part-tested 2026-08-06] The native Qt suite is otherwise unaffected by
  the port. The non-Qt half now confirms it: the only touched file passes and the
  two failures predate the port. The Qt half (149 skips) is still unverified. The
  clause "the builder suite covers the ROM contract" was **wrong for the native
  target** and should not be re-inherited.

**To the receiving session:** investigate and execute yourself. Spot-check an
*Established* line before relying on it — the previous iteration of this document
contained a confidently-worded claim (`audio.mjs` is environmental) that was
wrong, and the check that would have caught it was simply freeing port 18815.
