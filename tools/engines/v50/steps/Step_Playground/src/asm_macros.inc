; asm_macros.inc — shared ca65 macros for the hand-written 6502 engine.
;
; MULC resBase, CONST
;   16-bit result = A * CONST, written to resBase (lo) / resBase+1 (hi), where
;   CONST is an assemble-time constant (from project.inc). Emits only the shift-
;   and-add steps the constant's set bits require, so a power-of-two multiplier
;   costs just shifts + one add and an arbitrary multiple (e.g. 96 = 64+32) costs
;   a couple of adds — all resolved at assemble time, per project. Clobbers
;   tmp1/tmp2 (the running "A << i" value). resBase may be ZP or absolute (e.g. a
;   C global like anim_base). resBase+1 is formed inside the macro so callers
;   never pass `sym+1` as an argument (ca65 mis-parses a later constant arg then).

.macro MULC resBase, CONST
    sta tmp1                     ; shifted lo = A (multiplicand)
    lda #0
    sta tmp2                     ; shifted hi = 0
    sta resBase                  ; acc = 0
    sta resBase+1
    .repeat 16, i
      .if (CONST & (1 << i))
        clc                      ; acc += (A << i)
        lda resBase
        adc tmp1
        sta resBase
        lda resBase+1
        adc tmp2
        sta resBase+1
      .endif
      .if CONST >= (1 << (i + 1))
        asl tmp1                 ; shifted <<= 1 (only while higher bits remain)
        rol tmp2
      .endif
    .endrepeat
.endmacro
