# Teacher Guide - NES Game Technical Reference

## Overview

This project builds a NES ROM using the **cc65 toolchain** (a C compiler and assembler targeting the 6502 CPU). The game is written primarily in C with a small amount of 65xx assembly for graphics data loading. The cc65 library (`nes.lib`) provides the startup code (crt0), C runtime, and hardware abstraction.

## Step-based lesson structure

The project includes a `steps/` folder with self-contained, buildable snapshots of the game at each stage of development. Each step can be built independently with `make` from within its folder.

| Step | Folder | What it teaches |
|------|--------|----------------|
| 1 | `Step_1_Player_Movement/` | Sprites, OAM, controller input, animation, basic physics (jump/gravity). The minimal working game. |
| 2 | `Step_2_Background_Level/` | Background tiles (CHR pattern tables), nametables, palette management, PPU_CTRL pattern table selection. A visible level with ground, platforms, clouds, and castle walls. |
| 3 | `Step_3_Enemies_And_Items/` | Multiple sprite palettes, enemy AI (patrol behaviour), collision detection (bounding box), game state (collectibles, score tracking). |

The `tools/generate_chr.py` script was used to create the CHR tile data and nametables for Steps 2 and 3. It can be used as a reference for how NES tile graphics are encoded (2-bit planar format), or modified to generate new tiles programmatically.

Pupils can work in any step folder without affecting the others, and can look ahead to later steps to see how features were implemented. This avoids needing git for version management during lessons.

---

## NES Architecture Summary

The NES has two main processors:

### CPU: Ricoh 2A03 (modified 6502)
- 8-bit processor, 1.79 MHz clock
- 16-bit address bus (64KB addressable space)
- Runs game logic, reads controllers, sends commands to the PPU
- Has 2KB of internal RAM ($0000-$07FF)
- Cartridge ROM is mapped at $8000-$FFFF (our code lives here)
- Hardware stack at $0100-$01FF (used for function calls, interrupts)

### PPU: Ricoh 2C02 (Picture Processing Unit)
- Separate processor dedicated to graphics
- Has its own 16KB address space (separate from the CPU)
- Renders a 256x240 pixel display at 60fps (NTSC)
- The CPU communicates with the PPU through memory-mapped registers at $2000-$2007

### Key PPU concepts

**Pattern Tables (CHR-ROM):** Two 4KB banks of tile graphics, each containing 256 tiles of 8x8 pixels. One bank is typically used for sprites, the other for backgrounds. Each pixel uses 2 bits (4 possible values: transparent + 3 colors). Our CHR data comes from `walk1.chr` (8KB = both banks).

**Palettes:** The PPU has 32 bytes of palette memory at $3F00-$3F1F:
- $3F00: Universal background color (shared by all palettes)
- $3F01-$3F03: Background palette 0 (3 colors)
- $3F05-$3F07: Background palette 1
- $3F09-$3F0B: Background palette 2
- $3F0D-$3F0F: Background palette 3
- $3F11-$3F13: Sprite palette 0 (3 colors) - **this is what we set**
- $3F15-$3F17: Sprite palette 1
- $3F19-$3F1B: Sprite palette 2
- $3F1D-$3F1F: Sprite palette 3

Each palette's color 0 is transparent (for sprites) or the universal background color.

**OAM (Object Attribute Memory):** 256 bytes of dedicated memory for sprite data. Holds up to 64 sprites, 4 bytes each:
- Byte 0: Y position (0-239, $FF = offscreen)
- Byte 1: Tile index (which 8x8 tile from the pattern table)
- Byte 2: Attributes
  - Bits 0-1: Palette number (0-3)
  - Bit 5: Priority (0 = in front of background, 1 = behind)
  - Bit 6: Horizontal flip
  - Bit 7: Vertical flip
- Byte 3: X position (0-255)

**Nametables:** The background is composed of a 32x30 grid of 8x8 tiles (256x240 pixels). Each byte in the nametable is a tile index. The NES has 2KB of nametable RAM, enough for two screens. Nametable data can be found in `.nam` files.

---

## File-by-file technical breakdown

### src/main.c - Game Logic

This is the entire game in one C file. It compiles to 6502 assembly via cc65.

#### Hardware register definitions (lines 32-41)

