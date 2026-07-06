/* C reference for the main-loop animation-advance block, lifted verbatim from
 * steps/Step_Playground/src/main.c (the per-frame anim state machine). Operates
 * only on the engine-owned anim_* globals; PLAYER_TILES_PER_FRAME is the one
 * per-project constant (PLAYER_W*PLAYER_H) — baked to 4 here / in the ASM (like
 * behaviour_at bakes WORLD_COLS). Defines the globals the ASM twin imports.
 */
#define PLAYER_TILES_PER_FRAME 4

unsigned char anim_mode;
unsigned char anim_prev_mode;
unsigned char anim_frame;
unsigned char anim_tick;
unsigned char anim_frame_count;
unsigned char anim_frame_ticks;
unsigned int  anim_base;

void advance_ref(void) {
    if (anim_mode != anim_prev_mode) {
        anim_frame = 0;
        anim_tick = 0;
        anim_prev_mode = anim_mode;
    }
    if (anim_frame_count > 1) {
        anim_tick++;
        if (anim_tick >= anim_frame_ticks) {
            anim_tick = 0;
            anim_frame++;
            if (anim_frame >= anim_frame_count) anim_frame = 0;
        }
    }
    anim_base = (unsigned int)anim_frame * PLAYER_TILES_PER_FRAME;
}
