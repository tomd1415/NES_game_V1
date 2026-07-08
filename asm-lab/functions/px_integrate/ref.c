/* C reference for the 8.8 sub-pixel integrate step — the heart of the player
 * physics in steps/Step_Playground/src/... (platformer.c), lifted verbatim:
 *
 *     acc = (signed int)sub + v;   // v is 8.8 fixed-point velocity (256 = 1px)
 *     pos = pos + (acc >> 8);      // whole-pixel delta (arithmetic >>, sign-keeping)
 *     sub = (unsigned char)(acc & 0xFF);
 *
 * pos/sub are the shared globals BOTH the C reference and the ASM candidate
 * update in place (cc65 places them in WRAM). pos is 16-bit so it covers the
 * u16 (scroll) player-position width; the caller does the clamp separately.
 *
 * NB `acc` is a 16-bit signed int, so sub+v wraps mod 65536 before the >>8 —
 * the ASM must reproduce that (it does: the add is naturally 16-bit).
 */
signed int    pxi_pos;
unsigned char pxi_sub;

void pxi_integrate_ref(signed int v) {
    signed int acc = (signed int)pxi_sub + v;
    pxi_pos = pxi_pos + (acc >> 8);
    pxi_sub = (unsigned char)(acc & 0xFF);
}
