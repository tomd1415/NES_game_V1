; scroll_follow — hand-written 6502 candidate (lab world 512x480, both axes).
;
; C ABI (fastcall, 2 x 16-bit args): target_world_y (rightmost) in A(lo)/X(hi);
; target_world_x pushed -> (sp),0/1. Void; pop 2 bytes (incsp2) on return.
;
; The C dead-zone algebra collapses per axis to:
;   target < cam+96   -> cam = (target < 96) ? 0 : target-96      (scroll toward 0)
;   target > cam+144  -> cam = min(target-144, max_cam)           (scroll toward max)
;   else              -> unchanged
; (Verified against the exact C by the unit harness.) max_cam_x=256 ($0100),
; max_cam_y=240 ($00F0).
;
; 16-bit unsigned compare idiom: lda Alo / cmp Blo / lda Ahi / sbc Bhi ;
; bcc => A<B, bcs => A>=B.

.export _sf_asm
.import _cam_x, _cam_y
.import incsp2
.importzp sp, ptr1, ptr2, ptr3

.segment "CODE"
.proc _sf_asm               ; A/X = target_y ; (sp),0/1 = target_x
    sta ptr2                ; target_y lo
    stx ptr2+1              ; target_y hi
    ldy #0
    lda (sp),y
    sta ptr1                ; target_x lo
    iny
    lda (sp),y
    sta ptr1+1              ; target_x hi

    ; ============ HORIZONTAL axis: cam_x, target_x=ptr1, max=$0100 ============
    ; dz_left = cam_x + 96
    lda _cam_x
    clc
    adc #96
    sta ptr3
    lda _cam_x+1
    adc #0
    sta ptr3+1
    ; target_x < dz_left ?
    lda ptr1
    cmp ptr3
    lda ptr1+1
    sbc ptr3+1
    bcs @h_not_left         ; target_x >= dz_left
    ; scroll-left: cam_x = (target_x < 96) ? 0 : target_x-96
    lda ptr1+1
    bne @h_tx_ge96          ; hi != 0 -> >=256 -> >=96
    lda ptr1
    cmp #96
    bcs @h_tx_ge96
    lda #0                  ; target_x < 96 -> cam_x = 0
    sta _cam_x
    sta _cam_x+1
    jmp @h_done
@h_tx_ge96:
    lda ptr1                ; cam_x = target_x - 96
    sec
    sbc #96
    sta _cam_x
    lda ptr1+1
    sbc #0
    sta _cam_x+1
    jmp @h_done
@h_not_left:
    ; dz_right = cam_x + 144
    lda _cam_x
    clc
    adc #144
    sta ptr3
    lda _cam_x+1
    adc #0
    sta ptr3+1
    ; target_x > dz_right ?  (dz_right < target_x)
    lda ptr3
    cmp ptr1
    lda ptr3+1
    sbc ptr1+1
    bcs @h_done             ; dz_right >= target_x -> deadzone, no move
    ; scroll-right: t = target_x - 144
    lda ptr1
    sec
    sbc #144
    sta ptr3
    lda ptr1+1
    sbc #0
    sta ptr3+1
    ; t > 256 ?  (256 < t)
    lda #$00
    cmp ptr3
    lda #$01
    sbc ptr3+1
    bcs @h_store            ; 256 >= t -> use t
    lda #$00                ; clamp to 256
    sta _cam_x
    lda #$01
    sta _cam_x+1
    jmp @h_done
@h_store:
    lda ptr3
    sta _cam_x
    lda ptr3+1
    sta _cam_x+1
@h_done:

    ; ============ VERTICAL axis: cam_y, target_y=ptr2, max=$00F0 (240) ========
    ; dz_top = cam_y + 96
    lda _cam_y
    clc
    adc #96
    sta ptr3
    lda _cam_y+1
    adc #0
    sta ptr3+1
    ; target_y < dz_top ?
    lda ptr2
    cmp ptr3
    lda ptr2+1
    sbc ptr3+1
    bcs @v_not_top
    ; scroll-up: cam_y = (target_y < 96) ? 0 : target_y-96
    lda ptr2+1
    bne @v_ty_ge96
    lda ptr2
    cmp #96
    bcs @v_ty_ge96
    lda #0
    sta _cam_y
    sta _cam_y+1
    jmp @v_done
@v_ty_ge96:
    lda ptr2
    sec
    sbc #96
    sta _cam_y
    lda ptr2+1
    sbc #0
    sta _cam_y+1
    jmp @v_done
@v_not_top:
    ; dz_bot = cam_y + 144
    lda _cam_y
    clc
    adc #144
    sta ptr3
    lda _cam_y+1
    adc #0
    sta ptr3+1
    ; target_y > dz_bot ?
    lda ptr3
    cmp ptr2
    lda ptr3+1
    sbc ptr2+1
    bcs @v_done
    ; scroll-down: t = target_y - 144
    lda ptr2
    sec
    sbc #144
    sta ptr3
    lda ptr2+1
    sbc #0
    sta ptr3+1
    ; t > 240 ?  (240 < t)
    lda #$F0
    cmp ptr3
    lda #$00
    sbc ptr3+1
    bcs @v_store            ; 240 >= t -> use t
    lda #$F0                ; clamp to 240
    sta _cam_y
    lda #$00
    sta _cam_y+1
    jmp @v_done
@v_store:
    lda ptr3
    sta _cam_y
    lda ptr3+1
    sta _cam_y+1
@v_done:
    jmp incsp2              ; pop target_x (2 bytes), rts
.endproc
