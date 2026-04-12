// =============================================================================
// NES PLAYGROUND - auto-generated scene driver
// =============================================================================
// This file is part of the one-click "Play in NES" pipeline.  Everything it
// needs -- palettes, player tile layout, static sprite table -- is injected
// through the two generated headers written by tools/playground_server.py.
//
// Controls: D-pad moves the player sprite.  Sprite flips horizontally when
// moving left.  The player is clamped to the visible screen area.  If the
// pupil has assigned a walk / jump animation in the sprites editor, the
// player cycles through those frames; otherwise the static player_tiles
// layout is used unchanged.
// =============================================================================

#include <nes.h>
#include "palettes.inc"
#include "scene.inc"

#define PPU_CTRL      *((unsigned char*)0x2000)
#define PPU_MASK      *((unsigned char*)0x2001)
#define OAM_ADDR      *((unsigned char*)0x2003)
#define OAM_DATA      *((unsigned char*)0x2004)
#define PPU_SCROLL    *((unsigned char*)0x2005)
#define PPU_ADDR      *((unsigned char*)0x2006)
#define PPU_DATA      *((unsigned char*)0x2007)
#define JOYPAD1       *((unsigned char*)0x4016)

#define PLAYER_TILES_PER_FRAME (PLAYER_W * PLAYER_H)

extern void load_background(void);

unsigned char px;
unsigned char py;
unsigned char pad;
unsigned char plrdir;        // 0x40 when facing left (flip-H on every tile)
unsigned char i;
unsigned char r;
unsigned char c;
unsigned char off;
unsigned char sw;
unsigned char sh;
unsigned char sx;
unsigned char sy;
unsigned char tile;
unsigned char attr;

// Animation playback.  mode: 0=static, 1=walk, 2=jump.  When the mode
// changes we reset frame/tick so a new animation always plays from its
// first frame.  anim_base is the byte offset of the current frame inside
// the active tiles/attrs table (frame_index * PLAYER_W * PLAYER_H).
unsigned char anim_mode;
unsigned char anim_prev_mode;
unsigned char anim_frame;
unsigned char anim_tick;
unsigned char anim_frame_count;
unsigned char anim_frame_ticks;
unsigned int  anim_base;
const unsigned char *anim_tiles;
const unsigned char *anim_attrs;

unsigned char read_controller(void) {
    unsigned char result = 0;
    unsigned char j;
    JOYPAD1 = 1;
    JOYPAD1 = 0;
    for (j = 0; j < 8; j++) {
        result = result << 1;
        if (JOYPAD1 & 1) result = result | 1;
    }
    return result;
}

void write_palettes(void) {
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    for (i = 0; i < 32; i++) {
        PPU_DATA = palette_bytes[i];
    }
}

void main(void) {
    waitvsync();
    PPU_MASK = 0;

    write_palettes();
    load_background();

    PPU_CTRL = 0x10;          // BG uses pattern table 1; sprites use table 0
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;

    px = PLAYER_X;
    py = PLAYER_Y;
    plrdir = 0x00;
    anim_mode = 0;
    anim_prev_mode = 0xFF;
    anim_frame = 0;
    anim_tick = 0;

    while (1) {
        pad = read_controller();

        // D-pad with screen-bounds clamp.  (PLAYER_W * 8 <= 255 so the
        // subtraction cannot underflow for any reasonable sprite.)
        if (pad & 0x01) {                     // RIGHT
            if (px < (256 - PLAYER_W * 8)) px++;
            plrdir = 0x00;
        }
        if (pad & 0x02) {                     // LEFT
            if (px > 0) px--;
            plrdir = 0x40;
        }
        if (pad & 0x04) {                     // DOWN
            if (py < (232 - PLAYER_H * 8)) py++;
        }
        if (pad & 0x08) {                     // UP
            if (py > 16) py--;
        }

        // Pick the active animation for this frame.  UP wins over LEFT/RIGHT
        // so holding the jump direction plays the jump cycle even while
        // drifting sideways.  Unassigned animations (count == 0) fall
        // through to the static player_tiles layout.
        anim_mode = 0;
#if JUMP_FRAME_COUNT > 0
        if (pad & 0x08) anim_mode = 2;
#endif
#if WALK_FRAME_COUNT > 0
        if (anim_mode == 0 && (pad & 0x03)) anim_mode = 1;
#endif

        if (anim_mode == 2) {
            anim_tiles = jump_tiles;
            anim_attrs = jump_attrs;
            anim_frame_count = JUMP_FRAME_COUNT;
            anim_frame_ticks = JUMP_FRAME_TICKS;
        } else if (anim_mode == 1) {
            anim_tiles = walk_tiles;
            anim_attrs = walk_attrs;
            anim_frame_count = WALK_FRAME_COUNT;
            anim_frame_ticks = WALK_FRAME_TICKS;
        } else {
            anim_tiles = player_tiles;
            anim_attrs = player_attrs;
            anim_frame_count = 1;
            anim_frame_ticks = 1;
        }

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

        waitvsync();
        PPU_SCROLL = 0;
        PPU_SCROLL = 0;
        OAM_ADDR = 0x00;

        // --- Player -------------------------------------------------------
        // When facing left, flip every tile horizontally AND draw the
        // columns in reverse order so the two-wide-or-wider sprite mirrors
        // correctly as a whole.
        for (r = 0; r < PLAYER_H; r++) {
            for (c = 0; c < PLAYER_W; c++) {
                sy = py + (r << 3);
                if (plrdir == 0x40) {
                    sx = px + (unsigned char)((PLAYER_W - 1 - c) << 3);
                } else {
                    sx = px + (c << 3);
                }
                tile = anim_tiles[anim_base + r * PLAYER_W + c];
                attr = anim_attrs[anim_base + r * PLAYER_W + c] ^ plrdir;
                OAM_DATA = sy;
                OAM_DATA = tile;
                OAM_DATA = attr;
                OAM_DATA = sx;
            }
        }

        // --- Static scene sprites ---------------------------------------
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            off = ss_offset[i];
            sw = ss_w[i];
            sh = ss_h[i];
            for (r = 0; r < sh; r++) {
                for (c = 0; c < sw; c++) {
                    OAM_DATA = ss_y[i] + (r << 3);
                    OAM_DATA = ss_tiles[off + r * sw + c];
                    OAM_DATA = ss_attrs[off + r * sw + c];
                    OAM_DATA = ss_x[i] + (c << 3);
                }
            }
        }
    }
}

const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
