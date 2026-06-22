"""NES 2-bit planar tile codec — shared by generate_chr.py, png2chr.py and
generate_slide_assets.py so the bit-twiddling lives in one place.

Dependency-free (no Pillow) on purpose, so importing it adds nothing to a
caller's dependency footprint.

An NES tile is 8x8 pixels, each pixel a 2-bit colour index (0-3), stored as two
bitplanes of 8 bytes each (16 bytes total): plane 0 holds bit 0 of every pixel,
plane 1 holds bit 1.  Within a byte the MSB (0x80) is the leftmost column.
"""


def pixels_to_tile(rows):
    """Convert 8 rows of 8 pixel values (0-3) into 16 bytes of NES tile data."""
    assert len(rows) == 8
    plane0 = []
    plane1 = []
    for row in rows:
        assert len(row) == 8
        p0 = 0
        p1 = 0
        for bit in range(8):
            pixel = row[bit]
            if pixel & 1:
                p0 |= (0x80 >> bit)
            if pixel & 2:
                p1 |= (0x80 >> bit)
        plane0.append(p0)
        plane1.append(p1)
    return bytes(plane0 + plane1)


def decode_tile(tile_bytes):
    """Return an 8x8 grid of pixel values (0-3) from 16 bytes of NES tile data.

    Inverse of pixels_to_tile()."""
    plane0 = tile_bytes[:8]
    plane1 = tile_bytes[8:16]
    pixels = []
    for row in range(8):
        row_px = []
        p0 = plane0[row]
        p1 = plane1[row]
        for col in range(8):
            bit = 0x80 >> col
            value = 0
            if p0 & bit:
                value |= 1
            if p1 & bit:
                value |= 2
            row_px.append(value)
        pixels.append(row_px)
    return pixels
