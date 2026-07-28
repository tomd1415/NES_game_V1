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
.if SCROLL_COMPRESSED
.import _bg_col_index, _bg_col_data
.else
.import _bg_world_tiles
.endif
.importzp ptr1

.if SCROLL_COMPRESSED
; dedup_col_ptr — A = unique-column id -> ptr1 = bg_col_data + uid*BG_WORLD_ROWS.
; Column-deduplicated worlds are always 1-tall (BG_WORLD_ROWS == 30), so
; uid*30 = uid*32 - uid*2.  Clobbers A, tmp2, tmp4; preserves X, Y, tmp1, tmp3.
.proc dedup_col_ptr
    sta tmp2                     ; save uid
    lda #0
    sta tmp4                     ; hi accumulator
    lda tmp2                     ; uid*32 -> tmp4:A
    asl a
    rol tmp4
    asl a
    rol tmp4
    asl a
    rol tmp4
    asl a
    rol tmp4
    asl a
    rol tmp4
    sta ptr1
    lda tmp4
    sta ptr1+1                   ; ptr1 = uid*32
    lda tmp2                     ; uid*2 -> tmp4:tmp2
    asl a
    sta tmp2
    lda #0
    adc #0
    sta tmp4
    lda ptr1                     ; ptr1 = uid*32 - uid*2 = uid*30
    sec
    sbc tmp2
    sta ptr1
    lda ptr1+1
    sbc tmp4
    sta ptr1+1
    lda ptr1                     ; ptr1 += bg_col_data
    clc
    adc #<_bg_col_data
    sta ptr1
    lda ptr1+1
    adc #>_bg_col_data
    sta ptr1+1
    rts
.endproc
.endif
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
.if SCROLL_COMPRESSED
    ; Wide compressed world: 16-bit bound, then dedup column fetch.  tmp1 (col
    ; lo) is preserved through dedup_col_ptr for the col_addr math below.
    lda tmp2                     ; col >= BG_WORLD_COLS -> out
    cmp #>BG_WORLD_COLS
    bcc @col_in
    bne @col_done
    lda tmp1
    cmp #<BG_WORLD_COLS
    bcs @col_done
@col_in:
    lda #<_bg_col_index          ; uid = bg_col_index[col]  (col = tmp2:tmp1)
    clc
    adc tmp1
    sta ptr1
    lda #>_bg_col_index
    adc tmp2
    sta ptr1+1
    ldy #0
    lda (ptr1),y                 ; A = uid
    jsr dedup_col_ptr            ; ptr1 = bg_col_data + uid*30
    ldy #0
@col_loop:
    lda (ptr1),y                 ; col_buf[0..29] = the unique column (contiguous)
    sta _col_buf,y
    iny
    cpy #30
    bne @col_loop
.else
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
.endif
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

; void scroll_init(void) — zero the camera + streamer baseline. Trivial; ships
; under NES_ASM_SCROLL so the scroll subsystem's init is hand-written too.
.export _scroll_init
.import _prev_cam_x, _prev_cam_y
.proc _scroll_init
    lda #0
    sta _cam_x
    sta _cam_x+1
    sta _cam_y
    sta _cam_y+1
    sta _prev_cam_x
    sta _prev_cam_x+1
    sta _prev_cam_y
    sta _prev_cam_y+1
    rts
.endproc

; void scroll_stream(void) — the in-vblank column/row burst. Unrolled (.repeat)
; to stay inside the NTSC vblank budget: a loop would spill past line 261's T->V
; copy and ghost-flash. Column path +32 stride, row path +1 stride, then reset
; stride to +1. Gated per axis like the C. col_buf/col_addr/col_pending +
; row_buf/row_addr/row_pending are already .imported by scroll_stream_prepare.
.export _scroll_stream
PPU_ADDR2 = $2006
PPU_DATA2 = $2007
.proc _scroll_stream
.if BG_WORLD_COLS > 32
    lda _col_pending
    bne @docol
    jmp @nocol
@docol:
    lda #$14                    ; PPU_CTRL_BASE | +32 stride
    sta PPU_CTRL
