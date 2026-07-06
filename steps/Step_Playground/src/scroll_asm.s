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
; world_to_screen_x/y, scroll_follow and scroll_apply_ppu are hand-written here;
; the VRAM streamers (scroll_stream_prepare/scroll_stream/load_world_bg) are
; being converted next — see asm-lab/STATUS.md.

.export _world_to_screen_x
.export _world_to_screen_y
.import _cam_x, _cam_y
.importzp tmp1, tmp2, tmp3, tmp4

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

.export _scroll_follow
.import _scroll_max_cam_x, _scroll_max_cam_y
.import incsp2
.importzp sp
.segment "BSS"
sf_tx: .res 2
sf_ty: .res 2
sf_t:  .res 2
.segment "CODE"
.proc _scroll_follow            ; A/X = target_y ; (sp),0/1 = target_x
    sta sf_ty                    ; target_y
    stx sf_ty+1
    ldy #0
    lda (sp),y
    sta sf_tx                    ; target_x
    iny
    lda (sp),y
    sta sf_tx+1

    ; ---- HORIZONTAL: cam_x, target_x=sf_tx, max=_scroll_max_cam_x ----
    lda _scroll_max_cam_x
    ora _scroll_max_cam_x+1
    bne @h_active               ; max!=0 -> run horizontal
    jmp @h_done                 ; max==0 -> axis inactive (jmp: no branch range)
@h_active:
    lda _cam_x
    clc
    adc #96
    sta sf_t
    lda _cam_x+1
    adc #0
    sta sf_t+1                  ; dz_left = cam_x+96
    lda sf_tx
    cmp sf_t
    lda sf_tx+1
    sbc sf_t+1
    bcs @h_not_left             ; target_x >= dz_left
    lda sf_tx+1
    bne @h_tx96
    lda sf_tx
    cmp #96
    bcs @h_tx96
    lda #0                      ; target_x < 96 -> cam_x = 0
    sta _cam_x
    sta _cam_x+1
    jmp @h_done
@h_tx96:
    lda sf_tx                    ; cam_x = target_x - 96
    sec
    sbc #96
    sta _cam_x
    lda sf_tx+1
    sbc #0
    sta _cam_x+1
    jmp @h_done
@h_not_left:
    lda _cam_x
    clc
    adc #144
    sta sf_t
    lda _cam_x+1
    adc #0
    sta sf_t+1                  ; dz_right = cam_x+144
    lda sf_t
    cmp sf_tx
    lda sf_t+1
    sbc sf_tx+1
    bcs @h_done                 ; target_x <= dz_right -> deadzone
    lda sf_tx                    ; t = target_x - 144
    sec
    sbc #144
    sta sf_t
    lda sf_tx+1
    sbc #0
    sta sf_t+1
    lda _scroll_max_cam_x       ; t > max ?  (max < t)
    cmp sf_t
    lda _scroll_max_cam_x+1
    sbc sf_t+1
    bcs @h_store                ; max >= t -> use t
    lda _scroll_max_cam_x       ; clamp to max
    sta _cam_x
    lda _scroll_max_cam_x+1
    sta _cam_x+1
    jmp @h_done
@h_store:
    lda sf_t
    sta _cam_x
    lda sf_t+1
    sta _cam_x+1
@h_done:

    ; ---- VERTICAL: cam_y, target_y=sf_ty, max=_scroll_max_cam_y ----
    lda _scroll_max_cam_y
    ora _scroll_max_cam_y+1
    bne @v_active               ; max!=0 -> run vertical
    jmp @v_done                 ; max==0 -> axis inactive (jmp: no branch range)
@v_active:
    lda _cam_y
    clc
    adc #96
    sta sf_t
    lda _cam_y+1
    adc #0
    sta sf_t+1
    lda sf_ty
    cmp sf_t
    lda sf_ty+1
    sbc sf_t+1
    bcs @v_not_top
    lda sf_ty+1
    bne @v_ty96
    lda sf_ty
    cmp #96
    bcs @v_ty96
    lda #0
    sta _cam_y
    sta _cam_y+1
    jmp @v_done
@v_ty96:
    lda sf_ty
    sec
    sbc #96
    sta _cam_y
    lda sf_ty+1
    sbc #0
    sta _cam_y+1
    jmp @v_done
@v_not_top:
    lda _cam_y
    clc
    adc #144
    sta sf_t
    lda _cam_y+1
    adc #0
    sta sf_t+1
    lda sf_t
    cmp sf_ty
    lda sf_t+1
    sbc sf_ty+1
    bcs @v_done
    lda sf_ty
    sec
    sbc #144
    sta sf_t
    lda sf_ty+1
    sbc #0
    sta sf_t+1
    lda _scroll_max_cam_y
    cmp sf_t
    lda _scroll_max_cam_y+1
    sbc sf_t+1
    bcs @v_store
    lda _scroll_max_cam_y
    sta _cam_y
    lda _scroll_max_cam_y+1
    sta _cam_y+1
    jmp @v_done
@v_store:
    lda sf_t
    sta _cam_y
    lda sf_t+1
    sta _cam_y+1
@v_done:
    jmp incsp2
.endproc

; void scroll_apply_ppu(void)
;   Fold cam_y into a 0..239 scroll_y + vertical-band parity, pick the nametable
;   bits (cam_x bit 8 -> horizontal, band parity -> vertical), and stream the
;   three PPU registers. Also resets the auto-increment stride to +1 (bit 2 = 0
;   in PPU_CTRL_BASE) in case scroll_stream left it at +32. Proven equivalent to
;   the C in asm-lab/functions/scroll_apply_ppu (the lab redirects the three
;   stores to a RAM capture buffer; here they hit $2000/$2005/$2005).
.export _scroll_apply_ppu
.segment "CODE"
PPU_CTRL   = $2000
PPU_SCROLL = $2005
.proc _scroll_apply_ppu
    lda _cam_y
    sta tmp1                    ; cy lo
    lda _cam_y+1
    sta tmp2                    ; cy hi
    lda #0
    sta tmp3                    ; band parity (bit 0)
@bandloop:
    lda tmp2
    bne @sub                    ; hi != 0 -> cy >= 256 >= 240
    lda tmp1
    cmp #240
    bcc @banddone               ; cy < 240 -> reduced
@sub:
    lda tmp1
    sec
    sbc #240
    sta tmp1
    lda tmp2
    sbc #0
    sta tmp2
    lda tmp3
    eor #$01
    sta tmp3
    jmp @bandloop
@banddone:
    lda #$10                    ; PPU_CTRL_BASE (BG pattern table 1, +1 stride)
    sta tmp4
    lda _cam_x+1
    and #$01                    ; cam_x bit 8 -> horizontal nametable
    beq @noh
    lda tmp4
    ora #$01
    sta tmp4
@noh:
    lda tmp3
    and #$01                    ; band parity -> vertical nametable
    beq @nov
    lda tmp4
    ora #$02
    sta tmp4
@nov:
    lda tmp4
    sta PPU_CTRL
    lda _cam_x
    sta PPU_SCROLL              ; scroll_x = cam_x & 0xFF
    lda tmp1
    sta PPU_SCROLL             ; scroll_y = reduced cy (0..239, never 240..255)
    rts
.endproc
