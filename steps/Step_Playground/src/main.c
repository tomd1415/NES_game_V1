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

// Game style — Step_Playground's main.c is the platformer baseline,
// so BW_GAME_STYLE stays undefined here.  cc65 treats undefined macros
// as 0 in `#if` comparisons, which keeps `#if BW_GAME_STYLE == 0`
// true and the platformer vertical-movement block active.  The
// Builder's platformer.c template uses the same convention; the
// `game` module emits `#define BW_GAME_STYLE 1` only when the pupil
// picks the top-down option.

/* volatile so cc65 cannot elide back-to-back PPU/OAM register writes
   — see scroll.c for the column-stream bug that motivated the
   qualifier.  Mirroring the macros here keeps both translation units
   consistent. */
#ifdef USE_AUDIO
/* Phase 4.3 — FamiStudio sound engine.  The wrapper at
 * tools/audio/famistudio/famistudio_engine.s assembles the engine
 * with our config (SFX on, DPCM off, NTSC).  audio_songs.s + audio_sfx.s
 * are staged into src/ by the playground server when the audio module
 * is enabled in the project; their `music_data_*` and `audio_sfx_data`
 * symbols are referenced from this file so the linker pulls them in.
 *
 * Pupils opting into audio MUST upload at least one song, otherwise
 * audio_songs.s won't define `audio_default_music`.  The playground
 * server enforces this before invoking make.
 */
#define FAMISTUDIO_PLATFORM_NTSC 1
#define FAMISTUDIO_SFX_CH0 0
#define FAMISTUDIO_SFX_CH1 15
extern unsigned char audio_default_music[];
extern unsigned char audio_sfx_data[];
void __fastcall__ _famistudio_init(unsigned char platform);
void __fastcall__ famistudio_music_play(unsigned char song_index);
void __fastcall__ famistudio_update(void);
void __fastcall__ _famistudio_sfx_init(void);
void __fastcall__ famistudio_sfx_play(unsigned char sfx_index, unsigned char channel);
/* famistudio_update is called from the NMI handler in our project-
 * local crt0 (tools/audio/famistudio/famistudio_crt0.s) so it runs at
 * the hardware vblank rate (~60 Hz NTSC) regardless of how busy the
 * main loop's per-frame work is.  We don't reference it directly from
 * C — the import comes from inside the assembly crt0 — but we keep
 * the prototype above so the .h-style block here stays a complete
 * description of the engine API the project links in. */
/* The engine's cc65 header wraps `init` with inline asm to load the
 * music-data pointer into A:X before jsr; we replicate the minimum
 * we need here so a bare main.c can call it without including the
 * vendored header. */
#define famistudio_init(platform, music_data)         \
    (__AX__ = ((unsigned int)(music_data))),          \
    __asm__ ("pha\n"),                                \
    __asm__ ("txa\n"),                                \
    __asm__ ("tay\n"),                                \
    __asm__ ("pla\n"),                                \
    __asm__ ("tax\n"),                                \
    __asm__ ("lda #%b\n", (unsigned char)(platform)), \
    __asm__ ("jsr _famistudio_init\n");
#define famistudio_sfx_init(sfx_data)      \
    (__AX__ = ((unsigned int)(sfx_data))), \
    __asm__ ("pha\n"),                     \
    __asm__ ("txa\n"),                     \
    __asm__ ("tay\n"),                     \
    __asm__ ("pla\n"),                     \
    __asm__ ("tax\n"),                     \
    __asm__ ("jsr _famistudio_sfx_init\n");
#endif

#define PPU_CTRL      (*(volatile unsigned char*)0x2000)
#define PPU_MASK      (*(volatile unsigned char*)0x2001)
#define OAM_ADDR      (*(volatile unsigned char*)0x2003)
#define OAM_DATA      (*(volatile unsigned char*)0x2004)
#define PPU_SCROLL    (*(volatile unsigned char*)0x2005)
#define PPU_ADDR      (*(volatile unsigned char*)0x2006)
#define PPU_DATA      (*(volatile unsigned char*)0x2007)
#define OAM_DMA       (*(volatile unsigned char*)0x4014)
#define JOYPAD1       (*(volatile unsigned char*)0x4016)

