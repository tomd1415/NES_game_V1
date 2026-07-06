#include <nes.h>

#define PPU_CTRL   (*(volatile unsigned char*)0x2000)
#define PPU_MASK   (*(volatile unsigned char*)0x2001)
#define PPU_ADDR   (*(volatile unsigned char*)0x2006)
#define PPU_DATA   (*(volatile unsigned char*)0x2007)
#define OAM_ADDR   (*(volatile unsigned char*)0x2003)
#define OAM_DATA   (*(volatile unsigned char*)0x2004)
#define JOYPAD1    (*(volatile unsigned char*)0x4016)

#define BTN_UP     0x08
#define BTN_DOWN   0x04
#define BTN_LEFT   0x02
#define BTN_RIGHT  0x01

#define FACE_RIGHT 0x00
#define FACE_LEFT  0x40

#define FLOOR_Y    150
#define JUMP_FRAMES 15
#define STEP_PIXELS 1
#define LIFT_PIXELS 3
#define FALL_PIXELS 3
#define WALK_TICK_LIMIT 7

static unsigned char player_x;
static unsigned char player_y;
static unsigned char pad;
static unsigned char can_jump;
static unsigned char jump_time;
static unsigned char facing;
static unsigned char walk_frame;
static unsigned char walk_tick;

static const unsigned char anim_tiles[4][8] = {
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x09, 0x0a, 0x19, 0x1a, 0x29, 0x2a, 0x39, 0x3a },
    { 0x01, 0x02, 0x11, 0x12, 0x21, 0x22, 0x31, 0x32 },
    { 0x0b, 0x0c, 0x1b, 0x1c, 0x2b, 0x2c, 0x3b, 0x3c }
};

static void ppu_off(void) {
    PPU_MASK = 0;
}

static void ppu_on(void) {
    PPU_MASK = 0x1E;
}

static void ppu_seek(unsigned char hi, unsigned char lo) {
    PPU_ADDR = hi;
    PPU_ADDR = lo;
}

static void write_palette(void) {
    ppu_seek(0x3F, 0x00);
    PPU_DATA = 0x12;

    ppu_seek(0x3F, 0x11);
    PPU_DATA = 0x30;
    PPU_DATA = 0x27;
    PPU_DATA = 0x17;
}

static void init_graphics(void) {
    waitvsync();
    ppu_off();
    write_palette();
    ppu_on();
}

static void init_player(void) {
    player_x = 120;
    player_y = 120;
    pad = 0;
    can_jump = 1;
    jump_time = 0;
    facing = FACE_RIGHT;
    walk_frame = 0;
    walk_tick = 0;
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

static void step_walk_animation(void) {
    ++walk_tick;
    if (walk_tick >= WALK_TICK_LIMIT) {
        ++walk_frame;
        walk_tick = 0;
    }
}

static void begin_jump(void) {
    if (can_jump && jump_time == 0) {
        player_y -= LIFT_PIXELS;
        jump_time = JUMP_FRAMES;
    }
}

static void move_player(void) {
    if (pad & BTN_UP) begin_jump();

    if ((pad & BTN_DOWN) && player_y < FLOOR_Y) {
        ++player_y;
    }

    if (pad & BTN_LEFT) {
        player_x -= STEP_PIXELS;
        facing = FACE_LEFT;
        step_walk_animation();
    }

    if (pad & BTN_RIGHT) {
        player_x += STEP_PIXELS;
        facing = FACE_RIGHT;
        step_walk_animation();
    }
}

static void apply_gravity(void) {
    if (player_y < FLOOR_Y) {
        can_jump = 0;
        if (jump_time) {
            --jump_time;
            player_y -= LIFT_PIXELS;
        } else {
            player_y += FALL_PIXELS;
        }
    } else {
        can_jump = 1;
    }
}

static unsigned char animation_frame(void) {
    return walk_frame & 0x03;
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
    const unsigned char *tiles = anim_tiles[animation_frame()];

    if (facing == FACE_LEFT) {
        left_x = player_x + 8;
        right_x = player_x;
    } else {
        left_x = player_x;
        right_x = player_x + 8;
    }

    OAM_ADDR = 0;
    for (row = 0; row < 4; ++row) {
        draw_sprite(player_y + (row << 3), tiles[row << 1], facing, left_x);
        draw_sprite(player_y + (row << 3), tiles[(row << 1) + 1], facing, right_x);
    }
}

static void game_update(void) {
    pad = read_controller();
    move_player();
    apply_gravity();
}

static void game_draw(void) {
    waitvsync();
    draw_player();
}

void main(void) {
    init_player();
    init_graphics();

    while (1) {
        game_update();
        game_draw();
    }
}
