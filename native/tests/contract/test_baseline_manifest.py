from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
MANIFEST_PATH = Path(__file__).with_name("baseline-v63.json")
ENGINE_VERSION_PATH = REPOSITORY_ROOT / "tools" / "engines" / "ENGINE_VERSION"
SHA1 = re.compile(r"^[0-9a-f]{40}$")


class BaselineManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    def test_manifest_tracks_the_live_engine_baseline(self) -> None:
        live_version = int(ENGINE_VERSION_PATH.read_text(encoding="utf-8").strip())
        self.assertEqual(self.manifest["engine_version"], live_version)
        self.assertEqual(self.manifest["scope"], "studio_plus_legacy_union")

    def test_automated_results_and_golden_hashes_are_explicit(self) -> None:
        for result in self.manifest["automated_results"].values():
            self.assertIn(result["status"], {"pass", "fail", "pending"})
        hashes = self.manifest["golden_rom_sha1"]
        self.assertEqual(hashes["stock"], hashes["no_modules_template"])
        for value in hashes.values():
            self.assertRegex(value, SHA1)

    def test_manual_attestation_is_attributed_and_preserves_its_limitations(self) -> None:
        manual = self.manifest["manual_fceux_v63"]
        self.assertEqual(manual["status"], "accepted_product_owner_attestation")
        self.assertGreater(manual["required_cases"], 0)
        self.assertTrue(manual["attestation"])
        self.assertTrue(manual["limitations"])
        self.assertGreater(len(manual["automated_v63_support"]), 0)


if __name__ == "__main__":
    unittest.main()
