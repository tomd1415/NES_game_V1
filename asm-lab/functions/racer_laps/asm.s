; racer_laps — hand-written 6502 for the racer lap-counting FSM (BW_GAME_STYLE 3).
; Look up behaviour_at the car's CENTRE cell, then the C's if/else-if chain (at most
; ONE transition per frame): checkpoint arms cp_stage, finish counts a lap while
; cp_stage >= RACER_CP_COUNT, reaching RACER_LAPS_TO_WIN sets racer_finished.

.export _racer_laps_asm
.import _behaviour_at
.import _px, _py, _racer_cp_stage, _racer_laps, _racer_finished
.import pushax
.importzp tmp1, tmp2

FINISH_ID = 7
CP_ID     = 5
CP2_ID    = 6
CP_COUNT  = 1
LAPS_WIN  = 3
PW4       = 2 * 4          ; PLAYER_W << 2
PH4       = 2 * 4          ; PLAYER_H << 2

.segment "BSS"
mid: .res 1

.segment "CODE"
.proc _racer_laps_asm
    ; centre col = (px + PW4) >> 3
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
    ldx #0
    jsr pushax
    ; centre row = (py + PH4) >> 3
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
    ldx #0
    jsr _behaviour_at
    sta mid
    ; if (mid == CP_ID && cp_stage == 0) cp_stage = 1
    cmp #CP_ID
    bne @notcp1
    lda _racer_cp_stage
    bne @done            ; stage != 0
    lda #1
    sta _racer_cp_stage
    jmp @done
@notcp1:
    ; else if (mid == CP2_ID && cp_stage == 1) cp_stage = 2
    lda mid
    cmp #CP2_ID
    bne @notcp2
    lda _racer_cp_stage
    cmp #1
    bne @done            ; stage != 1
    lda #2
    sta _racer_cp_stage
    jmp @done
@notcp2:
    ; else if (mid == FINISH_ID && cp_stage >= CP_COUNT) { ... }
    lda mid
    cmp #FINISH_ID
    bne @done
    lda _racer_cp_stage
    cmp #CP_COUNT
    bcc @done            ; cp_stage < CP_COUNT
    lda #0
    sta _racer_cp_stage
    inc _racer_laps
    lda _racer_laps
    cmp #LAPS_WIN
    bcc @done            ; laps < LAPS_TO_WIN
    lda #1
    sta _racer_finished
@done:
    rts
.endproc
