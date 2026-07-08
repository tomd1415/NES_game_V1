; px_integrate — hand-written 6502 candidate for the 8.8 sub-pixel integrate.
;
; C ABI (cc65 fastcall): the single 16-bit signed arg `v` arrives in A (low) and
; X (high). No return value; it updates the globals pxi_pos (16-bit) + pxi_sub.
;
;   acc     = pxi_sub + v            (16-bit; pxi_sub is 0..255 so its hi = 0)
;   pxi_sub = acc & 0xFF             (low byte of the sum)
;   delta   = (signed) hi(acc)       (whole-pixel step, sign-extended)
;   pxi_pos = pxi_pos + delta        (16-bit signed add)
;
; The one 16-bit add gives both halves for free: the low byte IS the new sub,
; and the high byte IS the signed whole-pixel delta. sub+v wrapping mod 65536
; (the C's `signed int acc`) falls straight out of the 8-bit adds + carry, so an
; overflowing v matches the C's wrap without any special-casing.

.export _pxi_integrate_asm
.import _pxi_pos, _pxi_sub
.importzp tmp1

.segment "CODE"
.proc _pxi_integrate_asm
    ; A = v_lo, X = v_hi
    clc
    adc _pxi_sub        ; A = v_lo + sub = acc_lo ; C = carry into hi
    sta _pxi_sub        ; sub' = acc_lo
    txa
    adc #0              ; A = v_hi + carry = acc_hi (the signed whole-pixel delta)
    sta tmp1            ; stash delta byte (its sign decides the hi extension)
    ; pxi_pos += sign_extend(delta)
    clc
    adc _pxi_pos        ; pos_lo + delta_lo ; C = carry
    sta _pxi_pos
    lda tmp1
    bpl @pos            ; delta >= 0 -> hi extension = 0x00
    lda #$FF            ; delta < 0  -> hi extension = 0xFF
    bne @addhi          ; (always taken: #$FF != 0)
@pos:
    lda #$00
@addhi:
    adc _pxi_pos+1      ; pos_hi + delta_hi + carry(from the lo add)
    sta _pxi_pos+1
    rts
.endproc
