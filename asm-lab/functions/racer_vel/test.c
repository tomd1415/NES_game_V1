/* Unit driver for racer_vel. Sweeps heading around the 16 directions (cardinals +
 * diagonals) x speeds (0, top, mid, reverse) — including the negative-product FLOOR
 * cases ((-25*127)>>5 = -100, (-80*127)>>5 = -318) where a magnitude-then-negate
 * would be off by one. $0308 + i*8: ref{vx(2) vy(2)} asm{vx(2) vy(2)}. */
extern signed int   racer_speed, vx, vy;
extern unsigned char racer_heading;
void racer_vel_ref(void);
void racer_vel_asm(void);

#define NC 14
static const signed int    sps[NC] = {  0, 640, 640, 640, 640, 640, -320, 100, 100, -100,   5, 636, 636, 320};
static const unsigned char hds[NC] = {  0,   0,   4,   8,  12,   2,    0,   1,   3,    0,   0,   5,  11,   7};

static void seed(unsigned char i) { racer_speed = sps[i]; racer_heading = hds[i]; }

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (i = 0; i < NC; i++) {
        signed int rvx, rvy, avx, avy;
        seed(i); racer_vel_ref(); rvx = vx; rvy = vy;
        seed(i); racer_vel_asm(); avx = vx; avy = vy;
        buf[8 + i * 8 + 0] = (unsigned char)rvx; buf[8 + i * 8 + 1] = (unsigned char)(rvx >> 8);
        buf[8 + i * 8 + 2] = (unsigned char)rvy; buf[8 + i * 8 + 3] = (unsigned char)(rvy >> 8);
        buf[8 + i * 8 + 4] = (unsigned char)avx; buf[8 + i * 8 + 5] = (unsigned char)(avx >> 8);
        buf[8 + i * 8 + 6] = (unsigned char)avy; buf[8 + i * 8 + 7] = (unsigned char)(avy >> 8);
        if (rvx != avx || rvy != avy) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC; buf[2] = mism; buf[3] = firstBad; buf[0] = 0xAA;
    for (;;) { }
}
