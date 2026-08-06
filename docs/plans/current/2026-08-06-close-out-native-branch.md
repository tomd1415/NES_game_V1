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

## Step 4 — ~~[decision]~~ **DECIDED 2026-08-06 03:00 — FIX, with provenance**

> **Owner's answer, recorded verbatim in substance:** make the assertion actually
> execute. Un-ignore the path and commit baselines, **but do not pretend they are
> independent** — generate them at a *specific named commit*, record that
> provenance in the test **and** in a doc, and state plainly that the gate catches
> **drift from that point** rather than proving correctness. "That is worth having
> and honest; a baseline silently generated from the code under test is not." Same
> treatment for `baseline-v63.json`.
>
> So the option table below is settled: **option 1, with the provenance and the
> honesty requirement made explicit in the artefacts themselves.** Not started —
> the decision arrived at the 03:00 stop. The next session does it.
>
> Concretely, the acceptance for this step is now: every committed baseline names
> the commit it was generated at; `test_phase0_starter_fixtures.py` and the
> renamed baseline manifest both carry that commit; and a reader of either can tell
> in one line that a pass means "unchanged since <sha>", not "correct".

The blocker as it stood before that answer: `test_phase0_starter_fixtures.py` compares against seven `game.nes`
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

## Step 5 — ✅ **DONE 2026-08-06** — F5/F6 fixed, with the guards

Landed as five commits, deliberately ordered so the evidence outlived the thing
that replaced it:

1. `f5b52d7` — the old v63 hashes recorded **before** the destructive regenerate,
   and F13's diagnosis corrected (it blamed the starters; the starters were
   innocent — see below).
2. `3e8ee3e` — `.gitignore` negation, plus provenance fields in the generator and
   a test that asserts they are present and that the tree was clean.
3. `b7cd3ad` — the fixtures themselves, regenerated at a named clean commit.
4. `a9fd193` — the two guards from Appendix 2, both probed red.
5. `aa12a75` + `65d98ee` — froze the fixture clock and made one generator write
   both the corpus and the packaged copy.

**What this actually taught us,** beyond the two findings:

- **F13 was wrong.** The seven input projects had not drifted at all; they were
  byte-identical apart from a wall-clock `metadata.created`/`modified`. The three
  changed ROMs are engine drift between v63 and v75, not starter drift.
- **`targetEngine: 63` does not select the archived v63 engine.** It stamps a
  version and builds with the templates at `HEAD`. The "v63 fixtures" were a
  v63-*era* capture that had been drifting silently ever since, which is why the
  manifest now records `engine_version_requested` and
  `engine_version_at_source_commit` separately.
- **Re-baselining broke a sibling test** (`test_starters.py`): the app ships its
  own copy of the starters that must be byte-identical to the corpus, and it was
  hand-maintained. Fixed at the root — frozen clock, one writer.

Still open and **not** for me to answer: whether the smb / runner / geodash ROM
change between v63 and v75 was intended. Recorded in
[`../../handoffs/2026-08-06-starter-fixture-rebaseline.md`](../../handoffs/2026-08-06-starter-fixture-rebaseline.md)
with what it is not (not audio, not any single scalar setting).

<details>
<summary>Original step 5 text, for reference</summary>

1. Un-ignore the fixture path (`!native/tests/fixtures/**/*.nes`, or anchor the
   `*.nes` rule) and commit the baselines the decision calls for.
