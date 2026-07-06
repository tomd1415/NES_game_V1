/* Per-function unit driver for scroll_follow. For each case: seed cam_x/cam_y,
 * run the C reference, record the resulting camera; reset the same seed, run the
 * ASM candidate, record. Layout per case at $0308 + i*8:
 *   +0 refCamX(16)  +2 refCamY(16)  +4 asmCamX(16)  +6 asmCamY(16)
 *   $0301 = NCASES  $0302 = mismatches  $0300 = 0xAA done
 */
extern unsigned int cam_x;
extern unsigned int cam_y;
void sf_ref(unsigned int target_world_x, unsigned int target_world_y);
void sf_asm(unsigned int target_world_x, unsigned int target_world_y);

#define NCASES 10
static const unsigned int icx[NCASES] = {0,  0,   100, 100, 100, 200, 256, 10, 50,  150};
static const unsigned int icy[NCASES] = {0,  0,   100, 100, 100, 200, 240, 10, 50,  150};
static const unsigned int tx[NCASES]  = {50, 200, 150, 250, 200, 1000, 50, 5,  300, 150};
static const unsigned int ty[NCASES]  = {50, 200, 150, 250, 200, 1000, 50, 5,  20,  150};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0;
    for (i = 0; i < NCASES; i++) {
        unsigned int rx, ry, ax, ay;
        cam_x = icx[i]; cam_y = icy[i];
        sf_ref(tx[i], ty[i]); rx = cam_x; ry = cam_y;
        cam_x = icx[i]; cam_y = icy[i];
        sf_asm(tx[i], ty[i]); ax = cam_x; ay = cam_y;
        buf[8 + i * 8 + 0] = (unsigned char)rx;  buf[8 + i * 8 + 1] = (unsigned char)(rx >> 8);
        buf[8 + i * 8 + 2] = (unsigned char)ry;  buf[8 + i * 8 + 3] = (unsigned char)(ry >> 8);
        buf[8 + i * 8 + 4] = (unsigned char)ax;  buf[8 + i * 8 + 5] = (unsigned char)(ax >> 8);
        buf[8 + i * 8 + 6] = (unsigned char)ay;  buf[8 + i * 8 + 7] = (unsigned char)(ay >> 8);
        if (rx != ax || ry != ay) mism++;
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[0] = 0xAA;
    for (;;) { }
}
