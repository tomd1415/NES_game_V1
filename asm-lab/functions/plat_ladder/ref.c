/* C reference for the platformer LADDER branch, lifted from platformer.c: detect
 * whether the player's body overlaps a LADDER tile, and if so climb UP/DOWN with
 * a ladder-wins-over-solid tie-break (a ladder punched through a floor is
 * climbable), pinning jumping/jmp_up to 0. Detection always runs (sets
 * on_ladder); the climb + resets only when on_ladder. Sub-step 4a-ii of the
 * platformer player update. px is read (body columns) but not written.
 */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define BEHAVIOUR_SOLID_GROUND 1
#define BEHAVIOUR_WALL 2
#define BEHAVIOUR_LADDER 6
#define PLAYER_W 2
#define PLAYER_H 2
#define WORLD_H_PX 240

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;

unsigned int  px, py;
unsigned char pad, climb_speed, jumping, jmp_up, on_ladder;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

void plat_ladder_ref(void) {
    {
        unsigned char lt_row = py >> 3;
        unsigned char lb_row = (py + (PLAYER_H << 3) - 1) >> 3;
        unsigned char ll_col = px >> 3;
        unsigned char lr_col = (px + (PLAYER_W << 3) - 1) >> 3;
        unsigned char lrr;
        on_ladder = 0;
        for (lrr = lt_row; lrr <= lb_row; lrr++) {
            if (behaviour_at((unsigned int)ll_col, (unsigned int)lrr) == BEHAVIOUR_LADDER
             || behaviour_at((unsigned int)lr_col, (unsigned int)lrr) == BEHAVIOUR_LADDER) {
                on_ladder = 1;
                break;
            }
        }
    }
    if (on_ladder) {
        if (pad & 0x08) {                 /* UP */
            unsigned int new_top = (py >= climb_speed) ? (py - climb_speed) : 0;
            unsigned char up_row = new_top >> 3;
            unsigned char up_l = behaviour_at((unsigned int)(px >> 3), (unsigned int)up_row);
            unsigned char up_r = behaviour_at((unsigned int)((px + (PLAYER_W << 3) - 1) >> 3), (unsigned int)up_row);
            unsigned char up_ladder = (up_l == BEHAVIOUR_LADDER) || (up_r == BEHAVIOUR_LADDER);
            unsigned char up_solid  = (up_l == BEHAVIOUR_SOLID_GROUND) || (up_l == BEHAVIOUR_WALL)
                                   || (up_r == BEHAVIOUR_SOLID_GROUND) || (up_r == BEHAVIOUR_WALL);
            if (up_ladder || !up_solid) py = new_top;
        }
        if (pad & 0x04) {                 /* DOWN */
            unsigned int new_foot = py + climb_speed + (PLAYER_H << 3);
            unsigned char dn_row = new_foot >> 3;
            unsigned char dn_l = behaviour_at((unsigned int)(px >> 3), (unsigned int)dn_row);
            unsigned char dn_r = behaviour_at((unsigned int)((px + (PLAYER_W << 3) - 1) >> 3), (unsigned int)dn_row);
            unsigned char dn_ladder = (dn_l == BEHAVIOUR_LADDER) || (dn_r == BEHAVIOUR_LADDER);
            unsigned char dn_solid  = (dn_l == BEHAVIOUR_SOLID_GROUND) || (dn_l == BEHAVIOUR_WALL)
                                   || (dn_r == BEHAVIOUR_SOLID_GROUND) || (dn_r == BEHAVIOUR_WALL);
            if ((dn_ladder || !dn_solid) && py < (WORLD_H_PX - 8)) py += climb_speed;
        }
        jumping = 0;
        jmp_up = 0;
    }
}
