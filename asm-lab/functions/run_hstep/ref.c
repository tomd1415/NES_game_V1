/* C reference for the auto-runner horizontal + respawn (BW_GAME_STYLE == 2),
 * lifted from platformer.c. The camera advances AUTOSCROLL_SPEED px/frame; the
 * player rides it at a fixed on-screen X (so the world scrolls past); and reaching
 * the track end, touching a spike tile at the body centre, or falling off the
 * bottom snaps back to the start (runner_respawn resets cam_x/px/py/jumping/jmp_up).
 *
 * This leaf is ONLY the novel horizontal + respawn — the runner's vertical
 * (jump/gravity/ladder) is the SHARED platformer block (pl_ladder/pl_jump/
 * pl_vmove), already proven. Inputs/outputs are shared globals BOTH the C ref and
 * the ASM read/write (the px_integrate/td_update convention). behaviour_at + the
 * map live here so the C and ASM call the SAME spike lookup; the driver fills the
 * map before each case. A 2-screen world (64 cols) so cam_x actually wraps. */
#define WORLD_COLS 64
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define PLAYER_W 2
#define PLAYER_H 2
#define SCREEN_W_PX 256
#define WORLD_W_PX (WORLD_COLS * 8)          /* 512 */
#define WORLD_H_PX (WORLD_ROWS * 8)          /* 240 */
#define AUTOSCROLL_SPEED 2
#define RUNNER_SCREEN_X 64
#define BW_RUNNER_SPIKE_ID 7
#define PLAYER_Y 176
#define RUNNER_CAM_MAX (WORLD_W_PX - SCREEN_W_PX)   /* 256 */

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;
unsigned int  cam_x, px, py;
unsigned char jumping, jmp_up;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

static void runner_respawn(void) {
    cam_x = 0;
    px = RUNNER_SCREEN_X;
    py = PLAYER_Y;
    jumping = 0;
    jmp_up = 0;
}

void run_hstep_ref(void) {
    cam_x += AUTOSCROLL_SPEED;
    if (cam_x >= RUNNER_CAM_MAX) runner_respawn();
    px = cam_x + RUNNER_SCREEN_X;
    {
        unsigned char run_c = (unsigned char)((px + (PLAYER_W << 2)) >> 3);
        unsigned char run_r = (unsigned char)((py + (PLAYER_H << 2)) >> 3);
        if (behaviour_at((unsigned int)run_c, (unsigned int)run_r) == BW_RUNNER_SPIKE_ID)
            runner_respawn();
    }
    if (py >= (WORLD_H_PX - 8)) runner_respawn();
}
