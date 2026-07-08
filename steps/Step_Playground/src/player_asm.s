; player_asm.s — hand-written 6502 for the player update (Phase 2c).
;
; Compiled + linked ONLY when NES_ASM_PLAYER=1 (Makefile); the matching C body in
; main.c is then #ifdef'd out, so flag OFF (default) = byte-identical to the pure-C
; engine. Not shipped to pupils yet (PLAYGROUND_ASM_PLAYER test toggle).
;
; td_update — the TOP-DOWN player update (BW_GAME_STYLE == 1): 4-way move with
; per-direction collision, in the C's order (RIGHT, LEFT, then UP, DOWN — so the
; vertical step sees the post-horizontal px), then jumping/jmp_up/on_ladder = 0.
; Behaviourally identical to the C, proven in asm-lab (functions/td_update). The
; world bounds + player size are the project.inc constants the C bakes in.
;
; px/py in the shipped build are u8 (1x1/non-scroll) or u16 (scroll) — same split
; as the C's pxcoord_t. td_update loads them into 16-bit working copies (pxw/pyw,
; hi=0 for u8) at entry and stores them back width-appropriately at exit, so all
; the interior math is one 16-bit path; only the load/store branch on PX_WIDE.

.include "project.inc"

.export _td_update
.import _behaviour_at
.import _px, _py, _pad, _walk_speed, _plrdir, _jumping, _jmp_up, _on_ladder
.import _prev_pad, _climb_speed
.import pushax
.importzp tmp1, tmp2

BEH_SOLID  = 1
BEH_WALL   = 2
BEH_PLAT   = 3
BEH_LADDER = 6
PW8        = PLAYER_W * 8
PH8        = PLAYER_H * 8
WORLD_W_PX = BG_WORLD_COLS * 8
WORLD_H_PX = BG_WORLD_ROWS * 8
RBOUND     = WORLD_W_PX - PW8          ; RIGHT: move only while px < RBOUND
; px/py are u16 exactly when the C uses SCROLL_BUILD (world bigger than one screen).
; NB: `.define` (not `=`) so `.if PX_WIDE` resolves inside .proc scopes, like the
; project.inc SS_POS_WIDE; and no parens around `>` (ca65 reads a parenthesised
; `>` as the hi-byte operator).
.if BG_WORLD_COLS > 32
.define PX_WIDE 1
.elseif BG_WORLD_ROWS > 30
.define PX_WIDE 1
.else
.define PX_WIDE 0
.endif

.segment "BSS"
pxw:   .res 2     ; 16-bit working copy of px (hi = 0 when not PX_WIDE)
pyw:   .res 2
tdcol: .res 1
tdr0:  .res 1
tdr1:  .res 1
arow:  .res 1
lcol:  .res 1
rcol:  .res 1
pcol:  .res 1
prow:  .res 1
drow:  .res 1     ; plat_update: head/foot/ladder row
ntlo:  .res 1     ; plat_update: new_top / new_foot lo
nthi:  .res 1
ul:    .res 1     ; plat_update: up_l / dn_l / head_l behaviour
ur:    .res 1     ; plat_update: up_r / dn_r / head_r behaviour
fall_amt: .res 1  ; pl_vmove gravity step: 2 (platformer) or 3 (SMB)
sedge: .res 1     ; smb_hstep: leading-edge column

.segment "CODE"

; shr3: (tmp2:tmp1) >>= 3 (logical) ; A = lo
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

; hprobe: any row tdr0..tdr1 at column tdcol solid ? A=1 : A=0
.proc hprobe
    lda tdr0
    sta prow
@loop:
    lda prow
    cmp tdr1
    bcc @do
    beq @do
    lda #0
    rts
@do:
    lda tdcol
    sta pcol
    jsr cell_solid
    bne @yes
    inc prow
    jmp @loop
@yes:
    lda #1
    rts
.endproc

; rows_from_py: tdr0 = pyw>>3 ; tdr1 = (pyw + PH8 - 1)>>3
.proc rows_from_py
    lda pyw
    sta tmp1
    lda pyw+1
    sta tmp2
    jsr shr3
    sta tdr0
    lda #(PH8 - 1)
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdr1
    rts
.endproc

; calc_cols: lcol = pxw>>3 ; rcol = (pxw + PW8 - 1)>>3
.proc calc_cols
    lda pxw
    sta tmp1
    lda pxw+1
    sta tmp2
    jsr shr3
    sta lcol
    lda #(PW8 - 1)
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta rcol
    rts
