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
#include "bg_world.h"    // BG_WORLD_COLS / BG_WORLD_ROWS — from the Backgrounds page.

// The scroll core is only pulled in when the pupil has painted a world
// larger than one screen.  1x1 projects compile exactly as before — the
// scroll path is removed by the preprocessor, so the ROM is byte-identical.
#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)
#define SCROLL_BUILD 1
//>> camera_deadzone: Pixel distances from the camera origin to each edge of the deadzone rectangle. Inside the rectangle the camera does not move. Bigger values = camera lags further behind the player; smaller = tighter follow. Try 64/192 for snappy, 96/144 for Mario-style lead.
#define DEADZONE_LEFT     96
#define DEADZONE_RIGHT    144
#define DEADZONE_TOP      96
#define DEADZONE_BOTTOM   144
//<<
#include "scroll.h"
#endif

#define PPU_CTRL      *((unsigned char*)0x2000)
#define PPU_MASK      *((unsigned char*)0x2001)
#define OAM_ADDR      *((unsigned char*)0x2003)
#define OAM_DATA      *((unsigned char*)0x2004)
#define PPU_SCROLL    *((unsigned char*)0x2005)
#define PPU_ADDR      *((unsigned char*)0x2006)
#define PPU_DATA      *((unsigned char*)0x2007)
#define JOYPAD1       *((unsigned char*)0x4016)
#define JOYPAD2       *((unsigned char*)0x4017)

#define PLAYER_TILES_PER_FRAME (PLAYER_W * PLAYER_H)

extern void load_background(void);

/* Player position is u16 world-space under SCROLL_BUILD so the pupil can
   walk across every painted screen.  1x1 projects keep the u8 type so
   cc65 generates the same single-byte compares / loads as before. */
#ifdef SCROLL_BUILD
typedef unsigned int pxcoord_t;
#else
typedef unsigned char pxcoord_t;
#endif

pxcoord_t px;
pxcoord_t py;
unsigned char pad;
unsigned char prev_pad;      // for edge-triggering the jump
unsigned char jumping;       // 1 while airborne (rising or falling)
unsigned char jmp_up;        // ascent frames remaining (0 = falling)
unsigned char on_ladder;     // 1 while the player is overlapping a LADDER tile
unsigned char plrdir;        // 0x40 when facing left (flip-H on every tile)
//>> walk_speed: How many pixels the player moves each frame. 1 = slow, 2 = normal, 3 = fast.
unsigned char walk_speed = 1;
//<<
//>> climb_speed: How many pixels the player moves per frame while on a LADDER tile. 1 = slow, 2 = normal.
unsigned char climb_speed = 1;
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

//@ insert: declarations

#if PLAYER_HP_ENABLED
/* Phase B finale chunk A — HP + damage.  The Builder's damage module
 * writes `#define PLAYER_HP_ENABLED 1` + `#define PLAYER_MAX_HP <n>`
 * + `#define DAMAGE_AMOUNT <n>` + `#define INVINCIBILITY_FRAMES <n>`
 * into the declarations slot above; that flips these globals on.
 * All of them are zeroed at init inside main(). */
unsigned char player_hp;
unsigned char player_iframes;
unsigned char player_dead;
#endif

#if PLAYER2_HP_ENABLED
/* Phase B+ round 1a — Player 2 HP.  Separate macro so single-
 * player damage-enabled games don't pay the P2 RAM cost. */
unsigned char player2_hp;
unsigned char player2_iframes;
unsigned char player2_dead;
#endif

#if BW_DIALOGUE_ENABLED
/* Phase B+ round 2 — dialogue.  The per_frame slot sets
 * bw_dialog_cmd on a B edge-press near an NPC; the vblank_writes
 * slot consumes it and pokes the nametable during the main
 * vblank window (no double-waitvsync → no frame skip).  `_open`
 * tracks whether a text box is on screen so the B press toggles;
 * `_prev_b` stores last frame's pad for edge detection.
 *
 * Round-2 follow-up (auto-close + pause): when BW_DIALOG_AUTOCLOSE
 * is > 0 the text closes itself after that many frames; B still
 * closes early.  When BW_DIALOG_PAUSE is 1 we snapshot the
 * player(s)' walk / climb speeds on open and zero them each
 * frame while the text is visible, then restore on close.  Both
 * flags are independent — pupils pick whichever combination
 * they want. */
unsigned char bw_dialog_open;
unsigned char bw_dialog_prev_b;
unsigned char bw_dialog_cmd;
#if BW_DIALOG_AUTOCLOSE > 0
unsigned char bw_dialog_timer;
#endif
#if BW_DIALOG_PAUSE
unsigned char bw_dialog_saved_walk;
unsigned char bw_dialog_saved_climb;
#if PLAYER2_ENABLED
unsigned char bw_dialog_saved_walk2;
#endif
#endif
#endif

