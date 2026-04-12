#!/usr/bin/env python3
"""
Generate NES CHR tile data for the Zelda 2-inspired game.

NES tile format:
  Each tile is 8x8 pixels, 2 bits per pixel (4 colors: 0-3).
  Stored as 16 bytes: 8 bytes for bit plane 0, then 8 bytes for bit plane 1.
  Color = (plane1_bit << 1) | plane0_bit

  Color 0 = transparent (sprites) or background color
  Colors 1-3 = from the assigned palette
"""

import os
import struct

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

def empty_tile():
    """All transparent / color 0."""
    return pixels_to_tile([[0]*8 for _ in range(8)])

def solid_tile(color=1):
    """Completely filled with one color."""
    return pixels_to_tile([[color]*8 for _ in range(8)])

# =========================================================================
# BACKGROUND TILES (go in pattern table 1, second 4KB of CHR)
# =========================================================================

def tile_sky():
    """Empty sky - all color 0."""
    return empty_tile()

def tile_ground_top():
    """Ground surface - grass-like top edge.
    Color 2 = grass/surface, Color 1 = dirt underneath."""
    return pixels_to_tile([
        [2,2,2,2,2,2,2,2],
        [2,2,2,2,2,2,2,2],
        [1,2,1,2,2,1,2,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
    ])

def tile_ground_fill():
    """Underground fill - dirt/stone pattern.
    Color 1 = main, Color 3 = darker accent."""
    return pixels_to_tile([
        [1,1,1,1,1,1,1,1],
        [1,1,1,3,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,3,1],
        [1,1,1,1,1,1,1,1],
        [3,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,3,1,1,1],
    ])

def tile_brick():
    """Brick block - Zelda 2 style dungeon brick.
    Color 1 = brick face, Color 3 = mortar lines."""
    return pixels_to_tile([
        [3,3,3,3,3,3,3,3],
        [1,1,1,3,1,1,1,3],
        [1,1,1,3,1,1,1,3],
        [3,3,3,3,3,3,3,3],
        [1,1,3,1,1,1,3,1],
        [1,1,3,1,1,1,3,1],
        [3,3,3,3,3,3,3,3],
        [1,1,1,3,1,1,1,3],
    ])

def tile_platform_top():
    """Platform surface - a solid surface to stand on.
    Color 2 = highlight, Color 1 = main, Color 3 = shadow."""
    return pixels_to_tile([
        [2,2,2,2,2,2,2,2],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [3,1,1,1,1,1,1,3],
        [3,1,1,1,1,1,1,3],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [3,3,3,3,3,3,3,3],
    ])

def tile_platform_bottom():
    """Platform underside - shadow/support.
    Color 3 = shadow, Color 1 = support."""
    return pixels_to_tile([
        [1,1,1,1,1,1,1,1],
        [3,1,1,3,3,1,1,3],
        [3,1,1,3,3,1,1,3],
        [3,1,1,3,3,1,1,3],
        [3,1,1,3,3,1,1,3],
        [3,1,1,3,3,1,1,3],
        [3,3,3,3,3,3,3,3],
        [0,0,0,0,0,0,0,0],
    ])

def tile_cloud_left():
    """Left side of a cloud. Color 1 = cloud body."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,1,1,1],
        [0,0,0,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0],
    ])

def tile_cloud_right():
    """Right side of a cloud."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [1,1,1,0,0,0,0,0],
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def tile_castle_block():
    """Castle wall block - for Zelda 2 palace style.
    Color 1 = stone, Color 3 = cracks/lines."""
    return pixels_to_tile([
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,3,1,1],
        [1,1,3,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,3,1,1,1],
        [1,3,1,1,1,1,1,1],
        [1,1,1,1,1,1,3,1],
        [1,1,1,1,1,1,1,1],
    ])

def tile_door():
    """Door/entrance tile. Color 3 = dark interior, Color 1 = frame."""
    return pixels_to_tile([
        [1,1,1,1,1,1,1,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
    ])

def tile_door_top():
    """Door arch top. Color 2 = arch highlight."""
    return pixels_to_tile([
        [0,0,1,1,1,1,0,0],
        [0,1,2,2,2,2,1,0],
        [1,2,3,3,3,3,2,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
        [1,3,3,3,3,3,3,1],
    ])

# =========================================================================
# SPRITE TILES (go in pattern table 0, first 4KB of CHR)
# These get added AFTER the existing player tiles
# =========================================================================

def sprite_slime_top_left():
    """Slime enemy - top left. Simple blob enemy.
    Color 1 = body, Color 2 = eyes, Color 3 = highlight."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [0,0,0,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,1,3,1,2,2,1,1],
        [1,1,3,1,2,2,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
    ])

def sprite_slime_top_right():
    """Slime enemy - top right."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,0],
        [1,1,2,2,1,3,1,0],
        [1,1,2,2,1,3,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
    ])

def sprite_slime_bottom_left():
    """Slime enemy - bottom left."""
    return pixels_to_tile([
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,0,0,1,1,1,1,1],
        [0,0,0,0,1,1,1,1],
        [0,0,0,0,0,0,0,0],
    ])

