// =============================================================================
// NES GAME - Zelda 2 Inspired
// =============================================================================
// This is the main game code. It runs on the NES (Nintendo Entertainment System)
// using the cc65 C compiler.
//
// HOW THE NES WORKS (quick summary):
// - The NES has a CPU (the 6502) and a PPU (Picture Processing Unit)
// - The CPU runs your game logic (movement, input, etc.)
// - The PPU draws everything on screen (sprites, backgrounds)
// - You talk to the PPU by writing to special memory addresses ($2000-$2007)
// - Sprites are small images (8x8 pixels) that can move freely on screen
// - Our player character is made of 8 sprites arranged in a 2x4 grid
//
// TO CHANGE THINGS:
// - Player speed: look for "y - 3" and "y + 3" (jump/gravity) or "x++" / "x--"
// - Player colors: look for the palette section (0x30, 0x27, 0x17)
// - Animation speed: change the "moveWait >= 7" number (lower = faster)
// - Jump height: change "jmptime = 15" (higher = longer jump)
// - Floor position: change "y < 150" (lower number = higher floor)
// =============================================================================

#include <nes.h>

// =============================================================================
// HARDWARE ADDRESSES
// =============================================================================
// The NES has special hardware at fixed memory addresses. Writing a value to
// these addresses controls the PPU (graphics chip) and other hardware.
// Think of them like remote controls for the TV screen.

#define PPU_CTRL      *((unsigned char*)0x2000)  // PPU control: turn on features like NMI
#define PPU_MASK      *((unsigned char*)0x2001)  // PPU mask: show/hide sprites & background
#define PPU_STATUS    *((unsigned char*)0x2002)  // PPU status: check if PPU is ready
#define OAM_ADDR      *((unsigned char*)0x2003)  // Sprite memory: which sprite to write to
#define OAM_DATA      *((unsigned char*)0x2004)  // Sprite memory: the data to write
#define PPU_SCROLL    *((unsigned char*)0x2005)  // Scroll position of the screen
#define PPU_ADDR      *((unsigned char*)0x2006)  // PPU address: where in video memory to write
#define PPU_DATA      *((unsigned char*)0x2007)  // PPU data: the value to write there

#define JOYPAD1       *((unsigned char*)0x4016)  // Controller port 1

// =============================================================================
// GAME VARIABLES
// =============================================================================
// These control the player's position, movement, and animation.
// Try changing the starting values to see what happens!

unsigned char x = 120;        // Player X position (0 = left edge, 255 = right edge)
unsigned char y = 120;        // Player Y position (0 = top, bigger = lower on screen)
unsigned char pad;            // Stores which buttons are pressed this frame
unsigned char jump = 1;       // Can the player jump? (1 = yes, on ground)
unsigned char jmptime = 0;    // How many frames of upward jump are left
unsigned char plrdir = 0x00;  // Which way the player faces (0x00 = right, 0x40 = left)
unsigned char plrxmod = 0;    // Helper for sprite flipping (0 = right, 1 = left)
unsigned char moved = 0;      // Counts steps - used to pick animation frame
unsigned char moveWait = 0;   // Delays between animation frames (makes walking look smooth)

// =============================================================================
// ANIMATION TILES TABLE
// =============================================================================
// Our player character is 2 tiles wide and 4 tiles tall (16x32 pixels).
// That means 8 tiles per animation frame.
//
// We have 4 animation frames for walking. The tile numbers here match
// the tiles in the CHR (character/graphics) data file (walk1.chr).
//
// To add new animation frames, you'd:
// 1. Draw new tiles in your tile editor
// 2. Note which tile numbers they are
// 3. Add a new row to this table
//
// Layout of tiles in each frame:
//   [left-top] [right-top]      <- head
//   [left-2]   [right-2]        <- upper body
//   [left-3]   [right-3]        <- lower body
//   [left-bot] [right-bot]      <- feet

static const unsigned char anim_tiles[4][8] = {
    //  LT    RT    L2    R2    L3    R3    LB    RB
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },  // Frame 0: standing
    { 0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a },  // Frame 1: walk step 1
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },  // Frame 2: standing (same as 0)
    { 0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c },  // Frame 3: walk step 2
};

// =============================================================================
// READ CONTROLLER
// =============================================================================
// The NES controller is read by "strobing" it (write 1 then 0 to $4016),
// then reading 8 bits one at a time. Each bit is one button:
//
//   Bit 7 (0x80) = A button
//   Bit 6 (0x40) = B button
//   Bit 5 (0x20) = Select
//   Bit 4 (0x10) = Start
//   Bit 3 (0x08) = Up
//   Bit 2 (0x04) = Down
//   Bit 1 (0x02) = Left
//   Bit 0 (0x01) = Right
//
// To check if a button is pressed, use: if (pad & 0x01) { ... }
// Replace 0x01 with the bit value for the button you want to check.

unsigned char read_controller(void) {
    unsigned char result = 0;
    unsigned char i;

    // Strobe the controller to latch button states
    JOYPAD1 = 1;
    JOYPAD1 = 0;

    // Read 8 buttons, one bit at a time
    for (i = 0; i < 8; i++) {
        result = result << 1;        // Shift previous bits left
        if (JOYPAD1 & 1)             // If this button is pressed...
            result = result | 1;     // ...set the lowest bit
    }
    return result;
}

