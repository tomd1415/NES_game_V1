;======================================================================================================================
; FamiStudio NMI hook — Phase 4.3 follow-up.
;
; Without this, famistudio_update() was called from the main loop
; (after waitvsync, inside the vblank work block).  That means the
; music advanced at whatever rate the main loop happened to be
; running at.  When the pupil's player started moving, per-frame
; game logic got heavier, the main loop dropped below 60 Hz, and
; the music tempo dropped in proportion.
;
; Wiring famistudio_update into the hardware NMI handler instead
; means it fires exactly once per PPU vblank (≈60 Hz NTSC) no
; matter how busy or slow the main loop gets.  The standard NES
; pattern.  Only used when USE_AUDIO=1 is set on the make line —
; without it this file isn't assembled or linked, and the iNES
; ROM's NMI vector stays null exactly as before.
;
; Notes on safety:
;   - famistudio_update only writes to APU registers ($4000-$4017).
;     It never touches the PPU, so interrupting a mid-frame
;     scroll_stream column burst doesn't corrupt the rendering
;     pipeline.
;   - FamiStudio's zero-page footprint lives in its own segment
;     (FAMISTUDIO_ZP) declared in cfg/nes.cfg, separate from cc65's
;     ZEROPAGE — so the NMI handler can scribble there without
;     disturbing whatever the main loop was doing in cc65 ZP.
;   - We save A/X/Y around the call because famistudio_update
;     clobbers them, and the main loop's interrupted code expects
;     them preserved across an interrupt return.
;======================================================================================================================

.import _famistudio_update
.export _famistudio_nmi_handler

.segment "CODE"

.proc _famistudio_nmi_handler
    pha
    txa
    pha
    tya
    pha

    jsr _famistudio_update

    pla
    tay
    pla
    tax
    pla
    rti
.endproc
