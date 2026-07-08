; plat_jump — hand-written 6502 for the platformer jump trigger (non-SMB).
; UP edge (pressed now, not last frame) AND not already jumping -> start a jump.
.export _plat_jump_asm
.import _pad, _prev_pad, _jumping, _jmp_up
.segment "CODE"
.proc _plat_jump_asm
    lda _pad
    and #$08
    beq done              ; UP not pressed
    lda _prev_pad
    and #$08
    bne done              ; UP already down last frame -> not an edge
    lda _jumping
    bne done              ; already airborne
    lda #1
    sta _jumping
    lda #20
    sta _jmp_up
done:
    rts
.endproc
