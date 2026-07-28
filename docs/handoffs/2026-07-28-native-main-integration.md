# Handoff: integrate main into native branch + server bind fix — 2026-07-28 (updated 2026-07-29)

**Status: the codegen port is DONE and the builder suite is fully green.** What
remains is native-side verification, which cannot run in this container.

**Standing user constraints, both still in force:** do NOT merge to main; do NOT
rewrite history ([decided]).

## Environment
- Container `nesnative`, `/workspace` bind-mounted from host `/home/proj_nesnative/NES_game_V1`.
- Toolchain present: `node` v20.20.2, `cc65/ca65/ld65` V2.18. **Absent:** pip, network,
  PySide6, pytest, fastapi, `node_modules`. (Re-confirmed 2026-07-29.)

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

## Open questions
- **Native Qt/pytest verification is unrun and unrunnable here** (no PySide6,
  pytest, pip or network). `cd native && QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest`
  (404 tests) needs running somewhere with the venv. The one native file the port
  touched is `native/tests/contract/test_build_preparation.py`; its two changed
  assertions were verified by hand against the real `normalize_audio` (both pass,
  and the old form provably fails), but the other 402 tests are unverified.
- Whether to push the branch — 56 commits ahead of
  `origin/chore/linux-native-bootstrap-v63`, still unpushed. User's call.

## Next actions (in order)
1. Run the native suite on a machine with the venv; expect only
   `test_build_preparation.py` to be affected.
2. Run the Studio E2E (`npx playwright test`) somewhere with `node_modules`.
3. Decide on pushing the branch.

## Provenance
[decided] = user chose it. [proposed] = suggested, not agreed. [assumed] = unverified.
- [decided] Merge main + port features into `nes_studio_core`; continue the port
  in this session; no rewrite history; no merge to main; bind server `0.0.0.0`
  durably via containerEnv; commit the `CONTRIBUTING.md` note.
- [assumed] The native Qt suite is otherwise unaffected by the port — the port
  touched only `tools/nes_studio_core/` plus that one contract test, and the
  builder suite covers the ROM contract, but this is reasoning, not a test run.

**To the receiving session:** investigate and execute yourself. Spot-check an
*Established* line before relying on it — the previous iteration of this document
contained a confidently-worded claim (`audio.mjs` is environmental) that was
wrong, and the check that would have caught it was simply freeing port 18815.
