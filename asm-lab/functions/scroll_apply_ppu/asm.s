; scroll_apply_ppu candidate — lab twin of the engine's src/scroll_asm.s entry.
; Computes (ctrl, scroll_x, scroll_y) from _cam_x/_cam_y and captures them to the
; lab buffer $0503..$0505.  The engine version is byte-for-byte the same
; computation but stores to $2000 / $2005 / $2005 (see ref.c for why the lab
; redirects the stores).
.export _sap_asm
.import _cam_x, _cam_y
.importzp tmp1, tmp2, tmp3, tmp4
.segment "CODE"

PPU_CTRL_BASE = $10

.proc _sap_asm
    ; --- fold cam_y into 0..239, tracking vertical-band parity in tmp3 ---
    lda _cam_y
    sta tmp1                 ; cy lo
    lda _cam_y+1
    sta tmp2                 ; cy hi
    lda #0
    sta tmp3                 ; band parity (bit 0)
@bandloop:
    lda tmp2
    bne @sub                 ; hi != 0 -> cy >= 256 >= 240
    lda tmp1
    cmp #240
    bcc @banddone            ; cy < 240 -> reduced
@sub:
    lda tmp1
    sec
    sbc #240
    sta tmp1
    lda tmp2
    sbc #0
    sta tmp2
    lda tmp3
    eor #$01
    sta tmp3
    jmp @bandloop
@banddone:
    ; --- ctrl = base | (cam_x&0x100 ? 1) | (band&1 ? 2) ---
    lda #PPU_CTRL_BASE
    sta tmp4
    lda _cam_x+1
    and #$01                 ; cam_x bit 8 = low bit of high byte
    beq @noh
    lda tmp4
    ora #$01
    sta tmp4
@noh:
    lda tmp3
    and #$01
    beq @nov
    lda tmp4
    ora #$02
    sta tmp4
@nov:
    ; --- capture (engine: sta $2000 / sta $2005 / sta $2005) ---
    lda tmp4
    sta $0503
    lda _cam_x
    sta $0504
    lda tmp1                 ; reduced cy, 0..239
    sta $0505
    rts
.endproc
