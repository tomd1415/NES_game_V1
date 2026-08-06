# Closing out `chore/linux-native-bootstrap-v63`

Written 2026-08-06 during an overnight pass. The branch is 60+ commits ahead of
`main`, the codegen port is done and the builder suite is green — but three of the
things that were supposed to be guarding it turned out not to be running. This is
the ordered, individually-checkable route from here to a defensible merge.

**Every step has an acceptance check you can run.** A step you cannot check is a
step that gets reported done when it is not. Steps marked **[decision]** need the
owner and must not be guessed.

Findings referenced as F*n* are in
[`../../handoffs/2026-08-06-overnight-review-findings.md`](../../handoffs/2026-08-06-overnight-review-findings.md).

---

## Step 1 — Rebuild the container *(owner-run, host-side)*

Only the owner can run this; `docker` is deliberately absent inside.

```
devcontainer up --workspace-folder <project-dir> --remove-existing-container
```

**Done when:** the create log ends `PySide6 <version> + nes_core + nes_studio OK`
then `post-create OK`.
**Risk:** the recipe (`.devcontainer/Dockerfile` + `post-create.sh`) has been
validated by inspection only — apt names resolve, JSONC parses, `bash -n` clean —
and **never executed**. Likely failure points are the rustup download and the
`maturin build`. Budget ~1.5–2 GB.

## Step 2 — Run the native Qt suite for the first time

```
cd native && QT_QPA_PLATFORM=offscreen .venv/bin/python -m pytest
```

**Done when:** it completes and every failure is on the list below, with nothing
unexplained. Do **not** treat a green run as the goal — the point of this step is
to find out what the 149 currently-skipped UI tests actually do.

Expected going in: the two real failures (F5, F6) plus whatever the UI layer
surfaces. `native/README.md` § Tests describes how to read the summary.

## Step 3 — Fix F3, the half-applied skip guard *(no decision needed)*

Twelve modules import PySide6 at module scope and error instead of skipping;
three more import it inside the test body and report as plain failures.

**Done when:** `cd native && pytest -q --continue-on-collection-errors` on a box
*without* PySide6 reports **0 errors** and every PySide6-dependent test as a
*skip*, and suggested test 4 (module-scope import guard) is in place and fails
against a deliberately-unguarded module.

This is step 3 and not step 6 because until it is done, every later run mixes
"absent dependency" and "real bug" into the same word, and each of the steps below
is read through that fog.

## Step 4 — **[decision]** What is a trustworthy native ROM baseline?

The blocker. `test_phase0_starter_fixtures.py` compares against seven `game.nes`
files that were never committed (`.gitignore:3` is `*.nes`; **no `.nes` is tracked
anywhere**), so the byte-identical-ROM assertion has never executed (F5). And
`baseline-v63.json` is pinned twelve engine versions back (F6).

Regenerating baselines from the code under test makes both tests green by
construction and worth nothing. Options, none of which I can pick:

| Option | What it buys | What it costs |
| --- | --- | --- |
| Regenerate at v75 and commit, stating plainly that it pins *current* behaviour | The test starts working; future drift is caught | Today's output is blessed unverified; if the port is wrong, the wrongness is frozen |
| Rebuild the seven starters with the archived **v63** engine from `tools/engines/v63/` and diff against the v63 manifest first | A baseline with provenance — you learn whether v63→v75 changed these ROMs, and why | Needs the snapshot-build path that `docs/design/engine-versioning.md` still lists as TODO |
| Play each of the seven ROMs and attest, as was done for the v63 manual pass | Human eyes on actual behaviour | Slow, and attestation is not byte-equality |

**Done when:** the choice is recorded in the handoff with its reasoning — not just
implemented.

## Step 5 — Fix F5/F6 per that decision, with the guards that stop a recurrence

1. Un-ignore the fixture path (`!native/tests/fixtures/**/*.nes`, or anchor the
   `*.nes` rule) and commit the baselines the decision calls for.
2. Add suggested tests 2 and 3 (fixture-presence, and "nothing expected is
   git-ignored") — both drafted ready-to-apply in the findings appendix.
3. Re-baseline the manifest and rename it off `baseline-v63.json`.

**Done when:** `pytest tests/contract/` is green **and** deleting one `game.nes`
makes it fail with *"missing fixture artefacts"* rather than a `FileNotFoundError`
inside an unrelated assertion. Check the failure mode, not just the pass.

## Step 6 — Fix F1, and add the test that found it

One line: `_OVERFLOW_RE` → `by (\d+) bytes?`. Test is in the findings appendix.

**Done when:** all seven tests pass, and they fail again if the `?` is removed.

## Step 7 — Run the Studio E2E

```
npx playwright test
```

**Done when:** it runs at all — this suite has never executed here. Record the
result whatever it is.

## Step 8 — **[decision]** Does `tools/nes_studio_core/` join the engine snapshot?

F7: the v75 snapshot is 30 files and no Python, so a change to the codegen that
emits most of the ROM cannot make the snapshot gate go red. Adding it changes what
a snapshot *is* and needs a version bump plus a call on the existing v1–v75
snapshots, all taken without it.

This is last because it is the only item that is **not** a prerequisite for the
merge — the port is behaviourally covered by 110 builder suites. It is a
prerequisite for the *next* engine change being safe.

**Done when:** decided either way and written down. "Not now, because X" is a
complete answer; silence is not.

## Step 9 — Merge

**Done when:** builder suite green, native suite green-or-explained, E2E run, and
the "Active thread" line in `CLAUDE.md` deleted rather than reworded.

Standing constraint until then: **do not merge to `main`.**

---

## What this plan deliberately does not do

- It does not schedule the `bg_compression` memoisation or the
  `_inject_racer_rotation` visibility tidy (F8). They are correct today and
  competing for attention with things that are not.
- It does not touch the 32-suite `fail()`/`process.exit(1)` server leak. It is
  real, it is documented in the 2026-07-28 handoff, and it is a 32-file harness
  change that deserves its own session rather than a corner of this one.
