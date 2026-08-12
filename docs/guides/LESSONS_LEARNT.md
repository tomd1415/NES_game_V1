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

## 2026-08-06 — I diagnosed the ROM drift confidently, and I was wrong

Regenerating the "v63" starter fixtures changed three of seven ROMs, and **all
seven** project / play-request / generated-source hashes. I concluded the starter
definitions had drifted, wrote it up as F13, and reported it as the blocker.

Then I decompressed the artefacts and diffed them. The seven input projects were
**byte-identical apart from a wall-clock `metadata.created`/`modified`
timestamp**. The starters had never moved. What had moved was the generated C:
`targetEngine: 63` stamps a version but builds with the templates at `HEAD`, so
the "v63 fixtures" were a v63-*era* capture that had been drifting with the
engine for twelve versions.

* **The tell I ignored:** "all seven changed" is a suspiciously uniform signal.
  Real drift in seven hand-written starter definitions would not hit every one of
  them; a timestamp would. A uniform diff across unrelated inputs points at
  something injected by the machinery, not at the inputs.
* **What made the difference:** four commands. `gunzip | python3 -m json.tool |
  diff`. I had the artefacts the whole time and reasoned about the hashes instead
  of reading the bytes. **A hash tells you two things differ; only the diff tells
  you what.**
* **Why it still ended well:** the finding was written down and the work stopped
  rather than being committed. Correcting a recorded wrong diagnosis costs one
  commit. An uncorrected one becomes the thing the next person builds on.

## 2026-08-06 — A wall-clock timestamp in a fixture is not cosmetic

That same timestamp did real damage. It made the fixtures non-reproducible, so
regenerating always looked like a change; it made three of the four hash columns
useless as a drift signal; and it silently decoupled the test corpus from the
copy of the starters the app actually ships, which are required to be
byte-identical. Re-baselining the corpus broke that sibling test, and the break
had nothing to do with anything I had intended to change.

It was also **inert**: `StarterCatalog.create()` overwrites both fields with the
real clock on every project it makes, so no pupil ever saw the value. A field
that changes every run, affects nothing at runtime, and is compared for equality
by a test is pure downside.

* **Freeze non-determinism at the point it enters**, not downstream. Frozen to an
  obviously-synthetic epoch, so nobody reads it as a capture date.
* **Two copies that a test requires to be identical need one writer.** The
  packaged copy was hand-maintained; that is why it drifted. The generator now
  writes both, and running it twice produces a byte-identical tree.

## 2026-08-06 — `git check-ignore` is index-aware, and my probe was a no-op

Guarding "no fixture a test depends on may be git-ignored", I tried to prove the
guard could fail by appending an ignore rule over the committed ROMs. The test
stayed green, and for a moment that looked like a broken guard.

It is not: `git check-ignore` never reports a **tracked** file, and that is the
behaviour you want here — a tracked file is in a fresh clone whatever
`.gitignore` says. The probe was testing a scenario that is not a failure. The
real failure is an *untracked* file swallowed by a pattern, and dropping a
`probe.bak` under the fixtures turns it red immediately.

* **A probe that does not go red has two explanations**, and "the check is
  broken" is only one of them. The other is that you probed something that was
  never a failure. Work out which before either trusting or rewriting the check.
* Recorded in the test itself, because the next person will reach for the same
  invalid probe.

## 2026-08-06 — Widening a gate splits history into two eras; say so loudly

Adding `tools/nes_studio_core/` to the engine snapshot took it from 30 files with
**no Python at all** to 41 including the codegen that emits most of the ROM. The
change itself is small. The consequence for the record is not: **v1–v75 were all
taken without it**, so two matching snapshots anywhere in that range say nothing
about whether the codegen changed between them.

That cannot be repaired — snapshot directories are immutable by design, and
back-filling them would mean inventing provenance for files nobody captured.

* **When a check gets wider, every earlier pass silently means less than a reader
  will assume.** Write the discontinuity down where the comparison happens, not
  only in the changelog: it went in the CHANGELOG, `tools/engines/README.md` and
  `docs/design/engine-versioning.md`, each with the two-era table.
* **Prove the widened gate fires.** `--check` reads committed bytes, so proving
  it needed an actual throwaway commit to a codegen file — then `DRIFT (vs HEAD):
  tools/nes_studio_core/collision.py`, exit 1, and reset. An unproven widening is
  just a longer file list.

## 2026-08-06 — I corrupted my own verification run, and the failure looked real

