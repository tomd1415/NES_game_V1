; world_to_screen_x — hand-written 6502 candidate.
;
; C ABI (cc65 fastcall): the single 16-bit arg world_x arrives in A (low) and
; X (high); the unsigned char result is returned in A.
;
; The one 16-bit subtract off = world_x - cam_x gives us BOTH things the C
; needs, for free:
;   * the final carry is the unsigned comparison — C=0 means world_x < cam_x
;     (the C's first `return 0xFF`), C=1 means world_x >= cam_x;
;   * the high byte of off is the ">= 256" test (SCREEN_W_PX == 256).
; So: subtract; if borrow (C=0) -> 0xFF; else if hi(off) != 0 -> 0xFF; else
; return lo(off).  ~21 bytes, ~28 cycles vs cc65 -Os's stack-spilling version
; (~40+ bytes / ~120+ cycles, three ldax0sp + two pushax + incsp2).
;
; NOTE (v1 bug, kept as a lesson): an earlier version dropped the borrow test
; and relied on "an underflow always leaves hi(off) != 0". That is FALSE when
; cam_x is within 255 of 65536 (e.g. cam=65535, world=0 -> off=1, hi=0). The
; unit harness caught it. cam_x is bounded in practice, but we match the C
; exactly rather than lean on that invariant.

.export _w2sx_asm
.import _cam_x
.importzp tmp1

.segment "CODE"
.proc _w2sx_asm
    sec
    sbc _cam_x          ; A = lo(world_x) - lo(cam_x)
    sta tmp1            ; stash low byte of off
    txa
    sbc _cam_x+1        ; A = hi(off); final carry = (world_x >= cam_x)
    bcc @offscreen      ; borrow -> world_x < cam_x -> 0xFF
    bne @offscreen      ; hi(off) != 0 -> off >= 256 -> 0xFF
    lda tmp1            ; on-screen -> return low byte of off
    rts
@offscreen:
    lda #$FF
    rts
.endproc
