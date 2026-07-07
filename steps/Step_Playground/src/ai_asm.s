; ai_asm.s — hand-written 6502 for the scene-sprite AI helpers (Phase 2b).
;
; Compiled + linked ONLY when NES_ASM_AI=1 (Makefile); the matching C body in the
; generated main.c (emitted by builder-modules.js) is then #ifdef'd out, so
; exactly one definition of bw_sprite_blocked links. Flag OFF (default) = this
; file is not built and the ROM is byte-identical to the pure-C engine.
;
; bw_sprite_blocked is the per-enemy collision probe the walker/chaser/flyer/
; patrol AIs call every frame. It is the exact twin of the C helper: probe the
; sprite's whole leading edge (in `dir`) against the SOLID_GROUND / WALL tiles via
; the shipped behaviour_at, returning 1 if any body cell is blocked (or the world
; edge is hit), else 0.

.include "project.inc"
.include "asm_macros.inc"

.export _bw_sprite_blocked
.export _ai_update
.import _behaviour_at
.import _ss_x, _ss_y, _ss_w, _ss_h
.import _ss_ai_type, _ss_ai_state, _ss_ai_speed, _ss_ai_aux, _ss_ai_home
.import _px, _py
.import pushax, pusha, incsp4
.importzp sp, tmp1, tmp2

BEH_SOLID = 1
BEH_WALL  = 2
AI_WALKER = 1
AI_CHASER = 2
AI_FLYER  = 3
AI_PATROL = 4

.segment "BSS"
bb_sx:   .res 1
bb_sy:   .res 1
bb_sw:   .res 1
bb_sh:   .res 1
bb_fix:  .res 1      ; the fixed coordinate (col for right/left, row for down/up)
bb_k:    .res 1      ; probe loop counter
bb_hi:   .res 1      ; probe loop end (inclusive)
bb_axis: .res 1      ; 0 -> behaviour_at(fix, k) ; 1 -> behaviour_at(k, fix)

.segment "CODE"

; unsigned char bw_sprite_blocked(unsigned char sx, unsigned char sy,
;                                 unsigned char sw, unsigned char sh,
;                                 unsigned char dir)
;   dir in A ; sx/sy/sw/sh at (sp),0..3. Returns 0/1 in A, pops 4 bytes (incsp4).
.proc _bw_sprite_blocked
    pha                          ; save dir
    ; cc65 pushes stack args left-to-right onto a downward stack, so the LAST arg
    ; sits at (sp),0: sh at (sp),0, sw at (sp),1, sy at (sp),2, sx at (sp),3.
    ldy #0
    lda (sp),y
    sta bb_sh
    iny
    lda (sp),y
    sta bb_sw
    iny
    lda (sp),y
    sta bb_sy
    iny
    lda (sp),y
    sta bb_sx
    pla                          ; dir
    beq dir_right                ; 0
    cmp #1
    beq dir_left
    cmp #2
    beq dir_down
    jmp dir_up                   ; 3 (else)

; ---- right (dir 0): fix = col = (sx + sw*8) >> 3 ; blocked if sx+sw*8 >= 255
dir_right:
    lda bb_sw
    asl
    asl
    asl                          ; sw*8 (<=56)
    clc
    adc bb_sx                    ; lo of (sx + sw*8)
    tax
    lda #0
    adc #0                       ; hi (carry)
    beq @lo
    jmp ret1                     ; hi != 0 -> >=256 -> blocked
@lo:
    cpx #255
    bcc @ok
    jmp ret1
@ok:
    txa
    lsr
    lsr
    lsr
    sta bb_fix
    lda #0
    sta bb_axis
    jmp range_y

; ---- left (dir 1): fix = col = (sx - 1) >> 3 ; blocked if sx == 0
dir_left:
    lda bb_sx
    bne @ok
    jmp ret1
@ok:
    sec
    sbc #1
    lsr
    lsr
    lsr
    sta bb_fix
    lda #0
    sta bb_axis
    jmp range_y

; ---- down (dir 2): fix = row = (sy + sh*8) >> 3 ; blocked if sy+sh*8 >= 240
dir_down:
    lda bb_sh
    asl
    asl
    asl                          ; sh*8
    clc
    adc bb_sy
    tax
    lda #0
    adc #0
    beq @lo
    jmp ret1
@lo:
    cpx #240
    bcc @ok
    jmp ret1
@ok:
    txa
    lsr
    lsr
    lsr
    sta bb_fix
    lda #1
    sta bb_axis
    jmp range_x

