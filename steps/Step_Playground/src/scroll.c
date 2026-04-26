/* Sprint 11 S-1 — scroll core implementation.  See scroll.h. */
#include "scroll.h"

/* Gate the entire body on world size so 1x1 builds contain no scroll
   symbols at all — keeps the 1x1 ROM byte-identical to the pre-S-1
   baseline.  Unused extern declarations in scroll.h are harmless. */
#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)

/* `volatile` is load-bearing.  The column-burst below sets PPU_CTRL
   to +32 stride immediately before 30 PPU_DATA writes; without the
   volatile qualifier cc65 is free to elide the stride-flip write
   because the next syntactic access to the same address is another
   assignment ("PPU_CTRL = PPU_CTRL_BASE" further down).  When that
   elision happens the column burst runs with whatever stride the
   previous frame left behind (+1 after scroll_apply_ppu) and the
   30 tiles smear across one nametable row instead of stepping down
   the column — visible in FCEUX as horizontal stripes accumulating
   in NT0/NT1 as the camera scrolls. */
#define PPU_CTRL      (*(volatile unsigned char*)0x2000)
#define PPU_SCROLL    (*(volatile unsigned char*)0x2005)
#define PPU_ADDR      (*(volatile unsigned char*)0x2006)
#define PPU_DATA      (*(volatile unsigned char*)0x2007)

/* BG pattern table 1 (matches main.c's boot-time PPU_CTRL setup).
   Bit 7 (NMI enable) is added when USE_AUDIO=1 — every PPU_CTRL write
   in this file happens inside the main loop's vblank window AFTER the
   FamiStudio engine has been initialised, so it's safe to keep the
   bit set across burst flips and the apply call.  Critically, PPU
   stride-flip writes during scroll_stream's column burst MUST keep
   bit 7 set: dropping it mid-frame would disable NMI generation
   for the *next* vblank, the famistudio NMI handler would stop
   firing, and music would stall. */
#ifdef USE_AUDIO
#define PPU_CTRL_BASE 0x90
#else
#define PPU_CTRL_BASE 0x10
#endif
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

/* Column / row streaming — split into a prepare phase (runs outside
   vblank, where slow array indexing is fine) and a write phase (runs
   inside vblank, where every cycle counts).

   Streams one 30-tile column per 8 px of horizontal travel and one
   32-tile row per 8 px of vertical travel — capped at one transfer
   per axis per vblank so a fast teleport spreads its catch-up over
   subsequent frames instead of stacking 62-byte bursts on top of OAM
   DMA + dialogue + scroll_apply_ppu in a single vblank.

   Why split prepare/stream:  the original combined loop computed
   `bg_world_tiles[rr * BG_WORLD_COLS + col]` *inside* vblank.  cc65
   does not optimise that into a constant-stride pointer walk, so
   each iteration paid ~30+ cycles for the multiplication, the 16-bit
   index, the array load, plus the PPU_DATA write — close to 1000
   cycles for a 30-tile column.  Combined with OAM DMA's 513 cycles
   and any dialogue writes, the late tail of the burst could spill
   past line 261's T->V copy (~cycle 2358) into the visible frame,
   producing a "ghost copy a few tiles below" flash.  Precomputing
   into col_buf / row_buf outside vblank trims the in-vblank loop to
   roughly *buf -> PPU_DATA, halving its cycle cost. */

#if (BG_WORLD_COLS > 32)
static unsigned char col_buf[30];
static unsigned int  col_addr;
static unsigned char col_pending;  /* 1 = col_buf has a column ready */
#endif
#if (BG_WORLD_ROWS > 30)
static unsigned char row_buf[32];
static unsigned int  row_addr;
static unsigned char row_pending;
#endif

void scroll_stream_prepare(void) {
#if (BG_WORLD_COLS > 32)
    col_pending = 0;
    /* Horizontal tile streaming: one new column per 8 px of travel.
       Capped at one column per vblank. */
    if ((cam_x >> 3) != (prev_cam_x >> 3)) {
        unsigned int col;

        if (cam_x > prev_cam_x) {
            prev_cam_x += 8;
            /* Column that just became visible on the right edge. */
            col = (prev_cam_x + SCREEN_W_PX - 8) >> 3;
        } else {
            prev_cam_x -= 8;
            /* Column that just became visible on the left edge. */
            col = prev_cam_x >> 3;
        }
        /* Only stream when the column lies inside the painted world. */
        if (col < BG_WORLD_COLS) {
            unsigned char rr;

            for (rr = 0; rr < 30; rr++) {
                col_buf[rr] = bg_world_tiles[(unsigned int)rr *
                                             BG_WORLD_COLS + col];
            }
            /* Bit 5 of the column id picks which nametable to write into —
               V-mirror aliases $2800/$2C00 to $2000/$2400 so this walks
               cleanly across arbitrarily wide worlds. */
            col_addr = ((col & 0x20) ? 0x2400 : 0x2000) + (col & 0x1F);
            col_pending = 1;
        }
    }
#endif
#if (BG_WORLD_ROWS > 30)
    row_pending = 0;
    /* Vertical tile streaming: one new row per 8 px of travel. */
    if ((cam_y >> 3) != (prev_cam_y >> 3)) {
        unsigned int row;

        if (cam_y > prev_cam_y) {
            prev_cam_y += 8;
            row = (prev_cam_y + SCREEN_H_PX - 8) >> 3;
        } else {
            prev_cam_y -= 8;
            row = prev_cam_y >> 3;
        }
        if (row < BG_WORLD_ROWS) {
            unsigned char cc;

            for (cc = 0; cc < 32; cc++) {
                row_buf[cc] = bg_world_tiles[row * BG_WORLD_COLS + cc];
            }
            /* Bit 5 of the row id picks vertical nametable via H-mirror. */
            row_addr = ((row & 0x20) ? 0x2800 : 0x2000) +
                       (unsigned int)(row & 0x1F) * 32;
            row_pending = 1;
        }
    }
#endif
}

