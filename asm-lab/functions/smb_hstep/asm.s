; smb_hstep — hand-written 6502 for the SMB horizontal integrate + world clamp +
; leading-edge collision. np = px + sign_extend(hi(smb_px_sub + smb_vx)) (the
; px_integrate pattern); smb_px_sub = lo; clamp np to [0, WORLD_W_PX-PW8] resetting
; vx/sub on a wall/edge; if np != px, probe the leading-edge column across the
; body rows and cancel (reset vx/sub) on a SOLID/WALL, else move px = np.

.export _smb_hstep_asm
.import _behaviour_at
.import _px, _py, _smb_vx, _smb_px_sub
.import pushax
.importzp tmp1, tmp2

BEH_SOLID = 1
BEH_WALL  = 2
PW8       = 16
PH8       = 16
RBOUND    = 256 - PW8         ; WORLD_W_PX - PLAYER_W*8 = 240

.segment "BSS"
newsub: .res 1
dhi:    .res 1
nplo:   .res 1
nphi:   .res 1
edge:   .res 1
trow:   .res 1
brow:   .res 1
pcol:   .res 1
prow:   .res 1

.segment "CODE"

.proc shr3
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    rts
.endproc

; cell_solid: behaviour_at(pcol, prow) SOLID/WALL ? A=1 : A=0
.proc cell_solid
    lda pcol
    ldx #0
    jsr pushax
    lda prow
    ldx #0
    jsr _behaviour_at
    cmp #BEH_SOLID
    beq @y
    cmp #BEH_WALL
    beq @y
    lda #0
    rts
@y:
    lda #1
    rts
.endproc

.proc _smb_hstep_asm
    ; acc = smb_px_sub + smb_vx ; newsub = acc_lo ; dhi = acc_hi (signed delta)
    clc
    lda _smb_px_sub
    adc _smb_vx
    sta newsub
    lda _smb_vx+1
    adc #0
    sta dhi
    ; np = px + sign_extend(dhi)
    lda _px
    clc
    adc dhi
    sta nplo
    lda dhi
    bpl @pos
    lda #$FF
    bne @adhi              ; delta < 0 -> hi extension 0xFF
@pos:
    lda #$00
@adhi:
    adc _px+1
    sta nphi
    ; --- clamp np to [0, RBOUND] ---
    lda nphi
    bmi @clamp0           ; np < 0
    bne @clampmax         ; np >= 256 > RBOUND
    lda nplo
    cmp #(RBOUND + 1)
    bcs @clampmax         ; nplo > RBOUND
    jmp @setsub           ; in range
@clamp0:
    lda #0
    sta nplo
    sta nphi
    jmp @clampreset
@clampmax:
    lda #<RBOUND
    sta nplo
    lda #>RBOUND
    sta nphi
@clampreset:
    lda #0
    sta _smb_vx
    sta _smb_vx+1
    sta newsub           ; smb_px_sub = 0 on clamp
@setsub:
    lda newsub
    sta _smb_px_sub
    ; --- if (np != px) collide ---
    lda nplo
    cmp _px
    bne @moved
    lda nphi
    cmp _px+1
    bne @moved
    rts                  ; np == px -> nothing
@moved:
    ; edge_col = (np > px) ? (np+PW8-1)>>3 : np>>3
    lda _px
    cmp nplo
    lda _px+1
    sbc nphi
    bcc @right           ; px < np -> moving right
    ; moving left: edge = np >> 3
    lda nplo
    sta tmp1
    lda nphi
    sta tmp2
    jsr shr3
    sta edge
    jmp @rows
@right:
    lda #(PW8 - 1)
    clc
    adc nplo
    sta tmp1
    lda nphi
    adc #0
    sta tmp2
    jsr shr3
    sta edge
@rows:
    lda _py
    sta tmp1
    lda _py+1
    sta tmp2
    jsr shr3
    sta trow
    lda #(PH8 - 1)
    clc
    adc _py
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    jsr shr3
    sta brow
    ; probe rows trow..brow at edge
    lda trow
    sta prow
@ploop:
    lda prow
    cmp brow
    bcc @pdo
    beq @pdo
    jmp @move            ; none blocked -> move
@pdo:
    lda edge
    sta pcol
    jsr cell_solid
    bne @blocked
    inc prow
    jmp @ploop
@blocked:
    lda #0
    sta _smb_vx
    sta _smb_vx+1
    sta _smb_px_sub
    rts
@move:
    lda nplo
    sta _px
    lda nphi
    sta _px+1
    rts
.endproc
