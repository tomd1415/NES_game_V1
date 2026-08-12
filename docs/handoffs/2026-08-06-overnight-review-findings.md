# Overnight review findings — 2026-08-06

Self-directed pass, 01:00–03:00 BST, no decisions available. Documentation-only
changes were committed (`6ba5496`, `8eb535b`); **everything below that touches code
is described, not done.**

Companion documents: [`../guides/LESSONS_LEARNT.md`](../guides/LESSONS_LEARNT.md)
(why these happened), [`2026-07-28-native-main-integration.md`](2026-07-28-native-main-integration.md)
(the thread this came out of).

## State when I stopped

| Check | Result |
| --- | --- |
| `node tools/builder-tests/run-all.mjs` | ✅ green — 110 suites, "All Builder regression checks pass" |
| `node scripts/snapshot-engine.mjs --check` | ✅ `v75 snapshot matches HEAD (30 files)` |
| `cd native && pytest -q --continue-on-collection-errors` | 189 passed, 149 skipped, **11 failed, 12 errors** — of which **2 failures are real** (F5, F6 below) |
| `native/tests/contract/test_validator_parity.py` | ✅ 2 passed, 31 subtests, 1.07 s — the **validator** half of the cross-target contract is real and green |
| `npx playwright test` | not run — Chromium binary absent |
| Working tree | clean; `start.sh` untracked, as it was at the start |
| Branch | `chore/linux-native-bootstrap-v63`, pushed, **not** merged to `main` |

## Findings

Ranked by how quietly they fail. Nothing here is a crash; every one of them is
something that looks fine.

### F1 — A one-byte cartridge overflow is not translated (real, one-line fix)

`tools/nes_studio_core/play.py:17`

```python
_OVERFLOW_RE = re.compile(r"overflows memory area '(\w+)' by (\d+) bytes")
```

The shipped linker's format string, read out of the binary rather than guessed
(`strings $(command -v ld65) | grep -i overflow`, ld65 V2.18 / Debian 2.19-1):

```
Segment '%s' overflows memory area '%s' by %lu byte%c
```

`byte%c` — cc65 puts `s` there for a plural and a space for exactly one. So an
overflow of exactly 1 byte does not match, `friendly_build_error` returns the raw
log, and the pupil is shown `Segment 'RODATA' overflows memory area 'ROM0' by 1
byte` instead of the explanation. It fails **silently and in the direction of the
user**: nothing logs that the friendly path was skipped.

Narrow — you have to land on exactly one byte — but the fix is free:

```python
_OVERFLOW_RE = re.compile(r"overflows memory area '(\w+)' by (\d+) bytes?")
```

Confirmed empirically, not just read: the test in the appendix fails against the
current code on exactly this case and passes on the rest.

### F2 — `friendly_build_error` has no test anywhere

Nothing in `tools/builder-tests/` or `native/tests/` names it. It is the only thing
between a pupil and a raw ld65 error, it is pure and instant to test, and its
failure mode is silent (a regex that stops matching just returns the input). A
ready-to-apply test is in the appendix; it takes 6 ms.

### F3 — Twelve test modules break the suite's own skip contract

`native/tests/ui/support.py` guards `StudioTest` with
`@unittest.skipUnless(PYSIDE_AVAILABLE, …)`, so the suite is *designed* to degrade
on a headless box. Twelve modules import PySide6 at module scope and therefore
**error at collection** instead of skipping:

```
tests/contract/{test_build_request_factory,test_codegen_differential,test_direct_build_controller}.py
tests/ui/{test_build_worker,test_failure_paths,test_mouse}.py
tests/unit/{test_bundles,test_codegen_runtime,test_portability,
            test_project_session,test_storage_manager,test_world_canvas}.py
```

Worse, three tests import it *inside the test body* — `test_palette_parity.py` (×2)
and `test_icons.py` (×1) — so they report as ordinary **failures**, indistinguishable
from real ones. Three of the eleven "failures" in the table above are this. Working
out which three took longer than finding the real bugs.

A half-applied skip guard is worse than none: it teaches you to read past failures.

### F4 — `run-all.mjs`'s header contradicts `run-all.mjs`

```
//   Exits 0 if every step passes, 1 on the first failure.
```

It does not stop on the first failure. It accumulates `anyFail` and exits 1 at the
end (`run-all.mjs:692-698`). A reader who believes the comment will assume the
results after a `FAIL` line were skipped, when they are real. Comment-only fix.

### F5 — The native ROM baseline was never committed (**needs a decision**)

`native/tests/contract/test_phase0_starter_fixtures.py` compares against seven
`game.nes` baselines matched by `.gitignore:3` (`*.nes`). **No `.nes` file is
tracked anywhere in this repository.** The three `.gz` artefacts per fixture *are*
committed, so the directories look complete. The test dies `FileNotFoundError` on
the size check before it reaches the hash comparison, on every fresh clone.

Consequence: the byte-identical-ROM assertion — quoted in `CLAUDE.md`,
`native/README.md` and every recent handoff as the project's strongest guarantee —
has never once executed.

I did not fix it. Un-ignoring the path is one line; producing seven baselines is
the problem, because a baseline regenerated from the code under test is green by
construction. Raised in `.mc-outbox.md` and `.mc-ask-critic.md`.

### F6 — `baseline-v63.json` is twelve engine versions behind (**needs a decision**)

`test_baseline_manifest.py` asserts the manifest's `engine_version` equals
`tools/engines/ENGINE_VERSION`. `63 != 75`. Same re-baselining question as F5.

### F7 — The engine snapshot contains no Python at all

Covered in detail in [`../design/engine-versioning.md`](../design/engine-versioning.md)
and commit `8eb535b`. Short version: the v75 snapshot is 30 files, zero Python;
`tools/nes_studio_core/` now emits most of the ROM and cannot make the snapshot
gate go red. The v64–v75 port landed inside that gap. Needs a version bump and a
call on the existing v1–v75 snapshots, so: **owner decision.**

### F8 — Minor, listed for completeness

* `bg_compression()` re-runs `world_nametable()` and `_dedup_columns()` on every
  call, and is called from `build_bg_world_h`, `build_bg_world_c` and
  `guard_world_fits` — so a wide level is column-deduplicated three or more times
  per build. Correct, just wasteful; an `lru_cache` is awkward because `state` is a
  dict, so it wants an explicit memo threaded through the build.
* `preparation.py:203` calls `graphics._inject_racer_rotation(...)` — a private name
  across a module boundary. Either it is part of the interface and should lose the
  underscore, or the call belongs inside `graphics`.
* `friendly_build_error(None)` returns `None`, not `""`, although the body guards
  the match with `log or ""`. The only caller passes `str(exc)`, so it is an
  inconsistency rather than a live bug.
* Same class as F5, benign today: `.gitignore` lines 4–6 (`level.nam`, `game.chr`,
  `scene.inc`) name files that are **already tracked** under
  `steps/Step_Playground/src/`. Tracking wins, so those specific files are fine and
  their build-mutations stay visible in `git status` — which is how the working
  tree was confirmed clean after a full suite run. But the patterns are bare
  filenames with no path anchor, so they would silently swallow a *new*
  `scene.inc` or `game.chr` anywhere else in the repo, exactly as `*.nes` did to
  the fixtures. Anchoring them (`/steps/Step_Playground/src/scene.inc`) costs
  nothing.

### F9 — The engine release workflow told you to snapshot before committing

`tools/engines/README.md` — fixed in `181c877`. Both `snapshot-engine.mjs` modes
read **committed** bytes. Snapshotting a *modified* file freezes its old content
with **no warning** (only a never-committed file prints `(skip, not committed)`),
and `--check` then compares HEAD against a HEAD-derived manifest and agrees. Since
snapshots are immutable, the only escape is another version bump. The workflow now
has an explicit **commit** step.

### F10 — The nes_core wheel is not vendored (**needs a decision**)

`native/nes_core/README.md` — fixed in `9a24b76`. It claimed "the built wheel is
vendored in `dist/` so the app can be installed without a Rust toolchain".
`dist/` does not exist and `.gitignore:46` ignores it, so no `.whl` is in version
control and `--find-links nes_core/dist` cannot be satisfied on a fresh clone. The
self-contained-wheel promise is true of the wheel and false of the repository.
Committing a binary, publishing it, or documenting the Rust requirement is an
owner call. This is the claim that cost the most: it is why the pending container
rebuild carries a Rust toolchain nobody asked for.

## Reviewed and found nothing — do not redo these

Fresh-eyes review of `8cf5b31`, `ccbd53a`, `c7c5531`. Each of these was a
specific suspicion that turned out to be wrong; recorded so the next reader spends
their scepticism elsewhere.

