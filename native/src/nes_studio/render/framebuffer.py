"""Render project data into real NES pixels.

This is what the app was missing. Previously the WORLD canvas filled each cell
with `NES_COLOURS[value % 4]` — a four-colour placebo keyed off the *tile index*
— so it never drew the pixel art made in TILES and never applied the palettes
from PALS. Tile and sprite thumbnails used the same placeholder ramp.

Hardware rules honoured here, none of which the old code honoured:

* A background pixel of value 0 is the **universal backdrop**, shared by all four
  background palettes. Only values 1-3 come from the palette's own slots.
* A sprite pixel of value 0 is **transparent**.

Images are `Format_RGBX8888`: the alpha byte is padding and the image is opaque.
Using `Format_RGBA8888` with a zero alpha byte yields a fully transparent image —
the same trap the embedded emulator hits (see `native/nes_core/README.md`).
"""

from __future__ import annotations

from PySide6.QtGui import QImage

from ..core.project_document import ProjectDocument
from .palette import nes_rgb

SCREEN_WIDTH = 256
SCREEN_HEIGHT = 240
TILE = 8

# One RGBX pixel, packed for direct insertion into the framebuffer bytearray.
_TRANSPARENT = b"\x00\x00\x00\x00"


def _pack(colour: int) -> bytes:
    red, green, blue = nes_rgb(colour)
    return bytes((red, green, blue, 0xFF))


def _background_ramp(document: ProjectDocument, palette: int) -> tuple[bytes, ...]:
    """The four colours a background tile can use, in pixel-value order."""

    backdrop = _pack(document.universal_background)
    slots = document.background_palette(palette & 3)
    return (backdrop, _pack(slots[0]), _pack(slots[1]), _pack(slots[2]))


def _sprite_ramp(document: ProjectDocument, palette: int) -> tuple[bytes, ...]:
    """The four colours a sprite tile can use. Value 0 is transparent."""

    slots = document.sprite_palette(palette & 3)
    return (_TRANSPARENT, _pack(slots[0]), _pack(slots[1]), _pack(slots[2]))


def _image_from(buffer: bytearray, width: int, height: int) -> QImage:
    # QImage does not take ownership of the buffer, so copy() detaches it before
    # the bytearray goes out of scope.
    return QImage(bytes(buffer), width, height, width * 4, QImage.Format.Format_RGBX8888).copy()


def render_nametable(
    document: ProjectDocument, screen_x: int = 0, screen_y: int = 0
) -> QImage:
    """Render one 256x240 NES screen exactly as the PPU would draw it."""

    tiles = document.world_tiles(screen_x, screen_y)
    palettes = document.world_palettes(screen_x, screen_y)

    ramps = [_background_ramp(document, index) for index in range(4)]
    stride = SCREEN_WIDTH * 4
    buffer = bytearray(stride * SCREEN_HEIGHT)

    # A screen has 960 cells but far fewer distinct (tile, palette) pairs, so
    # rasterise each pair once and blit the cached rows.
    cache: dict[tuple[int, int], list[bytes]] = {}

    for row_index, tile_row in enumerate(tiles):
        for column_index, tile_index in enumerate(tile_row):
            palette_index = palettes[row_index][column_index] & 3
            key = (tile_index, palette_index)
            rows = cache.get(key)
            if rows is None:
                ramp = ramps[palette_index]
                pixels = document.background_tile_pixels(tile_index)
                rows = [
                    b"".join(ramp[int(value) & 3] for value in pixel_row[:TILE])
                    for pixel_row in pixels[:TILE]
                ]
                cache[key] = rows

            left = column_index * TILE * 4
            top = row_index * TILE
            for offset, packed_row in enumerate(rows):
                start = (top + offset) * stride + left
                buffer[start : start + TILE * 4] = packed_row

    return _image_from(buffer, SCREEN_WIDTH, SCREEN_HEIGHT)