```c
#define PPU_CTRL      *((unsigned char*)0x2000)
```

These are C macros that create pointers to the NES hardware registers. Writing to the dereferenced pointer writes directly to the hardware. For example, `PPU_MASK = 0x1E` compiles to a `STA $2001` instruction. This is standard practice for memory-mapped I/O on the 6502.

The key registers used:

| Address | Name       | Purpose |
|---------|-----------|---------|
| $2000   | PPU_CTRL  | NMI enable (bit 7), sprite/BG pattern table selection, nametable base |
| $2001   | PPU_MASK  | Rendering enable - bit 3: show BG, bit 4: show sprites, bits 1-2: left column masking |
| $2002   | PPU_STATUS| Read to check vblank (bit 7), also resets $2005/$2006 write latch |
| $2003   | OAM_ADDR  | Set the write address within OAM (0-255) |
| $2004   | OAM_DATA  | Write one byte to OAM at the current address (auto-increments) |
| $2005   | PPU_SCROLL| Set horizontal then vertical scroll (two sequential writes) |
| $2006   | PPU_ADDR  | Set VRAM address for reads/writes (two sequential writes: high byte, low byte) |
| $2007   | PPU_DATA  | Read/write one byte of VRAM at the address set by $2006 (auto-increments) |
| $4016   | JOYPAD1   | Controller port - write 1 then 0 to strobe, then read 8 times for button states |

#### Global variables (lines 49-57)

All declared as `unsigned char` (8-bit), which is the natural word size for the 6502. Using larger types on this CPU generates significantly more code. Key teaching point: every variable costs precious RAM - the NES only has 2KB.

The variables with initial values (e.g., `x = 120`) are placed in the DATA segment by cc65. The nes.lib crt0 startup code copies these initial values from ROM into RAM before calling `main()`. Variables without initial values go into BSS (zeroed at startup).

#### Animation table (lines 79-85)

```c
static const unsigned char anim_tiles[4][8] = { ... };
```

`static const` causes cc65 to place this in the RODATA segment, which lives in ROM. This is important: ROM is read-only but doesn't use precious RAM. The table stores tile indices for 4 animation frames, each consisting of 8 tiles (2 columns x 4 rows).

The tile indices follow a pattern in the CHR layout. In the sprite sheet, tiles are arranged in a 16x16 grid (16 tiles per row). The hex numbering reflects this:
- Row 0: tiles $00-$0F
- Row 1: tiles $10-$1F
- Row 2: tiles $20-$2F
- etc.

So the player's standing frame uses tiles that form a 2x4 block: $01/$02, $11/$12, $21/$22, $31/$32 - which is a vertical strip 2 tiles wide and 4 rows down in the sprite sheet.

#### Controller reading (lines 105-120)

The NES controller uses a serial protocol. Writing 1 then 0 to $4016 latches the button states. Each subsequent read from $4016 returns one button (in bit 0), in the order: A, B, Select, Start, Up, Down, Left, Right.

The code shifts and ORs to build a byte where each bit represents a button. This is a standard NES controller read routine. Note: on real hardware, it's recommended to read the controller twice and compare results to avoid errors from the DPCM audio channel stealing CPU cycles, but this is fine for emulator development.

The resulting button byte layout:

```
Bit:  7    6    5      4     3   2    1    0
      A    B    Sel    Start Up  Down Left Right
```

#### draw_one_sprite (lines 132-138)

A helper function that writes 4 bytes to OAM_DATA ($2004). Each write auto-increments the internal OAM address. This is the simplest (though not most robust) way to update sprites. On real hardware, writing to $2004 during rendering can cause glitches; the proper method is OAM DMA via $4014 (writing the high byte of a 256-byte aligned RAM page triggers a hardware copy of that entire page to OAM). We use the simpler approach here for clarity.

#### draw_player (lines 151-178)

Draws the 8 sprites that make up the player character. Key logic:

1. Selects animation frame via `moved % 4`
2. Gets a pointer into the RODATA tile table
3. Calculates left/right X positions (swapped when facing left)
4. Sets OAM_ADDR to 0 to start writing from sprite 0
5. Loops through 4 rows x 2 columns, calling draw_one_sprite for each

