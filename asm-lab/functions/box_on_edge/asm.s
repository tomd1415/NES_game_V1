; box_on_edge — hand-written 6502 candidate for racer_box_on_edge.
;
; Reads the globals rbe_bx/by (16-bit) + rbe_bw/bh (8-bit), returns 0/1 in A.
; For each axis: o0 = base>>3 ; o1 = (base + sz*8 - 1)>>3 ; om = (base + sz*4)>>3
; (16-bit intermediates, logical >>3 since positions are unsigned) — the corner
; and centre cell coords. Then probe (c0,r0),(c1,r0),(c0,r1),(c1,r1),(cm,rm) via
; the shared behaviour_at, short-circuiting on the first SOLID_GROUND/WALL. The
; whole-16-bit math matters: a box at bx>=256 must give col>=32 (out of a 32-col
; map -> NONE), NOT a truncated in-bounds column.

.export _rbe_asm
.import _behaviour_at
.import _rbe_bx, _rbe_by, _rbe_bw, _rbe_bh
.import pushax
.importzp tmp1, tmp2, tmp3

BEH_SOLID = 1
BEH_WALL  = 2

.segment "BSS"
axb:  .res 2      ; axis base (16-bit)
axs:  .res 1      ; axis size (tiles)
ao0:  .res 1      ; base>>3
ao1:  .res 1      ; (base + sz*8 - 1)>>3
aom:  .res 1      ; (base + sz*4)>>3
rc0:  .res 1
rc1:  .res 1
rcm:  .res 1
rr0:  .res 1
rr1:  .res 1
rrm:  .res 1
pcol: .res 1
prow: .res 1

.segment "CODE"

; axis3: from axb (16-bit) + axs (tiles) -> ao0 / ao1 / aom.
.proc axis3
    ; ao0 = axb >> 3
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
    ; ao1 = (axb + axs*8 - 1) >> 3
    lda axs
    asl
    asl
    asl                 ; axs*8 (<= 24)
    sta tmp3
    clc
    lda axb
    adc tmp3
    sta tmp1
    lda axb+1
    adc #0
    sta tmp2            ; tmp2:tmp1 = axb + axs*8
    sec
    lda tmp1
    sbc #1
    sta tmp1
    lda tmp2
    sbc #0
    sta tmp2            ; - 1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta ao1
    ; aom = (axb + axs*4) >> 3
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
    jsr pushax          ; push col (16-bit)
    lda prow
    ldx #0
    jsr _behaviour_at   ; row in A/X ; A = behaviour ; col popped by callee
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

.proc _rbe_asm
    ; columns from bx / bw
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
    ; rows from by / bh
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
    ; probe the 4 corners + centre, short-circuit on first solid
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
