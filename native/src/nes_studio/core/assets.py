"""Read and write the NES's native asset formats.

`.chr`, `.pal` and `.nam` are what every other NES tool speaks — YY-CHR, NEXXT,
Tiled, a hex editor. Being unable to import or export them means a pupil's work
cannot leave the Studio, and art made anywhere else cannot come in.

All pure functions over bytes and the project state. No Qt, so they are testable
without a display and shareable with the web target.
"""

from __future__ import annotations

from dataclasses import dataclass

from .project_document import ProjectDocument

TILE = 8
#: 2 bits per pixel, stored as two 8-byte planes: the low bits, then the high.
BYTES_PER_TILE = 16
TILES_PER_BANK = 256
CHR_BANK_BYTES = BYTES_PER_TILE * TILES_PER_BANK  # 4096

#: A nametable is 32x30 tile indices, then 64 bytes of 2-bit attribute data.
NAMETABLE_TILES = 32 * 30  # 960
ATTRIBUTE_BYTES = 64
NAM_BYTES = NAMETABLE_TILES + ATTRIBUTE_BYTES  # 1024

#: The PPU's palette memory: 16 background entries, then 16 sprite entries.
PAL_BYTES = 32


class AssetFormatError(ValueError):
    """The file is not the format it claims to be."""


# ---- CHR: tile pixels ----------------------------------------------------


def tile_to_chr(pixels: list[list[int]]) -> bytes:
    """One 8x8 tile of 0..3 values into 16 bytes of 2bpp planar CHR."""

    low = bytearray(TILE)
    high = bytearray(TILE)
    for row in range(TILE):
        source = pixels[row] if row < len(pixels) else []
        for column in range(TILE):
            value = int(source[column]) & 3 if column < len(source) else 0
            bit = 7 - column
            low[row] |= (value & 1) << bit
            high[row] |= ((value >> 1) & 1) << bit
    return bytes(low) + bytes(high)


def chr_to_tile(data: bytes) -> list[list[int]]:
    """16 bytes of 2bpp planar CHR back into an 8x8 grid of 0..3 values."""

    if len(data) < BYTES_PER_TILE:
        raise AssetFormatError(f"A CHR tile is {BYTES_PER_TILE} bytes, got {len(data)}")
    pixels = []
    for row in range(TILE):
        low, high = data[row], data[row + TILE]
        pixels.append(
            [((low >> (7 - column)) & 1) | (((high >> (7 - column)) & 1) << 1) for column in range(TILE)]
        )
    return pixels


def export_chr(document: ProjectDocument, bank: str) -> bytes:
    """The whole 256-tile bank as a 4 KB CHR file."""

    read = (
        document.sprite_tile_pixels if bank == "sprite" else document.background_tile_pixels
    )
    return b"".join(tile_to_chr(read(index)) for index in range(TILES_PER_BANK))


