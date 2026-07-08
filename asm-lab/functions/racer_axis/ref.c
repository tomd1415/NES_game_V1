/* C reference for the racer per-axis MOVE (BW_GAME_STYLE 3), lifted from
 * platformer.c: for each axis independently — integrate the 8.8 velocity (the
 * px_integrate pattern), clamp to the world, then if the new box overlaps a
 * SOLID/WALL cell (box_on_edge: 4 corners + centre) undo THAT axis and flag the
 * hit. X resolves before Y so the car slides along a wall. After both axes, bleed
 * speed (>>1) only when the blocked axis carried the dominant velocity.
 *
 * Shares the map + behaviour_at + rbe_bx/by/bw/bh globals with the proven
 * box_on_edge ASM (functions/box_on_edge/asm.s) — this leaf reuses _rbe_asm and
 * only adds the integrate/clamp/undo/bleed around it. Positions are u16 (scroll). */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define BEHAVIOUR_SOLID_GROUND 1
#define BEHAVIOUR_WALL 2
#define PLAYER_W 2
#define PLAYER_H 2
#define WORLD_W_PX 256
#define WORLD_H_PX 240
#define RX_MAX (WORLD_W_PX - PLAYER_W * 8)   /* 240 */
#define RY_MAX (WORLD_H_PX - PLAYER_H * 8)   /* 224 */

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;
unsigned int  rbe_bx, rbe_by;
unsigned char rbe_bw, rbe_bh;

unsigned int  px, py;
unsigned char px_sub, py_sub;
signed int    vx, vy;
signed int    racer_speed;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

static unsigned char rbe_c(void) {
    unsigned char c0 = (unsigned char)(rbe_bx >> 3);
    unsigned char c1 = (unsigned char)((rbe_bx + rbe_bw * 8 - 1) >> 3);
    unsigned char r0 = (unsigned char)(rbe_by >> 3);
    unsigned char r1 = (unsigned char)((rbe_by + rbe_bh * 8 - 1) >> 3);
    unsigned char cm = (unsigned char)((rbe_bx + rbe_bw * 4) >> 3);
    unsigned char rm = (unsigned char)((rbe_by + rbe_bh * 4) >> 3);
    unsigned char b;
    b = behaviour_at(c0, r0); if (b == 1 || b == 2) return 1;
    b = behaviour_at(c1, r0); if (b == 1 || b == 2) return 1;
    b = behaviour_at(c0, r1); if (b == 1 || b == 2) return 1;
    b = behaviour_at(c1, r1); if (b == 1 || b == 2) return 1;
    b = behaviour_at(cm, rm); if (b == 1 || b == 2) return 1;
    return 0;
}

void racer_axis_ref(void) {
    unsigned char hit_x = 0, hit_y = 0;
    signed int avx, avy, acc, np;
    unsigned int keep;
    unsigned char keep_sub;

    /* --- X --- */
    keep = px; keep_sub = px_sub;
    acc = (signed int)px_sub + vx;
    np  = (signed int)px + (acc >> 8);
    px_sub = (unsigned char)(acc & 0xFF);
    if (np < 0) { np = 0; px_sub = 0; }
    else if (np > (signed int)RX_MAX) { np = (signed int)RX_MAX; px_sub = 0; }
    px = (unsigned int)np;
    rbe_bx = px; rbe_by = py; rbe_bw = PLAYER_W; rbe_bh = PLAYER_H;
    if (rbe_c()) { px = keep; px_sub = keep_sub; hit_x = 1; }

    /* --- Y --- */
    keep = py; keep_sub = py_sub;
    acc = (signed int)py_sub + vy;
    np  = (signed int)py + (acc >> 8);
    py_sub = (unsigned char)(acc & 0xFF);
    if (np < 0) { np = 0; py_sub = 0; }
    else if (np > (signed int)RY_MAX) { np = (signed int)RY_MAX; py_sub = 0; }
    py = (unsigned int)np;
    rbe_bx = px; rbe_by = py; rbe_bw = PLAYER_W; rbe_bh = PLAYER_H;
    if (rbe_c()) { py = keep; py_sub = keep_sub; hit_y = 1; }

    /* --- dominant-axis speed bleed --- */
    avx = vx < 0 ? -vx : vx;
    avy = vy < 0 ? -vy : vy;
    if ((hit_x && avx >= avy) || (hit_y && avy >= avx)) racer_speed >>= 1;
}
