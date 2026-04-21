/* Sprint 11 S-1 — scroll core implementation.  See scroll.h. */
#include "scroll.h"

/* Gate the entire body on world size so 1x1 builds contain no scroll
   symbols at all — keeps the 1x1 ROM byte-identical to the pre-S-1
   baseline.  Unused extern declarations in scroll.h are harmless. */
#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)

#define PPU_CTRL      *((unsigned char*)0x2000)
#define PPU_SCROLL    *((unsigned char*)0x2005)
#define PPU_ADDR      *((unsigned char*)0x2006)
#define PPU_DATA      *((unsigned char*)0x2007)

/* BG pattern table 1 (matches main.c's boot-time PPU_CTRL setup). */
#define PPU_CTRL_BASE 0x10
/* Auto-increment stride: bit 2 = 0 -> +1 per write (row walk),
                          bit 2 = 1 -> +32 per write (column walk). */
#define PPU_CTRL_STRIDE_COL 0x04

unsigned int cam_x;
unsigned int cam_y;

/* Camera position the last time we streamed a column / row.  Used to
   detect 8-px (tile) boundary crossings so we write exactly one
   column/row per boundary crossed. */
static unsigned int prev_cam_x;
static unsigned int prev_cam_y;

void scroll_init(void) {
    cam_x = 0;
    cam_y = 0;
    prev_cam_x = 0;
    prev_cam_y = 0;
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
    /* PPU_CTRL nametable-select bits: bit 0 = horizontal nametable,
       bit 1 = vertical.  Picked from cam_x/y bit 8 — when the camera
       crosses a screen boundary the "left" nametable flips.  Also
       resets auto-increment to +1 (row walk) in case scroll_stream()
       left it at +32. */
    unsigned char ctrl = PPU_CTRL_BASE;
    if (cam_x & 0x100) ctrl |= 0x01;
    if (cam_y & 0x100) ctrl |= 0x02;
    PPU_CTRL = ctrl;
    PPU_SCROLL = (unsigned char)(cam_x & 0xFF);
    PPU_SCROLL = (unsigned char)(cam_y & 0xFF);
}

/* Column / row streaming.  Called by main.c during VBlank (rendering
   off, PPU safe to write).  Writes one 30-tile column per 8 px of
   horizontal travel and one 32-tile row per 8 px of vertical travel —
   well inside the VBlank budget for normal walk speeds (1-3 px/frame).

   Large target-jumps (e.g. a teleport) may iterate the while loop
   several times; for slice 3c we accept this.  Slice 3d can cap it
   and defer the tail until the next VBlank. */
void scroll_stream(void) {
#if (BG_WORLD_COLS > 32)
    /* Horizontal tile streaming: one new column per 8 px of travel. */
    while ((cam_x >> 3) != (prev_cam_x >> 3)) {
        unsigned int col;
        unsigned int addr;
        unsigned char rr;

        if (cam_x > prev_cam_x) {
            prev_cam_x += 8;
            /* Column that just became visible on the right edge. */
            col = (prev_cam_x + SCREEN_W_PX - 8) >> 3;
        } else {
            prev_cam_x -= 8;
            /* Column that just became visible on the left edge. */
            col = prev_cam_x >> 3;
        }
        if (col >= BG_WORLD_COLS) continue;

        /* Bit 5 of the column id picks which nametable to write into —
           V-mirror aliases $2800/$2C00 to $2000/$2400 so this walks
           cleanly across arbitrarily wide worlds. */
        addr = ((col & 0x20) ? 0x2400 : 0x2000) + (col & 0x1F);

        /* +32 stride so successive PPU_DATA writes walk down the
           column rather than across the row. */
        PPU_CTRL = PPU_CTRL_BASE | PPU_CTRL_STRIDE_COL;
        PPU_ADDR = (unsigned char)(addr >> 8);
        PPU_ADDR = (unsigned char)(addr & 0xFF);
        for (rr = 0; rr < 30; rr++) {
            PPU_DATA = bg_world_tiles[(unsigned int)rr *
                                      BG_WORLD_COLS + col];
        }
    }
#endif
#if (BG_WORLD_ROWS > 30)
    /* Vertical tile streaming: one new row per 8 px of travel. */
    while ((cam_y >> 3) != (prev_cam_y >> 3)) {
        unsigned int row;
        unsigned int addr;
        unsigned char cc;

        if (cam_y > prev_cam_y) {
            prev_cam_y += 8;
            row = (prev_cam_y + SCREEN_H_PX - 8) >> 3;
        } else {
            prev_cam_y -= 8;
            row = prev_cam_y >> 3;
        }
        if (row >= BG_WORLD_ROWS) continue;

        /* Bit 5 of the row id picks vertical nametable via H-mirror. */
        addr = ((row & 0x20) ? 0x2800 : 0x2000) +
               (unsigned int)(row & 0x1F) * 32;
        /* +1 stride (default) so the 32-byte burst walks across the row. */
        PPU_CTRL = PPU_CTRL_BASE;
        PPU_ADDR = (unsigned char)(addr >> 8);
        PPU_ADDR = (unsigned char)(addr & 0xFF);
        for (cc = 0; cc < 32; cc++) {
            PPU_DATA = bg_world_tiles[row * BG_WORLD_COLS + cc];
        }
    }
#endif
}