.endproc

.proc _td_update
    ; --- load px/py into 16-bit working copies ---
.if PX_WIDE
    lda _px
    sta pxw
    lda _px+1
    sta pxw+1
    lda _py
    sta pyw
    lda _py+1
    sta pyw+1
.else
    lda _px
    sta pxw
    lda _py
    sta pyw
    lda #0
    sta pxw+1
    sta pyw+1
.endif

    ; ---- RIGHT (pad & 0x01) ----
    lda _pad
    and #$01
    beq skip_right
    lda pxw
    cmp #<RBOUND
    lda pxw+1
    sbc #>RBOUND
    bcs r_dir                 ; px >= RBOUND -> no move
    lda #(PW8 - 1)
    clc
    adc _walk_speed
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne r_dir
    lda pxw
    clc
    adc _walk_speed
    sta pxw
    lda pxw+1
    adc #0
    sta pxw+1
r_dir:
    lda #$00
    sta _plrdir
skip_right:
    ; ---- LEFT (pad & 0x02) ----
    lda _pad
    and #$02
    beq skip_left
    lda pxw+1
    bne l_go                  ; px >= 256 -> px >= walk_speed
    lda pxw
    cmp _walk_speed
    bcc l_dir                 ; px < walk_speed -> no move
l_go:
    lda pxw
    sec
    sbc _walk_speed
    sta tmp1
    lda pxw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne l_dir
    lda pxw
    sec
    sbc _walk_speed
    sta pxw
    lda pxw+1
    sbc #0
    sta pxw+1
l_dir:
    lda #$40
    sta _plrdir
skip_left:
    ; ---- UP (pad & 0x08) ----
    lda _pad
    and #$08
    beq skip_up
    lda pyw+1
    bne u_go
    lda pyw
    cmp _walk_speed
    bcc skip_up               ; py < walk_speed -> no move
u_go:
    lda pyw
    sec
    sbc _walk_speed
    sta tmp1
    lda pyw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta arow
    jsr calc_cols
    lda lcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_up
    lda rcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_up
    lda pyw
    sec
    sbc _walk_speed
    sta pyw
    lda pyw+1
    sbc #0
    sta pyw+1
skip_up:
    ; ---- DOWN (pad & 0x04) ----
    lda _pad
    and #$04
    beq skip_down
    lda #PH8
    clc
    adc _walk_speed
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2                  ; t = py + PH8 + walk_speed
    lda #<WORLD_H_PX
    sec
    sbc tmp1
    lda #>WORLD_H_PX
    sbc tmp2
    bcc skip_down             ; WORLD_H_PX < t -> t > WORLD_H_PX -> no move
    lda #(PH8 - 1)
    clc
    adc _walk_speed
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta arow
    jsr calc_cols
    lda lcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_down
    lda rcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid
    bne skip_down
    lda pyw
    clc
    adc _walk_speed
    sta pyw
    lda pyw+1
    adc #0
    sta pyw+1
skip_down:
    ; --- store working copies back to px/py ---
.if PX_WIDE
    lda pxw
    sta _px
    lda pxw+1
    sta _px+1
    lda pyw
    sta _py
    lda pyw+1
    sta _py+1
.else
    lda pxw
    sta _px
    lda pyw
    sta _py
.endif
    lda #0
    sta _jumping
    sta _jmp_up
    sta _on_ladder
    rts
.endproc

; ===========================================================================
; plat_update — the PLATFORMER player update (BW_GAME_STYLE == 0). Runs the same
; pieces the C does, in order: horizontal walk -> ladder(detect+climb) OR jump
; trigger -> vertical (ascent/gravity). Reuses shr3/cell_solid/hprobe/calc_cols/
; rows_from_py; adds bat/cell_solid_or_plat + the ladder/jump/vmove bodies (each
; asm-lab-proven, ported to the pxw/pyw working copies). _td_update is untouched.
; The C's `prev_pad = pad` stays in C (runs after this; the jump trigger reads
; the old prev_pad).
; ===========================================================================
.export _plat_update

