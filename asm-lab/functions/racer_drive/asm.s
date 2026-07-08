; racer_drive — hand-written 6502 for the racer steer + accel/friction/brake/
; reverse (BW_GAME_STYLE 3). Signed 16-bit throughout, like smb_accel: after
; `A - B` (sec/sbc lo, sbc hi), `bvc *+4 / eor #$80` puts the true signed sign in
; N, so bmi = A<B, bpl = A>=B. Behaviourally identical to racer_drive_ref.

.export _racer_drive_asm
.import _pad, _racer_heading, _racer_speed

RACER_ACCEL     = 13
RACER_FRICTION  = 8
RACER_BRAKE     = 40
RACER_MAX_SPEED = 640
RACER_REV_MAX   = RACER_MAX_SPEED / 2          ; 320
NEG_REV         = $10000 - RACER_REV_MAX       ; -320 as 16-bit two's complement ($FEC0)
NEG_FRI         = $10000 - RACER_FRICTION      ; -8   ($FFF8)

.segment "CODE"
.proc _racer_drive_asm
    ; --- steer: LEFT (+15)&15 then RIGHT (+1)&15 ---
    lda _pad
    and #$02
    beq @noL
    lda _racer_heading
    clc
    adc #15
    and #15
    sta _racer_heading
@noL:
    lda _pad
    and #$01
    beq @noR
    lda _racer_heading
    clc
    adc #1
    and #15
    sta _racer_heading
@noR:
    ; --- speed: A/UP accelerate, DOWN brake/reverse, else friction ---
    lda _pad
    and #$88
    bne @accel
    lda _pad
    and #$04
    bne @brake
    jmp @friction
@accel:
    clc
    lda _racer_speed
    adc #<RACER_ACCEL
    sta _racer_speed
    lda _racer_speed+1
    adc #>RACER_ACCEL
    sta _racer_speed+1
    ; if (racer_speed > MAX) racer_speed = MAX   (MAX < speed?)
    sec
    lda #<RACER_MAX_SPEED
    sbc _racer_speed
    lda #>RACER_MAX_SPEED
    sbc _racer_speed+1
    bvc @ac1
    eor #$80
@ac1:
    bpl @ret             ; MAX >= speed -> ok
    lda #<RACER_MAX_SPEED
    sta _racer_speed
    lda #>RACER_MAX_SPEED
    sta _racer_speed+1
@ret:
    rts
@brake:
    sec
    lda _racer_speed
    sbc #<RACER_BRAKE
    sta _racer_speed
    lda _racer_speed+1
    sbc #>RACER_BRAKE
    sta _racer_speed+1
    ; if (racer_speed < -REV_MAX) racer_speed = -REV_MAX   (speed < NEG_REV?)
    sec
    lda _racer_speed
    sbc #<NEG_REV
    lda _racer_speed+1
    sbc #>NEG_REV
    bvc @br1
    eor #$80
@br1:
    bpl @ret2            ; speed >= -REV_MAX -> ok
    lda #<NEG_REV
    sta _racer_speed
    lda #>NEG_REV
    sta _racer_speed+1
@ret2:
    rts
@friction:
    ; if (speed > FRICTION) speed -= FRICTION   (FRICTION < speed?)
    sec
    lda #<RACER_FRICTION
    sbc _racer_speed
    lda #>RACER_FRICTION
    sbc _racer_speed+1
    bvc @fr1
    eor #$80
@fr1:
    bpl @frNotPos        ; FRICTION >= speed -> not (speed > FRICTION)
    sec
    lda _racer_speed
    sbc #<RACER_FRICTION
    sta _racer_speed
    lda _racer_speed+1
    sbc #>RACER_FRICTION
    sta _racer_speed+1
    rts
@frNotPos:
    ; else if (speed < -FRICTION) speed += FRICTION   (speed < NEG_FRI?)
    sec
    lda _racer_speed
    sbc #<NEG_FRI
    lda _racer_speed+1
    sbc #>NEG_FRI
    bvc @fr2
    eor #$80
@fr2:
    bpl @frZero          ; speed >= -FRICTION -> speed = 0
    clc
    lda _racer_speed
    adc #<RACER_FRICTION
    sta _racer_speed
    lda _racer_speed+1
    adc #>RACER_FRICTION
    sta _racer_speed+1
    rts
@frZero:
    lda #0
    sta _racer_speed
    sta _racer_speed+1
    rts
.endproc
