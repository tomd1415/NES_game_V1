; racer_axis — hand-written 6502 for the racer per-axis move (BW_GAME_STYLE 3).
; Per axis: integrate the 8.8 velocity (px_integrate pattern) -> clamp to the world
; -> box_on_edge; on a hit, undo THAT axis + flag it. X before Y (slide). After
; both, bleed speed >>1 when the blocked axis carried the dominant velocity.
; Reuses the proven _rbe_asm (functions/box_on_edge) via its rbe_bx/by/bw/bh globals.

.export _racer_axis_asm
.import _px, _py, _px_sub, _py_sub, _vx, _vy, _racer_speed
.import _rbe_bx, _rbe_by, _rbe_bw, _rbe_bh
.import _behaviour_at
.import pushax
.importzp tmp1, tmp2, tmp3

; box_on_edge is inlined here as the local `rbe` proc (the asm-lab Makefile keys
; object names on basename, so a leaf is one .s file). It's a faithful copy of the
; proven functions/box_on_edge candidate — this leaf re-verifies it against the C
; ref, and player_asm.s will port the same proc for the racer compose.
BEH_SOLID = 1
BEH_WALL  = 2

PLAYER_W = 2
PLAYER_H = 2
RX_MAX   = 256 - PLAYER_W * 8      ; WORLD_W_PX - PLAYER_W*8 = 240
RY_MAX   = 240 - PLAYER_H * 8      ; WORLD_H_PX - PLAYER_H*8 = 224

.segment "BSS"
dhi:    .res 1
nplo:   .res 1
nphi:   .res 1
keeplo: .res 1
keephi: .res 1
keepsb: .res 1
hitx:   .res 1
hity:   .res 1
axb:    .res 2      ; box_on_edge: axis base (16-bit)
axs:    .res 1      ; axis size (tiles)
ao0:    .res 1
ao1:    .res 1
aom:    .res 1
rc0:    .res 1
rc1:    .res 1
rcm:    .res 1
rr0:    .res 1
rr1:    .res 1
rrm:    .res 1
pcol:   .res 1
prow:   .res 1

.segment "CODE"

; axis3: from axb (16-bit) + axs (tiles) -> ao0 / ao1 / aom (base/far/centre cell).
.proc axis3
    lda axb
    sta tmp1
    lda axb+1
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta ao0
    lda axs
    asl
    asl
    asl                 ; axs*8
    sta tmp3
    clc
    lda axb
    adc tmp3
    sta tmp1
    lda axb+1
    adc #0
    sta tmp2
    sec
    lda tmp1
    sbc #1
    sta tmp1
    lda tmp2
    sbc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta ao1
    lda axs
    asl
    asl                 ; axs*4
    sta tmp3
    clc
    lda axb
    adc tmp3
    sta tmp1
    lda axb+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta aom
    rts
.endproc

; probe_cell: behaviour_at(pcol, prow) SOLID/WALL ? A=1 : A=0
.proc probe_cell
    lda pcol
    ldx #0
    jsr pushax
    lda prow
    ldx #0
    jsr _behaviour_at
    cmp #BEH_SOLID
    beq @yes
    cmp #BEH_WALL
    beq @yes
    lda #0
    rts
@yes:
    lda #1
    rts
.endproc

; rbe: box_on_edge over _rbe_bx/by/bw/bh -> A = 0/1 (4 corners + centre).
.proc rbe
    lda _rbe_bx
    sta axb
    lda _rbe_bx+1
    sta axb+1
    lda _rbe_bw
    sta axs
    jsr axis3
    lda ao0
    sta rc0
    lda ao1
    sta rc1
    lda aom
    sta rcm
    lda _rbe_by
    sta axb
    lda _rbe_by+1
    sta axb+1
    lda _rbe_bh
    sta axs
    jsr axis3
    lda ao0
    sta rr0
    lda ao1
    sta rr1
    lda aom
    sta rrm
    lda rc0
    sta pcol
    lda rr0
    sta prow
    jsr probe_cell
    bne @hit
    lda rc1
    sta pcol
    lda rr0
    sta prow
    jsr probe_cell
    bne @hit
    lda rc0
    sta pcol
    lda rr1
    sta prow
    jsr probe_cell
    bne @hit
    lda rc1
    sta pcol
    lda rr1
    sta prow
    jsr probe_cell
    bne @hit
    lda rcm
    sta pcol
    lda rrm
    sta prow
    jsr probe_cell
    bne @hit
    lda #0
    rts
@hit:
    lda #1
    rts
