/* C reference for behaviour_at, from behaviour.c. Looks up the behaviour byte
 * for a world tile coord, bounds-checked. WORLD_COLS/ROWS are compile-time
 * constants per project; the lab uses the 1-screen defaults (32x30). The map
 * lives at active_behaviour_map (WRAM here); the driver fills it before testing.
 */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0

unsigned char the_map[WORLD_COLS * WORLD_ROWS];        /* 960 bytes, driver-filled */
const unsigned char *active_behaviour_map = the_map;

unsigned char bat_ref(unsigned int world_col, unsigned int world_row) {
    if (world_col >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (world_row >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[world_row * WORLD_COLS + world_col];
}
