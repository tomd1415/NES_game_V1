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
RUN_CAM_MAX = WORLD_W_PX - SCREEN_W_PX ; auto-runner: track end (wrap the camera)
RUN_FALL_Y  = WORLD_H_PX - 8           ; auto-runner: fall-off-bottom respawn line
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
runc:  .res 1     ; run_hstep: body-centre column (spike probe)
runr:  .res 1     ; run_hstep: body-centre row

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
; run_update — the AUTO-RUNNER player update (BW_GAME_STYLE 2). Same order as the
; C: forced-scroll horizontal + respawn (run_hstep, on _px/_py/_cam_x directly) ->
; the SHARED platformer vertical (pl_ladder detect+climb OR run_jump, then pl_vmove
; with a +2 fall) on the pxw/pyw working copies. run_jump differs from pl_jump: the
; runner takes off on UP-edge OR A-edge (the auto-runner's "tap to jump"), jmp_up=20,
; no run-boost/variable-cut. Constants (RUNNER_AUTOSCROLL/SCREEN_X/SPIKE_ID/START_Y)
; come from project.inc so the ASM matches the C's Builder-tuned values.
;
; The whole section is gated under PX_WIDE: an auto-runner is ALWAYS a multi-screen
; scroll build (autoscroll needs a track wider than one screen), so it's always
; PX_WIDE — and gating here means a 1-screen (non-scroll) build never imports
; _cam_x, which scroll.c only defines for a multi-screen world.
.if PX_WIDE
.export _run_update
.import _cam_x            ; the scroll camera the runner rides (scroll.c, PX_WIDE only)

; run_respawn: cam_x=0; px=RUNNER_SCREEN_X; py=RUNNER_START_Y; jumping=0; jmp_up=0.
.proc run_respawn
    lda #0
    sta _cam_x
    sta _cam_x+1
    sta _px+1
    sta _jumping
    sta _jmp_up
    sta _py+1
    lda #RUNNER_SCREEN_X
    sta _px
    lda #RUNNER_START_Y
    sta _py
    rts
.endproc

; run_hstep: cam_x += RUNNER_AUTOSCROLL; wrap at the track end; px = cam_x +
; RUNNER_SCREEN_X; respawn on a spike at the body centre or on falling off the
; bottom. Operates on _px/_py/_cam_x directly (16-bit). (asm-lab functions/run_hstep)
.proc run_hstep
    clc
    lda _cam_x
    adc #RUNNER_AUTOSCROLL
    sta _cam_x
    lda _cam_x+1
    adc #0
    sta _cam_x+1
    ; if (cam_x >= RUN_CAM_MAX) respawn
    lda _cam_x
    cmp #<RUN_CAM_MAX
    lda _cam_x+1
    sbc #>RUN_CAM_MAX
    bcc @nowrap
    jsr run_respawn
@nowrap:
    ; px = cam_x + RUNNER_SCREEN_X
    clc
    lda _cam_x
    adc #RUNNER_SCREEN_X
    sta _px
    lda _cam_x+1
    adc #0
    sta _px+1
    ; run_c = (px + PLAYER_W*4) >> 3
    clc
    lda _px
    adc #(PLAYER_W * 4)
    sta tmp1
    lda _px+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta runc
    ; run_r = (py + PLAYER_H*4) >> 3
    clc
    lda _py
    adc #(PLAYER_H * 4)
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta runr
    ; if (behaviour_at(run_c, run_r) == RUNNER_SPIKE_ID) respawn
    lda runc
    ldx #0
    jsr pushax
    lda runr
    ldx #0
    jsr _behaviour_at
    cmp #RUNNER_SPIKE_ID
    bne @nospk
    jsr run_respawn
@nospk:
    ; if (py >= RUN_FALL_Y) respawn
    lda _py
    cmp #<RUN_FALL_Y
    lda _py+1
    sbc #>RUN_FALL_Y
    bcc @done
    jsr run_respawn
@done:
    rts
.endproc

; run_jump: auto-runner take-off — UP-edge OR A-edge (tap to jump), jmp_up=20.
.proc run_jump
    lda _jumping
    bne @d               ; already airborne -> no re-trigger
    ; UP edge?
    lda _pad
    and #$08
    beq @tryA
    lda _prev_pad
    and #$08
    beq @go              ; UP now, not last frame -> take off
@tryA:
    ; A edge?
    lda _pad
    and #$80
    beq @d
    lda _prev_pad
    and #$80
    bne @d               ; A held last frame -> no edge
@go:
    lda #1
    sta _jumping
    lda #20
    sta _jmp_up
@d:
    rts
.endproc

.proc _run_update
    jsr run_hstep
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
    jsr pl_ladder
    lda _on_ladder
    bne @rv
    jsr run_jump
@rv:
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
.endif  ; PX_WIDE (auto-runner section)

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

; ===========================================================================
; racer_update — the TOP-DOWN RACER player update (BW_GAME_STYLE 3), composed from
; the four asm-lab-proven leaves in the C's order: rc_drive (steer + accel/friction/
; brake/reverse) -> rc_vel (vx/vy from COS16) -> rc_axis (per-axis integrate+clamp+
; box_on_edge slide + dominant-axis speed bleed) -> rc_laps (checkpoint/finish FSM).
; P1 car only; guarded by if(!racer_finished). Gated under NES_ASM_RACER (a ca65 -D
; set only for racer builds) because it imports the racer-only globals
; (racer_heading/speed/px_sub/py_sub/cp_stage/laps/finished) a non-racer build never
; defines. All tunables from project.inc RACER_* so the ASM matches the C's values.
.ifdef NES_ASM_RACER
.export _racer_update
.import _racer_heading, _racer_speed, _px_sub, _py_sub
.import _racer_cp_stage, _racer_laps, _racer_finished
.importzp tmp3

