from __future__ import annotations

import json
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CORPUS_PATH = Path(__file__).with_name("phase0-corpus.json")
REQUIRED_CATEGORIES = {
    "blank_scratch",
    "platformer",
    "smb",
    "top_down",
    "auto_runner",
    "racer",
    "two_player",
    "multi_screen",
    "multi_background",
    "metatiles",
    "dialogue_audio",
    "custom_c",
    "custom_asm",
    "legacy_schema",
}
REQUIRED_ARTIFACTS = {
    "project_json_sha256",
    "play_request_json_sha256",
    "generated_source_sha256",
    "generated_include_sha256",
    "rom_sha256",
    "input_project_unchanged",
}


class PhaseZeroCorpusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))

    def test_every_required_fixture_category_is_indexed(self) -> None:
        categories = self.corpus["categories"]
        self.assertEqual(set(categories), REQUIRED_CATEGORIES)
        for category, sources in categories.items():
            with self.subTest(category=category):
                self.assertTrue(sources)
                for source in sources:
                    self.assertTrue((REPOSITORY_ROOT / source).is_file(), source)

    def test_materialized_fixture_contract_is_complete(self) -> None:
        self.assertEqual(set(self.corpus["artifact_contract"]), REQUIRED_ARTIFACTS)
        self.assertIn(self.corpus["materialization_status"], {"indexed", "partial", "complete"})


if __name__ == "__main__":
    unittest.main()
