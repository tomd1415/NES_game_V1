; main_asm.s — hand-written 6502 for the UNIVERSAL main.c leaf helpers.
;
; Compiled + linked when NES_ASM_LEAF=1; the matching C bodies in main.c are then
; #ifdef'd out. Flag OFF (default) = byte-identical ROM.
;
; read_controller and write_palettes are project-independent. advance_animation
; reads PLAYER_TILES_PER_FRAME from project.inc (Phase 1 generalisation), so it
; ships here too. draw_text/clear_text_row (SCROLL_BUILD-coupled + dead code) stay
; in main_special_asm.s under NES_ASM_SPECIALIZED. Proven in asm-lab.

.include "project.inc"
.include "asm_macros.inc"

.export _read_controller
.export _write_palettes
.export _advance_animation
.import _palette_bytes
.import _anim_mode, _anim_prev_mode, _anim_frame, _anim_tick
.import _anim_frame_count, _anim_frame_ticks, _anim_base
.importzp tmp1, tmp2

JOYPAD1    = $4016
PPU_ADDR   = $2006
PPU_DATA   = $2007

.segment "CODE"

; unsigned char read_controller(void) — strobe + 8-bit shift-in (A in bit 7).
.proc _read_controller
    lda #$01
    sta JOYPAD1
    lsr a
    sta JOYPAD1
    ldx #8
@loop:
    lda JOYPAD1
    lsr a
    rol tmp1
    dex
    bne @loop
    lda tmp1
    rts
.endproc

; void write_palettes(void) — point PPU at $3F00, stream 32 palette bytes.
.proc _write_palettes
    lda #$3F
    sta PPU_ADDR
    lda #$00
    sta PPU_ADDR
    ldx #0
@loop:
    lda _palette_bytes,x
    sta PPU_DATA
    inx
    cpx #32
    bne @loop
    rts
.endproc

; void advance_animation(void) — per-frame player animation state machine.
; anim_base = anim_frame * PLAYER_TILES_PER_FRAME via MULC (a shift when PTF is a
; power of two, shift-add otherwise). Reads PTF from project.inc.
.proc _advance_animation
    lda _anim_mode
    cmp _anim_prev_mode
    beq @same
    lda #0
    sta _anim_frame
    sta _anim_tick
    lda _anim_mode
    sta _anim_prev_mode
@same:
    lda _anim_frame_count
    cmp #2
    bcc @base                   ; frame_count < 2 -> static, skip advance
    inc _anim_tick
    lda _anim_tick
    cmp _anim_frame_ticks
    bcc @base
    lda #0
    sta _anim_tick
    inc _anim_frame
    lda _anim_frame
    cmp _anim_frame_count
    bcc @base
    lda #0
    sta _anim_frame
@base:
    lda _anim_frame
    MULC _anim_base, PLAYER_TILES_PER_FRAME
    rts
.endproc
