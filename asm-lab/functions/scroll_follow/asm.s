; scroll_follow (generalized) — lab copy of steps/Step_Playground/src/scroll_asm.s
; renamed _sf_asm; max read from _lab_max_x/_lab_max_y (set by ref.c).
.export _sf_asm
.import _cam_x, _cam_y
.import _lab_max_x, _lab_max_y
.import incsp2
.importzp sp, ptr1, ptr2, ptr3
.segment "CODE"
.proc _sf_asm            ; A/X = target_y ; (sp),0/1 = target_x
    sta ptr2                    ; target_y
    stx ptr2+1
    ldy #0
    lda (sp),y
    sta ptr1                    ; target_x
    iny
    lda (sp),y
    sta ptr1+1

    ; ---- HORIZONTAL: cam_x, target_x=ptr1, max=_lab_max_x ----
    lda _lab_max_x
    ora _lab_max_x+1
    bne @h_active               ; max!=0 -> run horizontal
    jmp @h_done                 ; max==0 -> axis inactive (jmp: no branch range)
@h_active:
    lda _cam_x
    clc
    adc #96
    sta ptr3
    lda _cam_x+1
    adc #0
    sta ptr3+1                  ; dz_left = cam_x+96
    lda ptr1
    cmp ptr3
    lda ptr1+1
    sbc ptr3+1
    bcs @h_not_left             ; target_x >= dz_left
    lda ptr1+1
    bne @h_tx96
    lda ptr1
    cmp #96
    bcs @h_tx96
    lda #0                      ; target_x < 96 -> cam_x = 0
    sta _cam_x
    sta _cam_x+1
    jmp @h_done
@h_tx96:
    lda ptr1                    ; cam_x = target_x - 96
    sec
    sbc #96
    sta _cam_x
    lda ptr1+1
    sbc #0
    sta _cam_x+1
    jmp @h_done
@h_not_left:
    lda _cam_x
    clc
    adc #144
    sta ptr3
    lda _cam_x+1
    adc #0
    sta ptr3+1                  ; dz_right = cam_x+144
    lda ptr3
    cmp ptr1
    lda ptr3+1
    sbc ptr1+1
    bcs @h_done                 ; target_x <= dz_right -> deadzone
    lda ptr1                    ; t = target_x - 144
    sec
    sbc #144
    sta ptr3
    lda ptr1+1
    sbc #0
    sta ptr3+1
    lda _lab_max_x       ; t > max ?  (max < t)
    cmp ptr3
    lda _lab_max_x+1
    sbc ptr3+1
    bcs @h_store                ; max >= t -> use t
    lda _lab_max_x       ; clamp to max
    sta _cam_x
    lda _lab_max_x+1
    sta _cam_x+1
    jmp @h_done
@h_store:
    lda ptr3
    sta _cam_x
    lda ptr3+1
    sta _cam_x+1
@h_done:

    ; ---- VERTICAL: cam_y, target_y=ptr2, max=_lab_max_y ----
    lda _lab_max_y
    ora _lab_max_y+1
    bne @v_active               ; max!=0 -> run vertical
    jmp @v_done                 ; max==0 -> axis inactive (jmp: no branch range)
@v_active:
    lda _cam_y
    clc
    adc #96
    sta ptr3
    lda _cam_y+1
    adc #0
    sta ptr3+1
    lda ptr2
    cmp ptr3
    lda ptr2+1
    sbc ptr3+1
    bcs @v_not_top
    lda ptr2+1
    bne @v_ty96
    lda ptr2
    cmp #96
    bcs @v_ty96
    lda #0
    sta _cam_y
    sta _cam_y+1
    jmp @v_done
@v_ty96:
    lda ptr2
    sec
    sbc #96
    sta _cam_y
    lda ptr2+1
    sbc #0
    sta _cam_y+1
    jmp @v_done
@v_not_top:
    lda _cam_y
    clc
    adc #144
    sta ptr3
    lda _cam_y+1
    adc #0
    sta ptr3+1
    lda ptr3
    cmp ptr2
    lda ptr3+1
    sbc ptr2+1
    bcs @v_done
    lda ptr2
    sec
    sbc #144
    sta ptr3
    lda ptr2+1
    sbc #0
    sta ptr3+1
    lda _lab_max_y
    cmp ptr3
    lda _lab_max_y+1
    sbc ptr3+1
    bcs @v_store
    lda _lab_max_y
    sta _cam_y
    lda _lab_max_y+1
    sta _cam_y+1
    jmp @v_done
@v_store:
    lda ptr3
    sta _cam_y
    lda ptr3+1
    sta _cam_y+1
@v_done:
    jmp incsp2
.endproc
