from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
MANIFEST_PATH = Path(__file__).with_name("baseline.json")
ENGINE_VERSION_PATH = REPOSITORY_ROOT / "tools" / "engines" / "ENGINE_VERSION"
SHA1 = re.compile(r"^[0-9a-f]{40}$")
SHA_COMMIT = re.compile(r"^[0-9a-f]{40}$")


class BaselineManifestTests(unittest.TestCase):
    """The manifest is a RECORD of evidence, not the evidence.

    Nothing here re-runs a build. These tests keep the record well-formed,
    attributed, and honest about what it does not cover -- which is the part
    that rotted last time: the file sat at engine_version 63 while the engine
    reached 75, and was still named baseline-v63.json (F6).
    """

    def setUp(self) -> None:
        self.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    def test_manifest_tracks_the_live_engine_baseline(self) -> None:
        live_version = int(ENGINE_VERSION_PATH.read_text(encoding="utf-8").strip())
        self.assertEqual(
            self.manifest["engine_version"],
            live_version,
            "the baseline records an engine version the repository has moved past; "
            "re-verify it at the current engine and update it, or say plainly in "
            "the manifest which parts were not re-verified",
        )
        self.assertEqual(self.manifest["scope"], "studio_plus_legacy_union")

    def test_the_record_says_what_a_pass_does_and_does_not_mean(self) -> None:
        blurb = self.manifest["what_a_pass_means"].lower()
        self.assertIn("does not", blurb)
        self.assertRegex(self.manifest["repository_commit"], SHA_COMMIT)
        self.assertTrue(self.manifest["captured_on"])

    def test_automated_results_are_attributed_to_a_command_and_a_date(self) -> None:
        """A result with no command and no date cannot be re-checked or aged out."""
        results = self.manifest["automated_results"]
        self.assertTrue(results)
        for name, result in results.items():
            with self.subTest(result=name):
                self.assertIn(result["status"], {"pass", "fail", "pending", "partial"})
                self.assertTrue(result["command"], "no command to reproduce this result")
                self.assertTrue(result["verified_on"], "no date, so it cannot age out")
                # "partial" is only honest if it says what is missing.
                if result["status"] == "partial":
                    self.assertTrue(
                        result.get("known_gaps"),
                        "a partial result must enumerate its gaps, or it reads as a pass",
                    )

    def test_golden_hashes_are_explicit(self) -> None:
        hashes = self.manifest["golden_rom_sha1"]
        self.assertEqual(hashes["stock"], hashes["no_modules_template"])
        for key, value in hashes.items():
            if key == "note":
                continue
            with self.subTest(golden=key):
                self.assertRegex(value, SHA1)

    def test_manual_attestation_is_attributed_and_preserves_its_limitations(self) -> None:
        manual = self.manifest["manual_fceux_v63"]
        self.assertEqual(manual["status"], "accepted_product_owner_attestation")
        self.assertGreater(manual["required_cases"], 0)
        self.assertTrue(manual["attestation"])
        self.assertTrue(manual["limitations"])
        self.assertGreater(len(manual["automated_v63_support"]), 0)

    def test_the_v63_attestation_is_not_passed_off_as_current(self) -> None:
        """It is evidence about v63, gathered before twelve engine versions landed.

        Three of the seven starter ROMs are known to have changed in that range,
        so silently carrying this forward would overstate attended coverage.
        """
        manual = self.manifest["manual_fceux_v63"]
        live_version = int(ENGINE_VERSION_PATH.read_text(encoding="utf-8").strip())
        self.assertEqual(manual["applies_to_engine_version"], 63)
        if manual["applies_to_engine_version"] != live_version:
            self.assertFalse(
                manual["re_attested_at_current_engine"],
                "the attestation claims to hold at the current engine while being "
                "dated to an older one",
            )
            self.assertTrue(manual["carried_forward_note"])


if __name__ == "__main__":
    unittest.main()
