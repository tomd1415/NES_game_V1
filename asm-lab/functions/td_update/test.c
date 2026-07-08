/* Per-function unit driver for td_update (the top-down player update).
 *
 * Map: a vertical WALL column (col 8) + a horizontal WALL row (row 10). For each
 * case, seed (pad, px, py, walk_speed) — plus plrdir=0x99, jumping/jmp_up/
 * on_ladder = nonzero so the resets are checked — run the C ref, capture; re-seed,
 * run the ASM; the harness at $0300 checks ref == asm == JS model for px/py/plrdir
 * (jumping/jmp_up/on_ladder ref-vs-asm equality is in the mismatch count).
 *   $0300 = 0xAA  $0301 = NCASES  $0302 = mismatch count  $0303 = first bad idx
 *   $0308 + i*10 = ref_px(2) ref_py(2) ref_plrdir  asm_px(2) asm_py(2) asm_plrdir
 */
extern unsigned char the_map[];
extern unsigned int  px, py;
extern unsigned char pad, walk_speed, plrdir, jumping, jmp_up, on_ladder;
void td_update_ref(void);
void td_update_asm(void);

#define NC 16
static const unsigned char pads[NC] = {0x01,0x01,0x02,0x02,0x08,0x04,0x04,0x08,0x05,0x01,0x02,0x08,0x04,0x01,0x03,0x0F};
static const unsigned int  pxs[NC]  = {  16,  48,  48,  72,  16,  16,  16,  16,  16, 240,   0,  16,  16,  16,  16,  32};
static const unsigned int  pys[NC]  = {  16,  16,  16,  16,  64,  64,  32,  88,  32,  16,  16,   0, 224,  16,  16,  32};
static const unsigned char wss[NC]  = {   2,   2,   2,   2,   2,   2,   2,   2,   1,   1,   2,   2,   1,   3,   2,   1};

static void seed(unsigned char i) {
    px = pxs[i]; py = pys[i]; pad = pads[i]; walk_speed = wss[i];
    plrdir = 0x99; jumping = 1; jmp_up = 5; on_ladder = 1;
}

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;
    for (i = 0; i < 30; i++) the_map[i * 32 + 8] = 2;   /* WALL column 8 */
    for (i = 0; i < 32; i++) the_map[10 * 32 + i] = 2;  /* WALL row 10 */

    for (i = 0; i < NC; i++) {
        unsigned int rpx, rpy, apx, apy;
        unsigned char rpd, rju, rjm, rol, apd, aju, ajm, aol;
        seed(i); td_update_ref();
        rpx = px; rpy = py; rpd = plrdir; rju = jumping; rjm = jmp_up; rol = on_ladder;
        seed(i); td_update_asm();
        apx = px; apy = py; apd = plrdir; aju = jumping; ajm = jmp_up; aol = on_ladder;
        buf[8 + i * 10 + 0] = (unsigned char)rpx; buf[8 + i * 10 + 1] = (unsigned char)(rpx >> 8);
        buf[8 + i * 10 + 2] = (unsigned char)rpy; buf[8 + i * 10 + 3] = (unsigned char)(rpy >> 8);
        buf[8 + i * 10 + 4] = rpd;
        buf[8 + i * 10 + 5] = (unsigned char)apx; buf[8 + i * 10 + 6] = (unsigned char)(apx >> 8);
        buf[8 + i * 10 + 7] = (unsigned char)apy; buf[8 + i * 10 + 8] = (unsigned char)(apy >> 8);
        buf[8 + i * 10 + 9] = apd;
        if (rpx != apx || rpy != apy || rpd != apd || rju != aju || rjm != ajm || rol != aol) {
            mism++; if (firstBad == 0xFF) firstBad = i;
        }
    }
    buf[1] = NC;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;
    for (;;) { }
}
