// =============================================================================
// NES GAME - Zelda 2 Inspired - STEP 2: Background Level
// =============================================================================
// WHAT'S NEW IN THIS STEP:
//   - Background tiles! The screen now shows a level with:
//     * Sky with clouds
//     * Ground with grass surface
//     * Floating platforms to jump onto
//     * A castle wall section
//     * A door entrance
//   - Multiple color palettes for background and sprites
//   - The floor position matches the actual ground tiles
//
// THINGS TO TRY:
//   - Change background colors in the palette section
//   - Edit level1.nam in a nametable editor to redesign the level
//   - Change which background tiles are used (see tile list below)
//
// BACKGROUND TILE NUMBERS (in the CHR file, pattern table 1):
//   $00 = Sky (empty)
//   $01 = Ground top (grass surface)
//   $02 = Ground fill (dirt below surface)
//   $03 = Brick block
//   $04 = Platform top
//   $05 = Platform bottom/support
//   $06 = Cloud left half
//   $07 = Cloud right half
//   $08 = Castle wall block
//   $09 = Door body
//   $0A = Door arch top
//   $0B = Solid block
// =============================================================================

#include <nes.h>

// Hardware addresses
#define PPU_CTRL      *((unsigned char*)0x2000)
#define PPU_MASK      *((unsigned char*)0x2001)
#define PPU_STATUS    *((unsigned char*)0x2002)
#define OAM_ADDR      *((unsigned char*)0x2003)
#define OAM_DATA      *((unsigned char*)0x2004)
#define PPU_SCROLL    *((unsigned char*)0x2005)
#define PPU_ADDR      *((unsigned char*)0x2006)
#define PPU_DATA      *((unsigned char*)0x2007)
#define JOYPAD1       *((unsigned char*)0x4016)

// Defined in graphics.s - loads the background nametable into the PPU
extern void load_background(void);

// =============================================================================
// GAME VARIABLES
// =============================================================================

unsigned char x = 60;         // Player starts further left to see the level
unsigned char y = 168;        // Start on the ground (row 26 * 8 = 208, minus sprite height)
unsigned char pad;
unsigned char jump = 1;
unsigned char jmptime = 0;
unsigned char plrdir = 0x00;
unsigned char plrxmod = 0;
unsigned char moved = 0;
unsigned char moveWait = 0;

// =============================================================================
// ANIMATION TABLE
// =============================================================================

static const unsigned char anim_tiles[4][8] = {
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a },
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c },
};

// =============================================================================
// FUNCTIONS
// =============================================================================

unsigned char read_controller(void) {
    unsigned char result = 0;
    unsigned char i;
    JOYPAD1 = 1;
    JOYPAD1 = 0;
    for (i = 0; i < 8; i++) {
        result = result << 1;
        if (JOYPAD1 & 1)
            result = result | 1;
    }
    return result;
}

void draw_one_sprite(unsigned char sy, unsigned char tile,
                     unsigned char attr, unsigned char sx) {
    OAM_DATA = sy;
    OAM_DATA = tile;
    OAM_DATA = attr;
    OAM_DATA = sx;
}

void draw_player(void) {
    unsigned char frame;
    unsigned char row;
    unsigned char left_x, right_x;
    const unsigned char *tiles;

    frame = moved % 4;
    tiles = anim_tiles[frame];

    if (plrdir == 0x40) {
        left_x = x + 8;
        right_x = x;
    } else {
        left_x = x;
        right_x = x + 8;
    }

    OAM_ADDR = 0x00;

    for (row = 0; row < 4; row++) {
        draw_one_sprite(y + (row * 8), tiles[row * 2],     plrdir, left_x);
        draw_one_sprite(y + (row * 8), tiles[row * 2 + 1], plrdir, right_x);
    }
}

// =============================================================================
// MAIN
// =============================================================================

void main(void) {
    // Wait for PPU warmup
    waitvsync();

    // Turn off rendering while we set up
    PPU_MASK = 0;

    // --- LOAD PALETTES ---
    // Background palette 0: sky/ground colors
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    PPU_DATA = 0x21;   // Universal background: light blue (sky)
    PPU_DATA = 0x29;   // Color 1: Green (grass)
    PPU_DATA = 0x19;   // Color 2: Dark green (grass detail)
    PPU_DATA = 0x07;   // Color 3: Brown (dirt, mortar)

    // Background palette 1: castle/stone
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x05;
    PPU_DATA = 0x00;   // Grey
    PPU_DATA = 0x10;   // Light grey
    PPU_DATA = 0x2D;   // Dark grey

    // Sprite palette 0: player
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x11;
    PPU_DATA = 0x30;   // White (eyes)
    PPU_DATA = 0x27;   // Orange (outline)
    PPU_DATA = 0x17;   // Brown (body)

    // --- LOAD BACKGROUND ---
    // This copies the level nametable to the PPU
    // The level layout is defined in level1.nam
    load_background();

    // --- CONFIGURE PPU ---
    // Bit 4 = use pattern table 1 for background tiles
    // Bit 7 = enable NMI (not used yet, but good practice)
    // Sprites use pattern table 0 (bit 3 = 0)
    PPU_CTRL = 0x10;

    // Reset scroll position (must be done after any PPU_ADDR writes)
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    // Turn on rendering: show sprites and background
    PPU_MASK = 0x1E;

    // =========================================================================
    // GAME LOOP
    // =========================================================================
    while(1) {
        pad = read_controller();

        // --- MOVEMENT ---
        if (pad & 0x08) {  // UP = Jump
            if (jump == 1 && jmptime <= 0) {
                y = y - 3;
                jmptime = 15;
            }
        }

        if (pad & 0x04) {  // DOWN
            if (y < 176) {
                y++;
            }
        }

        if (pad & 0x02) {  // LEFT
            x--;
            plrdir = 0x40;
            plrxmod = 1;
            moveWait++;
            if (moveWait >= 7) {
                moved = moved + 1;
                moveWait = 0;
            }
        }

        if (pad & 0x01) {  // RIGHT
            x++;
            plrdir = 0x00;
            plrxmod = 0;
            moveWait++;
            if (moveWait >= 7) {
                moved = moved + 1;
                moveWait = 0;
            }
        }

        // --- GRAVITY ---
        // Floor is at Y=176 (ground tiles start at row 26 = pixel 208,
        // minus 32 pixels for the player's height)
        if (y < 176) {
            jump = 0;
            if (jmptime > 0) {
                jmptime--;
                y = y - 3;
            } else {
                y = y + 3;
            }
        } else {
            jump = 1;
        }

        // --- DRAW ---
        waitvsync();

        // Reset scroll (important - reading PPU status resets the scroll latch)
        PPU_SCROLL = 0;
        PPU_SCROLL = 0;

        draw_player();
    }
}

// Interrupt vectors
const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