.endproc
.proc _racer_axis_asm
    ; ===== X axis =====
    lda _px
    sta keeplo
    lda _px+1
    sta keephi
    lda _px_sub
    sta keepsb
    ; integrate vx: sub' = (px_sub + vx) & 0xFF ; delta = hi(px_sub + vx)
    clc
    lda _px_sub
    adc _vx
    sta _px_sub
    lda _vx+1
    adc #0
    sta dhi
    ; np = px + sign_extend(delta)
    clc
    lda _px
    adc dhi
    sta nplo
    lda dhi
    bpl @xp
    lda #$FF
    bne @xa
@xp:
    lda #0
@xa:
    adc _px+1
    sta nphi
    ; clamp np to [0, RX_MAX]
    lda nphi
    bpl @xnn
    lda #0
    sta nplo
    sta nphi
    sta _px_sub
    jmp @xst
@xnn:
    lda #<RX_MAX
    cmp nplo
    lda #>RX_MAX
    sbc nphi
    bcs @xst            ; RX_MAX >= np -> ok
    lda #<RX_MAX
    sta nplo
    lda #>RX_MAX
    sta nphi
    lda #0
    sta _px_sub
@xst:
    lda nplo
    sta _px
    lda nphi
    sta _px+1
    ; box_on_edge(px, py, W, H)
    lda _px
    sta _rbe_bx
    lda _px+1
    sta _rbe_bx+1
    lda _py
    sta _rbe_by
    lda _py+1
    sta _rbe_by+1
    lda #PLAYER_W
    sta _rbe_bw
    lda #PLAYER_H
    sta _rbe_bh
    jsr rbe
    beq @xok
    lda keeplo
    sta _px
    lda keephi
    sta _px+1
    lda keepsb
    sta _px_sub
    lda #1
    sta hitx
    jmp @ybegin
@xok:
    lda #0
    sta hitx
@ybegin:
    ; ===== Y axis =====
    lda _py
    sta keeplo
    lda _py+1
    sta keephi
    lda _py_sub
    sta keepsb
    clc
    lda _py_sub
    adc _vy
    sta _py_sub
    lda _vy+1
    adc #0
    sta dhi
    clc
    lda _py
    adc dhi
    sta nplo
    lda dhi
    bpl @yp
    lda #$FF
    bne @ya
@yp:
    lda #0
@ya:
    adc _py+1
    sta nphi
    lda nphi
    bpl @ynn
    lda #0
    sta nplo
    sta nphi
    sta _py_sub
    jmp @yst
@ynn:
    lda #<RY_MAX
    cmp nplo
    lda #>RY_MAX
    sbc nphi
    bcs @yst
    lda #<RY_MAX
    sta nplo
    lda #>RY_MAX
    sta nphi
    lda #0
    sta _py_sub
@yst:
    lda nplo
    sta _py
    lda nphi
    sta _py+1
    lda _px
    sta _rbe_bx
    lda _px+1
    sta _rbe_bx+1
    lda _py
    sta _rbe_by
    lda _py+1
    sta _rbe_by+1
    lda #PLAYER_W
    sta _rbe_bw
    lda #PLAYER_H
    sta _rbe_bh
    jsr rbe
    beq @yok
    lda keeplo
    sta _py
    lda keephi
    sta _py+1
    lda keepsb
    sta _py_sub
    lda #1
    sta hity
    jmp @bleed
@yok:
    lda #0
    sta hity
@bleed:
    ; avx -> nplo:nphi, avy -> keeplo:keephi (both non-negative)
    lda _vx+1
    bpl @avxp
    sec
    lda #0
    sbc _vx
    sta nplo
    lda #0
    sbc _vx+1
    sta nphi
    jmp @avy
@avxp:
    lda _vx
    sta nplo
    lda _vx+1
    sta nphi
@avy:
    lda _vy+1
    bpl @avyp
    sec
    lda #0
    sbc _vy
    sta keeplo
    lda #0
    sbc _vy+1
    sta keephi
    jmp @cond
@avyp:
    lda _vy
    sta keeplo
    lda _vy+1
    sta keephi
@cond:
    ; if ((hitx && avx>=avy) || (hity && avy>=avx)) racer_speed >>= 1
    lda hitx
    beq @tryhy
    lda nplo
    cmp keeplo
    lda nphi
    sbc keephi
    bcs @burn           ; avx >= avy
@tryhy:
    lda hity
    beq @done
    lda keeplo
    cmp nplo
    lda keephi
    sbc nphi
    bcs @burn           ; avy >= avx
    jmp @done
@burn:
    lda _racer_speed+1
    cmp #$80            ; C = sign bit (arithmetic >>1)
    ror _racer_speed+1
    ror _racer_speed
@done:
    rts
.endproc
