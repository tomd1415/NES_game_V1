;======================================================================================================================
; hud_crt0.s — cc65 nes crt0 replacement for the SMB background status bar.
;
; Engine root-cause fix for "the header goes flickery after the first screen".
; The status bar is a sprite-0 split whose whole PPU push (OAM DMA, digit
; repaint, column stream, strip-scroll setup, then the sprite-0 poll) must land
; before the strip's scanlines are drawn.  Run from the main loop (after
; waitvsync) it lands LATE on any frame whose game logic overran vblank
; (scrolling + enemy AI), so PPU_MASK is still 0 while the top scanlines draw and
; the strip shows the sky backdrop -> flicker.
;
; This crt0 moves that push into the NMI, which fires at a fixed hardware time
; (start of vblank) and preempts the game logic, so the strip always renders on
; time; a frame heavy enough to overrun just drops toward 30fps instead of
; tearing the header.  The push is the C function `_hud_present` (it reuses the
; engine's dialogue/blocks/digit/scroll code), so the NMI saves and restores
; cc65's runtime zero page around the call — the interrupted main loop shares
; that zp.
;
; Linked (instead of cc65's stock crt0 or famistudio_crt0.s) ONLY for
; BW_SMB_HUD_BG builds — see the Makefile HUD_NMI switch — so every other ROM
; keeps its existing crt0 and stays byte-identical.  Audio, when enabled, still
; ticks `famistudio_update` from the main loop exactly as before (this file adds
; no audio coupling).
;
; The startup / header / vectors are a verbatim copy of cc65 v2.18's
; libsrc/nes/crt0.s (also the base of famistudio_crt0.s — BSD licence, see
; NOTICE.md); the only change is the NMI handler.
;======================================================================================================================

        .export         _exit
        .export         __STARTUP__ : absolute = 1      ; Mark as startup

        .import         initlib, donelib, callmain
        .import         push0, _main, zerobss, copydata
        .import         ppubuf_flush

        ; The NMI-driven PPU push (platformer.c, gated on BW_SMB_HUD_BG) and the
        ; boot-vs-armed flag it reads (0 during boot -> NMI does bookkeeping only).
        .import         _hud_present
        .import         _hud_ready

        ; Linker-generated symbols
        .import         __RAM_START__, __RAM_SIZE__
        .import         __SRAM_START__, __SRAM_SIZE__
        .import         __ROM0_START__, __ROM0_SIZE__
        .import         __STARTUP_LOAD__,__STARTUP_RUN__, __STARTUP_SIZE__
        .import         __CODE_LOAD__,__CODE_RUN__, __CODE_SIZE__
        .import         __RODATA_LOAD__,__RODATA_RUN__, __RODATA_SIZE__

; ------------------------------------------------------------------------
; Character data
; ------------------------------------------------------------------------
        .forceimport    NESfont

        .include        "zeropage.inc"
        .include        "nes.inc"

; ------------------------------------------------------------------------
; 16-byte iNES header — identical bytes to cc65's stock crt0 (2 PRG, 1 CHR,
; vertical mirror + SRAM, mapper 0).  The server post-processes byte 6 for
; 4-screen worlds (see _patch_ines_four_screen).
; ------------------------------------------------------------------------
.segment        "HEADER"

        .byte   $4e,$45,$53,$1a ; "NES"^Z
        .byte   2               ; ines prg  - number of 16k prg banks.
        .byte   1               ; ines chr  - number of 8k chr banks.
        .byte   %00000011       ; ines mir  - VRAM mirroring of the banks.
        .byte   %00000000       ; ines map  - mapper used.
        .byte   0,0,0,0,0,0,0,0 ; 8 zeroes

; ------------------------------------------------------------------------
; Scratch: a 26-byte save area for cc65's runtime zero page (zpspace), so the
; NMI can call the C `_hud_present` without corrupting the interrupted main
; loop's zp.  The NMI is not reentrant within a frame, so one static buffer is
; enough.
; ------------------------------------------------------------------------
.segment        "BSS"
hud_zpsave:     .res    zpspace

; ------------------------------------------------------------------------
; Startup — verbatim from the stock crt0.
; ------------------------------------------------------------------------
.segment        "STARTUP"

start:
        sei
        cld
        ldx     #0
        stx     VBLANK_FLAG

        stx     ringread
        stx     ringwrite
        stx     ringcount

        txs

        lda     #$20
@l:     sta     ringbuff,x
        sta     ringbuff+$0100,x
        sta     ringbuff+$0200,x
        inx
        bne     @l

        jsr     zerobss
        jsr     copydata

        lda     #<(__SRAM_START__ + __SRAM_SIZE__)
        ldx     #>(__SRAM_START__ + __SRAM_SIZE__)
        sta     sp
        stx     sp+1            ; Set argument stack ptr

        jsr     initlib
        jsr     callmain

_exit:  jsr     donelib         ; Run module destructors
        jmp     start           ; Reset the NES.

; ------------------------------------------------------------------------
; NMI — the NMI-driven status-bar push.
;
; Keeps the stock crt0's VBLANK_FLAG + tickcount bookkeeping (waitvsync in the
; main loop paces to it) and its ppubuf_flush (cc65 conio).  Instead of the
; stock scroll reset, it calls _hud_present, which does the entire PPU push
; (OAM DMA, digit repaint, column stream, strip scroll, sprite-0 poll, playfield
; scroll).  cc65's zero page is saved/restored around the C call.
; ------------------------------------------------------------------------
nmi:    pha
        tya
        pha
        txa
        pha

        lda     #1
        sta     VBLANK_FLAG

        inc     tickcount
        bne     @s
        inc     tickcount+1

@s:     jsr     ppubuf_flush    ; cc65 conio (NMI-safe, no cc65 zp)

        ; Until the main loop arms the push (_hud_ready), do only what the stock
        ; crt0 NMI did (scroll reset) so boot's nametable/palette writes are safe.
        lda     _hud_ready
        bne     @push

        lda     #$20
        sta     PPU_VRAM_ADDR2
        lda     #$00
        sta     PPU_VRAM_ADDR2
        sta     PPU_VRAM_ADDR1
        sta     PPU_VRAM_ADDR1
        jmp     @done

        ; Armed: save cc65's runtime zero page (zpspace bytes from sp), call the
        ; C push, then restore it — the interrupted main loop shares this zp.
@push:  ldx     #zpspace-1
@zs:    lda     sp,x
        sta     hud_zpsave,x
        dex
        bpl     @zs

        jsr     _hud_present

        ldx     #zpspace-1
@zr:    lda     hud_zpsave,x
        sta     sp,x
        dex
        bpl     @zr

@done:  pla
        tax
        pla
        tay
        pla
irq:
        rti

; ------------------------------------------------------------------------
; Hardware vectors
; ------------------------------------------------------------------------
.segment "VECTORS"

        .word   nmi         ; $fffa vblank nmi
        .word   start       ; $fffc reset
        .word   irq         ; $fffe irq / brk
