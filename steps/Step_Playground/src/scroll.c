/* Sprint 11 S-1 — scroll core implementation.  See scroll.h. */
#include "scroll.h"

#define PPU_SCROLL    *((unsigned char*)0x2005)

unsigned int cam_x;
unsigned int cam_y;

void scroll_init(void) {
    cam_x = 0;
    cam_y = 0;
}

void scroll_follow(unsigned int target_world_x, unsigned int target_world_y) {
    unsigned int dz_left;
    unsigned int dz_right;
    unsigned int dz_top;
    unsigned int dz_bot;
    unsigned int max_cam_x;
    unsigned int max_cam_y;

    /* Horizontal axis. */
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

    /* Vertical axis. */
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

void scroll_apply_ppu(void) {
    PPU_SCROLL = (unsigned char)(cam_x & 0xFF);
    PPU_SCROLL = (unsigned char)(cam_y & 0xFF);
}

unsigned char world_to_screen_x(unsigned int world_x) {
    if (world_x < cam_x) return 0xFF;
    {
        unsigned int off = world_x - cam_x;
        if (off >= SCREEN_W_PX) return 0xFF;
        return (unsigned char)off;
    }
}

unsigned char world_to_screen_y(unsigned int world_y) {
    if (world_y < cam_y) return 0xFF;
    {
        unsigned int off = world_y - cam_y;
        if (off >= SCREEN_H_PX) return 0xFF;
        return (unsigned char)off;
    }
}
