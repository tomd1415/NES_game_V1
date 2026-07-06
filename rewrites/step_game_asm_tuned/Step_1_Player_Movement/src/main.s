; =============================================================================
; Step 1 - Player Movement, hand-tuned ASM
; =============================================================================
; User-changeable values live in the TUNABLES block. The routines below mirror
; the modular C version, but avoid cc65 stack helpers in hot functions.

        .setcpu "6502"
        .smart  on
        .autoimport on
        .case   on

        .forceimport __STARTUP__
        .import _waitvsync
        .importzp tmp1, tmp2, tmp3
        .export _main

; --- NES registers -----------------------------------------------------------
PPUMASK   = $2001
OAMADDR   = $2003
OAMDATA   = $2004
PPUADDR   = $2006
PPUDATA   = $2007
JOYPAD1   = $4016

; --- Controller bits ---------------------------------------------------------
BTN_UP    = $08
BTN_DOWN  = $04
BTN_LEFT  = $02
BTN_RIGHT = $01

; --- TUNABLES: change these values to alter the game ------------------------
PLAYER_START_X = 120
PLAYER_START_Y = 120
FLOOR_Y        = 150
JUMP_FRAMES    = 15
WALK_TICKS     = 7
MOVE_SPEED     = 1
JUMP_PIXELS    = 3
FALL_PIXELS    = 3
BG_COLOR       = $12
SPR_COLOR_1    = $30
SPR_COLOR_2    = $27
SPR_COLOR_3    = $17

FACE_RIGHT = $00
FACE_LEFT  = $40

.segment "RODATA"

; Four 2x4 player frames, two tiles per row.
anim_tiles:
        .byte $01,$02,$11,$12,$21,$22,$31,$32
        .byte $09,$0A,$19,$1A,$29,$2A,$39,$3A
        .byte $01,$02,$11,$12,$21,$22,$31,$32
        .byte $0B,$0C,$1B,$1C,$2B,$2C,$3B,$3C

.segment "BSS"

player_x: .res 1
player_y: .res 1
pad:      .res 1
can_jump: .res 1
jmp_time: .res 1
facing:   .res 1
walk_fr:  .res 1
walk_tk:  .res 1

.segment "CODE"

.proc ppu_seek_3f00
        lda #$3F
        sta PPUADDR
        lda #$00
        sta PPUADDR
        rts
.endproc

.proc ppu_seek_3f11
        lda #$3F
        sta PPUADDR
        lda #$11
        sta PPUADDR
        rts
.endproc

.proc write_palettes
        jsr ppu_seek_3f00
        lda #BG_COLOR
        sta PPUDATA

        jsr ppu_seek_3f11
        lda #SPR_COLOR_1
        sta PPUDATA
        lda #SPR_COLOR_2
        sta PPUDATA
        lda #SPR_COLOR_3
        sta PPUDATA
        rts
.endproc

.proc init_player
        lda #PLAYER_START_X
        sta player_x
        lda #PLAYER_START_Y
        sta player_y
        lda #$00
        sta pad
        sta jmp_time
        sta facing
        sta walk_fr
        sta walk_tk
        lda #$01
        sta can_jump
        rts
.endproc

.proc init_game
        jsr _waitvsync
        lda #$00
        sta PPUMASK
        jsr write_palettes
        lda #$1E
        sta PPUMASK
        rts
.endproc

; Returns A = A,B,Select,Start,Up,Down,Left,Right packed into bits 7..0.
.proc read_controller
        lda #$01
        sta JOYPAD1
        lsr a
        sta JOYPAD1
        ldx #$08
@read:
        lda JOYPAD1
        lsr a
        rol tmp1
        dex
        bne @read
        lda tmp1
        rts
.endproc

.proc step_walk
        inc walk_tk
        lda walk_tk
        cmp #WALK_TICKS
        bcc @done
        inc walk_fr
        lda #$00
        sta walk_tk
@done:  rts
.endproc

.proc begin_jump_if_ready
        lda can_jump
        beq @done
        lda jmp_time
        bne @done
        lda player_y
        sec
        sbc #JUMP_PIXELS
        sta player_y
        lda #JUMP_FRAMES
        sta jmp_time
@done:  rts
.endproc

.proc update_player
        lda pad
        and #BTN_UP
        beq @down
        jsr begin_jump_if_ready

@down: lda pad
        and #BTN_DOWN
        beq @left
        lda player_y
        cmp #FLOOR_Y
        bcs @left
        inc player_y

@left: lda pad
        and #BTN_LEFT
        beq @right
        lda player_x
        sec
        sbc #MOVE_SPEED
        sta player_x
        lda #FACE_LEFT
        sta facing
        jsr step_walk

@right:
        lda pad
        and #BTN_RIGHT
        beq @done
        lda player_x
        clc
        adc #MOVE_SPEED
        sta player_x
        lda #FACE_RIGHT
        sta facing
        jsr step_walk
@done:  rts
.endproc

.proc apply_gravity
        lda player_y
        cmp #FLOOR_Y
        bcc @airborne
        lda #$01
        sta can_jump
        rts

@airborne:
        lda #$00
        sta can_jump
        lda jmp_time
        beq @fall
        dec jmp_time
        lda player_y
        sec
        sbc #JUMP_PIXELS
        sta player_y
        rts

@fall:  lda player_y
        clc
        adc #FALL_PIXELS
        sta player_y
        rts
.endproc

; Draw the 16x32 player as 8 OAM sprites.
; tmp1 = left x, tmp2 = right x, tmp3 = row y, X = tile frame offset.
.proc draw_player
        lda walk_fr
        and #$03
        asl a
        asl a
        asl a
        tax

        lda facing
        cmp #FACE_LEFT
        bne @face_right
        lda player_x
        clc
        adc #$08
        sta tmp1
        lda player_x
        sta tmp2
        jmp @positions_ready

@face_right:
        lda player_x
        sta tmp1
        clc
        adc #$08
        sta tmp2

@positions_ready:
        lda #$00
        sta OAMADDR
        lda player_y
        sta tmp3
        ldy #$04

@row:
        lda tmp3
        sta OAMDATA
        lda anim_tiles,x
        sta OAMDATA
        lda facing
        sta OAMDATA
        lda tmp1
        sta OAMDATA

        lda tmp3
        sta OAMDATA
        lda anim_tiles+1,x
        sta OAMDATA
        lda facing
        sta OAMDATA
        lda tmp2
        sta OAMDATA

        inx
        inx
        lda tmp3
        clc
        adc #$08
        sta tmp3
        dey
        bne @row
        rts
.endproc

.proc game_update
        jsr read_controller
        sta pad
        jsr update_player
        jsr apply_gravity
        rts
.endproc

.proc game_draw
        jsr _waitvsync
        jsr draw_player
        rts
.endproc

.proc _main
        jsr init_player
        jsr init_game
@loop:  jsr game_update
        jsr game_draw
        jmp @loop
.endproc
