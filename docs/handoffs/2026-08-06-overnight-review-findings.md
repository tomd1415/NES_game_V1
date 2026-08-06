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
