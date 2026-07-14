"""The icons, and the desktop entry that uses them.

There were no image assets at all: the app had no icon in the launcher, the task
switcher or the window. These tests exist so that a missing or unregenerated
asset fails loudly, rather than degrading to the blank square we had before.
"""

from __future__ import annotations

import importlib.util
import os
import re
import sys
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None
PACKAGING = NATIVE_ROOT / "packaging"
ICONS = NATIVE_ROOT / "src" / "nes_studio" / "resources" / "icons"


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class IconTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from nes_studio.application import create_application

        cls.application = create_application(["nes-studio-test"])

    def test_the_app_icon_exists_at_every_size_the_desktop_asks_for(self) -> None:
        from nes_studio.ui.icons import APP_ICON_SIZES, app_icon

        icon = app_icon()
        self.assertFalse(icon.isNull(), "the app has no icon")

        available = {size.width() for size in icon.availableSizes()}
        for size in APP_ICON_SIZES:
            self.assertIn(size, available, f"no {size}px app icon")

    def test_every_mode_has_a_rail_icon(self) -> None:
        from nes_studio.ui.icons import mode_icon
        from nes_studio.ui.modes import MODE_NAMES

        for mode in MODE_NAMES:
            with self.subTest(mode=mode):
                self.assertFalse(mode_icon(mode).isNull(), f"{mode} has no icon")

    def test_the_icons_use_only_colours_the_nes_can_produce(self) -> None:
        """An icon for an NES tool should not contain a colour an NES cannot make.

        The generator indexes the real system palette; this proves the PNGs on
        disk were generated from it and not hand-edited into something else.
        """

        from PySide6.QtGui import QImage

        from nes_studio.render.palette import NES_PALETTE_RGB

        allowed = {tuple(rgb) for rgb in NES_PALETTE_RGB}

        for path in sorted(ICONS.glob("mode-*.png")):
            with self.subTest(icon=path.name):
                image = QImage(str(path))
                self.assertFalse(image.isNull())
                for y in range(image.height()):
                    for x in range(image.width()):
                        colour = image.pixelColor(x, y)
                        if colour.alpha() == 0:
                            continue
                        self.assertIn(
                            (colour.red(), colour.green(), colour.blue()),
                            allowed,
                            f"{path.name} uses a colour the NES cannot produce",
                        )

    def test_a_locked_mode_icon_is_dimmed_not_missing(self) -> None:
        """A locked mode stays *visible*. Its icon must still be there."""

        from nes_studio.ui.icons import locked_mode_icon

        self.assertFalse(locked_mode_icon("CODE").isNull())

    def test_the_icons_are_shipped_with_the_package(self) -> None:
        """`resources/**/*` in pyproject covers them, but only if they are inside
        an importable package."""

        self.assertTrue((ICONS / "__init__.py").exists())


class DesktopEntryTests(unittest.TestCase):
    """An app with no launcher entry looks like one that does not belong on the
    machine — which matters most on exactly the locked-down school images this is
    built for."""

    def entry(self) -> dict[str, str]:
        from nes_studio.metadata import APP_ID

        path = PACKAGING / f"{APP_ID}.desktop"
        self.assertTrue(path.exists(), "there is no .desktop entry")
        values = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.startswith("["):
                key, value = line.split("=", 1)
                values[key] = value
        return values

    def test_the_entry_is_well_formed(self) -> None:
        entry = self.entry()
        self.assertEqual(entry["Type"], "Application")
        self.assertTrue(entry["Name"])
        self.assertTrue(entry["Comment"])
        self.assertEqual(entry["Exec"].split()[0], "nes-studio")
        self.assertIn("Education", entry["Categories"])

    def test_the_entry_points_at_the_app_id_and_the_binary_we_ship(self) -> None:
        from nes_studio.metadata import APP_ID

        entry = self.entry()
        self.assertEqual(entry["Icon"], APP_ID, "the icon name must match the app id")

        pyproject = (NATIVE_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        self.assertIn("nes-studio = ", pyproject, "the Exec= binary is not a console script")

    def test_the_metainfo_names_the_same_app(self) -> None:
        from nes_studio.metadata import APP_ID

        path = PACKAGING / f"{APP_ID}.metainfo.xml"
        self.assertTrue(path.exists())
        text = path.read_text(encoding="utf-8")

        self.assertIn(f"<id>{APP_ID}</id>", text)
        self.assertIn("<project_license>MIT</project_license>", text)
        self.assertIn(f"{APP_ID}.desktop", text)

    def test_the_installer_covers_every_generated_icon_size(self) -> None:
        """The installer hardcodes its size list. If the generator's list changes
        and the installer's does not, a size silently stops being installed."""

        from nes_studio.ui.icons import APP_ICON_SIZES

        script = (PACKAGING / "install-desktop-entry.sh").read_text(encoding="utf-8")
        installed = set()
        for match in re.finditer(r"for size in ([\d ]+); do", script):
            installed.update(int(size) for size in match.group(1).split())

        self.assertEqual(
            installed,
            set(APP_ICON_SIZES),
            "the installer and the icon generator disagree about which sizes exist",
        )


if __name__ == "__main__":
    unittest.main()