/* OAM shadow buffer — 256 bytes at $0200 (page-aligned by the linker's
 * OAM segment, see cfg/nes.cfg).  Every frame we build the sprite list
 * in here during the active render period (cheap: just RAM writes),
 * then kick off a single $4014 DMA during vblank to copy all 256 bytes
 * to the PPU's OAM in ~513 cycles.  The previous per-byte OAM_DATA
 * writes from inside vblank worked in jsnes (which doesn't accurately
 * simulate the ~2273-cycle NTSC vblank budget) but caused mid-screen
 * corruption on real hardware / fceux when the scene had many sprites,
 * because the writes spilled past vblank into the active render. */
#pragma bss-name(push, "OAM")
unsigned char oam_buf[256];
#pragma bss-name(pop)
/* Write index as we fill the buffer each frame.  unsigned int (not
 * unsigned char) so `oam_idx < 256` is a real bound rather than a
 * constant-true wrap — cc65 correctly warned when this was u8. */
unsigned int oam_idx;

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

/* Gravity application macro — Builder's Globals module
 * (T1.6 in docs/plans/current/2026-04-26-fixes-and-features.md)
 * overrides this with a different fall rate when ticked.  The
 * default `(y)++` matches the historic 1 px/frame fall and is
 * byte-equivalent to the literal `ss_y[i]++` cc65 used to emit
 * here, so the no-modules-ticked baseline ROM is unchanged. */
#ifndef BW_APPLY_GRAVITY
#define BW_APPLY_GRAVITY(y) (y)++
#endif

/* Jump-rise application macro — same pattern as BW_APPLY_GRAVITY.
 * Controls how many pixels the player moves up per frame while
 * the jump-ascent budget (jmp_up) is being spent.  Default `(y)
 * -= 2` matches the historic literal `py -= 2`; the Globals
 * module overrides via the declarations slot when ticked. */
#ifndef BW_APPLY_JUMP_RISE
#define BW_APPLY_JUMP_RISE(y) (y) -= 2
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

#ifdef USE_AUDIO
    /* Phase 4.3 — boot the sound engine.  audio_default_music points
     * at the first song the pupil uploaded; audio_sfx_data is the
     * single sfx blob.  Both are emitted by the playground server
     * before make is invoked.  famistudio_update is then called once
     * per frame at the end of the vblank window in the main loop
     * below — see the comment near that call for why an NMI-driven
     * update doesn't fit the cc65/cycle-budget model the project
     * is built around. */
    famistudio_init(FAMISTUDIO_PLATFORM_NTSC, audio_default_music);
    famistudio_sfx_init(audio_sfx_data);
    famistudio_music_play(0);