#if BW_DOORS_MULTIBG_ENABLED
/* Phase B+ round 3 — multi-background doors.  The Builder's doors
 * module writes `#define BW_DOORS_MULTIBG_ENABLED 1` when the
 * target background differs from the starting one.  `current_bg`
 * tracks which room the player is in; `load_background_n(n)`
 * blits `bg_nametable_<n>` into PPU $2000 during a brief
 * render-off window. */
unsigned char current_bg;
static void load_background_n(unsigned char n);
#endif

#if PLAYER2_ENABLED
/* Phase B chunk 5 — Player 2 state.  Inlined alongside P1 globals so
 * reading them side-by-side makes the "same thing, second name"
 * pattern obvious to pupils who eject to the Code page.  Gated
 * entirely behind PLAYER2_ENABLED so a single-player build's RAM
 * / zero-page footprint is unchanged. */
pxcoord_t px2;
pxcoord_t py2;
unsigned char pad2;
unsigned char prev_pad2;
unsigned char jumping2;
unsigned char jmp_up2;
unsigned char plrdir2;
//>> player2_walk_speed: How many pixels Player 2 moves each frame.
unsigned char walk_speed2 = 1;
//<<
#if ANIM_PLAYER2_WALK_COUNT > 0
/* Phase B+ round 1b — Player 2 walk animation state.  Cycles the
 * pupil's `role=player2, style=walk` tagged animation while P2 is
 * moving.  Idle resets the frame counter so the cycle restarts
 * cleanly each time they start walking. */
unsigned char p2_walk_frame;
unsigned char p2_walk_tick;
#endif
#endif

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

#if PLAYER2_ENABLED
/* Read both controllers in a single strobe.  Writing 1→0 to JOYPAD1
 * latches both pads; subsequent reads of JOYPAD1 / JOYPAD2 shift out
 * bit 7 first through bit 0.  Doing both in one strobe (instead of
 * two separate reads) is the standard NES idiom — avoids edge
 * cases where a rapidly-pressed input changes between strobes. */
void read_both_controllers(void) {
    unsigned char j;
    JOYPAD1 = 1;
    JOYPAD1 = 0;
    pad = 0;
    pad2 = 0;
    for (j = 0; j < 8; j++) {
        pad  = (pad  << 1) | (JOYPAD1 & 1);
        pad2 = (pad2 << 1) | (JOYPAD2 & 1);
    }
}
#endif

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

#if BW_DOORS_MULTIBG_ENABLED
/* Blit one of the bg_nametable_<n>[] arrays into PPU $2000.
 * Rendering is off during the transfer; 1024 bytes takes a few
 * vblanks but pupils won't notice — it feels like a room swap.
 * Scroll is reset to (0,0) so the new room starts cleanly. */
static void load_background_n(unsigned char n) {
    unsigned int k;
    const unsigned char *src;
    waitvsync();
    PPU_MASK = 0;
    switch (n) {
#if BG_COUNT > 0
        case 0: src = bg_nametable_0; break;
#endif
#if BG_COUNT > 1
        case 1: src = bg_nametable_1; break;
#endif
#if BG_COUNT > 2
        case 2: src = bg_nametable_2; break;
#endif
#if BG_COUNT > 3
        case 3: src = bg_nametable_3; break;
#endif
        default:
#if BG_COUNT > 0
            src = bg_nametable_0;
#else
            src = 0;
#endif
            break;
    }
    if (src) {
        PPU_ADDR = 0x20;
        PPU_ADDR = 0x00;
        for (k = 0; k < 1024; k++) {
            PPU_DATA = src[k];
        }
    }
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
    current_bg = n;
}
#endif

