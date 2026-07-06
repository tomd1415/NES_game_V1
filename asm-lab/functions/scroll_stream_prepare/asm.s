; scroll_stream_prepare candidate — hand-written 6502, horizontal column path,
; specialised to BG_WORLD_COLS=64 / SCREEN_W_PX=256 (like the engine twin).
;
; Detects an 8-px tile-boundary crossing between prev_cam_x and cam_x, steps
; prev_cam_x one tile toward cam_x, and — if the exposed column is in-world —
; copies bg_world_tiles[rr*64 + col] for rr=0..29 into col_buf (a constant +64
; stride pointer walk, the whole point of the ASM: no cc65 per-iteration 16-bit
; index multiply), then sets col_addr + col_pending.
.export _ssp_asm
.import _cam_x, _prev_cam_x, _col_buf, _col_addr, _col_pending, _bg_world_tiles
.importzp tmp1, tmp2, ptr1
.segment "CODE"

.proc _ssp_asm
    lda #0
    sta _col_pending
    ; boundary crossed?  (cam_x>>3) != (prev_cam_x>>3)  <=>  diff in any bit >=3
    lda _cam_x
    eor _prev_cam_x
    and #$F8
    sta tmp1
    lda _cam_x+1
    eor _prev_cam_x+1
    ora tmp1
    bne @crossed
    rts                         ; same tile column -> nothing to stream
@crossed:
    ; direction: cam_x - prev_cam_x, borrow => cam_x < prev_cam_x (moving left)
    lda _cam_x
    cmp _prev_cam_x
    lda _cam_x+1
    sbc _prev_cam_x+1
    bcc @left
    ; --- moving right: prev_cam_x += 8 ; col = (prev_cam_x + 248) >> 3 ---
    lda _prev_cam_x
    clc
    adc #8
    sta _prev_cam_x
    lda _prev_cam_x+1
    adc #0
    sta _prev_cam_x+1
    lda _prev_cam_x
    clc
    adc #248                    ; SCREEN_W_PX - 8
    sta tmp1
    lda _prev_cam_x+1
    adc #0
    sta tmp2
    jmp @shr3
@left:
    ; --- moving left: prev_cam_x -= 8 ; col = prev_cam_x >> 3 ---
    lda _prev_cam_x
    sec
    sbc #8
    sta _prev_cam_x
    lda _prev_cam_x+1
    sbc #0
    sta _prev_cam_x+1
    lda _prev_cam_x
    sta tmp1
    lda _prev_cam_x+1
    sta tmp2
@shr3:
    ; col (tmp2:tmp1) >>= 3
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    ; in-world?  col < 64
    lda tmp2
    bne @done                   ; col >= 256
    lda tmp1
    cmp #64
    bcs @done                   ; col >= 64 -> outside the painted world
    ; --- copy 30 tiles: ptr1 = bg_world_tiles + col, stride +64 ---
    lda #<_bg_world_tiles
    clc
    adc tmp1                    ; + col (0..63)
    sta ptr1
    lda #>_bg_world_tiles
    adc #0
    sta ptr1+1
    ldy #0
    ldx #0                      ; rr
@cploop:
    lda (ptr1),y
    sta _col_buf,x
    lda ptr1
    clc
    adc #64
    sta ptr1
    bcc @nocarry
    inc ptr1+1
@nocarry:
    inx
    cpx #30
    bne @cploop
    ; --- col_addr = ((col&0x20)?0x2400:0x2000) + (col&0x1F) ---
    lda tmp1
    and #$1F
    sta _col_addr               ; low byte
    lda tmp1
    and #$20
    beq @nt0
    lda #$24
    bne @sethi                  ; always taken
@nt0:
    lda #$20
@sethi:
    sta _col_addr+1
    lda #1
    sta _col_pending
@done:
    rts
.endproc
