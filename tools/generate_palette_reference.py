#!/usr/bin/env python3
"""
Generate assets/pupil/palette_reference.png — a pupil-facing chart of every
NES master-palette byte (0x00..0x3F) with its hex code and RGB values.

Run:
    python tools/generate_palette_reference.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import os
import sys

# Reuse the palette table + NES colour from tile_editor
sys.path.insert(0, str(Path(__file__).parent))
from tile_editor import NES_PALETTE_RGB  # noqa: E402


BG = (14, 12, 26)
PANEL = (20, 18, 32)
FG = (244, 244, 244)
ACCENT = (255, 216, 102)


def _font(size: int):
    for path in (
        "/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_reference(out_path: Path) -> None:
    cell_w, cell_h = 120, 96
    cols = 8
    rows = 8  # 64 colours
    margin = 24
    header_h = 110
    footer_h = 50

    w = cols * cell_w + margin * 2
    h = header_h + rows * cell_h + footer_h
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    d.text((margin, 22),
           "NES MASTER PALETTE — pick these hex codes in my_tiles.txt",
           fill=ACCENT, font=_font(22))
    d.text((margin, 60),
           "Each cell shows the hex code (for palette = 0xNN) and its RGB.",
           fill=(190, 190, 190), font=_font(14))
    d.text((margin, 80),
           "Black-filled slots are duplicates — the NES only really has ~55 distinct colours.",
           fill=(150, 150, 150), font=_font(12))

    font_hex = _font(18)
    font_rgb = _font(11)
    for idx, rgb in enumerate(NES_PALETTE_RGB):
        col = idx % cols
        row = idx // cols
        x = margin + col * cell_w
        y = header_h + row * cell_h
        d.rectangle([x + 4, y + 4, x + cell_w - 4, y + cell_h - 4],
                    fill=rgb, outline=(60, 60, 70))
        # Pick a readable text colour
        luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
        ink = (0, 0, 0) if luma > 130 else (255, 255, 255)
        d.text((x + 12, y + 14), f"0x{idx:02X}", fill=ink, font=font_hex)
        d.text((x + 12, y + 60),
               f"R{rgb[0]:3d} G{rgb[1]:3d} B{rgb[2]:3d}", fill=ink,
               font=font_rgb)

    d.text((margin, h - 36),
           "Tip: 0x21 = sky blue · 0x29 = grass · 0x27 = orange · "
           "0x16 = red · 0x30 = white · 0x0F = black",
           fill=(200, 200, 200), font=_font(12))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    make_reference(root / "assets" / "pupil" / "palette_reference.png")
