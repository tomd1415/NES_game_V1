#include <nes.h>

#define PPU_CTRL   (*(volatile unsigned char*)0x2000)
#define PPU_MASK   (*(volatile unsigned char*)0x2001)
#define OAM_ADDR   (*(volatile unsigned char*)0x2003)
#define OAM_DATA   (*(volatile unsigned char*)0x2004)
#define PPU_SCROLL (*(volatile unsigned char*)0x2005)
#define PPU_ADDR   (*(volatile unsigned char*)0x2006)
#define PPU_DATA   (*(volatile unsigned char*)0x2007)
#define JOYPAD1    (*(volatile unsigned char*)0x4016)

#define BTN_A      0x80
#define BTN_UP     0x08
#define BTN_DOWN   0x04
#define BTN_LEFT   0x02
#define BTN_RIGHT  0x01

#define STATE_PLAYING  0
#define STATE_DIALOGUE 1
#define FACE_RIGHT     0x00
#define FACE_LEFT      0x40
#define FLOOR_Y        176
#define WALK_TICKS     7
#define NUM_GEMS       4

#define BOX_TOP_ROW    2
#define BOX_LEFT_COL   5
#define BOX_WIDTH      22
#define BOX_HEIGHT     5
#define TEXT_COL       (BOX_LEFT_COL + 2)
#define TEXT_WIDTH     (BOX_WIDTH - 4)
#define TILE_CORNER_TL 0x3B
#define TILE_CORNER_TR 0x3C
#define TILE_CORNER_BL 0x3D
#define TILE_CORNER_BR 0x3E
#define TILE_EDGE_TOP  0x3F
#define TILE_EDGE_BOT  0x40
#define TILE_EDGE_LEFT 0x41
#define TILE_EDGE_RIGHT 0x42
#define TILE_SPACE     0x34
#define TILE_SKY       0x00

extern void load_background(void);

static unsigned char x, y, pad, prev_pad, jump, jmptime, plrdir, moved, moveWait;
static unsigned char game_state = STATE_PLAYING;
static unsigned char active_npc = 0;

static unsigned char enemy1_x = 150, enemy1_y = 192, enemy1_dir = 1;
static unsigned char enemy1_left = 120, enemy1_right = 200;
static unsigned char enemy2_x = 80, enemy2_y = 128, enemy2_dir = 1;
static unsigned char enemy2_left = 64, enemy2_right = 112;
static unsigned char enemy_timer = 0, enemy_speed = 3;
static unsigned char npc1_x = 40, npc1_y = 192;
static unsigned char npc2_x = 210, npc2_y = 192;

static unsigned char gem_x[NUM_GEMS] = { 100, 140, 180, 88 };
static unsigned char gem_y[NUM_GEMS] = { 168, 168, 168, 104 };
static unsigned char gem_collected[NUM_GEMS] = { 0, 0, 0, 0 };
static unsigned char heart_x = 176, heart_y = 104, heart_collected = 0;
static unsigned char score = 0;

static const unsigned char anim_tiles[4][8] = {
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a },
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c }
};

static const unsigned char msg1_line1[] = {
    0x11, 0x21, 0x10, 0x25, 0x14, 0x34, 0x17, 0x14, 0x21, 0x1E, 0x35, 0x00
};
static const unsigned char msg1_line2[] = {
    0x11, 0x14, 0x26, 0x10, 0x21, 0x14, 0x34, 0x23, 0x17, 0x14, 0x34,
    0x22, 0x1B, 0x18, 0x1C, 0x14, 0x00
};
static const unsigned char msg1_line3[] = {
    0x18, 0x1D, 0x34, 0x23, 0x17, 0x14, 0x34, 0x25, 0x10, 0x1B, 0x1B,
    0x14, 0x28, 0x37, 0x00
};
static const unsigned char msg2_line1[] = {
    0x26, 0x14, 0x1B, 0x12, 0x1E, 0x1C, 0x14, 0x35, 0x00
};
static const unsigned char msg2_line2[] = {
    0x16, 0x14, 0x1C, 0x22, 0x34, 0x15, 0x1E, 0x21, 0x34,
    0x22, 0x10, 0x1B, 0x14, 0x00
};
static const unsigned char msg2_line3[] = {
    0x2F, 0x2A, 0x34, 0x14, 0x10, 0x12, 0x17, 0x37, 0x00
};

