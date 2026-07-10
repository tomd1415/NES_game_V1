from __future__ import annotations

import sys
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.metadata import APP_ID, APP_VERSION  # noqa: E402


class MetadataTests(unittest.TestCase):
    def test_development_identity_is_explicit(self) -> None:
        self.assertTrue(APP_ID.endswith(".Devel"))
        self.assertEqual(APP_VERSION, "0.1.0.dev0")


if __name__ == "__main__":
    unittest.main()
