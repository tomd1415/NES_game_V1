; td_update — hand-written 6502 candidate for the TOP-DOWN player update.
;
; Reads globals pad, px/py (16-bit), walk_speed; writes px/py, plrdir, jumping,
; jmp_up, on_ladder. Four directional blocks, in the C's order (RIGHT, LEFT, then
; UP, DOWN — so vertical sees the post-horizontal px), then the resets.
;   horizontal: probe the ahead COLUMN across every body row (loop), step if clear.
;   vertical:   probe the two body COLUMNS at the ahead row, step if clear.
; PLAYER_W = PLAYER_H = 2 so PLAYER_?*8 = 16; WORLD_W_PX-16 = 240; WORLD_H_PX = 240.
;
; behaviour_at clobbers tmp1..3, so every column/row is computed (16-bit, logical
; >>3) and stashed in BSS BEFORE any probe call.

.export _td_update_asm
.import _behaviour_at
.import _px, _py, _pad, _walk_speed, _plrdir, _jumping, _jmp_up, _on_ladder
.import pushax
.importzp tmp1, tmp2

BEH_SOLID = 1
BEH_WALL  = 2

.segment "BSS"
tdcol: .res 1     ; ahead column (horizontal)
tdr0:  .res 1     ; top body row
tdr1:  .res 1     ; bottom body row
arow:  .res 1     ; ahead row (vertical)
lcol:  .res 1     ; left body column
rcol:  .res 1     ; right body column
pcol:  .res 1     ; behaviour_at args
prow:  .res 1

.segment "CODE"

; shr3: (tmp2:tmp1) >>= 3 (logical) ; returns lo in A
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

; cell_solid: behaviour_at(pcol, prow) is SOLID/WALL ? A=1 : A=0
.proc cell_solid
    lda pcol
    ldx #0
    jsr pushax
    lda prow
    ldx #0
    jsr _behaviour_at
    cmp #BEH_SOLID
    beq @y
    cmp #BEH_WALL
    beq @y
    lda #0
    rts
@y:
    lda #1
    rts
.endproc

; hprobe: any row tdr0..tdr1 at column tdcol solid ? A=1 : A=0
.proc hprobe
    lda tdr0
    sta prow
@loop:
    lda prow
    cmp tdr1
    bcc @do
    beq @do
    lda #0            ; prow > tdr1 -> none blocked
    rts
@do:
    lda tdcol
    sta pcol
    jsr cell_solid
    bne @yes
    inc prow
    jmp @loop
@yes:
    lda #1
    rts
.endproc

; calc_cols: lcol = px>>3 ; rcol = (px+15)>>3   (body columns from current px)
.proc calc_cols
    lda _px
    sta tmp1
    lda _px+1
    sta tmp2
    jsr shr3
    sta lcol
    lda #15
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

.proc _td_update_asm
    ; ---- RIGHT (pad & 0x01) ----
    lda _pad
    and #$01
    beq skip_right
    lda _px+1
    bne r_dir              ; px >= 256 -> past bound, no move
    lda _px
    cmp #240
    bcs r_dir              ; px >= 240 -> no move
    ; ahead_col = (px + 15 + walk_speed) >> 3
    lda #15
    clc
    adc _walk_speed
    clc
    adc _px
    sta tmp1
    lda _px+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py       ; tdr0/tdr1
    jsr hprobe
    bne r_dir              ; blocked
    lda _px
    clc
    adc _walk_speed
    sta _px
    lda _px+1
    adc #0
    sta _px+1
r_dir:
    lda #$00
    sta _plrdir
skip_right:
    ; ---- LEFT (pad & 0x02) ----
    lda _pad
    and #$02
    beq skip_left
    lda _px+1
    bne l_go              ; px >= 256 -> px >= walk_speed
    lda _px
    cmp _walk_speed
    bcc l_dir            ; px < walk_speed -> no move
l_go:
    ; ahead_col = (px - walk_speed) >> 3
    lda _px
    sec
    sbc _walk_speed
    sta tmp1
    lda _px+1
    sbc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne l_dir
    lda _px
    sec
    sbc _walk_speed
    sta _px
    lda _px+1
    sbc #0
    sta _px+1
l_dir:
    lda #$40
    sta _plrdir
skip_left:
    ; ---- UP (pad & 0x08) ----
    lda _pad
    and #$08
    beq skip_up
    lda _py+1
    bne u_go
    lda _py
    cmp _walk_speed
    bcc skip_up          ; py < walk_speed -> no move
u_go:
    ; ahead_row = (py - walk_speed) >> 3
    lda _py
    sec
    sbc _walk_speed
    sta tmp1
    lda _py+1
    sbc #0
    sta tmp2
    jsr shr3
    sta arow
    jsr calc_cols
    lda lcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_up
    lda rcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_up
    lda _py
    sec
    sbc _walk_speed
    sta _py
    lda _py+1
    sbc #0
    sta _py+1
skip_up:
    ; ---- DOWN (pad & 0x04) ----
    lda _pad
    and #$04
    beq skip_down
    ; bound: t = py + 16 + walk_speed ; move only if t <= 240
    lda #16
    clc
    adc _walk_speed
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    lda tmp2
    bne skip_down        ; t >= 256 -> > 240 -> no move
    lda tmp1
    cmp #241
    bcs skip_down        ; t >= 241 -> > 240 -> no move
    ; ahead_row = (py + 15 + walk_speed) >> 3
    lda #15
    clc
    adc _walk_speed
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    jsr shr3
    sta arow
    jsr calc_cols
    lda lcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_down
    lda rcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_down
    lda _py
    clc
    adc _walk_speed
    sta _py
    lda _py+1
    adc #0
    sta _py+1
skip_down:
    ; ---- resets ----
    lda #0
    sta _jumping
    sta _jmp_up
    sta _on_ladder
    rts
.endproc

; rows_from_py: tdr0 = py>>3 ; tdr1 = (py+15)>>3
.proc rows_from_py
    lda _py
    sta tmp1
    lda _py+1
    sta tmp2
    jsr shr3
    sta tdr0
    lda #15
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdr1
    rts
.endproc