; ---- up (dir 3): fix = row = (sy - 1) >> 3 ; blocked if sy == 0
dir_up:
    lda bb_sy
    bne @ok
    jmp ret1
@ok:
    sec
    sbc #1
    lsr
    lsr
    lsr
    sta bb_fix
    lda #1
    sta bb_axis
    jmp range_x

; range over rows: k = sy>>3 ; hi = (sy + sh*8 - 1) >> 3  (16-bit intermediate)
range_y:
    lda bb_sy
    lsr
    lsr
    lsr
    sta bb_k
    lda bb_sh
    asl
    asl
    asl
    clc
    adc bb_sy
    sta tmp1
    lda #0
    adc #0
    sta tmp2                     ; (tmp2:tmp1) = sy + sh*8
    jmp minus1_shr3

; range over cols: k = sx>>3 ; hi = (sx + sw*8 - 1) >> 3
range_x:
    lda bb_sx
    lsr
    lsr
    lsr
    sta bb_k
    lda bb_sw
    asl
    asl
    asl
    clc
    adc bb_sx
    sta tmp1
    lda #0
    adc #0
    sta tmp2                     ; (tmp2:tmp1) = sx + sw*8
    ; fall through

; hi = ((tmp2:tmp1) - 1) >> 3
minus1_shr3:
    lda tmp1
    sec
    sbc #1
    sta tmp1
    lda tmp2
    sbc #0
    sta tmp2
    ldx #3
@sh:
    lsr tmp2
    ror tmp1
    dex
    bne @sh
    lda tmp1
    sta bb_hi
    ; fall through to probe

probe:
    lda bb_hi
    cmp bb_k
    bcc ret0                     ; hi < k -> no cell blocked -> return 0
    lda bb_axis
    bne @axis1
    ; axis 0: behaviour_at(fix, k)
    lda bb_fix
    ldx #0
    jsr pushax                   ; push col = fix
    lda bb_k
    ldx #0
    jsr _behaviour_at            ; row = k ; A = behaviour ; pops col
    jmp @check
@axis1:
    ; axis 1: behaviour_at(k, fix)
    lda bb_k
    ldx #0
    jsr pushax                   ; push col = k
    lda bb_fix
    ldx #0
    jsr _behaviour_at            ; row = fix
@check:
    cmp #BEH_SOLID
    beq ret1
    cmp #BEH_WALL
    beq ret1
    inc bb_k
    jmp probe

ret1:
    lda #1
    ldx #0
    jmp incsp4
ret0:
    lda #0
    ldx #0
    jmp incsp4
.endproc

; ---------------------------------------------------------------------------
; void ai_update(void) — Phase 2b generic AI dispatch loop.
;   for (i=0; i<NUM_STATIC_SPRITES; i++) dispatch on ss_ai_type[i]:
;     1 walker  — dir in ss_ai_state[i]; reverse at a bw_sprite_blocked edge,
;                 else step by ss_ai_speed[i].
;     2 chaser  — seek px/py on X then Y, probing 1px ahead each axis.
;     3 flyer   — hover ±20px around ss_ai_home[i] in Y (dir in ss_ai_state[i],
;                 offset in ss_ai_aux[i]), drift toward px in X (no wall probe).
;     4 patrol  — back-and-forth over ±40px; dir in ss_ai_state[i], signed
;                 offset in ss_ai_aux[i].
; Each is the exact twin of its per-instance C block. Types the ASM does NOT own
; (0/none, goomba/koopa) keep their still-emitted C — no cross-sprite AI
; dependency, so ASM-handled-then-C-others == the interleaved all-C order.
; ---------------------------------------------------------------------------

.segment "BSS"
au_i: .res 1
; chaser working set (16-bit position/target; hi=0 when not SS_POS_WIDE)
ch_p_lo: .res 1     ; ss_?[i]  low
ch_p_hi: .res 1     ; ss_?[i]  high
ch_t_lo: .res 1     ; px / py  low
ch_t_hi: .res 1     ; px / py  high
ch_s:    .res 1     ; ss_ai_speed[i]

.segment "CODE"

.proc _ai_update
    lda #0
    sta au_i
loop:
    lda au_i
    cmp #NUM_STATIC_SPRITES
    bcc @go
    rts
@go:
    tax
    lda _ss_ai_type,x
    cmp #AI_WALKER
    beq walker
    cmp #AI_CHASER
    bne @not_chaser             ; chaser body is far -> reach it via jmp
    jmp chaser
