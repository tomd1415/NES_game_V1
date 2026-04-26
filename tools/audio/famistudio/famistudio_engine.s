;======================================================================================================================
; FamiStudio engine wrapper for the NES Game Editor playground.
;
; The vendored famistudio_ca65.s ships with a bundled config block at
; the top.  We want a *different* set of feature flags for our use
; case — primarily we need SFX support on (the bundled defaults turn
; it off).  Rather than edit the vendored file (which sync.sh would
; clobber on the next upstream pull), this wrapper sets
; FAMISTUDIO_CFG_EXTERNAL = 1 *first* — that flag tells the engine to
; skip its own bundled config and trust the external definitions
; below — then `.include`s the engine source verbatim.
;
; ca65 inlines `.include` source-level, so the wrapper compiles into
; one object file containing all the engine's symbols.  The Makefile
; assembles only this wrapper; the vendored engine never goes through
; ca65 directly.
;======================================================================================================================

; ---- Segment names --------------------------------------------------
; The engine asks the consumer to nominate which cfg segments hold
; its zero-page, RAM/BSS and code symbols.  These must match the
; segment names declared in the linker config (cfg/nes.cfg).
.define FAMISTUDIO_CA65_ZP_SEGMENT   FAMISTUDIO_ZP
.define FAMISTUDIO_CA65_RAM_SEGMENT  FAMISTUDIO_BSS
.define FAMISTUDIO_CA65_CODE_SEGMENT FAMISTUDIO_CODE

; ---- Feature flags -------------------------------------------------
; Tell the engine's bundled config block to bow out — we're providing
; the flags ourselves below.
FAMISTUDIO_CFG_EXTERNAL          = 1

; Platform — NTSC only on this cartridge.  The cfg's mirroring fix
; (Phase 4.4) is independent of audio.
FAMISTUDIO_CFG_NTSC_SUPPORT      = 1
FAMISTUDIO_CFG_PAL_SUPPORT       = 0

; Sound effects on.  Two SFX channels means two simultaneous sound
; effects can play (e.g. a jump while a coin pickup is still
; ringing).  Three to four is fine but eats ROM; two covers the
; pupil-facing event vocabulary cleanly.
FAMISTUDIO_CFG_SFX_SUPPORT       = 1
FAMISTUDIO_CFG_SFX_STREAMS       = 2

; DPCM samples off — they're 4-8 KB each and would blow our 32 KB
; PRG budget the moment a pupil ticks two.  Pupils who really want
; them can re-enable this later as a Tier B follow-up.
FAMISTUDIO_CFG_DPCM_SUPPORT      = 0

; Smoother vibrato is a quality-of-life win at minimal CPU cost.
FAMISTUDIO_CFG_SMOOTH_VIBRATO    = 1

; Single-thread engine: famistudio_update runs entirely in the main
; loop's vblank window.  Don't enable FAMISTUDIO_CFG_THREAD — that
; relies on splitting the work across NMI + main thread, which our
; waitvsync()-based main loop doesn't support.
FAMISTUDIO_CFG_EQUALIZER         = 0

; Tempo mode.  FamiStudio's native tempo (smoother, with grooves)
; rather than the older FamiTracker model.  Pupils' projects export
; with FamiStudio tempo by default unless they explicitly switch.
; FAMISTUDIO_USE_FAMITRACKER_TEMPO stays 0.

; Per-feature flags — we keep the common ones on.  Each one costs
; a small slice of ROM/CPU; flicking everything on costs ~600 bytes
; vs ~150 for a "barebones" build.  Pupils' songs can use whichever
; of these features FamiStudio offers; we prefer "music sounds
; right" over "smallest possible ROM".
FAMISTUDIO_USE_VOLUME_TRACK      = 1
FAMISTUDIO_USE_VOLUME_SLIDES     = 1
FAMISTUDIO_USE_PITCH_TRACK       = 1
FAMISTUDIO_USE_SLIDE_NOTES       = 1
FAMISTUDIO_USE_VIBRATO           = 1
FAMISTUDIO_USE_ARPEGGIO          = 1
FAMISTUDIO_USE_RELEASE_NOTES     = 1
FAMISTUDIO_USE_DUTYCYCLE_EFFECT  = 1

; Now pull in the engine itself.  ca65 inlines this source-level so
; the resulting object holds all famistudio_* symbols the cc65
; header exposes.
.include "famistudio_ca65.s"
