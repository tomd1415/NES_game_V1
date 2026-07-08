/* C reference for the SMB horizontal INTEGRATE + world-clamp + leading-edge
 * collision (BW_SMB_JUMP), lifted from platformer.c. Sub-step 5a-ii of the SMB
 * player. The 8.8 integrate is the px_integrate pattern (np = px + (acc>>8),
 * acc = smb_px_sub + smb_vx, signed); then clamp np to the world (reset vx/sub
 * on a wall/edge), and if the step lands on a SOLID/WALL tile at the leading
 * edge, cancel it (reset vx/sub) instead of moving. */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define BEHAVIOUR_SOLID_GROUND 1
#define BEHAVIOUR_WALL 2
#define PLAYER_W 2
#define PLAYER_H 2
#define WORLD_W_PX 256

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;
unsigned int  px, py;
signed int    smb_vx;
unsigned char smb_px_sub;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

void smb_hstep_ref(void) {
    signed int acc = (signed int)smb_px_sub + smb_vx;
    signed int np = (signed int)px + (acc >> 8);
    smb_px_sub = (unsigned char)(acc & 0xFF);
    if (np < 0) { np = 0; smb_vx = 0; smb_px_sub = 0; }
    else if (np > (signed int)(WORLD_W_PX - PLAYER_W * 8)) {
        np = (signed int)(WORLD_W_PX - PLAYER_W * 8); smb_vx = 0; smb_px_sub = 0;
    }
    if (np != (signed int)px) {
        unsigned char edge_col = (np > (signed int)px)
            ? (unsigned char)((np + (PLAYER_W << 3) - 1) >> 3)
            : (unsigned char)((unsigned int)np >> 3);
        unsigned char top_row = py >> 3;
        unsigned char bot_row = (py + (PLAYER_H << 3) - 1) >> 3;
        unsigned char rr, bb, blocked = 0;
        for (rr = top_row; rr <= bot_row; rr++) {
            bb = behaviour_at((unsigned int)edge_col, (unsigned int)rr);
            if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) { blocked = 1; break; }
        }
        if (blocked) { smb_vx = 0; smb_px_sub = 0; }
        else px = (unsigned int)np;
    }
}