* **`sfx_is_real` vs an empty sfx upload.** `normalize_audio` sets
  `sfx_is_real = sfx is not None` *before* the stub substitution, so an empty
  string looked like it would set the flag true and then get stubbed — engaging
  event SFX against the stub, exactly what the flag exists to prevent. It does
  not: `_audio_source` returns `None` for anything whitespace-only
  (`value.strip()`), so the two agree. **Not a bug.**
* **`graphics.expand_metatiles(state)`'s return value is discarded** at
  `preparation.py:197`. It mutates the background dicts in place and returns the
  same `state` object, so this is correct. **Not a bug.**
* **`guard_world_fits` claims it runs after `expand_metatiles`** so it measures
  the emitted world. It does — `preparation.py:197` then `:202`. **Claim true.**
* **`guard_world_fits`'s docstring promises a friendly message downstream** for
  worlds of 8 screens or fewer that overflow anyway. That path exists
  (`play.py:17-33`). **Claim true** — subject to F1.
* **`AudioAssets.sfx_is_real` defaults to `False`**, so any caller that forgets it
  gets the safe answer. **Fails closed; good.**
* **The audio backslash regression fix** (`"""\\` → `"""\`) is correct in all three
  stubs, and `audio.mjs` is green.

## Suggested tests, in the order I would add them

1. **`friendly_build_error`** — appendix below. Cheapest, and it already finds F1.
2. **Fixture presence, as its own named test.** A missing baseline should fail as
   *"baseline missing"*, not as a `FileNotFoundError` inside the assertion it was
   meant to support. Assert every fixture directory holds all four artefacts.
3. **Nothing tracked-and-expected is git-ignored.** Run `git check-ignore` over the
   fixture tree and fail on any hit. This catches the whole class F5 belongs to,
   not just today's instance, and would have caught F5 the day it happened.
   Prototyped and confirmed — second appendix. **The non-obvious part:** globbing
   the filesystem for what to check passes *vacuously* once the file is already
   gone, which is exactly the state F5 left the repo in. The check has to run
   against the paths the manifest says *should* exist, not the ones on disk.
4. **Skip-guard consistency.** Parse each module under `native/tests/` and fail if
   it imports PySide6 at module scope without the guard. Fixes F3 permanently
   rather than one file at a time.

## Appendix — ready-to-apply test for F1/F2

Save as `native/tests/unit/test_friendly_build_error.py`. Seven tests, ~3 ms; six
pass, `test_one_byte_overflow_is_still_translated` fails until F1 is fixed. Both
halves were confirmed by running it: as-is it fails exactly that one test, and with
`bytes` → `bytes?` applied to `_OVERFLOW_RE` all seven pass (verified, then
reverted — no code change is committed on this branch).

```python
"""Tests for tools/nes_studio_core/play.py::friendly_build_error.

It is the only thing between a pupil and
`Segment 'RODATA' overflows memory area 'ROM0' by 5950 bytes`, and it fails
SILENTLY: a regex that stops matching just returns the raw log, and nothing
notices the friendly path went dead.

The real message format, read out of the shipped binary rather than guessed
(`strings $(command -v ld65) | grep -i overflow`, ld65 V2.18 Debian 2.19-1):

    Segment '%s' overflows memory area '%s' by %lu byte%c

Note `byte%c`: cc65 puts 's' there for a plural and a space for exactly one.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))

from nes_studio_core.play import friendly_build_error  # noqa: E402


REAL = "ld65: Error: Segment 'RODATA' overflows memory area 'ROM0' by 5950 bytes"


class FriendlyBuildErrorTests(unittest.TestCase):
    def test_a_real_ld65_overflow_is_translated(self) -> None:
        out = friendly_build_error(REAL)
        self.assertNotEqual(out, REAL, "the raw linker text was passed through")
        self.assertIn("5950 bytes too big", out)
        self.assertIn("32KB", out)

    def test_the_byte_count_comes_from_the_overflow_not_the_segment(self) -> None:
        """Group 1 is the memory area, group 2 is the count. Swapping them would
        still 'work' on most inputs, so pin it with an unmistakable number."""
        out = friendly_build_error(
            "Segment 'CODE' overflows memory area 'ROM0' by 7 bytes"
        )
        self.assertIn("about 7 bytes too big", out)

    def test_one_byte_overflow_is_still_translated(self) -> None:
        """ld65 emits 'byte' (singular) for exactly one. The current regex
        demands 'bytes' and silently gives up. Fix: `by (\\d+) bytes?`."""
        raw = "Segment 'RODATA' overflows memory area 'ROM0' by 1 byte"
        out = friendly_build_error(raw)
        self.assertNotEqual(out, raw, "one-byte overflow fell through untranslated")
        self.assertIn("1 byte", out)

    def test_an_unrelated_build_failure_is_passed_through_untouched(self) -> None:
        raw = "ca65: Error: Invalid input character: 0x5C"
        self.assertEqual(friendly_build_error(raw), raw)

    def test_empty_input_is_safe(self) -> None:
        self.assertEqual(friendly_build_error(""), "")

    def test_none_does_not_raise(self) -> None:
        """`search(log or "")` guards the match against None but the fall-through
        is a bare `return log`. The only caller passes `str(exc)`, so this is an
        inconsistency, not a live bug — asserted as "does not raise" so it does
        not become a false alarm."""
        self.assertFalse(friendly_build_error(None))

    def test_the_advice_names_actions_a_pupil_can_take(self) -> None:
        out = friendly_build_error(REAL)
        for action in ("shorter", "reuse repeated sections", "fewer different"):
            self.assertIn(action, out)


if __name__ == "__main__":
    unittest.main()
```

## Appendix 2 — ready-to-apply test for F5 (and the class it belongs to)

Save as `native/tests/unit/test_fixtures_are_tracked.py`. Both tests fail today,
each with a message that names the problem instead of describing a symptom:

```
AssertionError: these fixture files are git-ignored and will be absent in a
fresh clone:
  native/tests/fixtures/phase0/starters/basics/game.nes
  … (7 in total)

AssertionError: missing fixture artefacts:
  basics/game.nes
  … (7 in total)
```

Run in-repo and then removed; nothing was left behind.

```python
"""Nothing a test depends on may be git-ignored, and nothing the manifest
promises may be absent.

This is the generalisation of the bug where the seven `game.nes` starter
baselines were silently swallowed by `.gitignore:3` (`*.nes`). A per-file
existence check catches that one instance; this catches the class, including the
next fixture someone adds with an extension that collides with a build-output
pattern. `git add` says nothing when it declines an ignored path, so the file
goes missing at the moment it is created and looks fine forever after.
"""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "native" / "tests" / "fixtures"
STARTERS = FIXTURES / "phase0" / "starters"
STARTER_ARTEFACTS = ("project.json.gz", "play-request.json.gz", "main.c.gz", "game.nes")


def _expected_fixture_paths() -> list[Path]:
    manifest = json.loads((STARTERS / "manifest.json").read_text(encoding="utf-8"))
    return [
        STARTERS / name / filename
        for name in manifest["fixtures"]
        for filename in STARTER_ARTEFACTS
    ]


class FixturesAreTrackedTests(unittest.TestCase):
    def test_no_fixture_file_is_git_ignored(self) -> None:
        # EXPECTED paths, not just the ones on disk. Globbing the filesystem
        # passes vacuously once the file is already missing, which is precisely
        # the state this test exists to detect.
        paths = sorted(
            {*_expected_fixture_paths(), *(p for p in FIXTURES.rglob("*") if p.is_file())}
        )
        self.assertTrue(paths, f"no fixtures found under {FIXTURES}")
        # check-ignore echoes the ignored paths; exit 1 means none matched.
        result = subprocess.run(
            ["git", "-C", str(REPO), "check-ignore", "--stdin"],
            # Repo-relative: check-ignore cannot match a path outside the repo.
            input="\n".join(str(p.relative_to(REPO)) for p in paths),
            capture_output=True,
            text=True,
        )
        ignored = [line for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(
            ignored,
            [],
            "these fixture files are git-ignored and will be absent in a fresh "
            "clone:\n  " + "\n  ".join(ignored),
        )

    def test_every_fixture_referenced_by_the_manifest_exists(self) -> None:
        """Fail as 'baseline missing', not as a FileNotFoundError buried inside
        the assertion it was meant to support."""
        missing = [
            f"{path.parent.name}/{path.name}"
            for path in _expected_fixture_paths()
            if not path.is_file()
        ]
        self.assertEqual(
            missing, [], "missing fixture artefacts:\n  " + "\n  ".join(missing)
        )


if __name__ == "__main__":
    unittest.main()
```

---

# Second sweep — silent failures and drift (02:00–02:40)

Catalogue items 10 and 11: things that no longer match reality, and shapes in our
own code that fail without saying so. Two findings, one clean result, and two more
ready-to-apply checks — both run, both confirmed to catch the thing they claim to.

## F11 — Twenty-three builder suites share a port with another suite

> **⚠ Corrected twice. Read the 2026-08-09 section at the end of this finding, not
> the 2026-08-08 one.** Both counts in this finding have been wrong.
> The **port** count went 11/23 → **21 ports across 42 suites**, and the leak count
> has been wrong twice: the original **32** was never measured, and my
> 2026-08-08 "correction" to **3** was measured with a search that could only find one
> of the two ways it happens. Measured properly: **23 suites**, of which **4 also
> share a port**. The 2026-08-08 section below is left in place and struck, because
> what it got wrong is more instructive than what it got right.

`tools/builder-tests/run-all.mjs`'s own header says each suite "spawns its own
playground server on a **unique port**". Nothing enforces it, and **21 ports are
shared across 42 suites** (re-measured 2026-08-09; the figure below said 11 and 23
until then — see "Counting the ports is the wrong approach"):

```
18781  all-modules, perdoor*                 18847  hopper-enemy, scene-multiscreen
18783  dialogue-scroll, smb-jump*            18861  accounts, palette-render
18789  asm-player, smb-hud*                  18862  account-projects, gallery-auth
18790  asm-corpus, asm-player, asm-realproj  18863  csrf-origin, racer
18791  asm-corpus, asm-realproj, smb-level*  18867  scroll-wide-compressed, smb-stomp, topdown-enemies
18792  asm-ai-corpus, asm-vscroll, shared-play*, smb-render*   18868  scroll-wide-compressed, win-reach-tile
18793  asm-ai-corpus, asm-vscroll, topdown*  18869  pickup-collect, scroll-2x2, scroll-wide-too-varied, stomp-basic
18794  asm-ai-bench, asm-enemy, asm-smb-bench   18871  scroll-narrow-compressed, sfx-events, style-starters
18795  asm-ai-bench, asm-enemy, asm-smb-bench   18872  build-concurrency, scroll-narrow-compressed
18796  asm-ai-wide, asm-scene, hud-nmi-flicker  18797  asm-ai-wide, asm-scene
18844  flyer-patrol, racer-hud
```

`*` = also bypasses its own reap, so it can leave a server squatting that port.
**Seven** suites do both, on **six** ports.

Sequential execution normally hides this. What un-hides it is the leak: an exit from
inside the guarded region bypasses the `try/finally { srv.kill('SIGTERM') }`, the
leaked server squats the port, and the next suite sharing it dies with an opaque
`UND_ERR_SOCKET`. That is the exact mechanism behind the false theory that cost a
session.

**Un-struck 2026-08-09.** This paragraph was struck on 2026-08-08 on the grounds that
only three suites could leak and none of them shared a port. Both halves of that were
wrong: 23 can leak and 4 of them share a port. The original text overstated the
mechanism only in saying "`fail()` calls `process.exit(1)`" — it is usually a literal
`process.exit(n)`, not the helper — and in the count, which was never measured. Its
substance stands.

Two independent fixes, either sufficient, both cheap: give each suite its own
port, or register `process.on('exit', () => { try { srv.kill('SIGTERM') } catch {} })`
after each `spawn`. Doing both is better — unique ports stop the propagation, the
exit hook stops the leak. Checker in Appendix 3; it exits 1 today and names every
pair.

### ~~What the re-measurement actually shows (2026-08-08)~~ — WRONG, see below

~~Counted from source, not carried forward:~~

| ~~Claim~~ | ~~Measured~~ |
| --- | --- |
| ~~11 ports shared, 23 suites~~ | ~~**confirmed** — 72 suites declare a `PORT`~~ — **also wrong: 21 ports, 42 suites.** "72 suites declare a `PORT`" counted one of five spellings |
| ~~"32 suites" bypass the reap~~ | ~~**3** — `audio.mjs`, `four-screen.mjs`, `gallery.mjs`~~ |
| ~~the leak un-hides the port sharing~~ | ~~**no** — all three use unique ports~~ |

~~Where 32 came from: **33** suites have a `finally` block that kills the server. That
is the count of suites with the reap, not of suites that bypass it. The overwhelming
majority set a `failed` flag and call `process.exit(1)` *after* the `finally` has
run, which is correct by construction — `account-projects.mjs` is typical: `try` at
60, `finally { srv.kill(...) }` at 143, `process.exit(1)` at 149. Only a
`process.exit` **inside** the try leaks, and that means a `fail()`-style helper
called from within the guarded region. Three suites do that.~~

~~`preview-capture.mjs` looks like a fourth and is not: it defines an exiting `fail()`
but never calls it inside its try.~~

~~Two consequences worth carrying forward: the remediation is small (three files); the
two problems are independent.~~

The first sentence of that paragraph is right and the rest is wrong. Only a
`process.exit` inside the try leaks — but "inside the try" does **not** mean "a
`fail()`-style helper". It also means a `process.exit(...)` written literally inside
the try, which is the *more* common form here. I searched for the helper case, found
three, and reported three as the answer.

### What it actually is (2026-08-09, hand-verified)

```
suites that spawn AND reap:         33
  ├─ bypass the reap:               23   ← the leak
  └─ exit after the finally:        10   (the correct pattern)
ports referenced by >1 suite:       21, covering 42 suites
leakers that also share a port:      7, on 6 ports
```

| Claim | 2026-08-08 said | Measured 2026-08-09 |
| --- | --- | --- |
| suites that bypass the reap | 3 | **23** — 20 by a literal `process.exit` inside the try, 3 via a `fail()` helper |
| the two problems compound | no | **yes, on 6 ports**, 7 suites |
| remediation size | "three files" | **23 files**, or one `process.on('exit', …)` per spawn |

*(The port half of this table said 11 ports / 23 suites when first written, a few hours
before the section below. It was the same mistake a third time.)*

`preview-capture.mjs`, which the struck section explicitly cleared as "looks like a
fourth and is not", **is** a leaker: `spawn` at 51, `try` at 54, `process.exit(2)` at
61, `finally { srv.kill(…) }` at 115. It was cleared by checking the one criterion I
had in mind and not the one that applied to it.

Verified by hand, not only by script — `smb-jump.mjs` (spawn 74, try 77, exit 84,
finally 88), `preview-capture.mjs` as above, and the negative case
`dialogue-scroll.mjs`, which sets `failed = true` inside the try, reaps at 102, and
exits at 107 *after* the `finally`. The mechanism itself was confirmed empirically
rather than assumed:

```js
function fail(m){ process.exit(1); }
try { fail('x'); } finally { console.log('FINALLY RAN'); }   // does not print
```

Command that produces the 23 — brace-match each `try`, keep those whose `finally`
reaps, then look for **both** a literal `process.exit(n)` and a call to any
locally-defined function whose body exits. Missing either arm undercounts; missing
the second arm is what produced "3", missing the first is what would have produced
"20".

**So the deferral was right and I dissolved it on a bad number.** "A 32-file harness
change that deserves its own session" was closer to the truth than "three files".
The original 32 was still not measured — it counted suites that *have* a reap — but
being unmeasured is not the same as being wrong, and this time it was nearly right by
accident.

### The consequence is worse than I wrote (2026-08-12, from `main`'s notes)

I described the cost of a shared port as the next suite dying with an opaque
`UND_ERR_SOCKET`. That happens, and it is the *harmless* case, because it is loud.
`main`'s `docs/LESSONS-LEARNT.md` — a file this branch does not have — documents the
silent one, and it is verifiable here:

`tools/playground_server.py:2428-2436`. If the port is already in use **and** the
existing server answers a health ping, it prints
`Playground server already running … -- nothing to do`, `return`s, and **exits 0**. It
never binds, so everything the caller set in the environment — `PLAYGROUND_PORT`,
`PLAYGROUND_ACCOUNTS_DB`, the isolated gallery dir — is silently discarded. The suite
then runs to completion against a server it did not configure.

So the failure mode is not flakiness. It is **a suite passing while testing the wrong
thing**, with a different accounts database than the one it set up.

Measured on this branch: four suites pass an isolated `PLAYGROUND_ACCOUNTS_DB` or
`PLAYGROUND_GALLERY_DIR` — `accounts.mjs`, `account-projects.mjs`, `csrf-origin.mjs`,
`gallery-auth.mjs` — and **all four share a port with another suite**:

```
18861  accounts.mjs, palette-render.mjs
18862  account-projects.mjs, gallery-auth.mjs   <- both are env-isolated, sharing with each other
18863  csrf-origin.mjs, racer.mjs
```

> **⚠ Overstated — corrected 2026-08-09→12, one day later.** I wrote next that this
> means "the auth suites may not be testing what they claim". **On a sequential run,
> they are fine**, and I should have checked before saying it. `run-all.mjs` executes
> suites `.sort()`ed and one at a time (`run-all.mjs:673`), so a shared port only bites
> if the *earlier* suite left a server behind. None of `accounts`, `account-projects`,
> `csrf-origin` or `gallery-auth` shares a port with a suite that can leak, so none of
> them is exposed. The mechanism is real; my claim about who it reaches was not
> measured. See the reconciliation below.

Every suite whose correctness depends on an isolated database is on a contended port.
That matters for **concurrent** runs, and `main`'s `docs/guides/TEST-SERVERS.md` says so
explicitly — sequential execution is why sharing has been tolerated deliberately. (That
file does not exist on this branch, so there is nothing to link to yet; it arrives with
the merge.)

### Reconciling this with `main`: the exposure is one pair, not forty-two

`main`'s doc states that several suites sharing a port is *"deliberate and harmless …
Only concurrent runs collide"*. That is right in general and my framing overstated the
problem — **but it assumes every suite reaps its server**, and 23 do not. Combining the
two facts, and ordering by how `run-all` actually executes:

```
18792:  asm-ai-corpus -> asm-vscroll -> shared-play* -> smb-render*     (* = can leak)
        shared-play can leak; smb-render runs after it on the same port
```

**That is the only one.** Of 21 shared ports, exactly one has a leak-capable suite
running *before* another suite on the same port. Everywhere else the sharers either
never leak, or the leaker runs last, where a leaked server has nobody left to mislead.

Severity of that one: both set only `PLAYGROUND_PORT`, no `PLAYGROUND_NO_ASM` or
`PLAYGROUND_ACCOUNTS_DB`, so a captured server is configured the same way — and it only
arises on a run where `shared-play` has **already failed**. The cost is a confusing
second failure (or a false pass) downstream of a real one, not a silent wrong result on
a green run.

So the remediation is far smaller than either document implies: one `process.on('exit',
…)` in `shared-play.mjs` closes today's only exposure, and `main`'s documented
`startServer` fix — assert the child survived, poll `/health` instead of sleeping 1.5s —
closes the whole class permanently. **The ordering is fragile, though:** it is a
property of alphabetical filenames, so adding a suite whose name sorts between two
sharers can create a new pair silently. That is the argument for the structural fix
rather than for fixing this one file.

### Counting the ports is the wrong approach (2026-08-09)

The port figure moved from 11/23 to **21/42** because suites declare a port in at
least five different ways, and each pattern I added found more:

```js
const PORT = 18783;                                  // 1. what I originally matched
const port = 18869;                                  // 2. lowercase
const PORT_C = 18788, PORT_A = 18789, PORT_D = 18790;// 3. several in one declaration
await H.startServer(18882, env);                     // 4. inline, never bound
const romC = await buildWith(18871, {...});          // 5. inline, via a helper
```

I found (1), published a number. Found (2), published a bigger number. Found (3), (4)
and (5) in the same ten minutes. There is no reason to believe there is not a (6), and
that is the point: **when each attempt at a pattern finds more instances, the pattern
is not the answer.** Applying yesterday's rule — name the arms before counting — was an
improvement and still not enough, because the arms were not enumerable by inspection.

**The checker I proposed in Appendix 3 has this exact bug.** It uses
`/\bPORT\s*=\s*(\d{4,5})\b/` with `RE.exec`, so it is case-sensitive (misses
`port`), does not match `PORT_C`, matches nothing inline, and — because `exec` returns
only the first match — counts a three-port suite as one port. It would report 11
clashes and stay silent about 10. A gate that under-reports by half, shipped as the
remedy for a finding about a claim nothing enforced.

**So do not fix this by counting better. Remove the ability to get it wrong.** Have
`run-all.mjs` allocate a port per suite and pass it in the environment — the server
already honours `PLAYGROUND_PORT`, and the runner already spawns every suite, so it is
the natural owner. Then the guard becomes a rule with no arms to miss:

> no suite source may contain a hard-coded port literal at all

which is one grep that cannot be defeated by a naming convention, instead of an
enumeration of every way a port might be spelled. That is the runtime-enumeration
discipline in `prove-coverage`: assert against the real thing, or make the wrong thing
unrepresentable.

Until then, treat **any** `18xxx` literal in a suite as a possible bind. That
over-reports (a literal could sit in a comment) but it errs toward flagging a clash
rather than missing one, which is the correct bias for a guard. Spot-checked: the
newly-found clashes on `18789`, `18868` and `18872` are all real declarations, not
comments.

> **Still an undercount — a sixth spelling, found 2026-08-12.** `playwright.config.js:13`
> binds `Number(process.env.STUDIO_TEST_PORT || 18790)`, clashing with the three
> builder suites that claim 18790. My scan never opened that file because I bounded it
> to `tools/builder-tests/*.mjs`. Having just written that the arms were not
> enumerable by inspection, I then scoped the search by directory and published the
> number anyway — the directory was one more unstated assumption of the same kind.
> `main` has already fixed this specific clash and guarded it (`ce26f44`), for the
> reason its commit message gives: *"a doc note is not a check"*. See
> [`2026-08-12-main-divergence-and-the-v76-collision.md`](2026-08-12-main-divergence-and-the-v76-collision.md).

One trap for anyone re-counting: `gallery.mjs`'s `fail()` calls `process.exit(2)`,
not `1`, and so do many of the literal exits. A checker that greps for
`process.exit(1)` undercounts badly — which is how a wrong number survives being
"verified".

### `ppid=1` is not a leak signal in this container

The obvious acceptance check for the reap — *"kill a suite mid-run, then confirm no
`playground_server.py` survives with `ppid=1`"* — **can never pass here**, and I had
written exactly that before checking:

```
    PID    PPID     ELAPSED CMD
     60       1  3-11:11:40 python3 tools/playground_server.py
```

That is the container's own dev server, started by `/workspace/start.sh` from
`container-init.sh` at boot. Orphaned-to-init is its normal state, not evidence of
anything. It listens on **8765**; the builder suites use 18768–18894 and start and
stop their own, so the two never meet — `start.sh` says so in its header comment.

So the check has to name the port range, not the parent:

> **Third version of this check — the first two were wrong (2026-08-12).** It scanned
> the process list, and `main`'s `docs/LESSONS-LEARNT.md` §5 warns that `pgrep -f`
> matches the shell running it. Testing that revealed something worse: the obvious
> bracket-pattern fix (`awk '/[p]layground…/'`) **also** false-positives, because the
> bracket trick hides the *pattern* from itself, not the *target string* — and any
> command that checks for leaked servers has both the process name and the port numbers
> sitting in its own command line. Both versions reported `LEAKED` with nothing leaked.
>
> The fix is to stop asking `ps` a question the kernel can answer directly: a leaked
> server *is* "something listening on a test port".

```python
#!/usr/bin/env python3
"""Is anything LISTENING on a builder-test port? Asks the kernel, not `ps`."""
import sys

LO, HI, LISTEN = 18768, 18897, "0A"          # 0A = TCP_LISTEN

ports = set()
for path in ("/proc/net/tcp", "/proc/net/tcp6"):
    try:
        lines = open(path).read().splitlines()[1:]
    except OSError:
        continue
    for line in lines:
        f = line.split()
        if len(f) > 3 and f[3] == LISTEN:
            ports.add(int(f[1].rsplit(":", 1)[1], 16))

if not ports:                                 # a scan that finds nothing must not
    print("FAIL: no listening sockets at all -- the scan did not run")
    sys.exit(2)                               # look like a scan that found nothing wrong
leaked = sorted(p for p in ports if LO <= p <= HI)
print(f"listening sockets: {len(ports)}; in {LO}-{HI}: {leaked or 'none'}")
sys.exit(1 if leaked else 0)
```

Proven both ways before being written down: clean tree → `in 18768-18897: none`, exit 0;
bind 18800 and re-run → `in 18768-18897: [18800]`, exit 1. Use Python, not `awk` — this
container's `awk` is `mawk`, which has no `strtonum`, so a hex-parsing `awk` script
prints nothing and exits 0 (`main`'s §1).

Worth stating because it is the mirror of this register's usual complaint. A check
that cannot fail is decoration; a check that cannot *pass* is worse, because the
first time it goes red on a real leak nobody will believe it.

## F12 — Three helper names are defined twice in `tools/nes_studio_core/`

Nothing checks the copies agree.

| Name | Modules | Verdict |
| --- | --- | --- |
| `_smbhud_bg_enabled` | `graphics.py:346`, `project.py:14` | **Identical today.** One seeds the 0-9 glyphs into the background pattern table, the other emits the matching `#define`. Diverge them and the ROM seeds art nothing enables, or enables art that was never seeded. |
| `cell_tile` | `graphics.py:429`, `scene.py:62` | **Identical today**, and public in both — `scene.py` could simply import it. |
| `_hex_table` | `collision.py:129`, `world.py:206` | **Different on purpose** — different signatures, and different empty-data output (`[1] = { 0 }` vs a `{ 0 }` body in a sized array). Same name, different semantics, which is the worse trap: a reader who has met one will assume the other. |

The first two are a regression risk with no detector, so Appendix 4 pins them to
each other rather than to a hardcoded expectation — it keeps working when the
shared behaviour legitimately changes, and fails only on divergence. It passes
today, and it was confirmed to go red: dropping the background-mode condition from
`project.py`'s copy fails two subtests with a message naming the consequence.
(Injected, observed, reverted; tree verified clean.)

The third is left alone deliberately — renaming a private helper is a real change
and both are correct where they are.

# F18 — `CLAUDE.md` taught you to ignore a real modification

*Found 2026-08-12 by reading `main`'s `docs/STATUS.md`, which records the same fix on
its own copy on 2026-08-06. This branch had not had it.*

`CLAUDE.md` said, of the engine sources under `steps/Step_Playground/src/`:

> they show as `M` in `git status` after any `/play`. Don't commit those
> build-mutations.

**They do not, and have not for some time.** `tools/nes_studio_core/build.py` builds
inside a `tempfile.TemporaryDirectory` (lines 99 and 139; line 151 assembles
`temporary_directory / "Step_Playground"`). Verified rather than read: `git status
--porcelain steps/Step_Playground/` before and after running `smb-jump.mjs`, which
performs a real cc65 `/play` (`✓ … compiles via cc65 (49168 bytes, engine v3)`) — empty
both times.

The direction of the error is what makes it worth an entry. A doc that under-claims
makes you check something unnecessarily; this one **teaches you to dismiss evidence**.
Any modification under `steps/Step_Playground/src/` today is real, and this branch's
most-read file told you it was noise. It is also load-bearing here specifically: the
engine snapshot workflow is built on `git status` being trustworthy, and "tree clean"
has been the sign-off on every stretch of this session.

Fixed in `CLAUDE.md`, with the old sentence struck rather than deleted, since the
instinct it trained needs contradicting and not merely removing.

## The eight dead constants are the same change's other fossil

`main`'s `STATUS.md` also lists eight unreferenced path constants in
`playground_server.py`, found and deliberately not removed (a code change). Confirmed
identical on this branch — defined, and referenced **nowhere**, in the file or the repo:

```
SCENE_INC        = STEP_DIR / "src" / "scene.inc"          (line 98)
PAL_INC          = STEP_DIR / "src" / "palettes.inc"       (99)
CHR_PATH         = STEP_DIR / "assets/sprites/game.chr"    (100)
NAM_PATH         = STEP_DIR / "assets/backgrounds/level.nam" (101)
COLLISION_H_PATH = STEP_DIR / "src" / "collision.h"        (1112)
BEHAVIOUR_C_PATH = STEP_DIR / "src" / "behaviour.c"        (1113)
BG_WORLD_H_PATH  = STEP_DIR / "src" / "bg_world.h"         (1148)
BG_WORLD_C_PATH  = STEP_DIR / "src" / "bg_world.c"         (1149)
```

`DEFAULT_MAIN_C` and `DEFAULT_MAIN_S` beside them have one use each and are live —
worth stating, because deleting the block wholesale would take them too.

These are not merely untidy: every one is a `STEP_DIR` path, and between them they name
exactly the files the struck `CLAUDE.md` sentence listed. They are the fossil of the
pre-`TemporaryDirectory` build, and the doc sentence is the other fossil. Each
corroborates the other, which is how a dead-code sweep and a doc audit end up being the
same finding.

## Behavioural claims in `CLAUDE.md`, audited (2026-08-12) — mostly confirmations

F18 raised the obvious question: what else is stale? The transferable part of the answer
is **why F18 survived an earlier audit**. That pass checked *referential* claims — paths,
hashes, counts, SHAs, 76 links — and F18 was a *behavioural* one: a statement about what
the code does when you run it. A referential audit cannot see those, so they need their
own sweep. This is that sweep. Result: **no further defects.** Recorded so nobody
re-derives it.

| Claim | Verdict |
| --- | --- |
| "`run-all.mjs` fails if the two version constants disagree" | ✅ **probed.** Bumped `engine-version.js` to 77 uncommitted: `RED — ENGINE_VERSION (76) != engine-version.js (77)`, exit 1. Restored, hash-verified. |
| "…or the current snapshot drifts from git HEAD" | ✅ true, and **precisely worded**. The same probe left the snapshot check **green**, because it reads HEAD and the edit was uncommitted. The phrase "from git HEAD" is carrying real weight — the loose paraphrase "the snapshot matches the tree" would be false. |
| "New projects are stamped `state.engineVersion`" | ✅ `core/starters.py`: `state["engineVersion"] = self.current_engine`. |
| "CODE's refresh invokes the cc65 codegen" | ✅ `modes/code.py:293 → _generated_c_source() → CodegenDifferential(...).assemble(...)`. **Conditional**, and worth knowing: only when no custom source is saved *and* the language is C. A pupil who has edited their code gets the cheap path. The default state is the expensive one, so the warning stands. |
| "the shell owns no editor" | ✅ in the sense meant. `main_window.py` constructs one `QLineEdit` (line 233) — the project-name field in the title bar, chrome rather than a content-editing surface. Noting it because a naive grep for editor widgets hits it and looks like a contradiction. |

One contrast the sweep threw up, which strengthens a note recorded earlier: when
`_generated_c_source()` fails it catches the exception, calls `self.status("Could not
generate CODE preview")` **and** returns the reason as a comment in the pane. That is
the right shape — and it is the same codebase where `validate()` swallows a throwing
validator with a bare `except Exception: continue` and no signal at all. The two sit a
few files apart, which makes the `log.warning` in the still-unapplied list easier to
argue for: it is not a new convention, it is the one already used next door.

## Swept and found clean

* **All 110 builder suites can actually fail** (swept 2026-08-09, which is what
  turned up the leak recount above). The harness's entire notion of a pass is
  `r.status === 0`, so a suite that asserts nothing prints `OK` — but none does.
  Checked mechanically: every suite contains at least one failure construct; **no**
  suite declares a `failed` flag and then forgets to act on it (the F5 shape); and no
  suite has materially more `ok(...)` calls than `bad(...)` calls, i.e. no unpaired
  assertion that prints nothing and fails nothing when its condition goes false. The
  33 suites using neither helper split into 19 `assert()`-based, 18 using the
  inverted `if (bad) { error; exit(1) }` form — both fail-safe — and a handful of
  mixtures. One candidate empty-collection loop (`asm-benchmark.mjs:100`) is
  report-only and says so in a comment; `asm-benchmark`'s `if (C && A)` guard can only
  be false via an exception that `bad()` already catches, and its confident closing
  line prints after the `if (failed) process.exit(1)`, not before.
* **No `TODO`/`FIXME`/`HACK` anywhere** in `tools/nes_studio_core/`, `scripts/*.mjs`
  or `tools/engines/README.md`. No stale markers to retire.
* **`docs/design/engine-versioning.md`'s remaining TODO is real, not stale.** The
  build-time *selection* of a frozen engine is genuinely unimplemented: nothing
  reads `tools/engines/v<N>/` at build time. `target_engine` is resolved
  (`playground_server.py:1412-1435`) and used to gate feature emission by version,
  which is a different mechanism and is honestly described as such.
* **The `except Exception: return False` handlers** in `graphics.py` (×2) and
  `project.py` all fail *closed* — a malformed project disables the feature rather
  than emitting half of it. Defensible. Worth knowing they would also swallow a
  genuinely corrupt `state` silently, but the direction is the safe one.
* **Port and mode counts agree** where two lists have to: eight `MODE_CLASSES`
  against the documented `1`–`8` keys; `DEV_PORTS: "8765"` against
  `PLAYGROUND_PORT`'s default; the Playwright test port 18790 and the builder
  range 18768–18894 against `start.sh`'s comment.

## Appendix 3 — port checker

> **Rewritten 2026-08-09.** The first version of this checker had the very bug the
> finding is about: `/\bPORT\s*=\s*(\d{4,5})\b/` with `RE.exec` is case-sensitive,
> does not match `PORT_C = …`, sees nothing passed inline to a helper, and takes only
> the *first* match per file. It reported 11 clashes; there are 21. Both versions are
> below, because the difference between them is the finding.

**Prefer the structural fix.** Have `run-all.mjs` allocate a port per suite and pass
it as `PLAYGROUND_PORT`; the server already honours it. Then no suite chooses a port,
and the guard below collapses to a rule with no arms to miss — *no suite source may
contain a port literal* — which is one unambiguous grep rather than an enumeration of
every way a port can be spelled.

Until that lands, this is the interim checker. It is deliberately **conservative**:
it treats any `18xxx` literal anywhere in a suite as a possible bind. That can
over-report (a literal in a comment) but it errs toward naming a clash rather than
missing one, which is the right bias for a guard.

```javascript
#!/usr/bin/env node
// No two builder suites may reference the same playground port.
//
// run-all.mjs's header says each suite "spawns its own playground server on a unique
// port". Nothing enforces it: 21 ports are shared across 42 suites. Sequential runs
// normally mask that. What un-masks it is the leak -- 23 of the 33 suites that spawn
// a server exit from inside their own try/finally, so the reap never runs, the server
// squats the port, and the next suite sharing it dies with an opaque UND_ERR_SOCKET
// that looks nothing like the real failure. Seven suites do both, on six ports.
//
// Matches ANY 18xxx literal on purpose. Suites spell the port at least five ways
// (const PORT, const port, `const PORT_C = a, PORT_A = b`, an inline argument, and an
// inline argument to a helper), so matching the declaration form under-reports -- as
// the first version of this file did, by half.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = path.basename(fileURLToPath(import.meta.url));
const DIR = path.dirname(fileURLToPath(import.meta.url));
const RE = /\b(18\d{3})\b/g;                       // global: a suite may use several

const byPort = new Map();
let scanned = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== 'run-all.mjs' && f !== SELF).sort()) {
  scanned++;
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  for (const port of new Set([...src.matchAll(RE)].map((m) => Number(m[1])))) {
    if (!byPort.has(port)) byPort.set(port, []);
    byPort.get(port).push(file);
  }
}

// A scan that finds nothing must not look like a scan that found no clashes.
if (scanned === 0 || byPort.size === 0) {
  console.error(`FAIL: scanned ${scanned} suites and found ${byPort.size} ports — the scan did not run.`);
  process.exit(2);
}

const clashes = [...byPort.entries()].filter(([, files]) => files.length > 1).sort();
if (clashes.length === 0) {
  console.log(`OK — ${scanned} suites, ${byPort.size} ports, none shared.`);
  process.exit(0);
}

const affected = new Set(clashes.flatMap(([, files]) => files));
console.error(`${clashes.length} port(s) shared by ${affected.size} of ${scanned} suites:`);
for (const [port, files] of clashes) console.error(`  ${port}  ${files.join(', ')}`);
console.error(
  '\nAny suite that exits from inside its try/finally leaks its server, and its\n' +
  'port-mate then dies with an unrelated socket error. Two fixes, either sufficient:\n' +
  '  * let run-all.mjs assign PLAYGROUND_PORT per suite (preferred — removes the class)\n' +
  "  * reap on exit: process.on('exit', () => { try { srv.kill('SIGTERM') } catch {} })"
);
process.exit(1);
```

**Prove it can fail before trusting it:** it exits 1 on today's tree naming 21 ports.
To see the other direction, point `DIR` at an empty directory — it must exit 2
("the scan did not run"), not 0.

## Appendix 4 — duplicated-helper agreement test

Save as `native/tests/unit/test_core_helper_agreement.py`. Passes today; goes red
on divergence.

```python
"""Helpers that exist twice in `tools/nes_studio_core/` must agree.

Nothing checks that the copies stay in step, so the first person to change one
and not the other gets a ROM that is wrong in a way no test notices:

* `_smbhud_bg_enabled` — graphics.py (seeds the 0-9 glyphs into the BACKGROUND
  pattern table) and project.py (emits the matching `#define`). If they disagree,
  one side seeds art the other never enables, or vice versa.
* `cell_tile` — graphics.py and scene.py. Public in both.

These pin the copies to EACH OTHER rather than to a hardcoded expectation, so
they keep working when the shared behaviour legitimately changes and fail only on
divergence — which is the thing that has no other detector.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))