@not_chaser:
    cmp #AI_FLYER
    bne @not_flyer              ; flyer body is far -> reach it via jmp
    jmp flyer
@not_flyer:
    cmp #AI_PATROL
    beq patrol
    jmp next
walker:
    lda _ss_ai_state,x
    bmi moving_left              ; dir < 0 -> moving left
    ; moving right (dir > 0): probe the right leading edge (dir 0)
    lda #0
    jsr probe
    beq step_right
    ldx au_i                    ; blocked -> reverse
    lda #$FF
    sta _ss_ai_state,x
    jmp next
step_right:
    jsr add_speed
    jmp next
moving_left:
    lda #1                      ; probe the left leading edge (dir 1)
    jsr probe
    beq step_left
    ldx au_i
    lda #1
    sta _ss_ai_state,x
    jmp next
step_left:
    jsr sub_speed
    jmp next
; patrol: back-and-forth over ±40px. state = pdir (±1), aux = poff (signed).
;   pdir>0: ss_x += speed; poff += speed; if poff >= 40 pdir = -1
;   pdir<0: ss_x -= speed; poff -= speed; if poff <= -40 pdir = 1
patrol:
    lda _ss_ai_state,x
    bmi patrol_left
    jsr add_speed
    ldx au_i
    lda _ss_ai_aux,x
    clc
    adc _ss_ai_speed,x
    sta _ss_ai_aux,x
    sec
    sbc #40                     ; poff - 40 (signed); >= 0 -> flip
    bpl @flip                   ; poff >= 40 -> reverse (next is far -> jmp)
    jmp next                    ; poff < 40 -> keep going
@flip:
    ldx au_i
    lda #$FF
    sta _ss_ai_state,x
    jmp next
patrol_left:
    jsr sub_speed
    ldx au_i
    lda _ss_ai_aux,x
    sec
    sbc _ss_ai_speed,x
    sta _ss_ai_aux,x
    clc
    adc #40                     ; poff + 40 (signed); <= 0 -> flip
    beq patrol_flip
    bmi patrol_flip
    jmp next
patrol_flip:
    ldx au_i
    lda #1
    sta _ss_ai_state,x
    jmp next
; chaser: seek the player on X then Y, probing 1px ahead before each step.
;   if (ss_y[i] >= 0xEF) skip           ; defeated actor parked off-screen
;   X: if (ss_x+spd <= px) { if(!blk(0)) ss_x+=spd }
;      else if (ss_x >= px+spd) { if(!blk(1)) ss_x-=spd }
;   Y: if (ss_y+spd <= py) { if(!blk(2)) ss_y+=spd }
;      else if (ss_y >= py+spd) { if(!blk(3)) ss_y-=spd }
; The compares are unsigned and can carry past 8 bits, so they run 16-bit (hi=0
; when not SS_POS_WIDE) — the exact twin of the C, which promotes u8 to int.
; X is resolved (and may store ss_x) before Y, so the Y probe reads the updated
; ss_x, matching the C statement order.
chaser:
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_y+1,y
    bne ch_skip                 ; ss_y >= 256 -> >= 0xEF -> defeated -> skip
    lda _ss_y,y
    cmp #$EF
    bcs ch_skip
.else
    ldx au_i
    lda _ss_y,x
    cmp #$EF
    bcs ch_skip                 ; ss_y >= 0xEF -> defeated -> skip
.endif
    ; --- X axis (target px, dirs 0=right / 1=left) ---
    jsr ch_load_x
    jsr ch_le                   ; C=1 iff ss_x+spd <= px
    bcc ch_x_left
    lda #0
    jsr probe
    bne ch_y                    ; blocked -> no X move
    jsr add_speed
    jmp ch_y
ch_x_left:
    jsr ch_ge                   ; C=1 iff ss_x >= px+spd
    bcc ch_y
    lda #1
    jsr probe
    bne ch_y
    jsr sub_speed
ch_y:
    ; --- Y axis (target py, dirs 2=down / 3=up) ---
    jsr ch_load_y
    jsr ch_le                   ; C=1 iff ss_y+spd <= py
    bcc ch_y_up
    lda #2
    jsr probe
    bne ch_skip
    jsr add_speed_y
    jmp ch_skip
ch_y_up:
    jsr ch_ge                   ; C=1 iff ss_y >= py+spd
    bcc ch_skip
    lda #3
    jsr probe
    bne ch_skip
    jsr sub_speed_y
