; plat_vmove — hand-written 6502 candidate for the platformer vertical physics
; (jump ascent + gravity/fall). Reads px/py (16-bit), jumping, jmp_up, on_ladder;
; writes py, jumping, jmp_up. Behaviourally identical to the C reference.
; PLAYER_W=PLAYER_H=2 -> body is 16px; WORLD_H_PX=240 (fall stops at py>=232).

.export _plat_vmove_asm
.import _behaviour_at
.import _px, _py, _jumping, _jmp_up, _on_ladder
.import pushax
.importzp tmp1, tmp2

BEH_SOLID = 1
BEH_WALL  = 2
BEH_PLAT  = 3
PW8       = 16
PH8       = 16

.segment "BSS"
lcol: .res 1
rcol: .res 1
vrow: .res 1     ; head_row (ascent) / foot_row (gravity)
pcol: .res 1
prow: .res 1

.segment "CODE"

.proc shr3       ; (tmp2:tmp1) >>= 3 ; A = lo
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    rts
.endproc

; cell_hit: behaviour_at(pcol,prow) in {list} ? A=1 : A=0.  `wantplat` (via the
; two entry points) decides whether PLATFORM also counts.
.proc cell_solid          ; SOLID/WALL
    jsr bat
    cmp #BEH_SOLID
    beq yes
    cmp #BEH_WALL
    beq yes
    lda #0
    rts
yes:
    lda #1
    rts
.endproc

.proc cell_solid_or_plat  ; SOLID/WALL/PLATFORM
    jsr bat
    cmp #BEH_SOLID
    beq yes
    cmp #BEH_WALL
    beq yes
    cmp #BEH_PLAT
    beq yes
    lda #0
    rts
yes:
    lda #1
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

.proc _plat_vmove_asm
    lda _on_ladder
    beq not_ladder
    rts                       ; on ladder -> the ladder branch owns py
not_ladder:
    lda _jumping
    beq to_gravity
    lda _jmp_up
    bne ascent            ; jumping && jmp_up>0 -> ascent
to_gravity:
    jmp gravity           ; gravity label is far; reach it via jmp
ascent:
    ; ---- ASCENT ----
    ; head_row = (py >= 2) ? (py-2)>>3 : 0
    lda _py+1
    bne hr_sub
    lda _py
    cmp #2
    bcs hr_sub
    lda #0                    ; py < 2 -> head_row = 0
    sta vrow
    jmp head_probe
hr_sub:
    lda _py
    sec
    sbc #2
    sta tmp1
    lda _py+1
    sbc #0
    sta tmp2
    jsr shr3
    sta vrow
head_probe:
    jsr calc_cols
    lda lcol
    sta pcol
    lda vrow
    sta prow
    jsr cell_solid
    bne bonk
    lda rcol
    sta pcol
    lda vrow
    sta prow
    jsr cell_solid
    bne bonk
    jmp do_rise
bonk:
    lda #0
    sta _jmp_up
    rts
do_rise:
    ; if (py >= 18) py -= 2 else py = 16
    lda _py+1
    bne rise2
    lda _py
    cmp #18
    bcs rise2
    lda #16
    sta _py
    lda #0
    sta _py+1
    jmp dec_jmp
rise2:
    lda _py
    sec
    sbc #2
    sta _py
    lda _py+1
    sbc #0
    sta _py+1
dec_jmp:
    dec _jmp_up
    rts
gravity:
    ; foot_row = (py + PH8) >> 3
    lda #PH8
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    jsr shr3
    sta vrow
    jsr calc_cols
    lda lcol
    sta pcol
    lda vrow
    sta prow
    jsr cell_solid_or_plat
    bne land
    lda rcol
    sta pcol
    lda vrow
    sta prow
    jsr cell_solid_or_plat
    bne land
    jmp do_fall
land:
    ; py = (foot_row << 3) - PH8
    lda vrow
    sta tmp1
    lda #0
    sta tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2                  ; tmp2:tmp1 = foot_row << 3
    lda tmp1
    sec
    sbc #PH8
    sta _py
    lda tmp2
    sbc #0
    sta _py+1
    lda #0
    sta _jumping
    rts
do_fall:
    ; if (py < WORLD_H_PX - 8 == 232) py += 2 ; jumping = 1
    lda _py+1
    bne @air
    lda _py
    cmp #232
    bcs @air
    lda _py
    clc
    adc #2
    sta _py
    lda _py+1
    adc #0
    sta _py+1
@air:
    lda #1
    sta _jumping
    rts
.endproc