from nes_studio_core import graphics, project, scene  # noqa: E402


def _state(game_type="smb", enabled=True, background=True, **hud_extra):
    hud = {"enabled": enabled, "config": {"background": background, **hud_extra}}
    return {"builder": {"modules": {"game": {"config": {"type": game_type}}, "smbhud": hud}}}


SMBHUD_CASES = [
    ("on, background mode", _state()),
    ("on, sprite mode", _state(background=False)),
    ("module off", _state(enabled=False)),
    ("wrong game type", _state(game_type="topdown")),
    ("no builder key", {}),
    ("builder is not a dict", {"builder": []}),
    ("modules missing", {"builder": {}}),
    ("hud config is None", {"builder": {"modules": {"game": {"config": {"type": "smb"}},
                                                    "smbhud": {"enabled": True, "config": None}}}}),
]

CELL_CASES = [
    ("empty cell", {"empty": True, "tile": 7}),
    ("plain tile", {"tile": 7}),
    ("missing tile", {}),
    ("out of range", {"tile": 300}),
    ("negative", {"tile": -1}),
    ("string digits", {"tile": "12"}),
]


class CoreHelperAgreementTests(unittest.TestCase):
    def test_smbhud_bg_enabled_agrees_across_modules(self) -> None:
        for label, state in SMBHUD_CASES:
            with self.subTest(case=label):
                self.assertEqual(
                    graphics._smbhud_bg_enabled(state),
                    project._smbhud_bg_enabled(state),
                    "graphics.py and project.py disagree about the SMB HUD "
                    "background mode; one seeds the glyphs, the other emits the "
                    "#define, so a ROM built now is inconsistent",
                )

    def test_cell_tile_agrees_across_modules(self) -> None:
        for label, cell in CELL_CASES:
            with self.subTest(case=label):
                self.assertEqual(graphics.cell_tile(cell), scene.cell_tile(cell))

    def test_the_duplicates_still_exist_where_this_test_expects(self) -> None:
        """If someone de-duplicates them properly this test should be deleted,
        not silently pass against one object aliased twice."""
        for module, name in (
            (graphics, "_smbhud_bg_enabled"),
            (project, "_smbhud_bg_enabled"),
            (graphics, "cell_tile"),
            (scene, "cell_tile"),
        ):
            self.assertTrue(hasattr(module, name), f"{module.__name__}.{name} is gone")


