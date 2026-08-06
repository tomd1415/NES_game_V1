# Lessons learnt

A growing file, newest first. One entry per thing that cost real time, written so
the *next* person recognises the symptom before they pay for it again.

The valuable part of an entry is not "X was broken". It is **what X looked like**,
**the false theory we held**, and **the one check that would have settled it sooner**.

---

## 2026-08-06 — "The tool is not installed" is a claim, and it needs evidence

Three separate stalls this month traced to the same shape: a session concluded a
tool was absent, wrote that conclusion into a document, and every later session
inherited it as fact. Each conclusion came from a command that failed for a
different reason than "not installed".

### `pytest` was present the whole time

`docs/handoffs/2026-07-28-native-main-integration.md` listed pytest under
**Absent**, and marked it "re-confirmed". It has been in the image since the
Dockerfile was written (`pipx install pytest`).

* **What it looked like:** `python3 -m pytest` → `No module named pytest`.
* **Why that is not the same question:** pipx installs into its own venv and
  exposes only the **console script**. `command -v pytest` →
  `/root/.local/bin/pytest` → `/root/.local/pipx/venvs/pytest/bin/pytest`. The
  module form can never work, by design, and says nothing about availability.
* **Cost:** the native test suite was declared unrunnable in this container and
  went unrun for nine days. When it was finally run (2026-08-06) it took **six
  seconds** to surface two genuine failures — see below.
* **The check that settles it:** `command -v <tool>` **before** `python3 -m <tool>`.
  If you must record "absent", record the command you ran and its exact output, so
  the next reader can tell a missing package from a wrong invocation.

### The general rule

> A negative result from a tool you did not verify is running is not a result.

The same mistake appeared twice more in this repo's recent history:

* **No socket tools.** A session reported "nothing is listening in this container"
  from empty `ss`/`netstat` output. Neither binary is installed; both printed
  nothing and exited. A server had been running for eight days. `command -v ss
  netstat lsof` returns nothing here — use `/proc/net/tcp` (there is a worked
  snippet in the 2026-07-28 handoff).
* **`audio.mjs` "fails on main too".** A leaked server squatting on the hard-coded
  port 18815 made a clean-`main` comparison fail *identically*, which read as
  confirmation of the environmental theory. It was a real regression. Freeing the
  port first would have settled it in a minute.

All three share a structure: **a check that cannot distinguish the two hypotheses
was treated as if it had.** Before trusting a negative, ask what else would produce
that same output.

---

## 2026-08-06 — A contract test that has never once executed its assertion

`native/tests/contract/test_phase0_starter_fixtures.py` compares the native
target's generated artefacts against seven frozen starter-project baselines —
`project.json.gz`, `play-request.json.gz`, `main.c.gz` and **`game.nes`**.

The three `.gz` files are committed. `game.nes` is not, and never was: `.gitignore:3`
is `*.nes`, so the ROM baselines were silently swallowed on the way in. **Zero
`.nes` files are tracked in this repository.** In a fresh clone the test raises
`FileNotFoundError` on the size check and dies before it reaches the hash
comparison at all.

* **What it looked like:** a `tests/contract/` directory whose README line — "proves
  both targets emit byte-identical ROMs" — is quoted in the project `CLAUDE.md`,
  in `native/README.md`, and in every handoff since. It reads like the strongest
  guarantee in the project.
* **The false theory:** that "the cross-target contract holds" was an *observed*
  property. It was an inherited sentence. Nobody in this container had ever run the
  suite (see the entry above for why), and the suite would have failed if they had.
* **Why `.gitignore` hid it:** the pattern is correct and necessary — this repo
  generates `.nes` files everywhere, and `steps/Step_Playground/src/` is rewritten
  on every `/play`. A broad build-output ignore is the right call. The trap is that
  a *fixture* that happens to share an extension with build output is
  indistinguishable to `git`, and `git add` says nothing when it declines.
* **The check that settles it:** for any directory of committed fixtures, assert
  the fixture files exist as a **separate, named test**, so a missing baseline
  fails as "baseline missing" rather than as a confusing assertion error inside the
  test it was meant to support. And after adding fixtures, `git status --ignored`
  on the fixture directory before you believe they landed.

---

## 2026-08-06 — Green suites that are green because they skipped

Running the native suite without PySide6 gives:

```
11 failed, 189 passed, 149 skipped, 12 errors
```

The 149 skips are deliberate and well built: `tests/ui/support.py` guards
`StudioTest` with `@unittest.skipUnless(PYSIDE_AVAILABLE, ...)`, so the UI layer
stands down cleanly on a headless box. That is good design.

The trap is the **12 errors**: twelve modules import PySide6 at module scope, so
they hard-error at collection instead of skipping — and three further tests
(`test_palette_parity.py` ×2, `test_icons.py` ×1) import it *inside* the test body,
so they show up as ordinary **failures** indistinguishable from real ones.

* **What it looks like:** a summary line where a genuine regression and an absent
  optional dependency are the same word. Of the 11 failures above, exactly **one**
  is real (the baseline manifest, see below) and three are "PySide6 is not
  installed" wearing a failure's clothes. Working out which took longer than
  finding the real bug.
