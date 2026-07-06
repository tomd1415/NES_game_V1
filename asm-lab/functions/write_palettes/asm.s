; write_palettes — hand-written 6502 candidate. No args, no return.
; Point the PPU at $3F00, then stream 32 palette bytes through PPU_DATA.
; X doubles as the loop counter AND the palette_bytes index.

PPU_ADDR = $2006
PPU_DATA = $2007

.export _wp_asm
.import _palette_bytes

.segment "CODE"
.proc _wp_asm
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
