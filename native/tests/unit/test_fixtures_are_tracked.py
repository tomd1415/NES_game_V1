"""Nothing a test depends on may be git-ignored, and nothing the manifest
promises may be absent.

This is the generalisation of the bug where the seven `game.nes` starter
baselines were silently swallowed by `.gitignore` (`*.nes`). A per-file
existence check catches that one instance; this catches the class, including the
next fixture someone adds with an extension that collides with a build-output
pattern. `git add` says nothing when it declines an ignored path, so the file
goes missing at the moment it is created and looks fine forever after.

Both tests failed before the 2026-08-06 re-baseline, each naming the problem
rather than describing a symptom. See
docs/handoffs/2026-08-06-starter-fixture-rebaseline.md.
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
        #
        # It is index-aware: a file already TRACKED is never reported, even if a
        # pattern would otherwise match it. That is the behaviour we want — a
        # tracked file is present in a fresh clone whatever .gitignore says — but
        # it means you cannot prove this test can fail by adding an ignore rule
        # over the committed ROMs. To see it go red, put an untracked file whose
        # extension is ignored under tests/fixtures/ (e.g. probe.bak).
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
