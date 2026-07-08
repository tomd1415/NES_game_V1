/* C reference for the TOP-DOWN player update (BW_GAME_STYLE == 1), lifted from
 * platformer.c: 4-way move with per-direction collision, no gravity/jump/ladder.
 *   RIGHT/LEFT: probe the column just ahead across EVERY body row (loop), step
 *               walk_speed px if clear; also sets plrdir.
 *   UP/DOWN:    probe the two body columns at the row just ahead, step if clear.
 *   then jumping = jmp_up = on_ladder = 0.
 * Horizontal runs before vertical, so UP/DOWN see the post-horizontal px.
 *
 * Inputs/outputs are shared globals (like px_integrate / box_on_edge). PLAYER_W/H
 * and the world bounds are the compile-time constants the real build bakes in;
 * the lab uses a 32x30 (256x240) world + a 2x2 player. px/py are 16-bit (u16
 * scroll width). behaviour_at + the driver-filled map live here so ref and asm
 * share one lookup.
 */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define BEHAVIOUR_SOLID_GROUND 1
#define BEHAVIOUR_WALL 2
#define PLAYER_W 2
#define PLAYER_H 2
#define WORLD_W_PX 256
#define WORLD_H_PX 240

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;

unsigned int  px, py;
unsigned char pad, walk_speed, plrdir, jumping, jmp_up, on_ladder;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

void td_update_ref(void) {
    if (pad & 0x01) {                     /* RIGHT */
        if (px < (WORLD_W_PX - PLAYER_W * 8)) {
            unsigned char ahead_col = (px + (PLAYER_W << 3) + walk_speed - 1) >> 3;
            unsigned char top_row = py >> 3;
            unsigned char bot_row = (py + (PLAYER_H << 3) - 1) >> 3;
            unsigned char blocked = 0, rr, bb;
            for (rr = top_row; rr <= bot_row; rr++) {
                bb = behaviour_at((unsigned int)ahead_col, (unsigned int)rr);
                if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) { blocked = 1; break; }
            }
            if (!blocked) px += walk_speed;
        }
        plrdir = 0x00;
    }
    if (pad & 0x02) {                     /* LEFT */
        if (px >= walk_speed) {
            unsigned char ahead_col = (px - walk_speed) >> 3;
            unsigned char top_row = py >> 3;
            unsigned char bot_row = (py + (PLAYER_H << 3) - 1) >> 3;
            unsigned char blocked = 0, rr, bb;
            for (rr = top_row; rr <= bot_row; rr++) {
                bb = behaviour_at((unsigned int)ahead_col, (unsigned int)rr);
                if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) { blocked = 1; break; }
            }
            if (!blocked) px -= walk_speed;
        }
        plrdir = 0x40;
    }
    if (pad & 0x08) {                     /* UP */
        if (py >= walk_speed) {
            unsigned char ahead_row = (py - walk_speed) >> 3;
            unsigned char left_col  = px >> 3;
            unsigned char right_col = (px + (PLAYER_W << 3) - 1) >> 3;
            unsigned char b_l = behaviour_at((unsigned int)left_col,  (unsigned int)ahead_row);
            unsigned char b_r = behaviour_at((unsigned int)right_col, (unsigned int)ahead_row);
            if (!(b_l == BEHAVIOUR_SOLID_GROUND || b_l == BEHAVIOUR_WALL
               || b_r == BEHAVIOUR_SOLID_GROUND || b_r == BEHAVIOUR_WALL)) {
                py -= walk_speed;
            }
        }
    }
    if (pad & 0x04) {                     /* DOWN */
        if (py + (PLAYER_H << 3) + walk_speed <= WORLD_H_PX) {
            unsigned char ahead_row = (py + (PLAYER_H << 3) + walk_speed - 1) >> 3;
            unsigned char left_col  = px >> 3;
            unsigned char right_col = (px + (PLAYER_W << 3) - 1) >> 3;
            unsigned char b_l = behaviour_at((unsigned int)left_col,  (unsigned int)ahead_row);
            unsigned char b_r = behaviour_at((unsigned int)right_col, (unsigned int)ahead_row);
            if (!(b_l == BEHAVIOUR_SOLID_GROUND || b_l == BEHAVIOUR_WALL
               || b_r == BEHAVIOUR_SOLID_GROUND || b_r == BEHAVIOUR_WALL)) {
                py += walk_speed;
            }
        }
    }
    jumping = 0; jmp_up = 0; on_ladder = 0;
}
