#!/usr/bin/env python3
"""
Generate PNG assets for the lesson slide decks.

Outputs into ../slides/assets/. Re-runnable - overwrites existing files.

Images produced (for Step 1):
  nes_palette.png             - full NES master palette, 4x16 swatches
  player_sprite_frames.png    - all 4 player animation frames, large
  player_tile_layout.png      - annotated 2x4 tile diagram for the player
  jumpman_vs_player.png       - 1981 Jumpman layout vs. our 2026 player
  tile_planar_demo.png        - how an 8x8 tile becomes 16 bytes (bit planes)
  oam_sprite_diagram.png      - the 4 bytes of an OAM sprite entry
  nes_system_diagram.png      - CPU / OAM / PPU / TV boxes
"""

import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow required. pip install Pillow")
    sys.exit(1)


# Directories
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ASSETS_DIR = os.path.join(PROJECT_DIR, "slides", "assets")
os.makedirs(ASSETS_DIR, exist_ok=True)


# -----------------------------------------------------------------------------
# NES master palette (the 64 colour slots the PPU can output).
# This is the commonly-used FCEUX "default" flavour.
# -----------------------------------------------------------------------------
NES_PALETTE_RGB = [
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

# Colour theme used across every diagram (matches slide CSS)
BG_COLOR      = (20, 18, 32)
PANEL_COLOR   = (32, 28, 48)
BORDER_COLOR  = (200, 200, 220)
TEXT_COLOR    = (230, 230, 240)
ACCENT_RED    = (181, 49, 32)
ACCENT_BLUE   = (61, 59, 181)
ACCENT_GREEN  = (71, 209, 108)
ACCENT_YELLOW = (255, 216, 102)
ACCENT_CYAN   = (120, 220, 232)


def pick_font(size):
    """Return a PIL Font. Falls back through common installed fonts."""
    candidates = [
        "/usr/share/fonts/nerdfonts/JetBrainsMonoNerdFont-Bold.ttf",
        "/usr/share/fonts/nerdfonts/JetBrainsMonoNerdFont-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


# -----------------------------------------------------------------------------
# CHR decoder - reverse of the encoder in generate_chr.py
# -----------------------------------------------------------------------------
def decode_tile(tile_bytes):
    """Return an 8x8 grid of pixel values (0-3) from 16 bytes of NES tile data."""
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
            if p0 & bit: value |= 1
            if p1 & bit: value |= 2
            row_px.append(value)
        pixels.append(row_px)
    return pixels


def read_chr(path):
    with open(path, "rb") as f:
        return f.read()


def tile_at(chr_data, tile_index):
    """Return 16 bytes for tile N (tile 0 starts at byte 0, tile 1 at byte 16, ...)."""
    offset = tile_index * 16
    return chr_data[offset:offset + 16]


def render_sprite_frame(chr_data, tile_indices, palette_rgb, scale=12):
    """
    Render a player frame: 2 wide x 4 tall tiles arranged in a 16x32 grid.
    tile_indices: 8 tile numbers in reading order (L0, R0, L1, R1, L2, R2, L3, R3)
    palette_rgb: list of 4 RGB tuples for colours 0-3 (0 = transparent)
    """
    width = 16 * scale
    height = 32 * scale
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = img.load()

    for grid_row in range(4):
        for grid_col in range(2):
            tile_idx = tile_indices[grid_row * 2 + grid_col]
            tile = tile_at(chr_data, tile_idx)
            pixels = decode_tile(tile)
            for y in range(8):
                for x in range(8):
                    value = pixels[y][x]
                    if value == 0:
                        continue  # transparent
                    color = palette_rgb[value]
                    ox = (grid_col * 8 + x) * scale
                    oy = (grid_row * 8 + y) * scale
                    for dy in range(scale):
                        for dx in range(scale):
                            px[ox + dx, oy + dy] = color + (255,)
    return img


# -----------------------------------------------------------------------------
# Asset 1: NES master palette
# -----------------------------------------------------------------------------
def make_palette_chart(path):
    cell = 64
    gap = 6
    label_h = 18
    cols, rows = 16, 4
    width = cols * (cell + gap) + gap
    height = rows * (cell + gap + label_h) + gap + 60

    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_font = pick_font(28)
    label_font = pick_font(12)

    draw.text((gap, 12), "NES Master Palette  -  64 colour slots",
              fill=TEXT_COLOR, font=title_font)

    start_y = 56
    for idx, rgb in enumerate(NES_PALETTE_RGB):
        col = idx % 16
        row = idx // 16
        x = gap + col * (cell + gap)
        y = start_y + row * (cell + gap + label_h)
        draw.rectangle([x, y, x + cell, y + cell], fill=rgb, outline=BORDER_COLOR, width=1)
        label = f"${idx:02X}"
        bbox = draw.textbbox((0, 0), label, font=label_font)
        lw = bbox[2] - bbox[0]
        draw.text((x + (cell - lw) // 2, y + cell + 2), label,
                  fill=TEXT_COLOR, font=label_font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Asset 2: Player animation frames, scaled up
# -----------------------------------------------------------------------------
def make_player_frames(path, chr_path):
    chr_data = read_chr(chr_path)

    # These match the anim_tiles[] table in the game source
    frames = [
        [0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32],  # stand / frame 0
        [0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a],  # walk 1
        [0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32],  # stand (same as 0)
        [0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c],  # walk 2
    ]

    # Sprite palette from the game code (NES colour indices -> RGB)
    palette = [
        (0, 0, 0),                          # transparent (0)
        NES_PALETTE_RGB[0x30],              # color 1: white
        NES_PALETTE_RGB[0x27],              # color 2: orange
        NES_PALETTE_RGB[0x17],              # color 3: brown
    ]

    scale = 10
    frame_w = 16 * scale
    frame_h = 32 * scale
    pad = 40
    label_h = 40

    width = len(frames) * frame_w + (len(frames) + 1) * pad
    height = frame_h + pad * 2 + label_h

    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)
    font = pick_font(22)

    for i, tiles in enumerate(frames):
        fx = pad + i * (frame_w + pad)
        fy = pad
        # Panel background so transparent (colour 0) reads as the scene sky
        draw.rectangle([fx - 4, fy - 4, fx + frame_w + 4, fy + frame_h + 4],
                       fill=PANEL_COLOR, outline=ACCENT_CYAN, width=2)
        frame_img = render_sprite_frame(chr_data, tiles, palette, scale=scale)
        img.paste(frame_img, (fx, fy), frame_img)
        names = ["STAND", "WALK A", "STAND", "WALK B"]
        label = f"Frame {i}: {names[i]}"
        bbox = draw.textbbox((0, 0), label, font=font)
        lw = bbox[2] - bbox[0]
        draw.text((fx + (frame_w - lw) // 2, fy + frame_h + 8),
                  label, fill=ACCENT_YELLOW, font=font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Asset 3: Player tile layout diagram
# -----------------------------------------------------------------------------
def make_player_tile_layout(path, chr_path):
    chr_data = read_chr(chr_path)
    frame_tiles = [0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32]
    palette = [
        (0, 0, 0),
        NES_PALETTE_RGB[0x30],
        NES_PALETTE_RGB[0x27],
        NES_PALETTE_RGB[0x17],
    ]

    scale = 14
    tile_px = 8 * scale
    gap = 30
    pad = 60

    labels_l = ["Head L", "Body L", "Legs L", "Feet L"]
    labels_r = ["Head R", "Body R", "Legs R", "Feet R"]
    label_w = 120

    width = pad * 2 + label_w + tile_px * 2 + gap + label_w
    height = pad * 2 + tile_px * 4 + gap * 3 + 80

    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_font = pick_font(26)
    label_font = pick_font(18)

    draw.text((pad, 16),
              "Your Player = 8 sprites, 2 wide x 4 tall", fill=TEXT_COLOR, font=title_font)

    # Draw the 2x4 grid
    grid_x = pad + label_w
    grid_y = 70

    sprite_img = render_sprite_frame(chr_data, frame_tiles, palette, scale=scale)
    img.paste(sprite_img, (grid_x, grid_y), sprite_img)

    # Grid lines between tiles
    for row in range(5):
        y = grid_y + row * tile_px
        draw.line([(grid_x, y), (grid_x + tile_px * 2, y)], fill=ACCENT_CYAN, width=2)
    for col in range(3):
        x = grid_x + col * tile_px
        draw.line([(x, grid_y), (x, grid_y + tile_px * 4)], fill=ACCENT_CYAN, width=2)

    # Labels to the left and right of each row
    for row in range(4):
        cy = grid_y + row * tile_px + tile_px // 2 - 10
        draw.text((pad, cy), labels_l[row], fill=ACCENT_GREEN, font=label_font)
        draw.text((grid_x + tile_px * 2 + 20, cy), labels_r[row],
                  fill=ACCENT_GREEN, font=label_font)

    # Tile-number annotations underneath
    caption_y = grid_y + tile_px * 4 + 20
    captions = [
        f"Tiles:  {' '.join(f'${t:02X}' for t in frame_tiles)}",
        "Each tile is 8x8 pixels. 8 tiles = 16x32 pixel character.",
    ]
    for i, c in enumerate(captions):
        draw.text((pad, caption_y + i * 28), c, fill=TEXT_COLOR, font=label_font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Asset 4: Jumpman (1981) vs our player (2026)
# -----------------------------------------------------------------------------
def make_jumpman_vs_player(path, chr_path):
    """
    A schematic side-by-side: Jumpman's 2x2 layout vs. our 2x4 layout.
    We don't have Jumpman's actual CHR (and can't use it) - we render an
    approximation using coloured boxes to show the tile grid only.
    """
    scale = 22
    tile_px = 8 * scale

    col_w = tile_px * 2 + 40
    pad = 50
    label_h = 60
    bottom_h = 40

    width = pad * 3 + col_w * 2
    height = pad * 2 + label_h + tile_px * 4 + bottom_h + 40

    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_font = pick_font(26)
    heading_font = pick_font(22)
    small_font = pick_font(16)

    draw.text((pad, 16), "Same idea, same machine - 45 years apart",
              fill=TEXT_COLOR, font=title_font)

    # Left column: Jumpman 2x2 (schematic)
    lx = pad
    ly = label_h + 40
    draw.text((lx, ly - 34), "JUMPMAN, 1981", fill=ACCENT_RED, font=heading_font)
    draw.text((lx, ly - 12), "Donkey Kong arcade", fill=TEXT_COLOR, font=small_font)

    # Draw 2x2 grid centred vertically in the column height (tile_px * 4)
    grid_offset_y = tile_px  # visually centred
    for row in range(2):
        for col in range(2):
            x0 = lx + col * tile_px
            y0 = ly + grid_offset_y + row * tile_px
            # stylised body colours
            colours = [ACCENT_RED, ACCENT_RED,
                       (180, 150, 60), (180, 150, 60)]
            draw.rectangle([x0, y0, x0 + tile_px, y0 + tile_px],
                           fill=colours[row * 2 + col], outline=BORDER_COLOR, width=2)
            draw.text((x0 + 8, y0 + 8), f"tile", fill=BG_COLOR, font=small_font)

    draw.text((lx, ly + tile_px * 4 + 10), "2 wide x 2 tall  =  4 sprites",
              fill=ACCENT_YELLOW, font=heading_font)

    # Right column: our player (2x4, actual sprite)
    rx = pad * 2 + col_w
    draw.text((rx, ly - 34), "YOUR PLAYER, 2026", fill=ACCENT_GREEN, font=heading_font)
    draw.text((rx, ly - 12), "Same technique, taller", fill=TEXT_COLOR, font=small_font)

    chr_data = read_chr(chr_path)
    frame_tiles = [0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32]
    palette = [
        (0, 0, 0),
        NES_PALETTE_RGB[0x30],
        NES_PALETTE_RGB[0x27],
        NES_PALETTE_RGB[0x17],
    ]
    sprite_img = render_sprite_frame(chr_data, frame_tiles, palette, scale=scale)
    img.paste(sprite_img, (rx, ly), sprite_img)
    # Grid lines
    for row in range(5):
        y = ly + row * tile_px
        draw.line([(rx, y), (rx + tile_px * 2, y)], fill=ACCENT_CYAN, width=2)
    for col in range(3):
        x = rx + col * tile_px
        draw.line([(x, ly), (x, ly + tile_px * 4)], fill=ACCENT_CYAN, width=2)

    draw.text((rx, ly + tile_px * 4 + 10), "2 wide x 4 tall  =  8 sprites",
              fill=ACCENT_YELLOW, font=heading_font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Asset 5: The "two bit planes" encoding demo
# -----------------------------------------------------------------------------
def make_tile_planar_demo(path):
    """
    A single 8x8 tile shown three ways:
      - as coloured pixels (values 0-3)
      - bit plane 0 (the low bit of each pixel)
      - bit plane 1 (the high bit)
    """
    # Hand-picked pattern - includes all 4 pixel values so the demo makes sense
    pattern = [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [1, 2, 3, 3, 3, 3, 2, 1],
        [1, 2, 3, 2, 2, 3, 2, 1],
        [1, 2, 3, 3, 3, 3, 2, 1],
        [1, 2, 3, 2, 2, 3, 2, 1],
        [0, 1, 2, 2, 2, 2, 1, 0],
        [0, 0, 1, 1, 1, 1, 0, 0],
    ]

    # Colours for values 0-3 in the main view
    palette = [
        (30, 30, 50),      # 0 = dark (transparent in sprites, BG colour)
        NES_PALETTE_RGB[0x30],   # 1 white
        NES_PALETTE_RGB[0x27],   # 2 orange
        NES_PALETTE_RGB[0x17],   # 3 brown
    ]

    cell = 52
    gap = 36
    pad = 40
    title_h = 50
    subtitle_h = 28

    grid_w = 8 * cell
    width = pad * 4 + grid_w * 3
    height = pad * 2 + title_h + grid_w + subtitle_h + 240

    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_font = pick_font(26)
    heading_font = pick_font(20)
    cell_font = pick_font(22)
    small_font = pick_font(14)
    hex_font = pick_font(18)

    draw.text((pad, 14), "One tile = 16 bytes = two bit planes",
              fill=TEXT_COLOR, font=title_font)

    # Panel 1: pixel values
    x1 = pad
    y1 = title_h + pad
    draw.text((x1, y1 - 28), "Pixel values (0-3)", fill=ACCENT_GREEN, font=heading_font)
    for r in range(8):
        for c in range(8):
            v = pattern[r][c]
            draw.rectangle([x1 + c * cell, y1 + r * cell,
                            x1 + (c + 1) * cell, y1 + (r + 1) * cell],
                           fill=palette[v], outline=BORDER_COLOR, width=1)
            text = str(v)
            bbox = draw.textbbox((0, 0), text, font=cell_font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tcolor = BG_COLOR if v in (1, 2) else TEXT_COLOR
            draw.text((x1 + c * cell + (cell - tw) // 2,
                       y1 + r * cell + (cell - th) // 2 - 4),
                      text, fill=tcolor, font=cell_font)

    # Panel 2: plane 0 (low bits)
    x2 = x1 + grid_w + pad
    draw.text((x2, y1 - 28), "Plane 0 (low bit)", fill=ACCENT_CYAN, font=heading_font)
    for r in range(8):
        for c in range(8):
            v = pattern[r][c] & 1
            color = NES_PALETTE_RGB[0x30] if v else (30, 30, 50)
            draw.rectangle([x2 + c * cell, y1 + r * cell,
                            x2 + (c + 1) * cell, y1 + (r + 1) * cell],
                           fill=color, outline=BORDER_COLOR, width=1)
            text = str(v)
            bbox = draw.textbbox((0, 0), text, font=cell_font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tcolor = BG_COLOR if v else TEXT_COLOR
            draw.text((x2 + c * cell + (cell - tw) // 2,
                       y1 + r * cell + (cell - th) // 2 - 4),
                      text, fill=tcolor, font=cell_font)

    # Panel 3: plane 1 (high bits)
    x3 = x2 + grid_w + pad
    draw.text((x3, y1 - 28), "Plane 1 (high bit)", fill=ACCENT_YELLOW, font=heading_font)
    for r in range(8):
        for c in range(8):
            v = (pattern[r][c] >> 1) & 1
            color = NES_PALETTE_RGB[0x30] if v else (30, 30, 50)
            draw.rectangle([x3 + c * cell, y1 + r * cell,
                            x3 + (c + 1) * cell, y1 + (r + 1) * cell],
                           fill=color, outline=BORDER_COLOR, width=1)
            text = str(v)
            bbox = draw.textbbox((0, 0), text, font=cell_font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            tcolor = BG_COLOR if v else TEXT_COLOR
            draw.text((x3 + c * cell + (cell - tw) // 2,
                       y1 + r * cell + (cell - th) // 2 - 4),
                      text, fill=tcolor, font=cell_font)

    # Hex byte rows below plane 0 and plane 1
    hex_y = y1 + grid_w + 14
    draw.text((x2, hex_y), "bytes 0-7:", fill=ACCENT_CYAN, font=small_font)
    hex_y2 = hex_y + 18
    p0_bytes = []
    for r in range(8):
        b = 0
        for c in range(8):
            if pattern[r][c] & 1:
                b |= 0x80 >> c
        p0_bytes.append(b)
    draw.text((x2, hex_y2), "  ".join(f"${b:02X}" for b in p0_bytes),
              fill=TEXT_COLOR, font=hex_font)

    draw.text((x3, hex_y), "bytes 8-15:", fill=ACCENT_YELLOW, font=small_font)
    p1_bytes = []
    for r in range(8):
        b = 0
        for c in range(8):
            if (pattern[r][c] >> 1) & 1:
                b |= 0x80 >> c
        p1_bytes.append(b)
    draw.text((x3, hex_y2), "  ".join(f"${b:02X}" for b in p1_bytes),
              fill=TEXT_COLOR, font=hex_font)

    # Formula explainer at the bottom
    explain_y = hex_y2 + 80
    big_font = pick_font(24)
    draw.text((pad, explain_y),
              "pixel  =  (plane_1_bit  <<  1)  OR  plane_0_bit",
              fill=ACCENT_GREEN, font=big_font)
    draw.text((pad, explain_y + 40),
              "So plane1=1 plane0=0 -> pixel 2.   plane1=1 plane0=1 -> pixel 3.",
              fill=TEXT_COLOR, font=heading_font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Asset 6: OAM sprite - 4 bytes diagram
# -----------------------------------------------------------------------------
def make_oam_diagram(path):
    box_w = 260
    box_h = 130
    gap = 30
    pad = 50
    title_h = 70
    caption_h = 80

    width = pad * 2 + box_w * 4 + gap * 3
    height = title_h + box_h + caption_h + pad

    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_font = pick_font(28)
    box_label_font = pick_font(22)
    box_val_font = pick_font(26)
    small_font = pick_font(16)

    draw.text((pad, 16), "One OAM sprite = 4 bytes", fill=TEXT_COLOR, font=title_font)

    boxes = [
        ("BYTE 0", "Y position", ACCENT_RED),
        ("BYTE 1", "Tile number", ACCENT_YELLOW),
        ("BYTE 2", "Attributes", ACCENT_GREEN),
        ("BYTE 3", "X position", ACCENT_CYAN),
    ]

    y = title_h
    for i, (label, desc, color) in enumerate(boxes):
        x = pad + i * (box_w + gap)
        draw.rectangle([x, y, x + box_w, y + box_h], fill=PANEL_COLOR, outline=color, width=3)
        bbox = draw.textbbox((0, 0), label, font=box_label_font)
        lw = bbox[2] - bbox[0]
        draw.text((x + (box_w - lw) // 2, y + 14), label, fill=color, font=box_label_font)
        bbox = draw.textbbox((0, 0), desc, font=box_val_font)
        dw = bbox[2] - bbox[0]
        draw.text((x + (box_w - dw) // 2, y + 60), desc, fill=TEXT_COLOR, font=box_val_font)

    caption_y = y + box_h + 20
    draw.text((pad, caption_y),
              "64 sprites on screen. 8 sprites per horizontal line (else they flicker).",
              fill=TEXT_COLOR, font=box_label_font)
    draw.text((pad, caption_y + 32),
              "Your player = 8 sprites = 1/8 of everything on screen.",
              fill=ACCENT_YELLOW, font=box_label_font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Asset 7: NES system diagram
# -----------------------------------------------------------------------------
def make_system_diagram(path):
    width = 1400
    height = 520
    img = Image.new("RGB", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(img)

    title_font = pick_font(30)
    box_title_font = pick_font(26)
    box_body_font = pick_font(18)
    arrow_font = pick_font(22)

    draw.text((40, 20), "The NES, in boxes", fill=TEXT_COLOR, font=title_font)

    # Four boxes across the middle: CPU, OAM (RAM), PPU, TV
    box_w = 260
    box_h = 220
    pad = 40
    start_x = 60
    start_y = 110
    gap = (width - pad * 2 - box_w * 4) // 3

    boxes = [
        ("CPU", "Ricoh 2A03\n6502 family\n1.79 MHz\nruns your C code",
         ACCENT_RED),
        ("OAM", "256 bytes of\nsprite list\n64 sprites x\n4 bytes each",
         ACCENT_YELLOW),
        ("PPU", "Ricoh 2C02\nits own chip\nits own memory\ndraws the screen",
         ACCENT_GREEN),
        ("TV", "CRT monitor\n256 x 240 px\n60 frames/sec\nwhere it all appears",
         ACCENT_CYAN),
    ]

    for i, (title, body, color) in enumerate(boxes):
        x = start_x + i * (box_w + gap)
        draw.rectangle([x, start_y, x + box_w, start_y + box_h],
                       fill=PANEL_COLOR, outline=color, width=4)
        bbox = draw.textbbox((0, 0), title, font=box_title_font)
        tw = bbox[2] - bbox[0]
        draw.text((x + (box_w - tw) // 2, start_y + 14),
                  title, fill=color, font=box_title_font)
        lines = body.split("\n")
        for j, line in enumerate(lines):
            lbbox = draw.textbbox((0, 0), line, font=box_body_font)
            lw = lbbox[2] - lbbox[0]
            draw.text((x + (box_w - lw) // 2, start_y + 70 + j * 28),
                      line, fill=TEXT_COLOR, font=box_body_font)

        # Arrow to next box
        if i < len(boxes) - 1:
            arrow_x1 = x + box_w + 8
            arrow_x2 = x + box_w + gap - 8
            arrow_y = start_y + box_h // 2
            draw.line([(arrow_x1, arrow_y), (arrow_x2, arrow_y)],
                      fill=BORDER_COLOR, width=3)
            # arrowhead
            draw.polygon([(arrow_x2, arrow_y),
                          (arrow_x2 - 12, arrow_y - 8),
                          (arrow_x2 - 12, arrow_y + 8)],
                         fill=BORDER_COLOR)

    draw.text((60, start_y + box_h + 50),
              "Your C code runs on the CPU.  The CPU talks to the PPU by writing to memory.",
              fill=TEXT_COLOR, font=box_body_font)
    draw.text((60, start_y + box_h + 80),
              "The PPU doesn't care about your code - it just reads from the memory and draws.",
              fill=ACCENT_YELLOW, font=box_body_font)

    img.save(path)
    print(f"  {os.path.basename(path)}")


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    print("Generating slide assets in:", ASSETS_DIR)

    # Use Step 3's CHR file (has everything we need for sprite renders)
    chr_path = os.path.join(PROJECT_DIR, "steps", "Step_3_Enemies_And_Items",
                            "assets", "sprites", "game.chr")

    if not os.path.exists(chr_path):
        # Fall back to Step 1's raw sprite file
        chr_path = os.path.join(PROJECT_DIR, "assets", "sprites", "walk1.chr")
    if not os.path.exists(chr_path):
        print(f"ERROR: cannot find a CHR file. Run generate_chr.py first.")
        sys.exit(1)

    make_palette_chart(os.path.join(ASSETS_DIR, "nes_palette.png"))
    make_player_frames(os.path.join(ASSETS_DIR, "player_sprite_frames.png"), chr_path)
    make_player_tile_layout(os.path.join(ASSETS_DIR, "player_tile_layout.png"), chr_path)
    make_jumpman_vs_player(os.path.join(ASSETS_DIR, "jumpman_vs_player.png"), chr_path)
    make_tile_planar_demo(os.path.join(ASSETS_DIR, "tile_planar_demo.png"))
    make_oam_diagram(os.path.join(ASSETS_DIR, "oam_sprite_diagram.png"))
    make_system_diagram(os.path.join(ASSETS_DIR, "nes_system_diagram.png"))

    print("\nDone. Assets written to slides/assets/")


if __name__ == "__main__":
    main()