ch_skip:
    jmp next
; flyer: hover ±20px around a fixed home-Y (state = fdir ±1, aux = foff signed),
; writing ss_y ABSOLUTELY from home+foff each frame (overrides scene gravity),
; and drift toward px in X with NO wall probe (flyers pass through). A defeated
; actor parked off-screen (ss_y >= 0xEF) is skipped so it stays parked. Exact
; twin of the C flyer block.
flyer:
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_y+1,y
    bne fly_skip                ; ss_y >= 256 -> >= 0xEF -> defeated -> skip
    lda _ss_y,y
    cmp #$EF
    bcs fly_skip
.else
    ldx au_i
    lda _ss_y,x
    cmp #$EF
    bcs fly_skip
.endif
    ; hover: update fdir (state) + foff (aux), flip at ±20
    ldx au_i
    lda _ss_ai_state,x
    bmi fly_down
    ; fdir > 0: foff += speed; if foff >= 20 fdir = -1
    lda _ss_ai_aux,x
    clc
    adc _ss_ai_speed,x
    sta _ss_ai_aux,x
    sec
    sbc #20                     ; foff - 20 (signed, no overflow); <0 -> keep
    bmi fly_apply
    ldx au_i
    lda #$FF
    sta _ss_ai_state,x
    jmp fly_apply
fly_down:
    ; fdir < 0: foff -= speed; if foff <= -20 fdir = 1
    lda _ss_ai_aux,x
    sec
    sbc _ss_ai_speed,x
    sta _ss_ai_aux,x
    clc
    adc #20                     ; foff + 20; <= 0 -> flip
    beq fly_flip
    bmi fly_flip
    jmp fly_apply
fly_flip:
    ldx au_i
    lda #1
    sta _ss_ai_state,x
fly_apply:
    jsr fly_set_y               ; ss_y[i] = home + foff (absolute, signed)
    ; X drift toward px — no probe (flyers pass through walls)
    jsr ch_load_x
    jsr ch_le                   ; C=1 iff ss_x+spd <= px
    bcc fly_x_left
    jsr add_speed
    jmp fly_skip
fly_x_left:
    jsr ch_ge                   ; C=1 iff ss_x >= px+spd
    bcc fly_skip
    jsr sub_speed
fly_skip:
    jmp next
next:
    inc au_i
    jmp loop
.endproc

; probe: A = dir. Calls bw_sprite_blocked(ss_x[i]&0xFF, ss_y[i]&0xFF, ss_w[i],
; ss_h[i], dir) — matching the C, which truncates the u16 positions to u8 for the
; probe. Pushes the 4 stack args L->R with pusha; returns A = 0/1.
.proc probe
    pha                         ; save dir
    ldx au_i
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_x,y                 ; low byte of ss_x[i]
.else
    lda _ss_x,x
.endif
    jsr pusha
    ldx au_i
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_y,y
.else
    lda _ss_y,x
.endif
    jsr pusha
    ldx au_i
    lda _ss_w,x
    jsr pusha
    ldx au_i
    lda _ss_h,x
    jsr pusha
    pla                         ; dir
    jsr _bw_sprite_blocked      ; A = 0/1 ; pops the 4 pushed bytes
    rts
.endproc

; ss_x[i] += ss_ai_speed[i]  (u8, or u16 when SS_POS_WIDE)
.proc add_speed
    ldx au_i
    lda _ss_ai_speed,x
    sta tmp1
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_x,y
    clc
    adc tmp1
    sta _ss_x,y
    lda _ss_x+1,y
    adc #0
    sta _ss_x+1,y
.else
    lda _ss_x,x
    clc
    adc tmp1
    sta _ss_x,x
.endif
    rts
.endproc

; ss_x[i] -= ss_ai_speed[i]
.proc sub_speed
    ldx au_i
    lda _ss_ai_speed,x
    sta tmp1
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_x,y
    sec
    sbc tmp1
    sta _ss_x,y
    lda _ss_x+1,y
    sbc #0
    sta _ss_x+1,y
.else
    lda _ss_x,x
    sec
    sbc tmp1
    sta _ss_x,x
.endif
    rts
.endproc

; ss_y[i] += ss_ai_speed[i]  (u8, or u16 when SS_POS_WIDE) — chaser Y descent
.proc add_speed_y
    ldx au_i
    lda _ss_ai_speed,x
    sta tmp1
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_y,y
    clc
    adc tmp1
    sta _ss_y,y
    lda _ss_y+1,y
    adc #0
    sta _ss_y+1,y
