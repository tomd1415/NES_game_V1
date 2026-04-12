# Pupil Guide - NES Game (Zelda 2 Inspired)

## What is this project?

This is a game for the **NES** (Nintendo Entertainment System) - the same console that played the original Super Mario Bros and Zelda games in the 1980s. We're writing the game in C and building it into a `.nes` ROM file that runs in an emulator.

Right now the game has a player character that can walk left and right, with animation, and jump with gravity. The goal is to build this into a side-scrolling action game inspired by Zelda 2: The Adventure of Link.

---

## Project folder layout

```
attempt1/
  src/               <-- Source code (the files you edit to change the game)
    main.c           <-- The main game code - player, movement, drawing
    graphics.s       <-- Assembly file that loads the sprite graphics

  assets/            <-- Graphics and data files
    sprites/         <-- Character and object graphics (.chr files)
      walk1.chr      <-- The player character sprite sheet (currently in use)
      enemy_placeholder.chr
      items_placeholder.chr
    backgrounds/     <-- Background tile graphics and level maps
      tiles.chr
      bg_placeholder.chr
      level_placeholder.nam
    palettes/        <-- Color palette files
      test2.pal

  cfg/               <-- Configuration
    nes.cfg          <-- Tells the compiler how to arrange the ROM

  build/             <-- Created automatically when you build (don't edit these)
  game.nes           <-- The built ROM file (created by 'make')
  Makefile           <-- Build instructions (how to turn code into a ROM)
```

**The file you'll edit most is `src/main.c`** - this is where all the game logic lives.

---

## How to build and run

Open a terminal in the project folder and type:

```bash
make          # Build the ROM
make run      # Build and run in the emulator
make clean    # Delete build files and start fresh
```

Every time you change the code, run `make run` to see your changes.

---

## Things you can change right now

### Change the background color

In `src/main.c`, find this line (around line 210):

```c
PPU_DATA = 0x12;   // Blue background - try changing this!
```

Replace `0x12` with a different color number. Here are some to try:

| Value  | Color        |
|--------|-------------|
| `0x0F` | Black       |
| `0x00` | Grey        |
| `0x12` | Blue        |
| `0x14` | Purple      |
| `0x16` | Red         |
| `0x1A` | Green       |
| `0x27` | Orange      |
| `0x30` | White       |

Search online for "NES color palette chart" to see all 64 colors.

### Change the player's colors

Find these lines (around line 216):

```c
PPU_DATA = 0x30;   // Color 1: White (used for eyes)
PPU_DATA = 0x27;   // Color 2: Orange (used for outline)
PPU_DATA = 0x17;   // Color 3: Brown (used for main body)
```

Change any of these to different color numbers from the table above. Each sprite pixel uses one of these three colors (or transparent).

### Change the player's starting position

Find these lines (around line 49):

```c
unsigned char x = 120;   // Player X position
unsigned char y = 120;   // Player Y position
```

- `x` goes from 0 (left edge) to 255 (right edge). The screen is 256 pixels wide.
- `y` goes from 0 (top) to about 230 (bottom). The screen is 240 pixels tall.

### Change the movement speed

In the game loop, find the LEFT and RIGHT sections:

```c
if (pad & 0x02) {  // LEFT
    x--;             // Move 1 pixel left per frame
```

Change `x--` to `x -= 2` to move 2 pixels per frame (faster), or `x -= 3` for even faster.

### Change the jump

Find this section:

```c
if (pad & 0x08) {  // UP = Jump
    if (jump == 1 && jmptime <= 0) {
        y = y - 3;
        jmptime = 15;  // Jump lasts 15 frames
    }
}
```

- **Jump height**: Change `jmptime = 15` to a bigger number (like 25) for a higher jump, or smaller (like 8) for a shorter jump.
- **Jump speed**: Change `y = y - 3` to `y = y - 5` for a faster upward movement.

Also find the gravity section:

```c
y = y - 3;    // Moving up (jump)
...
y = y + 3;    // Falling down (gravity)
```

- **Fall speed**: Change `y = y + 3` to `y = y + 1` for floaty gravity, or `y = y + 5` for heavy gravity.

### Change the floor position

Find this line:

```c
if (y < 150) {
```

