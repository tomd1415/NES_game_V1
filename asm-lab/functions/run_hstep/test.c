/* Unit driver for run_hstep. Sweeps auto-runner cases: normal advance, jump-state
 * preservation, track-end wrap (exact + just-below), fall-off-bottom (exact
 * boundary + just-above safe), and a spike at vs off the body centre.
 * $0308 + i*16: ref{cam_x(2) px(2) py(2) jump jmp_up} asm{same}. */
extern unsigned char the_map[];
extern unsigned int  cam_x, px, py;
extern unsigned char jumping, jmp_up;
void run_hstep_ref(void);
void run_hstep_asm(void);

#define NC 10
static const unsigned int  cxs[NC] = {100, 100, 255, 254, 253, 100, 100, 100, 100, 100};
static const unsigned int  pys[NC] = {176, 176, 176, 176, 176, 236, 232, 231, 176, 176};
static const unsigned char js[NC]  = {  0,   1,   1,   0,   0,   1,   0,   0,   1,   0};
static const unsigned char us[NC]  = {  0,   5,   5,   0,   0,   3,   0,   0,   7,   0};
static const unsigned char skc[NC] = {255, 255, 255, 255, 255, 255, 255, 255,  21,  20}; /* 0xFF = none */
static const unsigned char skr[NC] = {  0,   0,   0,   0,   0,   0,   0,   0,  23,  23};

static void seed(unsigned char i) { cam_x = cxs[i]; py = pys[i]; jumping = js[i]; jmp_up = us[i]; }

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (i = 0; i < NC; i++) {
        unsigned int rcx, rpx, rpy, acx, apx, apy;
        unsigned char rj, ru, aj, au;
        for (k = 0; k < 64u * 30u; k++) the_map[k] = 0;
        if (skc[i] != 0xFF) the_map[(unsigned int)skr[i] * 64u + skc[i]] = 7;

        seed(i); run_hstep_ref(); rcx = cam_x; rpx = px; rpy = py; rj = jumping; ru = jmp_up;
        seed(i); run_hstep_asm(); acx = cam_x; apx = px; apy = py; aj = jumping; au = jmp_up;

        buf[8 + i * 16 + 0]  = (unsigned char)rcx;  buf[8 + i * 16 + 1]  = (unsigned char)(rcx >> 8);
        buf[8 + i * 16 + 2]  = (unsigned char)rpx;  buf[8 + i * 16 + 3]  = (unsigned char)(rpx >> 8);
        buf[8 + i * 16 + 4]  = (unsigned char)rpy;  buf[8 + i * 16 + 5]  = (unsigned char)(rpy >> 8);
        buf[8 + i * 16 + 6]  = rj;                  buf[8 + i * 16 + 7]  = ru;
        buf[8 + i * 16 + 8]  = (unsigned char)acx;  buf[8 + i * 16 + 9]  = (unsigned char)(acx >> 8);
        buf[8 + i * 16 + 10] = (unsigned char)apx;  buf[8 + i * 16 + 11] = (unsigned char)(apx >> 8);
        buf[8 + i * 16 + 12] = (unsigned char)apy;  buf[8 + i * 16 + 13] = (unsigned char)(apy >> 8);
        buf[8 + i * 16 + 14] = aj;                  buf[8 + i * 16 + 15] = au;

        if (rcx != acx || rpx != apx || rpy != apy || rj != aj || ru != au) {
            mism++; if (firstBad == 0xFF) firstBad = i;
        }
    }
    buf[1] = NC; buf[2] = mism; buf[3] = firstBad; buf[0] = 0xAA;
    for (;;) { }
}