2. Add suggested tests 2 and 3 (fixture-presence, and "nothing expected is
   git-ignored") — both drafted ready-to-apply in the findings appendix.
3. Re-baseline the manifest and rename it off `baseline-v63.json`.

**Done when:** `pytest tests/contract/` is green **and** deleting one `game.nes`
makes it fail with *"missing fixture artefacts"* rather than a `FileNotFoundError`
inside an unrelated assertion. Check the failure mode, not just the pass.

</details>

*Acceptance met:* removing `runner/game.nes` fails as
`missing fixture artefacts: runner/game.nes`; flipping one byte of
`smb/game.nes` fails on the `rom_sha256` comparison. Both restored after.

## Step 6 — Fix F1, and add the test that found it

One line: `_OVERFLOW_RE` → `by (\d+) bytes?`. Test is in the findings appendix.

**Done when:** all seven tests pass, and they fail again if the `?` is removed.

## Step 7 — Run the Studio E2E

```
npx playwright test
```

**Done when:** it runs at all — this suite has never executed here. Record the
result whatever it is.

## Step 8 — ✅ **DONE 2026-08-06 — shipped as engine v76**

`e1de8c9` (the bump) + `052ffbc` (the snapshot), in that order, because
`snapshot-engine.mjs` reads **committed** bytes and snapshotting first would have
frozen the old code into an immutable directory.

- `tools/nes_studio_core/` added to `INCLUDE_DIRS`: the snapshot went from **30
  files with no Python** to **41 files including 10 Python modules**.
- `EXCLUDE_RE` also skips `__pycache__/` and `*.pyc`.
- **Proved the gate now catches what it could not before:** committing a one-line
  change to `nes_studio_core/collision.py` makes `--check` print
  `DRIFT (vs HEAD): tools/nes_studio_core/collision.py` and exit 1. Probe commit
  discarded, `--check` green again. (It had to be a *commit* — `--check` reads
  HEAD, so an uncommitted edit is invisible to it.)
- The "record clearly" half landed in three places: the v76 CHANGELOG entry,
  `tools/engines/README.md`, and `docs/design/engine-versioning.md`, each stating
  that **v1–v75 were taken without Python coverage and are not comparable with
  v76+**, and that the gap cannot be repaired because snapshot directories are
  immutable.

Still outside the snapshot, and named in the script's own NOTE so it cannot be
forgotten: `playground_server.py`. Its five ROM-emitting entry points are
one-line delegations into `nes_studio_core` today; inlining any of them back
would narrow the gate silently.

<details>
<summary>Original step 8 text, for reference</summary>

> **Owner's answer:** add `tools/nes_studio_core/` to the snapshot, and **record
> clearly that v1–v75 were taken without it, so nobody reads them as comparable.**
> (The instruction arrived partly garbled — "add tools/nes_studio_core/ to
> snapshot[, r]ecord clearly that v1-v75 were taken without it so nobody reads
> them as comparable" — but the intent is unambiguous and consistent with the
> answer to step 4: make the gate real, and be explicit about what it does and does
> not cover.)
>
> Not started — it arrived at the 03:00 stop, and this one cannot be done safely in
> a hurry: adding to `INCLUDE_DIRS` changes what a snapshot *is*, so it needs an
> `ENGINE_VERSION` bump, a `CHANGELOG.md` entry, a fresh `v76/` snapshot **taken
> after committing** (see `tools/engines/README.md` — snapshotting uncommitted work
> freezes the old code into an immutable directory), and a full builder run to
> verify. Rushing it produces exactly the wrong-and-self-consistent artefact this
> pass exists to have found.
>
> The "record clearly" half must land in `tools/engines/README.md` and
> `docs/design/engine-versioning.md`, next to the existing note, and ideally as a
> `covers_python: false` marker in the v1–v75 manifests' documentation rather than
> in prose alone.

The problem this answers:

F7: the v75 snapshot is 30 files and no Python, so a change to the codegen that
emits most of the ROM cannot make the snapshot gate go red. Adding it changes what
a snapshot *is* and needs a version bump plus a call on the existing v1–v75
snapshots, all taken without it.

This is last because it is the only item that is **not** a prerequisite for the
merge — the port is behaviourally covered by 110 builder suites. It is a
prerequisite for the *next* engine change being safe.

**Done when:** decided either way and written down. "Not now, because X" is a
complete answer; silence is not.

</details>

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
