from __future__ import annotations

import configparser
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = NATIVE_ROOT.parent
PACKAGING_ROOT = REPOSITORY_ROOT / "packaging" / "linux"
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.metadata import APP_ID, APP_VERSION  # noqa: E402


class PackagingMetadataTests(unittest.TestCase):
    def test_desktop_and_appstream_identity_match_python(self) -> None:
        desktop_path = PACKAGING_ROOT / f"{APP_ID}.desktop"
        appstream_path = PACKAGING_ROOT / f"{APP_ID}.metainfo.xml"

        desktop = configparser.ConfigParser(interpolation=None)
        desktop.optionxform = str
        desktop.read(desktop_path, encoding="utf-8")
        self.assertEqual(desktop["Desktop Entry"]["Icon"], APP_ID)
        self.assertEqual(desktop["Desktop Entry"]["Exec"], "nes-studio %F")

        appstream = ET.parse(appstream_path).getroot()
        self.assertEqual(appstream.findtext("id"), APP_ID)
        self.assertEqual(
            appstream.findtext("launchable"),
            f"{APP_ID}.desktop",
        )
        release = appstream.find("./releases/release")
        self.assertIsNotNone(release)
        self.assertEqual(release.attrib["version"], APP_VERSION)

    def test_xml_metadata_and_icon_are_well_formed(self) -> None:
        xml_paths = [
            PACKAGING_ROOT / f"{APP_ID}.metainfo.xml",
            PACKAGING_ROOT / "mime" / "packages" / f"{APP_ID}.xml",
            PACKAGING_ROOT
            / "icons"
            / "hicolor"
            / "scalable"
            / "apps"
            / f"{APP_ID}.svg",
        ]
        for path in xml_paths:
            with self.subTest(path=path):
                ET.parse(path)


if __name__ == "__main__":
    unittest.main()
