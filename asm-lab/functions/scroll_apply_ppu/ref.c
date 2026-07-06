/* C reference for scroll_apply_ppu, from steps/Step_Playground/src/scroll.c.
 *
 * The function's observable effect is three bytes streamed to the PPU:
 *   PPU_CTRL ($2000), PPU_SCROLL x ($2005), PPU_SCROLL y ($2005 again).
 * To make that comparable in the lab we capture those three bytes into RAM
 * ($0500..$0502) instead of the write-only PPU regs; the ASM candidate captures
 * to $0503..$0505.  In the shipped engine both target $2000/$2005/$2005 — only
 * the store address differs.  What this proves identical is the interesting
 * part: the (cam_x, cam_y) -> (ctrl, scroll_x, scroll_y) computation, including
 * the 240-px vertical-band fold and the nametable-select bits.
 */
#define PPU_CTRL_BASE 0x10

unsigned int cam_x;
unsigned int cam_y;

void sap_ref(void) {
    unsigned char ctrl = PPU_CTRL_BASE;
    unsigned int cy = cam_y;
    unsigned char band = 0;
    while (cy >= 240) { cy -= 240; band++; }
    if (cam_x & 0x100) ctrl |= 0x01;
    if (band & 1) ctrl |= 0x02;
    *(volatile unsigned char *)0x0500 = ctrl;
    *(volatile unsigned char *)0x0501 = (unsigned char)(cam_x & 0xFF);
    *(volatile unsigned char *)0x0502 = (unsigned char)cy;
}
