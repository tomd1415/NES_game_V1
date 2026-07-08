; racer_vel — hand-written 6502 for the racer velocity-from-heading:
;   vx = ((racer_speed >> 2) * COS16[racer_heading]) >> 5
;   vy = ((racer_speed >> 2) * COS16[(racer_heading + 12) & 15]) >> 5
; Both shifts are signed/arithmetic in the C, so we form the true two's-complement
; signed product and arithmetic-shift it (NOT shift a magnitude then negate — that
; truncates toward 0 where the C floors). speed>>2 fits |.|<=160 and COS16 is
; -127..127, so the magnitude product is an unsigned 8x8->16; the sign is applied
; to the 16-bit product before the >>5. Behaviourally identical to racer_vel_ref.

.export _racer_vel_asm
.import _racer_speed, _racer_heading, _vx, _vy

.segment "BSS"
alo:   .res 1     ; a = racer_speed >> 2 (16-bit working)
ahi:   .res 1
maga:  .res 1     ; |a| (u8; |a| <= 160)
signa: .res 1     ; $FF if a < 0 else $00
magc:  .res 1     ; |COS16[...]|
signp: .res 1     ; product sign ($FF neg / $00 pos)
reslo: .res 1     ; 16-bit product / velocity component
reshi: .res 1

.segment "CODE"

; COS16 in Q7, two's-complement bytes (-49=207, -90=166, -117=139, -127=129).
cos16:
    .byte 127, 117, 90, 49, 0, 207, 166, 139, 129, 139, 166, 207, 0, 49, 90, 117

; velcomp: cos value (signed byte) in A -> signed 16-bit velocity in reslo:reshi.
; Uses the shared maga/signa (a = speed>>2, already computed by the caller).
.proc velcomp
    ; mag_c = |A| ; signp = signa XOR sign(A)
    cmp #$80
    bcc @cpos            ; A < $80 -> non-negative
    ; A negative: mag_c = -A, flip sign
    eor #$FF
    clc
    adc #1
    sta magc
    lda signa
    eor #$FF
    sta signp
    jmp @mul
@cpos:
    sta magc
    lda signa
    sta signp
@mul:
    ; reslo:reshi = maga * magc  (unsigned 8x8 -> 16)
    lda #0
    sta reshi
    ldx #8
@mloop:
    lsr magc
    bcc @noadd
    clc
    lda reshi
    adc maga
    sta reshi
@noadd:
    ror reshi
    ror reslo
    dex
    bne @mloop
    ; apply sign: if signp negative, two's-complement the 16-bit product
    lda signp
    beq @shift
    sec
    lda #0
    sbc reslo
    sta reslo
    lda #0
    sbc reshi
    sta reshi
@shift:
    ; arithmetic >>5 of the signed 16-bit product
    ldx #5
@asr:
    lda reshi
    cmp #$80             ; C = sign bit
    ror reshi
    ror reslo
    dex
    bne @asr
    rts
.endproc

.proc _racer_vel_asm
    ; a = racer_speed >> 2 (arithmetic, 16-bit)
    lda _racer_speed
    sta alo
    lda _racer_speed+1
    sta ahi
    ldx #2
@shr:
    lda ahi
    cmp #$80             ; C = sign bit
    ror ahi
    ror alo
    dex
    bne @shr
    ; mag_a = |a| ; signa = a<0 ? $FF : $00
    lda ahi
    bpl @apos
    sec
    lda #0
    sbc alo
    sta maga             ; -a lo (|a| <= 160 so hi is 0)
    lda #$FF
    sta signa
    jmp @vx
@apos:
    lda alo
    sta maga
    lda #0
    sta signa
@vx:
    ; vx: COS16[heading]
    ldx _racer_heading
    lda cos16,x
    jsr velcomp
    lda reslo
    sta _vx
    lda reshi
    sta _vx+1
    ; vy: COS16[(heading + 12) & 15]
    lda _racer_heading
    clc
    adc #12
    and #15
    tax
    lda cos16,x
    jsr velcomp
    lda reslo
    sta _vy
    lda reshi
    sta _vy+1
    rts
.endproc
