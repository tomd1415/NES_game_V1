; main_asm.s — hand-written 6502 versions of main.c leaf helpers.
;
; Compiled + linked ONLY when NES_ASM_LEAF=1; the matching C bodies in main.c
; are then #ifdef'd out. Flag OFF (default) = byte-identical ROM.
;
; Proven behaviourally identical to the C in asm-lab/ (read_controller,
; write_palettes, draw_text, clear_text_row). draw_text/clear_text_row use this
; build's SCROLL_BUILD framing (call scroll_apply_ppu, not PPU_SCROLL=0) so they
; match the engine exactly.

.export _read_controller
.export _write_palettes
.export _draw_text
.export _clear_text_row
.import _palette_bytes
.import _waitvsync
.import _scroll_apply_ppu
.import incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

JOYPAD1    = $4016
PPU_MASK   = $2001
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

; void draw_text(unsigned char row, unsigned char col, const unsigned char *text)
;   text in A/X; col at (sp),0, row at (sp),1. addr = $2000 + row*32 + col (full
;   16-bit add). SCROLL_BUILD framing: waitvsync, rendering off, write until 0,
;   then scroll_apply_ppu + rendering on. Text ptr survives waitvsync on the HW
;   stack.
.proc _draw_text                ; A/X = text ; (sp),0 = col, (sp),1 = row
    pha
    txa
    pha
    jsr _waitvsync
    lda #0
    sta PPU_MASK
    ldy #1
    lda (sp),y
    sta tmp2
    lsr
    lsr
    lsr
    sta tmp3
    lda tmp2
    and #$07
    asl
    asl
    asl
    asl
    asl
    ldy #0
    clc
    adc (sp),y
    sta tmp1
    lda tmp3
    adc #$20
    sta PPU_ADDR
    lda tmp1
    sta PPU_ADDR
    pla
    sta ptr1+1
    pla
    sta ptr1
    ldy #0
@loop:
    lda (ptr1),y
    beq @done
    sta PPU_DATA
    iny
    bne @loop
@done:
    jsr _scroll_apply_ppu
    lda #$1E
    sta PPU_MASK
    jmp incsp2
.endproc

; void clear_text_row(unsigned char row, unsigned char col, unsigned char width)
;   width in A; col at (sp),0, row at (sp),1. Writes `width` zero tiles.
.proc _clear_text_row           ; A = width ; (sp),0 = col, (sp),1 = row
    pha
    jsr _waitvsync
    lda #0
    sta PPU_MASK
    ldy #1
    lda (sp),y
    sta tmp2
    lsr
    lsr
    lsr
    sta tmp3
    lda tmp2
    and #$07
    asl
    asl
    asl
    asl
    asl
    ldy #0
    clc
    adc (sp),y
    sta tmp1
    lda tmp3
    adc #$20
    sta PPU_ADDR
    lda tmp1
    sta PPU_ADDR
    pla
    tax
    beq @done
    lda #0
@wloop:
    sta PPU_DATA
    dex
    bne @wloop
@done:
    jsr _scroll_apply_ppu
    lda #$1E
    sta PPU_MASK
    jmp incsp2
.endproc
