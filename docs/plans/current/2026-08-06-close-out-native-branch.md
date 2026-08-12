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
to find out what the **161** currently-skipped UI tests actually do.

Expected going in, *updated 2026-08-07*: F5 and F6 are both fixed (step 5), and F3
is fixed (step 3), so on a box without Qt this is **204 passed, 161 skipped, 0
errors, 0 failures**. Everything red after the rebuild is therefore either a real
UI defect or a problem with the container — there is no longer a class of red line
that means "Qt is absent". That is the whole value of having run steps 3 and 5
first. `native/README.md` § Tests describes how to read the summary.

## Step 3 — ✅ **DONE 2026-08-07** — F3, the half-applied skip guard

`96701cd` (the fix) + `dc6d7fe` (the guard that stops it returning).

**Acceptance met.** On this box, which has no PySide6:
`pytest -q --continue-on-collection-errors` → **204 passed, 161 skipped, 0 errors,
0 failures** (from 198 passed, 149 skipped, 12 errors, 3 failures). Suggested
test 4 is in place, and deleting the guard from `test_portability.py` fails it as
`['tests/unit/test_portability.py'] != []` with the remedy in the message.

Three things worth knowing beyond "guards were added":

- **Seven of the twelve had no `PySide6` in them at all.** They import
  `nes_studio.*`, which pulls Qt in transitively. Grepping for the string finds
  five. The drafted AST version of suggested test 4 would have missed the other
  seven, so the guard test imports each module in a subprocess with PySide6
  forced missing instead — which also means it works on a machine that *has* Qt,
  where a "no collection errors" check would pass while proving nothing.
- **Two of the three failures never needed Qt**, so they now *run* rather than
  skip. `palette.py` imported `QColor` at module scope for a single function,
  which made the cross-target palette contract unimportable headlessly; the icon
  test imported a Qt module to read a tuple of integers. Coverage regained rather
  than relabelled.
- **`conftest.py` only had `tests/ui` on the path**, so `import nes_studio`
  depended on some other module having run first: a single file behaved
  differently from the whole suite. Fixed while in there.

This was step 3 and not step 6 because until it was done, every later run mixed
"absent dependency" and "real bug" into the same word, and each of the steps below
was read through that fog.

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

> **Not the open question it looks like (2026-08-12).** "No Chromium" is a property of
> the *current* container, not of the repo: **both** this branch's on-disk Dockerfile
> and `main`'s bake Chromium at image build. So this step is a container rebuild away,
> not an investigation. It is entangled with step 1 and with the fact that this
> branch's `.devcontainer/` is untracked — see
> [`../../handoffs/2026-08-12-main-divergence-and-the-v76-collision.md`](../../handoffs/2026-08-12-main-divergence-and-the-v76-collision.md).

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

## Step 9 — Close the two gate holes, and guard the two unguarded registries

*Added 2026-08-09. This step did not exist when the plan was written, and its absence
was the plan's own version of the bug it exists to close: every step above ends "done
when the gate is green", and four of the gates were then found to be green for reasons
unrelated to what they claim to watch. A merge justified by those gates inherits that.*

All four are additive — no ROM output changes, no product behaviour changes — and each
has a probe already written that proves it goes red first. Do them in this order; the
first two are holes in existing gates, the last two are missing gates.

| # | Fix | Probe that must go red first |
| --- | --- | --- |
| a | **F17** — `test_the_cases_exercise_every_check`: enumerate `Problem(...)` ids with `ast`, not a regex over source, and assert no id is built dynamically | register a validator with `id='x'` in **single** quotes that never fires; today the gate stays green |
| b | **F14** — `test_codegen_stays_snapshottable`: match `INCLUDE_DIRS` string *literals*, not a substring of raw source | delete the `'tools/nes_studio_core'` entry, leave a comment naming the path; today the gate stays green |
| c | **F15** — add a test that every `Mode` subclass on disk is in `MODE_CLASSES` | add a throwaway `ui/modes/probe.py`; the test must name it |
| d | **F16** — drive the starter picker from `StarterCatalog.styles()`, keeping `STARTERS` as a label lookup; or failing that, `ast`-assert its keys equal the manifest's | add a style to the manifest and not to `STARTERS` |

Two of these need no Qt (a, b, c) and run on this box today. (d) touches a Qt module,
so if it is done as a test rather than a refactor, parse the tuple with `ast` rather
than importing it — the same technique (c) needs.