When facing left (`plrdir = 0x40`), two things happen:
- The attribute byte gets bit 6 set (horizontal flip) so each individual tile is mirrored
- The left and right column X positions are swapped so the overall character image mirrors

#### main() initialization (lines 187-221)

The startup sequence:

1. `waitvsync()` - waits for vertical blank. Provided by nes.lib. Polls PPU_STATUS bit 7.
2. `PPU_MASK = 0` - disables rendering. **Critical**: many PPU registers can only be safely written during vblank or with rendering disabled.
3. Palette writes via PPU_ADDR/PPU_DATA - sets the VRAM write address to $3F00 (palette memory), then writes color values. Sequential writes to PPU_DATA auto-increment the address.
4. `PPU_MASK = 0x1E` - enables rendering. Bit breakdown:
   - Bit 1 (0x02): Show sprites in leftmost 8 pixels
   - Bit 2 (0x04): Show background in leftmost 8 pixels
   - Bit 3 (0x08): Show background
   - Bit 4 (0x10): Show sprites

#### Game loop (lines 226-290)

Runs once per frame (synchronized by `waitvsync()`). The structure is:

1. **Input**: Read controller state into `pad`
2. **Logic**: Update position based on input + physics
3. **Sync**: `waitvsync()` waits for vertical blank
4. **Draw**: Update OAM with new sprite positions

The gravity system is simple: if the player is above the floor (y < 150), they're in the air. During a jump, `jmptime` counts down while moving upward. When it hits 0, gravity pulls the player down. When y >= 150, the player is on the ground and can jump again. This creates a linear arc, not a parabolic one.

#### Interrupt vectors (lines 298-302)

```c
const void *vectors[] = {
    (void *) 0,    // NMI  ($FFFA)
    (void *) main, // RESET ($FFFC)
    (void *) 0     // IRQ  ($FFFE)
};
```

The 6502 reads three 16-bit addresses at the top of memory:
- **$FFFA-$FFFB (NMI)**: Called on every vblank if PPU_CTRL bit 7 is set. Currently unused (set to 0).
- **$FFFC-$FFFD (RESET)**: Where the CPU starts on power-on/reset. Points to `main()`.
- **$FFFE-$FFFF (IRQ)**: Hardware interrupt. Unused.

This array is placed in the VECTORS segment by the linker config, which maps to $FFFA in ROM.

**Teaching note**: The NMI vector being 0 means the vblank interrupt is not used. The game relies entirely on polling PPU_STATUS via `waitvsync()`. A more robust approach would be to implement an NMI handler that performs OAM DMA ($4014) from a RAM buffer each frame. This is how commercial NES games work and prevents sprite corruption. This is a good next step for an advanced lesson.

---

### src/graphics.s - Tile Data Loader

This is 65xx assembly (assembled by ca65). It serves two purposes:

#### 1. copy_mytiles_chr procedure (lines 24-45)

An assembly routine that copies the CHR tile data from ROM to the PPU's pattern table via PPU registers. It:
1. Loads the address of the CHR data into a zero-page pointer
2. Disables rendering (writes 0 to $2001)
3. Sets PPU address to $0000 (start of pattern table)
4. Copies 32 pages of 256 bytes (8KB total) via a nested loop

**Note**: This routine exists but is **not currently called** from main.c. The CHR data reaches the PPU through a different mechanism - it's placed in the CHARS segment which the linker puts into the CHR-ROM section of the iNES file. The emulator/hardware loads CHR-ROM directly into the PPU's pattern table memory. This routine would only be needed for CHR-RAM (some cartridges use RAM instead of ROM for pattern tables).

#### 2. CHR data inclusion (line 48)

```asm
.segment "CHARS"
mytiles_chr: .incbin "../assets/sprites/walk1.chr"
```

The `.incbin` directive includes the raw binary contents of `walk1.chr` (8192 bytes) directly into the CHARS segment. The linker config maps CHARS to the CHR-ROM section of the output file. This is how the sprite graphics get into the ROM.

The CHR file contains 256 tiles in the NES's 2-bit-per-pixel format. Each tile is 16 bytes: 8 bytes for bit plane 0 (low bit of each pixel), followed by 8 bytes for bit plane 1 (high bit). The two bits combine to give values 0-3, selecting a color from the assigned palette.

