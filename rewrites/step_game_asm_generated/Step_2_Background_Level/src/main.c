#include <nes.h>

#define PPU_CTRL   (*(volatile unsigned char*)0x2000)
#define PPU_MASK   (*(volatile unsigned char*)0x2001)
#define OAM_ADDR   (*(volatile unsigned char*)0x2003)
#define OAM_DATA   (*(volatile unsigned char*)0x2004)
#define PPU_SCROLL (*(volatile unsigned char*)0x2005)
#define PPU_ADDR   (*(volatile unsigned char*)0x2006)
#define PPU_DATA   (*(volatile unsigned char*)0x2007)
#define JOYPAD1    (*(volatile unsigned char*)0x4016)

#define BTN_UP     0x08
#define BTN_DOWN   0x04
#define BTN_LEFT   0x02
#define BTN_RIGHT  0x01

#define FACE_RIGHT 0x00
#define FACE_LEFT  0x40
#define FLOOR_Y    176
#define WALK_TICKS 7

extern void load_background(void);

static unsigned char x, y, pad, jump, jmptime, plrdir, moved, moveWait;

static const unsigned char anim_tiles[4][8] = {
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a },
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c }
};

static void ppu_seek(unsigned char hi, unsigned char lo) {
    PPU_ADDR = hi;
    PPU_ADDR = lo;
}

static void reset_scroll(void) {
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
}

static void write_palettes(void) {
    ppu_seek(0x3F, 0x00);
    PPU_DATA = 0x21;
    PPU_DATA = 0x29;
    PPU_DATA = 0x19;
    PPU_DATA = 0x07;

    ppu_seek(0x3F, 0x05);
    PPU_DATA = 0x00;
    PPU_DATA = 0x10;
    PPU_DATA = 0x2D;

    ppu_seek(0x3F, 0x11);
    PPU_DATA = 0x30;
    PPU_DATA = 0x27;
    PPU_DATA = 0x17;
}

static void init_player(void) {
    x = 60;
    y = FLOOR_Y;
    pad = 0;
    jump = 1;
    jmptime = 0;
    plrdir = FACE_RIGHT;
    moved = 0;
    moveWait = 0;
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
    JOYPAD1 = 1;
    JOYPAD1 = 0;
    for (i = 0; i < 8; ++i) {
        result <<= 1;
        if (JOYPAD1 & 1) result |= 1;
    }
    return result;
}

static void step_walk(void) {
    ++moveWait;
    if (moveWait >= WALK_TICKS) {
        ++moved;
        moveWait = 0;
    }
}

static void update_player(void) {
    if ((pad & BTN_UP) && jump && jmptime == 0) {
        y -= 3;
        jmptime = 15;
    }
    if ((pad & BTN_DOWN) && y < FLOOR_Y) ++y;
    if (pad & BTN_LEFT) {
        --x;
        plrdir = FACE_LEFT;
        step_walk();
    }
    if (pad & BTN_RIGHT) {
        ++x;
        plrdir = FACE_RIGHT;
        step_walk();
    }
}

static void apply_gravity(void) {
    if (y < FLOOR_Y) {
        jump = 0;
        if (jmptime) {
            --jmptime;
            y -= 3;
        } else {
            y += 3;
        }
    } else {
        jump = 1;
    }
}

static void draw_sprite(unsigned char sy, unsigned char tile,
                        unsigned char attr, unsigned char sx) {
    OAM_DATA = sy;
    OAM_DATA = tile;
    OAM_DATA = attr;
    OAM_DATA = sx;
}

static void draw_player(void) {
    unsigned char row;
    unsigned char left_x;
    unsigned char right_x;
    const unsigned char *tiles = anim_tiles[moved & 0x03];

    if (plrdir == FACE_LEFT) {
        left_x = x + 8;
        right_x = x;
    } else {
        left_x = x;
        right_x = x + 8;
    }

    OAM_ADDR = 0;
    for (row = 0; row < 4; ++row) {
        draw_sprite(y + (row << 3), tiles[row << 1], plrdir, left_x);
        draw_sprite(y + (row << 3), tiles[(row << 1) + 1], plrdir, right_x);
    }
}

static void game_update(void) {
    pad = read_controller();
    update_player();
    apply_gravity();
}

static void game_draw(void) {
    waitvsync();
    reset_scroll();
    draw_player();
}

void main(void) {
    init_player();
    init_game();
    while (1) {
        game_update();
        game_draw();
    }
}
