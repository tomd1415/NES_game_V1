; read_controller — hand-written 6502 candidate. No args; returns the button
; byte in A (A in bit 7 ... Right in bit 0).
;
; Classic idiom: strobe $4016 (write 1 then 0), then 8x { read $4016; the button
; is bit 0 -> shift it into carry with `lsr a`; `rol tmp1` collects carries
; MSB-first }. The initial tmp1 is irrelevant — its bits shift out over the 8
; rols. `lsr a` extracts bit 0 regardless of open-bus upper bits (== the C's
; `& 1`). ~15 bytes / ~60 cycles vs cc65 -Os's stack-local loop (~200+).

JOYPAD1 = $4016

.export _rc_asm
.importzp tmp1

.segment "CODE"
.proc _rc_asm
    lda #$01
    sta JOYPAD1         ; strobe on
    lsr a               ; A = 0
    sta JOYPAD1         ; strobe off
    ldx #8
@loop:
    lda JOYPAD1         ; bit 0 = next button
    lsr a               ; button bit -> carry
    rol tmp1            ; carry -> tmp1 (builds MSB-first)
    dex
    bne @loop
    lda tmp1
    rts
.endproc