#endif

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

    while (1) {
        pad = read_controller();

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

#if BW_GAME_STYLE == 0
        // ----- Platformer vertical movement: ladders + jump + gravity -----
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
            // or gravity while on the rungs.  Block the step when the
            // target tile row is SOLID_GROUND or WALL, UNLESS the same
            // row also contains a LADDER column anywhere under the
            // player's bounding box — a ladder punched straight through
            // a floor is the useful case, and the ladder cell wins the
            // collision tie so pupils can build "rope through the ceiling"
            // puzzles.  Mirrors the tie-break used by the on_ladder probe.
            if (pad & 0x08) {                 // UP
                unsigned char new_top = (py >= climb_speed) ? (py - climb_speed) : 0;
                unsigned char up_row  = new_top >> 3;
                unsigned char up_l = behaviour_at((unsigned int)(px >> 3),
                                                  (unsigned int)up_row);
                unsigned char up_r = behaviour_at(
                    (unsigned int)((px + (PLAYER_W << 3) - 1) >> 3),
                    (unsigned int)up_row);
                unsigned char up_ladder = (up_l == BEHAVIOUR_LADDER) ||
                                          (up_r == BEHAVIOUR_LADDER);
                unsigned char up_solid  = (up_l == BEHAVIOUR_SOLID_GROUND) ||
                                          (up_l == BEHAVIOUR_WALL) ||
                                          (up_r == BEHAVIOUR_SOLID_GROUND) ||
                                          (up_r == BEHAVIOUR_WALL);
                if (up_ladder || !up_solid) py = new_top;
            }
            if (pad & 0x04) {                 // DOWN
                unsigned char new_foot = py + climb_speed + (PLAYER_H << 3);
                unsigned char dn_row   = new_foot >> 3;
                unsigned char dn_l = behaviour_at((unsigned int)(px >> 3),
                                                  (unsigned int)dn_row);
                unsigned char dn_r = behaviour_at(
                    (unsigned int)((px + (PLAYER_W << 3) - 1) >> 3),
                    (unsigned int)dn_row);
                unsigned char dn_ladder = (dn_l == BEHAVIOUR_LADDER) ||
                                          (dn_r == BEHAVIOUR_LADDER);
                unsigned char dn_solid  = (dn_l == BEHAVIOUR_SOLID_GROUND) ||
                                          (dn_l == BEHAVIOUR_WALL) ||
                                          (dn_r == BEHAVIOUR_SOLID_GROUND) ||
                                          (dn_r == BEHAVIOUR_WALL);
                if ((dn_ladder || !dn_solid) && py < (WORLD_H_PX - 8)) {
                    py += climb_speed;
                }
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
                if (py >= 18) BW_APPLY_JUMP_RISE(py); else py = 16;
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
#endif  /* BW_GAME_STYLE == 0 (platformer vertical) */

#if BW_GAME_STYLE == 1
        // ----- Top-down vertical movement: 4-way step with collision -----
        // No gravity, no jump, no ladder.  UP/DOWN move the player by
        // walk_speed pixels per frame.  SOLID_GROUND / WALL block the
        // step.  PLATFORM and LADDER are walkable in top-down (no
        // notion of "below" or "rungs" without gravity).
        if (pad & 0x08) {                     // UP
            if (py >= walk_speed) {
                unsigned char ahead_row = (py - walk_speed) >> 3;
                unsigned char left_col  = px >> 3;
                unsigned char right_col = (px + (PLAYER_W << 3) - 1) >> 3;
                unsigned char b_l = behaviour_at((unsigned int)left_col,  (unsigned int)ahead_row);
                unsigned char b_r = behaviour_at((unsigned int)right_col, (unsigned int)ahead_row);
                if (!(b_l == BEHAVIOUR_SOLID_GROUND || b_l == BEHAVIOUR_WALL
                   || b_r == BEHAVIOUR_SOLID_GROUND || b_r == BEHAVIOUR_WALL)) {
                    py -= walk_speed;
                }
            }
        }
        if (pad & 0x04) {                     // DOWN
            if (py + (PLAYER_H << 3) + walk_speed <= WORLD_H_PX) {
                unsigned char ahead_row = (py + (PLAYER_H << 3) + walk_speed - 1) >> 3;
                unsigned char left_col  = px >> 3;
                unsigned char right_col = (px + (PLAYER_W << 3) - 1) >> 3;
                unsigned char b_l = behaviour_at((unsigned int)left_col,  (unsigned int)ahead_row);
                unsigned char b_r = behaviour_at((unsigned int)right_col, (unsigned int)ahead_row);
                if (!(b_l == BEHAVIOUR_SOLID_GROUND || b_l == BEHAVIOUR_WALL
                   || b_r == BEHAVIOUR_SOLID_GROUND || b_r == BEHAVIOUR_WALL)) {
                    py += walk_speed;
                }
            }
        }
        jumping = 0;
        jmp_up  = 0;
        on_ladder = 0;
#endif  /* BW_GAME_STYLE == 1 (top-down vertical) */

        // Pick the active animation for this frame.  Jumping wins over
        // walking so the jump cycle plays even while drifting sideways.
        // Unassigned animations (count == 0) fall through to the static
        // player_tiles layout.
        anim_mode = 0;
#if JUMP_FRAME_COUNT > 0 && BW_GAME_STYLE == 0
        if (jumping) anim_mode = 2;
#endif
#if WALK_FRAME_COUNT > 0
#if BW_GAME_STYLE == 1
        if (anim_mode == 0 && (pad & 0x0F)) anim_mode = 1;
#else
        if (anim_mode == 0 && (pad & 0x03)) anim_mode = 1;
#endif
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

#if BW_GAME_STYLE == 0
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
            if (ss_y[i] < 232) BW_APPLY_GRAVITY(ss_y[i]);  // fall 1 px/frame by default; Globals module can override
        }
//<<
#endif  /* BW_GAME_STYLE == 0 — top-down has no scene-sprite gravity */

#ifdef SCROLL_BUILD
        // Pull the camera toward the player's centre.  Clamped at world
        // edges and held steady inside the deadzone by scroll_follow()
        // itself, so the camera eases rather than teleports.
        scroll_follow((unsigned int)px + ((PLAYER_W << 3) >> 1),
                      (unsigned int)py + ((PLAYER_H << 3) >> 1));
#endif

        // --- Build OAM shadow buffer (PRE-VBLANK) -----------------------
        // Writing to the $0200 shadow buffer is just RAM, no PPU
        // interaction, so this is safe to do while the PPU is still
        // rendering the previous frame.  Every OAM slot we want visible
        // is filled in order; the trailing slots get Y = 0xFF so they
        // land off-screen.  The single DMA copy inside vblank below is
        // then ~513 cycles regardless of how many sprites the scene has.
        oam_idx = 0;

        // Player.  Facing left flips every tile horizontally AND draws
        // the columns in reverse order so the two-wide-or-wider sprite
        // mirrors correctly as a whole.
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
                oam_buf[oam_idx++] = sy;
                oam_buf[oam_idx++] = tile;
                oam_buf[oam_idx++] = attr;
                oam_buf[oam_idx++] = sx;
            }
        }

        // Static scene sprites.  Scene sprites stay u8 world-space
        // (inside screen 1) — as the camera scrolls away from screen 1
        // the world_to_screen helpers return 0xFF, which hides the
        // sprite by writing y = 0xFF (the NES OAM "off-screen" sentinel)
        // and the sprite simply scrolls out of view.
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            off = ss_offset[i];
            sw = ss_w[i];
            sh = ss_h[i];
            for (r = 0; r < sh; r++) {
                for (c = 0; c < sw; c++) {
#ifdef SCROLL_BUILD
                    oam_buf[oam_idx++] = world_to_screen_y(
                        (unsigned int)ss_y[i] + (r << 3));
                    oam_buf[oam_idx++] = ss_tiles[off + r * sw + c];
                    oam_buf[oam_idx++] = ss_attrs[off + r * sw + c];
                    oam_buf[oam_idx++] = world_to_screen_x(
                        (unsigned int)ss_x[i] + (c << 3));
#else
                    oam_buf[oam_idx++] = ss_y[i] + (r << 3);
                    oam_buf[oam_idx++] = ss_tiles[off + r * sw + c];
                    oam_buf[oam_idx++] = ss_attrs[off + r * sw + c];
                    oam_buf[oam_idx++] = ss_x[i] + (c << 3);
#endif
                }
            }
        }

        // Hide every slot we didn't touch this frame by parking its Y
        // byte at 0xFF — on NES that's off-screen, so a sprite whose
        // Y is 0xFF draws nothing even if its other three bytes are
        // stale.  Only touch the Y byte (every fourth slot) so the
        // loop is tight: 64 OAM entries × 1 write = 64 writes max.
        while (oam_idx < 256) {
            oam_buf[oam_idx] = 0xFF;
            oam_idx += 4;
        }

