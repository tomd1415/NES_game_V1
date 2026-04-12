#!/usr/bin/env python3
"""
png2chr.py - Convert indexed-color PNG images to NES CHR tile data.

Usage:
    python3 png2chr.py input.png output.chr
    python3 png2chr.py input.png output.chr --offset 0x40 --into existing.chr

The input PNG must be:
  - Indexed color mode (not RGB) - the script will attempt conversion if needed
  - Width and height must be multiples of 8
  - Maximum 4 colors (indices 0-3)

Options:
    --offset N     Place tiles starting at tile number N in the CHR file
                   (use 0x prefix for hex, e.g. --offset 0x40)
    --into FILE    Insert into an existing CHR file instead of creating new
"""

import sys
import os

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required. Install it with:")
    print("  pip install Pillow")
    sys.exit(1)


def png_to_chr_tiles(image_path):
    """
    Read an indexed PNG and convert it to a list of 16-byte NES tiles.
    Tiles are read left-to-right, top-to-bottom in 8x8 blocks.

    Returns a list of bytes objects, each 16 bytes (one NES tile).
    """
    img = Image.open(image_path)

    # Convert to indexed if needed
    if img.mode == 'RGBA' or img.mode == 'RGB':
        print(f"WARNING: Image is {img.mode} mode, not indexed.")
        print("Converting to indexed with 4 colors...")
        # Remove alpha if RGBA
        if img.mode == 'RGBA':
            # Treat fully transparent pixels as color 0
            alpha = img.split()[3]
            img = img.convert('RGB')
            img = img.quantize(colors=4)
            # Restore transparency as color 0
            # (This is approximate - best to use indexed mode in Aseprite)
        else:
            img = img.quantize(colors=4)

    if img.mode != 'P':
        print(f"ERROR: Image must be indexed color mode (got '{img.mode}')")
        print("In Aseprite: Sprite > Color Mode > Indexed")
        sys.exit(1)

    width, height = img.size
    if width % 8 != 0 or height % 8 != 0:
        print(f"ERROR: Image dimensions ({width}x{height}) must be multiples of 8")
        sys.exit(1)

    pixels = list(img.getdata())
    tiles_across = width // 8
    tiles_down = height // 8
    tiles = []

    for ty in range(tiles_down):
        for tx in range(tiles_across):
            # Extract this 8x8 tile
            plane0 = []
            plane1 = []
            for row in range(8):
                p0_byte = 0
                p1_byte = 0
                for col in range(8):
                    px = pixels[(ty * 8 + row) * width + (tx * 8 + col)]
                    # Clamp to 0-3 (in case palette has more entries)
                    px = px & 3
                    if px & 1:
                        p0_byte |= (0x80 >> col)
                    if px & 2:
                        p1_byte |= (0x80 >> col)
                plane0.append(p0_byte)
                plane1.append(p1_byte)
            tiles.append(bytes(plane0 + plane1))

    return tiles


def write_chr(tiles, output_path, offset=None, existing_chr=None):
    """
    Write tiles to a CHR file.

    If offset is given and existing_chr is provided, insert tiles at that
    position in the existing data. Otherwise, create a new file from the tiles.
    """
    if offset is not None and existing_chr:
        if not os.path.exists(existing_chr):
            print(f"ERROR: Existing CHR file not found: {existing_chr}")
            sys.exit(1)
        data = bytearray(open(existing_chr, 'rb').read())
        # Pad to at least the needed size
        needed = (offset + len(tiles)) * 16
        while len(data) < needed:
            data.extend(b'\x00' * 16)
        for i, tile in enumerate(tiles):
            pos = (offset + i) * 16
            data[pos:pos + 16] = tile
        # Pad to standard CHR size
        if len(data) <= 4096:
            data.extend(b'\x00' * (4096 - len(data)))
        elif len(data) <= 8192:
            data.extend(b'\x00' * (8192 - len(data)))
    else:
        data = bytearray()
        for tile in tiles:
            data.extend(tile)
        # Pad to 4KB boundary
        remainder = len(data) % 4096
        if remainder > 0:
            data.extend(b'\x00' * (4096 - remainder))

    with open(output_path, 'wb') as f:
        f.write(data)

    tile_range_start = offset if offset else 0
    tile_range_end = tile_range_start + len(tiles) - 1
    print(f"Wrote {len(tiles)} tiles to {output_path}")
    print(f"  Tile range: ${tile_range_start:02X} - ${tile_range_end:02X}")
    print(f"  File size: {len(data)} bytes")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    offset = None
    existing_chr = None

    i = 3
    while i < len(sys.argv):
        if sys.argv[i] == '--offset':
            if i + 1 >= len(sys.argv):
                print("ERROR: --offset requires a value")
                sys.exit(1)
            offset_str = sys.argv[i + 1]
            offset = int(offset_str, 16) if offset_str.startswith('0x') else int(offset_str)
            i += 2
        elif sys.argv[i] == '--into':
            if i + 1 >= len(sys.argv):
                print("ERROR: --into requires a file path")
                sys.exit(1)
            existing_chr = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] in ('-h', '--help'):
            print(__doc__)
            sys.exit(0)
        else:
            print(f"Unknown option: {sys.argv[i]}")
            sys.exit(1)

    if not os.path.exists(input_path):
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    print(f"Converting {input_path}...")
    tiles = png_to_chr_tiles(input_path)

    img = Image.open(input_path)
    w, h = img.size
    print(f"  Image: {w}x{h} pixels = {w//8}x{h//8} tiles ({len(tiles)} total)")

    write_chr(tiles, output_path, offset, existing_chr)
    print("Done!")


if __name__ == '__main__':
    main()