if __name__ == "__main__":
    unittest.main()
```

---

# F13 — Regenerating the v63 fixtures at HEAD does **not** reproduce three of the seven ROMs

> ## ⚠ Superseded in part, 2026-08-06 — the diagnosis below is WRONG
>
> The three differing ROMs are real and reproduce exactly. **The explanation is
> not.** This finding blamed the starter definitions (`studio-starter.js` /
> `default-state.js`); decompressing and diffing the artefacts afterwards showed
> the input projects are byte-identical apart from a wall-clock
> `metadata.created` / `modified` timestamp. The starters never moved.
>
> What actually changed is the **generated C**: `targetEngine: 63` stamps a
> version but builds with the templates at current `HEAD`, so the "v63 fixtures"
> were a v63-*era* capture that has been drifting with the engine ever since.
>
> Read [`2026-08-06-starter-fixture-rebaseline.md`](2026-08-06-starter-fixture-rebaseline.md)
> instead. It carries the corrected account, the full pre-existing hashes, and the
> one question still open (why *those three*).

Found while starting the owner-approved re-baseline (step 4 of the close-out
plan), then **reverted rather than committed**. This changes what that step means,
so it must be settled before the baselines land.

`native/tests/contract/generate_phase0_starters.mjs` pins `NES_TARGET_ENGINE = 63`
and sends `targetEngine: 63`, so running it today *should* reproduce the v63
artefacts exactly. Run at commit `57578ab` it does not:

| Fixture | v63 `rom_sha256` (recorded) | Regenerated at `57578ab` |
| --- | --- | --- |
| `basics` | `4d11fa59045c…` | `4d11fa59045c…` **same** |
| `topdown`, `racer`, `scratch` | unchanged | unchanged |
| `smb` | `4427934de87a…` | `30fae8aed339…` **DIFFERENT** |
| `runner` | `8bfefb002b4e…` | `890944e9093d…` **DIFFERENT** |
| `geodash` | `4a4415746ac5…` | `414f2a8090bb…` **DIFFERENT** |

And **all seven** differ in `project_json_sha256`, `play_request_json_sha256` and
`generated_source_sha256`.

~~So the *input projects themselves* have moved, not just the ROMs — which points
at `studio-starter.js` / `default-state.js` (the starter definitions) rather than
at the engine.~~ **Wrong — see the box above.** The project and play-request churn
was a timestamp; the source churn was v74/v75 template growth that is mostly
`#ifdef`-gated and compiles out. The engine, not the starters.