Twenty minutes into a 110-suite builder run, I probed whether the snapshot gate
notices a deleted engine file by moving `steps/Step_Playground/cfg/nes.cfg`
aside for about two seconds. The probe worked. It also landed inside the window
where `round3-multi-bg.mjs` was linking a ROM, and the suite came back
`❌ One or more checks failed` with `ld65: Error: Cannot find config file
'cfg/nes.cfg'`.

Nothing was wrong with the engine. The run had to be thrown away and repeated
from scratch — the full cost of the shortcut, paid in full.

* **A long-running suite makes the whole working tree a shared resource.** I had
  reasoned explicitly, earlier the same session, that I must not edit engine
  files while the suite ran. Then I moved one, because a *probe* felt like a
  read-only activity. It is not: `mv` is `mv`.
* **The tell that saved it:** exactly one suite failed, at the link step, on the
  one file I had touched, with suites either side of it green. A real regression
  from a snapshot-scope change would not be that narrow or that well-timed. Had I
  not known about the probe, this would have read as a genuine v76 regression and
  cost far more than a re-run.
* **Do destructive probes on a quiet tree**, or in a scratch copy. If a probe must
  happen while something is running, it is not urgent enough to be worth it.

---

## 2026-08-12 — The broad ignore rule is the one that costs you something

`.gitignore:3` is `*.nes`. It silently swallowed seven committed ROM baselines and a
contract test's assertion never once executed — that is the 2026-08-06 entry below, and
it cost nine days.

The same shape has now happened twice more in this repo, and the pattern is sharper
than "beware .gitignore":

| Rule | Intent | What it actually took |
| --- | --- | --- |
| `*.nes` | ignore build output | + seven fixture baselines (F5) |
| `.devcontainer/` | ignore local container mess | + the Dockerfile, `devcontainer.json`, `init-firewall.sh` and `post-create.sh` — i.e. every file that makes the app buildable |
| `*.bak-*` (on `main`) | ignore `Dockerfile.bak-tools-174621` | exactly that, and nothing else |

The third is the interesting one. `main` and this branch hit the *same* irritation —
timestamped backup files cluttering `.devcontainer/` — within weeks of each other.
`main` ignored **the backups**. This branch ignored **the directory**. Both make
`git status` clean; only one of them loses the configuration.

* **What it looks like:** nothing. `git status` is clean, which is what you wanted, and
  `git add .devcontainer/post-create.sh` prints **no output at all** when it declines.
  There is no state in which the repository tells you the file is missing — you have to
  ask a different question (`git ls-tree`, `git check-ignore -v`, `git status
  --ignored`).
* **The false theory:** "it is in the repo, I can see it in the editor." An ignored
  file and a committed file look identical in every tool that shows you a filesystem.
* **The check that settles it:** for anything a documented workflow depends on, verify
  it is *tracked*, not that it *exists* —

  ```bash
  git ls-tree -r --name-only HEAD .devcontainer/ | wc -l    # 0 means it is not there
  ```

  and when writing an ignore rule, **name the files you mean, not the place they live**.
  A directory rule is a bet that nothing important will ever be put in that directory.

The cost here has not landed yet, and that is only luck: `devcontainer up` reads the
workspace on disk, so the rebuild works *on this machine*. The provisioning that would
un-skip 161 tests is four untracked files, one lost container away from gone, and
unreviewable in the meantime.

## 2026-08-08 — Restoring a probe mutation is a step that can silently not happen

Breaking a gate on purpose means editing a tracked file and putting it back. I did
that five times today and **three of the five restores failed**, every one of them
`git checkout -- <path>` run from `native/` with a repo-root path:

    error: pathspec 'tools/playground_server.py' did not match any file(s) known to git

That line is loud, but it arrives at the end of a test run that has just printed a
satisfying red failure — the thing I was looking for. Attention is on the assertion,
not on the last line of the shell. One of the three was an edit to
`packaging/install-desktop-entry.sh` that removed a size from the *uninstall* loop:
left in the tree it would have shipped an installer that orphans the 256px icon,
introduced by the very exercise meant to prove the check against that catches it.

What actually fixes it is not "remember the cwd". It is that **the restore needs its
own assertion**, the same way the break does:

    git checkout -- <path> && git status --porcelain | grep -v '^??'

Print the status and look at it. An empty tracked-changes list is the evidence the
probe is over; a passing test afterwards is not, because the mutated file may simply
not be one that test reads.

Related: the same session's `git reset --hard HEAD~1` discarded an uncommitted fix
twice, for the same underlying reason — a destructive step taken while thinking about
something else. Commit first, then probe, then restore.

## 2026-08-09 — My probe harness reported a hole that was really a gate not running

