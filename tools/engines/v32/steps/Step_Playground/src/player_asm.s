; player_asm.s — hand-written 6502 for the player update (Phase 2c).
;
; Compiled + linked ONLY when NES_ASM_PLAYER=1 (Makefile); the matching C body in
; main.c is then #ifdef'd out, so flag OFF (default) = byte-identical to the pure-C
; engine. Requires a SCROLL build (px/py are u16 world-space) — the server gate
; only sets NES_ASM_PLAYER for is_scroll top-down projects, so this file assumes
; 16-bit px/py. The non-scroll (u8) path stays C for now.
;
; td_update — the TOP-DOWN player update (BW_GAME_STYLE == 1): 4-way move with
; per-direction collision, in the C's order (RIGHT, LEFT, then UP, DOWN — so the
; vertical step sees the post-horizontal px), then jumping/jmp_up/on_ladder = 0.
; Behaviourally identical to the C, proven in asm-lab (functions/td_update). The
; world bounds + player size are the project.inc constants the C bakes in.

.include "project.inc"

.export _td_update
.import _behaviour_at
.import _px, _py, _pad, _walk_speed, _plrdir, _jumping, _jmp_up, _on_ladder
.import pushax
.importzp tmp1, tmp2

BEH_SOLID  = 1
BEH_WALL   = 2
PW8        = PLAYER_W * 8
PH8        = PLAYER_H * 8
WORLD_W_PX = BG_WORLD_COLS * 8
WORLD_H_PX = BG_WORLD_ROWS * 8
RBOUND     = WORLD_W_PX - PW8          ; RIGHT: move only while px < RBOUND

.segment "BSS"
tdcol: .res 1
tdr0:  .res 1
tdr1:  .res 1
arow:  .res 1
lcol:  .res 1
rcol:  .res 1
pcol:  .res 1
prow:  .res 1

.segment "CODE"

; shr3: (tmp2:tmp1) >>= 3 (logical) ; A = lo
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

; cell_solid: behaviour_at(pcol, prow) SOLID/WALL ? A=1 : A=0
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
    lda #0
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

; rows_from_py: tdr0 = py>>3 ; tdr1 = (py + PH8 - 1)>>3
.proc rows_from_py
    lda _py
    sta tmp1
    lda _py+1
    sta tmp2
    jsr shr3
    sta tdr0
    lda #(PH8 - 1)
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

.proc _td_update
    ; ---- RIGHT (pad & 0x01) ----
    lda _pad
    and #$01
    beq skip_right
    ; if (px < RBOUND) — 16-bit compare
    lda _px
    cmp #<RBOUND
    lda _px+1
    sbc #>RBOUND
    bcs r_dir                 ; px >= RBOUND -> no move
    ; ahead_col = (px + PW8 + walk_speed - 1) >> 3
    lda #(PW8 - 1)
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
    jsr rows_from_py
    jsr hprobe
    bne r_dir
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
    bne l_go                  ; px >= 256 -> px >= walk_speed
    lda _px
    cmp _walk_speed
    bcc l_dir                 ; px < walk_speed -> no move
l_go:
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
    bcc skip_up               ; py < walk_speed -> no move
u_go:
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
    ; t = py + PH8 + walk_speed ; move only if t <= WORLD_H_PX
    lda #PH8
    clc
    adc _walk_speed
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2                  ; t = py + PH8 + walk_speed
    lda #<WORLD_H_PX
    sec
    sbc tmp1
    lda #>WORLD_H_PX
    sbc tmp2
    bcc skip_down             ; WORLD_H_PX < t -> t > WORLD_H_PX -> no move
    ; ahead_row = (py + PH8 + walk_speed - 1) >> 3
    lda #(PH8 - 1)
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
    lda #0
    sta _jumping
    sta _jmp_up
    sta _on_ladder
    rts
.endproc