## Why this was reverted rather than committed

The owner's decision authorised generating baselines at a named commit and
recording that provenance. That is still the right shape. But it was authorised on
the understanding that a re-baseline pins *current* behaviour; what it would
actually do here is **overwrite the only surviving record that three starters used
to build different ROMs**, in the same commit that makes the test pass. The
evidence and its erasure would arrive together.

The generator is destructive by design (`fs.rmSync(OUT, …)`), so it rewrites the
`.gz` artefacts and the manifest along with the ROMs. There is no way to "just add
the ROMs".

## What has to be decided first

1. **Is the starter drift expected?** Three starters producing different ROMs from
   a v63-pinned request is either (a) an intended change to the starter templates
   since v63, in which case the re-baseline is correct and the old hashes should be
   preserved in the doc as history, or (b) a regression nobody noticed, in which
   case baselining now freezes the bug.
2. **Should the starter definitions be version-gated or snapshotted?**
   `targetEngine` pins the *engine* and not the *starter content*, so a fixture
   claiming to be "engine v63" is only half-pinned today. That is arguably a bigger
   hole than the one this pass set out to close.

Both are recorded in `.mc-outbox.md`. The mechanical part of step 4 — un-ignoring
`native/tests/fixtures/**/*.nes` — is safe and unblocked; it is the *content* of
the baseline that is not.

