; main_special_asm.s — the two main.c helpers still gated by NES_ASM_SPECIALIZED
; (direct/lab builds only): draw_text / clear_text_row. They bake this build's
; SCROLL_BUILD framing (they jsr _scroll_apply_ppu, which only exists in scroll
; builds) and are dead code in the shipped engine anyway. (advance_animation was
; generalised in Phase 1 and moved to main_asm.s / NES_ASM_LEAF.)
; Proven in asm-lab (draw_text / clear_text_row).
.export _draw_text
.export _clear_text_row
.import _waitvsync
.import _scroll_apply_ppu
.import incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

PPU_MASK   = $2001
PPU_ADDR   = $2006
PPU_DATA   = $2007

.segment "CODE"

; void draw_text(unsigned char row, unsigned char col, const unsigned char *text)
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
