; main_special_asm.s — hand-written 6502 for the main.c helpers that are NOT part
; of the universal ship-safe set. Linked ONLY when NES_ASM_SPECIALIZED=1
; (direct/lab builds), NOT by the server default:
;   - advance_animation bakes PLAYER_TILES_PER_FRAME==4 (per-project).
;   - draw_text / clear_text_row bake this build's SCROLL_BUILD framing (they
;     jsr _scroll_apply_ppu, which only exists in scroll builds) and are dead
;     code in the shipped engine anyway.
; All three proven in asm-lab (advance_animation / draw_text / clear_text_row).
.export _draw_text
.export _clear_text_row
.export _advance_animation
.import _waitvsync
.import _scroll_apply_ppu
.import _anim_mode, _anim_prev_mode, _anim_frame, _anim_tick
.import _anim_frame_count, _anim_frame_ticks, _anim_base
.import incsp2
.importzp sp, ptr1, tmp1, tmp2, tmp3

PPU_MASK   = $2001
PPU_ADDR   = $2006
PPU_DATA   = $2007

.segment "CODE"

; void draw_text(unsigned char row, unsigned char col, const unsigned char *text)
.proc _draw_text                ; A/X = text ; (sp),0 = col, (sp),1 = row
    pha
    txa
    pha
    jsr _waitvsync
    lda #0
    sta PPU_MASK
    ldy #1
    lda (sp),y
    sta tmp2
    lsr
    lsr
    lsr
    sta tmp3
    lda tmp2
    and #$07
    asl
    asl
    asl
    asl
    asl
    ldy #0
    clc
    adc (sp),y
    sta tmp1
    lda tmp3
    adc #$20
    sta PPU_ADDR
    lda tmp1
    sta PPU_ADDR
    pla
    sta ptr1+1
    pla
    sta ptr1
    ldy #0
@loop:
    lda (ptr1),y
    beq @done
    sta PPU_DATA
    iny
    bne @loop
@done:
    jsr _scroll_apply_ppu
    lda #$1E
    sta PPU_MASK
    jmp incsp2
.endproc

; void clear_text_row(unsigned char row, unsigned char col, unsigned char width)
.proc _clear_text_row           ; A = width ; (sp),0 = col, (sp),1 = row
    pha
    jsr _waitvsync
    lda #0
    sta PPU_MASK
    ldy #1
    lda (sp),y
    sta tmp2
    lsr
    lsr
    lsr
    sta tmp3
    lda tmp2
    and #$07
    asl
    asl
    asl
    asl
    asl
    ldy #0
    clc
    adc (sp),y
    sta tmp1
    lda tmp3
    adc #$20
    sta PPU_ADDR
    lda tmp1
    sta PPU_ADDR
    pla
    tax
    beq @done
    lda #0
@wloop:
    sta PPU_DATA
    dex
    bne @wloop
@done:
    jsr _scroll_apply_ppu
    lda #$1E
    sta PPU_MASK
    jmp incsp2
.endproc

; void advance_animation(void) — anim_base = anim_frame << 2 (PLAYER_TILES_PER_FRAME==4)
.proc _advance_animation
    lda _anim_mode
    cmp _anim_prev_mode
    beq @same
    lda #0
    sta _anim_frame
    sta _anim_tick
    lda _anim_mode
    sta _anim_prev_mode
@same:
    lda _anim_frame_count
    cmp #2
    bcc @base
    inc _anim_tick
    lda _anim_tick
    cmp _anim_frame_ticks
    bcc @base
    lda #0
    sta _anim_tick
    inc _anim_frame
    lda _anim_frame
    cmp _anim_frame_count
    bcc @base
    lda #0
    sta _anim_frame
@base:
    lda _anim_frame
    asl
    sta _anim_base
    lda #0
    rol
    sta _anim_base+1
    asl _anim_base
    rol _anim_base+1
    rts
.endproc
