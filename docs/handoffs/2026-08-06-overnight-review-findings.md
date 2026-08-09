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

> **⚠ Corrected 2026-08-08 — the port count stands, the leak count and the causal
> link do not.** Re-measured from the source rather than carried forward. Three
> suites can leak, not thirty-two, and none of the three shares a port with
> anything, so the leak cannot be what un-hides the sharing. Details at the end of
> this finding; the paragraph below is struck where it is wrong.

`tools/builder-tests/run-all.mjs`'s own header says each suite "spawns its own
playground server on a **unique port**". Nothing enforced it, and 11 ports are
shared, one of them three ways:

```
18781  all-modules.mjs, perdoor.mjs          18862  account-projects.mjs, gallery-auth.mjs
18783  dialogue-scroll.mjs, smb-jump.mjs     18863  csrf-origin.mjs, racer.mjs
18792  shared-play.mjs, smb-render.mjs       18867  smb-stomp.mjs, topdown-enemies.mjs
18844  flyer-patrol.mjs, racer-hud.mjs       18869  pickup-collect.mjs, scroll-2x2.mjs, stomp-basic.mjs
18847  hopper-enemy.mjs, scene-multiscreen.mjs   18871  sfx-events.mjs, style-starters.mjs
18861  accounts.mjs, palette-render.mjs
```

Sequential execution normally hides this. ~~What un-hides it is the leak we
already know about: `fail()` calls `process.exit(1)`, which bypasses the
`try/finally { srv.kill('SIGTERM') }` — 32 suites do this. A leaked server squats
the port, and the next suite sharing it dies with an opaque `UND_ERR_SOCKET`.~~
~~That is the exact mechanism behind the false theory that cost a session,
generalised from one suite to twenty-three.~~

**Struck 2026-08-08.** A leaked server does produce an opaque `UND_ERR_SOCKET` in
the next suite on that port — that part is sound, and I hit it myself this week.
What is wrong is *who can leak*, and therefore whether the two problems are
connected at all. See below.

Two independent fixes, either sufficient, both cheap: give each suite its own
port, or register `process.on('exit', () => { try { srv.kill('SIGTERM') } catch {} })`
after each `spawn`. Doing both is better — unique ports stop the propagation, the
exit hook stops the leak. Checker in Appendix 3; it exits 1 today and names every
pair.

### What the re-measurement actually shows (2026-08-08)

Counted from source, not carried forward:

| Claim | Measured |
| --- | --- |
| 11 ports shared, 23 suites | **confirmed** — 72 suites declare a `PORT`, 11 values are shared |
| "32 suites" bypass the reap | **3** — `audio.mjs`, `four-screen.mjs`, `gallery.mjs` |
| the leak un-hides the port sharing | **no** — all three use unique ports (18815, 18809, 18801) |

Where 32 came from: **33** suites have a `finally` block that kills the server. That
is the count of suites with the reap, not of suites that bypass it. The overwhelming
majority set a `failed` flag and call `process.exit(1)` *after* the `finally` has
run, which is correct by construction — `account-projects.mjs` is typical: `try` at
60, `finally { srv.kill(...) }` at 143, `process.exit(1)` at 149. Only a
`process.exit` **inside** the try leaks, and that means a `fail()`-style helper
called from within the guarded region. Three suites do that.

`preview-capture.mjs` looks like a fourth and is not: it defines an exiting `fail()`
but never calls it inside its try.

Two consequences worth carrying forward:

* **The remediation is small.** The reason this was deferred — "a 32-file harness
  change that deserves its own session" — was based on the wrong number. Three files,
  or one `process.on('exit', …)` reap applied where servers are spawned.
* **The two problems are independent.** Fixing the leak does not reduce the port-
  sharing risk and vice versa. The port sharing is still real and still worth fixing,
  because *any* abnormal termination leaks a server — I killed a run with SIGTERM
  this week and left a `playground_server.py` with `ppid=1` squatting a port, which
  is the same symptom by a different route. But it is not the `fail()` path.

One trap for anyone re-counting: `gallery.mjs`'s `fail()` calls `process.exit(2)`,
not `1`. A checker that greps for `process.exit(1)` silently undercounts by one —
which is how a wrong number survives being "verified".

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

```bash
pgrep -af playground_server.py | grep -E '187[0-9]{2}|188[0-9]{2}' && echo LEAKED
```

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

## Swept and found clean

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

## Appendix 3 — port-uniqueness checker

Save as `tools/builder-tests/ports-unique.mjs` and call it from `run-all.mjs`
alongside the other invariant checks. Exits 1 today.

```javascript
#!/usr/bin/env node
// Every builder suite must own a unique port.
//
// run-all.mjs's own header says each suite "spawns its own playground server on a
// unique port". Nothing enforced that, and 23 suites share one with another.
//
// Sequential runs normally mask it. What un-masks it is the known leak: fail()
// calls process.exit(1), which bypasses the try/finally that would reap the
// spawned server (32 suites). A leaked server then squats the port, and the NEXT
// suite that happens to share it dies with an opaque UND_ERR_SOCKET that looks
// nothing like the original failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RE = /\bPORT\s*=\s*(\d{4,5})\b/;

const byPort = new Map();
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort()) {
  const m = RE.exec(fs.readFileSync(path.join(DIR, file), 'utf8'));
  if (!m) continue;
  const port = Number(m[1]);
  if (!byPort.has(port)) byPort.set(port, []);
  byPort.get(port).push(file);
}

const clashes = [...byPort.entries()].filter(([, files]) => files.length > 1).sort();
if (clashes.length === 0) {
  console.log(`OK — ${byPort.size} suites, all on distinct ports.`);
  process.exit(0);
}

console.error(`${clashes.length} port(s) shared by more than one suite:`);
for (const [port, files] of clashes) console.error(`  ${port}  ${files.join(', ')}`);
console.error(
  '\nA suite that fails leaks its server (fail() -> process.exit(1) skips the\n' +
  'try/finally reap), and its port-mate then dies with an unrelated socket error.\n' +
  'Give each suite its own port, or reap on exit:\n' +
  "  process.on('exit', () => { try { srv.kill('SIGTERM') } catch {} })"
);
process.exit(1);
```

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

**Still never watched fail**, and worth saying rather than leaving implied: the
individual assertions *inside* those files that were not the one I broke —
`test_manifest_states_its_provenance`, the ">30 modules were found" sanity check in
the PySide6 probe, the `other-import-error` classification, and most of
`test_baseline_manifest`'s remaining assertions. Hand-probing one assertion per file
is not the same as probing the file, and doing it by hand is how F14 got written in
the first place. That is the argument for automating this rather than repeating it.

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
* **`test_the_cases_exercise_every_check`** enumerates problem ids by regex over the
  Python source, which is the same text-instead-of-structure shape as F14. Here it
  holds: all 35 `Problem(` constructions use a literal `id="..."`, so the
  enumeration is complete. It would go blind to an id built with an f-string or a
  variable — worth a comment saying so if one is ever added, rather than a change now.

## One shape left standing deliberately

`validate()` wraps every check in `except Exception: continue`, so a validator that
throws is skipped **and nothing is logged**. The docstring argues for it and the
argument is sound — a broken check must not stop a child building their game. The
parity contract catches it for the corpus states (Python emits nothing, the web
emits a problem, the assertion fails), so this is not invisible in CI. What is
uncovered is a validator that throws only on real project states: the pupil quietly
loses a warning and nobody hears about it. A one-line `log.warning` in the handler
would close that without changing the behaviour. Left as a note, not a finding.