I built a harness to break a gate on purpose and check it goes red. It decided the
outcome from pytest's **exit code**. Three probes came back "STAYED GREEN — hole",
which for a coverage gate is a serious finding, and I nearly wrote them up as one.

They were skips. The harness ran pytest with a stripped `env=` that had no `node` on
`PATH`, and the parity test skips itself when the web harness cannot run. `pytest`
exits **0** for a skip, and it exits 0 for "no test matched that node id" as well. So
three different states — the gate held, the gate never ran, the gate does not exist
under that name — arrived as the same integer, and the one I wanted to detect was the
least likely of the three.

The tell was there and I nearly read past it: the summary line said `1 skipped in
0.03s`, printed right next to the word GREEN in my own output.

**What would have told me sooner:** assert the run happened, not just that nothing
complained.

```python
if not re.search(r"\d+ (passed|failed)", summary):
    raise AssertionError(f"gate did not run ({nodeid}): {summary}")
```

With that in, the same three probes re-ran and split cleanly: one genuine hole (F17),
one control red, one phantom red. Without it, the control would have read as a hole
too, and I would have reported a gate as broken when it works.

Two things generalise:

* **This is the third time on this branch that an exit code has been read as an
  outcome** — `tail` masking node's status, `git checkout --` printing a complaint and
  exiting 0, now pytest's skip. A harness built specifically to catch checks that pass
  without running is worth nothing if the harness itself passes without running.
* **A tool that is careless about the difference between "fine" and "did not happen"
  is the tool you use to audit other tools at your peril.** Give the harness the same
  meta-test you are demanding of the code: make it fail on purpose. Pointing it at a
  node id that does not exist should raise, and now does.

## 2026-08-08 — A number nobody measured reads exactly like one somebody did

Two wrong numbers surfaced this week, from unrelated documents, both load-bearing:

* `native/README.md`: "the **fifteen** Qt-dependent modules by
  `pytest.importorskip`". Twelve are guarded. Fifteen was the count of red lines
  removed; three of those were tests that never needed Qt and were made to run.
* F11: "**32 suites** bypass the `try/finally` reap". ~~Three do.~~ **Twenty-three do
  — see the section added below on 2026-08-09, in which the re-measurement in this
  very entry turned out to be the worse number of the two.** Thirty-three suites
  *have* a reap, so the original 32 counted the population with the guard rather than
  the population that defeats it — it was unmeasured, and it was also nearly right.

Neither was a lie and neither was careless in the moment: each is a real count of a
real set, attached to the wrong sentence. That is what makes the failure mode hard.
**In prose, a measured number and an invented one are typographically identical.**
There is no hedge, no "approximately", nothing to make a reader pause — so the number
gets quoted onward, and by the third document it is simply a fact.

A number that is wrong does not merely misinform, it **reprioritises** — it makes work
look cheaper or dearer than it is, and that changes what gets done. The close-out plan
deferred this fix as "a 32-file harness change that deserves its own session", and that
deferral survived three passes on a number nobody had measured.

*(This paragraph originally continued "The work was three files." It is not. See the
2026-08-09 section below — the correction reprioritised it in the other direction, on
my authority, which is worse.)*

What actually helps, in order of how much:

1. **Write the command next to the number.** `21 ports shared by 42 of 110 suites
   (node tools/builder-tests/ports-unique.mjs)` can be re-run by the next reader in
   seconds. `23 suites share a port` cannot be checked at all without redoing the
   work from scratch, so nobody does. *(This example originally read "11 ports shared
   by 23 of 72 suites" — the wrong number, held up as the model of a checkable one.
   Citing a command does not make the number right; it makes the number **findable**
   when it is wrong, which is how this one was caught.)*
2. **Re-measure before you rely on a number, especially your own.** Both of these
   were mine, written days earlier, and I quoted them back confidently.
3. **Distrust round-ish numbers and numbers that justify a decision.** "32 files, so
   it needs its own session" is the shape to look at hardest — the number is doing
   the arguing.

And a trap inside the recount itself, because the obvious re-measurement was wrong
twice:

* `grep -l importorskip tests/` returns **13** files, one of which only names the
  call inside an assertion message. Counting files that contain a string is not
  counting files that do a thing.
* `gallery.mjs`'s `fail()` calls `process.exit(**2**)`, not `1`. A recount grepping
  `process.exit(1)` silently misses it — a wrong number surviving its own
  verification, which is this file's oldest theme in a new costume.

Both recounts had to be done with `ast`/structural parsing, or by reading the
control flow (`try` at 60, `finally` at 143, `exit` at 149 — that suite does *not*
leak), before they meant anything.

