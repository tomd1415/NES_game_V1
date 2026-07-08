/* Per-function unit driver for px_integrate (the 8.8 sub-pixel integrate step).
 *
 * For each case: seed (pos,sub), run the C ref, capture (pos,sub); re-seed,
 * run the ASM candidate, capture (pos,sub); the Node/jsnes harness at $0300
 * checks ref == asm == an independent JS model.
 *   $0300 = 0xAA (done)  $0301 = NCASES  $0302 = mismatch count
 *   $0303 = first bad index (0xFF = none)
 *   $0308 + i*6 = ref_pos_lo, ref_pos_hi, ref_sub, asm_pos_lo, asm_pos_hi, asm_sub
 *
 * Cases exercise: forward whole-pixel + carry, backward fractional (v<0 leaves
 * sub high, pos-1), sub at 0/255, pos near 0 and 65535 (16-bit wrap), a couple
 * of realistic 8.8 speeds, and an overflowing v (sub+v past 32767) to prove the
 * ASM matches the C's 16-bit `signed int acc` wrap.
 */
extern signed int   pxi_pos;
extern unsigned char pxi_sub;
void pxi_integrate_ref(signed int v);
void pxi_integrate_asm(signed int v);

#define NCASES 15
static const signed int   pos0[NCASES] =
    { 100, 100,  100, 100,   0,     0, 65500, 300,  300,  200, 1000, 50000,  100,  100, 30000 };
static const unsigned char sub0[NCASES] =
    {   0, 200,    0,   0,   0,   255,     0, 128,  128,  100,   50,   200,  255,    1,   200 };
static const signed int    vel[NCASES] =
    { 256, 100, -256,  -1,  -1,     1,   600,-600,  640, -640,  384, -1280, -256, -300, 32767 };

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (i = 0; i < NCASES; i++) {
        signed int prf, pas;
        unsigned char srf, sas;
        pxi_pos = pos0[i]; pxi_sub = sub0[i];
        pxi_integrate_ref(vel[i]); prf = pxi_pos; srf = pxi_sub;
        pxi_pos = pos0[i]; pxi_sub = sub0[i];
        pxi_integrate_asm(vel[i]); pas = pxi_pos; sas = pxi_sub;
        buf[8 + i * 6 + 0] = (unsigned char)prf;
        buf[8 + i * 6 + 1] = (unsigned char)(prf >> 8);
        buf[8 + i * 6 + 2] = srf;
        buf[8 + i * 6 + 3] = (unsigned char)pas;
        buf[8 + i * 6 + 4] = (unsigned char)(pas >> 8);
        buf[8 + i * 6 + 5] = sas;
        if (prf != pas || srf != sas) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;   /* written last = "driver finished" */
    for (;;) { }
}