The number `150` is where the "floor" is. Change it to:
- `200` to put the floor near the bottom of the screen
- `100` to put the floor higher up
- `50` for a very high floor

### Change the animation speed

Find this line:

```c
if (moveWait >= 7) {       // Every 7 frames, advance animation
```

- **Faster animation**: Change `7` to `3` or `4`
- **Slower animation**: Change `7` to `12` or `15`

### Use different buttons

The controller buttons are checked using these codes:

```c
if (pad & 0x80) { }  // A button
if (pad & 0x40) { }  // B button
if (pad & 0x20) { }  // Select
if (pad & 0x10) { }  // Start
if (pad & 0x08) { }  // Up
if (pad & 0x04) { }  // Down
if (pad & 0x02) { }  // Left
if (pad & 0x01) { }  // Right
```

For example, to make the A button trigger a jump instead of Up, change:

```c
if (pad & 0x08) {  // UP = Jump
```

to:

```c
if (pad & 0x80) {  // A = Jump
```

---

## How the animation works

The player character is made of **8 small tiles** (8x8 pixels each) arranged in a 2-wide by 4-tall grid:

```
[head-L ] [head-R ]     <- row 0
[body-L ] [body-R ]     <- row 1
[legs-L ] [legs-R ]     <- row 2
[feet-L ] [feet-R ]     <- row 3
```

There are **4 animation frames** that cycle when the player walks: stand, step1, stand, step2. The tile numbers for each frame are stored in the `anim_tiles` table:

```c
static const unsigned char anim_tiles[4][8] = {
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },  // Frame 0: standing
    { 0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a },  // Frame 1: walk step 1
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },  // Frame 2: standing
    { 0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c },  // Frame 3: walk step 2
};
```

Each number (like `0x01`) is a tile number in the sprite sheet (`walk1.chr`). If you draw new tiles in a tile editor, you can change these numbers to use your new tiles.

---

## How to add new sprites (e.g. an enemy)

To add a new sprite on screen, you need to write 4 values to the PPU after the player is drawn. For example, to add a static enemy at position (200, 150):

In the game loop, after `draw_player();`, add:

```c
// Draw a simple enemy sprite
draw_one_sprite(150, 0x03, 0x00, 200);
//               Y    tile  attr  X
```

- `150` = Y position (how far down)
- `0x03` = tile number (which graphic from the sprite sheet)
- `0x00` = attributes (palette 0, no flipping)
- `200` = X position (how far across)

You'll need to make sure tile `0x03` in your CHR file actually has a graphic drawn in it. Use a tile editor like YY-CHR or NES Screen Tool.

---

## How to create new sprite graphics

1. Download a tile editor like **YY-CHR** or **NES Screen Tool (NESST)**
2. Open `assets/sprites/walk1.chr` in the editor
3. You'll see a grid of 8x8 pixel tiles - each tile can use 4 colors (transparent + 3 from the palette)
4. Draw your new tiles and note their tile numbers (shown in the editor)
5. Use those numbers in the `anim_tiles` table or in `draw_one_sprite()` calls
6. Save the file and run `make run` to see your changes

---

## Ideas for next steps

Here are some features you could try adding, roughly in order of difficulty:

1. **Change the A or B button to do something** (e.g. print a different sprite, change color)
2. **Add a static enemy sprite** on screen (see "How to add new sprites" above)
3. **Make the enemy move** back and forth (add an `enemy_x` variable, change it each frame)
4. **Add collision detection** between player and enemy (check if their positions overlap)
5. **Add a background** with platforms (load a nametable - this is more advanced)
6. **Add scrolling** so the level is wider than one screen
7. **Add sound effects** using the NES audio registers

---

## Quick reference - NES screen coordinates

```
(0,0) -------- X increases ---------> (255,0)
  |                                       |
  |            NES SCREEN                 |
  |           256 x 240 pixels            |
  |                                       |
  Y increases                             |
  |                                       |
  v                                       |
(0,239) -----------------------------> (255,239)
```

- The screen is **256 pixels wide** and **240 pixels tall**
- X = 0 is the left edge, X = 255 is the right edge
- Y = 0 is the top, Y = 239 is the bottom
- The NES can show up to **64 sprites** at once (we use 8 for the player)
- Each sprite is **8x8 pixels**