---

# F14 — The guard that keeps the codegen snapshotted can be fooled by a comment

*Found 2026-08-08 by deliberately breaking it, per "make a gate fail on purpose".
It is a defect in a check **I** added two days ago, in the same commit that closed
F7 — which is the point: the fix for F7 was itself unproven.*

`native/tests/contract/test_codegen_stays_snapshottable.py` exists so that
removing `tools/nes_studio_core` from the engine snapshot's `INCLUDE_DIRS` cannot
happen quietly. Its second test does this:

```python
include_dirs = script.split("const INCLUDE_DIRS", 1)[1].split("]", 1)[0]
self.assertIn("tools/nes_studio_core", include_dirs, ...)
```

That is a substring match over **raw source text, comments included**. The
`INCLUDE_DIRS` array already carries a four-line explanatory comment inside the
brackets, so the region being searched is not only code.

**Probed, not reasoned about.** I deleted the entry and left a comment in its
place naming the path — the shape of a real edit, since anyone removing it would
say why:

```js
-  'tools/nes_studio_core',
+  // removed for now: tools/nes_studio_core was slowing the walk
```

Result: `2 passed`. The guard was green with the thing it guards deleted.

## What saves it today, and why that is not enough

`node scripts/snapshot-engine.mjs --check` **does** catch this edit — it reported
all 11 files as `MISSING (in the v76 snapshot, not on disk)` and exited 1. So the
tree is not currently exposed.