// =============================================================================
// DRAW PLAYER SPRITE
// =============================================================================
// This writes one sprite (one 8x8 tile) directly to the PPU's sprite memory.
// Each sprite needs 4 values written in order:
//   1. Y position
//   2. Tile number (which graphic to show)
//   3. Attributes (palette + flip flags)
//   4. X position

void draw_one_sprite(unsigned char sy, unsigned char tile,
                     unsigned char attr, unsigned char sx) {
    OAM_DATA = sy;
    OAM_DATA = tile;
    OAM_DATA = attr;
    OAM_DATA = sx;
}

// =============================================================================
// DRAW PLAYER
// =============================================================================
// This function draws all 8 sprites that make up the player character.
// It uses the animation table above to pick the right tiles for the
// current animation frame.
//
// When the player faces left, we flip each sprite horizontally using
// the attribute byte (0x40 = flip horizontal). We also swap which
// column is left and which is right, so the image mirrors correctly.

void draw_player(void) {
    unsigned char frame;
    unsigned char row;
    unsigned char left_x, right_x;
    const unsigned char *tiles;

    // Pick the current animation frame (cycles through 0, 1, 2, 3)
    frame = moved % 4;
    tiles = anim_tiles[frame];

    // Work out X positions for left and right columns
    // When facing left (flipped), we swap the columns
    if (plrdir == 0x40) {
        left_x = x + 8;
        right_x = x;
    } else {
        left_x = x;
        right_x = x + 8;
    }

    // Tell the PPU we're writing sprites starting at sprite 0
    OAM_ADDR = 0x00;

    // Draw 4 rows of 2 sprites each (left tile, then right tile)
    for (row = 0; row < 4; row++) {
        draw_one_sprite(y + (row * 8), tiles[row * 2],     plrdir, left_x);
        draw_one_sprite(y + (row * 8), tiles[row * 2 + 1], plrdir, right_x);
    }
}

// =============================================================================
// MAIN - Game Entry Point
// =============================================================================
// This is where the game starts. It sets up the PPU, loads colors,
// and then runs the game loop forever.

void main(void) {
    // --- STARTUP ---
    // Wait for the PPU to warm up (takes a couple of frames)
    waitvsync();

    // Turn off the screen while we set things up
    PPU_MASK = 0;

    // --- SET COLORS ---
    // The NES uses "palettes" - small lists of colors.
    // Palette memory starts at PPU address $3F00.
    // We write the address in two bytes (high then low), then the color value.
    //
    // NES color values are numbers 0x00-0x3F. You can look up an
    // "NES color palette chart" online to see what each number looks like.
    // Some common ones:
    //   0x0F = Black        0x30 = White
    //   0x12 = Blue         0x16 = Red
    //   0x1A = Green        0x27 = Orange

    // Background color
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    PPU_DATA = 0x12;   // Blue background - try changing this!

    // Sprite colors (palette 0, colors 1-3)
    // Color 0 is always transparent for sprites
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x11;
    PPU_DATA = 0x30;   // Color 1: White (used for eyes)
    PPU_DATA = 0x27;   // Color 2: Orange (used for outline)
    PPU_DATA = 0x17;   // Color 3: Brown (used for main body)

    // Turn the screen on! Show sprites and background.
    PPU_MASK = 0x1E;

    // =========================================================================
    // GAME LOOP - runs forever, once per frame
    // =========================================================================
    while(1) {

        // --- READ INPUT ---
        pad = read_controller();

        // --- MOVEMENT ---
        // Check each direction. You can change the speed by changing how much
        // x or y changes (e.g., "x -= 2" for faster horizontal movement).

        if (pad & 0x08) {  // UP = Jump
            if (jump == 1 && jmptime <= 0) {
                y = y - 3;
                jmptime = 15;  // Jump lasts 15 frames - increase for higher jump
            }
        }

        if (pad & 0x04) {  // DOWN
            if (y < 150) {
                y++;
            }
        }

        if (pad & 0x02) {  // LEFT
            x--;
            plrdir = 0x40;   // Face left (0x40 = horizontal flip)
            plrxmod = 1;
            moveWait++;
            if (moveWait >= 7) {       // Every 7 frames, advance animation
                moved = moved + 1;
                moveWait = 0;
            }
        }

        if (pad & 0x01) {  // RIGHT
            x++;
            plrdir = 0x00;   // Face right (no flip)
            plrxmod = 0;
            moveWait++;
            if (moveWait >= 7) {
                moved = moved + 1;
                moveWait = 0;
            }
        }

        // --- GRAVITY ---
        // If the player is above the floor (y < 150), apply gravity.
        // During a jump, move up for jmptime frames, then fall down.
        if (y < 150) {
            jump = 0;  // Player is in the air, can't jump again
            if (jmptime > 0) {
                jmptime--;
                y = y - 3;    // Moving up (jump)
            } else {
                y = y + 3;    // Falling down (gravity)
            }
        } else {
            jump = 1;  // On the ground, can jump again
        }

        // --- WAIT FOR NEXT FRAME ---
        waitvsync();

        // --- DRAW ---
        draw_player();
    }
}

// =============================================================================
// INTERRUPT VECTORS
// =============================================================================
// The NES processor looks at address $FFFA to know what to do.
// We must point these to our main function.
const void *vectors[] = {
    (void *) 0,    // NMI Vector (unused for now)
    (void *) main, // Reset Vector (Start the game here!)
    (void *) 0     // IRQ Vector (unused)
};