---

### cfg/nes.cfg - Linker Configuration

This file tells ld65 how to arrange the compiled code into a valid NES ROM.

#### SYMBOLS section

```
__STACKSIZE__: value = $0300   # 768 bytes for cc65's software stack
NES_CHR_BANKS: value = 1       # One 8KB CHR bank
NES_MIRRORING: value = 1       # Vertical mirroring (horizontal scrolling)
NES_MAPPER:    value = 0       # Mapper 0 (NROM) - no bank switching
```

These are used by nes.lib's crt0 to generate the iNES header.

**Mapper 0 (NROM)** is the simplest cartridge type: 32KB PRG-ROM + 8KB CHR-ROM, no bank switching. This limits the game to 32KB of code/data and 8KB of graphics. Zelda 2 used Mapper 1 (MMC1) with bank switching for much more content - that's a possible future upgrade.

**Vertical mirroring** means the two physical nametables are arranged side-by-side, which suits horizontal scrolling (the direction Zelda 2 scrolls).

#### MEMORY section

Defines the physical memory regions:

| Region | Address      | Size  | Purpose |
|--------|-------------|-------|---------|
| ZP     | $0002-$001B | 26B   | Zero page - fast-access variables (cc65 runtime uses these) |
| HEADER | File offset 0| 16B  | iNES file header |
| ROM0   | $8000-$FFF9 | ~32KB | All program code and constant data |
| ROMV   | $FFFA-$FFFF | 6B    | CPU interrupt vectors |
| CHR    | $0000       | 16KB  | Pattern table data (tile graphics) |
| SRAM   | $0500-$07FF | 768B  | cc65 software stack |
| RAM    | $6000-$7FFF | 8KB   | Variables, BSS, heap |

**Important architectural detail**: The NES CPU address space is:
- $0000-$07FF: 2KB internal RAM (mirrored at $0800-$1FFF)
- $2000-$2007: PPU registers (mirrored every 8 bytes up to $3FFF)
- $4000-$4017: APU and I/O registers
- $4020-$FFFF: Cartridge space (ROM, extra RAM, mapper registers)

The zero page ($0000-$00FF) is special on the 6502: instructions that reference it use only 1 byte for the address instead of 2, making them faster and smaller. cc65 uses a few zero-page locations for the software stack pointer and temporary variables.

#### SEGMENTS section

Maps logical segments to physical memory:

| Segment  | Memory | Type | Content |
|----------|--------|------|---------|
| ZEROPAGE | ZP     | rw   | cc65 runtime zero-page variables |
| HEADER   | HEADER | ro   | iNES header (generated by nes.lib crt0) |
| STARTUP  | ROM0   | ro   | crt0 initialization code (from nes.lib) |
| CODE     | ROM0   | ro   | Compiled C functions |
| RODATA   | ROM0   | ro   | Read-only data (const arrays like anim_tiles) |
| DATA     | ROM0/RAM | rw | Initialized variables (stored in ROM, copied to RAM at startup) |
| VECTORS  | ROMV   | rw   | Interrupt vector table |
| CHARS    | CHR    | rw   | CHR-ROM tile graphics |
| BSS      | RAM    | bss  | Uninitialized variables (zeroed at startup) |

The DATA segment has both `load` (ROM0) and `run` (RAM) addresses. The initial values are stored in ROM, and the crt0 startup copies them to RAM before calling `main()`. This is why variables like `unsigned char x = 120` work correctly.

#### FEATURES section

Configures cc65's constructor/destructor system. This allows library code to register initialization functions that run before `main()`. Not actively used in our code, but required by nes.lib.

---

### Makefile - Build System

The build process has three stages:

1. **cc65**: Compiles C source to 6502 assembly (`.c` -> `.s`)
2. **ca65**: Assembles into object files (`.s` -> `.o`)
3. **ld65**: Links object files with the runtime library and linker config to produce the ROM (`.o` -> `.nes`)

The `-t nes` flag tells cc65/ca65 to target the NES platform, which affects register sizes, calling conventions, and available library functions.

---

### assets/ - Graphics Data

#### CHR files (.chr)

Raw binary files containing NES tile graphics. Each file is exactly 8192 bytes (8KB), containing 256 tiles.

