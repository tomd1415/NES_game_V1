/* Driver for clear_text_row. Fills row 5 of nametable 0 with 0xAB, then clears
 * cols 4..9 (width 6) with the ASM or C variant (-DASM_VARIANT). The harness
 * checks the cleared cells are 0x00 and the rest still 0xAB, identical across
 * builds. $0300 = 0xAA when done.
 */
#define PPU_CTRL (*(unsigned char *)0x2000)
#define PPU_MASK (*(unsigned char *)0x2001)
#define PPU_ADDR (*(unsigned char *)0x2006)
#define PPU_DATA (*(unsigned char *)0x2007)
void waitvsync(void);
void ctr_ref(unsigned char row, unsigned char col, unsigned char width);
void ctr_asm(unsigned char row, unsigned char col, unsigned char width);

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i;
    PPU_CTRL = 0x80;             /* NMI on so waitvsync ticks */
    waitvsync();
    waitvsync();                /* PPU warm-up */
    PPU_MASK = 0;
    PPU_ADDR = 0x20;
    PPU_ADDR = 0xA0;            /* row 5 = $2000 + 5*32 = $20A0 */
    for (i = 0; i < 32; i++) PPU_DATA = 0xAB;
#ifdef ASM_VARIANT
    ctr_asm(5, 4, 6);
#else
    ctr_ref(5, 4, 6);
#endif
    buf[0] = 0xAA;
    for (;;) { }
}
