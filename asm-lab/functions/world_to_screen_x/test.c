/* Per-function unit driver for world_to_screen_x.
 *
 * Sweeps input cases (edges: aligned, boundary 255/256, underflow, max), calls
 * BOTH the C reference and the ASM candidate with the same cam_x + world_x, and
 * hands the results to the internal-RAM buffer at $0300 for the Node/jsnes
 * harness to check:
 *   $0300 = 0xAA (done)   $0301 = NCASES   $0302 = mismatch count
 *   $0303 = first bad index (0xFF = none)
 *   $0308 + i*2 = ref[i]  $0309 + i*2 = asm[i]
 */
extern unsigned int cam_x;
unsigned char w2sx_ref(unsigned int world_x);
unsigned char w2sx_asm(unsigned int world_x);

#define NCASES 12
static const unsigned int cams[NCASES] =
    {0,   0,   0,   100, 100, 100, 100, 500, 500, 65535U, 300, 40000U};
static const unsigned int worlds[NCASES] =
    {0,   255, 256, 99,  100, 355, 356, 499, 756, 0,      44,  40255U};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (i = 0; i < NCASES; i++) {
        unsigned char rref, rasm;
        cam_x = cams[i];
        rref = w2sx_ref(worlds[i]);
        rasm = w2sx_asm(worlds[i]);
        buf[8 + i * 2 + 0] = rref;
        buf[8 + i * 2 + 1] = rasm;
        if (rref != rasm) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;   /* written last = "driver finished" */
    for (;;) { }
}