Each tile is 16 bytes, encoding an 8x8 pixel image:
```
Bytes 0-7:   Bit plane 0 (low bit of each pixel's color)
Bytes 8-15:  Bit plane 1 (high bit of each pixel's color)
```

For each pixel, the two bit planes combine: `(plane1_bit << 1) | plane0_bit` gives a value 0-3. Value 0 is transparent (for sprites) or background color. Values 1-3 select from the assigned palette.

Tools for editing: YY-CHR, NES Screen Tool (NESST), or Tilemap Studio.

#### NAM files (.nam)

Nametable data - 1024 bytes defining a background screen:
- First 960 bytes: 30 rows x 32 columns of tile indices (which tile from the pattern table goes in each position)
- Last 64 bytes: Attribute table (assigns palettes to 2x2 tile groups)

#### PAL files (.pal)

Palette data - 16 bytes defining 4 palettes of 4 colors each. Each byte is an NES color value ($00-$3F).

---

## NES development concepts for teaching

### The frame loop

The NES renders at 60 frames per second (NTSC). The CPU has approximately 29,780 cycles per frame to do all game logic. The PPU draws the screen automatically from top to bottom, and there's a short "vertical blank" (vblank) period after it finishes the last scanline where it's safe to update video memory. `waitvsync()` blocks until this vblank period.

### Why 8-bit?

All variables are `unsigned char` (0-255) because the 6502 is an 8-bit CPU. Using `int` (16-bit) generates much slower code since every operation requires multiple instructions. This is a great teaching point about how hardware constraints affect programming.

### Memory-mapped I/O

There are no special "write to hardware" instructions. Instead, hardware devices appear at specific memory addresses. Writing `PPU_MASK = 0x1E` is literally the same as writing to a memory location - the hardware intercepts it. This is how most embedded systems work and is a fundamental computer architecture concept.

### Hexadecimal

The code uses hex extensively (0x3F, 0x12, etc.). NES development is a practical context for learning hex:
- Memory addresses are in hex
- Color values are in hex
- Tile indices map to a hex grid
- Hardware register bits are easier to read in hex

### Limitations as creative constraints

The NES's limitations (256 colors but only 25 on screen, 64 sprites max, 8 per scanline, 32KB code, etc.) force creative problem-solving. Commercial NES games achieved remarkable results within these constraints. These limitations make good design challenges for students.

---

## Future development roadmap

### Immediate next steps
1. **Background tiles**: Load a nametable to display platforms. Use the existing `.nam` placeholder files as a starting point.
2. **Tile-based collision**: Check the player's position against the background tile map to detect floors and walls.
3. **NMI handler + OAM DMA**: Replace direct OAM writes with a proper NMI interrupt handler that uses DMA ($4014) for reliable sprite updates. This requires a custom startup in assembly (reset.s) to replace nes.lib's crt0.

### Medium-term goals (Zelda 2 features)
4. **Horizontal scrolling**: Update PPU_SCROLL each frame, swap nametables when crossing screen boundaries.
5. **Enemies**: Add enemy sprites with patrol AI and player-enemy collision.
6. **Sword attack**: Add an attack animation and hitbox when pressing A/B.
7. **Health/damage system**: Track player and enemy HP, implement knockback.

### Advanced goals
8. **Sound effects**: Write to the APU registers ($4000-$4013) for square wave, triangle, and noise channels.
9. **Music**: Implement a simple music engine or use an existing one (like FamiTone).
10. **Bank switching**: Move to Mapper 1 (MMC1) for more code and graphics space.
11. **Overworld map**: Zelda 2's signature feature - a top-down map that transitions to side-scrolling action scenes.

---

## Useful references

- **NESdev Wiki** (nesdev.org/wiki): The definitive NES technical reference
- **cc65 documentation**: cc65.github.io/doc
- **NES color palette**: Search "NES palette" for visual charts of all 64 color values
- **NES Screen Tool (NESST)**: For editing tiles, nametables, and palettes
- **YY-CHR**: Another tile editor, good for viewing and editing CHR files
- **FCEUX debugger**: The emulator has built-in debugging tools (PPU viewer, nametable viewer, hex editor) - very useful for understanding what's happening
