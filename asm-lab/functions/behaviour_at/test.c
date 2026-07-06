/* Per-function unit driver for behaviour_at. Fills the map with a distinctive
 * per-cell pattern (so an off-by-one index is obvious), then sweeps (col,row)
 * cases: corners, just-in/out of bounds on each axis, and far-OOB.
 *   $0300=0xAA done  $0301=NCASES  $0302=mismatches  $0303=first bad
 *   $0308+i*2=ref[i]  $0309+i*2=asm[i]
 *
 * The fill uses a running 8-bit accumulator (v += 7) rather than k*7+3 so it
 * needs no 16-bit multiply runtime call — the map is 960 cells and a per-cell
 * multiply pushed the driver past a comfortable frame budget. v == (k*7+3)&0xFF.
 */
extern unsigned char the_map[];
unsigned char bat_ref(unsigned int world_col, unsigned int world_row);
unsigned char bat_asm(unsigned int world_col, unsigned int world_row);

#define NCASES 12
static const unsigned int cols[NCASES] =
    {0,  31, 0,  5,  32, 0,   31, 100, 5,   16, 31, 300U};
static const unsigned int rows[NCASES] =
    {0,  29, 29, 10, 0,  30,  0,  5,   300U, 15, 29, 0};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char v = 3;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (k = 0; k < (32u * 30u); k++) { the_map[k] = v; v += 7; }

    for (i = 0; i < NCASES; i++) {
        unsigned char rref, rasm;
        rref = bat_ref(cols[i], rows[i]);
        rasm = bat_asm(cols[i], rows[i]);
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
