/* Per-function unit driver for world_to_screen_y. Same protocol as _x:
 *   $0300=0xAA done  $0301=NCASES  $0302=mismatches  $0303=first bad
 *   $0308+i*2=ref[i]  $0309+i*2=asm[i]
 * Cases stress the 240 boundary (239 vs 240 vs 255), underflow, and max.
 */
extern unsigned int cam_y;
unsigned char w2sy_ref(unsigned int world_y);
unsigned char w2sy_asm(unsigned int world_y);

#define NCASES 10
static const unsigned int cams[NCASES] =
    {0,  0,   0,   100, 100, 100, 100, 500, 65535U, 300};
static const unsigned int worlds[NCASES] =
    {0,  239, 240, 339, 340, 355, 99,  756, 0,      44};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (i = 0; i < NCASES; i++) {
        unsigned char rref, rasm;
        cam_y = cams[i];
        rref = w2sy_ref(worlds[i]);
        rasm = w2sy_asm(worlds[i]);
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