; hwalk: horizontal RIGHT/LEFT on pxw + plrdir (caller loads pxw/pyw). Same logic
; as _td_update's horizontal, as a callable proc so _td_update stays untouched.
.proc hwalk
    lda _pad
    and #$01
    beq h_sr
    lda pxw
    cmp #<RBOUND
    lda pxw+1
    sbc #>RBOUND
    bcs h_rdir
    lda #(PW8 - 1)
    clc
    adc _walk_speed
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne h_rdir
    lda pxw
    clc
    adc _walk_speed
    sta pxw
    lda pxw+1
    adc #0
    sta pxw+1
h_rdir:
    lda #$00
    sta _plrdir
h_sr:
    lda _pad
    and #$02
    beq h_sl
    lda pxw+1
    bne h_lgo
    lda pxw
    cmp _walk_speed
    bcc h_ldir
h_lgo:
    lda pxw
    sec
    sbc _walk_speed
    sta tmp1
    lda pxw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr rows_from_py
    jsr hprobe
    bne h_ldir
    lda pxw
    sec
    sbc _walk_speed
    sta pxw
    lda pxw+1
    sbc #0
    sta pxw+1
h_ldir:
    lda #$40
    sta _plrdir
h_sl:
    rts
.endproc

; bat: A = behaviour_at(pcol, prow)
.proc bat
    lda pcol
    ldx #0
    jsr pushax
    lda prow
    ldx #0
    jsr _behaviour_at
    rts
.endproc

; cell_solid_or_plat: behaviour_at(pcol,prow) SOLID/WALL/PLATFORM ? A=1 : A=0
.proc cell_solid_or_plat
    jsr bat
    cmp #BEH_SOLID
    beq @y
    cmp #BEH_WALL
    beq @y
    cmp #BEH_PLAT
    beq @y
    lda #0
    rts
@y:
    lda #1
    rts
.endproc

; pl_jump: UP edge && !jumping -> jumping=1, jmp_up=20
.proc pl_jump
    lda _pad
    and #$08
    beq @d
    lda _prev_pad
    and #$08
    bne @d
    lda _jumping
    bne @d
    lda #1
    sta _jumping
    lda #20
    sta _jmp_up
@d:
    rts
.endproc

; pl_ladder: detect body/ladder overlap -> on_ladder; if on ladder, climb UP/DOWN
; (ladder-wins-over-solid) and pin jumping/jmp_up = 0. Operates on pxw/pyw.
.proc pl_ladder
    lda #0
    sta _on_ladder
    jsr calc_cols
    lda pyw
    sta tmp1
    lda pyw+1
    sta tmp2
    jsr shr3
    sta prow
    lda #(PH8 - 1)
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta drow
@dloop:
    lda prow
    cmp drow
    bcc @ddo
    beq @ddo
    jmp @ddone
@ddo:
    lda lcol
    sta pcol
    jsr bat
    cmp #BEH_LADDER
    beq @dyes
    lda rcol
    sta pcol
    jsr bat
    cmp #BEH_LADDER
    beq @dyes
    inc prow
    jmp @dloop
@dyes:
    lda #1
    sta _on_ladder
@ddone:
    lda _on_ladder
    bne @climb
    rts
@climb:
    lda _pad
    and #$08
    bne @ugo
    jmp @aftup
@ugo:
    lda pyw+1
    bne @ntsub
    lda pyw
    cmp _climb_speed
    bcs @ntsub
    lda #0
    sta ntlo
    sta nthi
    jmp @urow
@ntsub:
    lda pyw
    sec
    sbc _climb_speed
    sta ntlo
    lda pyw+1
    sbc #0
    sta nthi
@urow:
    lda ntlo
    sta tmp1
    lda nthi
    sta tmp2
    jsr shr3
    sta drow
    lda lcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ul
    lda rcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ur
    lda ul
    cmp #BEH_LADDER
    beq @uyes
    lda ur
    cmp #BEH_LADDER
    beq @uyes
    lda ul
    cmp #BEH_SOLID
    beq @aftup
    cmp #BEH_WALL
    beq @aftup
    lda ur
    cmp #BEH_SOLID
    beq @aftup
    cmp #BEH_WALL
    beq @aftup
@uyes:
    lda ntlo
    sta pyw
    lda nthi
    sta pyw+1
@aftup:
    lda _pad
    and #$04
    bne @dgo
    jmp @aftdn