RC_XMAX    = RBOUND                     ; WORLD_W_PX - PW8
RC_YMAX    = WORLD_H_PX - PH8
RC_NEG_REV = $10000 - RACER_REV_MAX     ; -REV_MAX (16-bit two's complement)
RC_NEG_FRI = $10000 - RACER_FRICTION    ; -FRICTION
RC_FINISH  = RACER_FINISH_ID
RC_CP1     = RACER_CHECKPOINT_ID
RC_CP2     = RACER_CHECKPOINT2_ID

.segment "BSS"
rvx:   .res 2
rvy:   .res 2
ralo:  .res 1
rahi:  .res 1
rmaga: .res 1
rsgna: .res 1
rmagc: .res 1
rsgnp: .res 1
rrlo:  .res 1
rrhi:  .res 1
rdhi:  .res 1
rnlo:  .res 1
rnhi:  .res 1
rklo:  .res 1
rkhi:  .res 1
rksb:  .res 1
rhitx: .res 1
rhity: .res 1
rbx:   .res 2      ; box_on_edge box (own scratch — C racer_box_on_edge takes args)
rby:   .res 2
rbw:   .res 1
rbh:   .res 1
raxb:  .res 2
raxs:  .res 1
rao0:  .res 1
rao1:  .res 1
raom:  .res 1
rzc0:  .res 1
rzc1:  .res 1
rzcm:  .res 1
rzr0:  .res 1
rzr1:  .res 1
rzrm:  .res 1
rpc:   .res 1
rpr:   .res 1
rmid:  .res 1

.segment "CODE"
rcos16:
    .byte 127,117,90,49,0,207,166,139,129,139,166,207,0,49,90,117

; ---- rc_drive: steer + accel/friction/brake/reverse (signed-16, from racer_drive)
.proc rc_drive
    lda _pad
    and #$02
    beq @noL
    lda _racer_heading
    clc
    adc #15
    and #15
    sta _racer_heading
@noL:
    lda _pad
    and #$01
    beq @noR
    lda _racer_heading
    clc
    adc #1
    and #15
    sta _racer_heading
@noR:
    lda _pad
    and #$88
    bne @accel
    lda _pad
    and #$04
    bne @brake
    jmp @friction
@accel:
    clc
    lda _racer_speed
    adc #<RACER_ACCEL
    sta _racer_speed
    lda _racer_speed+1
    adc #>RACER_ACCEL
    sta _racer_speed+1
    sec
    lda #<RACER_MAX_SPEED
    sbc _racer_speed
    lda #>RACER_MAX_SPEED
    sbc _racer_speed+1
    bvc @ac1
    eor #$80
@ac1:
    bpl @ret
    lda #<RACER_MAX_SPEED
    sta _racer_speed
    lda #>RACER_MAX_SPEED
    sta _racer_speed+1
@ret:
    rts
@brake:
    sec
    lda _racer_speed
    sbc #<RACER_BRAKE
    sta _racer_speed
    lda _racer_speed+1
    sbc #>RACER_BRAKE
    sta _racer_speed+1
    sec
    lda _racer_speed
    sbc #<RC_NEG_REV
    lda _racer_speed+1
    sbc #>RC_NEG_REV
    bvc @br1
    eor #$80
@br1:
    bpl @ret2
    lda #<RC_NEG_REV
    sta _racer_speed
    lda #>RC_NEG_REV
    sta _racer_speed+1
@ret2:
    rts
@friction:
    sec
    lda #<RACER_FRICTION
    sbc _racer_speed
    lda #>RACER_FRICTION
    sbc _racer_speed+1
    bvc @fr1
    eor #$80
@fr1:
    bpl @frNP
    sec
    lda _racer_speed
    sbc #<RACER_FRICTION
    sta _racer_speed
    lda _racer_speed+1
    sbc #>RACER_FRICTION
    sta _racer_speed+1
    rts
@frNP:
    sec
    lda _racer_speed
    sbc #<RC_NEG_FRI
    lda _racer_speed+1
    sbc #>RC_NEG_FRI
    bvc @fr2
    eor #$80
@fr2:
    bpl @frZ
    clc
    lda _racer_speed
    adc #<RACER_FRICTION
    sta _racer_speed
    lda _racer_speed+1
    adc #>RACER_FRICTION
    sta _racer_speed+1
    rts
@frZ:
    lda #0
    sta _racer_speed
    sta _racer_speed+1
    rts
.endproc

; ---- rc_velcomp: cos byte in A -> signed 16-bit vel component rrlo:rrhi ----
.proc rc_velcomp
    cmp #$80
    bcc @cpos
    eor #$FF
    clc
    adc #1
    sta rmagc
    lda rsgna
    eor #$FF
    sta rsgnp
    jmp @mul
@cpos:
    sta rmagc
    lda rsgna
    sta rsgnp
@mul:
    lda #0
    sta rrhi
    ldx #8
@ml:
    lsr rmagc
    bcc @na
    clc
    lda rrhi
    adc rmaga
    sta rrhi
@na:
    ror rrhi
    ror rrlo
    dex
    bne @ml
    lda rsgnp
    beq @sh
    sec
    lda #0
    sbc rrlo
    sta rrlo
    lda #0
    sbc rrhi
    sta rrhi
@sh:
    ldx #5
@as:
    lda rrhi
    cmp #$80
    ror rrhi
    ror rrlo
    dex
    bne @as
    rts
.endproc

; ---- rc_vel: vx/vy from racer_speed + COS16 (from racer_vel) ----
.proc rc_vel
    lda _racer_speed
    sta ralo
    lda _racer_speed+1
    sta rahi
    ldx #2
@shr:
    lda rahi
    cmp #$80
    ror rahi
    ror ralo
    dex
    bne @shr
    lda rahi
    bpl @apos
    sec
    lda #0
    sbc ralo
    sta rmaga
    lda #$FF
    sta rsgna
    jmp @vx
@apos:
    lda ralo
    sta rmaga
    lda #0
    sta rsgna
@vx:
    ldx _racer_heading
    lda rcos16,x
    jsr rc_velcomp
    lda rrlo
    sta rvx
    lda rrhi
    sta rvx+1
    lda _racer_heading
    clc
    adc #12
    and #15
    tax
    lda rcos16,x
    jsr rc_velcomp
    lda rrlo
    sta rvy
    lda rrhi
    sta rvy+1
    rts
.endproc

; ---- box_on_edge: axis3 / probe / rbe (from racer_axis leaf's inlined copy) ----
.proc rc_axis3
    lda raxb
    sta tmp1
    lda raxb+1
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta rao0
    lda raxs
    asl
    asl
    asl
    sta tmp3
    clc
    lda raxb
    adc tmp3
    sta tmp1
    lda raxb+1
    adc #0
    sta tmp2
    sec
    lda tmp1
    sbc #1
    sta tmp1
    lda tmp2
    sbc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta rao1
    lda raxs
    asl
    asl
    sta tmp3
    clc
    lda raxb
    adc tmp3
    sta tmp1
    lda raxb+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    sta raom
    rts
.endproc

.proc rc_probe
    lda rpc
    ldx #0
    jsr pushax
    lda rpr
    ldx #0
    jsr _behaviour_at
    cmp #BEH_SOLID
    beq @yes
    cmp #BEH_WALL
    beq @yes
    lda #0
    rts
@yes:
    lda #1
    rts
.endproc

.proc rc_rbe
    lda rbx
    sta raxb
    lda rbx+1
    sta raxb+1
    lda rbw
    sta raxs
    jsr rc_axis3
    lda rao0
    sta rzc0
    lda rao1
    sta rzc1
    lda raom
    sta rzcm
    lda rby
    sta raxb
    lda rby+1
    sta raxb+1
    lda rbh
    sta raxs
    jsr rc_axis3
    lda rao0
    sta rzr0
    lda rao1
    sta rzr1
    lda raom
    sta rzrm
    lda rzc0
    sta rpc
    lda rzr0
    sta rpr
    jsr rc_probe
    bne @hit
    lda rzc1
    sta rpc
    lda rzr0
    sta rpr
    jsr rc_probe
    bne @hit
    lda rzc0
    sta rpc
    lda rzr1
    sta rpr
    jsr rc_probe
    bne @hit
    lda rzc1
    sta rpc
    lda rzr1
    sta rpr
    jsr rc_probe
    bne @hit
    lda rzcm
    sta rpc
    lda rzrm
    sta rpr
    jsr rc_probe
    bne @hit
    lda #0
    rts
@hit:
    lda #1
    rts
.endproc

; ---- rc_axis: per-axis move (X then Y) + dominant-axis speed bleed (racer_axis)
.proc rc_axis
    ; ===== X =====
    lda _px
    sta rklo
    lda _px+1
    sta rkhi
    lda _px_sub
    sta rksb
    clc
    lda _px_sub
    adc rvx
    sta _px_sub
    lda rvx+1
    adc #0
    sta rdhi
    clc
    lda _px
    adc rdhi
    sta rnlo
    lda rdhi
    bpl @xp
    lda #$FF
    bne @xa
@xp:
    lda #0
@xa:
    adc _px+1
    sta rnhi
    lda rnhi
    bpl @xnn
    lda #0
    sta rnlo
    sta rnhi
    sta _px_sub
    jmp @xst
@xnn:
    lda #<RC_XMAX
    cmp rnlo
    lda #>RC_XMAX
    sbc rnhi
    bcs @xst
    lda #<RC_XMAX
    sta rnlo
    lda #>RC_XMAX
    sta rnhi
    lda #0
    sta _px_sub
@xst:
    lda rnlo
    sta _px
    lda rnhi
    sta _px+1
    lda _px
    sta rbx
    lda _px+1
    sta rbx+1
    lda _py
    sta rby
    lda _py+1
    sta rby+1
    lda #PLAYER_W
    sta rbw
    lda #PLAYER_H
    sta rbh
    jsr rc_rbe
    beq @xok
    lda rklo
    sta _px
    lda rkhi
    sta _px+1
    lda rksb
    sta _px_sub
    lda #1
    sta rhitx
    jmp @ybeg
@xok:
    lda #0
    sta rhitx
@ybeg:
    ; ===== Y =====
    lda _py
    sta rklo
    lda _py+1
    sta rkhi
    lda _py_sub
    sta rksb
    clc
    lda _py_sub
    adc rvy
    sta _py_sub
    lda rvy+1
    adc #0
    sta rdhi
    clc
    lda _py
    adc rdhi
    sta rnlo
    lda rdhi
    bpl @yp
    lda #$FF
    bne @ya
@yp:
    lda #0
@ya:
    adc _py+1
    sta rnhi
    lda rnhi
    bpl @ynn
    lda #0
    sta rnlo
    sta rnhi
    sta _py_sub
    jmp @yst
@ynn:
    lda #<RC_YMAX
    cmp rnlo
    lda #>RC_YMAX
    sbc rnhi
    bcs @yst
    lda #<RC_YMAX
    sta rnlo
    lda #>RC_YMAX
    sta rnhi
    lda #0
    sta _py_sub
@yst:
    lda rnlo
    sta _py
    lda rnhi
    sta _py+1
    lda _px
    sta rbx
    lda _px+1
    sta rbx+1
    lda _py
    sta rby
    lda _py+1
    sta rby+1
    lda #PLAYER_W
    sta rbw
    lda #PLAYER_H
    sta rbh
    jsr rc_rbe
    beq @yok
    lda rklo
    sta _py
    lda rkhi
    sta _py+1
    lda rksb
    sta _py_sub
    lda #1
    sta rhity
    jmp @bleed
@yok:
    lda #0
    sta rhity
@bleed:
    ; avx -> rnlo:rnhi, avy -> rklo:rkhi
    lda rvx+1
    bpl @avxp
    sec
    lda #0
    sbc rvx
    sta rnlo
    lda #0
    sbc rvx+1
    sta rnhi
    jmp @avy
@avxp:
    lda rvx
    sta rnlo
    lda rvx+1
    sta rnhi
@avy:
    lda rvy+1
    bpl @avyp
    sec
    lda #0
    sbc rvy
    sta rklo
    lda #0
    sbc rvy+1
    sta rkhi
    jmp @cond
@avyp:
    lda rvy
    sta rklo
    lda rvy+1
    sta rkhi
@cond:
    lda rhitx
    beq @tryhy
    lda rnlo
    cmp rklo
    lda rnhi
    sbc rkhi
    bcs @burn           ; avx >= avy
@tryhy:
    lda rhity
    beq @done
    lda rklo
    cmp rnlo
    lda rkhi
    sbc rnhi
    bcs @burn           ; avy >= avx
    jmp @done
@burn:
    lda _racer_speed+1
    cmp #$80
    ror _racer_speed+1
    ror _racer_speed
@done:
    rts
.endproc

; ---- rc_laps: centre-cell checkpoint/finish FSM (from racer_laps) ----
.proc rc_laps
    clc
    lda _px
    adc #(PLAYER_W * 4)
    sta tmp1
    lda _px+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    ldx #0
    jsr pushax
    clc
    lda _py
    adc #(PLAYER_H * 4)
    sta tmp1
    lda _py+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    ldx #0
    jsr _behaviour_at
    sta rmid
    cmp #RC_CP1
    bne @notcp1
    lda _racer_cp_stage
    bne @done
    lda #1
    sta _racer_cp_stage
    jmp @done
@notcp1:
    lda rmid
    cmp #RC_CP2
    bne @notcp2
    lda _racer_cp_stage
    cmp #1
    bne @done
    lda #2
    sta _racer_cp_stage
    jmp @done
@notcp2:
    lda rmid
    cmp #RC_FINISH
    bne @done
    lda _racer_cp_stage
    cmp #RACER_CP_COUNT
    bcc @done
    lda #0
    sta _racer_cp_stage
    inc _racer_laps
    lda _racer_laps
    cmp #RACER_LAPS_TO_WIN
    bcc @done
    lda #1
    sta _racer_finished
@done:
    rts
.endproc

; ---- _racer_update: compose in the C's order, guarded by if(!racer_finished) ----
.proc _racer_update
    lda _racer_finished
    bne @done
    jsr rc_drive
    jsr rc_vel
    jsr rc_axis
    jsr rc_laps
@done:
    rts
.endproc
.endif  ; NES_ASM_RACER

; ===========================================================================
; p2_td_update — the PLAYER-2 top-down move (BW_GAME_STYLE 1 + PLAYER2_ENABLED).
; Algorithmically identical to _td_update (4-way RIGHT/LEFT/UP/DOWN with the same
; leading-edge wall probe) but on the P2 globals (px2/py2/pad2/plrdir2/walk_speed2)
; and PLAYER2 dimensions. Reuses the dimension-free helpers (shr3/cell_solid/hprobe)
; via the shared pxw/pyw working copies; the dimension-baking helpers get P2 twins
; (p2_rows_from_py / p2_calc_cols use PH8_2 / PW8_2). Gated NES_ASM_PLAYER2 (a ca65
; -D set only for a wired 2-player build) because it imports the P2-only globals a
; single-player build never defines. Sets jumping2/jmp_up2 = 0 (no jump in top-down).
.ifdef NES_ASM_PLAYER2
.export _p2_td_update
.export _p2_plat_update
.import _px2, _py2, _pad2, _walk_speed2, _plrdir2, _jumping2, _jmp_up2
.import _prev_pad2

PW8_2    = PLAYER2_W * 8
PH8_2    = PLAYER2_H * 8
RBOUND_2 = WORLD_W_PX - PW8_2
P2_FALL_Y = WORLD_H_PX - 8

.segment "CODE"

; p2_rows_from_py: tdr0 = pyw>>3 ; tdr1 = (pyw + PH8_2 - 1)>>3
.proc p2_rows_from_py
    lda pyw
    sta tmp1
    lda pyw+1
    sta tmp2
    jsr shr3
    sta tdr0
    lda #(PH8_2 - 1)
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

; p2_calc_cols: lcol = pxw>>3 ; rcol = (pxw + PW8_2 - 1)>>3
.proc p2_calc_cols
    lda pxw
    sta tmp1
    lda pxw+1
    sta tmp2
    jsr shr3
    sta lcol
    lda #(PW8_2 - 1)
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

.proc _p2_td_update
.if PX_WIDE
    lda _px2
    sta pxw
    lda _px2+1
    sta pxw+1
    lda _py2
    sta pyw
    lda _py2+1
    sta pyw+1
.else
    lda _px2
    sta pxw
    lda _py2
    sta pyw
    lda #0
    sta pxw+1
    sta pyw+1
.endif
    ; ---- RIGHT (pad2 & 0x01) ----
    lda _pad2
    and #$01
    beq skip_right
    lda pxw
    cmp #<RBOUND_2
    lda pxw+1
    sbc #>RBOUND_2
    bcs r_dir
    lda #(PW8_2 - 1)
    clc
    adc _walk_speed2
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr p2_rows_from_py
    jsr hprobe
    bne r_dir
    lda pxw
    clc
    adc _walk_speed2
    sta pxw
    lda pxw+1
    adc #0
    sta pxw+1
r_dir:
    lda #$00
    sta _plrdir2
skip_right:
    ; ---- LEFT (pad2 & 0x02) ----
    lda _pad2
    and #$02
    beq skip_left
    lda pxw+1
    bne l_go
    lda pxw
    cmp _walk_speed2
    bcc l_dir
l_go:
    lda pxw
    sec
    sbc _walk_speed2
    sta tmp1
    lda pxw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr p2_rows_from_py
    jsr hprobe
    bne l_dir
    lda pxw
    sec
    sbc _walk_speed2
    sta pxw
    lda pxw+1
    sbc #0
    sta pxw+1
l_dir:
    lda #$40
    sta _plrdir2
skip_left:
    ; ---- UP (pad2 & 0x08) ----
    lda _pad2
    and #$08
    beq skip_up
    lda pyw+1
    bne u_go
    lda pyw
    cmp _walk_speed2
    bcc skip_up
u_go:
    lda pyw
    sec
    sbc _walk_speed2
    sta tmp1
    lda pyw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta arow
    jsr p2_calc_cols
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
    sbc _walk_speed2
    sta pyw
    lda pyw+1
    sbc #0
    sta pyw+1
skip_up:
    ; ---- DOWN (pad2 & 0x04) ----
    lda _pad2
    and #$04
    beq skip_down
    lda #PH8_2
    clc
    adc _walk_speed2
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    lda #<WORLD_H_PX
    sec
    sbc tmp1
    lda #>WORLD_H_PX
    sbc tmp2
    bcc skip_down
    lda #(PH8_2 - 1)
    clc
    adc _walk_speed2
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta arow
    jsr p2_calc_cols
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
    adc _walk_speed2
    sta pyw
    lda pyw+1
    adc #0
    sta pyw+1
skip_down:
.if PX_WIDE
    lda pxw
    sta _px2
    lda pxw+1
    sta _px2+1
    lda pyw
    sta _py2
    lda pyw+1
    sta _py2+1
.else
    lda pxw
    sta _px2
    lda pyw
    sta _py2
.endif
    lda #0
    sta _jumping2
    sta _jmp_up2
    rts
.endproc

; ===========================================================================
; p2_plat_update — the PLAYER-2 platformer move (BW_GAME_STYLE 0 + PLAYER2_ENABLED).
; Simpler than plat_update (NO ladder, NO ceiling bonk, UP-only jump): the shared P2
; horizontal walk (p2_hwalk) -> edge-UP jump (jmp_up2=20) -> prev_pad2=pad2 -> simple
; gravity (rise 2 while jmp_up2>0 else foot-check land-or-fall +2). On the pxw/pyw
; working copies + PLAYER2 dims. Reuses shr3/cell_solid/cell_solid_or_plat/hprobe +
; the P2 p2_calc_cols/p2_rows_from_py.

; p2_hwalk: RIGHT/LEFT leading-edge walk on pxw + plrdir2 (shared by plat + runner).
.proc p2_hwalk
    lda _pad2
    and #$01
    beq @nr
    lda pxw
    cmp #<RBOUND_2
    lda pxw+1
    sbc #>RBOUND_2
    bcs @rd
    lda #(PW8_2 - 1)
    clc
    adc _walk_speed2
    clc
    adc pxw
    sta tmp1
    lda pxw+1
    adc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr p2_rows_from_py
    jsr hprobe
    bne @rd
    lda pxw
    clc
    adc _walk_speed2
    sta pxw
    lda pxw+1
    adc #0
    sta pxw+1
@rd:
    lda #$00
    sta _plrdir2
@nr:
    lda _pad2
    and #$02
    beq @nl
    lda pxw+1
    bne @lg
    lda pxw
    cmp _walk_speed2
    bcc @ld
@lg:
    lda pxw
    sec
    sbc _walk_speed2
    sta tmp1
    lda pxw+1
    sbc #0
    sta tmp2
    jsr shr3
    sta tdcol
    jsr p2_rows_from_py
    jsr hprobe
    bne @ld
    lda pxw
    sec
    sbc _walk_speed2
    sta pxw
    lda pxw+1
    sbc #0
    sta pxw+1
@ld:
    lda #$40
    sta _plrdir2
@nl:
    rts
.endproc

.proc _p2_plat_update
.if PX_WIDE
    lda _px2
    sta pxw
    lda _px2+1
    sta pxw+1
    lda _py2
    sta pyw
    lda _py2+1
    sta pyw+1
.else
    lda _px2
    sta pxw
    lda _py2
    sta pyw
    lda #0
    sta pxw+1
    sta pyw+1
.endif
    jsr p2_hwalk
    ; --- jump trigger: (pad2 & 0x08 edge) && !jumping2 -> jumping2=1, jmp_up2=20 ---
    lda _pad2
    and #$08
    beq @nojmp
    lda _prev_pad2
    and #$08
    bne @nojmp
    lda _jumping2
    bne @nojmp
    lda #1
    sta _jumping2
    lda #20
    sta _jmp_up2
@nojmp:
    ; prev_pad2 = pad2 (before gravity, matching the C order)
    lda _pad2
    sta _prev_pad2
    ; --- gravity ---
    lda _jumping2
    beq @fall
    lda _jmp_up2
    beq @fall
    ; rising: if (py2 >= 18) py2 -= 2 else py2 = 16 ; jmp_up2--
    lda pyw
    cmp #18
    lda pyw+1
    sbc #0
    bcc @clamp16
    lda pyw
    sec
    sbc #2
    sta pyw
    lda pyw+1
    sbc #0
    sta pyw+1
    jmp @decju
@clamp16:
    lda #16
    sta pyw
    lda #0
    sta pyw+1
@decju:
    dec _jmp_up2
    jmp @store
@fall:
    ; foot_row = (py2 + PH8_2) >> 3
    lda #PH8_2
    clc
    adc pyw
    sta tmp1
    lda pyw+1
    adc #0
    sta tmp2
    jsr shr3
    sta arow
    ; fl = behaviour_at(lcol, foot_row) ; fr = behaviour_at(rcol, foot_row)
    jsr p2_calc_cols
    lda lcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid_or_plat
    bne @land
    lda rcol
    sta pcol
    lda arow
    sta prow
    jsr cell_solid_or_plat
    bne @land
    ; not landed: if (py2 < WORLD_H_PX-8) py2 += 2 ; jumping2 = 1
    lda pyw
    cmp #<P2_FALL_Y
    lda pyw+1
    sbc #>P2_FALL_Y
    bcs @setair
    lda pyw
    clc
    adc #2
    sta pyw
    lda pyw+1
    adc #0
    sta pyw+1
@setair:
    lda #1
    sta _jumping2
    jmp @store
@land:
    ; py2 = (foot_row << 3) - PH8_2 ; jumping2 = 0
    lda arow
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
    sbc #PH8_2
    sta pyw
    lda tmp2
    sbc #0
    sta pyw+1
    lda #0
    sta _jumping2
@store:
.if PX_WIDE
    lda pxw
    sta _px2
    lda pxw+1
    sta _px2+1
    lda pyw
    sta _py2
    lda pyw+1
    sta _py2+1
.else
    lda pxw
    sta _px2
    lda pyw
    sta _py2
.endif
    rts
.endproc
.endif  ; NES_ASM_PLAYER2

; ===========================================================================
; p2_racer_update — the PLAYER-2 top-down racer (BW_GAME_STYLE 3 + PLAYER2_ENABLED).
; Line-for-line the P1 racer (rc_drive/rc_vel/rc_axis/rc_laps) on the *2 globals +
; PLAYER2 dims, so the four main procs are duplicated onto px2/py2/px2_sub/py2_sub/
; racer_heading2/racer_speed2/racer_cp_stage2/racer_laps2/racer_finished2 (via a
; mechanical sed of the P1 bodies) while the dimension-free helpers (rc_velcomp/
; rc_axis3/rc_probe/rc_rbe) + the rcos16 table + the shared racer scratch are REUSED.
; Gated `.if NES_ASM_PLAYER2 .and NES_ASM_RACER` because it needs the racer helpers
; (only compiled under NES_ASM_RACER) AND the P2 globals (only under NES_ASM_PLAYER2)
; — a 2-player racer build sets both; a 2P non-racer build sets only PLAYER2 and skips
; this. Guarded by if(!(racer_finished || racer_finished2)) = the 2P RACE_OVER.
.if .defined(NES_ASM_PLAYER2) .and .defined(NES_ASM_RACER)
.export _p2_racer_update
.import _racer_heading2, _racer_speed2, _px2, _py2, _px2_sub, _py2_sub
.import _racer_cp_stage2, _racer_laps2, _racer_finished2

RC_XMAX_2 = WORLD_W_PX - PLAYER2_W * 8
RC_YMAX_2 = WORLD_H_PX - PLAYER2_H * 8

.segment "CODE"
.proc p2_rc_drive
    lda _pad2
    and #$02
    beq @noL
    lda _racer_heading2
    clc
    adc #15
    and #15
    sta _racer_heading2
@noL:
    lda _pad2
    and #$01
    beq @noR
    lda _racer_heading2
    clc
    adc #1
    and #15
    sta _racer_heading2
@noR:
    lda _pad2
    and #$88
    bne @accel
    lda _pad2
    and #$04
    bne @brake
    jmp @friction
@accel:
    clc
    lda _racer_speed2
    adc #<RACER_ACCEL
    sta _racer_speed2
    lda _racer_speed2+1
    adc #>RACER_ACCEL
    sta _racer_speed2+1
    sec
    lda #<RACER_MAX_SPEED
    sbc _racer_speed2
    lda #>RACER_MAX_SPEED
    sbc _racer_speed2+1
    bvc @ac1
    eor #$80
@ac1:
    bpl @ret
    lda #<RACER_MAX_SPEED
    sta _racer_speed2
    lda #>RACER_MAX_SPEED
    sta _racer_speed2+1
@ret:
    rts
@brake:
    sec
    lda _racer_speed2
    sbc #<RACER_BRAKE
    sta _racer_speed2
    lda _racer_speed2+1
    sbc #>RACER_BRAKE
    sta _racer_speed2+1
    sec
    lda _racer_speed2
    sbc #<RC_NEG_REV
    lda _racer_speed2+1
    sbc #>RC_NEG_REV
    bvc @br1
    eor #$80
@br1:
    bpl @ret2
    lda #<RC_NEG_REV
    sta _racer_speed2
    lda #>RC_NEG_REV
    sta _racer_speed2+1
@ret2:
    rts
@friction:
    sec
    lda #<RACER_FRICTION
    sbc _racer_speed2
    lda #>RACER_FRICTION
    sbc _racer_speed2+1
    bvc @fr1
    eor #$80
@fr1:
    bpl @frNP
    sec
    lda _racer_speed2
    sbc #<RACER_FRICTION
    sta _racer_speed2
    lda _racer_speed2+1
    sbc #>RACER_FRICTION
    sta _racer_speed2+1
    rts
@frNP:
    sec
    lda _racer_speed2
    sbc #<RC_NEG_FRI
    lda _racer_speed2+1
    sbc #>RC_NEG_FRI
    bvc @fr2
    eor #$80
@fr2:
    bpl @frZ
    clc
    lda _racer_speed2
    adc #<RACER_FRICTION
    sta _racer_speed2
    lda _racer_speed2+1
    adc #>RACER_FRICTION
    sta _racer_speed2+1
    rts
@frZ:
    lda #0
    sta _racer_speed2
    sta _racer_speed2+1
    rts
.endproc

.proc p2_rc_vel
    lda _racer_speed2
    sta ralo
    lda _racer_speed2+1
    sta rahi
    ldx #2
@shr:
    lda rahi
    cmp #$80
    ror rahi
    ror ralo
    dex
    bne @shr
    lda rahi
    bpl @apos
    sec
    lda #0
    sbc ralo
    sta rmaga
    lda #$FF
    sta rsgna
    jmp @vx
@apos:
    lda ralo
    sta rmaga
    lda #0
    sta rsgna
@vx:
    ldx _racer_heading2
    lda rcos16,x
    jsr rc_velcomp
    lda rrlo
    sta rvx
    lda rrhi
    sta rvx+1
    lda _racer_heading2
    clc
    adc #12
    and #15
    tax
    lda rcos16,x
    jsr rc_velcomp
    lda rrlo
    sta rvy
    lda rrhi
    sta rvy+1
    rts
.endproc

.proc p2_rc_axis
    ; ===== X =====
    lda _px2
    sta rklo
    lda _px2+1
    sta rkhi
    lda _px2_sub
    sta rksb
    clc
    lda _px2_sub
    adc rvx
    sta _px2_sub
    lda rvx+1
    adc #0
    sta rdhi
    clc
    lda _px2
    adc rdhi
    sta rnlo
    lda rdhi
    bpl @xp
    lda #$FF
    bne @xa
@xp:
    lda #0
@xa:
    adc _px2+1
    sta rnhi
    lda rnhi
    bpl @xnn
    lda #0
    sta rnlo
    sta rnhi
    sta _px2_sub
    jmp @xst
@xnn:
    lda #<RC_XMAX_2
    cmp rnlo
    lda #>RC_XMAX_2
    sbc rnhi
    bcs @xst
    lda #<RC_XMAX_2
    sta rnlo
    lda #>RC_XMAX_2
    sta rnhi
    lda #0
    sta _px2_sub
@xst:
    lda rnlo
    sta _px2
    lda rnhi
    sta _px2+1
    lda _px2
    sta rbx
    lda _px2+1
    sta rbx+1
    lda _py2
    sta rby
    lda _py2+1
    sta rby+1
    lda #PLAYER2_W
    sta rbw
    lda #PLAYER2_H
    sta rbh
    jsr rc_rbe
    beq @xok
    lda rklo
    sta _px2
    lda rkhi
    sta _px2+1
    lda rksb
    sta _px2_sub
    lda #1
    sta rhitx
    jmp @ybeg
@xok:
    lda #0
    sta rhitx
@ybeg:
    ; ===== Y =====
    lda _py2
    sta rklo
    lda _py2+1
    sta rkhi
    lda _py2_sub
    sta rksb
    clc
    lda _py2_sub
    adc rvy
    sta _py2_sub
    lda rvy+1
    adc #0
    sta rdhi
    clc
    lda _py2
    adc rdhi
    sta rnlo
    lda rdhi
    bpl @yp
    lda #$FF
    bne @ya
@yp:
    lda #0
@ya:
    adc _py2+1
    sta rnhi
    lda rnhi
    bpl @ynn
    lda #0
    sta rnlo
    sta rnhi
    sta _py2_sub
    jmp @yst
@ynn:
    lda #<RC_YMAX_2
    cmp rnlo
    lda #>RC_YMAX_2
    sbc rnhi
    bcs @yst
    lda #<RC_YMAX_2
    sta rnlo
    lda #>RC_YMAX_2
    sta rnhi
    lda #0
    sta _py2_sub
@yst:
    lda rnlo
    sta _py2
    lda rnhi
    sta _py2+1
    lda _px2
    sta rbx
    lda _px2+1
    sta rbx+1
    lda _py2
    sta rby
    lda _py2+1
    sta rby+1
    lda #PLAYER2_W
    sta rbw
    lda #PLAYER2_H
    sta rbh
    jsr rc_rbe
    beq @yok
    lda rklo
    sta _py2
    lda rkhi
    sta _py2+1
    lda rksb
    sta _py2_sub
    lda #1
    sta rhity
    jmp @bleed
@yok:
    lda #0
    sta rhity
@bleed:
    ; avx -> rnlo:rnhi, avy -> rklo:rkhi
    lda rvx+1
    bpl @avxp
    sec
    lda #0
    sbc rvx
    sta rnlo
    lda #0
    sbc rvx+1
    sta rnhi
    jmp @avy
@avxp:
    lda rvx
    sta rnlo
    lda rvx+1
    sta rnhi
@avy:
    lda rvy+1
    bpl @avyp
    sec
    lda #0
    sbc rvy
    sta rklo
    lda #0
    sbc rvy+1
    sta rkhi
    jmp @cond
@avyp:
    lda rvy
    sta rklo
    lda rvy+1
    sta rkhi
@cond:
    lda rhitx
    beq @tryhy
    lda rnlo
    cmp rklo
    lda rnhi
    sbc rkhi
    bcs @burn           ; avx >= avy
@tryhy:
    lda rhity
    beq @done
    lda rklo
    cmp rnlo
    lda rkhi
    sbc rnhi
    bcs @burn           ; avy >= avx
    jmp @done
@burn:
    lda _racer_speed2+1
    cmp #$80
    ror _racer_speed2+1
    ror _racer_speed2
@done:
    rts
.endproc

.proc p2_rc_laps
    clc
    lda _px2
    adc #(PLAYER2_W * 4)
    sta tmp1
    lda _px2+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    ldx #0
    jsr pushax
    clc
    lda _py2
    adc #(PLAYER2_H * 4)
    sta tmp1
    lda _py2+1
    adc #0
    sta tmp2
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lsr tmp2
    ror tmp1
    lda tmp1
    ldx #0
    jsr _behaviour_at
    sta rmid
    cmp #RC_CP1
    bne @notcp1
    lda _racer_cp_stage2
    bne @done
    lda #1
    sta _racer_cp_stage2
    jmp @done
@notcp1:
    lda rmid
    cmp #RC_CP2
    bne @notcp2
    lda _racer_cp_stage2
    cmp #1
    bne @done
    lda #2
    sta _racer_cp_stage2
    jmp @done
@notcp2:
    lda rmid
    cmp #RC_FINISH
    bne @done
    lda _racer_cp_stage2
    cmp #RACER_CP_COUNT
    bcc @done
    lda #0
    sta _racer_cp_stage2
    inc _racer_laps2
    lda _racer_laps2
    cmp #RACER_LAPS_TO_WIN
    bcc @done
    lda #1
    sta _racer_finished2
@done:
    rts
.endproc

; _p2_racer_update — compose in the C's order, guarded by the 2P RACE_OVER
; (!(racer_finished || racer_finished2)). _racer_finished is imported by the
; NES_ASM_RACER section (active whenever this P2-racer section is).
.proc _p2_racer_update
    lda _racer_finished
    bne @done
    lda _racer_finished2
    bne @done
    jsr p2_rc_drive
    jsr p2_rc_vel
    jsr p2_rc_axis
    jsr p2_rc_laps
@done:
    rts
.endproc
.endif  ; NES_ASM_PLAYER2 .and NES_ASM_RACER