.else
    lda _ss_y,x
    clc
    adc tmp1
    sta _ss_y,x
.endif
    rts
.endproc

; ss_y[i] -= ss_ai_speed[i]  — chaser Y ascent
.proc sub_speed_y
    ldx au_i
    lda _ss_ai_speed,x
    sta tmp1
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_y,y
    sec
    sbc tmp1
    sta _ss_y,y
    lda _ss_y+1,y
    sbc #0
    sta _ss_y+1,y
.else
    lda _ss_y,x
    sec
    sbc tmp1
    sta _ss_y,x
.endif
    rts
.endproc

; ch_load_x / ch_load_y: fill the chaser working set for one axis.
;   ch_p = ss_x[i]/ss_y[i]  (16-bit, hi=0 when not wide)
;   ch_t = px/py            (16-bit)
;   ch_s = ss_ai_speed[i]
.proc ch_load_x
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_x,y
    sta ch_p_lo
    lda _ss_x+1,y
    sta ch_p_hi
    lda _px
    sta ch_t_lo
    lda _px+1
    sta ch_t_hi
.else
    ldx au_i
    lda _ss_x,x
    sta ch_p_lo
    lda #0
    sta ch_p_hi
    lda _px
    sta ch_t_lo
    lda #0
    sta ch_t_hi
.endif
    ldx au_i
    lda _ss_ai_speed,x
    sta ch_s
    rts
.endproc

.proc ch_load_y
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    lda _ss_y,y
    sta ch_p_lo
    lda _ss_y+1,y
    sta ch_p_hi
    lda _py
    sta ch_t_lo
    lda _py+1
    sta ch_t_hi
.else
    ldx au_i
    lda _ss_y,x
    sta ch_p_lo
    lda #0
    sta ch_p_hi
    lda _py
    sta ch_t_lo
    lda #0
    sta ch_t_hi
.endif
    ldx au_i
    lda _ss_ai_speed,x
    sta ch_s
    rts
.endproc

; ch_le: C=1 iff (ch_p + ch_s) <= ch_t   (16-bit unsigned; ch_s hi = 0).
; Wraps mod 65536 on the add, matching the C `unsigned int` arithmetic.
.proc ch_le
    clc
    lda ch_p_lo
    adc ch_s
    sta tmp1
    lda ch_p_hi
    adc #0
    sta tmp2                    ; (tmp2:tmp1) = ch_p + ch_s
    lda ch_t_lo
    cmp tmp1
    lda ch_t_hi
    sbc tmp2                    ; C=1 iff ch_t >= sum  <=>  sum <= ch_t
    rts
.endproc

; ch_ge: C=1 iff ch_p >= (ch_t + ch_s)   (16-bit unsigned).
.proc ch_ge
    clc
    lda ch_t_lo
    adc ch_s
    sta tmp1
    lda ch_t_hi
    adc #0
    sta tmp2                    ; (tmp2:tmp1) = ch_t + ch_s
    lda ch_p_lo
    cmp tmp1
    lda ch_p_hi
    sbc tmp2                    ; C=1 iff ch_p >= sum
    rts
.endproc

; fly_set_y: ss_y[i] = ss_ai_home[i] + ss_ai_aux[i]  (foff), written absolutely.
; home is 0..210 (unsigned); foff is a signed offset. The C computes this as int
; and assigns to ss_y, so a home+foff that dips below 0 wraps to (unsigned char)
; / (unsigned int) — reproduced here by an 8-bit add (non-wide) or a 16-bit
; signed add with foff sign-extended (wide).
.proc fly_set_y
    ldx au_i
.if SS_POS_WIDE
    lda au_i
    asl
    tay
    clc
    lda _ss_ai_home,x
    adc _ss_ai_aux,x            ; lo = home + foff ; C = carry out
    sta _ss_y,y
    lda _ss_ai_aux,x
    bpl @pos
    lda #$FF                    ; foff hi = 0xFF (sign-extend)
    adc #0                     ; hi = 0 (home) + 0xFF + carry
    sta _ss_y+1,y
    jmp @done
@pos:
    lda #0                      ; foff hi = 0
    adc #0                     ; hi = 0 (home) + 0 + carry
    sta _ss_y+1,y
@done:
.else
    lda _ss_ai_home,x
    clc
    adc _ss_ai_aux,x            ; (unsigned char)(home + foff)
    sta _ss_y,x
.endif
    rts
.endproc
