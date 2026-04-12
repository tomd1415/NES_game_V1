// =============================================================================
// NES GAME - Zelda 2 Inspired - STEP 3: Enemies and Items
// =============================================================================
// WHAT'S NEW IN THIS STEP:
//   - A slime enemy that patrols back and forth on the ground
//   - A skeleton enemy that patrols on a platform
//   - Collectible gems placed around the level
//   - A heart pickup
//   - Multiple sprite palettes (player, enemies, items each have their own)
//   - A score counter (counts collected gems)
//
// THINGS TO TRY:
//   - Change enemy speed: look for enemy_speed
//   - Change enemy patrol range: look for enemy1_left / enemy1_right
//   - Add more gems: add entries to the gem arrays
//   - Change item positions
//   - Change enemy or item colors in the palette section
//
// SPRITE TILE NUMBERS FOR ENEMIES AND ITEMS:
//   $40/$41 = Slime top (left/right halves)
//   $50/$51 = Slime bottom (left/right halves)
//   $44/$45 = Skeleton head (left/right halves)
//   $54/$55 = Skeleton body (left/right halves)
//   $48 = Gem
//   $49 = Heart
//   $4A = Sword
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

extern void load_background(void);

// =============================================================================
// PLAYER VARIABLES
// =============================================================================

unsigned char x = 60;
unsigned char y = 176;
unsigned char pad;
unsigned char jump = 1;
unsigned char jmptime = 0;
unsigned char plrdir = 0x00;
unsigned char plrxmod = 0;
unsigned char moved = 0;
unsigned char moveWait = 0;

// =============================================================================
// ENEMY VARIABLES
// =============================================================================

// Slime enemy (patrols on the ground)
// EDIT: move the slime by changing enemy1_x / enemy1_y, or change its
//       patrol range with enemy1_left and enemy1_right.
unsigned char enemy1_x = 150;
unsigned char enemy1_y = 192;
unsigned char enemy1_dir = 1;       // 1 = moving right, 0 = moving left
unsigned char enemy1_left = 120;    // Left patrol boundary
unsigned char enemy1_right = 200;   // Right patrol boundary

// Skeleton enemy (patrols on the floating platform)
unsigned char enemy2_x = 80;
unsigned char enemy2_y = 128;       // On the platform (row 18 * 8 = 144, minus 16)
unsigned char enemy2_dir = 1;
unsigned char enemy2_left = 64;     // Platform starts at column 8 = pixel 64
unsigned char enemy2_right = 112;   // Platform ends at column 16 = pixel 128, minus 16

// How fast enemies move (frames between steps - lower = faster)
unsigned char enemy_timer = 0;
// TRY: smaller enemy_speed = faster enemies (1 is zoomy, 10 is slow).
unsigned char enemy_speed = 3;

// =============================================================================
// ITEM VARIABLES
// =============================================================================

// Gems - positions and collected state
// TRY: to add a 5th gem, change NUM_GEMS to 5, then add one extra number
//      to each of the three arrays below (e.g. another X, another Y, another 0).
#define NUM_GEMS 4
unsigned char gem_x[NUM_GEMS]         = { 100, 140, 180, 88 };
unsigned char gem_y[NUM_GEMS]         = { 168, 168, 168, 104 };
unsigned char gem_collected[NUM_GEMS] = { 0, 0, 0, 0 };

// Heart pickup
unsigned char heart_x = 176;
unsigned char heart_y = 104;         // On the higher platform
unsigned char heart_collected = 0;

// Score (number of gems collected)
unsigned char score = 0;

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

    for (row = 0; row < 4; row++) {
        draw_one_sprite(y + (row * 8), tiles[row * 2],     plrdir, left_x);
        draw_one_sprite(y + (row * 8), tiles[row * 2 + 1], plrdir, right_x);
    }
}

// Draw a 2x2 tile enemy sprite
// palette: 0x01 = sprite palette 1 (green/slime), 0x02 = sprite palette 2 (skeleton)
void draw_enemy(unsigned char ex, unsigned char ey,
                unsigned char tile_tl, unsigned char tile_tr,
                unsigned char tile_bl, unsigned char tile_br,
                unsigned char palette) {
    draw_one_sprite(ey,     tile_tl, palette, ex);
    draw_one_sprite(ey,     tile_tr, palette, ex + 8);
    draw_one_sprite(ey + 8, tile_bl, palette, ex);
    draw_one_sprite(ey + 8, tile_br, palette, ex + 8);
}

// Check if two rectangles overlap (simple bounding box collision)
// Returns 1 if they overlap, 0 if not
unsigned char check_overlap(unsigned char ax, unsigned char ay,
                            unsigned char aw, unsigned char ah,
                            unsigned char bx, unsigned char by,
                            unsigned char bw, unsigned char bh) {
    // Check if NOT overlapping, then negate
    if (ax + aw <= bx) return 0;  // a is left of b
    if (bx + bw <= ax) return 0;  // b is left of a
    if (ay + ah <= by) return 0;  // a is above b
    if (by + bh <= ay) return 0;  // b is above a
    return 1;
}

