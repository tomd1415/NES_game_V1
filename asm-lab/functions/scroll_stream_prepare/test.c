/* Per-function unit driver for scroll_stream_prepare (horizontal path).
 * For each (prev_cam_x, cam_x) case: run the C ref, snapshot its outputs
 * (col_buf, col_addr, col_pending, mutated prev_cam_x); reset the seed; run the
 * ASM; compare all four in-ROM. Also exports the ref's col_addr/pending/prevx +
 * a col_buf checksum per case so the harness can cross-check an independent JS
 * model. Layout at $0308 + i*8:
 *   +0 pending  +1 bufsum  +2 addrLo +3 addrHi  +4 prevLo +5 prevHi  +6 bufMatch  +7 ok
 *   $0301 = NCASES   $0302 = total mismatches   $0300 = 0xAA done
 */
extern unsigned int  cam_x;
extern unsigned int  prev_cam_x;
extern unsigned char col_buf[30];
extern unsigned int  col_addr;
extern unsigned char col_pending;
extern unsigned char bg_world_tiles[64 * 30];
void ssp_ref(void);
void ssp_asm(void);

#define NCASES 8
static const unsigned int prevs[NCASES] = {0,   0,   248, 256, 8,   0,   0,   256};
static const unsigned int cams[NCASES]  = {4,   8,   256, 248, 0,   0,   64,  512};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, rr, total = 0;
    unsigned char refbuf[30];
    unsigned char rPend, rSum, rAddrL, rAddrH, rPrevL, rPrevH;

    /* deterministic tile fixture, mirrored in test.mjs */
    for (i = 0; ; ) { break; }             /* (avoid unused warning shuffle) */
    { unsigned int k; for (k = 0; k < 64u * 30u; k++) bg_world_tiles[k] = (unsigned char)(k * 7u + 3u); }

    for (i = 0; i < NCASES; i++) {
        unsigned char okBuf = 1, okAll = 1;

        cam_x = cams[i]; prev_cam_x = prevs[i];
        col_pending = 0xEE; col_addr = 0xEEEE;
        ssp_ref();
        rPend = col_pending;
        rAddrL = (unsigned char)col_addr; rAddrH = (unsigned char)(col_addr >> 8);
        rPrevL = (unsigned char)prev_cam_x; rPrevH = (unsigned char)(prev_cam_x >> 8);
        rSum = 0;
        for (rr = 0; rr < 30; rr++) { refbuf[rr] = col_buf[rr]; rSum += col_buf[rr]; }

        cam_x = cams[i]; prev_cam_x = prevs[i];
        col_pending = 0xEE; col_addr = 0xEEEE;
        for (rr = 0; rr < 30; rr++) col_buf[rr] = 0x00;
        ssp_asm();

        if (col_pending != rPend) okAll = 0;
        if ((unsigned char)col_addr != rAddrL || (unsigned char)(col_addr >> 8) != rAddrH) okAll = 0;
        if ((unsigned char)prev_cam_x != rPrevL || (unsigned char)(prev_cam_x >> 8) != rPrevH) okAll = 0;
        /* col_buf only meaningful when a column was streamed */
        if (rPend) {
            for (rr = 0; rr < 30; rr++) if (col_buf[rr] != refbuf[rr]) { okBuf = 0; break; }
        }
        if (!okBuf) okAll = 0;
        if (!okAll) total++;

        buf[8 + i * 8 + 0] = rPend;
        buf[8 + i * 8 + 1] = rSum;
        buf[8 + i * 8 + 2] = rAddrL;
        buf[8 + i * 8 + 3] = rAddrH;
        buf[8 + i * 8 + 4] = rPrevL;
        buf[8 + i * 8 + 5] = rPrevH;
        buf[8 + i * 8 + 6] = okBuf;
        buf[8 + i * 8 + 7] = okAll;
    }
    buf[1] = NCASES;
    buf[2] = total;
    buf[0] = 0xAA;
    for (;;) { }
}
