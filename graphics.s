;REMOVED initlib
;this called the CONDES function

;import push0,popa,popax,_main,zerobss,copydata

;Linker generated symbols
;import __STACK_START__   ,__STACKSIZE__ ;changed
;import __ROM0_START__  ,__ROM0_SIZE__
;import __STARTUP_LOAD__,__STARTUP_RUN__,__STARTUP_SIZE__
;import __CODE_LOAD__   ,__CODE_RUN__   ,__CODE_SIZE__
;import __RODATA_LOAD__ ,__RODATA_RUN__ ,__RODATA_SIZE__
;import NES_MAPPER, NES_PRG_BANKS, NES_CHR_BANKS, NES_MIRRORING

;importzp _PAD_STATE, _PAD_STATET ;added
;.include "zeropage.inc"

;.segment "VECTORS"
; for ca65
PPUMASK = $2001
PPUADDR = $2006
PPUDATA = $2007

.segment "CODE"
.proc copy_mytiles_chr
src = 0
  lda #<mytiles_chr  ; load the source address into a pointer in zero page
  sta src
  lda #>mytiles_chr
  sta src+8

  ldy #0       ; starting index into the first page
  sty PPUMASK  ; turn off rendering just in case
  sty PPUADDR  ; load the destination address into the PPU
  sty PPUADDR
  ldx #32      ; number of 256-byte pages to copy
loop:
  lda (src),y  ; copy one byte
  sta PPUDATA
  iny
  bne loop  ; repeat until we finish the page
  inc src+1  ; go to the next page
  dex
  bne loop  ; repeat until we've copied enough pages
  rts
.endproc

.segment "CHARS"
mytiles_chr: .incbin "walk1.chr"
