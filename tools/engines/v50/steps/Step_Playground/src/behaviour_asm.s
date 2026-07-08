; behaviour_asm.s — hand-written 6502 for the behaviour queries, GENERALISED.
;
; Compiled + linked when NES_ASM_LEAF=1; the matching C bodies in behaviour.c are
; then #ifdef'd out. Flag OFF (default) = byte-identical ROM.
;
; Both routines now read per-project constants from project.inc (WORLD_COLS,
; WORLD_ROWS, NUM_BEHAVIOUR_SPRITES) instead of baking them, so ONE .s serves any
; project — the server writes project.inc per /play (Phase 1 of the ASM engine
; generator plan). Proven in asm-lab/functions/behaviour_at + reaction_for
; (parameterised across WORLD_COLS).

.include "project.inc"
.include "asm_macros.inc"

.export _behaviour_at
.export _reaction_for
.import _active_behaviour_map, _sprite_reactions
.import incsp1, incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

.segment "CODE"

; unsigned char reaction_for(unsigned char sprite_idx, unsigned char behaviour_id)
;   behaviour_id in A; sprite_idx at (sp),0. index = (sprite<<3)|beh.
.proc _reaction_for
    cmp #8
    bcs @ignore                      ; behaviour_id >= 8 -> REACT_IGNORE
    sta tmp1                          ; behaviour_id
    ldy #0
    lda (sp),y                       ; sprite_idx
    cmp #NUM_BEHAVIOUR_SPRITES        ; >= sprite count -> REACT_IGNORE
    bcs @ignore
    asl
    asl
    asl                              ; sprite_idx << 3
    ora tmp1
    tax
    lda _sprite_reactions,x
    ldx #0
    jmp incsp1
@ignore:
    lda #0
    ldx #0
    jmp incsp1
.endproc

; unsigned char behaviour_at(unsigned int world_col, unsigned int world_row)
;   world_row in A/X ; world_col at (sp),0/1.
;   Returns active_behaviour_map[world_row * WORLD_COLS + world_col], or
;   BEHAVIOUR_NONE (0) if out of bounds. WORLD_COLS is a project constant; the
;   row*WORLD_COLS product is a MULC shift-add (a shift when WORLD_COLS is a power
;   of two). WORLD_ROWS < 256 and (world is <= 8 screens) WORLD_COLS <= 256.
.proc _behaviour_at                  ; A/X = world_row ; (sp),0/1 = world_col
    cpx #0
    bne @none                        ; hi(row) != 0 -> >= 256 -> NONE
    cmp #WORLD_ROWS
    bcs @none
    ; ptr1 = row * WORLD_COLS  (A = row)
    MULC ptr1, WORLD_COLS
    ; bounds + fetch col (16-bit at (sp),0/1)
    ldy #1
    lda (sp),y
    bne @none                        ; hi(col) != 0 -> NONE
    dey
    lda (sp),y                       ; col lo
.if WORLD_COLS < 256
    cmp #WORLD_COLS
    bcs @none                        ; col >= WORLD_COLS -> NONE
.endif
    sta tmp3                          ; col
    ; ptr1 += col
    clc
    lda ptr1
    adc tmp3
    sta ptr1
    lda ptr1+1
    adc #0
    sta ptr1+1
    ; ptr1 += active_behaviour_map (the selected map's base pointer)
    clc
    lda ptr1
    adc _active_behaviour_map
    sta ptr1
    lda ptr1+1
    adc _active_behaviour_map+1
    sta ptr1+1
    ldy #0
    lda (ptr1),y
    ldx #0
    jmp incsp2
@none:
    lda #0
    ldx #0
    jmp incsp2
.endproc
