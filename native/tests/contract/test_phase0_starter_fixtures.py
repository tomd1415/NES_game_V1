from __future__ import annotations

import hashlib
import gzip
import json
import unittest
from pathlib import Path


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "phase0" / "starters"
EXPECTED = {"basics", "smb", "topdown", "runner", "geodash", "racer", "scratch"}


def sha256(path: Path) -> str:
    data = path.read_bytes()
    if path.suffix == ".gz":
        data = gzip.decompress(data)
    return hashlib.sha256(data).hexdigest()


class PhaseZeroStarterFixtureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = json.loads((FIXTURE_ROOT / "manifest.json").read_text(encoding="utf-8"))

    def test_all_shipped_starter_styles_are_materialized(self) -> None:
        self.assertEqual(set(self.manifest["fixtures"]), EXPECTED)
        self.assertEqual(self.manifest["engine_version"], 63)

    def test_artifact_hashes_and_input_immutability_match(self) -> None:
        filenames = {
            "project_json_sha256": "project.json.gz",
            "play_request_json_sha256": "play-request.json.gz",
            "generated_source_sha256": "main.c.gz",
            "rom_sha256": "game.nes",
        }
        for fixture, record in self.manifest["fixtures"].items():
            with self.subTest(fixture=fixture):
                directory = FIXTURE_ROOT / fixture
                self.assertTrue(record["input_project_unchanged"])
                self.assertEqual(record["rom_size"], (directory / "game.nes").stat().st_size)
                for field, filename in filenames.items():
                    self.assertEqual(record[field], sha256(directory / filename))


if __name__ == "__main__":
    unittest.main()
