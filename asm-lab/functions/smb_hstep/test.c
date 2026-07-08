/* Unit driver for smb_hstep. Map: WALL col 10 + col 20 (all rows).
 * $0308 + i*10 = ref_px(2) ref_vx(2) ref_sub  asm_px(2) asm_vx(2) asm_sub */
extern unsigned char the_map[];
extern unsigned int  px, py;
extern signed int    smb_vx;
extern unsigned char smb_px_sub;
void smb_hstep_ref(void);
void smb_hstep_asm(void);

#define NC 10
static const unsigned int  pxs[NC] = {100, 100, 100, 100,   0, 239, 144,  81, 100, 100};
static const signed int    vxs[NC] = {256,-256, 100,-100,-256, 512, 256,-256,  10, -10};
static const unsigned char sbs[NC] = {  0,   0, 200,  50,   0,   0,   0,   0,   5,   5};

static void seed(unsigned char i) { px = pxs[i]; py = 100; smb_vx = vxs[i]; smb_px_sub = sbs[i]; }

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;
    for (i = 0; i < 30; i++) { the_map[i * 32 + 10] = 2; the_map[i * 32 + 20] = 2; }

    for (i = 0; i < NC; i++) {
        unsigned int rpx, apx; signed int rvx, avx; unsigned char rsb, asb;
        seed(i); smb_hstep_ref(); rpx = px; rvx = smb_vx; rsb = smb_px_sub;
        seed(i); smb_hstep_asm(); apx = px; avx = smb_vx; asb = smb_px_sub;
        buf[8 + i * 10 + 0] = (unsigned char)rpx; buf[8 + i * 10 + 1] = (unsigned char)(rpx >> 8);
        buf[8 + i * 10 + 2] = (unsigned char)rvx; buf[8 + i * 10 + 3] = (unsigned char)(rvx >> 8);
        buf[8 + i * 10 + 4] = rsb;
        buf[8 + i * 10 + 5] = (unsigned char)apx; buf[8 + i * 10 + 6] = (unsigned char)(apx >> 8);
        buf[8 + i * 10 + 7] = (unsigned char)avx; buf[8 + i * 10 + 8] = (unsigned char)(avx >> 8);
        buf[8 + i * 10 + 9] = asb;
        if (rpx != apx || rvx != avx || rsb != asb) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC; buf[2] = mism; buf[3] = firstBad; buf[0] = 0xAA;
    for (;;) { }
}
