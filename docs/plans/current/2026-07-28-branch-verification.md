# Branch verification before merge — `chore/linux-native-bootstrap-v63`

**Date:** 2026-07-28
**Purpose:** put the merge decision on evidence. This splits the branch diff into
what *this container's* runnable suites can verify and what genuinely needs a Qt
run, records the result of everything that runs here, and gives the **single
command** that closes the gap on a machine with the built `.venv`.

**Decision recorded at the bottom: do not merge to `main` yet.** There are now
*two* independent blockers, and this run only clears the ground:

1. **The branch is stale and conflicts with `main`** (found during this pass — see
   §0). It is **51 commits / 12 engine-versions behind** and does not merge clean.
2. **The Qt half of the native suite is unverified here** (§B/§C) — the one
   command that closes it needs a built `.venv`.

---

## 0. Merge-readiness: the branch is behind `main` and conflicts

This was not in the original scope but is the **larger** of the two blockers, so
it leads.

| Fact | Value |
| --- | --- |
| Merge-base | `95c559f`, **2026-07-10** |
| Commits on branch, not on `main` | 163 |
| **Commits on `main`, not on branch** | **51** |
| `main` `ENGINE_VERSION` | **75** |
| branch `ENGINE_VERSION` | **63** (the branch is literally `…-v63`) |
| `git merge-tree HEAD main` | **CONFLICT** |

`main` has moved on by 51 commits and **twelve engine versions** since this branch
forked — v75 adds per-room scene instances, new enemy types (hopper/shooter),
compressed scrolling, and sfx-events, each with its own builder-test suite (main
runs **110** builder suites; this branch has **101** — the 9 it lacks are exactly
that new engine work). A `git merge-tree` reports one conflicting file:

- **`tools/playground_server.py`** — which this branch *rewrote* (+116 / −2,074,
  extracting logic into `tools/nes_studio_core`) and which `main` also changed.

**Consequence.** Merging is a real integration, not a fast-forward: `main`'s 51
commits (including a v63→v75 engine migration) must be brought in and the
`playground_server.py` conflict resolved **first**, and *then* the whole thing
re-verified. Evaluating the branch's tests in isolation (below) is necessary but
not sufficient while it sits 12 engine versions behind the target.

---

## Container capabilities (the facts that drive the split)

Established by probing, not assumption:

| Capability | State | Consequence |
| --- | --- | --- |
| `node` v20.20.2 | ✅ | Node builder suite + the web-JS parity harness run |
| `cc65` / `ca65` / `ld65` | ✅ (`/usr/bin`) | ROMs build; golden-hash suites run |
| `python3` (stdlib only) | ✅ | Qt-free `unittest.TestCase` tests run |
| `pip` / network / `ensurepip` | ❌ | Cannot install anything |
| `PySide6` (Qt) | ❌ | `ui` / `render` / `emulator` / `state` / `codegen` cannot import |
| `pytest` | ❌ | pytest-style tests cannot be collected |
| `fastapi` | ❌ | Server-coupled tests cannot run |
| `node_modules` (Playwright/jsnes) | ❌ | Studio E2E cannot run |

The branch diff is **232 files, +28,955 / −2,141** — essentially the whole native
build-out. It splits cleanly along the capability lines above.

---

## A. Verifiable in this container — with the evidence

### A1. Native Qt-free core — `python3 -m unittest`

`native/src/nes_studio/core/` imports and runs under plain `python3` (no Qt). Run
with `PYTHONPATH=src:.` from `native/`:

| Module | Tests | Result |
| --- | --- | --- |
| `tests.unit.test_validators` | 21 | ✅ OK |
| `tests.unit.test_assets` | 16 | ✅ OK |
| `tests.unit.test_tutorials` | 9 | ✅ OK |
| `tests.unit.test_packaging_metadata` | 3 | ✅ OK |
| `tests.unit.test_resources` | 2 | ✅ OK |
| `tests.unit.test_metadata` | 1 | ✅ OK |
| `tests.contract.test_baseline_manifest` | 3 | ✅ OK |
| `tests.contract.test_parity_matrix` | 3 | ✅ OK |
| `tests.contract.test_phase0_corpus` | 2 | ✅ OK |
| **`tests.contract.test_validator_parity`** | 2 | ✅ OK |
| **Total** | **62** | **all pass** |