@dgo:
    lda _climb_speed
    clc
    adc #PH8
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta drow
    lda lcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ul
    lda rcol
    sta pcol
    lda drow
    sta prow
    jsr bat
    sta ur
    lda pyw
    cmp #<(WORLD_H_PX - 8)
    lda pyw+1
    sbc #>(WORLD_H_PX - 8)
    bcs @aftdn
    lda ul
    cmp #BEH_LADDER
    beq @dyes2
    lda ur
    cmp #BEH_LADDER
    beq @dyes2
    lda ul
    cmp #BEH_SOLID
    beq @aftdn
    cmp #BEH_WALL
    beq @aftdn
    lda ur
    cmp #BEH_SOLID
    beq @aftdn
    cmp #BEH_WALL
    beq @aftdn
@dyes2:
    lda pyw
    clc
    adc _climb_speed
    sta pyw
    lda pyw+1
    adc #0
    sta pyw+1
@aftdn:
    lda #0
    sta _jumping
    sta _jmp_up
    rts
.endproc

; pl_vmove: platformer vertical physics (ascent / gravity). Operates on pxw/pyw.
.proc pl_vmove
    lda _on_ladder
    beq @nl
    rts
@nl:
    lda _jumping
    beq @tograv
    lda _jmp_up
    bne @asc
@tograv:
    jmp @grav
@asc:
    lda pyw+1
    bne @hsub
    lda pyw
    cmp #2
    bcs @hsub
    lda #0
    sta drow
    jmp @hp
@hsub:
    lda pyw
    sec
    sbc #2
    sta tmp1
    lda pyw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta drow
@hp:
    jsr calc_cols
    lda lcol
    sta pcol
    lda drow
    sta prow
    jsr cell_solid
    bne @bonk
    lda rcol
    sta pcol
    lda drow
    sta prow
    jsr cell_solid
    bne @bonk
    jmp @rise
@bonk:
    lda #0
    sta _jmp_up
    rts
@rise:
    lda pyw+1
    bne @r2
    lda pyw
    cmp #18
    bcs @r2
    lda #16
    sta pyw
    lda #0
    sta pyw+1
    jmp @dj
@r2:
    lda pyw
    sec
    sbc #2
    sta pyw
    lda pyw+1
    sbc #0
    sta pyw+1
@dj:
    dec _jmp_up
    rts
@grav:
    lda #PH8
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta drow
    jsr calc_cols
    lda lcol
    sta pcol
    lda drow
    sta prow
    jsr cell_solid_or_plat
    bne @land
    lda rcol
    sta pcol
    lda drow
    sta prow
    jsr cell_solid_or_plat
    bne @land
    jmp @fall
@land:
    lda drow
    sta tmp1
    lda #0
    sta tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    asl tmp1
    rol tmp2
    lda tmp1
    sec
    sbc #PH8
    sta pyw
    lda tmp2
    sbc #0
    sta pyw+1
    lda #0
    sta _jumping
    rts
@fall:
    lda pyw
    cmp #<(WORLD_H_PX - 8)
    lda pyw+1
    sbc #>(WORLD_H_PX - 8)
    bcs @air
    lda pyw
    clc
    adc fall_amt              ; 2 (platformer) or 3 (SMB), set by the caller
    sta pyw
    lda pyw+1
    adc #0
    sta pyw+1
@air:
    lda #1
    sta _jumping
    rts
.endproc

; _plat_update — compose the platformer update in the C's order.
.proc _plat_update
.if PX_WIDE
    lda _px
    sta pxw
    lda _px+1
    sta pxw+1
    lda _py
    sta pyw
    lda _py+1
    sta pyw+1
.else
    lda _px
    sta pxw
    lda _py
    sta pyw
    lda #0
    sta pxw+1
    sta pyw+1
.endif
    jsr hwalk
    jsr pl_ladder
    lda _on_ladder
    bne pu_pv
    jsr pl_jump
pu_pv:
    lda #2
    sta fall_amt
    jsr pl_vmove
.if PX_WIDE
    lda pxw
    sta _px
    lda pxw+1
    sta _px+1
    lda pyw
    sta _py
    lda pyw+1
    sta _py+1
.else
    lda pxw
    sta _px
    lda pyw
    sta _py
.endif
    rts
.endproc

