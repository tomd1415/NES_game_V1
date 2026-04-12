#!/usr/bin/env python3
"""
Pupil tile editor — parses a simple digits-only text file and renders a
preview PNG showing each tile, sprite, and background chunk.

Usage:
    python tools/tile_editor.py <tiles.txt> [-o preview.png]
    python tools/tile_editor.py <tiles.txt> --watch       # live refresh

The text file grammar is documented at the top of assets/pupil/my_tiles.txt.
Enforced NES rules:
  - every TILE is exactly 8 lines of exactly 8 digits
  - only the digits 0-3 are allowed inside a tile
  - every PALETTE has exactly 3 colour slots (1, 2, 3)
  - palette bytes must be valid NES master-palette indices (0x00-0x3F)
  - SPRITE / BACKGROUND rows must all contain the same number of tile names
  - referenced tile/palette names must exist

If anything fails to parse, the preview PNG keeps the last good image and
overlays a red error banner — so the pupil sees the problem without reading
the terminal.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont


# ---------------------------------------------------------------------------
# NES master palette (64 RGB triples, index 0x00..0x3F)
# ---------------------------------------------------------------------------
NES_PALETTE_RGB: List[Tuple[int, int, int]] = [
    (0x62, 0x62, 0x62), (0x00, 0x1F, 0xB2), (0x24, 0x04, 0xC8), (0x52, 0x00, 0xB2),
    (0x73, 0x00, 0x76), (0x80, 0x00, 0x24), (0x73, 0x0B, 0x00), (0x52, 0x28, 0x00),
    (0x24, 0x44, 0x00), (0x00, 0x57, 0x00), (0x00, 0x5C, 0x00), (0x00, 0x53, 0x24),
    (0x00, 0x3C, 0x76), (0x00, 0x00, 0x00), (0x00, 0x00, 0x00), (0x00, 0x00, 0x00),
    (0xAB, 0xAB, 0xAB), (0x0D, 0x57, 0xFF), (0x4B, 0x30, 0xFF), (0x8A, 0x13, 0xFF),
    (0xBC, 0x08, 0xD6), (0xD2, 0x12, 0x69), (0xC7, 0x2E, 0x00), (0x9D, 0x54, 0x00),
    (0x60, 0x7B, 0x00), (0x20, 0x98, 0x00), (0x00, 0xA3, 0x00), (0x00, 0x99, 0x42),
    (0x00, 0x7D, 0xB4), (0x00, 0x00, 0x00), (0x00, 0x00, 0x00), (0x00, 0x00, 0x00),
    (0xFF, 0xFF, 0xFF), (0x53, 0xAE, 0xFF), (0x90, 0x85, 0xFF), (0xD3, 0x65, 0xFF),
    (0xFF, 0x57, 0xFF), (0xFF, 0x5D, 0xCF), (0xFF, 0x77, 0x57), (0xFA, 0x9E, 0x00),
    (0xBD, 0xC7, 0x00), (0x7A, 0xE7, 0x00), (0x43, 0xF6, 0x11), (0x26, 0xEF, 0x7E),
    (0x2C, 0xD5, 0xF6), (0x4E, 0x4E, 0x4E), (0x00, 0x00, 0x00), (0x00, 0x00, 0x00),
    (0xFF, 0xFF, 0xFF), (0xB6, 0xE1, 0xFF), (0xCE, 0xD1, 0xFF), (0xE9, 0xC3, 0xFF),
    (0xFF, 0xBC, 0xFF), (0xFF, 0xBD, 0xF4), (0xFF, 0xC6, 0xC3), (0xFF, 0xD5, 0x9A),
    (0xE9, 0xE6, 0x81), (0xCE, 0xF4, 0x81), (0xB6, 0xFB, 0x9A), (0xA9, 0xFA, 0xC3),
    (0xA9, 0xF0, 0xF4), (0xB8, 0xB8, 0xB8), (0x00, 0x00, 0x00), (0x00, 0x00, 0x00),
]

# The universal background colour (palette entry 0) used for any "0" digit
# so transparent pixels are visible in the preview as a sky blue.
PREVIEW_BG_INDEX = 0x21           # light blue sky (matches the game)
PANEL_BG          = (20, 18, 32)
PANEL_FG          = (244, 244, 244)
HEADING_FG        = (255, 216, 102)
ACCENT            = (255, 97, 136)
ERROR_BG          = (58, 31, 42)
SUCCESS_BG        = (23, 44, 32)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class Palette:
    name: str
    colours: Dict[int, int]          # slot 1/2/3 -> NES master index
    line: int = 0


@dataclass
class Tile:
    name: str
    pixels: List[List[int]]           # 8x8, each value 0-3
    line: int = 0


@dataclass
class Composite:
    kind: str                         # "sprite" or "background"
    name: str
    palette: str
    rows: List[List[str]]             # list of rows, each a list of tile names
    line: int = 0


@dataclass
class Document:
    palettes: Dict[str, Palette] = field(default_factory=dict)
    tiles: Dict[str, Tile] = field(default_factory=dict)
    composites: List[Composite] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------
HEADER_RE = re.compile(
    r"^\s*(palette|tile|sprite|background)\s+([a-zA-Z_][\w]*)"
    r"(?:\s+using\s+([a-zA-Z_][\w]*))?\s*:?\s*$",
    re.IGNORECASE,
)
PALETTE_ROW_RE = re.compile(r"^\s*([123])\s*=\s*(0x[0-9a-fA-F]{1,2}|\d+)\s*$")
PIXEL_ROW_RE = re.compile(r"^[0-3.]{8}$")


def _strip_comment(line: str) -> str:
    # Strip inline `# ...` comments but keep the bit before them.
    in_quote = False
    for i, ch in enumerate(line):
        if ch == '#' and not in_quote:
            return line[:i]
    return line


def parse(text: str) -> Document:
    doc = Document()
    current_kind: Optional[str] = None
    current_name: Optional[str] = None
    current_palette: Optional[str] = None
    current_pixels: List[List[int]] = []
    current_rows: List[List[str]] = []
    current_start_line = 0

    def finalise(lineno: int) -> None:
        nonlocal current_kind, current_name, current_palette
        nonlocal current_pixels, current_rows
        if current_kind is None:
            return
        if current_kind == "palette":
            pass  # finalised on-the-fly
        elif current_kind == "tile":
            if len(current_pixels) != 8:
                doc.errors.append(
                    f"line {current_start_line}: tile '{current_name}' "
                    f"has {len(current_pixels)} row(s) — must be exactly 8"
                )
            else:
                doc.tiles[current_name] = Tile(
                    name=current_name,
                    pixels=current_pixels,
                    line=current_start_line,
                )
        elif current_kind in ("sprite", "background"):
            if not current_rows:
                doc.errors.append(
                    f"line {current_start_line}: {current_kind} "
                    f"'{current_name}' is empty"
                )
            else:
                widths = {len(r) for r in current_rows}
                if len(widths) > 1:
                    doc.errors.append(
                        f"line {current_start_line}: {current_kind} "
                        f"'{current_name}' has uneven rows {sorted(widths)}"
                    )
                else:
                    doc.composites.append(Composite(
                        kind=current_kind,
                        name=current_name,
                        palette=current_palette or "",
                        rows=current_rows,
                        line=current_start_line,
                    ))
        current_kind = None
        current_name = None
        current_palette = None
        current_pixels = []
        current_rows = []

    for lineno, raw in enumerate(text.splitlines(), start=1):
        stripped = _strip_comment(raw).rstrip()
        if not stripped.strip():
            continue

        header = HEADER_RE.match(stripped)
        if header:
            finalise(lineno)
            kind = header.group(1).lower()
            name = header.group(2)
            using = header.group(3)
            current_kind = kind
            current_name = name
            current_palette = using
            current_start_line = lineno

            if kind == "palette":
                doc.palettes[name] = Palette(name=name, colours={}, line=lineno)
            elif kind in ("sprite", "background") and using is None:
                doc.errors.append(
                    f"line {lineno}: {kind} '{name}' is missing 'using <palette>'"
                )
            continue

        if current_kind == "palette":
            m = PALETTE_ROW_RE.match(stripped)
            if not m:
                doc.errors.append(
                    f"line {lineno}: expected e.g. '1 = 0x27' inside palette "
                    f"'{current_name}', got: {stripped.strip()!r}"
                )
                continue
            slot = int(m.group(1))
            val = int(m.group(2), 0)
            if val < 0 or val > 0x3F:
                doc.errors.append(
                    f"line {lineno}: palette byte {val:#x} is out of range — "
                    f"must be 0x00..0x3F"
                )
                continue
            doc.palettes[current_name].colours[slot] = val
            continue

        if current_kind == "tile":
            row = stripped.strip()
            if not PIXEL_ROW_RE.match(row):
                doc.errors.append(
                    f"line {lineno}: tile row must be 8 characters of 0-3 (or '.' "
                    f"for 0), got: {row!r}"
                )
                continue
            current_pixels.append([0 if c == '.' else int(c) for c in row])
            continue

        if current_kind in ("sprite", "background"):
            names = stripped.split()
            current_rows.append(names)
            continue

        doc.errors.append(f"line {lineno}: unexpected content: {stripped.strip()!r}")

    finalise(len(text.splitlines()) + 1)

    # Cross-reference checks
    for p in doc.palettes.values():
        missing = [s for s in (1, 2, 3) if s not in p.colours]
        if missing:
            doc.errors.append(
                f"line {p.line}: palette '{p.name}' is missing slot(s) "
                f"{missing} — every palette must set 1, 2 and 3"
            )
    for c in doc.composites:
        if c.palette and c.palette not in doc.palettes:
            doc.errors.append(
                f"line {c.line}: {c.kind} '{c.name}' uses palette "
                f"'{c.palette}' which is not defined"
            )
        for r_idx, row in enumerate(c.rows):
            for t_idx, tname in enumerate(row):
                if tname not in doc.tiles:
                    doc.errors.append(
                        f"line {c.line}: {c.kind} '{c.name}' references "
                        f"tile '{tname}' at row {r_idx + 1} col {t_idx + 1} "
                        f"which is not defined"
                    )
    return doc


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in (
        "/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    ):
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                pass
    return ImageFont.load_default()


def render_tile(tile: Tile, palette: Palette, scale: int) -> Image.Image:
    """Render an 8×8 tile at the given scale, using palette colours."""
    bg = NES_PALETTE_RGB[PREVIEW_BG_INDEX]
    img = Image.new("RGB", (8 * scale, 8 * scale), bg)
    draw = ImageDraw.Draw(img)
    for y in range(8):
        for x in range(8):
            v = tile.pixels[y][x]
            if v == 0:
                continue
            colour = NES_PALETTE_RGB[palette.colours.get(v, 0)]
            draw.rectangle(
                [x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1],
                fill=colour,
            )
    return img


def render_composite(comp: Composite, doc: Document, scale: int) -> Image.Image:
    """Stitch a composite's named tiles into one image."""
    palette = doc.palettes.get(comp.palette)
    if palette is None:
        return Image.new("RGB", (8 * scale, 8 * scale), (60, 0, 0))
    cols = len(comp.rows[0])
    rows = len(comp.rows)
    img = Image.new("RGB", (8 * cols * scale, 8 * rows * scale),
                    NES_PALETTE_RGB[PREVIEW_BG_INDEX])
    for r, row in enumerate(comp.rows):
        for c, tname in enumerate(row):
            tile = doc.tiles.get(tname)
            if tile is None:
                continue
            tile_img = render_tile(tile, palette, scale)
            img.paste(tile_img, (c * 8 * scale, r * 8 * scale))
    return img


