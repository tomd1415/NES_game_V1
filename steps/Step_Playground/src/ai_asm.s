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
.import _behaviour_at
.import pushax, incsp4
.importzp sp, tmp1, tmp2

BEH_SOLID = 1
BEH_WALL  = 2

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
