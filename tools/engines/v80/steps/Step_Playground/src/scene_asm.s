; scene_asm.s — hand-written 6502 version of the scene-sprite DRAW loop.
;
; Compiled + linked ONLY when the build sets NES_ASM_SCENE=1 (see the Makefile),
; and only for the PLAIN draw path (no per-sprite tagged animations —
; BW_HAS_SCENE_ANIM==0); when it's linked the matching C loop in main.c is
; #if'd out, so exactly one definition runs. With the flag OFF (the default)
; this file is not part of the build and the ROM is byte-identical to pure C.
;
; It is the exact equivalent of the template's plain scene-draw loop:
;   for (i = 0; i < NUM_STATIC_SPRITES; i++) {
;     off = ss_offset[i]; sw = ss_w[i]; sh = ss_h[i];
;     for (r = 0; r < sh; r++)
;       for (c = 0; c < sw; c++)
;         if (oam_idx <= 252) {
;           oam_buf[oam_idx++] = world_to_screen_y(ss_y[i] + (r<<3));
;           oam_buf[oam_idx++] = ss_tiles[off + r*sw + c];
;           oam_buf[oam_idx++] = ss_attrs[off + r*sw + c];
;           oam_buf[oam_idx++] = world_to_screen_x(ss_x[i] + (c<<3));
;         }
;   }
; The tiles/attrs are row-major from `off`, so a single running pointer per
; array walks them (incremented every inner iteration). All Builder/template
; builds `#define SCROLL_BUILD`, so only the world_to_screen path exists here.
; ss_x/ss_y are u8 or u16 per SS_POS_WIDE (project.inc); positions are always
; widened to 16-bit before world_to_screen (matches the C `(unsigned int)` cast).

.include "project.inc"
.include "asm_macros.inc"

.export _draw_scene_sprites
.import _world_to_screen_x, _world_to_screen_y
.import _oam_buf, _oam_idx
.import _ss_x, _ss_y, _ss_w, _ss_h, _ss_offset, _ss_tiles, _ss_attrs
.importzp tmp1, ptr1, ptr2

.segment "BSS"
sd_i:    .res 1      ; sprite index
sd_sw:   .res 1      ; ss_w[i]
sd_sh:   .res 1      ; ss_h[i]
sd_r:    .res 1      ; row
sd_c:    .res 1      ; col
sd_bx:   .res 2      ; base_x (u16)
sd_by:   .res 2      ; base_y (u16)
sd_wy:   .res 2      ; wy = base_y + r*8 (u16, per row)
sd_sy:   .res 1      ; computed screen-y
sd_sx:   .res 1      ; computed screen-x
sd_tile: .res 1      ; *tile_ptr
sd_attr: .res 1      ; *attr_ptr

.segment "CODE"

; void draw_scene_sprites(void)
.proc _draw_scene_sprites
    lda #0
    sta sd_i
sprite_loop:
    lda sd_i
    cmp #NUM_STATIC_SPRITES     ; NUM_STATIC_SPRITES < 256
    bcc @go
    rts                         ; i >= count -> done
@go:
    tax                         ; X = i
    lda _ss_w,x
    sta sd_sw
    lda _ss_h,x
    sta sd_sh
    ; base_x / base_y, widened to u16
.if SS_POS_WIDE
    txa
    asl a                       ; 2*i (NUM_STATIC_SPRITES assumed < 128)
    tay
    lda _ss_x,y
    sta sd_bx
    lda _ss_x+1,y
    sta sd_bx+1
    lda _ss_y,y
    sta sd_by
    lda _ss_y+1,y
    sta sd_by+1
.else
    lda _ss_x,x
    sta sd_bx
    lda _ss_y,x
    sta sd_by
    lda #0
    sta sd_bx+1
    sta sd_by+1
.endif
    ; ptr1 = ss_tiles + off ; ptr2 = ss_attrs + off
    lda _ss_offset,x
    clc
    adc #<_ss_tiles
    sta ptr1
    lda #>_ss_tiles
    adc #0
    sta ptr1+1
    lda _ss_offset,x
    clc
    adc #<_ss_attrs
    sta ptr2
    lda #>_ss_attrs
    adc #0
    sta ptr2+1
    ; --- row loop ---
    lda #0
    sta sd_r
row_loop:
    lda sd_r
    cmp sd_sh
    bcc @row_go
    jmp next_sprite
@row_go:
    ; wy = base_y + r*8
    lda sd_r
    asl a
    asl a
    asl a
    clc
    adc sd_by
    sta sd_wy
    lda sd_by+1
    adc #0
    sta sd_wy+1
    ; --- col loop ---
    lda #0
    sta sd_c
col_loop:
    lda sd_c
    cmp sd_sw
    bcc @col_go
    jmp next_row
@col_go:
    ; oam guard: write only when oam_idx <= 252 (multiple of 4, so <253 & hi==0)
    lda _oam_idx+1
    bne after_write             ; hi != 0 -> oam full -> skip write
    lda _oam_idx
    cmp #253
    bcs after_write             ; lo >= 253 -> skip write
    ; tile / attr from the running pointers
    ldy #0
    lda (ptr1),y
    sta sd_tile
    lda (ptr2),y
    sta sd_attr
    ; sy = world_to_screen_y(wy)
    lda sd_wy
    ldx sd_wy+1
    jsr _world_to_screen_y
    sta sd_sy
    ; sx = world_to_screen_x(base_x + c*8)
    lda sd_c
    asl a
    asl a
    asl a
    clc
    adc sd_bx
    sta tmp1
    lda sd_bx+1
    adc #0
    tax
    lda tmp1
    jsr _world_to_screen_x
    sta sd_sx
    ; write 4 OAM bytes at oam_idx (hi==0 here, guaranteed by the guard)
    ldy _oam_idx
    lda sd_sy
    sta _oam_buf,y
    iny
    lda sd_tile
    sta _oam_buf,y
    iny
    lda sd_attr
    sta _oam_buf,y
    iny
    lda sd_sx
    sta _oam_buf,y
    ; oam_idx += 4 (16-bit; 252+4 = 256 sets hi)
    lda _oam_idx
    clc
    adc #4
    sta _oam_idx
    lda _oam_idx+1
    adc #0
    sta _oam_idx+1
after_write:
    ; advance the running tile/attr pointers (every inner iteration)
    inc ptr1
    bne :+
    inc ptr1+1
:
    inc ptr2
    bne :+
    inc ptr2+1
:
    inc sd_c
    jmp col_loop
next_row:
    inc sd_r
    jmp row_loop
next_sprite:
    inc sd_i
    jmp sprite_loop
.endproc