`test_validator_parity` is the load-bearing one: it runs the **real web
JavaScript** (`tools/tile_editor_web/builder-validators.js`) in `node` over shared
project states and asserts the native validators produce byte-identical problems.
It passing means the native↔web validator contract holds on this branch.

This bucket covers **`native/src/nes_studio/core/project_document.py`**, one of the
two files in the most recent commit (`cf59e45`). The scene-bound extraction there
was additionally proven at the boundary by a standalone check: a scene entity is
still accepted at exactly `(504, 464)` and rejected one past, on both the `add`
and `update` paths.

### A2. Engine / ROM builder suite — `node tools/builder-tests/run-all.mjs`

Covers the versioned engine: C templates, the assembler, cc65 codegen, and the
golden **byte-identical-ROM** hashes. Depends only on `node` + `cc65` (system
`cc65 V2.18`, Debian 2.19-1), both present.

**RESULT: 100 of 101 suites pass** on the branch. The golden/byte-identical-ROM
hashes match (`template (no modules) ROM matches golden hash`, `Step_Playground
stock ROM matches golden hash`), and the full ASM↔C engine-equivalence corpus is
green. The one failure — `audio.mjs` — is **environmental, not a branch
regression**; see the investigation below.

### The one builder-suite failure — `audio.mjs`, classified

`audio.mjs` boots `playground_server.py` and drives its `/play` audio-build path.
On the branch it fails at Case 4 (song-only upload → server auto-stubs the sfx)
with a build error: `src/audio_sfx.s(10): Error: Invalid input character: 0x5C`
(a stray backslash reaching `ca65`).

**It is not the branch's fault. Evidence:**

1. **Byte-identical codegen.** Loading `playground_server.py` from both the branch
   and a `main` worktree and materialising the auto-sfx stub + `_stage_audio_asm()`
   output gives an **identical, backslash-free** result on both — line 10 is
   `.export _audio_sfx_data:=audio_sfx_data` in each. The audio codegen the branch
   refactored produces the same bytes as `main`.
2. **`main` fails the same suite.** Running the *entire* builder suite on a clean
   `main` worktree in this container, `audio.mjs` is the **only** failing suite
   there too (it crashes even earlier — the server closes the socket at Case 1,
   before any assertion). Red on both branches ⇒ the container, not the diff.

The underlying cause is this container's server-side audio build (system `cc65`
2.18 with no FamiStudio audio toolchain), which the project's own CI evidently has
and this sandbox does not. **Action:** none for this merge — but confirm `audio.mjs`
is green in the branch's normal CI, where it has always run.

---

## B. Needs a Qt run (PySide6) — UNVERIFIED here

None of these can even import without PySide6. This is the primary gap.

- **Source (43 files):** `native/src/nes_studio/` — `ui/` (31), `render/` (4),
  `codegen/` (4), `emulator/` (2), `state/` (2).
- **Tests (15 UI files):** `native/tests/ui/*` — including `test_mouse.py`
  (real `QMouseEvent` drag/click/zoom), `test_failure_paths.py`, and **8 files
  asserting on rendered pixels** via `assertRenders()`.
- **One contract test:** `tests/contract/test_palette_parity.py` — statically looks
  Qt-free but transitively imports PySide6 through `render/`.

### Behaviours that genuinely require the Qt run

1. **The `ui/modes/world.py` half of commit `cf59e45`** (the other file in my
   change): accessible names on the five WORLD action buttons, the "Promote to
   16×16 blocks" tooltip, and the scene spin-box ranges now wired to
   `SCENE_X_MAX` / `SCENE_Y_MAX`. Additive and compile-clean, but never exercised
   under Qt here.
