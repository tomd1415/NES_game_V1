; scroll_special_asm.s — hand-written 6502 for the *dimension-specialised* scroll
; function. Linked ONLY when NES_ASM_SPECIALIZED=1 (direct/lab builds), NOT by the
; server-shipped default, because it bakes this fixture's world shape.
;
; scroll_stream_prepare: horizontal column path, specialised to BG_WORLD_COLS=64 /
; horizontal-only / SCREEN_W_PX=256. A vertical world (BG_WORLD_ROWS>30) or a
; different width needs the C body — hence it is gated separately from the
; universal NES_ASM_SCROLL set. Proven in asm-lab/functions/scroll_stream_prepare.
.export _scroll_stream_prepare
.import _cam_x, _prev_cam_x, _col_buf, _col_addr, _col_pending, _bg_world_tiles
.importzp tmp1, tmp2, ptr1
.segment "CODE"

.proc _scroll_stream_prepare
    lda #0
    sta _col_pending
    lda _cam_x                  ; boundary crossed? diff in any bit >= 3
    eor _prev_cam_x
    and #$F8
    sta tmp1
    lda _cam_x+1
    eor _prev_cam_x+1
    ora tmp1
    bne @crossed
    rts
@crossed:
    lda _cam_x                  ; cam_x - prev_cam_x: borrow => moving left
    cmp _prev_cam_x
    lda _cam_x+1
    sbc _prev_cam_x+1
    bcc @left
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
    jmp @shr3
@left:
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
@shr3:
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp2
    bne @done                   ; col >= 256
    lda tmp1
    cmp #64
    bcs @done                   ; col >= 64 -> outside the world
    lda #<_bg_world_tiles       ; ptr1 = bg_world_tiles + col
    clc
    adc tmp1
    sta ptr1
    lda #>_bg_world_tiles
    adc #0
    sta ptr1+1
    ldy #0
    ldx #0
@cploop:
    lda (ptr1),y                ; col_buf[rr] = *(ptr1); ptr1 += 64
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
    lda tmp1                    ; col_addr = (col&0x20?0x2400:0x2000) + (col&0x1F)
    and #$1F
    sta _col_addr
    lda tmp1
    and #$20
    beq @nt0
    lda #$24
    bne @sethi
@nt0:
    lda #$20
@sethi:
    sta _col_addr+1
    lda #1
    sta _col_pending
@done:
    rts
.endproc
