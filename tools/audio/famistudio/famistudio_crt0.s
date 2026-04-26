;======================================================================================================================
; FamiStudio crt0 — replaces cc65's nes.lib crt0 when USE_AUDIO=1.
;
; Why this file exists.  cc65's stock NES crt0 (libsrc/nes/crt0.s in
; v2.18) supplies the iNES header AND the `VECTORS` segment containing
; the NMI / RESET / IRQ pointers.  Crucially its NMI vector points at
; an internal handler that does ppubuf_flush + a scroll reset + RTI —
; with NO hook for project-level NMI work.  A user-land `vectors[]`
; array in main.c lands in RODATA by default, NOT in `VECTORS`, so it
; cannot redirect the NMI vector at link time.
;
; That means the only way to get famistudio_update to fire from the
; hardware vblank interrupt is to provide our own crt0 with our own
; `VECTORS` segment + our own NMI handler.  ld65 pulls library objects
; only to satisfy unresolved symbols; once *this* file exports
; `__STARTUP__` and `_exit`, the linker no longer pulls cc65's crt0
; from nes.lib, and we control the vectors.
;
; The body of this file is copied verbatim from cc65 v2.18's
; libsrc/nes/crt0.s (BSD licence — see NOTICE.md).  The single
; substantive change is in the NMI handler: we add
;   jsr _famistudio_update
; right before the register-restore.  Everything else (ppubuf_flush,
; tickcount, PPU_VRAM_ADDR1/2 resets that cc65's conio relies on) is
; preserved so we don't accidentally break any cc65 runtime feature
; the rest of the project might depend on.
;
; Only used when USE_AUDIO=1 — without it the project links cc65's
; standard crt0 exactly as before, so the byte-identical baseline is
; unaffected.
;======================================================================================================================

        .export         _exit
        .export         __STARTUP__ : absolute = 1      ; Mark as startup

        .import         initlib, donelib, callmain
        .import         push0, _main, zerobss, copydata
        .import         ppubuf_flush

        ; Phase 4.3 follow-up — pulled from famistudio_engine.s, called
        ; from the NMI handler below so music ticks at hardware vblank
        ; rate regardless of main-loop work.
        .import         _famistudio_update

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
; 16-byte INES header — same hardcoded values cc65's stock crt0 emits
; (2 PRG banks, 1 CHR bank, vertical mirror + SRAM, mapper 0).  The
; playground server post-processes byte 6 to flip the 4-screen bit on
; multi-screen worlds (see _patch_ines_four_screen in
; tools/playground_server.py) so we don't need to vary it here.

.segment        "HEADER"

        .byte   $4e,$45,$53,$1a ; "NES"^Z
        .byte   2               ; ines prg  - Specifies the number of 16k prg banks.
        .byte   1               ; ines chr  - Specifies the number of 8k chr banks.
        .byte   %00000011       ; ines mir  - Specifies VRAM mirroring of the banks.
        .byte   %00000000       ; ines map  - Specifies the NES mapper used.
        .byte   0,0,0,0,0,0,0,0 ; 8 zeroes


; ------------------------------------------------------------------------
; Place the startup code in a special segment.

.segment        "STARTUP"

start:

; Set up the CPU and System-IRQ.

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

; Clear the BSS data.

        jsr     zerobss

; Initialize the data.
        jsr     copydata

; Set up the stack.

        lda     #<(__SRAM_START__ + __SRAM_SIZE__)
        ldx     #>(__SRAM_START__ + __SRAM_SIZE__)
        sta     sp
        stx     sp+1            ; Set argument stack ptr

; Call the module constructors.

        jsr     initlib

; Push the command-line arguments; and, call main().

        jsr     callmain

; Call the module destructors. This is also the exit() entry.

_exit:  jsr     donelib         ; Run module destructors

; Reset the NES.

        jmp start

; ------------------------------------------------------------------------
; System V-Blank Interrupt
; Updates PPU Memory (buffered).
; Updates VBLANK_FLAG and tickcount.
; Phase 4.3 follow-up: also calls famistudio_update so music ticks at
; the hardware vblank rate independent of main-loop cost.
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

@s:     jsr     ppubuf_flush

        ; Reset the video counter.
        lda     #$20
        sta     PPU_VRAM_ADDR2
        lda     #$00
        sta     PPU_VRAM_ADDR2

        ; Reset scrolling.
        sta     PPU_VRAM_ADDR1
        sta     PPU_VRAM_ADDR1

        ; --- FamiStudio engine tick ----------------------------------------
        ; Drives the music + sfx engine at exactly 60 Hz NTSC.  The
        ; main loop's scroll_apply_ppu() rewrites PPU_SCROLL right
        ; after waitvsync exits anyway, so the cc65 scroll-reset above
        ; is a no-op once the actual game frame work runs — we don't
        ; need to skip it.  famistudio_update only writes APU
        ; registers ($4000-$4017), never PPU, so it cannot interfere
        ; with the scroll/PPU register state we leave behind here.
        jsr     _famistudio_update

        pla
        tax
        pla
        tay
        pla

; Interrupt exit

irq:
        rti


; ------------------------------------------------------------------------
; Hardware vectors
; ------------------------------------------------------------------------

.segment "VECTORS"

        .word   nmi         ; $fffa vblank nmi
        .word   start       ; $fffc reset
        .word   irq         ; $fffe irq / brk
