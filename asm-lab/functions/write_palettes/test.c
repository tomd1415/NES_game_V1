/* Driver for write_palettes. Fills palette_bytes with distinctive valid NES
 * colour indices (<= 0x3F), then calls the ASM candidate or the C reference
 * (chosen at build time by -DASM_VARIANT). The harness reads the PPU palette
 * RAM from both builds and asserts they are identical.
 *   $0300 = 0xAA (done)
 */
extern unsigned char palette_bytes[32];
void wp_ref(void);
void wp_asm(void);

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i;
    for (i = 0; i < 32; i++) palette_bytes[i] = (unsigned char)((i * 2 + 1) & 0x3F);
#ifdef ASM_VARIANT
    wp_asm();
#else
    wp_ref();
#endif
    buf[0] = 0xAA;
    for (;;) { }
}