void load_world_bg(void) {
    /* Number of screens to load on each axis: 1 for non-scrolling
       axes, 2 for scrolling axes.  Worlds taller / wider than 2
       screens rely on scroll_stream() to fill the remaining data
       in as the camera moves. */
    unsigned char n_screens_x;
    unsigned char n_screens_y;
    unsigned char sx;
    unsigned char sy;
    unsigned char rr;
    unsigned char cc;
    unsigned int nt_base;
    unsigned int addr;

    n_screens_x = (BG_WORLD_COLS > 32) ? 2 : 1;
    n_screens_y = (BG_WORLD_ROWS > 30) ? 2 : 1;

    /* Row-walk stride (+1 per write). */
    PPU_CTRL = PPU_CTRL_BASE;

    for (sy = 0; sy < n_screens_y; sy++) {
        for (sx = 0; sx < n_screens_x; sx++) {
            /* Nametable base:
                 sx=0,sy=0 -> $2000 (NT0)
                 sx=1,sy=0 -> $2400 (NT1, separate under V-mirror)
                 sx=0,sy=1 -> $2800 (NT2, separate under H-mirror)
                 sx=1,sy=1 -> $2C00 (needs 4-screen mirroring) */
            nt_base = 0x2000;
            if (sx) nt_base += 0x400;
            if (sy) nt_base += 0x800;

            /* 30 rows x 32 tiles = one screen worth of nametable. */
            for (rr = 0; rr < 30; rr++) {
                addr = nt_base + (unsigned int)rr * 32;
                PPU_ADDR = (unsigned char)(addr >> 8);
                PPU_ADDR = (unsigned char)(addr & 0xFF);
                for (cc = 0; cc < 32; cc++) {
                    PPU_DATA = bg_world_tiles[
                        ((unsigned int)sy * 30 + rr) * BG_WORLD_COLS +
                        (unsigned int)sx * 32 + cc];
                }
            }

            /* 8 rows x 8 bytes = one screen worth of attributes. */
            for (rr = 0; rr < 8; rr++) {
                addr = nt_base + 0x3C0 + (unsigned int)rr * 8;
                PPU_ADDR = (unsigned char)(addr >> 8);
                PPU_ADDR = (unsigned char)(addr & 0xFF);
                for (cc = 0; cc < 8; cc++) {
                    PPU_DATA = bg_world_attrs[
                        ((unsigned int)sy * 8 + rr) * BG_WORLD_ATTR_COLS +
                        (unsigned int)sx * 8 + cc];
                }
            }
        }
    }

    /* Prime the streamer's baseline.  First tile column past the
       loaded screens is the one scroll_stream() will fetch on the
       first 8-px crossing of the camera. */
    prev_cam_x = 0;
    prev_cam_y = 0;
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

#endif  /* BG_WORLD_COLS > 32 || BG_WORLD_ROWS > 30 */