void main(void) {
    waitvsync();
    PPU_MASK = 0;

    write_palettes();
#ifdef SCROLL_BUILD
    // Multi-screen projects load the whole painted world (up to the
    // first two screens per scrolling axis) from bg_world_tiles[]
    // rather than the cropped one-screen level.nam in graphics.s.
    scroll_init();
    load_world_bg();
    PPU_CTRL = 0x10;          // BG uses pattern table 1; sprites use table 0
    scroll_apply_ppu();
#else
    load_background();
    PPU_CTRL = 0x10;          // BG uses pattern table 1; sprites use table 0
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
#endif
    PPU_MASK = 0x1E;

//>> player_start: Where the player begins. X = left(0) to right(240). Y = top(16) to bottom(200). Paint SOLID_GROUND or PLATFORM tiles on the Behaviour page under this spot or the player will drop to the ground.
    px = PLAYER_X;
    py = PLAYER_Y;
//<<
    jumping = 0;
    jmp_up = 0;
    prev_pad = 0;
    plrdir = 0x00;
    anim_mode = 0;
    anim_prev_mode = 0xFF;
    anim_frame = 0;
    anim_tick = 0;

#if PLAYER2_ENABLED
//>> player2_start: Where Player 2 begins. The Builder fills this in; tweak it here if you'd rather hard-code.
    px2 = PLAYER2_X;
    py2 = PLAYER2_Y;
//<<
    jumping2 = 0;
    jmp_up2 = 0;
    prev_pad2 = 0;
    plrdir2 = 0x00;
#if ANIM_PLAYER2_WALK_COUNT > 0
    p2_walk_frame = 0;
    p2_walk_tick = 0;
#endif
#endif

#if PLAYER_HP_ENABLED
    player_hp = PLAYER_MAX_HP;
    player_iframes = 0;
    player_dead = 0;
#endif

#if PLAYER2_HP_ENABLED
    player2_hp = PLAYER2_MAX_HP;
    player2_iframes = 0;
    player2_dead = 0;
#endif

#if BW_DIALOGUE_ENABLED
    bw_dialog_open = 0;
    bw_dialog_prev_b = 0;
    bw_dialog_cmd = 0;
#if BW_DIALOG_AUTOCLOSE > 0
    bw_dialog_timer = 0;
#endif
#endif

#if BW_DOORS_MULTIBG_ENABLED
    current_bg = 0;
#endif

    //@ insert: init

    while (1) {
#if PLAYER2_ENABLED
        read_both_controllers();
#else
        pad = read_controller();
#endif

        // Horizontal walk with screen-bounds clamp.  SOLID_GROUND and WALL
        // tiles painted on the Behaviour page block the player from walking
        // through them — the column just ahead of the player's leading edge
        // is probed at every body row, and the step is cancelled if any row
        // meets a solid tile.  PLATFORM stays one-way (floor only).
        if (pad & 0x01) {                     // RIGHT
            if (px < (WORLD_W_PX - PLAYER_W * 8)) {
                unsigned char ahead_col = (px + (PLAYER_W << 3) + walk_speed - 1) >> 3;
                unsigned char top_row   = py >> 3;
                unsigned char bot_row   = (py + (PLAYER_H << 3) - 1) >> 3;
                unsigned char blocked   = 0;
                unsigned char rr;
                unsigned char bb;
                for (rr = top_row; rr <= bot_row; rr++) {
                    bb = behaviour_at((unsigned int)ahead_col, (unsigned int)rr);
                    if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) {
                        blocked = 1;
                        break;
                    }
                }
                if (!blocked) px += walk_speed;
            }
            plrdir = 0x00;
        }
        if (pad & 0x02) {                     // LEFT
            if (px >= walk_speed) {
                unsigned char ahead_col = (px - walk_speed) >> 3;
                unsigned char top_row   = py >> 3;
                unsigned char bot_row   = (py + (PLAYER_H << 3) - 1) >> 3;
                unsigned char blocked   = 0;
                unsigned char rr;
                unsigned char bb;
                for (rr = top_row; rr <= bot_row; rr++) {
                    bb = behaviour_at((unsigned int)ahead_col, (unsigned int)rr);
                    if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) {
                        blocked = 1;
                        break;
                    }
                }
                if (!blocked) px -= walk_speed;
            }
            plrdir = 0x40;
        }

        // Ladder probe.  If any tile the player overlaps is a LADDER the
        // player can move up/down with the D-pad and gravity is suspended.
        // Stepping sideways off the ladder resumes normal falling.
        {
            unsigned char lt_row = py >> 3;
            unsigned char lb_row = (py + (PLAYER_H << 3) - 1) >> 3;
            unsigned char ll_col = px >> 3;
            unsigned char lr_col = (px + (PLAYER_W << 3) - 1) >> 3;
            unsigned char lrr;
            on_ladder = 0;
            for (lrr = lt_row; lrr <= lb_row; lrr++) {
                if (behaviour_at((unsigned int)ll_col, (unsigned int)lrr) == BEHAVIOUR_LADDER
                 || behaviour_at((unsigned int)lr_col, (unsigned int)lrr) == BEHAVIOUR_LADDER) {
                    on_ladder = 1;
                    break;
                }
            }
        }

        if (on_ladder) {
            // Climb: UP/DOWN move the player along the ladder; no jump
            // or gravity while on the rungs.
            if (pad & 0x08) {                 // UP
                if (py >= climb_speed) py -= climb_speed; else py = 0;
            }
            if (pad & 0x04) {                 // DOWN
                if (py < (WORLD_H_PX - 8)) py += climb_speed;
            }
            jumping = 0;
            jmp_up = 0;
        } else {
            // UP = jump.  Edge-triggered: must release and re-press to
            // bounce again, and only takes off from the ground.
            if ((pad & 0x08) && !(prev_pad & 0x08) && !jumping) {
                jumping = 1;
//>> jump_height: How high the player jumps. Bigger number = higher jump (try 10 to 40).
                jmp_up = 20;
//<<
            }
        }
        prev_pad = pad;

        // Jump ascent: while jmp_up ticks remain, rise 2 px/frame. Once
        // the ascent budget is spent, gravity takes over and the player
        // falls until both feet sit on a SOLID_GROUND / PLATFORM tile
        // painted on the Behaviour page. This runs every frame (even when
        // jumping == 0) so walking off a ledge drops the player naturally.
        // If the tile above the player's head is SOLID_GROUND or WALL we
        // cancel the remaining ascent budget so the jump "bonks" off the
        // ceiling and gravity takes over on the next frame.  LADDER
        // overlap skips this block entirely (handled above).
        if (on_ladder) {
            /* handled in the ladder branch above */
        } else if (jumping && jmp_up > 0) {
            unsigned char head_row = (py >= 2) ? ((py - 2) >> 3) : 0;
            unsigned char head_l = behaviour_at((unsigned int)(px >> 3),
                                                (unsigned int)head_row);
            unsigned char head_r = behaviour_at(
                (unsigned int)((px + (PLAYER_W << 3) - 1) >> 3),
                (unsigned int)head_row);
            if (head_l == BEHAVIOUR_SOLID_GROUND || head_l == BEHAVIOUR_WALL
             || head_r == BEHAVIOUR_SOLID_GROUND || head_r == BEHAVIOUR_WALL) {
                jmp_up = 0;   // bonk — start falling next frame
            } else {
                if (py >= 18) py -= 2; else py = 16;
                jmp_up--;
            }
        } else {
            unsigned char foot_row = (py + (PLAYER_H << 3)) >> 3;
            unsigned char foot_l = behaviour_at((unsigned int)(px >> 3), (unsigned int)foot_row);
            unsigned char foot_r = behaviour_at(
                (unsigned int)((px + (PLAYER_W << 3) - 1) >> 3),
                (unsigned int)foot_row);
            if (foot_l == BEHAVIOUR_SOLID_GROUND || foot_l == BEHAVIOUR_WALL
             || foot_l == BEHAVIOUR_PLATFORM
             || foot_r == BEHAVIOUR_SOLID_GROUND || foot_r == BEHAVIOUR_WALL
             || foot_r == BEHAVIOUR_PLATFORM) {
                // Snap to the top of the landed tile so the player's body
                // does not overlap the ground row (which would otherwise
                // make the horizontal walk check fail on every step).
                py = (unsigned char)((foot_row << 3) - (PLAYER_H << 3));
                jumping = 0;   // feet on a surface — stop falling
            } else {
                if (py < (WORLD_H_PX - 8)) py += 2;
                jumping = 1;   // airborne (jump descent or walked off a ledge)
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
            if (foot_b == BEHAVIOUR_SOLID_GROUND || foot_b == BEHAVIOUR_WALL
             || foot_b == BEHAVIOUR_PLATFORM) {
                continue;  // resting on a surface — don't fall further
            }
            if (ss_y[i] < 232) ss_y[i]++;  // fall 1 px/frame, clamp near screen bottom
        }
//<<

#if PLAYER2_ENABLED
        /* ----------------------------------------------------------
         * Phase B chunk 5 — Player 2 movement.
         *
         * Mirrors P1's walk / jump / gravity block with px2, py2,
         * pad2, walk_speed2, etc.  Deliberately omits ladder and
         * jump-ceiling checks to keep the duplicate code manageable;
         * that's a known MVP limitation from builder-plan-player2.md
         * §1 and an easy follow-up chunk if pupils ask.
         * ---------------------------------------------------------- */
        /* Horizontal walk with wall block. */
        if (pad2 & 0x01) {                    /* RIGHT */
            if (px2 < (WORLD_W_PX - PLAYER2_W * 8)) {
                unsigned char ahead2 = (px2 + (PLAYER2_W << 3) + walk_speed2 - 1) >> 3;
                unsigned char top2   = py2 >> 3;
                unsigned char bot2   = (py2 + (PLAYER2_H << 3) - 1) >> 3;
                unsigned char blk2   = 0;
                unsigned char rr, bb;
                for (rr = top2; rr <= bot2; rr++) {
                    bb = behaviour_at((unsigned int)ahead2, (unsigned int)rr);
                    if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) {
                        blk2 = 1; break;
                    }
                }
                if (!blk2) px2 += walk_speed2;
            }
            plrdir2 = 0x00;
        }
        if (pad2 & 0x02) {                    /* LEFT */
            if (px2 >= walk_speed2) {
                unsigned char ahead2 = (px2 - walk_speed2) >> 3;
                unsigned char top2   = py2 >> 3;
                unsigned char bot2   = (py2 + (PLAYER2_H << 3) - 1) >> 3;
                unsigned char blk2   = 0;
                unsigned char rr, bb;
                for (rr = top2; rr <= bot2; rr++) {
                    bb = behaviour_at((unsigned int)ahead2, (unsigned int)rr);
                    if (bb == BEHAVIOUR_SOLID_GROUND || bb == BEHAVIOUR_WALL) {
                        blk2 = 1; break;
                    }
                }
                if (!blk2) px2 -= walk_speed2;
            }
            plrdir2 = 0x40;
        }

        /* Edge-triggered jump (no ceiling bonk in the MVP). */
        if ((pad2 & 0x08) && !(prev_pad2 & 0x08) && !jumping2) {
            jumping2 = 1;
//>> player2_jump_height: How high Player 2 jumps. Bigger number = higher.
            jmp_up2 = 20;
//<<
        }
        prev_pad2 = pad2;

        /* Jump ascent + gravity for P2. */
        if (jumping2 && jmp_up2 > 0) {
            if (py2 >= 18) py2 -= 2; else py2 = 16;
            jmp_up2--;
        } else {
            unsigned char foot_row2 = (py2 + (PLAYER2_H << 3)) >> 3;
            unsigned char fl2 = behaviour_at((unsigned int)(px2 >> 3),
                                             (unsigned int)foot_row2);
            unsigned char fr2 = behaviour_at(
                (unsigned int)((px2 + (PLAYER2_W << 3) - 1) >> 3),
                (unsigned int)foot_row2);
            if (fl2 == BEHAVIOUR_SOLID_GROUND || fl2 == BEHAVIOUR_WALL
             || fl2 == BEHAVIOUR_PLATFORM
             || fr2 == BEHAVIOUR_SOLID_GROUND || fr2 == BEHAVIOUR_WALL
             || fr2 == BEHAVIOUR_PLATFORM) {
                py2 = (unsigned char)((foot_row2 << 3) - (PLAYER2_H << 3));
                jumping2 = 0;
            } else {
                if (py2 < (WORLD_H_PX - 8)) py2 += 2;
                jumping2 = 1;
            }
        }
