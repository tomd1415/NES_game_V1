/* Unit driver for racer_axis. Map: WALL column at col 25 + WALL row at row 25.
 * Cases: free move, X-blocked (slide), Y-blocked, both-blocked (corner), world-edge
 * clamp (np<0 low + np>max high, each axis), dominant-axis speed bleed vs a shallow
 * hit (blocked axis NOT dominant -> no bleed).
 * $0308 + i*16: ref{px(2) py(2) px_sub py_sub speed(2)} asm{same}. */
extern unsigned char the_map[];
extern unsigned int  px, py;
extern unsigned char px_sub, py_sub;
extern signed int    vx, vy, racer_speed;
void racer_axis_ref(void);
void racer_axis_asm(void);

#define NC 8
static const unsigned int cxs[NC] = { 64, 184,  64, 184,   1, 239, 184,  64};
static const unsigned int cys[NC] = { 64,  64, 184, 184,  64,  64,  64,   1};
static const signed int   vxs[NC] = {256, 512,   0, 512,-512, 512, 512,   0};
static const signed int   vys[NC] = {256,   0, 512, 512,   0,   0, 768,-512};

static void seed(unsigned char i) {
    px = cxs[i]; py = cys[i]; px_sub = 0; py_sub = 0;
    vx = vxs[i]; vy = vys[i]; racer_speed = 600;
}

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;
    for (k = 0; k < 30u; k++) the_map[k * 32 + 25] = 2;   /* WALL column, col 25 */
    for (k = 0; k < 32u; k++) the_map[25 * 32 + k] = 2;   /* WALL row, row 25    */

    for (i = 0; i < NC; i++) {
        unsigned int rpx, rpy, apx, apy; unsigned char rsx, rsy, asx, asy;
        signed int rsp, asp;
        seed(i); racer_axis_ref(); rpx = px; rpy = py; rsx = px_sub; rsy = py_sub; rsp = racer_speed;
        seed(i); racer_axis_asm(); apx = px; apy = py; asx = px_sub; asy = py_sub; asp = racer_speed;
        buf[8 + i * 16 + 0]  = (unsigned char)rpx; buf[8 + i * 16 + 1]  = (unsigned char)(rpx >> 8);
        buf[8 + i * 16 + 2]  = (unsigned char)rpy; buf[8 + i * 16 + 3]  = (unsigned char)(rpy >> 8);
        buf[8 + i * 16 + 4]  = rsx;                buf[8 + i * 16 + 5]  = rsy;
        buf[8 + i * 16 + 6]  = (unsigned char)rsp; buf[8 + i * 16 + 7]  = (unsigned char)(rsp >> 8);
        buf[8 + i * 16 + 8]  = (unsigned char)apx; buf[8 + i * 16 + 9]  = (unsigned char)(apx >> 8);
        buf[8 + i * 16 + 10] = (unsigned char)apy; buf[8 + i * 16 + 11] = (unsigned char)(apy >> 8);
        buf[8 + i * 16 + 12] = asx;                buf[8 + i * 16 + 13] = asy;
        buf[8 + i * 16 + 14] = (unsigned char)asp; buf[8 + i * 16 + 15] = (unsigned char)(asp >> 8);
        if (rpx != apx || rpy != apy || rsx != asx || rsy != asy || rsp != asp) {
            mism++; if (firstBad == 0xFF) firstBad = i;
        }
    }
    buf[1] = NC; buf[2] = mism; buf[3] = firstBad; buf[0] = 0xAA;
    for (;;) { }
}
