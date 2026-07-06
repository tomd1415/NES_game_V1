; behaviour_asm.s — hand-written 6502 versions of behaviour.c query functions.
;
; Compiled + linked ONLY when NES_ASM_LEAF=1; the matching C bodies in
; behaviour.c are then #ifdef'd out. Flag OFF (default) = byte-identical ROM.
;
; Proven equivalent to the C in asm-lab/ (functions/reaction_for,
; functions/behaviour_at). reaction_for is general; behaviour_at's index
; multiply is specialised to this build's WORLD_COLS (see the note there).

.export _behaviour_at
.export _reaction_for
.import _active_behaviour_map, _sprite_reactions
.import incsp1, incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

.segment "CODE"

; unsigned char reaction_for(unsigned char sprite_idx, unsigned char behaviour_id)
;   behaviour_id in A; sprite_idx at (sp),0. index = (sprite<<3)|beh (0..15).
.proc _reaction_for
    cmp #8
    bcs @ignore                 ; behaviour_id >= 8 -> REACT_IGNORE
    sta tmp1                     ; behaviour_id
    ldy #0
    lda (sp),y                  ; sprite_idx
    cmp #2
    bcs @ignore                 ; sprite_idx >= 2 -> REACT_IGNORE
    asl
    asl
    asl                         ; sprite_idx << 3
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
;   world_row in A/X; world_col at (sp),0/1. Returns active_behaviour_map[
;   world_row*WORLD_COLS + world_col], or BEHAVIOUR_NONE (0) if out of bounds.
;
;   WORLD_COLS-SPECIFIC: this build is WORLD_COLS=64 (a power of two), so
;   row*64 = (row>>2)*256 + ((row&3)<<6), and col<64 fits the low 6 bits with no
;   carry (indexLo = ((row&3)<<6)|col, indexHi = row>>2). WORLD_ROWS=30. A
;   general-WORLD_COLS version (arbitrary multiples of 32, e.g. 96) would need a
;   real multiply — a follow-up; the flag is only enabled for matching builds.
.proc _behaviour_at             ; A/X = world_row ; (sp),0/1 = world_col
    cpx #0
    bne @none                   ; hi(row) != 0 -> >= 256 -> NONE
    cmp #30                     ; WORLD_ROWS
    bcs @none
    sta tmp3                     ; row (0..29)
    lsr
    lsr
    sta tmp2                     ; indexHi = row >> 2
    lda tmp3
    and #$03
    asl
    asl
    asl
    asl
    asl
    asl                         ; (row & 3) << 6
    sta tmp1
    ldy #1
    lda (sp),y
    bne @none                   ; hi(col) != 0 -> NONE
    dey
    lda (sp),y                  ; col lo
    cmp #64                     ; WORLD_COLS
    bcs @none
    ora tmp1                    ; indexLo = ((row&3)<<6) | col
    clc
    adc _active_behaviour_map
    sta ptr1
    lda tmp2
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