static void ppu_seek(unsigned char hi, unsigned char lo) {
    PPU_ADDR = hi;
    PPU_ADDR = lo;
}

static void reset_scroll(void) {
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
}

static void set_cell(unsigned char row, unsigned char col) {
    unsigned int addr = 0x2000 + ((unsigned int)row * 32) + col;
    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);
}

static void write_palettes(void) {
    ppu_seek(0x3F, 0x00);
    PPU_DATA = 0x21; PPU_DATA = 0x29; PPU_DATA = 0x19; PPU_DATA = 0x0F;
    ppu_seek(0x3F, 0x05);
    PPU_DATA = 0x00; PPU_DATA = 0x10; PPU_DATA = 0x2D;
    ppu_seek(0x3F, 0x11);
    PPU_DATA = 0x30; PPU_DATA = 0x27; PPU_DATA = 0x17;
    ppu_seek(0x3F, 0x15);
    PPU_DATA = 0x1A; PPU_DATA = 0x30; PPU_DATA = 0x0A;
    ppu_seek(0x3F, 0x19);
    PPU_DATA = 0x30; PPU_DATA = 0x16; PPU_DATA = 0x07;
    ppu_seek(0x3F, 0x1D);
    PPU_DATA = 0x16; PPU_DATA = 0x27; PPU_DATA = 0x06;
}

static void init_player(void) {
    x = 60; y = FLOOR_Y; pad = 0; prev_pad = 0; jump = 1; jmptime = 0;
    plrdir = FACE_RIGHT; moved = 0; moveWait = 0;
}

static void init_game(void) {
    waitvsync();
    PPU_MASK = 0;
    write_palettes();
    load_background();
    PPU_CTRL = 0x10;
    reset_scroll();
    PPU_MASK = 0x1E;
}

static unsigned char read_controller(void) {
    unsigned char result = 0;
    unsigned char i;
    JOYPAD1 = 1; JOYPAD1 = 0;
    for (i = 0; i < 8; ++i) {
        result <<= 1;
        if (JOYPAD1 & 1) result |= 1;
    }
    return result;
}

static unsigned char overlap(unsigned char ax, unsigned char ay,
                             unsigned char aw, unsigned char ah,
                             unsigned char bx, unsigned char by,
                             unsigned char bw, unsigned char bh) {
    if (ax + aw <= bx) return 0;
    if (bx + bw <= ax) return 0;
    if (ay + ah <= by) return 0;
    if (by + bh <= ay) return 0;
    return 1;
}

static void write_padded(const unsigned char *text, unsigned char width) {
    unsigned char i = 0;
    unsigned char count = 0;
    while (text[i] != 0x00 && count < width) {
        PPU_DATA = text[i];
        ++i;
        ++count;
    }
    while (count < width) {
        PPU_DATA = TILE_SPACE;
        ++count;
    }
}

