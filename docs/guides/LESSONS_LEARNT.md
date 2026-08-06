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
