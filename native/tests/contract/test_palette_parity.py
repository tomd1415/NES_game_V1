"""The native NES palette must equal the web's, entry for entry.

Native used to *invent* its colours (`QColor.fromHsv((tone * 23) % 360, ...)`),
so PALS displayed 64 colours the NES cannot produce and every tile thumbnail was
painted from a hardcoded four-colour ramp. This test re-parses the web's table
and pins the two targets together so that can never come back.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "native" / "src"))

WEB_SOURCE = REPO_ROOT / "tools" / "tile_editor_web" / "sprite-render.js"


def _web_palette() -> list[tuple[int, int, int]]:
    source = WEB_SOURCE.read_text("utf-8")
    match = re.search(r"const NES_PALETTE_RGB = \[(.*?)\];", source, re.S)
    if match is None:
        raise AssertionError("NES_PALETTE_RGB not found in sprite-render.js")
    triples = re.findall(
        r"\[\s*(0x[0-9A-Fa-f]+)\s*,\s*(0x[0-9A-Fa-f]+)\s*,\s*(0x[0-9A-Fa-f]+)\s*\]",
        match.group(1),
    )
    return [tuple(int(channel, 16) for channel in triple) for triple in triples]


class PaletteParityTests(unittest.TestCase):
    def test_native_palette_matches_the_web(self) -> None:
        from nes_studio.render.palette import NES_PALETTE_RGB

        web = _web_palette()
        self.assertEqual(len(web), 64, "the web table must have 64 entries")
        self.assertEqual(len(NES_PALETTE_RGB), 64)

        for index, (native, browser) in enumerate(zip(NES_PALETTE_RGB, web)):
            self.assertEqual(
                native,
                browser,
                f"colour 0x{index:02X} differs: native={native} web={browser}",
            )

    def test_index_is_masked_to_six_bits(self) -> None:
        from nes_studio.render.palette import nes_rgb

        # The NES only has 64 colours; a palette byte's high bits are ignored.
        self.assertEqual(nes_rgb(0x40), nes_rgb(0x00))
        self.assertEqual(nes_rgb(0xFF), nes_rgb(0x3F))


if __name__ == "__main__":
    unittest.main()