// =============================================================================
// MAIN
// =============================================================================

void main(void) {
    unsigned char i;

    waitvsync();
    PPU_MASK = 0;

    // --- PALETTES ---
    // Background palette 0: sky/ground
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    PPU_DATA = 0x21;   // Universal BG: light blue sky
    PPU_DATA = 0x29;   // Green (grass)
    PPU_DATA = 0x19;   // Dark green
    PPU_DATA = 0x07;   // Brown (dirt)

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

    // Sprite palette 1: slime enemy (green)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x15;
    PPU_DATA = 0x1A;   // Green body
    PPU_DATA = 0x30;   // White eyes
    PPU_DATA = 0x0A;   // Dark green shadow

    // Sprite palette 2: skeleton enemy (white/grey)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x19;
    PPU_DATA = 0x30;   // White bone
    PPU_DATA = 0x16;   // Red eyes
    PPU_DATA = 0x00;   // Grey shadow

    // Sprite palette 3: items (gems/hearts - red/pink)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x1D;
    PPU_DATA = 0x16;   // Red
    PPU_DATA = 0x36;   // Light pink (highlight)
    PPU_DATA = 0x06;   // Dark red (shadow)

    // --- LOAD BACKGROUND ---
    load_background();

    // PPU_CTRL: bit 4 = BG uses pattern table 1
    PPU_CTRL = 0x10;

    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    PPU_MASK = 0x1E;

    // =========================================================================
    // GAME LOOP
    // =========================================================================
    while(1) {
        pad = read_controller();

        // --- PLAYER MOVEMENT ---
        if (pad & 0x08) {  // UP = Jump
            if (jump == 1 && jmptime <= 0) {
                y = y - 3;
                jmptime = 15;
            }
        }
        if (pad & 0x04) {  // DOWN
            if (y < 176) y++;
        }
        if (pad & 0x02) {  // LEFT
            x--;
            plrdir = 0x40;
            plrxmod = 1;
            moveWait++;
            if (moveWait >= 7) { moved++; moveWait = 0; }
        }
        if (pad & 0x01) {  // RIGHT
            x++;
            plrdir = 0x00;
            plrxmod = 0;
            moveWait++;
            if (moveWait >= 7) { moved++; moveWait = 0; }
        }

        // --- GRAVITY ---
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

        // --- ENEMY AI ---
        enemy_timer++;
        if (enemy_timer >= enemy_speed) {
            enemy_timer = 0;

            // Slime: patrol left and right
            if (enemy1_dir) {
                enemy1_x++;
                if (enemy1_x >= enemy1_right) enemy1_dir = 0;
            } else {
                enemy1_x--;
                if (enemy1_x <= enemy1_left) enemy1_dir = 1;
            }

            // Skeleton: patrol left and right on platform
            if (enemy2_dir) {
                enemy2_x++;
                if (enemy2_x >= enemy2_right) enemy2_dir = 0;
            } else {
                enemy2_x--;
                if (enemy2_x <= enemy2_left) enemy2_dir = 1;
            }
        }

        // --- ITEM COLLECTION ---
        // Check if player overlaps any uncollected gem
        for (i = 0; i < NUM_GEMS; i++) {
            if (!gem_collected[i]) {
                if (check_overlap(x, y, 16, 32,
                                  gem_x[i], gem_y[i], 8, 8)) {
                    gem_collected[i] = 1;
                    score++;
                }
            }
        }

        // Check heart pickup
        if (!heart_collected) {
            if (check_overlap(x, y, 16, 32,
                              heart_x, heart_y, 8, 8)) {
                heart_collected = 1;
            }
        }

        // --- DRAW ---
        waitvsync();

        PPU_SCROLL = 0;
        PPU_SCROLL = 0;

        OAM_ADDR = 0x00;

        // Draw player (8 sprites, palette 0)
        draw_player();

        // Draw slime enemy (4 sprites, palette 1 = 0x01)
        draw_enemy(enemy1_x, enemy1_y,
                   0x40, 0x41, 0x50, 0x51, 0x01);

        // Draw skeleton enemy (4 sprites, palette 2 = 0x02)
        draw_enemy(enemy2_x, enemy2_y,
                   0x44, 0x45, 0x54, 0x55, 0x02);

        // Draw uncollected gems (palette 3 = 0x03)
        for (i = 0; i < NUM_GEMS; i++) {
            if (!gem_collected[i]) {
                draw_one_sprite(gem_y[i], 0x48, 0x03, gem_x[i]);
            } else {
                // Hide collected gems off-screen
                draw_one_sprite(0xFF, 0x48, 0x03, 0);
            }
        }

        // Draw heart (palette 3 = 0x03)
        if (!heart_collected) {
            draw_one_sprite(heart_y, 0x49, 0x03, heart_x);
        } else {
            draw_one_sprite(0xFF, 0x49, 0x03, 0);
        }
    }
}

// Interrupt vectors
const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