#endif  /* PLAYER2_ENABLED */

        //@ insert: per_frame

#ifdef SCROLL_BUILD
        // Pull the camera toward the player's centre.  Clamped at world
        // edges and held steady inside the deadzone by scroll_follow()
        // itself, so the camera eases rather than teleports.
        scroll_follow((unsigned int)px + ((PLAYER_W << 3) >> 1),
                      (unsigned int)py + ((PLAYER_H << 3) >> 1));
#endif

        waitvsync();

        //@ insert: vblank_writes

#ifdef SCROLL_BUILD
        // Stream off-screen tile columns / rows for any 8-px boundary
        // the camera has crossed since last frame — has to happen while
        // rendering is still disabled.  scroll_apply_ppu() is called
        // LAST so the final PPU_CTRL/PPU_SCROLL values hold when
        // rendering resumes.
        scroll_stream();
#else
        PPU_SCROLL = 0;
        PPU_SCROLL = 0;
#endif
        OAM_ADDR = 0x00;

        // --- Player -------------------------------------------------------
        // When facing left, flip every tile horizontally AND draw the
        // columns in reverse order so the two-wide-or-wider sprite mirrors
        // correctly as a whole.
        for (r = 0; r < PLAYER_H; r++) {
            for (c = 0; c < PLAYER_W; c++) {
#ifdef SCROLL_BUILD
                sy = world_to_screen_y((unsigned int)py + (r << 3));
                if (plrdir == 0x40) {
                    sx = world_to_screen_x((unsigned int)px +
                         ((PLAYER_W - 1 - c) << 3));
                } else {
                    sx = world_to_screen_x((unsigned int)px + (c << 3));
                }
#else
                sy = py + (r << 3);
                if (plrdir == 0x40) {
                    sx = px + (unsigned char)((PLAYER_W - 1 - c) << 3);
                } else {
                    sx = px + (c << 3);
                }
#endif
                tile = anim_tiles[anim_base + r * PLAYER_W + c];
                attr = anim_attrs[anim_base + r * PLAYER_W + c] ^ plrdir;
                OAM_DATA = sy;
                OAM_DATA = tile;
                OAM_DATA = attr;
                OAM_DATA = sx;
            }
        }