def sprite_slime_bottom_right():
    """Slime enemy - bottom right."""
    return pixels_to_tile([
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def sprite_skeleton_head_left():
    """Skeleton enemy head - left half. Zelda 2 style.
    Color 1 = bone, Color 2 = eyes, Color 3 = shadow."""
    return pixels_to_tile([
        [0,0,0,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,1,1,2,2,1,1,1],
        [0,1,1,2,2,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,0,1,1,3,1,3,1],
        [0,0,0,1,1,1,1,1],
    ])

def sprite_skeleton_head_right():
    """Skeleton enemy head - right half."""
    return pixels_to_tile([
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,0],
        [1,1,1,2,2,1,1,0],
        [1,1,1,2,2,1,1,0],
        [1,1,1,1,1,1,1,0],
        [1,3,1,3,1,1,0,0],
        [1,1,1,1,1,0,0,0],
    ])

def sprite_skeleton_body_left():
    """Skeleton body - left half. Ribs and spine."""
    return pixels_to_tile([
        [0,0,0,0,1,1,1,1],
        [0,0,0,1,3,1,1,1],
        [0,0,1,1,3,1,1,1],
        [0,0,0,1,3,1,1,1],
        [0,0,1,1,3,1,1,1],
        [0,0,0,1,3,1,1,1],
        [0,0,0,0,1,1,1,1],
        [0,0,0,1,1,0,1,1],
    ])

def sprite_skeleton_body_right():
    """Skeleton body - right half."""
    return pixels_to_tile([
        [1,1,1,1,0,0,0,0],
        [1,1,1,3,1,0,0,0],
        [1,1,1,3,1,1,0,0],
        [1,1,1,3,1,0,0,0],
        [1,1,1,3,1,1,0,0],
        [1,1,1,3,1,0,0,0],
        [1,1,1,1,0,0,0,0],
        [1,1,0,1,1,0,0,0],
    ])

def sprite_gem():
    """Collectible gem/crystal - 1 tile.
    Color 1 = gem body, Color 2 = shine, Color 3 = shadow."""
    return pixels_to_tile([
        [0,0,0,2,1,0,0,0],
        [0,0,2,1,1,1,0,0],
        [0,2,1,1,1,1,1,0],
        [2,1,1,1,1,1,3,1],
        [1,1,1,1,1,3,3,1],
        [0,1,1,1,3,3,1,0],
        [0,0,1,3,3,1,0,0],
        [0,0,0,1,1,0,0,0],
    ])

def sprite_heart():
    """Heart pickup - 1 tile.
    Color 1 = heart body, Color 2 = highlight, Color 3 = shadow."""
    return pixels_to_tile([
        [0,1,1,0,0,1,1,0],
        [1,2,1,1,1,2,1,1],
        [1,2,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,0,0],
        [0,0,0,1,1,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def sprite_sword():
    """Sword projectile/icon - 1 tile.
    Color 1 = blade, Color 2 = hilt shine, Color 3 = hilt."""
    return pixels_to_tile([
        [0,0,0,0,0,0,1,0],
        [0,0,0,0,0,1,1,0],
        [0,0,0,0,1,1,0,0],
        [0,0,0,1,1,0,0,0],
        [3,0,1,1,0,0,0,0],
        [0,3,2,0,0,0,0,0],
        [0,3,3,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])


# =========================================================================
# NPC SPRITE TILES (used from Step 4 onwards)
# An "old man" style NPC - 2x2 tiles (16x16 pixels)
# =========================================================================

def sprite_npc_head_left():
    """Old man NPC head/beard - left half.
    Color 1 = skin/body, Color 2 = white beard/hair, Color 3 = robe/shadow."""
    return pixels_to_tile([
        [0,0,0,0,2,2,2,2],
        [0,0,0,2,2,2,2,2],
        [0,0,2,2,2,1,1,1],
        [0,0,2,2,1,1,3,1],
        [0,0,2,2,1,1,1,1],
        [0,0,0,2,2,1,1,1],
        [0,0,0,2,2,2,2,2],
        [0,0,2,2,2,2,2,2],
    ])

def sprite_npc_head_right():
    """Old man NPC head - right half."""
    return pixels_to_tile([
        [2,2,2,2,0,0,0,0],
        [2,2,2,2,2,0,0,0],
        [1,1,1,2,2,0,0,0],
        [1,3,1,1,2,2,0,0],
        [1,1,1,1,2,2,0,0],
        [1,1,1,2,2,0,0,0],
        [2,2,2,2,2,0,0,0],
        [2,2,2,2,2,2,0,0],
    ])

def sprite_npc_body_left():
    """Old man NPC body/robe - left half. Color 3 = dark robe."""
    return pixels_to_tile([
        [0,2,2,2,3,3,3,3],
        [0,0,3,3,3,3,3,3],
        [0,0,3,3,3,3,3,3],
        [0,0,3,3,3,3,3,3],
        [0,0,3,3,3,3,3,3],
        [0,0,3,3,3,3,3,3],
        [0,0,3,3,3,3,3,3],
        [0,0,3,3,3,3,3,3],
    ])

def sprite_npc_body_right():
    """Old man NPC body/robe - right half."""
    return pixels_to_tile([
        [3,3,3,3,2,2,2,0],
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,3,0,0],
    ])

# A shorter "merchant" NPC (2x2) - for Step 5
def sprite_npc2_head_left():
    """Merchant NPC head - left half. Hat/cap.
    Color 1 = face/body, Color 2 = hat highlight, Color 3 = hat/shadow."""
    return pixels_to_tile([
        [0,0,3,3,3,3,3,3],
        [0,3,3,2,3,3,3,3],
        [3,3,2,3,3,3,3,3],
        [0,0,1,1,1,1,1,1],
        [0,0,1,1,1,3,1,1],
        [0,0,1,1,1,1,1,1],
        [0,0,0,1,1,1,1,1],
        [0,0,0,0,1,1,1,1],
    ])

def sprite_npc2_head_right():
    """Merchant NPC head - right half."""
    return pixels_to_tile([
        [3,3,3,3,3,3,0,0],
        [3,3,3,3,3,0,0,0],
        [3,3,3,3,0,0,0,0],
        [1,1,1,1,1,1,0,0],
        [1,1,3,1,1,1,0,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,0,0,0,0],
    ])

def sprite_npc2_body_left():
    """Merchant body - left half. Color 1 = shirt, Color 3 = belt."""
    return pixels_to_tile([
        [0,0,0,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,1],
        [0,1,3,3,3,3,3,3],
        [0,0,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [0,0,1,1,0,0,0,1],
    ])

def sprite_npc2_body_right():
    """Merchant body - right half."""
    return pixels_to_tile([
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,0],
        [3,3,3,3,3,3,1,0],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,0,0],
        [1,0,0,0,1,1,0,0],
    ])


# =========================================================================
# FONT TILES (used from Step 4 onwards)
# Simple 5x7 pixel font, centered in 8x8 tiles.
# Written as pattern strings for readability: '#' = color 1, ' ' = color 0.
# =========================================================================

FONT_PATTERNS = {
    'A': [
        "        ",
        "  ###   ",
        " #   #  ",
        " #   #  ",
        " #####  ",
        " #   #  ",
        " #   #  ",
        "        ",
    ],
    'B': [
        "        ",
        " ####   ",
        " #   #  ",
        " ####   ",
        " #   #  ",
        " #   #  ",
        " ####   ",
        "        ",
    ],
    'C': [
        "        ",
        "  ####  ",
        " #      ",
        " #      ",
        " #      ",
        " #      ",
        "  ####  ",
        "        ",
    ],
    'D': [
        "        ",
        " ####   ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " ####   ",
        "        ",
    ],
    'E': [
        "        ",
        " #####  ",
        " #      ",
        " ####   ",
        " #      ",
        " #      ",
        " #####  ",
        "        ",
    ],
    'F': [
        "        ",
        " #####  ",
        " #      ",
        " ####   ",
        " #      ",
        " #      ",
        " #      ",
        "        ",
    ],
    'G': [
        "        ",
        "  ####  ",
        " #      ",
        " #  ##  ",
        " #   #  ",
        " #   #  ",
        "  ####  ",
        "        ",
    ],
    'H': [
        "        ",
        " #   #  ",
        " #   #  ",
        " #####  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        "        ",
    ],
    'I': [
        "        ",
        "  ###   ",
        "   #    ",
        "   #    ",
        "   #    ",
        "   #    ",
        "  ###   ",
        "        ",
    ],
    'J': [
        "        ",
        "   ###  ",
        "    #   ",
        "    #   ",
        "    #   ",
        " #  #   ",
        "  ##    ",
        "        ",
    ],
    'K': [
        "        ",
        " #   #  ",
        " #  #   ",
        " ###    ",
        " #  #   ",
        " #   #  ",
        " #   #  ",
        "        ",
    ],
    'L': [
        "        ",
        " #      ",
        " #      ",
        " #      ",
        " #      ",
        " #      ",
        " #####  ",
        "        ",
    ],
    'M': [
        "        ",
        " #   #  ",
        " ## ##  ",
        " # # #  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        "        ",
    ],
    'N': [
        "        ",
        " #   #  ",
        " ##  #  ",
        " # # #  ",
        " #  ##  ",
        " #   #  ",
        " #   #  ",
        "        ",
    ],
    'O': [
        "        ",
        "  ###   ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        "  ###   ",
        "        ",
    ],
    'P': [
        "        ",
        " ####   ",
        " #   #  ",
        " ####   ",
        " #      ",
        " #      ",
        " #      ",
        "        ",
    ],
    'Q': [
        "        ",
        "  ###   ",
        " #   #  ",
        " #   #  ",
        " # # #  ",
        " #  #   ",
        "  ## #  ",
        "        ",
    ],
    'R': [
        "        ",
        " ####   ",
        " #   #  ",
        " ####   ",
        " # #    ",
        " #  #   ",
        " #   #  ",
        "        ",
    ],
    'S': [
        "        ",
        "  ####  ",
        " #      ",
        "  ###   ",
        "     #  ",
        "     #  ",
        " ####   ",
        "        ",
    ],
    'T': [
        "        ",
        " #####  ",
        "   #    ",
        "   #    ",
        "   #    ",
        "   #    ",
        "   #    ",
        "        ",
    ],
    'U': [
        "        ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        "  ###   ",
        "        ",
    ],
    'V': [
        "        ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        "  # #   ",
        "   #    ",
        "        ",
    ],
    'W': [
        "        ",
        " #   #  ",
        " #   #  ",
        " #   #  ",
        " # # #  ",
        " ## ##  ",
        " #   #  ",
        "        ",
    ],
    'X': [
        "        ",
        " #   #  ",
        "  # #   ",
        "   #    ",
        "   #    ",
        "  # #   ",
        " #   #  ",
        "        ",
    ],
    'Y': [
        "        ",
        " #   #  ",
        " #   #  ",
        "  # #   ",
        "   #    ",
        "   #    ",
        "   #    ",
        "        ",
    ],
    'Z': [
        "        ",
        " #####  ",
        "     #  ",
        "    #   ",
        "   #    ",
        "  #     ",
        " #####  ",
        "        ",
    ],
    '0': [
        "        ",
        "  ###   ",
        " #   #  ",
        " #  ##  ",
        " # # #  ",
        " ##  #  ",
        "  ###   ",
        "        ",
    ],
    '1': [
        "        ",
        "   #    ",
        "  ##    ",
        "   #    ",
        "   #    ",
        "   #    ",
        "  ###   ",
        "        ",
    ],
    '2': [
        "        ",
        "  ###   ",
        " #   #  ",
        "    #   ",
        "   #    ",
        "  #     ",
        " #####  ",
        "        ",
    ],
    '3': [
        "        ",
        "  ###   ",
        " #   #  ",
        "   ##   ",
        "     #  ",
        " #   #  ",
        "  ###   ",
        "        ",
    ],
    '4': [
        "        ",
        "    #   ",
        "   ##   ",
        "  # #   ",
        " #  #   ",
        " #####  ",
        "    #   ",
        "        ",
    ],
    '5': [
        "        ",
        " #####  ",
        " #      ",
        " ####   ",
        "     #  ",
        " #   #  ",
        "  ###   ",
        "        ",
    ],
    '6': [
        "        ",
        "  ###   ",
        " #      ",
        " ####   ",
        " #   #  ",
        " #   #  ",
        "  ###   ",
        "        ",
    ],
    '7': [
        "        ",
        " #####  ",
        "     #  ",
        "    #   ",
        "   #    ",
        "  #     ",
        "  #     ",
        "        ",
    ],
    '8': [
        "        ",
        "  ###   ",
        " #   #  ",
        "  ###   ",
        " #   #  ",
        " #   #  ",
        "  ###   ",
        "        ",
    ],
    '9': [
        "        ",
        "  ###   ",
        " #   #  ",
        " #   #  ",
        "  ####  ",
        "     #  ",
        "  ###   ",
        "        ",
    ],
    ' ': [
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
    ],
    '!': [
        "        ",
        "   #    ",
        "   #    ",
        "   #    ",
        "   #    ",
        "        ",
        "   #    ",
        "        ",
    ],
    '?': [
        "        ",
        "  ###   ",
        " #   #  ",
        "    #   ",
        "   #    ",
        "        ",
        "   #    ",
        "        ",
    ],
    '.': [
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "  ##    ",
        "  ##    ",
    ],
    ',': [
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "  ##    ",
        "   #    ",
        "  #     ",
    ],
    "'": [
        "   #    ",
        "   #    ",
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
        "        ",
    ],
    '-': [
        "        ",
        "        ",
        "        ",
        " #####  ",
        "        ",
        "        ",
        "        ",
        "        ",
    ],
}

# Maps a character to the NES tile number where its glyph lives in pattern table 1.
# Font occupies tiles $10-$3F (48 tiles: 26 letters + 10 digits + 12 punctuation/etc).
FONT_TILE_MAP = {}
_font_order = (
    list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") +   # $10 - $29
    list("0123456789") +                    # $2A - $33
    [' ', '!', '?', '.', ',', "'", '-']    # $34 - $3A
)
for i, ch in enumerate(_font_order):
    FONT_TILE_MAP[ch] = 0x10 + i

def font_tile(ch):
    """Return 16-byte tile data for one font character."""
    pattern = FONT_PATTERNS.get(ch, FONT_PATTERNS[' '])
    rows = []
    for row_str in pattern:
        row = [1 if c == '#' else 0 for c in row_str]
        rows.append(row[:8])
    return pixels_to_tile(rows)


# =========================================================================
# DIALOGUE BOX BORDER TILES (used from Step 5)
# =========================================================================

def tile_box_corner_tl():
    """Top-left corner of a dialogue box. Color 1 = border."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,1,1,1,1,1,1],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
    ])

def tile_box_corner_tr():
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
    ])

def tile_box_corner_bl():
    return pixels_to_tile([
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def tile_box_corner_br():
    return pixels_to_tile([
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [1,1,1,1,1,1,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def tile_box_edge_top():
    """Horizontal border - used along the top of a dialogue box."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def tile_box_edge_bottom():
    """Horizontal border - used along the bottom of a dialogue box."""
    return pixels_to_tile([
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0],
    ])

def tile_box_edge_left():
    """Vertical border on the left side of the box."""
    return pixels_to_tile([
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
        [0,0,1,0,0,0,0,0],
    ])

def tile_box_edge_right():
    """Vertical border on the right side of the box."""
    return pixels_to_tile([
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
        [0,0,0,0,0,1,0,0],
    ])


def build_combined_chr(player_chr_path, output_path,
                       with_npc=False, with_merchant=False,
                       with_font=False, with_box_borders=False):
    """
    Build an 8KB CHR file:
      - First 4KB (pattern table 0): Player sprites + enemy/item sprites (+ optional NPC)
      - Second 4KB (pattern table 1): Background tiles (+ optional font, box borders)

    Flags:
      with_npc       - Add old-man NPC sprite at tiles $60, $61, $70, $71
      with_merchant  - Add merchant NPC sprite at tiles $62, $63, $72, $73
      with_font      - Add font glyphs at tiles $10 - $3A in bg pattern table
      with_box_borders - Add dialogue box border tiles at $3B - $42
    """
    # Load existing player sprite data (first 4KB)
    with open(player_chr_path, 'rb') as f:
        player_data = bytearray(f.read(4096))  # Only first 4KB

    # Pad to 4KB if needed
    while len(player_data) < 4096:
        player_data.extend(b'\x00' * 16)

    # --- ADD ENEMY AND ITEM SPRITES ---
    # Place them in unused tile slots in the first 4KB
    # Player uses tiles roughly $01-$3C. We'll put extras at $40+

    # Slime enemy at tiles $40-$43 (2x2 = 4 tiles)
    offset = 0x40 * 16
    player_data[offset:offset+16] = sprite_slime_top_left()
    player_data[offset+16:offset+32] = sprite_slime_top_right()
    # Row below in the tile grid: $50, $51
    offset2 = 0x50 * 16
    player_data[offset2:offset2+16] = sprite_slime_bottom_left()
    player_data[offset2+16:offset2+32] = sprite_slime_bottom_right()

    # Skeleton enemy at tiles $44-$47 (2x2 = 4 tiles for head+body)
    offset = 0x44 * 16
    player_data[offset:offset+16] = sprite_skeleton_head_left()
    player_data[offset+16:offset+32] = sprite_skeleton_head_right()
    offset2 = 0x54 * 16
    player_data[offset2:offset2+16] = sprite_skeleton_body_left()
    player_data[offset2+16:offset2+32] = sprite_skeleton_body_right()

    # Items: gem at $48, heart at $49, sword at $4A
    offset = 0x48 * 16
    player_data[offset:offset+16] = sprite_gem()
    player_data[offset+16:offset+32] = sprite_heart()
    player_data[offset+32:offset+48] = sprite_sword()

    # --- NPC SPRITES ---
    if with_npc:
        # Old man NPC at $60, $61 (head) and $70, $71 (body)
        offset = 0x60 * 16
        player_data[offset:offset+16] = sprite_npc_head_left()
        player_data[offset+16:offset+32] = sprite_npc_head_right()
        offset = 0x70 * 16
        player_data[offset:offset+16] = sprite_npc_body_left()
        player_data[offset+16:offset+32] = sprite_npc_body_right()

    if with_merchant:
        # Merchant NPC at $62, $63 (head) and $72, $73 (body)
        offset = 0x62 * 16
        player_data[offset:offset+16] = sprite_npc2_head_left()
        player_data[offset+16:offset+32] = sprite_npc2_head_right()
        offset = 0x72 * 16
        player_data[offset:offset+16] = sprite_npc2_body_left()
        player_data[offset+16:offset+32] = sprite_npc2_body_right()

    # --- BUILD BACKGROUND TILES (pattern table 1, second 4KB) ---
    bg_data = bytearray(4096)

    # Tile $00: Sky (empty)
    bg_data[0x00*16:0x00*16+16] = tile_sky()

    # Tile $01: Ground top (grass surface)
    bg_data[0x01*16:0x01*16+16] = tile_ground_top()

    # Tile $02: Ground fill (dirt/stone below surface)
    bg_data[0x02*16:0x02*16+16] = tile_ground_fill()

    # Tile $03: Brick block
    bg_data[0x03*16:0x03*16+16] = tile_brick()

    # Tile $04: Platform top
    bg_data[0x04*16:0x04*16+16] = tile_platform_top()

    # Tile $05: Platform bottom/support
    bg_data[0x05*16:0x05*16+16] = tile_platform_bottom()

    # Tile $06: Cloud left
    bg_data[0x06*16:0x06*16+16] = tile_cloud_left()

    # Tile $07: Cloud right
    bg_data[0x07*16:0x07*16+16] = tile_cloud_right()

    # Tile $08: Castle/palace wall block
    bg_data[0x08*16:0x08*16+16] = tile_castle_block()

    # Tile $09: Door
    bg_data[0x09*16:0x09*16+16] = tile_door()

    # Tile $0A: Door top (arch)
    bg_data[0x0A*16:0x0A*16+16] = tile_door_top()

    # Tile $0B: Solid block (useful filler)
    bg_data[0x0B*16:0x0B*16+16] = solid_tile(1)

    # --- FONT TILES (tiles $10 - $3A in bg pattern table) ---
    if with_font:
        for ch, tile_num in FONT_TILE_MAP.items():
            bg_data[tile_num*16:tile_num*16+16] = font_tile(ch)

    # --- DIALOGUE BOX BORDER TILES (tiles $3B - $42) ---
    if with_box_borders:
        bg_data[0x3B*16:0x3B*16+16] = tile_box_corner_tl()
        bg_data[0x3C*16:0x3C*16+16] = tile_box_corner_tr()
        bg_data[0x3D*16:0x3D*16+16] = tile_box_corner_bl()
        bg_data[0x3E*16:0x3E*16+16] = tile_box_corner_br()
        bg_data[0x3F*16:0x3F*16+16] = tile_box_edge_top()
        bg_data[0x40*16:0x40*16+16] = tile_box_edge_bottom()
        bg_data[0x41*16:0x41*16+16] = tile_box_edge_left()
        bg_data[0x42*16:0x42*16+16] = tile_box_edge_right()

    # Combine into 8KB
    output = bytes(player_data) + bytes(bg_data)
    assert len(output) == 8192

    with open(output_path, 'wb') as f:
        f.write(output)
    print(f"Created {output_path} ({len(output)} bytes)")


def build_nametable(output_path):
    """
    Build a nametable (960 bytes tiles + 64 bytes attributes = 1024 bytes)
    for a Zelda 2-style side-scrolling level.

    The level has:
      - Sky with clouds at the top
      - A floating platform in the middle
      - Ground at the bottom with some bricks
      - A door/entrance
    """
    # 30 rows x 32 columns of tile indices
    tiles = [[0x00] * 32 for _ in range(30)]

    # --- SKY (rows 0-21 are mostly empty) ---

    # Clouds at row 4-5
    tiles[4][5] = 0x06   # cloud left
    tiles[4][6] = 0x07   # cloud right
    tiles[4][20] = 0x06
    tiles[4][21] = 0x07

    # Another cloud
    tiles[6][12] = 0x06
    tiles[6][13] = 0x07
    tiles[6][14] = 0x07

    # --- FLOATING PLATFORM (rows 18-19) ---
    # A platform the player can jump onto
    for col in range(8, 16):
        tiles[18][col] = 0x04  # platform top
        tiles[19][col] = 0x05  # platform bottom

    # Another smaller platform higher up
    for col in range(20, 25):
        tiles[14][col] = 0x04
        tiles[15][col] = 0x05

    # --- DOOR on the high platform ---
    tiles[12][22] = 0x0A  # door top (arch)
    tiles[13][22] = 0x09  # door body

    # --- GROUND (rows 26-29) ---
    # Row 26: ground surface
    for col in range(32):
        tiles[26][col] = 0x01  # grass top

    # Rows 27-29: underground fill
    for row in range(27, 30):
        for col in range(32):
            tiles[27][col] = 0x02  # dirt fill
            tiles[28][col] = 0x02
            tiles[29][col] = 0x02

    # Some bricks sticking up from the ground
    tiles[25][3] = 0x03   # brick
    tiles[25][4] = 0x03
    tiles[24][3] = 0x03
    tiles[25][28] = 0x03
    tiles[25][29] = 0x03

    # Castle wall section on the far right
    for row in range(20, 26):
        tiles[row][30] = 0x08  # castle block
        tiles[row][31] = 0x08

    # Flatten to bytes
    data = bytearray()
    for row in tiles:
        data.extend(row)

    assert len(data) == 960

    # --- ATTRIBUTE TABLE (64 bytes) ---
    # Each byte controls palette selection for a 4x4 tile area (32x32 pixels)
    # Bits: [BR BR BL BL TR TR TL TL]
    # We'll use palette 0 for everything, but palette 1 for the platforms
    attrs = bytearray(64)

    # The attribute table divides the screen into 8x8 grid of 32x32 pixel blocks
    # Each byte covers a 2x2 group of 16x16 pixel metatiles
    # Attribute byte layout: TL=bits 0-1, TR=bits 2-3, BL=bits 4-5, BR=bits 6-7

    # Set palette 1 for platform area (rows 16-19, cols 8-15) -> attr rows 4, cols 2-3
    # attr_row = tile_row / 4, attr_col = tile_col / 4
    # Platform at rows 18-19, cols 8-15 -> attr(4, 2), attr(4, 3)
    attrs[4*8 + 2] = 0x00  # palette 0 for all quadrants (keep simple)
    attrs[4*8 + 3] = 0x00

    data.extend(attrs)
    assert len(data) == 1024

    with open(output_path, 'wb') as f:
        f.write(data)
    print(f"Created {output_path} ({len(data)} bytes)")


def build_palettes(output_path):
    """Create a palette file with background and sprite palettes."""
    pal = bytearray(32)

    # Background palettes
    # Palette 0: Sky/ground (universal BG = sky blue)
    pal[0] = 0x21   # Universal background: light blue sky
    pal[1] = 0x29   # Green (grass)
    pal[2] = 0x19   # Darker green (grass highlight)
    pal[3] = 0x07   # Brown/dark (dirt, mortar)

    # Palette 1: Castle/platform
    pal[4] = 0x21   # (mirrors universal BG)
    pal[5] = 0x00   # Grey
    pal[6] = 0x10   # Light grey
    pal[7] = 0x2D   # Dark grey

    # Palette 2: (reserved)
    pal[8] = 0x21
    pal[9] = 0x16
    pal[10] = 0x27
    pal[11] = 0x18

    # Palette 3: (reserved)
    pal[12] = 0x21
    pal[13] = 0x30
    pal[14] = 0x20
    pal[15] = 0x0F

    # Sprite palettes
    # Palette 0: Player (existing colors)
    pal[16] = 0x21  # (mirrors universal BG - transparent)
    pal[17] = 0x30  # White (eyes)
    pal[18] = 0x27  # Orange (outline)
    pal[19] = 0x17  # Brown (body)

    # Palette 1: Enemy (slime - green)
    pal[20] = 0x21
    pal[21] = 0x1A  # Green body
    pal[22] = 0x30  # White eyes
    pal[23] = 0x0A  # Dark green shadow

    # Palette 2: Enemy (skeleton - white/grey)
    pal[24] = 0x21
    pal[25] = 0x30  # White bone
    pal[26] = 0x16  # Red eyes
    pal[27] = 0x00  # Grey shadow

    # Palette 3: Items (gem/heart)
    pal[28] = 0x21
    pal[29] = 0x16  # Red (heart body / gem)
    pal[30] = 0x36  # Light red/pink (highlight)
    pal[31] = 0x06  # Dark red (shadow)

    with open(output_path, 'wb') as f:
        f.write(pal)
    print(f"Created {output_path} ({len(pal)} bytes)")


if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    player_chr = os.path.join(project_dir, 'assets', 'sprites', 'walk1.chr')

    # Output for Step 2, 3, 4, 5
    step2_dir = os.path.join(project_dir, 'steps', 'Step_2_Background_Level', 'assets')
    step3_dir = os.path.join(project_dir, 'steps', 'Step_3_Enemies_And_Items', 'assets')
    step4_dir = os.path.join(project_dir, 'steps', 'Step_4_Dialogue', 'assets')
    step5_dir = os.path.join(project_dir, 'steps', 'Step_5_Multi_NPC_Dialogue', 'assets')

    for d in [step2_dir, step3_dir, step4_dir, step5_dir]:
        os.makedirs(os.path.join(d, 'sprites'), exist_ok=True)
        os.makedirs(os.path.join(d, 'backgrounds'), exist_ok=True)
        os.makedirs(os.path.join(d, 'palettes'), exist_ok=True)

    # Generate combined CHR for Step 2 (player + background tiles)
    build_combined_chr(player_chr,
                       os.path.join(step2_dir, 'sprites', 'game.chr'))

    # Generate nametable for Step 2
    build_nametable(os.path.join(step2_dir, 'backgrounds', 'level1.nam'))

    # Generate palettes
    build_palettes(os.path.join(step2_dir, 'palettes', 'game.pal'))

    # Step 3: enemies and items (same CHR/nametable/palette as Step 2)
    build_combined_chr(player_chr,
                       os.path.join(step3_dir, 'sprites', 'game.chr'))
    build_nametable(os.path.join(step3_dir, 'backgrounds', 'level1.nam'))
    build_palettes(os.path.join(step3_dir, 'palettes', 'game.pal'))

    # Step 4: dialogue with one NPC + font
    build_combined_chr(player_chr,
                       os.path.join(step4_dir, 'sprites', 'game.chr'),
                       with_npc=True,
                       with_font=True)
    build_nametable(os.path.join(step4_dir, 'backgrounds', 'level1.nam'))
    build_palettes(os.path.join(step4_dir, 'palettes', 'game.pal'))

    # Step 5: two NPCs + font + bordered dialogue box
    build_combined_chr(player_chr,
                       os.path.join(step5_dir, 'sprites', 'game.chr'),
                       with_npc=True,
                       with_merchant=True,
                       with_font=True,
                       with_box_borders=True)
    build_nametable(os.path.join(step5_dir, 'backgrounds', 'level1.nam'))
    build_palettes(os.path.join(step5_dir, 'palettes', 'game.pal'))

    # Print the font tile map so teacher knows what values to use in code
    print("\nFont tile numbers (for use in main.c):")
    for ch, tile_num in sorted(FONT_TILE_MAP.items(), key=lambda x: x[1]):
        display = repr(ch) if ch in (' ', "'", ',') else ch
        print(f"  '{display}' = 0x{tile_num:02X}")

    print("\nDone! CHR files, nametables, and palettes generated.")
