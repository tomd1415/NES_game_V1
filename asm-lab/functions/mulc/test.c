/* Driver for the MULC macro test. For each world width K in {32,64,96,128} and
 * each multiplicand v, compute v*K via the ASM MULC entry and via C, and compare.
 * Layout at $0308 + i*4: +0 vLo? no — we store per (K,v): asmLo asmHi cLo cHi.
 * Simpler: compute mismatches in-ROM. $0301 = NCASES, $0302 = mismatches,
 * $0300 = 0xAA done, and $0308+ = per-case {v, K_index, asmLo, asmHi} for the
 * harness to spot-check.
 */
unsigned int mul32(unsigned char v);
unsigned int mul64(unsigned char v);
unsigned int mul96(unsigned char v);
unsigned int mul128(unsigned char v);

static const unsigned char vs[] = {0, 1, 2, 3, 29, 30, 59, 60, 100, 200, 255};
#define NV (sizeof(vs) / sizeof(vs[0]))

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, idx = 0;
    for (i = 0; i < NV; i++) {
        unsigned char v = vs[i];
        unsigned int got, want;
        unsigned char k;
        for (k = 0; k < 4; k++) {
            switch (k) {
                case 0: got = mul32(v);  want = (unsigned int)v * 32;  break;
                case 1: got = mul64(v);  want = (unsigned int)v * 64;  break;
                case 2: got = mul96(v);  want = (unsigned int)v * 96;  break;
                default: got = mul128(v); want = (unsigned int)v * 128; break;
            }
            if (got != want) mism++;
            if (idx < 30) {
                buf[8 + idx * 4 + 0] = v;
                buf[8 + idx * 4 + 1] = k;
                buf[8 + idx * 4 + 2] = (unsigned char)got;
                buf[8 + idx * 4 + 3] = (unsigned char)(got >> 8);
                idx++;
            }
        }
    }
    buf[1] = (unsigned char)(NV * 4);
    buf[2] = mism;
    buf[0] = 0xAA;
    for (;;) { }
}