.if SCROLL_SKIP_TOP > 0
    ; Skip the top SCROLL_SKIP_TOP rows so the SMB bg status strip (rows 0-3) is
    ; never overwritten as the level scrolls.  Start the column at row SKIP.
    clc
    lda _col_addr
    adc #<(SCROLL_SKIP_TOP * 32)
    tax
    lda _col_addr+1
    adc #>(SCROLL_SKIP_TOP * 32)
    sta PPU_ADDR2               ; hi
    stx PPU_ADDR2               ; lo
    .repeat (30 - SCROLL_SKIP_TOP), i
      lda _col_buf + SCROLL_SKIP_TOP + i
      sta PPU_DATA2
    .endrepeat
.else
    lda _col_addr+1
    sta PPU_ADDR2
    lda _col_addr
    sta PPU_ADDR2
    .repeat 30, i
      lda _col_buf+i
      sta PPU_DATA2
    .endrepeat
.endif
    lda #0
    sta _col_pending
@nocol:
.endif
.if BG_WORLD_ROWS > 30
    lda _row_pending
    bne @dorow
    jmp @norow
@dorow:
    lda #$10                    ; PPU_CTRL_BASE | +1 stride
    sta PPU_CTRL
    lda _row_addr+1
    sta PPU_ADDR2
    lda _row_addr
    sta PPU_ADDR2
    .repeat 32, i
      lda _row_buf+i
      sta PPU_DATA2
    .endrepeat
    lda #0
    sta _row_pending
@norow:
.endif
    lda #$10                    ; leave stride at +1 for later PPU_DATA writers
    sta PPU_CTRL
    rts
.endproc

; void load_world_bg(void) — boot-time nametable + attribute fill (rendering off,
; so no vblank timing). Loads n_screens_x * n_screens_y screens (1 or 2 per axis
; by BG_WORLD_COLS/ROWS) from bg_world_tiles/attrs into NT0/1/2, with running
; source pointers (no per-cell multiply) and MULC-free constant offsets. Verified
; by the corpus nametable comparison. Finishes scroll.c on ASM.
.if BG_WORLD_COLS > 32
  .define NSX_VAL 2
.else
  .define NSX_VAL 1
.endif
.if BG_WORLD_ROWS > 30
  .define NSY_VAL 2
.else
  .define NSY_VAL 1
.endif
.export _load_world_bg
.import _bg_world_attrs
.segment "BSS"
lwb_sx:   .res 1
lwb_sy:   .res 1
lwb_rr:   .res 1
lwb_nthi: .res 1
.segment "CODE"
.proc _load_world_bg
    lda #$10
    sta PPU_CTRL                 ; +1 stride
    lda #0
    sta lwb_sy
@sy:
    lda lwb_sy
    cmp #NSY_VAL
    bcc @sybody
    jmp @done
@sybody:
    lda #0
    sta lwb_sx
@sx:
    lda lwb_sx
    cmp #NSX_VAL
    bcc @sxbody
    jmp @sxnext
@sxbody:
    lda #$20                     ; nt_base hi = 0x20 + (sx?4) + (sy?8)
    ldx lwb_sx
    beq @nsx
    clc
    adc #$04
@nsx:
    ldx lwb_sy
    beq @nsy
    clc
    adc #$08
@nsy:
    sta lwb_nthi
    ; --- tiles ---
.if SCROLL_COMPRESSED
    ; Compressed (1-tall): fill this screen's 32 columns from the dedup data,
    ; column by column with a +32 PPU stride (each write walks down one column).
    lda #$14                     ; +32 auto-increment
    sta PPU_CTRL
    ldx #0                       ; x = column within this screen (0..31)
@ctcol:
    lda lwb_nthi                 ; PPU addr = nt_base(hi) : x  (top of column x)
    sta PPU_ADDR2
    stx PPU_ADDR2                ; lo = x
    lda lwb_sx                   ; world col = lwb_sx*32 + x
    asl a
    asl a
    asl a
    asl a
    asl a
    stx tmp1
    clc
    adc tmp1
    tay
    lda _bg_col_index,y          ; uid = bg_col_index[world col]
    jsr dedup_col_ptr            ; ptr1 = bg_col_data + uid*30
    ldy #0
