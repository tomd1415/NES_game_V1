; =============================================================================
; graphics.s - Tile Data and Level Data
; =============================================================================
; This file includes the graphics (CHR) data and level nametable.
;
; The CHR file is split into two halves:
;   First 4KB  (pattern table 0): Sprite tiles (player, enemies, items)
;   Second 4KB (pattern table 1): Background tiles (ground, platforms, sky)
;
; The nametable defines which background tiles go where on screen.

; Hardware registers
PPUMASK = $2001
PPUADDR = $2006
PPUDATA = $2007

; =============================================================================
; LOAD BACKGROUND - Copy nametable data to PPU
; =============================================================================
; This routine copies the level layout to PPU nametable 0 ($2000).
; Called once during initialization to set up the background.
;
; C prototype: void load_background(void);

.segment "CODE"
.export _load_background
.proc _load_background
    ; Set PPU address to nametable 0 ($2000)
    lda #$20
    sta PPUADDR
    lda #$00
    sta PPUADDR

    ; Copy 1024 bytes (960 tile bytes + 64 attribute bytes)
    lda #<level1_nam
    sta $00              ; zero page pointer low byte
    lda #>level1_nam
    sta $01              ; zero page pointer high byte

    ldx #4               ; 4 pages of 256 bytes = 1024 bytes
    ldy #0
@loop:
    lda ($00),y
    sta PPUDATA
    iny
    bne @loop
    inc $01              ; next page
    dex
    bne @loop

    rts
.endproc

; =============================================================================
; LEVEL DATA (stored in ROM)
; =============================================================================
.segment "RODATA"
level1_nam: .incbin "../assets/backgrounds/level1.nam"

; =============================================================================
; CHR TILE DATA
; =============================================================================
; This is the combined sprite + background tile graphics.
; Automatically loaded into the PPU's pattern tables by the hardware.
.segment "CHARS"
.incbin "../assets/sprites/game.chr"