def render_background_tile(
    document: ProjectDocument, tile_index: int, palette: int = 0
) -> QImage:
    """Render a single 8x8 background tile through a real palette."""

    ramp = _background_ramp(document, palette)
    pixels = document.background_tile_pixels(tile_index)
    stride = TILE * 4
    buffer = bytearray(stride * TILE)
    for row_index, pixel_row in enumerate(pixels[:TILE]):
        packed = b"".join(ramp[int(value) & 3] for value in pixel_row[:TILE])
        buffer[row_index * stride : row_index * stride + stride] = packed
    return _image_from(buffer, TILE, TILE)


def render_sprite_tile(
    document: ProjectDocument, tile_index: int, palette: int = 0
) -> QImage:
    """Render a single 8x8 sprite tile. Pixel value 0 stays transparent."""

    ramp = _sprite_ramp(document, palette)
    pixels = document.sprite_tile_pixels(tile_index)
    stride = TILE * 4
    buffer = bytearray(stride * TILE)
    for row_index, pixel_row in enumerate(pixels[:TILE]):
        packed = b"".join(ramp[int(value) & 3] for value in pixel_row[:TILE])
        buffer[row_index * stride : row_index * stride + stride] = packed
    image = QImage(
        bytes(buffer), TILE, TILE, stride, QImage.Format.Format_RGBA8888
    ).copy()
    return image


def render_sprite(document: ProjectDocument, sprite: dict) -> QImage:
    """Render a whole metasprite from its cell grid, honouring flips and `empty`."""

    cells = sprite.get("cells")
    if not isinstance(cells, list) or not cells:
        return QImage(TILE, TILE, QImage.Format.Format_RGBA8888)

    height = len(cells)
    width = max((len(row) if isinstance(row, list) else 0) for row in cells) or 1
    pixel_width = width * TILE
    pixel_height = height * TILE
    stride = pixel_width * 4
    buffer = bytearray(stride * pixel_height)

    for cell_y, row in enumerate(cells):
        if not isinstance(row, list):
            continue
        for cell_x, cell in enumerate(row):
            if not isinstance(cell, dict) or cell.get("empty"):
                continue
            ramp = _sprite_ramp(document, int(cell.get("palette", 0)))
            pixels = document.sprite_tile_pixels(int(cell.get("tile", 0)))
            flip_h = bool(cell.get("flipH"))
            flip_v = bool(cell.get("flipV"))

            for row_index in range(TILE):
                source_row = pixels[TILE - 1 - row_index if flip_v else row_index]
                values = list(source_row[:TILE])
                if flip_h:
                    values.reverse()
                packed = b"".join(ramp[int(value) & 3] for value in values)
                start = (cell_y * TILE + row_index) * stride + cell_x * TILE * 4
                buffer[start : start + TILE * 4] = packed

    return QImage(
        bytes(buffer), pixel_width, pixel_height, stride, QImage.Format.Format_RGBA8888
    ).copy()


def attribute_conflicts(
    document: ProjectDocument, screen_x: int = 0, screen_y: int = 0
) -> list[tuple[int, int]]:
    """Find 2x2 quadrants whose four cells disagree on palette.

    The NES stores one palette per 2x2 tile quadrant, so a screen that paints
    two palettes inside one quadrant cannot render as drawn. The web surfaces
    this on-canvas before the build; this is the data behind that overlay.

    Returns the top-left cell coordinate of each conflicting quadrant.
    """

    palettes = document.world_palettes(screen_x, screen_y)
    conflicts: list[tuple[int, int]] = []
    for top in range(0, len(palettes) - 1, 2):
        row_a, row_b = palettes[top], palettes[top + 1]
        for left in range(0, len(row_a) - 1, 2):
            quadrant = {row_a[left], row_a[left + 1], row_b[left], row_b[left + 1]}
            if len(quadrant) > 1:
                conflicts.append((left, top))
    return conflicts