#ifdef SCROLL_BUILD
        /* Resolve which column/row the scroll engine wants to stream
           BEFORE entering the vblank window.  The slow array indexing
           (`bg_world_tiles[rr * BG_WORLD_COLS + col]` × 30) happens
           here, where time is plentiful, so the in-vblank write loop
           stays a tight `*buf -> PPU_DATA`. */
        scroll_stream_prepare();
#endif

        // --- Vblank window ----------------------------------------------
        waitvsync();
#ifdef SCROLL_BUILD
        /* Disable rendering for the duration of the vblank work.  Even
           with the prepare-phase optimisation the column burst still
           advances the PPU's internal V register by +32 per write, and
           any write that spilled past vblank would pollute the
           rendering pointer mid-screen.  Holding PPU_MASK at 0 makes
           that impossible — even a hypothetical late write can't reach
           the screen.  Cost: at most a thin black band at the very
           top of scrolled frames; with prepare() in place that band
           should be zero scanlines tall in practice. */
        PPU_MASK = 0;
#endif
        // OAM DMA first — canonical NES pattern.  Run it before any
        // PPU_ADDR / PPU_DATA writes so (a) the sprite table is fresh
        // the moment rendering resumes, (b) if anything ELSE in vblank
        // overruns its budget, the visible cost is background tearing
        // rather than sprite drop-outs, which pupils notice more.
        // OAM_ADDR = 0 must be set first; some PPU boot states already
        // have it clear, but do not rely on it.
        OAM_ADDR = 0x00;
        OAM_DMA  = 0x02;
