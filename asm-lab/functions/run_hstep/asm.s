; run_hstep — hand-written 6502 for the auto-runner horizontal + respawn
; (BW_GAME_STYLE == 2). cam_x += AUTOSCROLL_SPEED; wrap to start at the track end;
; px = cam_x + RUNNER_SCREEN_X; respawn on a spike tile at the body centre or on
; falling off the bottom. runner_respawn resets cam_x/px/py/jumping/jmp_up.
; Behaviourally identical to run_hstep_ref. (asm-lab functions/run_hstep)

.export _run_hstep_asm
.import _behaviour_at
.import _cam_x, _px, _py, _jumping, _jmp_up
.import pushax
.importzp tmp1, tmp2

SPIKE     = 7
AUTOSCR   = 2
SCREEN_X  = 64
PLAYER_Y  = 176
CAM_MAX   = 256          ; WORLD_W_PX - SCREEN_W_PX = 512 - 256
FALL_Y    = 240 - 8      ; WORLD_H_PX - 8 = 232
PW4       = 2 * 4        ; PLAYER_W << 2 = 8 (centre-x pixel offset)
PH4       = 2 * 4        ; PLAYER_H << 2 = 8 (centre-y pixel offset)

.segment "BSS"
rcol: .res 1
rrow: .res 1

.segment "CODE"

; runner_respawn: cam_x=0; px=SCREEN_X; py=PLAYER_Y; jumping=0; jmp_up=0.
.proc respawn
    lda #0
    sta _cam_x
    sta _cam_x+1
    sta _px+1
    sta _jumping
    sta _jmp_up
    lda #SCREEN_X
    sta _px
    lda #<PLAYER_Y
    sta _py
    lda #>PLAYER_Y      ; 176 < 256 -> hi = 0
    sta _py+1
    rts
.endproc

.proc _run_hstep_asm
    ; cam_x += AUTOSCROLL_SPEED
    clc
    lda _cam_x
    adc #AUTOSCR
    sta _cam_x
    lda _cam_x+1
    adc #0
    sta _cam_x+1
    ; if (cam_x >= CAM_MAX) respawn   (unsigned 16-bit compare)
    lda _cam_x
    cmp #<CAM_MAX
    lda _cam_x+1
    sbc #>CAM_MAX
    bcc @nowrap         ; cam_x < CAM_MAX
    jsr respawn
@nowrap:
    ; px = cam_x + RUNNER_SCREEN_X
    clc
    lda _cam_x
    adc #SCREEN_X
    sta _px
    lda _cam_x+1
    adc #0
    sta _px+1
    ; run_c = (px + PW4) >> 3
    clc
    lda _px
    adc #PW4
    sta tmp1
    lda _px+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta rcol
    ; run_r = (py + PH4) >> 3
    clc
    lda _py
    adc #PH4
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta rrow
    ; if (behaviour_at(run_c, run_r) == SPIKE) respawn
    lda rcol
    ldx #0
    jsr pushax
    lda rrow
    ldx #0
    jsr _behaviour_at
    cmp #SPIKE
    bne @nospike
    jsr respawn
@nospike:
    ; if (py >= FALL_Y) respawn   (unsigned 16-bit compare)
    lda _py
    cmp #<FALL_Y
    lda _py+1
    sbc #>FALL_Y
    bcc @done           ; py < FALL_Y
    jsr respawn
@done:
    rts
.endproc