def _draw_banner(img: Image.Image, text: str, bg: Tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(img)
    font = _font(18)
    w, _ = img.size
    lines = text.splitlines()
    h = 20 + 22 * len(lines)
    draw.rectangle([0, 0, w, h], fill=bg)
    for i, line in enumerate(lines):
        draw.text((16, 10 + i * 22), line, fill=(255, 255, 255), font=font)


def render_preview(doc: Document, source_path: Path) -> Image.Image:
    """Compose the full preview canvas."""
    font_h1 = _font(22)
    font_h2 = _font(16)
    font_label = _font(13)
    font_small = _font(11)

    # Compute section blocks as PIL images we paste onto the canvas.
    sections: List[Tuple[str, Image.Image]] = []

    # --- Palettes block -------------------------------------------------
    if doc.palettes:
        swatch = 36
        row_h = swatch + 38
        pal_img = Image.new(
            "RGB",
            (900, 60 + row_h * len(doc.palettes)),
            PANEL_BG,
        )
        d = ImageDraw.Draw(pal_img)
        d.text((20, 18), "PALETTES", fill=HEADING_FG, font=font_h1)
        y = 56
        for pal in doc.palettes.values():
            d.text((20, y + 6), pal.name, fill=PANEL_FG, font=font_h2)
            for i, slot in enumerate((1, 2, 3)):
                code = pal.colours.get(slot, 0)
                x = 220 + i * 180
                d.rectangle([x, y, x + swatch, y + swatch],
                            fill=NES_PALETTE_RGB[code], outline=PANEL_FG)
                d.text((x + swatch + 10, y + 4),
                       f"{slot}  {code:#04x}", fill=PANEL_FG, font=font_label)
                d.text((x + swatch + 10, y + 22),
                       f"RGB {NES_PALETTE_RGB[code]}",
                       fill=(180, 180, 180), font=font_small)
            y += row_h
        sections.append(("palettes", pal_img))

    # --- Tiles block ----------------------------------------------------
    if doc.tiles:
        scale_big = 16   # 8×8 → 128×128
        scale_small = 4  # actual-size reference
        cell_w = 8 * scale_big + 100      # tile + text
        cell_h = 8 * scale_big + 40
        per_row = 4
        rows_needed = (len(doc.tiles) + per_row - 1) // per_row
        tiles_img = Image.new(
            "RGB",
            (per_row * cell_w + 40, 60 + rows_needed * cell_h + 20),
            PANEL_BG,
        )
        d = ImageDraw.Draw(tiles_img)
        d.text((20, 18), "TILES  (8×8 each)", fill=HEADING_FG, font=font_h1)
        default_pal = next(iter(doc.palettes.values()), None)
        for idx, tile in enumerate(doc.tiles.values()):
            col = idx % per_row
            row = idx // per_row
            x = 20 + col * cell_w
            y = 60 + row * cell_h
            if default_pal:
                big = render_tile(tile, default_pal, scale_big)
                small = render_tile(tile, default_pal, scale_small)
                tiles_img.paste(big, (x, y))
                tiles_img.paste(small, (x + 8 * scale_big + 12, y))
            d.text((x, y + 8 * scale_big + 4),
                   tile.name, fill=PANEL_FG, font=font_label)
            d.text((x + 8 * scale_big + 12, y + 8 * scale_small + 4),
                   "actual", fill=(150, 150, 150), font=font_small)
        sections.append(("tiles", tiles_img))

    # --- Sprites block --------------------------------------------------
    sprites = [c for c in doc.composites if c.kind == "sprite"]
    if sprites:
        scale = 10
        gap = 30
        widths = [8 * len(c.rows[0]) * scale for c in sprites]
        heights = [8 * len(c.rows) * scale for c in sprites]
        total_w = sum(widths) + gap * (len(sprites) - 1) + 40
        total_h = max(heights) + 100
        spr_img = Image.new("RGB", (max(900, total_w), total_h), PANEL_BG)
        d = ImageDraw.Draw(spr_img)
        d.text((20, 18),
               "SPRITES  (tiles stitched into a character)",
               fill=HEADING_FG, font=font_h1)
        x = 20
        for c in sprites:
            img = render_composite(c, doc, scale)
            spr_img.paste(img, (x, 60))
            cols = len(c.rows[0])
            rows = len(c.rows)
            d.text((x, 60 + 8 * rows * scale + 6),
                   f"{c.name}  ({cols * 8}×{rows * 8})  palette: {c.palette}",
                   fill=PANEL_FG, font=font_label)
            x += 8 * cols * scale + gap
        sections.append(("sprites", spr_img))

    # --- Backgrounds block ---------------------------------------------
    backgrounds = [c for c in doc.composites if c.kind == "background"]
    if backgrounds:
        scale = 4
        gap = 24
        bg_img_h = 100
        bg_img_w = 900
        # Layout backgrounds in a column so any width fits.
        total_h = 60
        rendered = []
        for c in backgrounds:
            img = render_composite(c, doc, scale)
            rendered.append((c, img))
            total_h += img.height + gap + 26
        bg_img_w = max(
            bg_img_w, max((img.width for _, img in rendered), default=0) + 40
        )
        bg_img_h = total_h
        bg_img = Image.new("RGB", (bg_img_w, bg_img_h), PANEL_BG)
        d = ImageDraw.Draw(bg_img)
        d.text((20, 18),
               "BACKGROUNDS  (tiles arranged into a scene)",
               fill=HEADING_FG, font=font_h1)
        y = 60
        for c, img in rendered:
            bg_img.paste(img, (20, y))
            d.text((20, y + img.height + 4),
                   f"{c.name}  ({len(c.rows[0])}×{len(c.rows)} tiles)  "
                   f"palette: {c.palette}",
                   fill=PANEL_FG, font=font_label)
            y += img.height + 26 + gap
        sections.append(("backgrounds", bg_img))

    # --- Compose canvas -------------------------------------------------
    canvas_w = max((img.width for _, img in sections), default=960) + 40
    canvas_h = 90 + sum(img.height + 20 for _, img in sections) + 60
    canvas = Image.new("RGB", (canvas_w, canvas_h), (14, 12, 26))
    d = ImageDraw.Draw(canvas)
    d.text((20, 18),
           "TILE EDITOR LIVE PREVIEW",
           fill=HEADING_FG, font=_font(28))
    status = (f"{len(doc.tiles)} tiles · "
              f"{len(sprites)} sprites · "
              f"{len(backgrounds)} backgrounds · "
              f"{len(doc.palettes)} palettes")
    d.text((20, 54), status, fill=(200, 200, 200), font=font_label)
    d.text((canvas_w - 280, 58),
           time.strftime("refreshed %H:%M:%S"),
           fill=(150, 150, 150), font=font_small)

    y = 90
    for _, img in sections:
        canvas.paste(img, (20, y))
        y += img.height + 20

    if doc.errors:
        _draw_banner(
            canvas,
            "⚠  " + str(len(doc.errors)) + " problem(s) — see list below:\n"
            + "\n".join(doc.errors[:8]),
            ERROR_BG,
        )

    return canvas


# ---------------------------------------------------------------------------
# Watcher
# ---------------------------------------------------------------------------
def _render_once(src: Path, out: Path, last_good: Optional[Image.Image]):
    try:
        text = src.read_text()
    except FileNotFoundError:
        print(f"  source not found: {src}")
        return last_good
    doc = parse(text)
    if doc.errors and last_good is not None:
        # Keep the last good canvas but overlay the errors so the pupil
        # still sees their previous work.
        canvas = last_good.copy()
        _draw_banner(
            canvas,
            "⚠  " + str(len(doc.errors)) + " problem(s):\n"
            + "\n".join(doc.errors[:8]),
            ERROR_BG,
        )
    else:
        canvas = render_preview(doc, src)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print(f"  wrote {out}  ({len(doc.errors)} error(s))")
    if not doc.errors:
        return canvas
    return last_good


def watch(src: Path, out: Path, interval: float = 0.25) -> None:
    print(f"Watching {src} -> {out}")
    print("Save the file to refresh. Ctrl+C to stop.")
    last_mtime = -1.0
    last_good: Optional[Image.Image] = None
    while True:
        try:
            mtime = src.stat().st_mtime
        except FileNotFoundError:
            mtime = -1.0
        if mtime != last_mtime:
            last_mtime = mtime
            last_good = _render_once(src, out, last_good)
        time.sleep(interval)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", type=Path, help="pupil tiles text file")
    ap.add_argument("-o", "--output", type=Path,
                    help="output PNG path (default: alongside source as preview.png)")
    ap.add_argument("--watch", action="store_true",
                    help="watch source file and refresh on save")
    args = ap.parse_args()

    out = args.output or args.source.with_name("preview.png")
    if args.watch:
        try:
            watch(args.source, out)
        except KeyboardInterrupt:
            print("\nstopped.")
        return 0

    # One-shot run: exit non-zero if there were errors.
    text = args.source.read_text()
    doc = parse(text)
    canvas = render_preview(doc, args.source)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    if doc.errors:
        print(f"{len(doc.errors)} error(s):", file=sys.stderr)
        for e in doc.errors:
            print(f"  {e}", file=sys.stderr)
        return 1
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