#if PLAYER2_ENABLED
        /* --- Player 2 ---------------------------------------------
         * Uses player2_tiles / player2_attrs emitted by scene.inc
         * by default.  When the pupil has tagged an animation
         * `role=player2, style=walk`, ANIM_PLAYER2_WALK_COUNT flips
         * on, per-frame tick advances below, and the render picks
         * the animated tile set when P2 is walking. */
#if ANIM_PLAYER2_WALK_COUNT > 0
        {
            const unsigned char *p2_src_tiles = player2_tiles;
            const unsigned char *p2_src_attrs = player2_attrs;
            unsigned char p2_walking = (pad2 & 0x03) ? 1 : 0;
            if (p2_walking && PLAYER2_W == ANIM_PLAYER2_WALK_W
                           && PLAYER2_H == ANIM_PLAYER2_WALK_H) {
#if ANIM_PLAYER2_WALK_COUNT > 1
                p2_walk_tick++;
                if (p2_walk_tick >= ANIM_PLAYER2_WALK_TICKS) {
                    p2_walk_tick = 0;
                    p2_walk_frame++;
                    if (p2_walk_frame >= ANIM_PLAYER2_WALK_COUNT) {
                        p2_walk_frame = 0;
                    }
                }
#endif
                {
                    unsigned int p2_anim_off = (unsigned int)p2_walk_frame
                        * ANIM_PLAYER2_WALK_W * ANIM_PLAYER2_WALK_H;
                    p2_src_tiles = anim_player2_walk_tiles + p2_anim_off;
                    p2_src_attrs = anim_player2_walk_attrs + p2_anim_off;
                }
            } else {
                /* Not walking → reset the cycle so it restarts clean
                 * next time P2 moves. */
                p2_walk_frame = 0;
                p2_walk_tick = 0;
            }
            for (r = 0; r < PLAYER2_H; r++) {
                for (c = 0; c < PLAYER2_W; c++) {
#ifdef SCROLL_BUILD
                    sy = world_to_screen_y((unsigned int)py2 + (r << 3));
                    if (plrdir2 == 0x40) {
                        sx = world_to_screen_x((unsigned int)px2 +
                             ((PLAYER2_W - 1 - c) << 3));
                    } else {
                        sx = world_to_screen_x((unsigned int)px2 + (c << 3));
                    }
#else
                    sy = py2 + (r << 3);
                    if (plrdir2 == 0x40) {
                        sx = px2 + (unsigned char)((PLAYER2_W - 1 - c) << 3);
                    } else {
                        sx = px2 + (c << 3);
                    }
#endif
                    tile = p2_src_tiles[r * PLAYER2_W + c];
                    attr = p2_src_attrs[r * PLAYER2_W + c] ^ plrdir2;
                    OAM_DATA = sy;
                    OAM_DATA = tile;
                    OAM_DATA = attr;
                    OAM_DATA = sx;
                }
            }
        }