; ===========================================================================
; smb_update — the SMB player update (BW_GAME_STYLE 0 + BW_SMB_JUMP). Same order
; as the C: SMB horizontal (smb_accel -> smb_hstep) -> ladder(detect+climb) OR
; smb_jump(trigger + variable-cut) -> pl_vmove with a +3 fall. Reuses shr3/
; cell_solid/calc_cols/pl_ladder/pl_vmove; smb_accel/smb_hstep/smb_jump are the
; asm-lab-proven leaves. _smb_vx / _smb_px_sub are real main.c globals — defined
; only for SMB builds, so the whole SMB section is gated under NES_ASM_SMB (a ca65
; -D set by the Makefile only for SMB projects); a non-SMB build never references
; them and links fine.
; ===========================================================================
.ifdef NES_ASM_SMB
.export _smb_update
.import _smb_vx, _smb_px_sub

.segment "BSS"
smaxs:   .res 2
starget: .res 2
saccel:  .res 2
newsub:  .res 1
sdhi:    .res 1
snplo:   .res 1
snphi:   .res 1
strow:   .res 1
sbrow:   .res 1

.segment "CODE"

; SMB horizontal tuning comes from project.inc (SMB_WALK_MAX/RUN_MAX/ACCEL),
; which the server derives from the Builder's Speed preset — MUST match the C's
; BW_SMB_* or the ASM velocity ramps at a different rate (the asm-lab leaf's
; hardcoded 640/384/24 only matched Speed 2's walk/run, never its accel).
SMB_RUN  = SMB_RUN_MAX
SMB_WALK = SMB_WALK_MAX
SMB_ACC  = SMB_ACCEL

; smb_accel — signed 16-bit accelerate smb_vx toward the run/walk target (2x
; skid on reversal); plrdir from target sign. (asm-lab functions/smb_accel)
.proc smb_accel
    lda _pad
    and #$40
    beq @wmax
    lda #<SMB_RUN
    sta smaxs
    lda #>SMB_RUN
    sta smaxs+1
    jmp @tgt
@wmax:
    lda #<SMB_WALK
    sta smaxs
    lda #>SMB_WALK
    sta smaxs+1
@tgt:
    lda _pad
    and #$01
    beq @nr
    lda smaxs
    sta starget
    lda smaxs+1
    sta starget+1
    jmp @accl
@nr:
    lda _pad
    and #$02
    beq @tz
    sec
    lda #0
    sbc smaxs
    sta starget
    lda #0
    sbc smaxs+1
    sta starget+1
    jmp @accl
@tz:
    lda #0
    sta starget
    sta starget+1
@accl:
    lda _smb_vx
    cmp starget
    bne @cmpvt
    lda _smb_vx+1
    cmp starget+1
    bne @cmpvt
    jmp @setdir
@cmpvt:
    sec
    lda _smb_vx
    sbc starget
    lda _smb_vx+1
    sbc starget+1
    bvc @s1
    eor #$80
@s1:
    bpl @gtr
    jmp @vless
@gtr:
    lda _smb_vx+1
    bmi @ga1
    lda _smb_vx+1
    ora _smb_vx
    beq @ga1
    lda #<(SMB_ACC * 2)
    sta saccel
    lda #>(SMB_ACC * 2)
    sta saccel+1
    jmp @gsub
@ga1:
    lda #<SMB_ACC
    sta saccel
    lda #>SMB_ACC
    sta saccel+1
@gsub:
    sec
    lda _smb_vx
    sbc saccel
    sta _smb_vx
    lda _smb_vx+1
    sbc saccel+1
    sta _smb_vx+1
    sec
    lda _smb_vx
    sbc starget
    lda _smb_vx+1
    sbc starget+1
    bvc @s2
    eor #$80
@s2:
    bpl @setdir
    lda starget
    sta _smb_vx
    lda starget+1
    sta _smb_vx+1
    jmp @setdir
@vless:
    lda _smb_vx+1
    bmi @la2
    lda #<SMB_ACC
    sta saccel
    lda #>SMB_ACC
    sta saccel+1
    jmp @ladd
@la2:
    lda #<(SMB_ACC * 2)
    sta saccel
    lda #>(SMB_ACC * 2)
    sta saccel+1
@ladd:
    clc
    lda _smb_vx
    adc saccel
    sta _smb_vx
    lda _smb_vx+1
    adc saccel+1
    sta _smb_vx+1
    sec
    lda starget
    sbc _smb_vx
    lda starget+1
    sbc _smb_vx+1
    bvc @s3
    eor #$80
@s3:
    bpl @setdir
    lda starget
    sta _smb_vx
    lda starget+1
    sta _smb_vx+1
@setdir:
    lda starget+1
    bmi @tneg
    lda starget
    ora starget+1
    beq @done
    lda #$00
    sta _plrdir
    rts
@tneg:
    lda #$40
    sta _plrdir
@done:
    rts
.endproc

; smb_hstep — 8.8 integrate + world clamp (16-bit, RBOUND may exceed 255 under
; scroll) + leading-edge collision, on the pxw working copy. (asm-lab smb_hstep)
.proc smb_hstep
    clc
    lda _smb_px_sub
    adc _smb_vx
    sta newsub
    lda _smb_vx+1
    adc #0
    sta sdhi
    lda pxw
    clc
    adc sdhi
    sta snplo
    lda sdhi
    bpl @pos
    lda #$FF
    bne @adhi
@pos:
    lda #$00
@adhi:
    adc pxw+1
    sta snphi
    ; clamp np to [0, RBOUND] (16-bit)
    lda snphi
    bmi @clamp0
    lda #<RBOUND
    cmp snplo
    lda #>RBOUND
    sbc snphi
    bcc @clampmax        ; RBOUND < np -> np > RBOUND
    jmp @setsub
@clamp0:
    lda #0
    sta snplo
    sta snphi
    jmp @clampreset
@clampmax:
    lda #<RBOUND
    sta snplo
    lda #>RBOUND
    sta snphi
@clampreset:
    lda #0
    sta _smb_vx
    sta _smb_vx+1
    sta newsub
@setsub:
    lda newsub
    sta _smb_px_sub
    ; if (np != px) collide
    lda snplo
    cmp pxw
    bne @moved
    lda snphi
    cmp pxw+1
    bne @moved
    rts
@moved:
    lda pxw
    cmp snplo
    lda pxw+1
    sbc snphi
    bcc @right           ; px < np -> moving right
    lda snplo
    sta tmp1
    lda snphi
    sta tmp2
    jsr shr3
    sta sedge
    jmp @rows
@right:
    lda #(PW8 - 1)
    clc
    adc snplo
    sta tmp1
    lda snphi
    adc #0
    sta tmp2
    jsr shr3
    sta sedge
@rows:
    lda pyw
    sta tmp1
    lda pyw+1
    sta tmp2
    jsr shr3
    sta strow
    lda #(PH8 - 1)
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta sbrow
    lda strow
    sta prow
@ploop:
    lda prow
    cmp sbrow
    bcc @pdo
    beq @pdo
    jmp @move
@pdo:
    lda sedge
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
    lda snplo
    sta pxw
    lda snphi
    sta pxw+1
    rts
.endproc

; smb_jump — UP-edge OR A-edge take-off (+8 if B), then the variable-height cut.
; (asm-lab functions/smb_jump)
.proc smb_jump
    lda _pad
    and #$08
    beq @chkA
    lda _prev_pad
    and #$08
    beq @edge
@chkA:
    lda _pad
    and #$80
    beq @cut
    lda _prev_pad
    and #$80
    bne @cut
@edge:
    lda _jumping
    bne @cut
    lda #1
    sta _jumping
    lda #20
    sta _jmp_up
    lda _pad
    and #$40
    beq @cut
    lda _jmp_up
    clc
    adc #8
    sta _jmp_up
@cut:
    lda _jumping
    beq @done
    lda _jmp_up
    cmp #5
    bcc @done
    lda _pad
    and #$88
    bne @done
    lda #4
    sta _jmp_up
@done:
    rts
.endproc

; _smb_update — compose in the C's order.
.proc _smb_update
.if PX_WIDE
    lda _px
    sta pxw
    lda _px+1
    sta pxw+1
    lda _py
    sta pyw
    lda _py+1
    sta pyw+1
.else
    lda _px
    sta pxw
    lda _py
    sta pyw
    lda #0
    sta pxw+1
    sta pyw+1
.endif
    jsr smb_accel
    jsr smb_hstep
    jsr pl_ladder
    lda _on_ladder
    bne su_pv
    jsr smb_jump
su_pv:
    lda #3
    sta fall_amt
    jsr pl_vmove
.if PX_WIDE
    lda pxw
    sta _px
    lda pxw+1
    sta _px+1
    lda pyw
    sta _py
    lda pyw+1
    sta _py+1
.else
    lda pxw
    sta _px
    lda pyw
    sta _py
.endif
    rts
.endproc

.endif  ; NES_ASM_SMB
