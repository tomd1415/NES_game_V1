#!/usr/bin/env python3
"""Generate the app's icons from NES pixel art.

There were **no image assets at all**: every icon was procedurally painted at
runtime, and the app had no icon in the launcher, the task switcher or the window
decoration. On a school image, an app with no icon looks like it does not belong
there.

These are generated rather than hand-drawn binaries, so a teacher (or a pupil)
can read the art as text, change a character, and re-run this. Every colour is an
index into the **real NES system palette** — an icon for an NES tool should not
contain a colour an NES cannot produce.

    native/.venv/bin/python native/scripts/generate_icons.py

Writes PNGs into `src/nes_studio/resources/icons/`.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from PySide6.QtCore import Qt  # noqa: E402
from PySide6.QtGui import QImage, QPainter  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

from nes_studio.render.palette import nes_qcolor  # noqa: E402

OUT = ROOT / "src" / "nes_studio" / "resources" / "icons"

#: Character → NES palette index. `.` is transparent.
INK: dict[str, int] = {
    "K": 0x0F,  # near-black
    "W": 0x30,  # white
    "G": 0x10,  # grey
    "R": 0x16,  # red
    "O": 0x27,  # orange
    "Y": 0x28,  # gold
    "L": 0x2A,  # green
    "C": 0x2C,  # cyan
    "B": 0x11,  # blue
    "P": 0x14,  # magenta
    "D": 0x01,  # deep blue
    "N": 0x17,  # brown
}

#: The app icon: a CRT television showing a green playfield. 16x16.
APP = """
................
..KKKKKKKKKKKK..
..KGGGGGGGGGGK..
..KGDDDDDDDDGK..
..KGDCCCCCCDGK..
..KGDCWWWWCDGK..
..KGDCWLLWCDGK..
..KGDCWLLWCDGK..
..KGDCLLLLCDGK..
..KGDCLLLLCDGK..
..KGDDDDDDDDGK..
..KGGGGGGGGGGK..
..KKKKKKKKKKKK..
....KK....KK....
...KKKK..KKKK...
................
"""

#: One per mode, 16x16, in rail order. Each says what the mode *is*, in the
#: crudest possible pixels — which is the right register for an NES tool.
MODES: dict[str, str] = {
    # A landscape: sky, a hill, ground.
    "WORLD": """
................
.CCCCCCCCCCCCCC.
.CCCCCCCCCCCCCC.
.CCCCCCWWCCCCCC.
.CCCCCWWWWCCCCC.
.CCCCCCCCCCCCCC.
.CCCCLLCCCCCCCC.
.CCCLLLLCCCLLCC.
.CCLLLLLLCLLLLC.
.CLLLLLLLLLLLLL.
.NNNNNNNNNNNNNN.
.NNNNNNNNNNNNNN.
.NNKNNNNKNNNNKN.
.NNNNNNNNNNNNNN.
.NKNNNNKNNNNKNN.
................
""",
    # A little person.
    "CHARS": """
................
......OOOO......
.....OOOOOO.....
.....OWOOWO.....
.....OOOOOO.....
.....OKKKKO.....
......OOOO......
....RRRRRRRR....
...RRRRRRRRRR...
...RRRRRRRRRR...
...RRRRRRRRRR...
....RRRRRRRR....
.....BB..BB.....
.....BB..BB.....
....KKK..KKK....
................
""",
    # A 2x2 grid of tiles, one of them being drawn.
    "TILES": """
................
.KKKKKKKKKKKKKK.
.KYYYYYKKLLLLLK.
.KYYYYYKKLLLLLK.
.KYYYYYKKLLLLLK.
.KYYYYYKKLLLLLK.
.KYYYYYKKLLLLLK.
.KKKKKKKKKKKKKK.
.KKKKKKKKKKKKKK.
.KBBBBBKKWWWWWK.
.KBBBBBKKWWWWWK.
.KBBBBBKKWKKKWK.
.KBBBBBKKWWWWWK.
.KBBBBBKKWWWWWK.
.KKKKKKKKKKKKKK.
................
""",
    # A palette of swatches.
    "PALS": """
................
.KKKKKKKKKKKKKK.
.KRRRKOOOKYYYKK.
.KRRRKOOOKYYYKK.
.KRRRKOOOKYYYKK.
.KKKKKKKKKKKKKK.
.KLLLKCCCKBBBKK.
.KLLLKCCCKBBBKK.
.KLLLKCCCKBBBKK.
.KKKKKKKKKKKKKK.
.KPPPKWWWKGGGKK.
.KPPPKWWWKGGGKK.
.KPPPKWWWKGGGKK.
.KKKKKKKKKKKKKK.
................
................
""",
    # A joypad: what kind of game is this.
    "STYLE": """