static void draw_box_frame(void) {
    unsigned char row, col;
    set_cell(BOX_TOP_ROW, BOX_LEFT_COL);
    PPU_DATA = TILE_CORNER_TL;
    for (col = 1; col < BOX_WIDTH - 1; ++col) PPU_DATA = TILE_EDGE_TOP;
    PPU_DATA = TILE_CORNER_TR;

    for (row = 1; row < BOX_HEIGHT - 1; ++row) {
        set_cell(BOX_TOP_ROW + row, BOX_LEFT_COL);
        PPU_DATA = TILE_EDGE_LEFT;
        for (col = 1; col < BOX_WIDTH - 1; ++col) PPU_DATA = TILE_SPACE;
        PPU_DATA = TILE_EDGE_RIGHT;
    }

    set_cell(BOX_TOP_ROW + BOX_HEIGHT - 1, BOX_LEFT_COL);
    PPU_DATA = TILE_CORNER_BL;
    for (col = 1; col < BOX_WIDTH - 1; ++col) PPU_DATA = TILE_EDGE_BOT;
    PPU_DATA = TILE_CORNER_BR;
}

static void erase_box(void) {
    unsigned char row, col;
    for (row = 0; row < BOX_HEIGHT; ++row) {
        set_cell(BOX_TOP_ROW + row, BOX_LEFT_COL);
        for (col = 0; col < BOX_WIDTH; ++col) PPU_DATA = TILE_SKY;
    }
}

static void show_dialogue(const unsigned char *line1,
                          const unsigned char *line2,
                          const unsigned char *line3) {
    waitvsync();
    PPU_MASK = 0;
    draw_box_frame();
    set_cell(BOX_TOP_ROW + 1, TEXT_COL); write_padded(line1, TEXT_WIDTH);
    set_cell(BOX_TOP_ROW + 2, TEXT_COL); write_padded(line2, TEXT_WIDTH);
    set_cell(BOX_TOP_ROW + 3, TEXT_COL); write_padded(line3, TEXT_WIDTH);
    reset_scroll();
    PPU_MASK = 0x1E;
}

static void hide_dialogue(void) {
    waitvsync();
    PPU_MASK = 0;
    erase_box();
    reset_scroll();
    PPU_MASK = 0x1E;
}

static void step_walk(void) {
    ++moveWait;
    if (moveWait >= WALK_TICKS) { ++moved; moveWait = 0; }
}

static void update_player(void) {
    if ((pad & BTN_UP) && jump && jmptime == 0) { y -= 3; jmptime = 15; }
    if ((pad & BTN_DOWN) && y < FLOOR_Y) ++y;
    if (pad & BTN_LEFT) { --x; plrdir = FACE_LEFT; step_walk(); }
    if (pad & BTN_RIGHT) { ++x; plrdir = FACE_RIGHT; step_walk(); }
}

static void apply_gravity(void) {
    if (y < FLOOR_Y) {
        jump = 0;
        if (jmptime) { --jmptime; y -= 3; } else { y += 3; }
    } else {
        jump = 1;
    }
}

static void patrol_enemy(unsigned char *ex, unsigned char *dir,
                         unsigned char left, unsigned char right) {
    if (*dir) {
        ++*ex;
        if (*ex >= right) *dir = 0;
    } else {
        --*ex;
        if (*ex <= left) *dir = 1;
    }
}

static void update_enemies(void) {
    ++enemy_timer;
    if (enemy_timer < enemy_speed) return;
    enemy_timer = 0;
    patrol_enemy(&enemy1_x, &enemy1_dir, enemy1_left, enemy1_right);
    patrol_enemy(&enemy2_x, &enemy2_dir, enemy2_left, enemy2_right);
}

static void collect_items(void) {
    unsigned char i;
    for (i = 0; i < NUM_GEMS; ++i) {
        if (!gem_collected[i] && overlap(x, y, 16, 32, gem_x[i], gem_y[i], 8, 8)) {
            gem_collected[i] = 1;
            ++score;
        }
    }
    if (!heart_collected && overlap(x, y, 16, 32, heart_x, heart_y, 8, 8)) {
        heart_collected = 1;
    }
}

static void talk_to_npc(unsigned char npc) {
    active_npc = npc;
    if (npc == 1) show_dialogue(msg1_line1, msg1_line2, msg1_line3);
    else show_dialogue(msg2_line1, msg2_line2, msg2_line3);
    game_state = STATE_DIALOGUE;
    prev_pad = pad;
}

