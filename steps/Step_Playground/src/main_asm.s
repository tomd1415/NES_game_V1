; main_asm.s — hand-written 6502 versions of main.c leaf helpers.
;
; Compiled + linked ONLY when the build sets NES_ASM_LEAF=1 (see the Makefile);
; the matching C bodies in main.c are then #ifdef'd out. Flag OFF (default) =>
; this file is not in the build => ROM byte-identical to the pure-C engine.
;
; Proven behaviourally identical to the C in asm-lab/functions/read_controller.

.export _read_controller
.importzp tmp1

JOYPAD1 = $4016

.segment "CODE"

; unsigned char read_controller(void)
;   Strobe $4016 (1 then 0), then 8x { read; bit0 -> carry; rol into result }.
;   A in bit 7 ... Right in bit 0. See asm-lab/functions/read_controller.
.proc _read_controller
    lda #$01
    sta JOYPAD1
    lsr a                   ; A = 0
    sta JOYPAD1
    ldx #8
@loop:
    lda JOYPAD1
    lsr a                   ; button bit -> carry
    rol tmp1                ; collect MSB-first
    dex
    bne @loop
    lda tmp1
    rts
.endproc
