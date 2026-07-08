/* Unit driver for smb_accel. $0308 + i*6 = ref_vx(2) ref_plrdir  asm_vx(2) asm_plrdir */
extern unsigned char pad, plrdir;
extern signed int smb_vx;
void smb_accel_ref(void);
void smb_accel_asm(void);

#define NC 14
static const unsigned char pds[NC] = {0x01,0x41,0x02,0x00,0x01,0x02,0x03,0x02,0x00,0x00,0x41,0x02,0x01,0x00};
static const signed int    vxs[NC] = {   0,   0,   0, 100, 400,-600,   0, 200, -30,   0, 600,-384, 384,-100};

static void seed(unsigned char i) { pad = pds[i]; smb_vx = vxs[i]; plrdir = 0x99; }

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (i = 0; i < NC; i++) {
        signed int rv, av;
        unsigned char rp, ap;
        seed(i); smb_accel_ref(); rv = smb_vx; rp = plrdir;
        seed(i); smb_accel_asm(); av = smb_vx; ap = plrdir;
        buf[8 + i * 6 + 0] = (unsigned char)rv; buf[8 + i * 6 + 1] = (unsigned char)(rv >> 8);
        buf[8 + i * 6 + 2] = rp;
        buf[8 + i * 6 + 3] = (unsigned char)av; buf[8 + i * 6 + 4] = (unsigned char)(av >> 8);
        buf[8 + i * 6 + 5] = ap;
        if (rv != av || rp != ap) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;
    for (;;) { }
}
