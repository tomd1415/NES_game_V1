// =============================================================================
// NES GAME - Zelda 2 Inspired - STEP 4: Dialogue
// =============================================================================
// WHAT'S NEW IN THIS STEP:
//   - An NPC (non-player character) - an "old man" who stands in the level
//   - A font stored in the background CHR (letters A-Z, digits, punctuation)
//   - A dialogue box that appears at the top of the screen when you talk
//   - Press A near the NPC to start a conversation
//   - Press A again to dismiss the dialogue and resume playing
//
// HOW DIALOGUE WORKS ON THE NES:
//   The NES has no concept of "text". Letters are just background tiles
//   drawn by writing tile numbers to the PPU's nametable. Our font tiles
//   occupy slots $10-$3A in the background pattern table. To show a message,
//   we convert a string of letters into tile numbers and write them to the
//   nametable at the row/column where we want the text to appear.
//
//   Because we can only safely write to the PPU during vblank (when the
//   screen isn't being drawn), we turn rendering OFF with PPU_MASK = 0
//   while updating the nametable, then turn it back on.
//
// FONT TILE NUMBERS (these are the tiles in pattern table 1):
//   'A' = 0x10   'N' = 0x1D    '0' = 0x2A    ' ' = 0x34
//   'B' = 0x11   'O' = 0x1E    '1' = 0x2B    '!' = 0x35
//   'C' = 0x12   'P' = 0x1F    '2' = 0x2C    '?' = 0x36
//   'D' = 0x13   'Q' = 0x20    '3' = 0x2D    '.' = 0x37
//   'E' = 0x14   'R' = 0x21    '4' = 0x2E    ',' = 0x38
//   'F' = 0x15   'S' = 0x22    '5' = 0x2F    "'" = 0x39
//   'G' = 0x16   'T' = 0x23    '6' = 0x30    '-' = 0x3A
//   'H' = 0x17   'U' = 0x24    '7' = 0x31
//   'I' = 0x18   'V' = 0x25    '8' = 0x32
//   'J' = 0x19   'W' = 0x26    '9' = 0x33
//   'K' = 0x1A   'X' = 0x27
//   'L' = 0x1B   'Y' = 0x28
//   'M' = 0x1C   'Z' = 0x29
//
// THINGS TO TRY:
//   - Change what the NPC says by editing the msg_hello array
//   - Move the NPC by changing npc_x / npc_y
//   - Change the message location by editing DIALOG_ROW and DIALOG_COL
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

// Controller bits (A is the highest bit)
#define BTN_A      0x80
#define BTN_B      0x40
#define BTN_SELECT 0x20
#define BTN_START  0x10
#define BTN_UP     0x08
#define BTN_DOWN   0x04
#define BTN_LEFT   0x02
#define BTN_RIGHT  0x01

// Game states
#define STATE_PLAYING  0
#define STATE_DIALOGUE 1

extern void load_background(void);

// =============================================================================
// PLAYER VARIABLES
// =============================================================================

unsigned char x = 60;
unsigned char y = 176;
unsigned char pad;
unsigned char prev_pad = 0;    // For detecting button presses (not holds)
unsigned char jump = 1;
unsigned char jmptime = 0;
unsigned char plrdir = 0x00;
unsigned char plrxmod = 0;
unsigned char moved = 0;
unsigned char moveWait = 0;

// =============================================================================
// GAME STATE
// =============================================================================

unsigned char game_state = STATE_PLAYING;

// =============================================================================
// ENEMY VARIABLES
// =============================================================================

unsigned char enemy1_x = 150;
unsigned char enemy1_y = 192;
unsigned char enemy1_dir = 1;
unsigned char enemy1_left = 120;
unsigned char enemy1_right = 200;

unsigned char enemy2_x = 80;
unsigned char enemy2_y = 128;
unsigned char enemy2_dir = 1;
unsigned char enemy2_left = 64;
unsigned char enemy2_right = 112;

unsigned char enemy_timer = 0;
unsigned char enemy_speed = 3;

// =============================================================================
// NPC VARIABLES
// =============================================================================

// Old man NPC - stands on the ground on the right side of the starting area
unsigned char npc_x = 40;
unsigned char npc_y = 192;    // Same Y level as the slime (on the ground)

// =============================================================================
// ITEM VARIABLES
// =============================================================================

#define NUM_GEMS 4
unsigned char gem_x[NUM_GEMS]         = { 100, 140, 180, 88 };
unsigned char gem_y[NUM_GEMS]         = { 168, 168, 168, 104 };
unsigned char gem_collected[NUM_GEMS] = { 0, 0, 0, 0 };

unsigned char heart_x = 176;
unsigned char heart_y = 104;
unsigned char heart_collected = 0;

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
// DIALOGUE MESSAGE
// =============================================================================
// The string is stored as tile numbers (not ASCII) since the NES treats
// text as a sequence of tiles. 0x00 is the end-of-string marker.
// "HELLO HERO!" converted to tile numbers:
//   H=0x17 E=0x14 L=0x1B L=0x1B O=0x1E ' '=0x34 H=0x17 E=0x14 R=0x21 O=0x1E !=0x35

