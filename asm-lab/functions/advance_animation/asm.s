; advance_animation candidate — hand-written 6502 of the main-loop anim state
; machine. Same engine-owned anim_* globals; PLAYER_TILES_PER_FRAME baked to 4
; (anim_base = anim_frame << 2, kept 16-bit since frame<<2 can exceed 255).
.export _advance_asm
.import _anim_mode, _anim_prev_mode, _anim_frame, _anim_tick
.import _anim_frame_count, _anim_frame_ticks, _anim_base
.segment "CODE"

.proc _advance_asm
    ; if (anim_mode != anim_prev_mode) { frame=0; tick=0; prev_mode=mode; }
    lda _anim_mode
    cmp _anim_prev_mode
    beq @same
    lda #0
    sta _anim_frame
    sta _anim_tick
    lda _anim_mode
    sta _anim_prev_mode
@same:
    ; if (anim_frame_count > 1) { advance tick/frame }
    lda _anim_frame_count
    cmp #2
    bcc @base                   ; count < 2 -> no animation, skip to anim_base
    inc _anim_tick
    lda _anim_tick
    cmp _anim_frame_ticks
    bcc @base                   ; tick < frame_ticks -> not time yet
    lda #0
    sta _anim_tick
    inc _anim_frame
    lda _anim_frame
    cmp _anim_frame_count
    bcc @base                   ; frame < frame_count -> keep
    lda #0
    sta _anim_frame             ; wrap to first frame
@base:
    ; anim_base = anim_frame << 2  (16-bit)
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
