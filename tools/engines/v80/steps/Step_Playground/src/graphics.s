; =============================================================================
; graphics.s - Playground tile & nametable data
; =============================================================================
; Both halves of this 8 KB CHR are the pupil's 256-tile shared pool written
; twice (sprites use pattern table 0, BG uses pattern table 1 -- see the
; PPU_CTRL = $10 line in main.c).
;
; The nametable is a 32x30 layout of tile indices plus a 64-byte attribute
; table exactly as built in the editor.

PPUADDR = $2006
PPUDATA = $2007

.segment "CODE"
.export _load_background
.proc _load_background
    lda #$20
    sta PPUADDR
    lda #$00
    sta PPUADDR

    lda #<level_nam
    sta $00
    lda #>level_nam
    sta $01

    ldx #4
    ldy #0
@loop:
    lda ($00),y
    sta PPUDATA
    iny
    bne @loop
    inc $01
    dex
    bne @loop

    rts
.endproc

.segment "RODATA"
level_nam: .incbin "../assets/backgrounds/level.nam"

.segment "CHARS"
.incbin "../assets/sprites/game.chr"
