; pdraw_asm.s — hand-written 6502 version of the PLAYER-1 OAM draw loop.
;
; Compiled + linked ONLY when the build sets NES_ASM_PDRAW=1 (see the Makefile);
; when it's linked the matching C loop in main.c is #if'd out, so exactly one
; definition runs. With the flag OFF (the default) this file is not part of the
; build and the ROM is byte-identical to pure C.
;
; It is the exact equivalent of the template's plain P1 draw loop:
;   for (r = 0; r < PLAYER_H; r++) {
;     for (c = 0; c < PLAYER_W; c++) {
;       sy = world_to_screen_y((unsigned int)py + (r<<3));
;       if (plrdir == 0x40) sx = world_to_screen_x((unsigned int)px + ((PLAYER_W-1-c)<<3));
;       else                sx = world_to_screen_x((unsigned int)px + (c<<3));
;       tile = anim_tiles[anim_base + r*PLAYER_W + c];
;       attr = anim_attrs[anim_base + r*PLAYER_W + c] ^ plrdir;
;       oam_buf[oam_idx++] = sy;  oam_buf[oam_idx++] = tile;
;       oam_buf[oam_idx++] = attr; oam_buf[oam_idx++] = sx;
;     }
;   }
; anim_tiles / anim_attrs are POINTER VARIABLES (main.c sets them each frame to
; the current animation frame — or the static player tiles when no animation is
; assigned), so a single running pointer from (anim_tiles + anim_base) walks the
; tile/attr bytes in forward, row-major order.  The horizontal flip mirrors only
; the sx POSITION (the (PLAYER_W-1-c) column), never the tile/attr read order,
; so the running pointers advance forward in both facings.
;
; The template always `#define SCROLL_BUILD`, so world_to_screen_x/y always
; exist; px/py positions are widened to 16-bit before the call (PX_WIDE picks
; u8 vs u16 storage), matching the C `(unsigned int)` cast.  The P1 sprite is
; the first thing drawn (oam_idx starts at 0 and stays < 256 for any player
; size the Builder allows), so no OAM-overflow guard is needed — matching the C,
; which likewise has none for the player.  The C call site excludes the bob
; case (BW_BOB_WHEN_WALKING) so this loop need not add the walk-bob offset.
; P2 + everything after continue in C from the oam_idx this leaves behind.

.include "project.inc"
.include "asm_macros.inc"

; px/py are u16 exactly when the C uses SCROLL_BUILD (world bigger than one
; screen) — derived from the project.inc world dims, mirroring player_asm.s.
; `.define` (not `=`) so `.if PX_WIDE` resolves inside the .proc scope; no
; parens around `>` (ca65 reads a parenthesised `>` as the hi-byte operator).
.if BG_WORLD_COLS > 32
.define PX_WIDE 1
.elseif BG_WORLD_ROWS > 30
.define PX_WIDE 1
.else
.define PX_WIDE 0
.endif

.export _draw_player
.import _world_to_screen_x, _world_to_screen_y
.import _oam_buf, _oam_idx
.import _px, _py, _plrdir, _anim_tiles, _anim_attrs, _anim_base
.importzp tmp1, ptr1, ptr2

.segment "BSS"
pd_r:    .res 1      ; row
pd_c:    .res 1      ; col
pd_bx:   .res 2      ; base_x = px, widened to u16
pd_wy:   .res 2      ; wy = py + r*8 (u16, per row)
pd_sy:   .res 1      ; computed screen-y
pd_sx:   .res 1      ; computed screen-x
pd_tile: .res 1      ; *tile_ptr
pd_attr: .res 1      ; *attr_ptr ^ plrdir

.segment "CODE"

; void draw_player(void)
.proc _draw_player
    ; base_x = px, widened to u16
.if PX_WIDE
    lda _px
    sta pd_bx
    lda _px+1
    sta pd_bx+1
.else
    lda _px
    sta pd_bx
    lda #0
    sta pd_bx+1
.endif
    ; ptr1 = anim_tiles + anim_base ; ptr2 = anim_attrs + anim_base
    ; (anim_tiles / anim_attrs are pointer variables; anim_base is u16)
    lda _anim_tiles
    clc
    adc _anim_base
    sta ptr1
    lda _anim_tiles+1
    adc _anim_base+1
    sta ptr1+1
    lda _anim_attrs
    clc
    adc _anim_base
    sta ptr2
    lda _anim_attrs+1
    adc _anim_base+1
    sta ptr2+1
    ; r = 0
    lda #0
    sta pd_r
row_loop:
    lda pd_r
    cmp #PLAYER_H               ; PLAYER_H < 256
    bcc @row_go
    rts                         ; r >= PLAYER_H -> done
@row_go:
    ; wy = py + r*8  (u16)
    lda pd_r
    asl a
    asl a
    asl a
    clc
.if PX_WIDE
    adc _py
    sta pd_wy
    lda _py+1
    adc #0
    sta pd_wy+1
.else
    adc _py
    sta pd_wy
    lda #0
    adc #0
    sta pd_wy+1
.endif
    ; c = 0
    lda #0
    sta pd_c
col_loop:
    lda pd_c
    cmp #PLAYER_W               ; PLAYER_W < 256
    bcc @col_go
    jmp next_row
@col_go:
    ; tile / attr from the running pointers (forward, regardless of facing)
    ldy #0
    lda (ptr1),y
    sta pd_tile
    lda (ptr2),y
    eor _plrdir
    sta pd_attr
    ; sy = world_to_screen_y(wy)
    lda pd_wy
    ldx pd_wy+1
    jsr _world_to_screen_y
    sta pd_sy
    ; colidx = (plrdir == 0x40) ? (PLAYER_W-1-c) : c
    lda _plrdir
    cmp #$40
    bne @noflip
    lda #(PLAYER_W-1)
    sec
    sbc pd_c
    jmp @havecol
@noflip:
    lda pd_c
@havecol:
    ; sx = world_to_screen_x(base_x + colidx*8)
    ;   colidx*8 fits a byte for any Builder player width (<= 8 wide -> <= 56).
    asl a
    asl a
    asl a
    clc
    adc pd_bx
    sta tmp1
    lda pd_bx+1
    adc #0
    tax
    lda tmp1
    jsr _world_to_screen_x
    sta pd_sx
    ; write 4 OAM bytes at oam_idx (P1 first: oam_idx lo < 256, hi stays 0)
    ldy _oam_idx
    lda pd_sy
    sta _oam_buf,y
    iny
    lda pd_tile
    sta _oam_buf,y
    iny
    lda pd_attr
    sta _oam_buf,y
    iny
    lda pd_sx
    sta _oam_buf,y
    iny
    sty _oam_idx               ; oam_idx += 4 (lo only; hi remains 0 for the player)
    ; advance the running tile/attr pointers (every inner iteration)
    inc ptr1
    bne :+
    inc ptr1+1
:
    inc ptr2
    bne :+
    inc ptr2+1
:
    inc pd_c
    jmp col_loop
next_row:
    inc pd_r
    jmp row_loop
.endproc
