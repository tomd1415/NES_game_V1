; behaviour_at — hand-written 6502 candidate (WORLD_COLS=32, WORLD_ROWS=30).
;
; C ABI (cc65 fastcall, 2 args): the RIGHTMOST arg world_row is in A(lo)/X(hi);
; the earlier arg world_col was pushed by the caller, so it is at (sp),0 / (sp),1.
; A fastcall callee pops its stacked args before returning — here 2 bytes
; (world_col) via `jmp incsp2`, which preserves A (the return byte) and X.
;
; index = world_row*WORLD_COLS + world_col. With WORLD_COLS=32 and the bounds
; checks guaranteeing row<30, col<32:
;   row*32 = (row>>3)*256 + ((row&7)<<5)
; and since (row&7)<<5 has its low 5 bits clear and col<32, adding col is a
; plain OR with no carry:
;   indexHi = row>>3            (0..3)
;   indexLo = ((row&7)<<5) | col
; So no 16-bit multiply routine, no tosaddax — just shifts, an OR, and one
; 16-bit add of the map base. (cc65 -Os uses pushax + 3x ldaxysp + shlax4 +
; shlax1 + tosaddax + incsp4 — well over 200 cycles.)

.export _bat_asm
.import _active_behaviour_map
.import incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

.segment "CODE"
.proc _bat_asm              ; A/X = world_row ; (sp),0/1 = world_col
    ; --- bounds: world_row >= WORLD_ROWS (30) ---
    cpx #0
    bne @none               ; hi(row) != 0 -> >= 256 -> NONE
    cmp #30
    bcs @none               ; lo(row) >= 30 -> NONE
    sta tmp3                 ; tmp3 = row (0..29)
    lsr
    lsr
    lsr
    sta tmp2                 ; indexHi = row >> 3
    lda tmp3
    and #$07
    asl
    asl
    asl
    asl
    asl
    sta tmp1                 ; (row & 7) << 5  (low 5 bits clear)
    ; --- world_col from the param stack, bounds >= WORLD_COLS (32) ---
    ldy #1
    lda (sp),y
    bne @none               ; hi(col) != 0 -> NONE
    dey
    lda (sp),y              ; col lo
    cmp #32
    bcs @none               ; col >= 32 -> NONE
    ora tmp1                ; indexLo = ((row&7)<<5) | col   (no carry)
    ; --- ptr1 = active_behaviour_map + index ---
    clc
    adc _active_behaviour_map
    sta ptr1
    lda tmp2
    adc _active_behaviour_map+1
    sta ptr1+1
    ; --- deref ---
    ldy #0
    lda (ptr1),y
    ldx #0                  ; char return: X=0 like cc65
    jmp incsp2              ; pop world_col; A/X preserved
@none:
    lda #0                  ; BEHAVIOUR_NONE
    ldx #0
    jmp incsp2
.endproc