* **The rule:** if a suite is designed to degrade without an optional dependency,
  that has to be true of **every** module in it. A half-applied skip guard is worse
  than none, because it teaches you to read past failures.

---

## 2026-08-06 — Watching the engine gate fail on purpose (and what it does not watch)

A check nobody has seen fail is decoration. `scripts/snapshot-engine.mjs --check`
— invoked by `tools/builder-tests/run-all.mjs` as *engine snapshot matches live
sources* — had never been watched go red here, so it was broken deliberately three
ways and restored. Every probe was working-tree only and reverted with
`git checkout --`; the tree was verified clean afterwards.

| Probe | Predicted | Observed |
| --- | --- | --- |
| Baseline | green | `✓ v75 snapshot matches HEAD (30 files).` exit 0 |
| **A.** Append a line to `tools/tile_editor_web/engine-version.js` (uncommitted) | **still green** | still green, exit 0 |
| **B.** `ENGINE_VERSION` → 76 with no `v76/` snapshot | red | `No snapshot for v76 …` exit 1 |
| **C.** Corrupt one `sha1` in `tools/engines/v75/manifest.json` | red, naming the file | `DRIFT (vs HEAD): steps/Step_Playground/Makefile` exit 1 |

**The gate works.** B and C both go red, C names the offending file, and both
return to green on restore.

**Probe A is the one to remember.** It is green *by design* — `--check` compares
committed (HEAD) bytes precisely so it stays deterministic while a `/play` is
rewriting `steps/Step_Playground/src/` underneath it. The cost of that choice is
that **an engine edit you have not committed yet is invisible to the gate**. Run it
after committing, not before, or it will cheerfully bless work it never looked at.

### The blind spot worth knowing about

The v75 snapshot covers **30 files and not one line of Python**:

```
steps/Step_Playground/{Makefile,assets,cfg,src}
tools/tile_editor_web/{builder-assembler.js,builder-modules.js,
                       builder-templates,engine-version.js}
```

Neither `tools/playground_server.py` nor `tools/nes_studio_core/` is in it — yet
`nes_studio_core` now emits most of the ROM, since the codegen was extracted out of
the server. So **a change to the Python codegen alters ROM output and cannot make
this gate go red.** The v64–v75 port landed entirely inside that gap.

That is not the same as "untested": the builder suites drive the real server
(`tools/builder-tests/lib/render-harness.mjs` spawns it), so the codegen is
exercised *behaviourally* — 110 suites, all green. It is simply not *frozen*, so
nothing detects that its output changed. Written up with the decision it implies in
[`../design/engine-versioning.md`](../design/engine-versioning.md).

### The same HEAD semantics have a nastier edge on the *write* side

`snapshot-engine.mjs` reads HEAD when it **creates** a snapshot too. So the
release workflow that `tools/engines/README.md` prescribed — change the engine,
bump the version, write the changelog, snapshot — froze the *previous* engine into
the new `v<N>/` if you had not committed yet. A modified file is written at its
committed bytes with **no warning**; only a brand-new file prints
`(skip, not committed)`. And because `--check` then compares HEAD against a
manifest also derived from HEAD, the two agree perfectly. Snapshots are immutable,
so the only way out is to bump again.

Nobody has hit this, as far as the changelog shows. It is here because it is a
*write* path that fails silently and self-consistently, which is the hardest kind
to notice: the wrong artefact passes its own check. The README now has an explicit
commit step.

### Small thing found on the way

`run-all.mjs`'s header says "Exits 0 if every step passes, 1 on the first failure."
It does not stop on the first failure — it accumulates `anyFail` and exits 1 at the
end. A reader who believes the comment will assume everything after a `FAIL` line
was skipped, when in fact those results are real. One-line comment fix, not done
here (this pass was documentation-only and that is a source file).

---

## 2026-08-06 — The engine moved twelve versions; the native baseline did not

`native/tests/contract/test_baseline_manifest.py` asserts the manifest's
`engine_version` equals the live `tools/engines/ENGINE_VERSION`. It fails
`63 != 75`, and the manifest file is still literally named `baseline-v63.json`.

This is the honest version of the previous entry's "contract holds by
construction" reasoning: the engine versioning gate (`node
tools/builder-tests/run-all.mjs`, which runs `snapshot-engine.mjs --check`)
protects the **web/engine** side and is genuinely green. Nothing was protecting
the native baseline, and it drifted twelve versions without a single red light —
because the test that would have gone red was never run.

* **The pattern to distrust:** "the contract holds by construction, because both
  targets delegate to the same function." That may be true *today*, and it is not
  a test. A delegation can be re-inlined by the next person who is in a hurry, and
  the reasoning leaves no artefact that fails when it stops being true.

---

## Older entries

Traps specific to the native app — assert pixels not document fields, destroy
windows rather than closing them, no expensive work in an off-screen refresh, and
three more — live in [`native/README.md`](../../native/README.md#six-traps-all-of-which-have-bitten)
next to the tests that guard them.
