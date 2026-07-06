; =============================================================================
; Step 3 - Enemies and Items, hand-tuned ASM
; =============================================================================
; TUNABLES are grouped below. This is the Step 2 tuned engine plus two patrolling
; enemies, four gems, a heart pickup, item collision, and direct OAM drawing.

        .setcpu "6502"
        .smart  on
        .autoimport on
        .case   on

        .forceimport __STARTUP__
        .import _waitvsync, _load_background
        .importzp tmp1, tmp2, tmp3, tmp4
        .export _main

PPUCTRL   = $2000
PPUMASK   = $2001
OAMADDR   = $2003
OAMDATA   = $2004
PPUSCROLL = $2005
PPUADDR   = $2006
PPUDATA   = $2007
JOYPAD1   = $4016

BTN_UP    = $08
BTN_DOWN  = $04
BTN_LEFT  = $02
BTN_RIGHT = $01

; --- TUNABLES ---------------------------------------------------------------
PLAYER_START_X = 60
PLAYER_START_Y = 176
FLOOR_Y        = 176
JUMP_FRAMES    = 15
WALK_TICKS     = 7
MOVE_SPEED     = 1
JUMP_PIXELS    = 3
FALL_PIXELS    = 3

SLIME_START_X  = 150
SLIME_START_Y  = 192
SLIME_LEFT     = 120
SLIME_RIGHT    = 200
SKEL_START_X   = 80
SKEL_START_Y   = 128
SKEL_LEFT      = 64
SKEL_RIGHT     = 112
ENEMY_SPEED    = 3

HEART_START_X  = 176
HEART_START_Y  = 104

BG_SKY         = $21
BG_GRASS       = $29
BG_GRASS_DARK  = $19
BG_DIRT        = $07
BG_STONE_1     = $00
BG_STONE_2     = $10
BG_STONE_3     = $2D
PLAYER_C1      = $30
PLAYER_C2      = $27
PLAYER_C3      = $17
SLIME_C1       = $1A
SLIME_C2       = $30
SLIME_C3       = $0A
SKEL_C1        = $30
SKEL_C2        = $16
SKEL_C3        = $00
ITEM_C1        = $16
ITEM_C2        = $36
ITEM_C3        = $06

FACE_RIGHT = $00
FACE_LEFT  = $40

; Tile numbers.
TILE_SLIME_TL = $40
TILE_SLIME_TR = $41
TILE_SLIME_BL = $50
TILE_SLIME_BR = $51
TILE_SKEL_TL  = $44
TILE_SKEL_TR  = $45
TILE_SKEL_BL  = $54
TILE_SKEL_BR  = $55
TILE_GEM      = $48
TILE_HEART    = $49

.segment "DATA"

enemy1_x:        .byte SLIME_START_X
enemy1_y:        .byte SLIME_START_Y
enemy1_dir:      .byte $01
enemy1_left:     .byte SLIME_LEFT
enemy1_right:    .byte SLIME_RIGHT
enemy2_x:        .byte SKEL_START_X
enemy2_y:        .byte SKEL_START_Y
enemy2_dir:      .byte $01
enemy2_left:     .byte SKEL_LEFT
enemy2_right:    .byte SKEL_RIGHT
enemy_timer:     .byte $00
enemy_speed:     .byte ENEMY_SPEED
gem_x:           .byte 100, 140, 180, 88
gem_y:           .byte 168, 168, 168, 104
gem_collected:   .byte 0, 0, 0, 0
heart_x:         .byte HEART_START_X
heart_y:         .byte HEART_START_Y
heart_collected: .byte $00
score:           .byte $00

.segment "RODATA"

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

.macro PPU_SEEK hi, lo
        lda #hi
        sta PPUADDR
        lda #lo
        sta PPUADDR
.endmacro

.macro OAM_SPR yval, tileval, attrval, xval
        lda yval
        sta OAMDATA
        lda #tileval
        sta OAMDATA
        lda #attrval
        sta OAMDATA
        lda xval
        sta OAMDATA
