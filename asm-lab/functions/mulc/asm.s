; Unit test for the MULC shift-add-by-constant macro (asm_macros.inc) — the core
; of the Phase-1 generalisation (behaviour_at's row*WORLD_COLS, advance_animation's
; frame*PLAYER_TILES_PER_FRAME). Exposes one entry per world width the editor can
; produce (multiples of 32). Each: A = multiplicand -> product in A(lo)/X(hi).
;
; Plain labels (not .proc) so the macro's .if/.repeat see the literal constant at
; file scope (ca65 won't fold a symbol constant inside a .proc — see project.inc).
.include "../../../steps/Step_Playground/src/asm_macros.inc"
.importzp tmp1, tmp2
.export _mul32, _mul64, _mul96, _mul128

.segment "BSS"
mres: .res 2

.segment "CODE"
_mul32:
    MULC mres, 32
    lda mres
    ldx mres+1
    rts
_mul64:
    MULC mres, 64
    lda mres
    ldx mres+1
    rts
_mul96:
    MULC mres, 96
    lda mres
    ldx mres+1
    rts
_mul128:
    MULC mres, 128
    lda mres
    ldx mres+1
    rts
