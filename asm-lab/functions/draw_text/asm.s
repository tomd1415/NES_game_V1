; draw_text — hand-written 6502 candidate (non-scroll build).
;
; C ABI (fastcall, 3 args): text pointer (rightmost) in A(lo)/X(hi); col and row
; are chars pushed by the caller, so (sp),0 = col and (sp),1 = row. Pop 2 bytes
; (incsp2) on return (void).
;
; addr = $2000 + row*32 + col, computed as a FULL 16-bit add (draw_text does not
; bound col, so a plain OR would be wrong): lo = ((row&7)<<5) + col (may carry),
; hi = (row>>3) + $20 + carry.
;
; The text pointer must survive waitvsync (a cc65 lib call may clobber A/X and
; the ZP temps), so we stash it on the hardware stack across the call; row/col
; stay safely on the cc65 param stack.

PPU_MASK   = $2001
PPU_SCROLL = $2005
PPU_ADDR   = $2006
PPU_DATA   = $2007

.export _dt_asm
.import _waitvsync
.import incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

.segment "CODE"
.proc _dt_asm               ; A/X = text ; (sp),0 = col, (sp),1 = row
    pha                     ; save text lo
    txa
    pha                     ; save text hi
    jsr _waitvsync
    lda #0
    sta PPU_MASK            ; rendering off
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
    adc (sp),y              ; + col  -> carry to hi
    sta tmp1                ; addr low
    lda tmp3
    adc #$20                ; addr high = row>>3 + $20 + carry
    sta PPU_ADDR            ; hi first
    lda tmp1
    sta PPU_ADDR            ; then lo
    ; --- restore text pointer into ptr1 ---
    pla
    sta ptr1+1              ; text hi
    pla
    sta ptr1               ; text lo
    ; --- write until the 0 terminator ---
    ldy #0
@loop:
    lda (ptr1),y
    beq @done
    sta PPU_DATA
    iny
    bne @loop
@done:
    lda #0
    sta PPU_SCROLL
    sta PPU_SCROLL
    lda #$1E
    sta PPU_MASK            ; rendering on
    jmp incsp2             ; pop col+row (2 bytes), rts
.endproc
