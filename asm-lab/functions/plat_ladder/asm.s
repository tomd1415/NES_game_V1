; plat_ladder — hand-written 6502 candidate for the platformer LADDER branch.
; Detect body/ladder overlap (on_ladder); if on a ladder, climb UP/DOWN with the
; ladder-wins-over-solid tie-break, and pin jumping/jmp_up = 0. px read, not
; written. PLAYER_W=PLAYER_H=2 (body 16px); WORLD_H_PX=240 (down stops at py>=232).

.export _plat_ladder_asm
.import _behaviour_at
.import _px, _py, _pad, _climb_speed, _jumping, _jmp_up, _on_ladder
.import pushax
.importzp tmp1, tmp2

BEH_SOLID  = 1
BEH_WALL   = 2
BEH_LADDER = 6
PW8        = 16
PH8        = 16

.segment "BSS"
lcol: .res 1
rcol: .res 1
drow: .res 1
pcol: .res 1
prow: .res 1
ntlo: .res 1
nthi: .res 1
ul:   .res 1
ur:   .res 1

.segment "CODE"

.proc shr3
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    rts
.endproc

; bat: A = behaviour_at(pcol, prow)
.proc bat
    lda pcol
    ldx #0
    jsr pushax
    lda prow
    ldx #0
    jsr _behaviour_at
    rts
.endproc

; calc_cols: lcol = px>>3 ; rcol = (px + PW8 - 1)>>3
.proc calc_cols
    lda _px
    sta tmp1
    lda _px+1
    sta tmp2
    jsr shr3
    sta lcol
    lda #(PW8 - 1)
    clc
    adc _px
    sta tmp1
    lda _px+1
    adc #0
    sta tmp2
    jsr shr3
    sta rcol
    rts
.endproc

.proc _plat_ladder_asm
    ; ---- detection: on_ladder = any body row has LADDER at lcol or rcol ----
    lda #0
    sta _on_ladder
    jsr calc_cols
    lda _py
    sta tmp1
    lda _py+1
    sta tmp2
    jsr shr3
    sta prow                 ; lt_row (loop var)
    lda #(PH8 - 1)
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    jsr shr3
    sta drow                 ; lb_row (loop end)
det_loop:
    lda prow
    cmp drow
    bcc det_do
    beq det_do
    jmp det_done
det_do:
    lda lcol
    sta pcol
    jsr bat
    cmp #BEH_LADDER
    beq det_yes
    lda rcol
    sta pcol
    jsr bat
    cmp #BEH_LADDER
    beq det_yes
    inc prow
    jmp det_loop
det_yes:
    lda #1
    sta _on_ladder
det_done:
    lda _on_ladder
    bne climb
    rts                      ; not on a ladder -> leave py/jumping/jmp_up

climb:
    ; ---- UP (pad & 0x08) ----
    lda _pad
    and #$08
    bne up_go
    jmp aft_up               ; UP not pressed
up_go:
    ; new_top = (py >= climb_speed) ? (py - climb_speed) : 0
    lda _py+1
    bne nt_sub
    lda _py
    cmp _climb_speed
    bcs nt_sub
    lda #0
    sta ntlo
    sta nthi
    jmp up_row
nt_sub:
    lda _py
    sec
    sbc _climb_speed
    sta ntlo
    lda _py+1
    sbc #0
    sta nthi
up_row:
    lda ntlo
    sta tmp1
    lda nthi
    sta tmp2
    jsr shr3
    sta drow
    lda lcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ul
    lda rcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ur
    ; move if (up_ladder || !up_solid)
    lda ul
    cmp #BEH_LADDER
    beq up_yes
    lda ur
    cmp #BEH_LADDER
    beq up_yes
    lda ul
    cmp #BEH_SOLID
    beq aft_up
    cmp #BEH_WALL
    beq aft_up
    lda ur
    cmp #BEH_SOLID
    beq aft_up
    cmp #BEH_WALL
    beq aft_up
up_yes:
    lda ntlo
    sta _py
    lda nthi
    sta _py+1
aft_up:
    ; ---- DOWN (pad & 0x04) ----
    lda _pad
    and #$04
    bne dn_go
    jmp aft_dn               ; DOWN not pressed
dn_go:
    ; new_foot = py + climb_speed + PH8 ; dn_row = new_foot>>3
    lda _climb_speed
    clc
    adc #PH8
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    jsr shr3
    sta drow
    lda lcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ul
    lda rcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ur
    ; guard py < 232
    lda _py+1
    bne aft_dn
    lda _py
    cmp #232
    bcs aft_dn
    ; move if (dn_ladder || !dn_solid)
    lda ul
    cmp #BEH_LADDER
    beq dn_yes
    lda ur
    cmp #BEH_LADDER
    beq dn_yes
    lda ul
    cmp #BEH_SOLID
    beq aft_dn
    cmp #BEH_WALL
    beq aft_dn
    lda ur
    cmp #BEH_SOLID
    beq aft_dn
    cmp #BEH_WALL
    beq aft_dn
dn_yes:
    lda _py
    clc
    adc _climb_speed
    sta _py
    lda _py+1
    adc #0
    sta _py+1
aft_dn:
    lda #0
    sta _jumping
    sta _jmp_up
    rts
.endproc
