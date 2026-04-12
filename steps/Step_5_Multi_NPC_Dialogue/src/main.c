// =============================================================================
// NES GAME - Zelda 2 Inspired - STEP 5: Multi-NPC Dialogue + Bordered Box
// =============================================================================
// WHAT'S NEW IN THIS STEP (building on Step 4):
//   - TWO NPCs with different messages (old man + merchant)
//   - Multi-line dialogue (three lines of text at once)
//   - A proper bordered dialogue box with corners and edges
//   - A string table so it's easy to add more NPCs and messages
//
// HOW THE BORDERED BOX IS BUILT:
//   The box is drawn entirely from background tiles. There are 8 border
//   tiles in pattern table 1 (after the font):
//     $3B = top-left corner       $3F = horizontal edge (top)
//     $3C = top-right corner      $40 = horizontal edge (bottom)
//     $3D = bottom-left corner    $41 = vertical edge (left)
//     $3E = bottom-right corner   $42 = vertical edge (right)
//   Inside the border we draw rows of text, padded with space tiles ($34).
//
// HOW TO ADD MORE NPCs:
//   1. Add a new npcN_x / npcN_y pair
//   2. Draw it in draw_npcs() using sprite tiles $62/$63/$72/$73 (merchant)
//      or any other sprite tiles you've put in the CHR
//   3. Add an overlap check in the main loop that shows a different message
//
// FONT TILE NUMBERS: same as Step 4. See that file for the full table.
//
// THINGS TO TRY:
//   - Add a THIRD NPC by creating a new message and checking overlap
//   - Move the box to the bottom of the screen (change BOX_TOP_ROW)
//   - Make the box wider or narrower (change BOX_WIDTH)
//   - Change what each NPC says
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

#define BTN_A      0x80
#define BTN_B      0x40
#define BTN_UP     0x08
#define BTN_DOWN   0x04
#define BTN_LEFT   0x02
#define BTN_RIGHT  0x01

#define STATE_PLAYING  0
#define STATE_DIALOGUE 1

// Box layout: a 22-wide x 5-tall box at the top of the screen
#define BOX_TOP_ROW   2
#define BOX_LEFT_COL  5
#define BOX_WIDTH     22
#define BOX_HEIGHT    5
// Three text lines fit inside a 5-tall box (1 border + 3 text + 1 border)
#define TEXT_COL      (BOX_LEFT_COL + 2)
#define TEXT_WIDTH    (BOX_WIDTH - 4)

// Border tile numbers
#define TILE_CORNER_TL  0x3B
#define TILE_CORNER_TR  0x3C
#define TILE_CORNER_BL  0x3D
#define TILE_CORNER_BR  0x3E
#define TILE_EDGE_TOP   0x3F
#define TILE_EDGE_BOT   0x40
#define TILE_EDGE_LEFT  0x41
#define TILE_EDGE_RIGHT 0x42
#define TILE_SPACE      0x34
#define TILE_SKY        0x00

extern void load_background(void);

// =============================================================================
// PLAYER VARIABLES
// =============================================================================

unsigned char x = 60;
unsigned char y = 176;
unsigned char pad;
unsigned char prev_pad = 0;
unsigned char jump = 1;
unsigned char jmptime = 0;
unsigned char plrdir = 0x00;
unsigned char plrxmod = 0;
unsigned char moved = 0;
unsigned char moveWait = 0;

unsigned char game_state = STATE_PLAYING;

// Which NPC is currently being talked to (only meaningful in DIALOGUE state)
unsigned char active_npc = 0;

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
// Old man stands to the left near the player start.
// Merchant stands further right on the ground.

// EDIT: move the two NPCs by changing these numbers.
unsigned char npc1_x = 40;     // Old man
unsigned char npc1_y = 192;

unsigned char npc2_x = 210;    // Merchant
unsigned char npc2_y = 192;

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
// DIALOGUE MESSAGES
// =============================================================================
// Each message is an array of 3 lines, each line an array of tile numbers
// ending in 0x00. Empty lines are allowed (just a 0x00 terminator).
//
// Font reminder:
//   A=$10 B=$11 C=$12 D=$13 E=$14 F=$15 G=$16 H=$17 I=$18 J=$19 K=$1A
//   L=$1B M=$1C N=$1D O=$1E P=$1F Q=$20 R=$21 S=$22 T=$23 U=$24 V=$25
//   W=$26 X=$27 Y=$28 Z=$29
//   0=$2A 1=$2B ... 9=$33
//   space=$34 !=$35 ?=$36 .=$37 ,=$38 '=$39 -=$3A

