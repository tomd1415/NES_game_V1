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
; All scroll functions here are safe for any scroll project: world_to_screen_x/y,
; scroll_follow, scroll_apply_ppu bake only NES-fixed constants (256/240) and read
; runtime globals; scroll_stream_prepare (Phase 1) now reads BG_WORLD_COLS/ROWS
; from project.inc + conditionally assembles the vertical row path, so it too is
; general — the whole scroll set ships under NES_ASM_SCROLL.

.include "project.inc"
.include "asm_macros.inc"

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

; void scroll_stream_prepare(void) — GENERALISED column + (BG_WORLD_ROWS>30) row
; streamer. Reads BG_WORLD_COLS/ROWS from project.inc. Column path serves any
; world width (stride = a 16-bit +BG_WORLD_COLS add; col bound = BG_WORLD_COLS);
; the row path is conditionally assembled only for vertically-scrolling worlds.
; Proven in asm-lab/functions/scroll_stream_prepare (parameterised).
.export _scroll_stream_prepare
.import _bg_world_tiles
.importzp ptr1
.if BG_WORLD_COLS > 32
.import _prev_cam_x, _col_buf, _col_addr, _col_pending
.endif
.if BG_WORLD_ROWS > 30
.import _prev_cam_y, _row_buf, _row_addr, _row_pending
.endif
.proc _scroll_stream_prepare
.if BG_WORLD_COLS > 32
    ; ---------- horizontal column path ----------
    lda #0
    sta _col_pending
    lda _cam_x                  ; boundary crossed? diff in any bit >= 3
    eor _prev_cam_x
    and #$F8
    sta tmp1
    lda _cam_x+1
    eor _prev_cam_x+1
    ora tmp1
    bne @col_cross
    jmp @col_done               ; no 8-px boundary crossed this frame
@col_cross:
    lda _cam_x                  ; cam_x - prev_cam_x: borrow => moving left
    cmp _prev_cam_x
    lda _cam_x+1
    sbc _prev_cam_x+1
    bcc @col_left
    lda _prev_cam_x             ; right: prev_cam_x += 8
    clc
    adc #8
    sta _prev_cam_x
    lda _prev_cam_x+1
    adc #0
    sta _prev_cam_x+1
    lda _prev_cam_x             ; col = (prev_cam_x + 248) >> 3
    clc
    adc #248
    sta tmp1
    lda _prev_cam_x+1
    adc #0
    sta tmp2
    jmp @col_shr3
@col_left:
    lda _prev_cam_x             ; left: prev_cam_x -= 8
    sec
    sbc #8
    sta _prev_cam_x
    lda _prev_cam_x+1
    sbc #0
    sta _prev_cam_x+1
    lda _prev_cam_x             ; col = prev_cam_x >> 3
    sta tmp1
    lda _prev_cam_x+1
    sta tmp2
@col_shr3:
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp2
    bne @col_done               ; col >= 256 -> out
.if BG_WORLD_COLS < 256
    lda tmp1
    cmp #<BG_WORLD_COLS
    bcs @col_done               ; col >= BG_WORLD_COLS -> out
.endif
    lda #<_bg_world_tiles       ; ptr1 = bg_world_tiles + col
    clc
    adc tmp1
    sta ptr1
    lda #>_bg_world_tiles
    adc #0
    sta ptr1+1
    ldy #0
    ldx #0
@col_loop:
    lda (ptr1),y                ; col_buf[rr] = *(ptr1); ptr1 += BG_WORLD_COLS
    sta _col_buf,x
    lda ptr1
    clc
    adc #<BG_WORLD_COLS
    sta ptr1
    lda ptr1+1
    adc #>BG_WORLD_COLS
    sta ptr1+1
    inx
    cpx #30
    bne @col_loop
    lda tmp1                    ; col_addr = (col&0x20?0x2400:0x2000) + (col&0x1F)
    and #$1F
    sta _col_addr
    lda tmp1
    and #$20
    beq @col_nt0
    lda #$24
    bne @col_sethi
@col_nt0:
    lda #$20
@col_sethi:
    sta _col_addr+1
    lda #1
    sta _col_pending
@col_done:
.endif  ; BG_WORLD_COLS > 32

.if BG_WORLD_ROWS > 30
    ; ---------- vertical row path (tall worlds only) ----------
    lda #0
    sta _row_pending
    lda _cam_y
    eor _prev_cam_y
    and #$F8
    sta tmp1
    lda _cam_y+1
    eor _prev_cam_y+1
    ora tmp1
    bne @row_cross
    jmp @row_done               ; no 8-px vertical boundary crossed
@row_cross:
    lda _cam_y
    cmp _prev_cam_y
    lda _cam_y+1
    sbc _prev_cam_y+1
    bcc @row_up
    lda _prev_cam_y             ; down: prev_cam_y += 8 ; row = (prev_cam_y+232)>>3
    clc
    adc #8
    sta _prev_cam_y
    lda _prev_cam_y+1
    adc #0
    sta _prev_cam_y+1
    lda _prev_cam_y
    clc
    adc #232                    ; SCREEN_H_PX - 8
    sta tmp1
    lda _prev_cam_y+1
    adc #0
    sta tmp2
    jmp @row_shr3
@row_up:
    lda _prev_cam_y             ; up: prev_cam_y -= 8 ; row = prev_cam_y >> 3
    sec
    sbc #8
    sta _prev_cam_y
    lda _prev_cam_y+1
    sbc #0
    sta _prev_cam_y+1
    lda _prev_cam_y
    sta tmp1
    lda _prev_cam_y+1
    sta tmp2
@row_shr3:
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp2
    beq @row_hi_ok
    jmp @row_done               ; row >= 256 -> out
@row_hi_ok:
    lda tmp1
    cmp #BG_WORLD_ROWS
    bcc @row_in                 ; row < BG_WORLD_ROWS -> stream it
    jmp @row_done               ; row >= BG_WORLD_ROWS -> out
@row_in:
    sta tmp3                     ; row (0..BG_WORLD_ROWS-1)
    ; ptr1 = bg_world_tiles + row*BG_WORLD_COLS
    lda tmp3
    MULC ptr1, BG_WORLD_COLS
    clc
    lda ptr1
    adc #<_bg_world_tiles
    sta ptr1
    lda ptr1+1
    adc #>_bg_world_tiles
    sta ptr1+1
    ldy #0
    ldx #0
@row_loop:
    lda (ptr1),y                ; row_buf[cc] = *(ptr1++), 32 tiles
    sta _row_buf,x
    inc ptr1
    bne @row_nc
    inc ptr1+1
@row_nc:
    inx
    cpx #32
    bne @row_loop
    ; row_addr: row<30 -> 0x2000 + row*32 ; else 0x2800 + (row-30)*32
    lda tmp3
    cmp #30
    bcs @row_lower
    ; upper band: base 0x2000, index row*32
    lda tmp3
    jsr @row_x32                 ; ptr2? -> use tmp1:tmp2 = row*32
    lda tmp1
    sta _row_addr
    lda tmp2
    clc
    adc #$20
    sta _row_addr+1
    jmp @row_have_addr
@row_lower:
    sec
    lda tmp3
    sbc #30
    jsr @row_x32
    lda tmp1
    sta _row_addr
    lda tmp2
    clc
    adc #$28
    sta _row_addr+1
@row_have_addr:
    lda #1
    sta _row_pending
@row_done:
.endif
    rts

.if BG_WORLD_ROWS > 30
; helper: tmp2:tmp1 = A * 32  (A < 60, so 16-bit)
@row_x32:
    sta tmp1
    lda #0
    sta tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    rts
.endif
.endproc
