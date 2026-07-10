from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.core.resources import RESOURCE_ROOT_ENV, ResourceLocator  # noqa: E402


class ResourceLocatorTests(unittest.TestCase):
    def test_discovers_source_checkout_from_nested_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "tools" / "engines").mkdir(parents=True)
            (root / "steps" / "Step_Playground").mkdir(parents=True)
            nested = root / "native" / "src"
            nested.mkdir(parents=True)

            with patch.dict(os.environ, {}, clear=True):
                locator = ResourceLocator.discover(nested)

            self.assertEqual(locator.root, root)
            self.assertTrue(locator.source_checkout)
            self.assertEqual(locator.missing_required(), ())

    def test_environment_override_is_explicit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {RESOURCE_ROOT_ENV: directory}, clear=True):
                locator = ResourceLocator.discover()

            self.assertEqual(locator.root, Path(directory).resolve())
            self.assertTrue(locator.source_checkout)
            self.assertEqual(len(locator.missing_required()), 2)


if __name__ == "__main__":
    unittest.main()