static const unsigned char msg_hello[] = {
    0x17, 0x14, 0x1B, 0x1B, 0x1E,   // HELLO
    0x34,                            // space
    0x17, 0x14, 0x21, 0x1E, 0x35,   // HERO!
    0x00                             // end marker
};

// Where on the screen to draw the dialogue text
// Row 2 near the top, starting at column 4
#define DIALOG_ROW 2
#define DIALOG_COL 4
// Width of the space we wipe clean when showing/hiding the text
#define DIALOG_WIDTH 24

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

void draw_enemy(unsigned char ex, unsigned char ey,
                unsigned char tile_tl, unsigned char tile_tr,
                unsigned char tile_bl, unsigned char tile_br,
                unsigned char palette) {
    draw_one_sprite(ey,     tile_tl, palette, ex);
    draw_one_sprite(ey,     tile_tr, palette, ex + 8);
    draw_one_sprite(ey + 8, tile_bl, palette, ex);
    draw_one_sprite(ey + 8, tile_br, palette, ex + 8);
}

// Draw the NPC. The old man is 2x2 tiles (head = $60/$61, body = $70/$71).
// His Y position is the TOP of the head, so the body draws 8px below.
// We use sprite palette 2 (white/grey - same as skeleton, works for robes too).
void draw_npc(void) {
    draw_one_sprite(npc_y,     0x60, 0x02, npc_x);
    draw_one_sprite(npc_y,     0x61, 0x02, npc_x + 8);
    draw_one_sprite(npc_y + 8, 0x70, 0x02, npc_x);
    draw_one_sprite(npc_y + 8, 0x71, 0x02, npc_x + 8);
}

unsigned char check_overlap(unsigned char ax, unsigned char ay,
                            unsigned char aw, unsigned char ah,
                            unsigned char bx, unsigned char by,
                            unsigned char bw, unsigned char bh) {
    if (ax + aw <= bx) return 0;
    if (bx + bw <= ax) return 0;
    if (ay + ah <= by) return 0;
    if (by + bh <= ay) return 0;
    return 1;
}

// Write a string of tile numbers to the nametable at (row, col).
// The caller must have rendering turned off (PPU_MASK = 0) before calling.
void draw_text(unsigned char row, unsigned char col,
               const unsigned char *text) {
    unsigned int addr;
    unsigned char i;

    // Nametable 0 starts at $2000. Each row is 32 tiles.
    addr = 0x2000 + ((unsigned int)row * 32) + col;

    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);

    i = 0;
    while (text[i] != 0x00) {
        PPU_DATA = text[i];
        i++;
    }
}

// Clear a horizontal strip of the nametable (fill with sky tile $00).
void clear_text_row(unsigned char row, unsigned char col, unsigned char width) {
    unsigned int addr;
    unsigned char i;

    addr = 0x2000 + ((unsigned int)row * 32) + col;

    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);

    for (i = 0; i < width; i++) {
        PPU_DATA = 0x00;   // Sky / empty tile
    }
}

// Show a dialogue message on screen.
// Rendering must be on when this is called; we briefly turn it off.
void show_dialogue(const unsigned char *text) {
    waitvsync();
    PPU_MASK = 0;                          // Turn rendering off

    clear_text_row(DIALOG_ROW, DIALOG_COL, DIALOG_WIDTH);  // Wipe any old text
    draw_text(DIALOG_ROW, DIALOG_COL, text);

    // PPU_ADDR writes scramble the internal scroll register.
    // We need to reset it, otherwise the screen will be offset.
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    PPU_MASK = 0x1E;                       // Turn rendering back on
}

// Remove the dialogue text so gameplay looks normal again.
void hide_dialogue(void) {
    waitvsync();
    PPU_MASK = 0;

    clear_text_row(DIALOG_ROW, DIALOG_COL, DIALOG_WIDTH);

    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    PPU_MASK = 0x1E;
}

// =============================================================================
// MAIN
// =============================================================================