#else
        for (r = 0; r < PLAYER2_H; r++) {
            for (c = 0; c < PLAYER2_W; c++) {
#ifdef SCROLL_BUILD
                sy = world_to_screen_y((unsigned int)py2 + (r << 3));
                if (plrdir2 == 0x40) {
                    sx = world_to_screen_x((unsigned int)px2 +
                         ((PLAYER2_W - 1 - c) << 3));
                } else {
                    sx = world_to_screen_x((unsigned int)px2 + (c << 3));
                }
#else
                sy = py2 + (r << 3);
                if (plrdir2 == 0x40) {
                    sx = px2 + (unsigned char)((PLAYER2_W - 1 - c) << 3);
                } else {
                    sx = px2 + (c << 3);
                }
#endif
                tile = player2_tiles[r * PLAYER2_W + c];
                attr = player2_attrs[r * PLAYER2_W + c] ^ plrdir2;
                OAM_DATA = sy;
                OAM_DATA = tile;
                OAM_DATA = attr;
                OAM_DATA = sx;
            }
        }
#endif
#endif

#if HUD_ENABLED && PLAYER_HP_ENABLED
        /* --- HUD: P1 hearts across the top-left -----------------
         * One copy of the hud sprite per remaining HP, starting
         * at (8, 8) and stepping right.  Uses OAM sprites so no
         * PPU writes are needed — fits the vblank budget. */
        {
            unsigned char hud_x = 8;
            unsigned char hud_y = 8;
            unsigned char hud_h;
            unsigned char hud_r, hud_c;
            for (hud_h = 0; hud_h < player_hp; hud_h++) {
                for (hud_r = 0; hud_r < HUD_H; hud_r++) {
                    for (hud_c = 0; hud_c < HUD_W; hud_c++) {
                        OAM_DATA = hud_y + (hud_r << 3);
                        OAM_DATA = hud_tiles[hud_r * HUD_W + hud_c];
                        OAM_DATA = hud_attrs[hud_r * HUD_W + hud_c];
                        OAM_DATA = hud_x + (hud_c << 3);
                    }
                }
                hud_x += (HUD_W << 3) + 4;
            }
        }
