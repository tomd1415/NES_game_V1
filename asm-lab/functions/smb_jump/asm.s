; smb_jump — SMB jump extras: UP-edge OR A-edge take-off (+8 if B held), then the
; variable-height cut (release both jump buttons mid-rise -> trim jmp_up to 4).
.export _smb_jump_asm
.import _pad, _prev_pad, _jumping, _jmp_up
.segment "CODE"
.proc _smb_jump_asm
    ; edge = UP-edge || A-edge ?
    lda _pad
    and #$08
    beq chkA               ; UP not pressed
    lda _prev_pad
    and #$08
    beq edge               ; UP pressed, prev not -> edge
chkA:
    lda _pad
    and #$80
    beq cut                ; A not pressed -> no edge
    lda _prev_pad
    and #$80
    bne cut                ; A already down -> not an edge
edge:
    lda _jumping
    bne cut                ; already airborne -> no take-off
    lda #1
    sta _jumping
    lda #20
    sta _jmp_up
    lda _pad
    and #$40
    beq cut
    lda _jmp_up
    clc
    adc #8
    sta _jmp_up            ; running boost
cut:
    ; if (jumping && jmp_up > 4 && !(pad & 0x88)) jmp_up = 4
    lda _jumping
    beq done
    lda _jmp_up
    cmp #5
    bcc done               ; jmp_up <= 4 -> not > 4
    lda _pad
    and #$88
    bne done               ; UP or A held -> no cut
    lda #4
    sta _jmp_up
done:
    rts
.endproc