But that only works because v76's manifest already lists those files. The failure
this test was written for is the *next* version bump: remove the directory, bump
`ENGINE_VERSION`, re-snapshot, and the new manifest simply never contains the
Python. Nothing is missing, nothing drifts, and F7 is silently reopened — with the
test that exists to prevent exactly that still green. The snapshot gate covers the
present; this test was supposed to cover the future, and does not.

## Fix

Parse the array's string literals instead of its text, so a comment cannot satisfy
it:

```python
literals = re.findall(r"'([^']+)'", include_dirs)
self.assertIn("tools/nes_studio_core", literals, ...)
```

Not applied: this is a code change, and the rule for unattended work is that only
documentation is committed without asking. The one-line edit and the probe that
proves it are both above. Verification after fixing must be the probe re-run — the
edit above must turn the test **red**, not merely leave it green.

## The general shape

Third time in this register: a check that matches text where it means to check
structure (F5's ignore probe, the icon check's unioned loops, now this). The two
that were parsed with `ast` — the delegation half of *this same file*, and the icon
size lists — are the ones that hold. The lesson is not "be careful with regexes",
it is **the guard on the include-list should have been written the same way as the
guard sitting six lines above it in the same file.**

## Addendum — which of these guards has now been watched fail (2026-08-08)

F14 came out of asking that question, so here is the answer in full rather than the
one interesting case. Probed today, by breaking the guarded thing and confirming the
named test goes red:

| Guard | Break applied | Result |
| --- | --- | --- |
| `test_codegen_stays_snapshottable` — include-list | entry deleted, comment left naming the path | **stayed green — F14** |
| `test_codegen_stays_snapshottable` — delegation (`ast`) | a statement inlined into `build_scene_inc` | red, names the function and its statement count |
| `test_pyside_import_guards` | `importorskip` removed from `test_storage_manager.py` | red, names that module as UNGUARDED |
| `test_baseline_manifest` | `known_gaps` removed while status stays `"partial"` | red: "a partial result must enumerate its gaps" |
| `test_icons` — three-way size agreement | `256` dropped from the **uninstall** loop only | red, `installer_loop=0` — the case the old union check could not catch |

Probed earlier in the same session: the starter ROM-hash assertion (one-byte flip),
the fixtures-are-tracked guard (twice — the first probe was invalid), and both
directions of `snapshot-engine.mjs --check`.

~~**Still never watched fail**~~ — *this list was worked through on 2026-08-09; see the
second addendum below.*

---

# F15 — `MODE_CLASSES` is a hand-maintained registry with no test at all

*Found 2026-08-08, sweeping the native core for "two lists that must agree and
nothing checking they do".*

`native/src/nes_studio/ui/modes/__init__.py` lists the eight mode classes by hand.
`main_window.py` builds the rail from that tuple and nothing else (lines 206 and
295). So a mode module that exists on disk but is not in the tuple **is simply not
in the app** — no import error, no empty tab, no warning. It agrees today: eight
files, eight entries, and `ast` confirms every `Mode` subclass on disk is
registered.

What makes it worth writing down is that **no test references `MODE_CLASSES`**
(`grep -rn MODE_CLASSES native/tests/` → nothing). `MODE_NAMES` is derived from it,
so a forgotten mode is equally invisible to `test_every_mode_has_a_rail_icon`, which
iterates the derived list — it checks that every *registered* mode has an icon, not
that every mode written is registered.

The tell was already in the project's own instructions:

> **Adding a native mode** = a new class in `ui/modes/`, added to `MODE_CLASSES`.

A documented manual step with no gate is the exact shape `LESSONS_LEARNT` keeps
recording. It has not bitten yet because the modes were all added in one push.

**Test to add** (not applied — code, and the standing rule for unattended work is
documentation only). It needs no Qt, so it runs on this box:

```python
# parse, don't import: ui/modes/* pulls in Qt
registered = {e.id for e in ast_tuple(MODES / "__init__.py", "MODE_CLASSES")}
on_disk = {cls for f in MODES.glob("*.py") if f.stem not in ("__init__", "base")
           for cls in mode_subclasses(f)}
assert on_disk - registered == set(), (
    "these modes exist but are not in MODE_CLASSES, so they do not appear in the app")
```

Verify by adding a throwaway `ui/modes/probe.py` defining a `Mode` subclass and
confirming the test names it — then delete it.

## Two things reviewed in the same sweep that were *fine*

Recording these because "found nothing" is a result, and because the next person
should not re-derive them:

* **`VALIDATORS` in `core/validators.py`** — 33 registered, 35 candidate functions.
  The two unregistered ones are not forgotten: `validate` is the entry point that
  consumes the tuple, and `scanline_problem` is appended *after* the loop on purpose,
  with a comment, because the web appends it last and the parity contract is on
  order as well as content.
* ~~**`test_the_cases_exercise_every_check`** enumerates problem ids by regex over the
  Python source, which is the same text-instead-of-structure shape as F14. Here it
  holds: all 35 `Problem(` constructions use a literal `id="..."`, so the
  enumeration is complete. It would go blind to an id built with an f-string or a
  variable — worth a comment saying so if one is ever added, rather than a change now.~~

  > **⚠ Wrong, corrected 2026-08-09 — this is F17 below.** I judged this one by reading
  > it and declared it fine. Probing it took four minutes and it went the other way: a
  > registered validator whose id is written in **single** quotes is invisible to the
  > regex, and the gate stays green. The f-string case I hypothesised is not the
  > realistic one; changing a quote character is. Reading a check and reasoning that it
  > holds is the thing this whole document exists to stop, and I did it anyway, in a
  > section headed "found nothing".

