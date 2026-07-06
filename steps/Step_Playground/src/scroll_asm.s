; scroll_asm.s — hand-written 6502 versions of the leaf scroll helpers.
;
; Compiled + linked ONLY when the build sets NES_ASM_SCROLL=1 (see the Makefile);
; in that build the matching C bodies in scroll.c are #if'd out, so exactly one
; definition of each symbol links. With the flag OFF (the default) this file is
; not part of the build at all and the ROM is byte-identical to the pure-C
; engine.
;
; These are proven behaviourally identical to the C references in asm-lab/
; (functions/world_to_screen_x, world_to_screen_y) — same edge cases (aligned,
; 255/256 & 239/240 boundaries, underflow, max) via a jsnes unit harness. Both
; read the exported 16-bit globals cam_x / cam_y. cc65 fastcall: the single
; 16-bit arg arrives in A(lo)/X(hi); the unsigned char result returns in A.
;
; Only the two constant-screen-size leaf helpers live here; scroll_follow (needs
; the per-project WORLD_W/H clamps generalised) and scroll_apply_ppu / the VRAM
; streamers (whole-frame behaviours) stay in C for now — see asm-lab/STATUS.md.

.export _world_to_screen_x
.export _world_to_screen_y
.import _cam_x, _cam_y
.importzp tmp1

.segment "CODE"

; unsigned char world_to_screen_x(unsigned int world_x)
;   off = world_x - cam_x; if borrow (world_x<cam_x) or hi(off)!=0 (off>=256) ->
;   0xFF, else lo(off). (SCREEN_W_PX == 256.)
.proc _world_to_screen_x            ; A=lo(world_x), X=hi(world_x)
    sec
    sbc _cam_x
    sta tmp1
    txa
    sbc _cam_x+1                    ; carry = (world_x >= cam_x); A = hi(off)
    bcc @off                       ; borrow -> world_x < cam_x -> off-screen
    bne @off                       ; hi(off) != 0 -> off >= 256 -> off-screen
    lda tmp1
    rts
@off:
    lda #$FF
    rts
.endproc

; unsigned char world_to_screen_y(unsigned int world_y)
;   Same, but SCREEN_H_PX == 240, so the ">= 240" test is an explicit compare.
.proc _world_to_screen_y            ; A=lo(world_y), X=hi(world_y)
    sec
    sbc _cam_y
    sta tmp1
    txa
    sbc _cam_y+1                    ; carry = (world_y >= cam_y); A = hi(off)
    bcc @off                       ; world_y < cam_y
    bne @off                       ; hi(off) != 0 -> >= 256 -> off-screen
    lda tmp1
    cmp #240                       ; off >= 240 ?
    bcs @off
    rts                            ; A already holds off (< 240)
@off:
    lda #$FF
    rts
.endproc