................
................
..KKKKKKKKKKKK..
..KGGGGGGGGGGK..
..KGKGKGGGGGGK..
..KGKKKKGGRRGK..
..KGKGKGGGGGGK..
..KGGGGGGRRGGK..
..KGGGGGGGGGGK..
..KKKKKKKKKKKK..
................
................
................
................
................
................
""",
    # A checklist.
    "RULES": """
................
.KKKKKKKKKKKKK..
.KWWWWWWWWWWWK..
.KWLKWKKKKKKWK..
.KWLLKWKKKKKWK..
.KWKLKWKKKKKWK..
.KWWWWWWWWWWWK..
.KWLKWKKKKKKWK..
.KWLLKWKKKKKWK..
.KWKLKWKKKKKWK..
.KWWWWWWWWWWWK..
.KWKKWKKKKKKWK..
.KWKKWKKKKKKWK..
.KWWWWWWWWWWWK..
.KKKKKKKKKKKKK..
................
""",
    # A speaker with a note.
    "SOUND": """
................
...........YY...
......KK...YY...
.....KKK...YY...
....KKKK.YYYY...
.KKKKKKK.YY.....
.KKKKKKK.YY.....
.KKKKKKKYYY.....
.KKKKKKKYYY.....
.KKKKKKK.YY.....
....KKKK........
.....KKK........
......KK........
................
................
................
""",
    # Angle brackets: source.
    "CODE": """
................
.KKKKKKKKKKKKKK.
.KKKKKKKKKKKKKK.
.KKKKLKKKKLKKKK.
.KKKLKKKKKKLKKK.
.KKLKKKKKKKKLKK.
.KLKKKKCCKKKKLK.
.KKLKKKCCKKKKKK.
.KKKLKKCCKKKLKK.
.KKKKLKCCKKLKKK.
.KKKKKKCCKLKKKK.
.KKKKKKKKKKKKKK.
.KKKKKKKKKKKKKK.
.KKKKKKKKKKKKKK.
.KKKKKKKKKKKKKK.
................
""",
}


def render(art: str, scale: int = 1) -> QImage:
    """Turn the pixel-art string into an image."""

    rows = [line for line in art.strip("\n").splitlines() if line]
    height = len(rows)
    width = max(len(row) for row in rows)

    image = QImage(width, height, QImage.Format.Format_RGBA8888)
    image.fill(Qt.GlobalColor.transparent)
    for y, row in enumerate(rows):
        for x, character in enumerate(row):
            if character == "." or character not in INK:
                continue
            colour = nes_qcolor(INK[character])
            image.setPixelColor(x, y, colour)

    if scale > 1:
        image = image.scaled(
            width * scale,
            height * scale,
            Qt.AspectRatioMode.IgnoreAspectRatio,
            # Nearest-neighbour: smoothing turns pixel art to mush.
            Qt.TransformationMode.FastTransformation,
        )
    return image


def write(name: str, art: str, sizes: tuple[int, ...]) -> None:
    for size in sizes:
        source = render(art)
        scale = max(1, size // source.width())
        image = render(art, scale)
        if image.width() != size:  # a size that is not a whole multiple of 16
            image = image.scaled(
                size,
                size,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.FastTransformation,
            )
        path = OUT / (f"{name}-{size}.png" if len(sizes) > 1 else f"{name}.png")
        image.save(str(path))
        print(f"  {path.relative_to(ROOT)}")


def main() -> int:
    QApplication([])  # QImage needs a QGuiApplication for colour handling
    OUT.mkdir(parents=True, exist_ok=True)

    print("app icon:")
    write("nes-studio", APP, (16, 32, 48, 64, 128, 256))

    print("mode icons:")
    for mode, art in MODES.items():
        write(f"mode-{mode.lower()}", art, (32,))

    # A composite for the About box and the docs.
    print("banner:")
    banner = QImage(16 * 8, 16, QImage.Format.Format_RGBA8888)
    banner.fill(Qt.GlobalColor.transparent)
    painter = QPainter(banner)
    for index, art in enumerate(MODES.values()):
        painter.drawImage(index * 16, 0, render(art))
    painter.end()
    banner = banner.scaled(
        banner.width() * 2,
        banner.height() * 2,
        Qt.AspectRatioMode.IgnoreAspectRatio,
        Qt.TransformationMode.FastTransformation,
    )
    banner.save(str(OUT / "modes-banner.png"))
    print(f"  {(OUT / 'modes-banner.png').relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
