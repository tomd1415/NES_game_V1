/* C reference for the PLATFORMER vertical physics (BW_GAME_STYLE == 0, non-SMB),
 * lifted from platformer.c: the jump-ascent + gravity/fall block that runs every
 * frame after the horizontal walk.
 *   on_ladder            -> skip (the ladder branch owns py).
 *   jumping && jmp_up>0   -> ASCENT: if the head tile (either body column at the
 *                           row 2px above) is SOLID/WALL, bonk (jmp_up=0); else
 *                           rise 2px (py>=18) or snap to 16, and jmp_up--.
 *   else                 -> GRAVITY: if a foot tile (either column at (py+PH*8)>>3)
 *                           is SOLID/WALL/PLATFORM, land (snap py to the tile top,
 *                           jumping=0); else fall 2px (while py < WORLD_H_PX-8)
 *                           and jumping=1.
 * Inputs/outputs are shared globals (like td_update). px is read (body columns)
 * but not written; py/jumping/jmp_up are the outputs. This is sub-step 4a-i of
 * the platformer player update; walk/ladder/jump-trigger are separate leaves.
 */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define BEHAVIOUR_SOLID_GROUND 1
#define BEHAVIOUR_WALL 2
#define BEHAVIOUR_PLATFORM 3
#define PLAYER_W 2
#define PLAYER_H 2
#define WORLD_H_PX 240

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;

unsigned int  px, py;
unsigned char jumping, jmp_up, on_ladder;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

void plat_vmove_ref(void) {
    if (on_ladder) {
        /* ladder branch owns py */
    } else if (jumping && jmp_up > 0) {
        unsigned char head_row = (py >= 2) ? ((py - 2) >> 3) : 0;
        unsigned char head_l = behaviour_at((unsigned int)(px >> 3), (unsigned int)head_row);
        unsigned char head_r = behaviour_at((unsigned int)((px + (PLAYER_W << 3) - 1) >> 3), (unsigned int)head_row);
        if (head_l == BEHAVIOUR_SOLID_GROUND || head_l == BEHAVIOUR_WALL
         || head_r == BEHAVIOUR_SOLID_GROUND || head_r == BEHAVIOUR_WALL) {
            jmp_up = 0;
        } else {
            if (py >= 18) py -= 2; else py = 16;
            jmp_up--;
        }
    } else {
        unsigned char foot_row = (py + (PLAYER_H << 3)) >> 3;
        unsigned char foot_l = behaviour_at((unsigned int)(px >> 3), (unsigned int)foot_row);
        unsigned char foot_r = behaviour_at((unsigned int)((px + (PLAYER_W << 3) - 1) >> 3), (unsigned int)foot_row);
        if (foot_l == BEHAVIOUR_SOLID_GROUND || foot_l == BEHAVIOUR_WALL || foot_l == BEHAVIOUR_PLATFORM
         || foot_r == BEHAVIOUR_SOLID_GROUND || foot_r == BEHAVIOUR_WALL || foot_r == BEHAVIOUR_PLATFORM) {
            py = ((unsigned int)foot_row << 3) - (PLAYER_H << 3);
            jumping = 0;
        } else {
            if (py < (WORLD_H_PX - 8)) py += 2;
            jumping = 1;
        }
    }
}