static void update_playing(unsigned char a_pressed) {
    if (a_pressed && overlap(x, y, 16, 32, npc1_x - 4, npc1_y, 24, 16)) {
        talk_to_npc(1);
        return;
    }
    if (a_pressed && overlap(x, y, 16, 32, npc2_x - 4, npc2_y, 24, 16)) {
        talk_to_npc(2);
        return;
    }
    update_player();
    apply_gravity();
    update_enemies();
    collect_items();
}

static void update_dialogue(unsigned char a_pressed) {
    if (a_pressed) {
        hide_dialogue();
        game_state = STATE_PLAYING;
        active_npc = 0;
    }
}

static void draw_sprite(unsigned char sy, unsigned char tile,
                        unsigned char attr, unsigned char sx) {
    OAM_DATA = sy; OAM_DATA = tile; OAM_DATA = attr; OAM_DATA = sx;
}

static void draw_player(void) {
    unsigned char row, left_x, right_x;
    const unsigned char *tiles = anim_tiles[moved & 0x03];
    if (plrdir == FACE_LEFT) { left_x = x + 8; right_x = x; }
    else { left_x = x; right_x = x + 8; }
    for (row = 0; row < 4; ++row) {
        draw_sprite(y + (row << 3), tiles[row << 1], plrdir, left_x);
        draw_sprite(y + (row << 3), tiles[(row << 1) + 1], plrdir, right_x);
    }
}

static void draw_enemy(unsigned char ex, unsigned char ey,
                       unsigned char tl, unsigned char tr,
                       unsigned char bl, unsigned char br,
                       unsigned char palette) {
    draw_sprite(ey, tl, palette, ex);
    draw_sprite(ey, tr, palette, ex + 8);
    draw_sprite(ey + 8, bl, palette, ex);
    draw_sprite(ey + 8, br, palette, ex + 8);
}

static void draw_npcs(void) {
    draw_sprite(npc1_y, 0x60, 0x02, npc1_x);
    draw_sprite(npc1_y, 0x61, 0x02, npc1_x + 8);
    draw_sprite(npc1_y + 8, 0x70, 0x02, npc1_x);
    draw_sprite(npc1_y + 8, 0x71, 0x02, npc1_x + 8);
    draw_sprite(npc2_y, 0x62, 0x03, npc2_x);
    draw_sprite(npc2_y, 0x63, 0x03, npc2_x + 8);
    draw_sprite(npc2_y + 8, 0x72, 0x03, npc2_x);
    draw_sprite(npc2_y + 8, 0x73, 0x03, npc2_x + 8);
}

static void draw_items(void) {
    unsigned char i;
    for (i = 0; i < NUM_GEMS; ++i) {
        draw_sprite(gem_collected[i] ? 0xFF : gem_y[i], 0x48, 0x03,
                    gem_collected[i] ? 0 : gem_x[i]);
    }
    draw_sprite(heart_collected ? 0xFF : heart_y, 0x49, 0x03,
                heart_collected ? 0 : heart_x);
}

static void game_update(void) {
    unsigned char a_pressed;
    pad = read_controller();
    a_pressed = (pad & BTN_A) && !(prev_pad & BTN_A);
    if (game_state == STATE_PLAYING) update_playing(a_pressed);
    else update_dialogue(a_pressed);
    prev_pad = pad;
}

static void game_draw(void) {
    waitvsync();
    reset_scroll();
    OAM_ADDR = 0;
    draw_player();
    draw_npcs();
    draw_enemy(enemy1_x, enemy1_y, 0x40, 0x41, 0x50, 0x51, 0x01);
    draw_enemy(enemy2_x, enemy2_y, 0x44, 0x45, 0x54, 0x55, 0x02);
    draw_items();
}

void main(void) {
    init_player();
    init_game();
    while (1) {
        game_update();
        game_draw();
    }
}