void main(void) {
    unsigned char i;
    unsigned char a_pressed;           // 1 only on the frame A is newly pressed

    waitvsync();
    PPU_MASK = 0;

    // --- PALETTES ---
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    PPU_DATA = 0x21;   // Universal BG: light blue sky
    PPU_DATA = 0x29;   // Green (grass)
    PPU_DATA = 0x19;   // Dark green
    PPU_DATA = 0x07;   // Brown (dirt) - also used for text!

    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x05;
    PPU_DATA = 0x00;   // Grey
    PPU_DATA = 0x10;   // Light grey
    PPU_DATA = 0x2D;   // Dark grey

    // Sprite palette 0: player
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x11;
    PPU_DATA = 0x30;
    PPU_DATA = 0x27;
    PPU_DATA = 0x17;

    // Sprite palette 1: slime (green)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x15;
    PPU_DATA = 0x1A;
    PPU_DATA = 0x30;
    PPU_DATA = 0x0A;

    // Sprite palette 2: skeleton / old man NPC (white + red/brown)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x19;
    PPU_DATA = 0x30;   // White (bone / beard / hair)
    PPU_DATA = 0x16;   // Red (skeleton eyes / old man face tint)
    PPU_DATA = 0x07;   // Brown (robe)

    // Sprite palette 3: items (gems/hearts)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x1D;
    PPU_DATA = 0x16;
    PPU_DATA = 0x36;
    PPU_DATA = 0x06;

    // --- LOAD BACKGROUND ---
    load_background();

    // PPU_CTRL: BG uses pattern table 1 (second 4KB of CHR - that's where
    // our background tiles AND font glyphs live).
    PPU_CTRL = 0x10;

    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    PPU_MASK = 0x1E;

    // =========================================================================
    // GAME LOOP
    // =========================================================================
    while(1) {
        pad = read_controller();

        // Detect the A button being newly pressed (not held down).
        // Without this, holding A would toggle dialogue every frame.
        a_pressed = (pad & BTN_A) && !(prev_pad & BTN_A);

        if (game_state == STATE_PLAYING) {
            // --- CHECK IF PLAYER CAN TALK TO NPC ---
            if (check_overlap(x, y, 16, 32, npc_x - 4, npc_y, 24, 16)) {
                // Player is within "talking range" of the NPC.
                // (We pad the NPC's box by 4px on each side.)
                if (a_pressed) {
                    show_dialogue(msg_hello);
                    game_state = STATE_DIALOGUE;
                    prev_pad = pad;   // Remember pad so we don't dismiss immediately
                    continue;          // Skip rest of loop this frame
                }
            }

            // --- PLAYER MOVEMENT ---
            if (pad & BTN_UP) {
                if (jump == 1 && jmptime <= 0) {
                    y = y - 3;
                    jmptime = 15;
                }
            }
            if (pad & BTN_DOWN) {
                if (y < 176) y++;
            }
            if (pad & BTN_LEFT) {
                x--;
                plrdir = 0x40;
                plrxmod = 1;
                moveWait++;
                if (moveWait >= 7) { moved++; moveWait = 0; }
            }
            if (pad & BTN_RIGHT) {
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

                if (enemy1_dir) {
                    enemy1_x++;
                    if (enemy1_x >= enemy1_right) enemy1_dir = 0;
                } else {
                    enemy1_x--;
                    if (enemy1_x <= enemy1_left) enemy1_dir = 1;
                }

                if (enemy2_dir) {
                    enemy2_x++;
                    if (enemy2_x >= enemy2_right) enemy2_dir = 0;
                } else {
                    enemy2_x--;
                    if (enemy2_x <= enemy2_left) enemy2_dir = 1;
                }
            }

            // --- ITEM COLLECTION ---
            for (i = 0; i < NUM_GEMS; i++) {
                if (!gem_collected[i]) {
                    if (check_overlap(x, y, 16, 32,
                                      gem_x[i], gem_y[i], 8, 8)) {
                        gem_collected[i] = 1;
                        score++;
                    }
                }
            }

            if (!heart_collected) {
                if (check_overlap(x, y, 16, 32,
                                  heart_x, heart_y, 8, 8)) {
                    heart_collected = 1;
                }
            }

        } else if (game_state == STATE_DIALOGUE) {
            // --- DIALOGUE STATE: gameplay frozen, waiting for A to dismiss ---
            if (a_pressed) {
                hide_dialogue();
                game_state = STATE_PLAYING;
            }
            // Enemies and player don't move while talking.
        }

        // --- DRAW SPRITES (always, so nothing disappears during dialogue) ---
        waitvsync();

        PPU_SCROLL = 0;
        PPU_SCROLL = 0;

        OAM_ADDR = 0x00;

        draw_player();

        // NPC - drawn in both states
        draw_npc();

        draw_enemy(enemy1_x, enemy1_y, 0x40, 0x41, 0x50, 0x51, 0x01);
        draw_enemy(enemy2_x, enemy2_y, 0x44, 0x45, 0x54, 0x55, 0x02);

        for (i = 0; i < NUM_GEMS; i++) {
            if (!gem_collected[i]) {
                draw_one_sprite(gem_y[i], 0x48, 0x03, gem_x[i]);
            } else {
                draw_one_sprite(0xFF, 0x48, 0x03, 0);
            }
        }

        if (!heart_collected) {
            draw_one_sprite(heart_y, 0x49, 0x03, heart_x);
        } else {
            draw_one_sprite(0xFF, 0x49, 0x03, 0);
        }

        prev_pad = pad;
    }
}

// Interrupt vectors
const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