**Done when:** each of the four probes above has been watched go red with the fix in
and green with it out, and the result recorded in the "Which of these has been watched
fail" section of [`../../guides/what-the-gates-prove.md`](../../guides/what-the-gates-prove.md).

Detail and ready-to-apply code: F14–F17 in
[`../../handoffs/2026-08-06-overnight-review-findings.md`](../../handoffs/2026-08-06-overnight-review-findings.md).

## Step 9b — Merge `main` in, and resolve the `v76` collision *(added 2026-08-12)*

`main` is **33 commits ahead** and at engine **v78**. Both lines created a `v76` from
an identical `v75`, meaning different things — `main`'s is the #37 OAM fix (30 files,
ROM output changed), this branch's is the snapshot-scope bump (41 files, ROM output
unchanged). Full measurement and the recommended resolution:
[`../../handoffs/2026-08-12-main-divergence-and-the-v76-collision.md`](../../handoffs/2026-08-12-main-divergence-and-the-v76-collision.md).

Do this **before** step 9, not after: `main` already fixed the 18790 port double-claim
and added a guard to `run-all.mjs`, and it carries `docs/guides/TEST-SERVERS.md`, which
does not exist here. Doing more port work on this branch first would be redoing it.

1. Merge `origin/main`. Expect 38 files touched on both sides; 31 are the `v76/`
   directory — take `main`'s wholesale rather than merging file-by-file.
   `tools/builder-tests/run-all.mjs` merges cleanly with **zero** conflicts and keeps
   all 28 checks (verified by three-way merge in a scratch dir and comparing every
   `check()` label). Two caveats, both measured:
   - `main`'s new port guard goes **red** on this tree, correctly, naming
     `asm-corpus/asm-player/asm-realproj`. It resolves itself: `main` fixed those three
     and this branch never touched them.
   - `main`'s new "devcontainer Playwright pin" check **passes vacuously** wherever
     `.devcontainer/` is absent — which is a fresh clone of this branch. Un-ignoring
     `.devcontainer/` (below) is what makes it a real check rather than decoration.
2. Renumber this branch's bookkeeping bump to **v79**: `ENGINE_VERSION` and
   `engine-version.js` to 79, CHANGELOG entry moved under `## v79` with a line saying
   why, and `tools/engines/v76/` restored to `main`'s.
3. Re-run `node scripts/snapshot-engine.mjs` — **after committing**, because it reads
   HEAD (F9).

**Done when:** `node scripts/snapshot-engine.mjs --check` prints `v79 … 41 of 41`, the
builder suite is green, and no two snapshot directories describe different engines
under the same number.

## Step 10 — Merge

**Done when:** step 9b done and the `v76` ambiguity gone, builder suite green, native
suite green-or-explained, E2E run, step 9's four probes watched red-then-green, and the
"Active thread" line in `CLAUDE.md` deleted rather than reworded.

Standing constraint until then: **do not merge to `main`.**

---

## What this plan deliberately does not do

- It does not schedule the `bg_compression` memoisation or the
  `_inject_racer_rotation` visibility tidy (F8). They are correct today and
  competing for attention with things that are not.
- It does not touch the server leak — **23 of the 33 suites that spawn a server can
  bypass their own `finally { srv.kill(…) }` reap** (measured and hand-verified
  2026-08-09). It stays deferred, and the original "deserves its own session" was
  right.

  > This bullet said "three suites, not thirty-two" between 2026-08-08 and
  > 2026-08-09, and dissolved the deferral on that basis. That was my error: I
  > searched only for exits routed through a `fail()` helper and reported the three I
  > found as the total, when 20 more exit literally inside the try. The deferral is
  > reinstated. See the twice-corrected F11.

- It does not fix the port sharing — **21 ports shared across 42 suites**
  (re-measured 2026-08-09; this bullet said 11 and 23 for a few hours, which was the
  same undercount as the leak, from the same cause: suites spell the port five
  different ways and I matched one). The two problems **do** compound: 7 suites both
  leak and share a port, on 6 ports.

  The recommendation has changed with the number. Do **not** hand-assign 42 unique
  ports — have `run-all.mjs` allocate one per suite and pass `PLAYGROUND_PORT`, which
  the server already honours. That removes the class rather than re-counting it, and
  reduces the guard to "no suite may contain a port literal", a rule with no spellings
  to miss. The reap is separate and still one line per `spawn`:
  `process.on('exit', () => { try { srv.kill('SIGTERM') } catch {} })`.
