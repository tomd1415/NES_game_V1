// =============================================================================
// NES PLAYGROUND - auto-generated scene driver
// =============================================================================
// This file is part of the one-click "Play in NES" pipeline.  Everything it
// needs -- palettes, player tile layout, static sprite table -- is injected
// through the two generated headers written by tools/playground_server.py.
//
// Controls: LEFT / RIGHT walk along the ground; UP jumps.  The "ground" is
// whatever Y the player was placed at in the editor's Play-in-NES dialog.
// Gravity pulls the player back down to that line, so the scene behaves
// like a simple side-on platformer.  Sprite flips horizontally when moving
// left.  If the pupil has assigned a walk / jump animation in the sprites
// editor, the player cycles through those frames; otherwise the static
// player_tiles layout is used unchanged.
//
// The `//>> id: hint` and `//<<` markers below mark up the bits pupils
// are meant to change in Guided mode on the Code page.  They are plain
// comments, so Advanced-mode pupils (and anyone building this file
// straight with `make`) see them as normal source.
// =============================================================================

#include <nes.h>
#include "palettes.inc"
#include "scene.inc"
#include "collision.h"   // BEHAVIOUR_* ids + behaviour_at() — from the Behaviour page.

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
unsigned char prev_pad;      // for edge-triggering the jump
unsigned char ground_y;      // Y the player was placed at — the "floor"
unsigned char jumping;       // 1 while airborne
unsigned char jmp_up;        // ascent frames remaining (0 = falling)
unsigned char plrdir;        // 0x40 when facing left (flip-H on every tile)
//>> walk_speed: How many pixels the player moves each frame. 1 = slow, 2 = normal, 3 = fast.
unsigned char walk_speed = 1;
//<<
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

// Write a zero-terminated string of tile indices to the nametable at
// (row, col). Briefly turns rendering off and back on so the PPU write
// does not corrupt the active frame. Used by the NPC-dialogue snippet.
void draw_text(unsigned char row, unsigned char col,
               const unsigned char *text) {
    unsigned int addr;
    unsigned char j;
    waitvsync();
    PPU_MASK = 0;
    addr = 0x2000 + ((unsigned int)row * 32) + col;
    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);
    j = 0;
    while (text[j] != 0x00) {
        PPU_DATA = text[j];
        j++;
    }
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
}

void clear_text_row(unsigned char row, unsigned char col, unsigned char width) {
    unsigned int addr;
    unsigned char j;
    waitvsync();
    PPU_MASK = 0;
    addr = 0x2000 + ((unsigned int)row * 32) + col;
    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);
    for (j = 0; j < width; j++) {
        PPU_DATA = 0x00;
    }
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
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

//>> player_start: Where the player begins. X = left(0) to right(240). Y = top(16) to bottom(200).
    px = PLAYER_X;
    py = PLAYER_Y;
    ground_y = PLAYER_Y;
//<<
    jumping = 0;
    jmp_up = 0;
    prev_pad = 0;
    plrdir = 0x00;
    anim_mode = 0;
    anim_prev_mode = 0xFF;
    anim_frame = 0;
    anim_tick = 0;

    while (1) {
        pad = read_controller();

        // Horizontal walk with screen-bounds clamp.
        if (pad & 0x01) {                     // RIGHT
            if (px < (256 - PLAYER_W * 8)) px += walk_speed;
            plrdir = 0x00;
        }
        if (pad & 0x02) {                     // LEFT
            if (px >= walk_speed) px -= walk_speed;
            plrdir = 0x40;
        }

        // UP = jump.  Edge-triggered: must release and re-press to
        // bounce again, and only takes off from the ground.
        if ((pad & 0x08) && !(prev_pad & 0x08) && !jumping) {
            jumping = 1;
//>> jump_height: How high the player jumps. Bigger number = higher jump (try 10 to 40).
            jmp_up = 20;
//<<
        }
        prev_pad = pad;

        // Gravity: during the ascent phase move up 2 px/frame for
        // jmp_up frames, then fall 2 px/frame until we reach ground_y.
        if (jumping) {
            if (jmp_up > 0) {
                if (py >= 18) py -= 2; else py = 16;
                jmp_up--;
            } else {
                py += 2;
                if (py >= ground_y) {
                    py = ground_y;
                    jumping = 0;
                }
            }
        }

        // Pick the active animation for this frame.  Jumping wins over
        // walking so the jump cycle plays even while drifting sideways.
        // Unassigned animations (count == 0) fall through to the static
        // player_tiles layout.
        anim_mode = 0;
#if JUMP_FRAME_COUNT > 0
        if (jumping) anim_mode = 2;
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

//>> gravity: Scene sprites fall until they land on solid_ground or platform. Tick 🕊 Flying on the Sprites page to make a sprite hover instead.
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            unsigned char foot_b;
            if (ss_flying[i]) continue;
            foot_b = behaviour_at(
                (unsigned int)(ss_x[i] >> 3),
                (unsigned int)((ss_y[i] + (ss_h[i] << 3)) >> 3));
            if (foot_b == BEHAVIOUR_SOLID_GROUND || foot_b == BEHAVIOUR_PLATFORM) {
                continue;  // resting on a surface — don't fall further
            }
            if (ss_y[i] < 232) ss_y[i]++;  // fall 1 px/frame, clamp near screen bottom
        }
//<<

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
