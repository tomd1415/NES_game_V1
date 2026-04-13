/*! LESSON
{
  "id": "03-magic-button",
  "title": "Magic Button",
  "difficulty": 3,
  "summary": "Write your own controller code. Make the B button do something cool.",
  "description": "So far the D-pad and UP button already do things. In this lesson YOU write the code for the B button (that's Z on the keyboard in the browser emulator). When the pupil presses B, something special should happen.",
  "goal": "Make the B button do ONE of these: (a) TELEPORT the player back to where they started, (b) FREEZE gravity so they float in the air, or (c) TURN the player's direction around. Any of them counts.",
  "hints": [
    "The `pad` variable holds every button that is currently pressed. `pad & 0x40` is true when B is held (A is 0x80, START is 0x10, SELECT is 0x20).",
    "For a teleport, set px and py back to numbers. The player's starting X/Y came from PLAYER_X / PLAYER_Y.",
    "The magic_button region is inside the main game loop, so any code you write runs every single frame. That is why holding B keeps the effect going.",
    "Try starting simple: `if (pad & 0x40) { px = 16; }` snaps the player to the left edge whenever B is held."
  ]
}
*/

// =============================================================================
// LESSON 3 — Magic Button
// =============================================================================
// One editable region (`magic_button`) is placed inside the main loop,
// after the controller read but before the sprite render pass.  Anything
// the pupil writes there runs every frame.
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
unsigned char prev_pad;
unsigned char ground_y;
unsigned char jumping;
unsigned char jmp_up;
unsigned char plrdir;
unsigned char walk_speed = 1;
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

    PPU_CTRL = 0x10;
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;

    px = PLAYER_X;
    py = PLAYER_Y;
    ground_y = PLAYER_Y;
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

        if (pad & 0x01) {
            if (px < (256 - PLAYER_W * 8)) px += walk_speed;
            plrdir = 0x00;
        }
        if (pad & 0x02) {
            if (px >= walk_speed) px -= walk_speed;
            plrdir = 0x40;
        }

        if ((pad & 0x08) && !(prev_pad & 0x08) && !jumping) {
            jumping = 1;
            jmp_up = 20;
        }
        prev_pad = pad;

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

//>> magic_button: Write code here that runs every frame. Try checking `if (pad & 0x40)` for the B button.
        // Example (remove the // to enable it):
        // if (pad & 0x40) {
        //     px = PLAYER_X;
        //     py = PLAYER_Y;
        // }
//<<

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

        waitvsync();
        PPU_SCROLL = 0;
        PPU_SCROLL = 0;
        OAM_ADDR = 0x00;

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