#endif

#if HUD_ENABLED && PLAYER2_HP_ENABLED
        /* --- HUD: P2 hearts across the top-right ----------------
         * Mirrors the P1 block but anchors to the right edge so
         * two-player games can read both lives at a glance. */
        {
            unsigned char hud_y = 8;
            unsigned char hud_h;
            unsigned char hud_r, hud_c;
            unsigned char step = (HUD_W << 3) + 4;
            /* Right edge - first heart width, then step leftwards. */
            unsigned char hud_x = 248 - (HUD_W << 3);
            for (hud_h = 0; hud_h < player2_hp; hud_h++) {
                for (hud_r = 0; hud_r < HUD_H; hud_r++) {
                    for (hud_c = 0; hud_c < HUD_W; hud_c++) {
                        OAM_DATA = hud_y + (hud_r << 3);
                        OAM_DATA = hud_tiles[hud_r * HUD_W + hud_c];
                        OAM_DATA = hud_attrs[hud_r * HUD_W + hud_c];
                        OAM_DATA = hud_x + (hud_c << 3);
                    }
                }
                if (hud_x >= step) hud_x -= step; else hud_x = 0;
            }
        }
#endif

/* Any tagged scene-sprite animation?  One macro so the big render
 * block below only has to check one symbol.  Phase B+ round 1c
 * extends the set; adding more pairs later is a ||-extension. */
#if (ANIM_ENEMY_WALK_COUNT > 0) || (ANIM_ENEMY_IDLE_COUNT > 0) || (ANIM_PICKUP_IDLE_COUNT > 0)
#define BW_HAS_SCENE_ANIM 1
#else
#define BW_HAS_SCENE_ANIM 0
#endif

#if BW_HAS_SCENE_ANIM
        /* Tick advance — one pass over scene sprites, each picking
         * the first pair that matches.  Priority for enemies is
         * walk > idle so a pupil who tags both styles gets walking
         * art while the enemy is moving (movement handled by the
         * walker / chaser AI; for MVP we just always advance walk
         * if tagged).  Pickups only have idle. */
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            unsigned char anim_count = 0;
            unsigned char anim_ticks = 1;
            if (0) { /* ladder */ }
#if ANIM_ENEMY_WALK_COUNT > 0
            else if (ss_role[i] == ROLE_ENEMY
                  && ss_w[i] == ANIM_ENEMY_WALK_W
                  && ss_h[i] == ANIM_ENEMY_WALK_H) {
                anim_count = ANIM_ENEMY_WALK_COUNT;
                anim_ticks = ANIM_ENEMY_WALK_TICKS;
            }
#endif
#if ANIM_ENEMY_IDLE_COUNT > 0
            else if (ss_role[i] == ROLE_ENEMY
                  && ss_w[i] == ANIM_ENEMY_IDLE_W
                  && ss_h[i] == ANIM_ENEMY_IDLE_H) {
                anim_count = ANIM_ENEMY_IDLE_COUNT;
                anim_ticks = ANIM_ENEMY_IDLE_TICKS;
            }
#endif
#if ANIM_PICKUP_IDLE_COUNT > 0
            else if (ss_role[i] == ROLE_PICKUP
                  && ss_w[i] == ANIM_PICKUP_IDLE_W
                  && ss_h[i] == ANIM_PICKUP_IDLE_H) {
                anim_count = ANIM_PICKUP_IDLE_COUNT;
                anim_ticks = ANIM_PICKUP_IDLE_TICKS;
            }
#endif
            if (anim_count > 1) {
                ss_anim_tick[i]++;
                if (ss_anim_tick[i] >= anim_ticks) {
                    ss_anim_tick[i] = 0;
                    ss_anim_frame[i]++;
                    if (ss_anim_frame[i] >= anim_count) ss_anim_frame[i] = 0;
                }
            }
        }
