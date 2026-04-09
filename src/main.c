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

// waitvsync() is defined in reset.s - it waits for the next video frame
void __fastcall__ waitvsync(void);

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
#define OAM_DMA       *((unsigned char*)0x4014)  // Sprite DMA: fast copy all sprites at once
#define PPU_SCROLL    *((unsigned char*)0x2005)  // Scroll position of the screen
#define PPU_ADDR      *((unsigned char*)0x2006)  // PPU address: where in video memory to write
#define PPU_DATA      *((unsigned char*)0x2007)  // PPU data: the value to write there

#define JOYPAD1       *((unsigned char*)0x4016)  // Controller port 1

// =============================================================================
// OAM BUFFER (Sprite Memory)
// =============================================================================
// The NES can show 64 sprites on screen. Each sprite needs 4 bytes:
//   Byte 0: Y position (how far down the screen)
//   Byte 1: Tile number (which small image to show)
//   Byte 2: Attributes (color palette, flip horizontally/vertically)
//   Byte 3: X position (how far across the screen)
//
// We store all sprite data in a buffer (a block of memory at address $0200).
// Every frame, the NMI handler copies this entire buffer to the PPU at once
// using DMA (Direct Memory Access) - this is much faster and more reliable
// than writing sprites one by one.
//
// These are defined in reset.s (the assembly startup file):
extern unsigned char oam_buf[256];  // 64 sprites x 4 bytes = 256 bytes
extern unsigned char nmi_ready;     // Flag: 1 = game logic done, NMI can update screen

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
// DRAW PLAYER
// =============================================================================
// This function writes the player's 8 sprites into the OAM buffer.
// It uses the animation table above to pick the right tiles for the
// current animation frame.
//
// When the player faces left, we flip each sprite horizontally using
// the attribute byte (0x40 = flip horizontal). We also swap which
// column is left and which is right, so the image mirrors correctly.

void draw_player(void) {
    unsigned char frame;
    unsigned char row, col;
    unsigned char idx;
    unsigned char tile_x;
    const unsigned char *tiles;

    // Pick the current animation frame (cycles through 0, 1, 2, 3)
    frame = moved % 4;
    tiles = anim_tiles[frame];

    idx = 0;  // Start at sprite 0 in the OAM buffer

    // Loop through 4 rows and 2 columns = 8 sprites total
    for (row = 0; row < 4; row++) {
        for (col = 0; col < 2; col++) {
            // Y position: each row is 8 pixels further down
            oam_buf[idx] = y + (row * 8);

            // Tile number: when facing left, swap left/right columns
            if (plrdir == 0x40) {
                oam_buf[idx + 1] = tiles[row * 2 + (1 - col)];
            } else {
                oam_buf[idx + 1] = tiles[row * 2 + col];
            }

            // Attributes: palette 0, plus horizontal flip if facing left
            oam_buf[idx + 2] = 0x00 | plrdir;

            // X position: when facing left, mirror the column positions
            if (plrdir == 0x40) {
                tile_x = (1 - col) * 8;
            } else {
                tile_x = col * 8;
            }
            oam_buf[idx + 3] = x + tile_x;

            idx += 4;  // Move to next sprite (4 bytes per sprite)
        }
    }

    // Hide all unused sprites by moving them off-screen (Y = 0xFF)
    // This prevents leftover sprites from previous frames showing up
    while (idx < 255) {
        oam_buf[idx] = 0xFF;
        idx += 4;
    }
}

// =============================================================================
// MAIN - Game Entry Point
// =============================================================================
// This is where the game starts. It sets up the PPU, loads colors,
// and then runs the game loop forever.

void main(void) {
    unsigned char i;

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

    // --- CLEAR ALL SPRITES ---
    // Move every sprite off-screen so nothing random appears
    for (i = 0; i < 255; i += 4) {
        oam_buf[i] = 0xFF;  // Y = 0xFF = off-screen
    }

    // Reset scroll position (no scrolling yet)
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    // Enable NMI interrupts (bit 7 of PPU_CTRL)
    // NMI fires every frame when the PPU finishes drawing.
    // Our NMI handler (in reset.s) uses this to copy sprites to the PPU.
    PPU_CTRL = 0x80;

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

        // --- DRAW ---
        // Update all sprites in the buffer, then tell the NMI handler
        // it's safe to copy them to the screen
        draw_player();
        nmi_ready = 1;
        waitvsync();
    }
}
