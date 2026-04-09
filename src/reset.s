; =============================================================================
; reset.s - NES Startup & NMI Handler
; =============================================================================
; This file contains the low-level assembly code that runs before main.c
; and handles the NMI (Non-Maskable Interrupt) that fires every frame.
;
; WHAT THIS DOES:
; 1. When the NES powers on, it jumps to "reset" (defined at the bottom)
; 2. "reset" sets up the hardware and then calls main() in main.c
; 3. Every frame, the PPU triggers an NMI interrupt
; 4. The NMI handler copies all sprite data to the PPU using DMA
;
; You probably don't need to edit this file unless you're adding
; new interrupt handlers or changing the memory layout.
; =============================================================================

; Import the main function from C code so we can call it
.import _main

; cc65 runtime needs these symbols
.importzp sp              ; C stack pointer (in zero page)
.export __STARTUP__: absolute = 1  ; Tell linker we have a startup segment

; =============================================================================
; iNES HEADER
; =============================================================================
; Every NES ROM starts with a 16-byte header that tells the emulator (or
; hardware) about the cartridge. The magic bytes "NES" + $1A identify it.

.segment "HEADER"
.byte "NES", $1A          ; iNES magic number
.byte 2                    ; 2 x 16KB PRG-ROM banks = 32KB of code
.byte 1                    ; 1 x  8KB CHR-ROM bank  =  8KB of graphics
.byte $01                  ; Mapper 0 (NROM), vertical mirroring
.byte $00                  ; No special features

; Hardware register addresses
PPUCTRL  = $2000
PPUMASK  = $2001
PPUSTATUS = $2002
OAMADDR  = $2003
OAMDMA   = $4014
PPUSCROLL = $2005

; =============================================================================
; OAM BUFFER - Sprite data lives here
; =============================================================================
; This reserves 256 bytes at address $0200 for sprite data.
; The C code writes to this buffer, and the NMI handler copies it
; to the PPU every frame using DMA (Direct Memory Access).
;
; The .export lines make these variables visible to the C code
; (that's how "extern unsigned char oam_buf[256]" in main.c finds them).

.segment "OAM"
.export _oam_buf
_oam_buf: .res 256        ; 64 sprites x 4 bytes each

.segment "BSS"
.export _nmi_ready
_nmi_ready: .res 1        ; Flag: 1 = C code finished a frame, safe to update PPU

; =============================================================================
; NMI HANDLER - Runs automatically every frame
; =============================================================================
; The PPU triggers this interrupt when it finishes drawing a frame.
; We use it to copy the sprite buffer to the PPU via DMA.
; DMA stands for "Direct Memory Access" - it copies 256 bytes
; from our buffer to the PPU's sprite memory in one fast operation.

.segment "CODE"
.proc nmi
    ; Save the registers we're going to use
    ; (we need to restore them when we're done so the game code
    ; isn't confused when it resumes)
    pha                    ; Save A register
    txa
    pha                    ; Save X register
    tya
    pha                    ; Save Y register

    ; Check if the game logic has finished a frame
    lda _nmi_ready
    beq @skip              ; If nmi_ready == 0, skip the update

    ; --- Copy sprites to PPU using DMA ---
    ; Writing the high byte of our buffer address ($02) to $4014
    ; triggers the hardware to copy 256 bytes from $0200-$02FF
    ; to the PPU's sprite memory. This is fast and glitch-free.
    lda #$00
    sta OAMADDR            ; Start at sprite 0
    lda #>(_oam_buf)       ; High byte of oam_buf address
    sta OAMDMA             ; Trigger DMA copy!

    ; Reset scroll position (important - DMA can mess this up)
    lda #$00
    sta PPUSCROLL
    sta PPUSCROLL

    ; Clear the ready flag so we don't update again until
    ; the game logic finishes the next frame
    lda #$00
    sta _nmi_ready

@skip:
    ; Restore the registers we saved
    pla
    tay                    ; Restore Y
    pla
    tax                    ; Restore X
    pla                    ; Restore A
    rti                    ; Return from interrupt
.endproc

; =============================================================================
; RESET - First code that runs when the NES powers on
; =============================================================================
; This sets up the NES hardware and then jumps to main() in C.

.import __SRAM_START__, __SRAM_SIZE__

.segment "STARTUP"
.proc reset
    sei                    ; Disable interrupts during setup
    cld                    ; Clear decimal mode (NES doesn't use it)

    ; Disable PPU rendering and NMI during setup
    lda #$00
    sta PPUCTRL
    sta PPUMASK

    ; Wait for PPU to stabilize (need to wait 2 vblanks)
    ; First vblank wait:
@vblank1:
    bit PPUSTATUS
    bpl @vblank1

    ; Clear all RAM to zero during the wait
    lda #$00
    ldx #$00
@clear_ram:
    sta $0000, x
    sta $0100, x
    sta $0200, x
    sta $0300, x
    sta $0400, x
    sta $0500, x
    sta $0600, x
    sta $0700, x
    inx
    bne @clear_ram

    ; Second vblank wait:
@vblank2:
    bit PPUSTATUS
    bpl @vblank2

    ; Move all sprites off-screen (Y = $FF)
    ldx #$00
    lda #$FF
@clear_oam:
    sta _oam_buf, x
    inx
    bne @clear_oam

    ; Set up the C stack pointer
    ; The cc65 runtime uses a software stack in zero page (sp)
    ; We point it to the top of SRAM
    lda #<(__SRAM_START__ + __SRAM_SIZE__)
    sta sp
    lda #>(__SRAM_START__ + __SRAM_SIZE__)
    sta sp+1

    ; Everything is set up - jump to the C main function!
    jmp _main
.endproc

; =============================================================================
; WAITVSYNC - Wait for the next frame
; =============================================================================
; This is called from C code as waitvsync().
; It waits until the PPU signals the start of vertical blank (vblank)
; by checking bit 7 of PPU status register $2002.
; The game loop calls this to sync to 60fps (the NES refresh rate).

.export _waitvsync
.proc _waitvsync
@wait:
    bit PPUSTATUS          ; Check PPU status - bit 7 = vblank started
    bpl @wait              ; If bit 7 is 0, keep waiting
    rts                    ; Vblank started, return to game code
.endproc

; =============================================================================
; IRQ HANDLER - Not used yet
; =============================================================================
.proc irq
    rti                    ; Just return immediately
.endproc

; =============================================================================
; INTERRUPT VECTORS
; =============================================================================
; These tell the NES CPU where to jump for each type of interrupt:
;   $FFFA = NMI (fires every frame - we use this for sprite DMA)
;   $FFFC = RESET (fires when the NES powers on or resets)
;   $FFFE = IRQ (not used in our game yet)

.segment "VECTORS"
.word nmi                  ; NMI vector -> our NMI handler
.word reset                ; Reset vector -> our startup code
.word irq                  ; IRQ vector -> empty handler