// Old man's message: "BRAVE HERO!" / "BEWARE THE SLIME" / "IN THE VALLEY."
static const unsigned char msg1_line1[] = {
    0x11, 0x21, 0x10, 0x25, 0x14, 0x34,                     // BRAVE
    0x17, 0x14, 0x21, 0x1E, 0x35,                           // HERO!
    0x00
};
static const unsigned char msg1_line2[] = {
    0x11, 0x14, 0x26, 0x10, 0x21, 0x14, 0x34,               // BEWARE
    0x23, 0x17, 0x14, 0x34,                                  // THE
    0x22, 0x1B, 0x18, 0x1C, 0x14,                           // SLIME
    0x00
};
static const unsigned char msg1_line3[] = {
    0x18, 0x1D, 0x34,                                        // IN
    0x23, 0x17, 0x14, 0x34,                                  // THE
    0x25, 0x10, 0x1B, 0x1B, 0x14, 0x28, 0x37,               // VALLEY.
    0x00
};

// Merchant's message: "WELCOME!" / "GEMS FOR SALE" / "50 EACH."
static const unsigned char msg2_line1[] = {
    0x26, 0x14, 0x1B, 0x12, 0x1E, 0x1C, 0x14, 0x35,         // WELCOME!
    0x00
};
static const unsigned char msg2_line2[] = {
    0x16, 0x14, 0x1C, 0x22, 0x34,                            // GEMS
    0x15, 0x1E, 0x21, 0x34,                                  // FOR
    0x22, 0x10, 0x1B, 0x14,                                  // SALE
    0x00
};
static const unsigned char msg2_line3[] = {
    0x2F, 0x2A, 0x34,                                        // 50
    0x14, 0x10, 0x12, 0x17, 0x37,                            // EACH.
    0x00
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

void draw_enemy(unsigned char ex, unsigned char ey,
                unsigned char tile_tl, unsigned char tile_tr,
                unsigned char tile_bl, unsigned char tile_br,
                unsigned char palette) {
    draw_one_sprite(ey,     tile_tl, palette, ex);
    draw_one_sprite(ey,     tile_tr, palette, ex + 8);
    draw_one_sprite(ey + 8, tile_bl, palette, ex);
    draw_one_sprite(ey + 8, tile_br, palette, ex + 8);
}

// Both NPCs. Old man uses sprite palette 2, merchant uses palette 3 (items)
// so he has a more colourful tunic.
void draw_npcs(void) {
    // Old man: tiles $60/$61/$70/$71 with palette 2
    draw_one_sprite(npc1_y,     0x60, 0x02, npc1_x);
    draw_one_sprite(npc1_y,     0x61, 0x02, npc1_x + 8);
    draw_one_sprite(npc1_y + 8, 0x70, 0x02, npc1_x);
    draw_one_sprite(npc1_y + 8, 0x71, 0x02, npc1_x + 8);

    // Merchant: tiles $62/$63/$72/$73 with palette 3 (red/pink - colourful)
    draw_one_sprite(npc2_y,     0x62, 0x03, npc2_x);
    draw_one_sprite(npc2_y,     0x63, 0x03, npc2_x + 8);
    draw_one_sprite(npc2_y + 8, 0x72, 0x03, npc2_x);
    draw_one_sprite(npc2_y + 8, 0x73, 0x03, npc2_x + 8);
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

// Set the PPU write pointer to a particular nametable cell.
void set_ppu_addr(unsigned char row, unsigned char col) {
    unsigned int addr;
    addr = 0x2000 + ((unsigned int)row * 32) + col;
    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);
}

// Write a string of tile numbers, padding with spaces up to `width` tiles.
void write_text_padded(const unsigned char *text, unsigned char width) {
    unsigned char i = 0;
    unsigned char count = 0;
    while (text[i] != 0x00 && count < width) {
        PPU_DATA = text[i];
        i++;
        count++;
    }
    // Pad with space tiles so old characters don't show through
    while (count < width) {
        PPU_DATA = TILE_SPACE;
        count++;
    }
}

// Draw the bordered dialogue box frame (corners + edges + interior spaces).
void draw_box_frame(void) {
    unsigned char row, col;

    // --- TOP ROW: corner-TL, edges, corner-TR ---
    set_ppu_addr(BOX_TOP_ROW, BOX_LEFT_COL);
    PPU_DATA = TILE_CORNER_TL;
    for (col = 1; col < BOX_WIDTH - 1; col++) {
        PPU_DATA = TILE_EDGE_TOP;
    }
    PPU_DATA = TILE_CORNER_TR;

    // --- MIDDLE ROWS: edge-left, spaces, edge-right ---
    for (row = 1; row < BOX_HEIGHT - 1; row++) {
        set_ppu_addr(BOX_TOP_ROW + row, BOX_LEFT_COL);
        PPU_DATA = TILE_EDGE_LEFT;
        for (col = 1; col < BOX_WIDTH - 1; col++) {
            PPU_DATA = TILE_SPACE;
        }
        PPU_DATA = TILE_EDGE_RIGHT;
    }

    // --- BOTTOM ROW: corner-BL, edges, corner-BR ---
    set_ppu_addr(BOX_TOP_ROW + BOX_HEIGHT - 1, BOX_LEFT_COL);
    PPU_DATA = TILE_CORNER_BL;
    for (col = 1; col < BOX_WIDTH - 1; col++) {
        PPU_DATA = TILE_EDGE_BOT;
    }
    PPU_DATA = TILE_CORNER_BR;
}

// Wipe the box area with sky tiles (used when dismissing dialogue).
void erase_box(void) {
    unsigned char row, col;
    for (row = 0; row < BOX_HEIGHT; row++) {
        set_ppu_addr(BOX_TOP_ROW + row, BOX_LEFT_COL);
        for (col = 0; col < BOX_WIDTH; col++) {
            PPU_DATA = TILE_SKY;
        }
    }
}

// Show a three-line dialogue box.
void show_dialogue(const unsigned char *line1,
                   const unsigned char *line2,
                   const unsigned char *line3) {
    waitvsync();
    PPU_MASK = 0;

    draw_box_frame();

    // Write the three text lines into the interior of the box
    set_ppu_addr(BOX_TOP_ROW + 1, TEXT_COL);
    write_text_padded(line1, TEXT_WIDTH);

    set_ppu_addr(BOX_TOP_ROW + 2, TEXT_COL);
    write_text_padded(line2, TEXT_WIDTH);

    set_ppu_addr(BOX_TOP_ROW + 3, TEXT_COL);
    write_text_padded(line3, TEXT_WIDTH);

    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
}

void hide_dialogue(void) {
    waitvsync();
    PPU_MASK = 0;
    erase_box();
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
}

// =============================================================================
// MAIN
// =============================================================================

void main(void) {
    unsigned char i;
    unsigned char a_pressed;

    waitvsync();
    PPU_MASK = 0;

    // --- PALETTES ---
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    PPU_DATA = 0x21;
    PPU_DATA = 0x29;
    PPU_DATA = 0x19;
    PPU_DATA = 0x0F;   // Black - used for text and box borders (color 3 in bg pal 0)

    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x05;
    PPU_DATA = 0x00;
    PPU_DATA = 0x10;
    PPU_DATA = 0x2D;

    // Sprite palette 0: player
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x11;
    PPU_DATA = 0x30;
    PPU_DATA = 0x27;
    PPU_DATA = 0x17;

    // Sprite palette 1: slime
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x15;
    PPU_DATA = 0x1A;
    PPU_DATA = 0x30;
    PPU_DATA = 0x0A;

    // Sprite palette 2: skeleton / old man NPC
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x19;
    PPU_DATA = 0x30;   // White hair/beard
    PPU_DATA = 0x16;   // Red (skeleton eyes / face tint)
    PPU_DATA = 0x07;   // Brown robe

    // Sprite palette 3: items + merchant (bright & colourful)
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x1D;
    PPU_DATA = 0x16;   // Red
    PPU_DATA = 0x27;   // Orange / skin
    PPU_DATA = 0x06;   // Dark red

    load_background();

    PPU_CTRL = 0x10;

    PPU_SCROLL = 0;
    PPU_SCROLL = 0;

    PPU_MASK = 0x1E;

    // =========================================================================
    // GAME LOOP
    // =========================================================================
    while(1) {
        pad = read_controller();
        a_pressed = (pad & BTN_A) && !(prev_pad & BTN_A);

        if (game_state == STATE_PLAYING) {
            // --- CHECK NPC INTERACTIONS ---
            // Old man
            if (check_overlap(x, y, 16, 32, npc1_x - 4, npc1_y, 24, 16)) {
                if (a_pressed) {
                    active_npc = 1;
                    show_dialogue(msg1_line1, msg1_line2, msg1_line3);
                    game_state = STATE_DIALOGUE;
                    prev_pad = pad;
                    continue;
                }
            }
            // Merchant
            if (check_overlap(x, y, 16, 32, npc2_x - 4, npc2_y, 24, 16)) {
                if (a_pressed) {
                    active_npc = 2;
                    show_dialogue(msg2_line1, msg2_line2, msg2_line3);
                    game_state = STATE_DIALOGUE;
                    prev_pad = pad;
                    continue;
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
            if (a_pressed) {
                hide_dialogue();
                game_state = STATE_PLAYING;
                active_npc = 0;
            }
        }

        // --- DRAW SPRITES ---
        waitvsync();

        PPU_SCROLL = 0;
        PPU_SCROLL = 0;

        OAM_ADDR = 0x00;

        draw_player();
        draw_npcs();
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

const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
