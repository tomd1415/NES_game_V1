; smb_accel — hand-written 6502 for the SMB horizontal accel step. Signed 16-bit:
; accelerate smb_vx toward a run/walk target with a 2x skid on reversal; set
; plrdir from the target sign. Behaviourally identical to the C reference.
;
; Signed 16-bit compare idiom used throughout: after `A - B` (sec/sbc lo, sbc hi),
; `bvc *+4 / eor #$80` puts the true signed sign in N, so bmi = A<B, bpl = A>=B.

.export _smb_accel_asm
.import _pad, _plrdir, _smb_vx
.importzp tmp1, tmp2

RUN_MAX  = 640
WALK_MAX = 384
ACCEL    = 24

.segment "BSS"
maxs:   .res 2
target: .res 2
accel:  .res 2

.segment "CODE"
.proc _smb_accel_asm
    ; maxs = (pad & 0x40) ? RUN_MAX : WALK_MAX
    lda _pad
    and #$40
    beq wmax
    lda #<RUN_MAX
    sta maxs
    lda #>RUN_MAX
    sta maxs+1
    jmp tgt
wmax:
    lda #<WALK_MAX
    sta maxs
    lda #>WALK_MAX
    sta maxs+1
tgt:
    ; target = RIGHT ? maxs : LEFT ? -maxs : 0
    lda _pad
    and #$01
    beq notright
    lda maxs
    sta target
    lda maxs+1
    sta target+1
    jmp accl
notright:
    lda _pad
    and #$02
    beq tzero
    sec
    lda #0
    sbc maxs
    sta target
    lda #0
    sbc maxs+1
    sta target+1
    jmp accl
tzero:
    lda #0
    sta target
    sta target+1
accl:
    ; if (smb_vx == target) skip accel
    lda _smb_vx
    cmp target
    bne cmpvt
    lda _smb_vx+1
    cmp target+1
    bne cmpvt
    jmp setdir           ; vx == target -> no accel (setdir is far)
cmpvt:
    ; signed: smb_vx < target ?
    sec
    lda _smb_vx
    sbc target
    lda _smb_vx+1
    sbc target+1
    bvc s1
    eor #$80
s1:
    bpl gtr              ; vx >= target (and != so > target) -> decel
    jmp vless            ; vx < target -> accel (vless is far)
gtr:
    ; --- smb_vx > target: decelerate ---
    ; accel = (smb_vx > 0) ? ACCEL*2 : ACCEL
    lda _smb_vx+1
    bmi gacc1              ; vx < 0 -> ACCEL
    lda _smb_vx+1
    ora _smb_vx
    beq gacc1             ; vx == 0 -> ACCEL
    lda #<(ACCEL * 2)
    sta accel
    lda #>(ACCEL * 2)
    sta accel+1
    jmp gsub
gacc1:
    lda #<ACCEL
    sta accel
    lda #>ACCEL
    sta accel+1
gsub:
    sec
    lda _smb_vx
    sbc accel
    sta _smb_vx
    lda _smb_vx+1
    sbc accel+1
    sta _smb_vx+1
    ; if (smb_vx < target) smb_vx = target
    sec
    lda _smb_vx
    sbc target
    lda _smb_vx+1
    sbc target+1
    bvc s2
    eor #$80
s2:
    bpl setdir            ; vx >= target -> ok
    lda target
    sta _smb_vx
    lda target+1
    sta _smb_vx+1
    jmp setdir
vless:
    ; --- smb_vx < target: accelerate ---
    ; accel = (smb_vx < 0) ? ACCEL*2 : ACCEL
    lda _smb_vx+1
    bmi lacc2             ; vx < 0 -> ACCEL*2
    lda #<ACCEL
    sta accel
    lda #>ACCEL
    sta accel+1
    jmp ladd
lacc2:
    lda #<(ACCEL * 2)
    sta accel
    lda #>(ACCEL * 2)
    sta accel+1
ladd:
    clc
    lda _smb_vx
    adc accel
    sta _smb_vx
    lda _smb_vx+1
    adc accel+1
    sta _smb_vx+1
    ; if (smb_vx > target) smb_vx = target  <=>  target < smb_vx
    sec
    lda target
    sbc _smb_vx
    lda target+1
    sbc _smb_vx+1
    bvc s3
    eor #$80
s3:
    bpl setdir            ; target >= vx -> vx <= target -> ok
    lda target
    sta _smb_vx
    lda target+1
    sta _smb_vx+1
setdir:
    ; if (target > 0) plrdir = 0 ; else if (target < 0) plrdir = 0x40
    lda target+1
    bmi tneg
    lda target
    ora target+1
    beq done             ; target == 0 -> leave plrdir
    lda #$00
    sta _plrdir
    rts
tneg:
    lda #$40
    sta _plrdir
done:
    rts
.endproc