#ifdef SCROLL_BUILD
        // Stream off-screen tile columns / rows for any 8-px boundary
        // the camera has crossed since last frame — has to happen while
        // rendering is still disabled.
        scroll_stream();
#else
        PPU_SCROLL = 0;
        PPU_SCROLL = 0;
#endif

#ifdef SCROLL_BUILD
        // Lock in the final PPU_CTRL + PPU_SCROLL after all PPU_ADDR
        // writes in scroll_stream() have settled.  Must be the last
        // PPU register write of the VBlank window or the camera jitters.
        scroll_apply_ppu();
        /* Re-enable rendering well before the pre-render T→V copy
           window so the next frame's scroll position lands. */
        PPU_MASK = 0x1E;
#endif
#ifdef USE_AUDIO
        /* Phase 4.3 — engine update once per frame at the end of
         * vblank.  Cheap (~200-400 cycles for skip frames, up to
         * ~5000 on row-advance frames); the engine only writes APU
         * registers ($4000-$4017), never PPU, so it's safe to run
         * after PPU_MASK has re-enabled rendering — APU writes
         * during the active scanline don't affect the visible
         * frame.  An NMI-driven version was tried (see
         * famistudio_crt0.s) but a 3-5 ms engine tick at vblank
         * start consumed the budget OAM DMA + scroll_stream need,
         * pushing those PPU writes into the active render and
         * corrupting visible frames.  Trade-off: tempo drifts on
         * heavy frames where the main loop drops below 60 Hz.
         * Documented in AUDIO_GUIDE.md. */
        famistudio_update();
#endif
    }
}

/* This array has been here since Step_1 as a teaching prop —
 * "the NES processor looks at $FFFA…" — but it lands in RODATA, not
 * the linker's VECTORS segment, so it has never actually populated
 * the iNES vector table.  cc65's nes.lib crt0 supplies the real
 * vectors.  We leave the array in place because removing it would
 * change the no-audio ROM bytes and break the byte-identical-baseline
 * test, and because it still serves the original pedagogical purpose
 * (pupils opening the file see vectors named explicitly). */
const void *vectors[] = {
    (void *) 0,
    (void *) main,
    (void *) 0
};
