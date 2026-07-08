; player_asm.s — hand-written 6502 for the player update (Phase 2c).
;
; Compiled + linked ONLY when NES_ASM_PLAYER=1 (Makefile); the matching C body in
; main.c is then #ifdef'd out, so flag OFF (default) = byte-identical to the pure-C
; engine. Not shipped to pupils yet (PLAYGROUND_ASM_PLAYER test toggle).
;
; td_update — the TOP-DOWN player update (BW_GAME_STYLE == 1): 4-way move with
; per-direction collision, in the C's order (RIGHT, LEFT, then UP, DOWN — so the
; vertical step sees the post-horizontal px), then jumping/jmp_up/on_ladder = 0.
; Behaviourally identical to the C, proven in asm-lab (functions/td_update). The
; world bounds + player size are the project.inc constants the C bakes in.
;
; px/py in the shipped build are u8 (1x1/non-scroll) or u16 (scroll) — same split
; as the C's pxcoord_t. td_update loads them into 16-bit working copies (pxw/pyw,
; hi=0 for u8) at entry and stores them back width-appropriately at exit, so all
; the interior math is one 16-bit path; only the load/store branch on PX_WIDE.

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
; px/py are u16 exactly when the C uses SCROLL_BUILD (world bigger than one screen).
; NB: `.define` (not `=`) so `.if PX_WIDE` resolves inside .proc scopes, like the
; project.inc SS_POS_WIDE; and no parens around `>` (ca65 reads a parenthesised
; `>` as the hi-byte operator).
.if BG_WORLD_COLS > 32
.define PX_WIDE 1
.elseif BG_WORLD_ROWS > 30
.define PX_WIDE 1
.else
.define PX_WIDE 0
.endif

.segment "BSS"
pxw:   .res 2     ; 16-bit working copy of px (hi = 0 when not PX_WIDE)
pyw:   .res 2
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

; rows_from_py: tdr0 = pyw>>3 ; tdr1 = (pyw + PH8 - 1)>>3
.proc rows_from_py
    lda pyw
    sta tmp1
    lda pyw+1
    sta tmp2
    jsr shr3
    sta tdr0
    lda #(PH8 - 1)
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdr1
    rts
.endproc

; calc_cols: lcol = pxw>>3 ; rcol = (pxw + PW8 - 1)>>3
.proc calc_cols
    lda pxw
    sta tmp1
    lda pxw+1
    sta tmp2
    jsr shr3
    sta lcol
    lda #(PW8 - 1)
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta rcol
    rts
.endproc

.proc _td_update
    ; --- load px/py into 16-bit working copies ---
.if PX_WIDE
    lda _px
    sta pxw
    lda _px+1
    sta pxw+1
    lda _py
    sta pyw
    lda _py+1
    sta pyw+1
.else
    lda _px
    sta pxw
    lda _py
    sta pyw
    lda #0
    sta pxw+1
    sta pyw+1
.endif

    ; ---- RIGHT (pad & 0x01) ----
    lda _pad
    and #$01
    beq skip_right
    lda pxw
    cmp #<RBOUND
    lda pxw+1
    sbc #>RBOUND
    bcs r_dir                 ; px >= RBOUND -> no move
    lda #(PW8 - 1)
    clc
    adc _walk_speed
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne r_dir
    lda pxw
    clc
    adc _walk_speed
    sta pxw
    lda pxw+1
    adc #0
    sta pxw+1
r_dir:
    lda #$00
    sta _plrdir
skip_right:
    ; ---- LEFT (pad & 0x02) ----
    lda _pad
    and #$02
    beq skip_left
    lda pxw+1
    bne l_go                  ; px >= 256 -> px >= walk_speed
    lda pxw
    cmp _walk_speed
    bcc l_dir                 ; px < walk_speed -> no move
l_go:
    lda pxw
    sec
    sbc _walk_speed
    sta tmp1
    lda pxw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne l_dir
    lda pxw
    sec
    sbc _walk_speed
    sta pxw
    lda pxw+1
    sbc #0
    sta pxw+1
l_dir:
    lda #$40
    sta _plrdir
skip_left:
    ; ---- UP (pad & 0x08) ----
    lda _pad
    and #$08
    beq skip_up
    lda pyw+1
    bne u_go
    lda pyw
    cmp _walk_speed
    bcc skip_up               ; py < walk_speed -> no move
u_go:
    lda pyw
    sec
    sbc _walk_speed
    sta tmp1
    lda pyw+1
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
    lda pyw
    sec
    sbc _walk_speed
    sta pyw
    lda pyw+1
    sbc #0
    sta pyw+1
skip_up:
    ; ---- DOWN (pad & 0x04) ----
    lda _pad
    and #$04
    beq skip_down
    lda #PH8
    clc
    adc _walk_speed
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2                  ; t = py + PH8 + walk_speed
    lda #<WORLD_H_PX
    sec
    sbc tmp1
    lda #>WORLD_H_PX
    sbc tmp2
    bcc skip_down             ; WORLD_H_PX < t -> t > WORLD_H_PX -> no move
    lda #(PH8 - 1)
    clc
    adc _walk_speed
    clc
    adc pyw
    sta tmp1
    lda pyw+1
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
    lda pyw
    clc
    adc _walk_speed
    sta pyw
    lda pyw+1
    adc #0
    sta pyw+1
skip_down:
    ; --- store working copies back to px/py ---
.if PX_WIDE
    lda pxw
    sta _px
    lda pxw+1
    sta _px+1
    lda pyw
    sta _py
    lda pyw+1
    sta _py+1
.else
    lda pxw
    sta _px
    lda pyw
    sta _py
.endif
    lda #0
    sta _jumping
    sta _jmp_up
    sta _on_ladder
    rts
.endproc
