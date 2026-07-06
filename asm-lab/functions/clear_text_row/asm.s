; clear_text_row — hand-written 6502 candidate (non-scroll build).
;
; C ABI (fastcall, 3 char args): width (rightmost) in A; col at (sp),0, row at
; (sp),1. Pop 2 bytes (incsp2) on return (void). Save width across waitvsync on
; the hardware stack. Address math is the same full 16-bit $2000 + row*32 + col
; as draw_text.

PPU_MASK   = $2001
PPU_SCROLL = $2005
PPU_ADDR   = $2006
PPU_DATA   = $2007

.export _ctr_asm
.import _waitvsync
.import incsp2
.importzp sp, tmp1, tmp2, tmp3

.segment "CODE"
.proc _ctr_asm              ; A = width ; (sp),0 = col, (sp),1 = row
    pha                     ; save width across waitvsync
    jsr _waitvsync
    lda #0
    sta PPU_MASK
    ; --- addr = $2000 + row*32 + col ---
    ldy #1
    lda (sp),y              ; row
    sta tmp2
    lsr
    lsr
    lsr
    sta tmp3                ; row >> 3
    lda tmp2
    and #$07
    asl
    asl
    asl
    asl
    asl                     ; (row & 7) << 5
    ldy #0
    clc
    adc (sp),y              ; + col
    sta tmp1                ; addr low
    lda tmp3
    adc #$20                ; addr high
    sta PPU_ADDR
    lda tmp1
    sta PPU_ADDR
    ; --- write `width` zero tiles ---
    pla                     ; width
    tax
    beq @done               ; width 0 -> nothing
    lda #0
@loop:
    sta PPU_DATA
    dex
    bne @loop
@done:
    lda #0
    sta PPU_SCROLL
    sta PPU_SCROLL
    lda #$1E
    sta PPU_MASK
    jmp incsp2
.endproc
