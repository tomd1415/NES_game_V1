PPUMASK = $2001
PPUADDR = $2006
PPUDATA = $2007

.segment "CODE"

.proc copy_mytiles_chr
src = 0
  lda #<mytiles_chr
  sta src
  lda #>mytiles_chr
  sta src+1

  ldy #0
  sty PPUMASK
  sty PPUADDR
  sty PPUADDR
  ldx #32
loop:
  lda (src),y
  sta PPUDATA
  iny
  bne loop
  inc src+1
  dex
  bne loop
  rts
.endproc

.segment "CHARS"
mytiles_chr: .incbin "../../../assets/sprites/walk1.chr"
