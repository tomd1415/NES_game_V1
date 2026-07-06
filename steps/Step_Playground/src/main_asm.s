; main_asm.s — hand-written 6502 for the UNIVERSAL main.c leaf helpers.
;
; Compiled + linked when NES_ASM_LEAF=1; the matching C bodies in main.c are then
; #ifdef'd out. Flag OFF (default) = byte-identical ROM.
;
; Only the project-independent helpers live here: read_controller and
; write_palettes (both bake nothing project-specific and depend on nothing that
; a non-scroll build lacks). advance_animation (bakes PLAYER_TILES_PER_FRAME) and
; draw_text/clear_text_row (SCROLL_BUILD-coupled + dead code) live in
; main_special_asm.s under NES_ASM_SPECIALIZED, so the server can ship these two
; without those. Proven equivalent in asm-lab (read_controller, write_palettes).

.export _read_controller
.export _write_palettes
.import _palette_bytes
.importzp tmp1

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
