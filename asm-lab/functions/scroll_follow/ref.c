/* C reference for scroll_follow, from scroll.c, with a fixed lab world of
 * 512x480 px (2 screens each way) so BOTH axes are active. cam_x/cam_y are the
 * exported globals both versions read+write; the driver seeds them per case.
 *   max_cam_x = 512-256 = 256 ;  max_cam_y = 480-240 = 240
 */
#define SCREEN_W_PX 256
#define SCREEN_H_PX 240
#define WORLD_W_PX  512
#define WORLD_H_PX  480
#define DEADZONE_LEFT   96
#define DEADZONE_RIGHT  144
#define DEADZONE_TOP    96
#define DEADZONE_BOTTOM 144

unsigned int cam_x;
unsigned int cam_y;

void sf_ref(unsigned int target_world_x, unsigned int target_world_y) {
    unsigned int dz_left, dz_right, dz_top, dz_bot, max_cam_x, max_cam_y;

    if (WORLD_W_PX > SCREEN_W_PX) {
        dz_left  = cam_x + DEADZONE_LEFT;
        dz_right = cam_x + DEADZONE_RIGHT;
        max_cam_x = WORLD_W_PX - SCREEN_W_PX;
        if (target_world_x < dz_left) {
            unsigned int delta = dz_left - target_world_x;
            cam_x = (delta > cam_x) ? 0 : (cam_x - delta);
        } else if (target_world_x > dz_right) {
            unsigned int delta = target_world_x - dz_right;
            cam_x += delta;
            if (cam_x > max_cam_x) cam_x = max_cam_x;
        }
    }

    if (WORLD_H_PX > SCREEN_H_PX) {
        dz_top = cam_y + DEADZONE_TOP;
        dz_bot = cam_y + DEADZONE_BOTTOM;
        max_cam_y = WORLD_H_PX - SCREEN_H_PX;
        if (target_world_y < dz_top) {
            unsigned int delta = dz_top - target_world_y;
            cam_y = (delta > cam_y) ? 0 : (cam_y - delta);
        } else if (target_world_y > dz_bot) {
            unsigned int delta = target_world_y - dz_bot;
            cam_y += delta;
            if (cam_y > max_cam_y) cam_y = max_cam_y;
        }
    }
}