## One shape left standing deliberately

`validate()` wraps every check in `except Exception: continue`, so a validator that
throws is skipped **and nothing is logged**. The docstring argues for it and the
argument is sound — a broken check must not stop a child building their game. The
parity contract catches it for the corpus states (Python emits nothing, the web
emits a problem, the assertion fails), so this is not invisible in CI. What is
uncovered is a validator that throws only on real project states: the pupil quietly
loses a warning and nobody hears about it. A one-line `log.warning` in the handler
would close that without changing the behaviour. Left as a note, not a finding.

---

# Addendum 2 — the remaining assertions, probed (2026-08-09)

The previous addendum ended by admitting that hand-probing one assertion per file is
how F14 happened, and that the rest were still only claims. This is the rest of them,
done with a harness rather than by hand
(`probe_json` / `probe_file`: mutate → run one node id → restore → **verify the
restore by hash**). Eighteen probes, every restore verified, tree clean afterwards.

## The starter-fixture gate — every assertion is load-bearing

| Break applied to `manifest.json` | Result |
| --- | --- |
| a style removed from `fixtures` | red |
| `source_tree_dirty` → `true` | red |
| `what_a_pass_means` deleted | red |
| `what_a_pass_means` **reworded to claim correctness** | red |
| `source_commit` abbreviated to 7 chars | red |
| `engine_version_requested` → 64 | red |
| `rom_size` off by one byte | red |
| `input_project_unchanged` → `false` | red |
| `generated_source_sha256` wrong | red |
| `play_request_json_sha256` wrong | red |
| a fixture named that is not on disk | red |

Eleven for eleven. Worth noting the fourth: the caveat assertion is not a presence
check that a rewrite could slip past — rewording it into a claim of correctness fails
too, because it matches on the phrase `does not mean correct`.

## The PySide6 import guard — sound, and the probe shows *why* it is built that way

Two of these four probes stayed green, and that is the design working rather than a
hole:

| Break | `..._probe_actually_looked...` | `..._needs_pyside6...` | `..._some_other_reason` |
| --- | --- | --- | --- |
| the module walk matches nothing | **red** | green (vacuous) | — |
| a test module gains a broken import | — | green (module invisible) | **red** |

`test_no_test_module_needs_pyside6_to_be_imported` passes vacuously in both cases, by
construction: it filters for `UNGUARDED` in a dict, and an empty dict has none. Its
two siblings exist precisely to catch that, and both fired. This is the shape the
`prove-coverage` skill calls a known-failures list with a meta-test, and it is the
only gate in this repo that already had one. Fully probed; no change wanted.

---

# F16 — a third hand-maintained starter list, in the UI, with nothing checking it

*Found 2026-08-09. Same shape as F15, one layer up, and this one has a comment that
states the invariant it does not enforce.*

There are three lists of the seven starter styles:

| Where | Form | Guarded? |
| --- | --- | --- |
| `native/src/nes_studio/resources/starters/manifest.json` | the shipped resource | source of truth |
| `native/tests/fixtures/phase0/starters/manifest.json` | the frozen corpus | ✅ `test_packaged_starters_are_the_frozen_browser_fixture_bytes` asserts the two agree **byte-for-byte**, per style |
| `native/src/nes_studio/ui/project_catalog.py` → `STARTERS` | the pupil-facing picker | ❌ **nothing** |

The first two are properly tied together — I went looking for a gap there and there
isn't one, which is worth recording so nobody re-checks it. The third is open:

```python
#: The starters shipped in `resources/starters/`, with names a pupil can choose
#: between. Keys must match the manifest.
STARTERS: tuple[tuple[str, str, str], ...] = (...)
```

"Keys must match the manifest" is an invariant written as a comment, and nothing
enforces it. Be careful reading the grep, because it is not empty:

```
$ grep -rn "project_catalog\|STARTERS\|NewProjectDialog" native/tests/
native/tests/unit/test_fixtures_are_tracked.py:25:STARTERS = FIXTURES / "phase0" / ...
native/tests/unit/test_fixtures_are_tracked.py:30:    manifest = json.loads((STARTERS ...
native/tests/unit/test_fixtures_are_tracked.py:32:        STARTERS / name / filename
```

All three are a **different, unrelated** `STARTERS` — a local `Path` constant in that
test. No test imports `project_catalog`, names `NewProjectDialog`, or reads the UI
tuple. A name collision that makes an unguarded thing look grepped-for is worth the
extra three seconds of reading. The two ways it breaks:

* **a style added to the manifest but not to `STARTERS`** — the starter ships on disk
  and no pupil can select it. That is *the bug this module was written to fix*: its own
  docstring says "six of the seven starters that ship on disk could not be opened at
  all". Silent, and only a human clicking `New game` would notice.
* **a key in `STARTERS` that the manifest does not have** — `StarterCatalog.create()`
  raises `KeyError: Unknown starter style` when the child presses OK. Loud, but in
  front of a class.

There is already a runtime enumeration built for exactly this — `StarterCatalog.styles()`,
which returns `tuple(self._manifest["fixtures"])`. It has **zero callers**
(`grep -rn "\.styles()" native/src native/tests` → nothing). The accessor that would
make the list self-maintaining exists and the UI hand-copies the list instead.

**Fix, in preference order** (not applied — code, and unattended work here is
documentation-only): have `NewProjectDialog` drive the list from
`StarterCatalog.styles()` and keep `STARTERS` as a label/blurb lookup, so a missing
entry degrades to a plain name rather than a missing starter. Failing that, a test that
`ast`-parses `STARTERS` — no Qt needed, so it runs on this box — and asserts its keys
equal the manifest's, in order.

---

# F17 — the parity coverage gate has F14's hole, and I had already cleared it by eye

*Found 2026-08-09, by probing a check I had reviewed and passed the day before.*

`test_the_cases_exercise_every_check` is the gate that stops a validator drifting from
the web's because no corpus case makes it fire. It enumerates the ids to demand cases
for like this:

```python
declared = set(re.findall(r'id="([a-z0-9-]+)"', source))
```

A regex over raw source — the same text-instead-of-structure shape as F14. Probed by
adding a real, registered validator that never fires on the corpus:

| Probe | Result |
| --- | --- |
| id written as `id='probe-silent-drift'` (**single** quotes) | **stayed green** |
| the same validator with `id="probe-silent-drift"` (control) | red — "these checks have no case" |
| a made-up id appearing only inside a `#` comment | red (a phantom the gate then demands a case for) |

So the enumeration is fooled in both directions: it misses real checks and invents
absent ones. The second is a nuisance — a spurious red someone will "fix" by editing
the comment. The first is the hole, and it is quiet: the new validator is registered,
it runs, it is compared against nothing, and the suite is green.

**Severity.** No live bug — all 35 `Problem(...)` constructions today use a literal
double-quoted `id=`, so the enumeration is complete *at this commit*. It opens the day
someone writes a validator in a different quote style, which nothing in the repo
prevents and no linter here enforces.

**Fix, and it is a drop-in.** The robust technique is already in this repo, in the
neighbouring gate: `test_codegen_stays_snapshottable` uses `ast` for its delegation
half — the half that went red when probed — and a regex for its include half, the half
that is F14. Use `ast` here too:

```python
tree = ast.parse(source)
calls = [n for n in ast.walk(tree)
         if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "Problem"]
declared, dynamic = set(), []
for call in calls:
    kw = next((k for k in call.keywords if k.arg == "id"), None)
    if kw is None:
        continue                      # Problem(id="") default; not a reportable check
    if isinstance(kw.value, ast.Constant):
        declared.add(kw.value.value)
    else:
        dynamic.append(call.lineno)   # else the enumeration under-collects in silence
assert not dynamic, f"Problem() builds its id dynamically at lines {dynamic}"
```

Measured at this commit: 35 `Problem()` calls, 34 distinct literal ids, **0 dynamic** —
and the `ast` set and the regex set are *identical* today. So adopting it turns nothing
red now; it only closes the door. Verify it by re-running the single-quote probe above
and watching it go red.

## The lesson underneath both F14 and F17

Both were written by me, two days apart, and in both cases I checked the structural
half with `ast` and the textual half with a regex, in the same file, without noticing
the asymmetry. The rule worth keeping: **if a check enumerates part of the program,
parse the program.** A regex over source cannot tell code from a comment, and the
failure is always in the safe-looking direction — it finds less, so the gate demands
less, so it passes.
