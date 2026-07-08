/* C reference for the racer LAP-counting FSM (BW_GAME_STYLE 3), lifted from
 * platformer.c: look up the behaviour cell under the car's CENTRE; a checkpoint
 * arms the lap (cp_stage 0->1, and 1->2 for the ordered 2nd checkpoint), and the
 * finish line counts a lap only while cp_stage has reached RACER_CP_COUNT (so a
 * pupil can't farm laps on the line). Reaching RACER_LAPS_TO_WIN ends the race.
 * The if/else-if means at most ONE transition fires per frame. Shared globals +
 * the_map/behaviour_at as in the other leaves. */
#define WORLD_COLS 32
#define WORLD_ROWS 30
#define BEHAVIOUR_NONE 0
#define PLAYER_W 2
#define PLAYER_H 2
#define BW_RACER_FINISH_ID 7
#define BW_RACER_CHECKPOINT_ID 5
#define BW_RACER_CHECKPOINT2_ID 6
#define RACER_CP_COUNT 1
#define RACER_LAPS_TO_WIN 3

unsigned char the_map[WORLD_COLS * WORLD_ROWS];
const unsigned char *active_behaviour_map = the_map;
unsigned int  px, py;
unsigned char racer_cp_stage, racer_laps, racer_finished;

unsigned char behaviour_at(unsigned int c, unsigned int r) {
    if (c >= WORLD_COLS) return BEHAVIOUR_NONE;
    if (r >= WORLD_ROWS) return BEHAVIOUR_NONE;
    return active_behaviour_map[r * WORLD_COLS + c];
}

void racer_laps_ref(void) {
    unsigned char mid = behaviour_at(
        (unsigned int)((px + (PLAYER_W << 2)) >> 3),
        (unsigned int)((py + (PLAYER_H << 2)) >> 3));
    if (mid == BW_RACER_CHECKPOINT_ID && racer_cp_stage == 0) racer_cp_stage = 1;
    else if (mid == BW_RACER_CHECKPOINT2_ID && racer_cp_stage == 1) racer_cp_stage = 2;
    else if (mid == BW_RACER_FINISH_ID && racer_cp_stage >= RACER_CP_COUNT) {
        racer_cp_stage = 0;
        if (++racer_laps >= RACER_LAPS_TO_WIN) racer_finished = 1;
    }
}