.endmacro

.proc reset_scroll
        lda #$00
        sta PPUSCROLL
        sta PPUSCROLL
        rts
.endproc

.proc write_palettes
        PPU_SEEK $3F, $00
        lda #BG_SKY
        sta PPUDATA
        lda #BG_GRASS
        sta PPUDATA
        lda #BG_GRASS_DARK
        sta PPUDATA
        lda #BG_DIRT
        sta PPUDATA

        PPU_SEEK $3F, $05
        lda #BG_STONE_1
        sta PPUDATA
        lda #BG_STONE_2
        sta PPUDATA
        lda #BG_STONE_3
        sta PPUDATA

        PPU_SEEK $3F, $11
        lda #PLAYER_C1
        sta PPUDATA
        lda #PLAYER_C2
        sta PPUDATA
        lda #PLAYER_C3
        sta PPUDATA

        PPU_SEEK $3F, $15
        lda #SLIME_C1
        sta PPUDATA
        lda #SLIME_C2
        sta PPUDATA
        lda #SLIME_C3
        sta PPUDATA

        PPU_SEEK $3F, $19
        lda #SKEL_C1
        sta PPUDATA
        lda #SKEL_C2
        sta PPUDATA
        lda #SKEL_C3
        sta PPUDATA

        PPU_SEEK $3F, $1D
        lda #ITEM_C1
        sta PPUDATA
        lda #ITEM_C2
        sta PPUDATA
        lda #ITEM_C3
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
        jsr _load_background
        lda #$10
        sta PPUCTRL
        jsr reset_scroll
        lda #$1E
        sta PPUMASK
        rts
.endproc

.proc read_controller
        lda #$01
        sta JOYPAD1
        lsr a
        sta JOYPAD1
        ldx #$08
@read:  lda JOYPAD1
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
@down:  lda pad
        and #BTN_DOWN
        beq @left
        lda player_y
        cmp #FLOOR_Y
        bcs @left
        inc player_y
@left:  lda pad
        and #BTN_LEFT
        beq @right
        lda player_x
        sec
        sbc #MOVE_SPEED
        sta player_x
        lda #FACE_LEFT
        sta facing
        jsr step_walk
@right: lda pad
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

.proc patrol_enemy1
        lda enemy1_dir
        beq @left
        inc enemy1_x
        lda enemy1_x
        cmp enemy1_right
        bcc @done
        lda #$00
        sta enemy1_dir
        rts
@left:  dec enemy1_x
        lda enemy1_x
        cmp enemy1_left
        beq @turn_right
        bcs @done
@turn_right:
        lda #$01
        sta enemy1_dir
@done:  rts
.endproc

.proc patrol_enemy2
        lda enemy2_dir
        beq @left
        inc enemy2_x
        lda enemy2_x
        cmp enemy2_right
        bcc @done
        lda #$00
        sta enemy2_dir
        rts
@left:  dec enemy2_x
        lda enemy2_x
        cmp enemy2_left
        beq @turn_right
        bcs @done
@turn_right:
        lda #$01
        sta enemy2_dir
@done:  rts
.endproc

.proc update_enemies
        inc enemy_timer
        lda enemy_timer
        cmp enemy_speed
        bcc @done
        lda #$00
        sta enemy_timer
        jsr patrol_enemy1
        jsr patrol_enemy2
@done:  rts
.endproc

; tmp1=item x, tmp2=item y. Returns A=1 if player overlaps 16x32 vs 8x8 item.
.proc item_overlap
        lda player_x
        clc
        adc #16
        cmp tmp1
        beq @no
        bcc @no

        lda tmp1
        clc
        adc #8
        cmp player_x
        beq @no
        bcc @no

        lda player_y
        clc
        adc #32
        cmp tmp2
        beq @no
        bcc @no

        lda tmp2
        clc
        adc #8
        cmp player_y
        beq @no
        bcc @no

        lda #$01
        rts
@no:    lda #$00
        rts
.endproc