2. **Anything visual** — the 8 `assertRenders()` pixel checks (the project's own
   hard-won rule is "assert pixels, not document fields").
3. **Mouse geometry** — click/drag/zoom coordinate maths in `WorldCanvas`,
   `SpriteCanvas`, and the TILES pixel grid (`test_mouse.py`).
4. **Failure paths** — shared-tile guard dialogs, failed-build message box
   (`test_failure_paths.py`).
5. **Emulator** — `native/nes_core` is a Rust/PyO3 wheel; building it needs a Rust
   toolchain absent here, so in-app play is unverified too.

## C. Qt-free but blocked by missing `pytest` — UNVERIFIED here (separate gap)

These need no Qt; they are pytest-style (bare `def test_*`, fixtures) and cannot be
collected without `pytest`, which cannot be installed. **24 files**, including the
substantive parity guarantees:

- Shared server-core parity: `test_shared_{project,world,scene,collision,graphics,build_assets}_core.py`
- Differential codegen/editing: `test_codegen_differential.py`, `test_editing_differential.py`
- Build/play services: `test_build_{preparation,service,request_factory}.py`,
  `test_direct_build_controller.py`, `test_play_service.py`, `test_project_json_cli.py`
- Unit: `test_project_document.py`, `test_project_repository.py`, `test_autosave.py`,
  `test_background_lifecycle.py`, `test_bundles.py`, `test_codegen_runtime.py`,
  `test_fceux_launcher.py`, `test_portability.py`, `test_starters.py`,
  `test_storage_manager.py`

These were **not** fake-run through a hand-rolled harness on purpose: a harness that
mishandles a fixture yields a false green or false red, which defeats the point of
gathering evidence. The authoritative run is the one command below.

## D. Other environment gaps

- **Studio Playwright E2E** (`tools/studio-tests/`) — needs `npm install` + a
  browser download (network); no `node_modules` present.
- **Server-coupled tests** — need `fastapi` (not importable).
- **`test_phase0_starter_fixtures.py`** — needs built `game.nes` fixtures. `*.nes`
  is gitignored (`.gitignore:3`), so these are **absent on any fresh checkout**,
  not just here; the committed fixtures are the `.gz` inputs + `manifest.json`. The
  test errors `FileNotFoundError` until the ROMs are built.

---

## The one command that closes the gap

On a machine with the built virtualenv (setup in `native/README.md`):

```bash
cd native && QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest
```

This single run collects everything in buckets **B**, **C** and **D**'s native
half at once — Qt UI + pixels + mouse, the pytest-only parity/differential suite,
and the palette/phase0 fixtures. The plan docs record the expected total as
**404 tests, ~5 min**.

---

## Decision

**Do not merge `chore/linux-native-bootstrap-v63` to `main` yet.** Two blockers,
in order:

1. **Integrate `main` first (§0).** The branch is 51 commits / 12 engine versions
   (v63→v75) behind and `git merge-tree` conflicts on `tools/playground_server.py`.
   Bring `main` in, resolve that one conflict, and re-snapshot the engine per
   `CLAUDE.md` (`ENGINE_VERSION`, changelog, `snapshot-engine.mjs`).
2. **Then run the one command above** on a machine with the built `.venv`, and get
   the ~404-test native suite green.

What this pass established as *evidence*, so the eventual merge rests on it:

- **Bucket A is green here.** 62 native Qt-free core tests (incl. the web-JS
  validator-parity contract) pass under `python3 -m unittest`; the engine builder
  suite is **100/101** on the branch. The single failure (`audio.mjs`) is
  **environmental — it fails on `main` too** in this container (proven with a full
  `main`-worktree run: 109/110, same one red), and the audio codegen is
  byte-identical between the two. Not a branch regression.
- **Buckets B/C/D are the ~404-test native suite** (Qt UI + pixels + mouse, the
  pytest-only shared-core/differential parity, Playwright, server-coupled) — none
  runnable here, all covered by the one command.

This run **clears the ground and finds the real blocker** (a stale, conflicting
branch); it does not by itself authorise a merge.
