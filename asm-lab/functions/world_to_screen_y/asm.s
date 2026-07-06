; world_to_screen_y — hand-written 6502 candidate.
;
; C ABI (cc65 fastcall): world_y in A(lo)/X(hi); returns unsigned char in A.
;
; Like _x, the 16-bit subtract off = world_y - cam_y gives the world_y < cam_y
; test in the borrow. But SCREEN_H_PX == 240, so ">= 240" is NOT just "hi != 0":
;   * hi(off) != 0  -> off >= 256 > 240 -> 0xFF, and
;   * hi(off) == 0  -> off is the low byte; compare it against 240.
; So one extra `cmp #240 / bcs`.

.export _w2sy_asm
.import _cam_y
.importzp tmp1

.segment "CODE"
.proc _w2sy_asm
    sec
    sbc _cam_y          ; A = lo(off)
    sta tmp1
    txa
    sbc _cam_y+1        ; A = hi(off); carry = (world_y >= cam_y)
    bcc @offscreen      ; world_y < cam_y -> 0xFF
    bne @offscreen      ; hi(off) != 0 -> off >= 256 -> 0xFF
    lda tmp1            ; hi == 0: off is the low byte
    cmp #240            ; off >= 240 ?  (SCREEN_H_PX)
    bcs @offscreen      ; yes -> 0xFF
    rts                 ; no -> A already holds off (< 240)
@offscreen:
    lda #$FF
    rts
.endproc
