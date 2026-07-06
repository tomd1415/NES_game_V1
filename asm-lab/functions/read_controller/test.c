/* Per-function unit driver for read_controller. Reads both the C reference and
 * the ASM candidate against the current controller state (set by the harness
 * before the ROM runs), one combo per boot.
 *   $0300=0xAA done   $0308=ref   $0309=asm
 * Both read the same $4016 shift register (each call re-strobes), so they must
 * agree for any button state.
 */
unsigned char rc_ref(void);
unsigned char rc_asm(void);

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    buf[8] = rc_ref();
    buf[9] = rc_asm();
    buf[0] = 0xAA;
    for (;;) { }
}
