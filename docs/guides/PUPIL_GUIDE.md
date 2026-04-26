# Pupil Guide - NES Game (Zelda 2 Inspired)

## What is this project?

This is a game for the **NES** (Nintendo Entertainment System) - the same console that played the original Super Mario Bros and Zelda games in the 1980s. We're writing the game in C and building it into a `.nes` ROM file that runs in an emulator.

Right now the game has a player character that can walk left and right, with animation, and jump with gravity. The goal is to build this into a side-scrolling action game inspired by Zelda 2: The Adventure of Link.

---

## Steps - Learning the game piece by piece

The game is built up in steps. Each step is a complete, working game that you can build and play. You can jump between steps to see how each feature was added.

```text
steps/
  Step_1_Player_Movement/    <-- Just the player character on a blue background
  Step_2_Background_Level/   <-- Adds a background level with platforms and ground
  Step_3_Enemies_And_Items/  <-- Adds enemies, gems, and a heart pickup
```

**To try a step**, open a terminal in that step's folder and run:

```bash
cd steps/Step_1_Player_Movement
make run
```

Each step has its own complete set of files. You can edit any step without breaking the others. If you mess something up, you can always look at the next step to see what the code should look like.

---

## Project folder layout

```text
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

If you want to draw your own tiles, sprites, and levels, jump to
**[Designing your own graphics](#designing-your-own-graphics)** at the
bottom of this guide. The full tile-editor walkthrough lives in
[`TILE_EDITOR_GUIDE.md`](TILE_EDITOR_GUIDE.md).

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
|--------|--------------|
| `0x0F` | Black        |
| `0x00` | Grey         |
| `0x12` | Blue         |
| `0x14` | Purple       |
| `0x16` | Red          |
| `0x1A` | Green        |
| `0x27` | Orange       |
| `0x30` | White        |

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

```text
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

## Designing your own graphics

This project ships with its own **visual tile editor** — a web page
with tools for drawing tiles, building sprites and laying out
backgrounds. You don't need to download anything extra.

### Opening the editor

1. Press **Ctrl+Shift+P → Tasks: Run Task → Open Editor via Playground Server**.
2. A browser tab opens with the **Backgrounds** page.
3. Click the **Sprites** link at the top to switch pages. Both pages share one project; your work auto-saves between them.

### What it can do

- **Paint 8×8 tiles** on a 256-slot tileset, share tiles between backgrounds and sprites.
- **Copy a tile's pixels** with **C** and paste into another slot with **V** — the fastest way to make variants of an existing shape.
- **Multi-tile sprites** (up to 8×8 tiles each) with flip-H / flip-V and per-sprite palettes.
- **Multiple named backgrounds** per project — click **+ New** above the background grid to start a second scene.
- **▶ Play in NES** — every editor page (Backgrounds, Sprites, Behaviour, Builder, Code) has a Play button that compiles your project into a real `.nes` ROM and runs it in the embedded emulator.  Next to it: **⬇ ROM** saves the `.nes` to disk for any other emulator, and the **In browser / Local (fceux)** dropdown picks where the ROM runs (Local mode launches fceux on the playground server — only works when fceux is installed there).

### Moving graphics into the step code

When you're happy with your art, **Export ▾** on the backgrounds page
gives you `.chr`, `.nam` and `.pal` files that drop into
`assets/sprites/`, `assets/backgrounds/` and `assets/palettes/`. Once
in place, the step folders pick them up on the next `make run`.

If you started in the text editor (`my_tiles.txt`) and want to move to
the visual editor, run this first:

```bash
python3 tools/convert_my_tiles.py
```

It writes `assets/pupil/my_project.json`. Open the editor, click
**Import…** on each page, pick the JSON, and your tiles, palettes,
sprites and background arrive in the new format.

Full editor walkthrough: [`TILE_EDITOR_GUIDE.md`](TILE_EDITOR_GUIDE.md).

---

## 🧱 Building a whole game by ticking boxes (Builder page)

There's a fifth tab in the editor called **🧱 Builder**.  It's
the easiest way to make a real working game — you don't have to
write any C.

In the Builder you tick modules (Players, Enemies, Pickups,
Damage, HUD, Doors, Dialogue, …) and fill in the settings you
care about.  Everything else gets generated for you when you
press ▶ Play.

Things you can build out of the box:

- Platformers with walking + jumping + gravity + wall collision.
- Two-player co-op games (Controller 2 uses the `I` / `J` / `K` /
  `L` keys + `O` for A + `U` for B).
- Enemies that walk back-and-forth, chase the player, or stand
  still.  Animate them by tagging an animation **Enemy / Walk**
  on the Sprites page.
- Pickups (coins, keys) that disappear on touch and increment a
  counter.
- Hearts that appear at the top of the screen (paint one tile
  tagged **HUD** and it gets used as the heart icon).
- Doors that either teleport within the same room, or swap you
  to a whole new room you painted on the Backgrounds page.
- NPCs that say something when you press B near them.  You need
  to paint your own letter tiles for this — see the "Dialogue
  font" section in [BUILDER_GUIDE.md](BUILDER_GUIDE.md).

Full module reference + the font-tile convention for Dialogue
live in [BUILDER_GUIDE.md](BUILDER_GUIDE.md).

---

## Ideas for next steps

Look at the step folders to see how each feature was added! Each step builds on the one before it.

**Step 1 (where you start):** Player character moves and jumps on a blue screen.

**Step 2 adds:**
- Background tiles (ground, platforms, clouds, castle walls, a door)
- The level is defined in a nametable file (`level1.nam`)
- Multiple background color palettes
- Look at `steps/Step_2_Background_Level/src/main.c` to see how backgrounds are loaded

**Step 3 adds:**
- A slime enemy that patrols back and forth on the ground
- A skeleton enemy that patrols on a floating platform
- Collectible gems (4 of them) and a heart pickup
- Collision detection between the player and items
- Multiple sprite palettes (different colors for player, enemies, items)
- Look at `steps/Step_3_Enemies_And_Items/src/main.c` to see how enemies and items work

**Things you could try adding next:**
1. **Make enemies hurt the player** - check if player overlaps an enemy, reduce health
2. **Add a sword attack** - press A to swing a sword sprite, check if it hits enemies
3. **Make enemies disappear when hit** - track enemy health, remove when defeated
4. **Add scrolling** so the level is wider than one screen
5. **Add sound effects** using the NES audio registers
6. **Design your own level** - edit the nametable to create a new layout

---

## Quick reference - NES screen coordinates

```text
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