### 2026-08-09 — the correction was worse than the error it corrected

The recount above is wrong. **23 suites bypass the reap, not three** — and the error
is more instructive than the original, so this entry keeps both.

The mechanism has two forms and I only searched for one:

```js
try { fail('x'); }              // exits via a helper defined outside the try — 3 suites
try { process.exit(2); }        // exits literally inside the try  — 20 suites
```

Having found the helper form first, I wrote the conclusion in terms of it — *"only a
`process.exit` inside the try leaks, **and that means a `fail()`-style helper**"* — and
that second clause silently redefined the question. Everything downstream was then
consistent with itself: I even examined `preview-capture.mjs`, asked whether its
`fail()` was called inside the try, found it was not, and **cleared it as a false
positive**. It has a literal `process.exit(2)` on line 61, inside the try, four lines
from where I was looking.

Why this is worse than the original 32:

* The 32 was inherited and unmeasured, and it was **nearly right**. It happened to be
  in the right order of magnitude for the wrong reason.
* The 3 was *mine*, freshly "measured", and published with a table headed **"What the
  re-measurement actually shows"** and a note that the deferral "was justified by a
  number that was never measured, so it is no longer justified". I used the authority
  of having measured to overturn a correct decision.
* A correction carries more weight than an original claim, because it advertises that
  someone checked. Mine reprioritised real work from "needs its own session" to
  "three-file change" and I wrote it into the plan.

**The rule this earns:** when a re-measurement *disagrees sharply* with the number it
replaces, that is the moment for most suspicion, not least. A recount that lands near
the old number is boring and probably fine. One that cuts it by 90% has either found a
real mistake or made a new one, and the two feel identical from the inside — both
produce the small satisfying click of a discrepancy resolved.

The concrete test, which costs a minute: **name the ways the thing can happen before
counting any of them, then confirm your search covers each.** Two arms here — literal
exit, helper exit. Ask "what would this search miss?" and answer it in writing next to
the number. And where the answer is cheap to get, **verify by hand**: reading `spawn`
at 74, `try` at 77, `exit` at 84, `finally` at 88 in `smb-jump.mjs` takes ten seconds
and is not fooled by a regex's blind spot.

Confirm the mechanism too, rather than reasoning about it — this is three lines:

```js
function fail(m){ process.exit(1); }
try { fail('x'); } finally { console.log('FINALLY RAN'); }   // never prints
```

### The same day, again — and the rule that actually ends it

Straight after writing the paragraph above, I applied it to the *other* number in the
same finding: "11 ports shared by 23 suites". I named the arms first, as instructed.
The count went to 14/34. Then I checked for arms I had not named, and it went to
**21/42**. Suites spell the port five ways:

```js
const PORT = 18783;                                   // what I originally matched
const port = 18869;                                   // lowercase
const PORT_C = 18788, PORT_A = 18789, PORT_D = 18790; // three in one declaration
await H.startServer(18882, env);                      // inline, never bound
const romC = await buildWith(18871, {...});           // inline, via a helper
```

Naming the arms was an improvement and it was **not enough**, because the arms were
not enumerable by inspection — each pattern I added revealed the next. So the rule from
the section above needs a second half:

> **When successive attempts at a pattern keep finding more instances, stop counting
> and change the structure so the thing cannot vary.**

Here that is: let `run-all.mjs` assign each suite a port via `PLAYGROUND_PORT` instead
of each suite choosing one. The guard then becomes *"no suite source may contain a port
literal"* — one rule, no spellings to miss — rather than an ever-growing enumeration of
how a port might be written. Three iterations of "now I have counted it properly" is
the signal to stop counting.

The clinching detail: **the checker I had proposed as the fix for this finding had the
bug itself.** `/\bPORT\s*=\s*(\d{4,5})\b/` with `RE.exec` is case-sensitive, cannot see
`PORT_C`, cannot see an inline argument, and takes only the first match per file — so a
three-port suite counted as one. It would have reported 11 clashes and stayed silent
about 10, while carrying the authority of being the remedy. Rewritten to match any
`18xxx` literal, it exits 1 naming 21; pointed at an empty directory it exits **2**,
because a scan that finds nothing must not be able to look like a scan that found
nothing wrong.

## Older entries

Traps specific to the native app — assert pixels not document fields, destroy
windows rather than closing them, no expensive work in an off-screen refresh, and
three more — live in [`native/README.md`](../../native/README.md#six-traps-all-of-which-have-bitten)
next to the tests that guard them.
