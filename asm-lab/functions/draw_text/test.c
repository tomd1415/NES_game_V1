/* Driver for draw_text. Enables NMI (so waitvsync ticks), then draws the same
 * string at three placements — (5,6), (5,40) [col>=32, exercises the 16-bit
 * add carry], and (0,0) — using the ASM or C variant (-DASM_VARIANT). The
 * harness reads nametable 0 from both builds and asserts identical + == msg.
 *   $0300 = 0xAA (done)
 */
#define PPU_CTRL (*(unsigned char *)0x2000)
void dt_ref(unsigned char row, unsigned char col, const unsigned char *text);
void dt_asm(unsigned char row, unsigned char col, const unsigned char *text);

static const unsigned char msg[] = { 0x11, 0x22, 0x33, 0x44, 0x55, 0x00 };

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    PPU_CTRL = 0x80;   /* enable NMI so waitvsync completes */
#ifdef ASM_VARIANT
    dt_asm(5, 6, msg);
    dt_asm(5, 40, msg);
    dt_asm(0, 0, msg);
#else
    dt_ref(5, 6, msg);
    dt_ref(5, 40, msg);
    dt_ref(0, 0, msg);
#endif
    buf[0] = 0xAA;
    for (;;) { }
}
