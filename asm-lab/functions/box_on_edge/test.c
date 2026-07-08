/* Per-function unit driver for box_on_edge (racer_box_on_edge).
 *
 * Fills a 32x30 behaviour map with a vertical WALL column, a 2x2 solid block,
 * and a full SOLID floor row, then sweeps boxes that hit each corner / the
 * centre / miss / straddle a wall / sit past the world edge. For each case it
 * runs the C ref and the ASM candidate against the SAME map + globals and hands
 * the pair to $0300 for the harness (ref==asm==JS model).
 *   $0300 = 0xAA (done)  $0301 = NCASES  $0302 = mismatch count
 *   $0303 = first bad index (0xFF = none)
 *   $0308 + i*2 = ref[i]   $0309 + i*2 = asm[i]
 */
extern unsigned char the_map[];
extern unsigned int  rbe_bx, rbe_by;
extern unsigned char rbe_bw, rbe_bh;
unsigned char rbe_ref(void);
unsigned char rbe_asm(void);

#define NCASES 14
/* (bx, by, bw, bh) per case */
static const unsigned int  bxs[NCASES] = { 32, 40, 33,  152, 100, 80, 24, 32, 256, 40, 100, 0,   248, 44 };
static const unsigned int  bys[NCASES] = {  0,  0,  0,  152, 100, 80,  0,  0, 160, 40,   0, 0,   152, 44 };
static const unsigned char bws[NCASES] = {  1,  1,  2,    1,   1,  1,  3,  1,   1,  1,   1, 1,     2,  3 };
static const unsigned char bhs[NCASES] = {  1,  1,  1,    2,   1,  1,  1,  1,   1,  1,   1, 1,     1,  3 };

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;
    for (i = 0; i < 30; i++) the_map[i * 32 + 5] = 2;      /* WALL column at col 5 */
    the_map[10 * 32 + 10] = 1; the_map[10 * 32 + 11] = 1;  /* 2x2 solid block */
    the_map[11 * 32 + 10] = 1; the_map[11 * 32 + 11] = 1;
    for (i = 0; i < 32; i++) the_map[20 * 32 + i] = 1;     /* SOLID floor row 20 */

    for (i = 0; i < NCASES; i++) {
        unsigned char rref, rasm;
        rbe_bx = bxs[i]; rbe_by = bys[i]; rbe_bw = bws[i]; rbe_bh = bhs[i];
        rref = rbe_ref();
        rbe_bx = bxs[i]; rbe_by = bys[i]; rbe_bw = bws[i]; rbe_bh = bhs[i];
        rasm = rbe_asm();
        buf[8 + i * 2 + 0] = rref;
        buf[8 + i * 2 + 1] = rasm;
        if (rref != rasm) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;
    for (;;) { }
}
