/* asm-lab smoke test — validates the toolchain + jsnes memory plumbing.
 *
 * Result buffer is internal RAM at $0300 (the harness reads it via
 * nes.cpu.mem[0x0300+]). We prove the $6000 WRAM round-trip by writing a
 * marker to a volatile WRAM global and reading it back into the buffer:
 *   $0300 = 0x43, $0301 = 0xA5   (direct internal-RAM writes)
 *   $0302 = g_wram               (== 0x42 iff jsnes emulates $6000 WRAM)
 * volatile forces -Os to emit the real store + load instead of folding it.
 */
volatile unsigned char g_wram;   /* -> BSS ($6000 WRAM) */

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    g_wram = 0x42;
    buf[0] = 0x43;
    buf[1] = 0xA5;
    buf[2] = g_wram;   /* real load from $6000 */
    for (;;) { }
}