.proc collect_items
        ldx #$00
@gem:
        lda gem_collected,x
        bne @next
        lda gem_x,x
        sta tmp1
        lda gem_y,x
        sta tmp2
        txa
        pha
        jsr item_overlap
        sta tmp4
        pla
        tax
        lda tmp4
        beq @next
        lda #$01
        sta gem_collected,x
        inc score
@next:  inx
        cpx #$04
        bne @gem

        lda heart_collected
        bne @done
        lda heart_x
        sta tmp1
        lda heart_y
        sta tmp2
        jsr item_overlap
        beq @done
        lda #$01
        sta heart_collected
@done:  rts
.endproc

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

.proc draw_enemies
        ; Slime, palette 1.
        OAM_SPR enemy1_y, TILE_SLIME_TL, $01, enemy1_x
        lda enemy1_y
        sta OAMDATA
        lda #TILE_SLIME_TR
        sta OAMDATA
        lda #$01
        sta OAMDATA
        lda enemy1_x
        clc
        adc #8
        sta OAMDATA
        lda enemy1_y
        clc
        adc #8
        sta OAMDATA
        lda #TILE_SLIME_BL
        sta OAMDATA
        lda #$01
        sta OAMDATA
        lda enemy1_x
        sta OAMDATA
        lda enemy1_y
        clc
        adc #8
        sta OAMDATA
        lda #TILE_SLIME_BR
        sta OAMDATA
        lda #$01
        sta OAMDATA
        lda enemy1_x
        clc
        adc #8
        sta OAMDATA

        ; Skeleton, palette 2.
        OAM_SPR enemy2_y, TILE_SKEL_TL, $02, enemy2_x
        lda enemy2_y
        sta OAMDATA
        lda #TILE_SKEL_TR
        sta OAMDATA
        lda #$02
        sta OAMDATA
        lda enemy2_x
        clc
        adc #8
        sta OAMDATA
        lda enemy2_y
        clc
        adc #8
        sta OAMDATA
        lda #TILE_SKEL_BL
        sta OAMDATA
        lda #$02
        sta OAMDATA
        lda enemy2_x
        sta OAMDATA
        lda enemy2_y
        clc
        adc #8
        sta OAMDATA
        lda #TILE_SKEL_BR
        sta OAMDATA
        lda #$02
        sta OAMDATA
        lda enemy2_x
        clc
        adc #8
        sta OAMDATA
        rts
.endproc

.proc draw_items
        ldx #$00
@gem:
        lda gem_collected,x
        beq @visible
        lda #$FF
        sta OAMDATA
        lda #TILE_GEM
        sta OAMDATA
        lda #$03
        sta OAMDATA
        lda #$00
        sta OAMDATA
        jmp @next
@visible:
        lda gem_y,x
        sta OAMDATA
        lda #TILE_GEM
        sta OAMDATA
        lda #$03
        sta OAMDATA
        lda gem_x,x
        sta OAMDATA
@next:  inx
        cpx #$04
        bne @gem

        lda heart_collected
        beq @heart_visible
        lda #$FF
        sta OAMDATA
        lda #TILE_HEART
        sta OAMDATA
        lda #$03
        sta OAMDATA
        lda #$00
        sta OAMDATA
        rts
@heart_visible:
        lda heart_y
        sta OAMDATA
        lda #TILE_HEART
        sta OAMDATA
        lda #$03
        sta OAMDATA
        lda heart_x
        sta OAMDATA
        rts
.endproc

.proc game_update
        jsr read_controller
        sta pad
        jsr update_player
        jsr apply_gravity
        jsr update_enemies
        jsr collect_items
        rts
.endproc

.proc game_draw
        jsr _waitvsync
        jsr reset_scroll
        lda #$00
        sta OAMADDR
        jsr draw_player
        jsr draw_enemies
        jsr draw_items
        rts
.endproc

.proc _main
        jsr init_player
        jsr init_game
@loop:  jsr game_update
        jsr game_draw
        jmp @loop
.endproc
