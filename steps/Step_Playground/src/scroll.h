/* Sprint 11 S-1 — scroll core (shared by platformer + top-down mains).
   This header is committed as part of slice 2; slice 3 rewires main.c
   to actually call these functions.  Until then the symbols sit in
   scroll.o but nothing references them, so the 1x1 ROM is unaffected.

   World coordinates are in 8x8-tile units multiplied by 8 — i.e. pixel
   units spanning the full BG_WORLD_COLS*8 by BG_WORLD_ROWS*8 world.
   Screen coordinates are the familiar 0..255 / 0..239 pixel grid. */
#ifndef SCROLL_H
#define SCROLL_H

#include "bg_world.h"

/* Visible NES window, in pixels. */
#define SCREEN_W_PX        256
#define SCREEN_H_PX        240

/* Full world, in pixels.  For 1x1 projects these equal the screen. */
#define WORLD_W_PX         (BG_WORLD_COLS * 8)
#define WORLD_H_PX         (BG_WORLD_ROWS * 8)

/* Camera deadzone: a rectangle centred on the visible window.  When the
   follow target sits inside it the camera does not move.  Defaults are
   pupil-tunable via a //>> camera_deadzone region in main.c (slice 3). */
#ifndef DEADZONE_LEFT
#define DEADZONE_LEFT      96
#endif
#ifndef DEADZONE_RIGHT
#define DEADZONE_RIGHT     144
#endif
#ifndef DEADZONE_TOP
#define DEADZONE_TOP       96
#endif
#ifndef DEADZONE_BOTTOM
#define DEADZONE_BOTTOM    144
#endif

/* Camera (world-space pixel) origin. */
extern unsigned int cam_x;
extern unsigned int cam_y;

/* Initialise the camera to (0, 0). */
void scroll_init(void);

/* Pull the camera toward the target world pixel coordinate, keeping the
   target inside the deadzone and clamping at world edges.  No-op on
   axes where the world equals the screen (1x1 projects, or single-axis
   scrolling projects along the non-scrolling axis). */
void scroll_follow(unsigned int target_world_x, unsigned int target_world_y);

/* Write the current camera to the PPU_SCROLL register pair.  Must be
   called after waitvsync() and before the OAM DMA.  Slice 3 extends
   this to toggle the PPU_CTRL nametable-select bits for beyond-256-px
   scrolling; for now it writes only the low bytes. */
void scroll_apply_ppu(void);

/* World pixel -> screen pixel.  Returns 0xFF (off-screen) for anything
   outside the current visible window. */
unsigned char world_to_screen_x(unsigned int world_x);
unsigned char world_to_screen_y(unsigned int world_y);

#endif
