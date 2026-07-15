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

/* Full-world pixel dimensions are defined in bg_world.h so main.c can
   reference them on the 1x1 fast path (where scroll.h is not included). */

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

/* Write the current camera to the PPU_CTRL + PPU_SCROLL registers.
   Must be called last (after OAM + any nametable streaming) so the
   registers hold the correct values when VBlank ends.  Toggles the
   PPU_CTRL nametable-select bits based on cam_x / cam_y bit 8 for
   beyond-256-px scrolling. */
void scroll_apply_ppu(void);

/* Two-phase column/row streaming.
 *
 *   scroll_stream_prepare() — call BEFORE waitvsync().  Detects 8-px
 *     boundary crossings since the last call, picks the column/row
 *     that needs streaming, and copies its 30 (or 32) bytes from
 *     bg_world_tiles into a small static buffer in scroll.c.  Also
 *     updates prev_cam_x / prev_cam_y.  Cheap operations stay outside
 *     vblank so the vblank-side write loop is just *buf -> PPU_DATA.
 *
 *   scroll_stream() — call inside VBlank, before scroll_apply_ppu().
 *     Blasts the prepared buffer into PPU_DATA.  No-op on frames where
 *     prepare() didn't queue anything.
 *
 * Splitting the work this way is what keeps the vblank window short
 * enough that PPU_MASK can be toggled around the critical writes
 * without bleeding visible scanlines into the start of the next
 * frame — see the rendering-disable wrap in main.c / platformer.c. */
void scroll_stream_prepare(void);
void scroll_stream(void);

/* One-shot: copy the first 1..2 screens of painted world into the
   PPU nametables + attribute tables at boot.  Rendering must be OFF
   (PPU_MASK = 0).  Replaces the graphics.s `load_background()` path
   used by 1x1 projects.  For a 2x1 world both screens are loaded
   up front, so no streaming happens until the pupil paints a third
   screen.  Skips the vertical-mirror path if the cfg hasn't been
   updated to H-mirror — V-scroll projects render correctly only on
   a build whose cfg has NES_MIRRORING=0. */
void load_world_bg(void);

/* World pixel -> screen pixel.  Returns 0xFF (off-screen) for anything
   outside the current visible window. */
unsigned char world_to_screen_x(unsigned int world_x);
unsigned char world_to_screen_y(unsigned int world_y);

#endif
