; behaviour_special_asm.s — hand-written 6502 for the *per-project-specialised*
; behaviour queries. Linked ONLY when NES_ASM_SPECIALIZED=1 (direct/lab builds),
; NOT by the server default, because they bake per-project constants:
;   - behaviour_at bakes WORLD_COLS (index multiply).
;   - reaction_for bakes the sprite-type count (the `sprite_idx >= 2` bound is
;     really `>= num_sprites`, which varies per project).
; Proven in asm-lab/functions/behaviour_at and functions/reaction_for.
.export _behaviour_at
.export _reaction_for
.import _active_behaviour_map, _sprite_reactions
.import incsp1, incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3
.segment "CODE"

; unsigned char reaction_for(unsigned char sprite_idx, unsigned char behaviour_id)
;   behaviour_id in A; sprite_idx at (sp),0. index = (sprite<<3)|beh (0..15).
;   The `#2` bound bakes this build's num_sprites — hence specialised.
.proc _reaction_for
    cmp #8
    bcs @ignore                 ; behaviour_id >= 8 -> REACT_IGNORE
    sta tmp1                     ; behaviour_id
    ldy #0
    lda (sp),y                  ; sprite_idx
    cmp #2                       ; >= num_sprites (baked 2) -> REACT_IGNORE
    bcs @ignore
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
