; reaction_for — hand-written 6502 candidate.
;
; C ABI (cc65 fastcall, 2 char args): behaviour_id (rightmost) in A; sprite_idx
; pushed by the caller as ONE byte (pusha), so it is at (sp),0. A char-arg
; callee pops 1 byte with `jmp incsp1` (preserves A/X).
;
; index = (sprite_idx << 3) | behaviour_id, both small (sprite<2, beh<8) so the
; index is 0..15 — a plain 8-bit X index, no 16-bit shlax3/ptr1 dance.

.export _rf_asm
.import _sprite_reactions
.import incsp1
.importzp sp, tmp1

.segment "CODE"
.proc _rf_asm               ; A = behaviour_id ; (sp),0 = sprite_idx
    cmp #8
    bcs @ignore             ; behaviour_id >= 8 -> REACT_IGNORE
    sta tmp1                 ; tmp1 = behaviour_id (0..7)
    ldy #0
    lda (sp),y              ; sprite_idx
    cmp #2
    bcs @ignore             ; sprite_idx >= 2 -> REACT_IGNORE
    asl
    asl
    asl                     ; sprite_idx << 3  (0 or 8)
    ora tmp1                ; | behaviour_id -> index 0..15
    tax
    lda _sprite_reactions,x
    ldx #0
    jmp incsp1              ; pop sprite_idx; A/X preserved
@ignore:
    lda #0
    ldx #0
    jmp incsp1
.endproc