def import_chr(document: ProjectDocument, bank: str, data: bytes) -> int:
    """Load a CHR file into a bank. Returns how many tiles were replaced.

    Short files are allowed — a pupil exporting eight tiles from YY-CHR gets
    eight tiles back, and the rest of the bank is left alone.
    """

    if not data or len(data) % BYTES_PER_TILE:
        raise AssetFormatError(
            f"A CHR file is a whole number of {BYTES_PER_TILE}-byte tiles; "
            f"this one is {len(data)} bytes"
        )
    count = min(len(data) // BYTES_PER_TILE, TILES_PER_BANK)
    write = (
        document.set_sprite_tile_pixel if bank == "sprite" else document.set_background_tile_pixel
    )
    for index in range(count):
        pixels = chr_to_tile(data[index * BYTES_PER_TILE : (index + 1) * BYTES_PER_TILE])
        for row in range(TILE):
            for column in range(TILE):
                write(index, column, row, pixels[row][column])
    return count


# ---- PAL: the palettes ---------------------------------------------------


def export_pal(document: ProjectDocument) -> bytes:
    """The PPU's 32 palette bytes: 4 background palettes, then 4 sprite ones.

    Slot 0 of each background palette is the universal backdrop, which is what
    the hardware actually does — every mirror of $3F00 holds the same colour.
    """

    values = bytearray()
    backdrop = document.universal_background & 0x3F
    for palette in range(4):
        values.append(backdrop)
        values.extend(colour & 0x3F for colour in document.background_palette(palette))
    for palette in range(4):
        values.append(backdrop)
        values.extend(colour & 0x3F for colour in document.sprite_palette(palette))
    return bytes(values)


def import_pal(document: ProjectDocument, data: bytes) -> int:
    """Load a 32-byte (or 16-byte background-only) .pal file. Returns entries set."""

    if len(data) not in {16, PAL_BYTES}:
        raise AssetFormatError(
            f"A .pal file is 16 or {PAL_BYTES} bytes (4 or 8 palettes of 4); "
            f"this one is {len(data)} bytes"
        )
    document.set_universal_background(data[0] & 0x3F)
    entries = 1
    for palette in range(4):
        for slot in range(3):
            document.set_background_palette_slot(palette, slot, data[palette * 4 + slot + 1] & 0x3F)
            entries += 1
    if len(data) == PAL_BYTES:
        for palette in range(4):
            for slot in range(3):
                document.set_sprite_palette_slot(
                    palette, slot, data[16 + palette * 4 + slot + 1] & 0x3F
                )
                entries += 1
    return entries


# ---- NAM: one screen -----------------------------------------------------


@dataclass(frozen=True)
class Nametable:
    """One screen: 960 tile indices and the 64 attribute bytes over them."""

    tiles: list[list[int]]
    palettes: list[list[int]]


def _attribute_bytes(palettes: list[list[int]]) -> bytes:
    """Pack a 32x30 palette grid into the PPU's 64 attribute bytes.

    Each byte covers a 4x4-tile area as four 2-bit 2x2 quadrants. A quadrant
    that disagrees with itself cannot be represented — the top-left cell wins,
    which is exactly what the PPU shows, and what the conflict overlay warns
    about.
    """

    data = bytearray(ATTRIBUTE_BYTES)
    for index in range(ATTRIBUTE_BYTES):
        block_x = (index % 8) * 4
        block_y = (index // 8) * 4
        value = 0
        for quadrant, (dx, dy) in enumerate(((0, 0), (2, 0), (0, 2), (2, 2))):
            x, y = block_x + dx, block_y + dy
            palette = palettes[y][x] & 3 if y < len(palettes) and x < len(palettes[y]) else 0
            value |= palette << (quadrant * 2)
        data[index] = value
    return bytes(data)


def _palettes_from_attributes(data: bytes) -> list[list[int]]:
    palettes = [[0] * 32 for _ in range(30)]
    for index in range(min(ATTRIBUTE_BYTES, len(data))):
        block_x = (index % 8) * 4
        block_y = (index // 8) * 4
        value = data[index]
        for quadrant, (dx, dy) in enumerate(((0, 0), (2, 0), (0, 2), (2, 2))):
            palette = (value >> (quadrant * 2)) & 3
            for row in range(2):
                for column in range(2):
                    x, y = block_x + dx + column, block_y + dy + row
                    if x < 32 and y < 30:
                        palettes[y][x] = palette
    return palettes


def export_nam(document: ProjectDocument, screen_x: int = 0, screen_y: int = 0) -> bytes:
    """One screen as a 1 KB .nam file: 960 tile bytes, then 64 attribute bytes."""

    tiles = document.world_tiles(screen_x, screen_y)
    palettes = document.world_palettes(screen_x, screen_y)
    data = bytearray()
    for row in range(30):
        data.extend(int(tiles[row][column]) & 0xFF for column in range(32))
    data.extend(_attribute_bytes(palettes))
    return bytes(data)


def parse_nam(data: bytes) -> Nametable:
    if len(data) not in {NAMETABLE_TILES, NAM_BYTES}:
        raise AssetFormatError(
            f"A .nam file is {NAMETABLE_TILES} or {NAM_BYTES} bytes; "
            f"this one is {len(data)} bytes"
        )
    tiles = [[data[row * 32 + column] for column in range(32)] for row in range(30)]
    palettes = (
        _palettes_from_attributes(data[NAMETABLE_TILES:])
        if len(data) == NAM_BYTES
        else [[0] * 32 for _ in range(30)]
    )
    return Nametable(tiles=tiles, palettes=palettes)


def import_nam(
    document: ProjectDocument, data: bytes, screen_x: int = 0, screen_y: int = 0
) -> int:
    """Load a screen. Returns the number of cells written."""

    screen = parse_nam(data)
    origin_x, origin_y = screen_x * 32, screen_y * 30
    written = 0
    for row in range(30):
        for column in range(32):
            document.set_world_tile(origin_x + column, origin_y + row, screen.tiles[row][column])
            document.set_world_palette(
                origin_x + column, origin_y + row, screen.palettes[row][column]
            )
            written += 1
    return written
