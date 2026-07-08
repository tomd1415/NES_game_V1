/* C reference for racer_box_on_edge — the per-axis player/box collision predicate
 * from platformer.c: true if a bw x bh-tile box at (bx,by) overlaps a SOLID_GROUND
 * or WALL cell, probed at the 4 corners + the centre (5 behaviour_at lookups).
 *
 * Inputs are shared globals BOTH the C reference and the ASM candidate read
 * (like px_integrate) — this isolates the box->cells->OR logic from the fastcall
 * ABI, which is a wiring concern for the integration milestone. bx/by are 16-bit
 * so this covers the u16 (scroll) width; behaviour_at bounds-checks the map, so
 * a box whose cells fall past the world reads NONE (not a wrapped in-bounds cell).
 *
 * behaviour_at + the map live here too so racer_cell_solid (C) and the ASM both
 * call the SAME lookup; the driver (test.c) fills the map before the sweep.
 */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define BEHAVIOUR_SOLID_GROUND 1
#define BEHAVIOUR_WALL 2

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;

unsigned int  rbe_bx, rbe_by;
unsigned char rbe_bw, rbe_bh;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

unsigned char racer_cell_solid(unsigned char c, unsigned char r) {
    unsigned char b = behaviour_at((unsigned int)c, (unsigned int)r);
    return (b == BEHAVIOUR_SOLID_GROUND || b == BEHAVIOUR_WALL);
}

unsigned char rbe_ref(void) {
    unsigned char c0 = (unsigned char)(rbe_bx >> 3);
    unsigned char c1 = (unsigned char)((rbe_bx + rbe_bw * 8 - 1) >> 3);
    unsigned char r0 = (unsigned char)(rbe_by >> 3);
    unsigned char r1 = (unsigned char)((rbe_by + rbe_bh * 8 - 1) >> 3);
    unsigned char cm = (unsigned char)((rbe_bx + rbe_bw * 4) >> 3);
    unsigned char rm = (unsigned char)((rbe_by + rbe_bh * 4) >> 3);
    return racer_cell_solid(c0, r0) || racer_cell_solid(c1, r0)
        || racer_cell_solid(c0, r1) || racer_cell_solid(c1, r1)
        || racer_cell_solid(cm, rm);
}