#endif

        // --- Static scene sprites ---------------------------------------
        // Scene sprites stay u8 world-space (inside screen 1) — as the
        // camera scrolls away from screen 1 the world_to_screen helpers
        // return 0xFF, which hides the sprite by writing y = 0xFF (the
        // NES OAM "off-screen" sentinel) and the sprite simply scrolls
        // out of view.  Matches pupil mental model: sprites live in the
        // world, not glued to the camera.
        //
        // Phase B+ round 1c: the render loop now picks an animation
        // source for enemy+walk, enemy+idle, or pickup+idle per
        // instance when the pupil has tagged such an animation.  The
        // `#if BW_HAS_SCENE_ANIM` / `#else` keeps the original
        // baseline path byte-identical when nothing is tagged.
#if BW_HAS_SCENE_ANIM
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            const unsigned char *src_tiles;
            const unsigned char *src_attrs;
            off = ss_offset[i];
            sw = ss_w[i];
            sh = ss_h[i];
            src_tiles = ss_tiles + off;
            src_attrs = ss_attrs + off;
            if (0) { /* ladder */ }
#if ANIM_ENEMY_WALK_COUNT > 0
            else if (ss_role[i] == ROLE_ENEMY
                  && sw == ANIM_ENEMY_WALK_W
                  && sh == ANIM_ENEMY_WALK_H) {
                unsigned int anim_off = (unsigned int)ss_anim_frame[i]
                    * ANIM_ENEMY_WALK_W * ANIM_ENEMY_WALK_H;
                src_tiles = anim_enemy_walk_tiles + anim_off;
                src_attrs = anim_enemy_walk_attrs + anim_off;
            }
#endif
#if ANIM_ENEMY_IDLE_COUNT > 0
            else if (ss_role[i] == ROLE_ENEMY
                  && sw == ANIM_ENEMY_IDLE_W
                  && sh == ANIM_ENEMY_IDLE_H) {
                unsigned int anim_off = (unsigned int)ss_anim_frame[i]
                    * ANIM_ENEMY_IDLE_W * ANIM_ENEMY_IDLE_H;
                src_tiles = anim_enemy_idle_tiles + anim_off;
                src_attrs = anim_enemy_idle_attrs + anim_off;
            }
#endif
#if ANIM_PICKUP_IDLE_COUNT > 0
            else if (ss_role[i] == ROLE_PICKUP
                  && sw == ANIM_PICKUP_IDLE_W
                  && sh == ANIM_PICKUP_IDLE_H) {
                unsigned int anim_off = (unsigned int)ss_anim_frame[i]
                    * ANIM_PICKUP_IDLE_W * ANIM_PICKUP_IDLE_H;
                src_tiles = anim_pickup_idle_tiles + anim_off;
                src_attrs = anim_pickup_idle_attrs + anim_off;
            }
#endif
            for (r = 0; r < sh; r++) {
                for (c = 0; c < sw; c++) {
#ifdef SCROLL_BUILD
                    OAM_DATA = world_to_screen_y(
                        (unsigned int)ss_y[i] + (r << 3));
                    OAM_DATA = src_tiles[r * sw + c];
                    OAM_DATA = src_attrs[r * sw + c];
                    OAM_DATA = world_to_screen_x(
                        (unsigned int)ss_x[i] + (c << 3));
#else
                    OAM_DATA = ss_y[i] + (r << 3);
                    OAM_DATA = src_tiles[r * sw + c];
                    OAM_DATA = src_attrs[r * sw + c];
                    OAM_DATA = ss_x[i] + (c << 3);
#endif
                }
            }
        }
#else
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            off = ss_offset[i];
            sw = ss_w[i];
            sh = ss_h[i];
            for (r = 0; r < sh; r++) {
                for (c = 0; c < sw; c++) {
#ifdef SCROLL_BUILD
                    OAM_DATA = world_to_screen_y(
                        (unsigned int)ss_y[i] + (r << 3));
                    OAM_DATA = ss_tiles[off + r * sw + c];
                    OAM_DATA = ss_attrs[off + r * sw + c];
                    OAM_DATA = world_to_screen_x(
                        (unsigned int)ss_x[i] + (c << 3));
#else
                    OAM_DATA = ss_y[i] + (r << 3);
                    OAM_DATA = ss_tiles[off + r * sw + c];
                    OAM_DATA = ss_attrs[off + r * sw + c];
                    OAM_DATA = ss_x[i] + (c << 3);
#endif
                }
            }
        }
#endif

#ifdef SCROLL_BUILD
        // Lock in the final PPU_CTRL + PPU_SCROLL after all PPU_ADDR
        // writes in scroll_stream() have settled.  Must be the last
        // PPU register write of the VBlank window or the camera jitters.
        scroll_apply_ppu();
#endif
    }
}

const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