@ctrow:
    lda (ptr1),y                 ; write 30 tiles down the column (+32 stride)
    sta PPU_DATA2
    iny
    cpy #30
    bne @ctrow
    inx
    cpx #32
    bne @ctcol
    lda #$10                     ; back to +1 stride for the attr fill
    sta PPU_CTRL
.else
    ; --- raw: ptr1 = bg_world_tiles + sy*30*BG_WORLD_COLS + sx*32 ---
    lda #<_bg_world_tiles
    sta ptr1
    lda #>_bg_world_tiles
    sta ptr1+1
    lda lwb_sy
    beq @tnosy
    clc
    lda ptr1
    adc #<(30*BG_WORLD_COLS)
    sta ptr1
    lda ptr1+1
    adc #>(30*BG_WORLD_COLS)
    sta ptr1+1
@tnosy:
    lda lwb_sx
    beq @tnosx
    clc
    lda ptr1
    adc #32
    sta ptr1
    lda ptr1+1
    adc #0
    sta ptr1+1
@tnosx:
    lda #0
    sta lwb_rr
@trow:
    lda lwb_rr                   ; PPU addr = nt_base + rr*32
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
    rol tmp2                     ; tmp2:tmp1 = rr*32
    lda lwb_nthi
    clc
    adc tmp2
    sta PPU_ADDR2                ; hi
    lda tmp1
    sta PPU_ADDR2                ; lo
    ldy #0
@tcol:
    lda (ptr1),y
    sta PPU_DATA2
    iny
    cpy #32
    bne @tcol
    lda ptr1                     ; ptr1 += BG_WORLD_COLS (next painted row)
    clc
    adc #<BG_WORLD_COLS
    sta ptr1
    lda ptr1+1
    adc #>BG_WORLD_COLS
    sta ptr1+1
    inc lwb_rr
    lda lwb_rr
    cmp #30
    beq @tdone
    jmp @trow
.endif
@tdone:
    ; --- attrs: ptr1 = bg_world_attrs + sy*8*BG_WORLD_ATTR_COLS + sx*8 ---
    lda #<_bg_world_attrs
    sta ptr1
    lda #>_bg_world_attrs
    sta ptr1+1
    lda lwb_sy
    beq @anosy
    clc
    lda ptr1
    adc #<(8*BG_WORLD_ATTR_COLS)
    sta ptr1
    lda ptr1+1
    adc #>(8*BG_WORLD_ATTR_COLS)
    sta ptr1+1
@anosy:
    lda lwb_sx
    beq @anosx
    clc
    lda ptr1
    adc #8
    sta ptr1
    lda ptr1+1
    adc #0
    sta ptr1+1
@anosx:
    lda #0
    sta lwb_rr
@arow:
    lda lwb_rr                   ; PPU addr = nt_base + 0x3C0 + rr*8
    asl a
    asl a
    asl a
    clc
    adc #$C0
    sta tmp1                     ; lo (0xC0..0xF8)
    lda lwb_nthi
    clc
    adc #$03
    sta PPU_ADDR2                ; hi
    lda tmp1
    sta PPU_ADDR2                ; lo
    ldy #0
@acol:
    lda (ptr1),y
    sta PPU_DATA2
    iny
    cpy #8
    bne @acol
    lda ptr1                     ; ptr1 += BG_WORLD_ATTR_COLS
    clc
    adc #<BG_WORLD_ATTR_COLS
    sta ptr1
    lda ptr1+1
    adc #>BG_WORLD_ATTR_COLS
    sta ptr1+1
    inc lwb_rr
    lda lwb_rr
    cmp #8
    beq @adone
    jmp @arow
@adone:
    inc lwb_sx
    jmp @sx
@sxnext:
    inc lwb_sy
    jmp @sy
@done:
    lda #0
    sta _prev_cam_x
    sta _prev_cam_x+1
    sta _prev_cam_y
    sta _prev_cam_y+1
    rts
.endproc
