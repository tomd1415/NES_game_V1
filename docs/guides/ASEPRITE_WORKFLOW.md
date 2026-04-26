# Aseprite to NES - Complete Workflow Guide

This guide explains exactly how to get sprites and background tiles created in Aseprite into your NES game. It covers the entire pipeline from drawing in Aseprite to seeing the result on screen.

---

## Table of Contents

1. [Understanding the NES Graphics Format](#understanding-the-nes-graphics-format)
2. [Setting Up Aseprite for NES Art](#setting-up-aseprite-for-nes-art)
3. [Drawing Sprites in Aseprite](#drawing-sprites-in-aseprite)
4. [Drawing Background Tiles in Aseprite](#drawing-background-tiles-in-aseprite)
5. [Exporting from Aseprite](#exporting-from-aseprite)
6. [Converting PNG to NES CHR Format](#converting-png-to-nes-chr-format)
7. [Getting the CHR Data into the Game](#getting-the-chr-data-into-the-game)
8. [Creating a Background Level Layout](#creating-a-background-level-layout)
9. [Quick Reference: The Full Pipeline](#quick-reference-the-full-pipeline)
10. [Troubleshooting](#troubleshooting)

---

## Understanding the NES Graphics Format

Before you convert anything, you need to understand what the NES actually stores.

### Tiles, not images

The NES does **not** store images. It stores **tiles** - small 8x8 pixel blocks. Everything on screen is built from these tiles:

- **Sprites** (player, enemies, items) are assembled from tiles placed via OAM (Object Attribute Memory)
- **Backgrounds** (ground, sky, platforms) are assembled from tiles placed in a nametable

### The CHR file

All tiles live in a single **CHR file** (8192 bytes / 8KB). This file is split into two halves:

| Section | Size | Contents | Used by |
|---------|------|----------|---------|
| Pattern Table 0 | 4KB (256 tiles) | Sprite tiles | Player, enemies, items |
| Pattern Table 1 | 4KB (256 tiles) | Background tiles | Ground, platforms, sky |

Each 8x8 tile uses **16 bytes** of storage (256 tiles x 16 bytes = 4096 bytes = 4KB).

### Only 4 colors per tile

Each pixel in a tile is **2 bits**, giving 4 possible values:

| Pixel value | Meaning for sprites | Meaning for backgrounds |
|-------------|--------------------|-----------------------|
| 0 | Transparent | Universal background color |
| 1 | Palette color 1 | Palette color 1 |
| 2 | Palette color 2 | Palette color 2 |
| 3 | Palette color 3 | Palette color 3 |

The actual RGB colors are set by the palette in your game code (`main.c`), **not** in the image. The CHR file only stores which of the 4 palette slots each pixel uses.

### How the 16 bytes are arranged (NES planar format)

This is the tricky part. The NES does **not** store pixels sequentially. Instead, each tile is stored as two "bit planes":

```
Bytes  0-7:  Bit plane 0 (the low bit of each pixel)
Bytes  8-15: Bit plane 1 (the high bit of each pixel)
```

For each pixel: `color = (plane1_bit << 1) | plane0_bit`

**Example** - a tile with a simple pattern:

```
Pixel values (what you draw):       Stored as:
0 0 1 1 2 2 3 3                     Plane 0: 00110011 = $33
0 0 0 0 0 0 0 0                     Plane 0: 00000000 = $00
...                                 ...
                                    Plane 1: 00001111 = $0F
                                    Plane 1: 00000000 = $00
                                    ...
```

You don't need to do this conversion by hand - that's what the conversion tool does.

---

## Setting Up Aseprite for NES Art

### Create a new file with the right settings

1. **File > New**
2. **Color Mode: Indexed** (this is critical - not RGB, not Grayscale)
3. Set the canvas size based on what you're drawing (see below)
4. Set **Background: Transparent** for sprites, or a solid color for backgrounds

### Canvas sizes for different tasks

| What you're drawing | Canvas size | Why |
|---------------------|-------------|-----|
| A single 8x8 tile | 8x8 | One tile |
| A 16x16 sprite (e.g. gem, enemy) | 16x16 | 2x2 tiles |
| The player character (one frame) | 16x32 | 2x4 tiles |
| A full sprite sheet (all player frames) | 128x32 | All 4 walk frames side by side |
| A complete tileset | 128x128 | 16x16 grid of tiles (256 tiles) |
| A full pattern table | 128x256 | 16x32 grid (if you want to see everything) |

**Recommended approach**: Draw one sprite or tile at a time in small canvases (e.g. 16x32 for the player), then combine them into the CHR file using the conversion script.

### Set up a 4-color palette

The NES only uses 4 colors per palette (including transparent/background). In Aseprite:

1. Go to the palette panel (usually bottom-left)
2. Keep only **4 colors**:
   - **Index 0**: Transparent (or background color) - this will be color 0
   - **Index 1**: Your first color
   - **Index 2**: Your second color
   - **Index 3**: Your third color

To set this up precisely:

1. **Sprite > Color Mode > Indexed** (if not already)
2. **Sprite > Palette Size** - set to **4**
3. Double-click each color swatch to choose your colors

**Important**: The specific RGB colors you use in Aseprite don't matter for the final game. They're just for your reference while drawing. The NES palette in `main.c` determines the actual on-screen colors. But it helps to choose colors that roughly match what you want, so you can see what you're doing.

**Suggested palette for drawing sprites:**

| Index | Use as | Suggested Aseprite color |
|-------|--------|-------------------------|
| 0 | Transparent | Pink (#FF00FF) or checker pattern |
| 1 | Light/highlight | White or light color |
| 2 | Mid-tone | Your main character color |
| 3 | Dark/outline | Black or dark color |

### Turn on the grid

1. **View > Grid > Grid Settings**
2. Set grid size to **8x8** pixels
3. **View > Grid > Show Grid** (or press `Shift+'`)

This shows you the tile boundaries - crucial for understanding how your art will be split into 8x8 NES tiles.

---

## Drawing Sprites in Aseprite

### Player character example

The player is **16x32 pixels** (2 tiles wide, 4 tiles tall = 8 tiles total).

1. Create a new **16x32** Indexed file with 4 colors
2. Turn on the 8x8 grid so you can see the 8 tile boundaries
3. Draw your character using only colors 0-3:

```
Grid overlay shows:
+--------+--------+
| head-L | head-R |  <- tiles at row 0
+--------+--------+
| body-L | body-R |  <- tiles at row 1
+--------+--------+
| legs-L | legs-R |  <- tiles at row 2
+--------+--------+
| feet-L | feet-R |  <- tiles at row 3
+--------+--------+
```

### Animation frames

For walk animation, the game uses 4 frames. You can draw these as:

**Option A: Separate files** (simpler for beginners)
- `player_stand.png` (16x32)
- `player_walk1.png` (16x32)
- `player_walk2.png` (16x32)

**Option B: Single sprite sheet** (more efficient)
- One file, 64x32 pixels (4 frames x 16px wide, 32px tall)
- Or use Aseprite's frame/animation feature and export as a sheet

### Enemy sprites

Enemies in the current game are **16x16** (2x2 tiles = 4 tiles each):

```
+--------+--------+
| top-L  | top-R  |
+--------+--------+
| bot-L  | bot-R  |
+--------+--------+
```

### Item sprites

Items (gems, hearts) are single **8x8** tiles.

---

## Drawing Background Tiles in Aseprite

Background tiles work differently from sprites. You draw individual **8x8 tiles** that get repeated across the screen.

### How to draw a tileset

1. Create a new **128x128** Indexed file (16 columns x 16 rows = 256 tiles)
2. Set palette to 4 colors
3. Turn on the 8x8 grid
4. Draw each tile in its grid cell

**Tile placement matters.** The tile's position in the grid determines its tile number:

```
Tile $00  Tile $01  Tile $02  ...  Tile $0F
Tile $10  Tile $11  Tile $12  ...  Tile $1F
Tile $20  Tile $21  Tile $22  ...  Tile $2F
...
```

The tile number = (row * 16) + column. For the current game, the background tiles are:

| Tile # | Position in grid | What it is |
|--------|-----------------|------------|
| $00 | Row 0, Col 0 | Sky (empty/transparent) |
| $01 | Row 0, Col 1 | Ground top (grass) |
| $02 | Row 0, Col 2 | Ground fill (dirt) |
| $03 | Row 0, Col 3 | Brick block |
| $04 | Row 0, Col 4 | Platform top |
| $05 | Row 0, Col 5 | Platform bottom |
| $06 | Row 0, Col 6 | Cloud left |
| $07 | Row 0, Col 7 | Cloud right |
| $08 | Row 0, Col 8 | Castle wall |
| $09 | Row 0, Col 9 | Door body |
| $0A | Row 0, Col 10 | Door arch top |
| $0B | Row 0, Col 11 | Solid block |

### Important: Tile 0 should usually be empty

Background tile $00 is used to fill "sky" / empty space. Make it fully color-0 (transparent/background color).

---

## Exporting from Aseprite

This is where things can go wrong. Follow these steps carefully.

### Export as Indexed PNG

1. **File > Export As** (not "Save As" - that saves as `.ase`)
2. Choose **PNG** format
3. **Crucially**: Make sure the file stays in **Indexed Color Mode**

### Check the export settings

- Do NOT check "Convert to sRGB" or any color conversion options
- Do NOT resize or scale
- Keep the pixel dimensions exact

### Verify the exported PNG

After exporting, you can verify the PNG is correct:

```bash
python3 -c "
from PIL import Image
img = Image.open('my_sprite.png')
print(f'Mode: {img.mode}')   # Should be 'P' (palette/indexed)
print(f'Size: {img.size}')   # Should match your canvas
print(f'Colors: {len(img.getpalette())//3}')
# Check a pixel:
print(f'Pixel (0,0) = {img.getpixel((0,0))}')  # Should be 0, 1, 2, or 3
"
```

The mode **must** be `P` (indexed). If it says `RGB` or `RGBA`, the conversion won't work correctly.

### Common Aseprite export pitfall

Aseprite sometimes re-indexes colors when exporting. If your palette has 4 colors but some aren't used in the image, Aseprite might remove unused colors and renumber the remaining ones. To prevent this:

1. Make sure all 4 colors are used somewhere in the image (even a single pixel of each in a corner)
2. Or use **File > Export As** with the option "Don't change palette" if available in your version

---

## Converting PNG to NES CHR Format

You need a tool to convert the indexed PNG into the NES's planar tile format. There are several options.

### Option 1: The project's built-in Python script (recommended)

The project already has `tools/generate_chr.py` which creates CHR data programmatically. You can extend it to load from PNG files instead.

Here's a standalone conversion script to add to the `tools/` folder:

```python
#!/usr/bin/env python3
"""
png2chr.py - Convert indexed-color PNG images to NES CHR tile data.

Usage:
    python3 png2chr.py input.png output.chr [--offset TILE_NUM]

The input PNG must be:
  - Indexed color mode (not RGB)
  - Width and height must be multiples of 8
  - Maximum 4 colors (indices 0-3)

The --offset option lets you place tiles at a specific position in an
existing CHR file instead of creating a new one.
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
    """
    img = Image.open(image_path)

    # Convert to indexed if needed
    if img.mode == 'RGBA' or img.mode == 'RGB':
        print(f"WARNING: Image is {img.mode} mode, not indexed.")
        print("Converting to indexed with 4 colors...")
        img = img.quantize(colors=4)

    if img.mode != 'P':
        print(f"ERROR: Image must be indexed color mode (got '{img.mode}')")
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
                    # Clamp to 0-3
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
    position in the existing data. Otherwise, create a new file.
    """
    if offset is not None and existing_chr:
        data = bytearray(open(existing_chr, 'rb').read())
        # Pad to at least the needed size
        needed = (offset + len(tiles)) * 16
        while len(data) < needed:
            data.extend(b'\x00' * 16)
        for i, tile in enumerate(tiles):
            pos = (offset + i) * 16
            data[pos:pos+16] = tile
        # Pad to 4KB or 8KB boundary
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
    print(f"Wrote {len(tiles)} tiles ({len(data)} bytes) to {output_path}")


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 png2chr.py input.png output.chr [--offset N] [--into existing.chr]")
        print()
        print("Examples:")
        print("  python3 png2chr.py player.png sprites.chr")
        print("  python3 png2chr.py enemy.png game.chr --offset 0x40 --into game.chr")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    offset = None
    existing_chr = None

    i = 3
    while i < len(sys.argv):
        if sys.argv[i] == '--offset':
            offset_str = sys.argv[i+1]
            offset = int(offset_str, 16) if offset_str.startswith('0x') else int(offset_str)
            i += 2
        elif sys.argv[i] == '--into':
            existing_chr = sys.argv[i+1]
            i += 2
        else:
            i += 1

    if not os.path.exists(input_path):
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    tiles = png_to_chr_tiles(input_path)
    print(f"Converted {input_path}: {len(tiles)} tiles")

    write_chr(tiles, output_path, offset, existing_chr)


if __name__ == '__main__':
    main()
```

### Option 2: Aseprite-to-CHR-ROM Lua script

There is a community Lua script that runs inside Aseprite itself:

1. Download from: **misteki.itch.io** - search for "Aseprite to CHR ROM"
2. In Aseprite: **File > Scripts > Open Scripts Folder**
3. Copy the `.lua` script into that folder
4. Restart Aseprite, then **File > Scripts** and run it
5. It exports the current image directly as a `.chr` file

This is the most convenient option if you can find and install the script.

### Option 3: img2chr (Node.js)

If you have Node.js installed:

```bash
npm install -g img2chr
img2chr input.png -o output.chr
```

### Option 4: nes-chr-encode (Python/pip)

```bash
pip install nes-chr-encode
nes-chr-encode input.png output.chr
```

---

## Getting the CHR Data into the Game

Once you have your `.chr` file, here's how to get it into the game.

### Step 1: Understand the CHR file structure

Your game uses a single 8KB CHR file that contains BOTH sprite tiles and background tiles:

```
Bytes 0-4095:     Pattern Table 0 (sprites)    <- player, enemies, items
Bytes 4096-8191:  Pattern Table 1 (backgrounds) <- ground, platforms, sky
```

### Step 2: Place your CHR file

For the current project, the CHR file goes in `assets/sprites/` and is named based on the step:

| Step | CHR file path |
|------|--------------|
| Step 1 | `assets/sprites/walk1.chr` (4KB, sprites only) |
| Step 2 | `assets/sprites/game.chr` (8KB, sprites + backgrounds) |
| Step 3 | `assets/sprites/game.chr` (8KB, sprites + backgrounds) |

### Step 3: Update sprites only (keeping existing backgrounds)

If the pupil has drawn a new player sprite and you want to replace just the player tiles:

```bash
# Convert the new player PNG to CHR tiles
cd tools
python3 png2chr.py ../pupil_art/new_player.png ../assets/sprites/game.chr \
    --offset 0x01 --into ../assets/sprites/game.chr
```

The `--offset 0x01` means "start writing at tile number 1" (tile 0 is usually empty).

The player character uses these tile slots:

| Tiles | Purpose |
|-------|---------|
| $01, $02, $11, $12, $21, $22, $31, $32 | Standing frame (and walk frame 2) |
| $09, $0A, $19, $1A, $29, $2A, $39, $3A | Walk frame 1 |
| $0B, $0C, $1B, $1C, $2B, $2C, $3B, $3C | Walk frame 3 |

These tile numbers are set in the `anim_tiles` table in `main.c`. If your new sprite uses different tile positions, update the table to match.

### Step 4: Replace the entire sprite pattern table

If you've drawn a complete sprite tileset (128x128 PNG = 256 tiles):

```bash
python3 png2chr.py ../pupil_art/all_sprites.png /tmp/sprites.chr

# Then combine with background tiles:
# Take first 4KB of sprites.chr + second 4KB of existing game.chr
python3 -c "
sprites = open('/tmp/sprites.chr', 'rb').read()[:4096]
backgrounds = open('../assets/sprites/game.chr', 'rb').read()[4096:8192]
with open('../assets/sprites/game.chr', 'wb') as f:
    f.write(sprites + backgrounds)
print('Combined CHR file written')
"
```

### Step 5: Replace background tiles

If you've drawn new background tiles (128x128 PNG for the background pattern table):

```bash
python3 png2chr.py ../pupil_art/bg_tiles.png /tmp/bg.chr

# Combine: keep existing sprites, replace backgrounds
python3 -c "
sprites = open('../assets/sprites/game.chr', 'rb').read()[:4096]
backgrounds = open('/tmp/bg.chr', 'rb').read()[:4096]
with open('../assets/sprites/game.chr', 'wb') as f:
    f.write(sprites + backgrounds)
print('Combined CHR file written')
"
```

### Step 6: Build and test

```bash
cd ..    # back to project root
make run
```

### Updating tile numbers in the code

If the pupil places their sprites at different positions in the tile grid than expected, you'll need to update the tile numbers in `main.c`.

**For the player**, update the `anim_tiles` table:

```c
static const unsigned char anim_tiles[4][8] = {
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },  // Frame 0
    // ... change these hex numbers to match your new tile positions
};
```

**For enemies**, update the `draw_enemy()` call:

```c
draw_enemy(enemy1_x, enemy1_y,
           0x40, 0x41, 0x50, 0x51,   // <- these are tile numbers
           0x01);                       // palette number
```

**For items**, update the `draw_one_sprite()` call:

```c
draw_one_sprite(gem_y[i], 0x48, 0x03, gem_x[i]);
//                        ^^^^  <- tile number
```

---

## Creating a Background Level Layout

Background tiles define *what* tiles are available. The **nametable** defines *where* they go on screen.

### The nametable

The NES screen is 32 tiles wide x 30 tiles tall. The nametable is a file that says which tile goes in each position. It's 1024 bytes:

- 960 bytes: tile indices (32 x 30 grid)
- 64 bytes: attribute table (which palette each area uses)

### Option 1: Use NES Screen Tool (NESST)

This is the standard tool for designing NES backgrounds:

1. Download NES Screen Tool (search "NES Screen Tool download")
2. Load your CHR file: **Pattern > Open CHR > Import 8K**
3. Load your palette file or set colors manually
4. Click tiles from the pattern table and paint them onto the nametable grid
5. **Nametable > Save Nametable** - saves as `.nam` file

Place the `.nam` file in `assets/backgrounds/` and reference it from `graphics.s`:

```asm
level1_nam: .incbin "../assets/backgrounds/level1.nam"
```

### Option 2: Design in Aseprite, convert to nametable

If you want to design the level visually in Aseprite:

1. Create a **256x240** Indexed image (full NES screen resolution)
2. Draw using only your background tiles as "stamps" - each 8x8 area must exactly match one of your tiles
3. Export as indexed PNG
4. Use a conversion script to match each 8x8 region to a tile number

This is more complex and error-prone. NES Screen Tool is recommended for level design.

### Option 3: Edit the nametable in code

The `tools/generate_chr.py` script includes a `build_nametable()` function that creates nametables programmatically. You can modify this:

```python
# Row 26: ground surface across the whole screen
for col in range(32):
    tiles[26][col] = 0x01  # grass top tile

# A floating platform
for col in range(8, 16):
    tiles[18][col] = 0x04  # platform top
    tiles[19][col] = 0x05  # platform bottom
```

---

## Quick Reference: The Full Pipeline

Here's the complete workflow from drawing to playing:

### For a new sprite:

```
1. Aseprite: Create 16x32 indexed PNG, 4 colors
           File > Export As > player_new.png

2. Terminal: python3 tools/png2chr.py pupil_art/player_new.png \
               assets/sprites/game.chr --offset 0x01 \
               --into assets/sprites/game.chr

3. Code:    Update anim_tiles[] in src/main.c if tile positions changed

4. Build:   make run
```

### For new background tiles:

```
1. Aseprite: Create 128x128 indexed PNG, 4 colors
           Draw each tile in its 8x8 grid cell
           File > Export As > bg_tiles.png

2. Terminal: python3 tools/png2chr.py pupil_art/bg_tiles.png /tmp/bg.chr
           python3 -c "
           s = open('assets/sprites/game.chr','rb').read()[:4096]
           b = open('/tmp/bg.chr','rb').read()[:4096]
           open('assets/sprites/game.chr','wb').write(s+b)
           "

3. Level:   Edit the nametable (.nam file) to use your new tile numbers
           (use NES Screen Tool, or edit build_nametable() in the Python script)

4. Build:   make run
```

### For both at once:

```
1. Draw sprites and background tiles as separate PNGs in Aseprite
2. Convert each to CHR data
3. Combine: first 4KB = sprites, second 4KB = backgrounds
4. Update tile numbers in main.c if needed
5. Update nametable if new background tiles were added
6. make run
```

---

## Troubleshooting

### "My sprite looks garbled on screen"

- **Wrong tile numbers**: The tile positions in your PNG determine the tile numbers. Check that `anim_tiles[]` or `draw_one_sprite()` in `main.c` use the correct numbers.
- **RGB not Indexed**: Make sure you exported as indexed color PNG, not RGB. Check with the Python verification snippet above.
- **More than 4 colors**: If your image uses more than 4 palette indices, extra colors get clamped. Reduce to exactly 4 colors.
- **Wrong pattern table**: Sprites use Pattern Table 0 (first 4KB), backgrounds use Pattern Table 1 (second 4KB). Make sure your tiles are in the right half.

### "Colors are wrong"

The CHR file doesn't store colors - it stores palette indices (0-3). The actual colors are set in `main.c`:

```c
// Sprite palette 0 (player)
PPU_ADDR = 0x3F;
PPU_ADDR = 0x11;
PPU_DATA = 0x30;   // Color 1: White
PPU_DATA = 0x27;   // Color 2: Orange
PPU_DATA = 0x17;   // Color 3: Brown
```

If the colors look wrong, either:
- Change the NES palette values in `main.c` to match what you want
- Or change which palette index (0-3) you're using for each pixel in Aseprite

See "NES color palette chart" online for the full list of NES color values.

### "My exported PNG has wrong palette order"

Aseprite can reorder palette indices on export. To verify and fix:

```bash
python3 -c "
from PIL import Image
img = Image.open('my_sprite.png')
pal = img.getpalette()[:12]  # First 4 colors x 3 (RGB)
for i in range(4):
    r, g, b = pal[i*3], pal[i*3+1], pal[i*3+2]
    print(f'Index {i}: RGB({r}, {g}, {b})')
"
```

If the order is wrong, you can remap in Aseprite:
1. Open the exported PNG
2. **Sprite > Palette Size** - make sure it's 4
3. Rearrange colors in the palette panel so index 0 = transparent, 1-3 = your drawing colors
4. Re-export

### "Tiles look offset or misaligned"

Your image dimensions must be exact multiples of 8. A 17x33 image will cause problems. Always use 8, 16, 24, 32... pixel dimensions.

### "I can only see some of my tiles"

- Pattern Table 0 holds 256 tiles (for sprites). Pattern Table 1 holds 256 tiles (for backgrounds). If you've placed tiles beyond position 255, they won't fit.
- The NES can only display 64 sprites on screen at once, and only 8 per horizontal line. If you have too many sprites on one row, some will disappear.

### "Background tiles show but look like static/noise"

The attribute table (last 64 bytes of the nametable) controls which palette is used for each 32x32 pixel area. If it's wrong, tiles will use the wrong palette and look garbled. If using NES Screen Tool, it handles attributes automatically.

### "I changed the CHR file but nothing changed on screen"

1. Make sure you ran `make clean && make run` (not just `make run`)
2. Make sure `graphics.s` references the correct `.chr` file:
   ```asm
   .incbin "../assets/sprites/game.chr"
   ```
3. Make sure the CHR file is exactly 8192 bytes (8KB)

---

## Appendix: Tile Number Quick Reference

### Sprite tiles (Pattern Table 0) - current layout

```
Row 0:  $00  $01  $02  $03  $04  $05  $06  $07  $08  $09  $0A  $0B  $0C  $0D  $0E  $0F
Row 1:  $10  $11  $12  $13  $14  $15  $16  $17  $18  $19  $1A  $1B  $1C  $1D  $1E  $1F
Row 2:  $20  $21  $22  $23  ...
Row 3:  $30  $31  $32  $33  ...
Row 4:  $40  $41  $42  $43  $44  $45  ...    <- Enemies start here ($40=slime, $44=skeleton)
Row 5:  $50  $51  $52  $53  $54  $55  ...    <- Enemy bottom halves
...

Player tiles:        $01-$02, $09-$0C, $11-$12, $19-$1C, $21-$22, $29-$2C, $31-$32, $39-$3C
Slime enemy:         $40, $41, $50, $51
Skeleton enemy:      $44, $45, $54, $55
Gem:                 $48
Heart:               $49
Sword:               $4A
```

### Background tiles (Pattern Table 1) - current layout

```
$00 = Sky (empty)
$01 = Ground top (grass)
$02 = Ground fill (dirt)
$03 = Brick block
$04 = Platform top
$05 = Platform bottom
$06 = Cloud left
$07 = Cloud right
$08 = Castle wall
$09 = Door body
$0A = Door arch
$0B = Solid block
$0C-$FF = Available for new tiles
```
