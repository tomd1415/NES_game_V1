/* C reference for scroll_stream_prepare (horizontal column path), from
 * steps/Step_Playground/src/scroll.c with the fixture's BG_WORLD_COLS=64,
 * BG_WORLD_ROWS=30 (horizontal scroll only — the row path is #if'd out here too).
 *
 * Defines the shared streaming state the ASM twin imports (cam_x, prev_cam_x,
 * col_buf, col_addr, col_pending) plus a runtime-filled bg_world_tiles fixture.
 * The function detects an 8-px tile-boundary crossing, advances prev_cam_x by
 * one tile toward cam_x, and (if the newly exposed column lies in the world)
 * copies that 30-tile column into col_buf + computes its nametable address.
 */
#define BG_WORLD_COLS 64
#define SCREEN_W_PX   256

unsigned int  cam_x;
unsigned int  prev_cam_x;
unsigned char col_buf[30];
unsigned int  col_addr;
unsigned char col_pending;
unsigned char bg_world_tiles[BG_WORLD_COLS * 30];   /* filled by test.c main() */

void ssp_ref(void) {
    col_pending = 0;
    if ((cam_x >> 3) != (prev_cam_x >> 3)) {
        unsigned int col;
        if (cam_x > prev_cam_x) {
            prev_cam_x += 8;
            col = (prev_cam_x + SCREEN_W_PX - 8) >> 3;
        } else {
            prev_cam_x -= 8;
            col = prev_cam_x >> 3;
        }
        if (col < BG_WORLD_COLS) {
            unsigned char rr;
            for (rr = 0; rr < 30; rr++) {
                col_buf[rr] = bg_world_tiles[(unsigned int)rr * BG_WORLD_COLS + col];
            }
            col_addr = ((col & 0x20) ? 0x2400 : 0x2000) + (col & 0x1F);
            col_pending = 1;
        }
    }
}