/* Fully unrolled column / row burst.  cc65 is invoked without `-O`, so
   a `for (i = 0; i < N; i++) PPU_DATA = buf[i];` loop costs roughly
   50–65 CPU cycles per iteration once you count the index promotion,
   the comparison, and cc65's stack-machine register juggling.  Thirty
   iterations like that come close to ~1700 cycles by themselves —
   enough that the tail of the burst can spill past line 261's T->V
   copy at cycle 2358 into the visible frame, advancing the rendering
   V register by +32 per spilled write and producing the 12-tile-below
   ghost flash pupils were seeing.

   Unrolling collapses each write to `lda col_buf+N; sta $2007` (8
   cycles) since the index is a compile-time constant — under 250
   cycles for the whole burst, well inside the vblank budget.  The
   `EMIT_*` macros are the most readable form of "this is purposely
   one statement per byte"; the loop they replace is preserved in
   the comment above scroll_stream_prepare for context. */
#define SCROLL_EMIT(N)  PPU_DATA = col_buf[N]
#define SCROLL_EMIT_ROW(N)  PPU_DATA = row_buf[N]

void scroll_stream(void) {
#if (BG_WORLD_COLS > 32)
    if (col_pending) {
        /* +32 stride so successive PPU_DATA writes walk down the
           column rather than across the row. */
        PPU_CTRL = PPU_CTRL_BASE | PPU_CTRL_STRIDE_COL;
        PPU_ADDR = (unsigned char)(col_addr >> 8);
        PPU_ADDR = (unsigned char)(col_addr & 0xFF);
        SCROLL_EMIT( 0); SCROLL_EMIT( 1); SCROLL_EMIT( 2); SCROLL_EMIT( 3);
        SCROLL_EMIT( 4); SCROLL_EMIT( 5); SCROLL_EMIT( 6); SCROLL_EMIT( 7);
        SCROLL_EMIT( 8); SCROLL_EMIT( 9); SCROLL_EMIT(10); SCROLL_EMIT(11);
        SCROLL_EMIT(12); SCROLL_EMIT(13); SCROLL_EMIT(14); SCROLL_EMIT(15);
        SCROLL_EMIT(16); SCROLL_EMIT(17); SCROLL_EMIT(18); SCROLL_EMIT(19);
        SCROLL_EMIT(20); SCROLL_EMIT(21); SCROLL_EMIT(22); SCROLL_EMIT(23);
        SCROLL_EMIT(24); SCROLL_EMIT(25); SCROLL_EMIT(26); SCROLL_EMIT(27);
        SCROLL_EMIT(28); SCROLL_EMIT(29);
        col_pending = 0;
    }
#endif
#if (BG_WORLD_ROWS > 30)
    if (row_pending) {
        /* +1 stride (default) so the 32-byte burst walks across the row. */
        PPU_CTRL = PPU_CTRL_BASE;
        PPU_ADDR = (unsigned char)(row_addr >> 8);
        PPU_ADDR = (unsigned char)(row_addr & 0xFF);
        SCROLL_EMIT_ROW( 0); SCROLL_EMIT_ROW( 1); SCROLL_EMIT_ROW( 2); SCROLL_EMIT_ROW( 3);
        SCROLL_EMIT_ROW( 4); SCROLL_EMIT_ROW( 5); SCROLL_EMIT_ROW( 6); SCROLL_EMIT_ROW( 7);
        SCROLL_EMIT_ROW( 8); SCROLL_EMIT_ROW( 9); SCROLL_EMIT_ROW(10); SCROLL_EMIT_ROW(11);
        SCROLL_EMIT_ROW(12); SCROLL_EMIT_ROW(13); SCROLL_EMIT_ROW(14); SCROLL_EMIT_ROW(15);
        SCROLL_EMIT_ROW(16); SCROLL_EMIT_ROW(17); SCROLL_EMIT_ROW(18); SCROLL_EMIT_ROW(19);
        SCROLL_EMIT_ROW(20); SCROLL_EMIT_ROW(21); SCROLL_EMIT_ROW(22); SCROLL_EMIT_ROW(23);
        SCROLL_EMIT_ROW(24); SCROLL_EMIT_ROW(25); SCROLL_EMIT_ROW(26); SCROLL_EMIT_ROW(27);
        SCROLL_EMIT_ROW(28); SCROLL_EMIT_ROW(29); SCROLL_EMIT_ROW(30); SCROLL_EMIT_ROW(31);
        row_pending = 0;
    }
#endif
    /* Leave PPU_CTRL in the default +1-stride state.  The horizontal
       block above flips it to +32; nothing inside scroll_stream resets
       it afterwards on that path, and a later PPU_DATA write (e.g.
       the dialogue module's vblank_writes) would otherwise land with
       the wrong stride and corrupt rows further down the nametable. */
    PPU_CTRL = PPU_CTRL_BASE;
}

#undef SCROLL_EMIT
#undef SCROLL_EMIT_ROW

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
