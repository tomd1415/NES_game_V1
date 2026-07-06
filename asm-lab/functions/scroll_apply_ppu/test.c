/* Per-function unit driver for scroll_apply_ppu.  For each (cam_x, cam_y) case:
 * run the C reference (captures to $0500..$0502), then the ASM candidate
 * (captures to $0503..$0505), and stash both triples for the harness.
 * Layout at $0308 + i*6:  +0 refCtrl +1 refSx +2 refSy +3 asmCtrl +4 asmSx +5 asmSy
 *   $0301 = NCASES   $0302 = mismatches   $0300 = 0xAA done
 */
extern unsigned int cam_x;
extern unsigned int cam_y;
void sap_ref(void);
void sap_asm(void);

#define NCASES 16
/* Sweep: cam_x across the 256 nametable boundary; cam_y across the 240 band
   boundary (incl. the illegal 240..255 region the fold must avoid) and a full
   2-band (0..479) range. */
static const unsigned int cxs[NCASES] = {0, 255, 256, 257, 300, 511, 100, 0,   256, 320, 0,   0,   511, 8,   248, 200};
static const unsigned int cys[NCASES] = {0, 0,   0,   0,   0,   0,   0,   239, 240, 240, 241, 479, 240, 120, 235, 245};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    volatile unsigned char *cap = (unsigned char *)0x0500;
    unsigned char i, mism = 0;
    for (i = 0; i < NCASES; i++) {
        cam_x = cxs[i];
        cam_y = cys[i];
        sap_ref();
        sap_asm();
        buf[8 + i * 6 + 0] = cap[0];
        buf[8 + i * 6 + 1] = cap[1];
        buf[8 + i * 6 + 2] = cap[2];
        buf[8 + i * 6 + 3] = cap[3];
        buf[8 + i * 6 + 4] = cap[4];
        buf[8 + i * 6 + 5] = cap[5];
        if (cap[0] != cap[3] || cap[1] != cap[4] || cap[2] != cap[5]) mism++;
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[0] = 0xAA;
    for (;;) { }
}
