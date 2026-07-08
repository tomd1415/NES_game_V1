/* Per-function unit driver for plat_vmove (platformer vertical physics).
 * Map: WALL row 6 (cols 2-5), PLATFORM row 12 (cols 8-11), SOLID floor row 20.
 * For each case seed (px,py,jumping,jmp_up,on_ladder), run C ref, capture; re-seed,
 * run ASM; the harness at $0300 checks ref == asm == JS model for py/jumping/jmp_up.
 *   $0308 + i*8 = ref_py(2) ref_jumping ref_jmp_up  asm_py(2) asm_jumping asm_jmp_up
 */
extern unsigned char the_map[];
extern unsigned int  px, py;
extern unsigned char jumping, jmp_up, on_ladder;
void plat_vmove_ref(void);
void plat_vmove_asm(void);

#define NC 12
static const unsigned int  pxs[NC] = {200, 200,  24, 200, 200,  80, 200, 200, 200,  40,  80, 200};
static const unsigned int  pys[NC] = {100,  17,  50, 100, 148,  84, 232, 100, 100,  50, 100,  50};
static const unsigned char ju [NC] = {  1,   1,   1,   0,   0,   0,   0,   1,   1,   1,   1,   1};
static const unsigned char jm [NC] = {  5,   3,   5,   0,   0,   0,   0,   0,   5,   5,   5,   1};
static const unsigned char ol [NC] = {  0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0};

static void seed(unsigned char i) {
    px = pxs[i]; py = pys[i]; jumping = ju[i]; jmp_up = jm[i]; on_ladder = ol[i];
}

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;
    for (i = 2; i <= 5; i++) the_map[6 * 32 + i] = 2;    /* WALL ceiling row 6 */
    for (i = 8; i <= 11; i++) the_map[12 * 32 + i] = 3;  /* PLATFORM row 12 */
    for (i = 0; i < 32; i++) the_map[20 * 32 + i] = 1;   /* SOLID floor row 20 */

    for (i = 0; i < NC; i++) {
        unsigned int rpy, apy;
        unsigned char rju, rjm, aju, ajm;
        seed(i); plat_vmove_ref(); rpy = py; rju = jumping; rjm = jmp_up;
        seed(i); plat_vmove_asm(); apy = py; aju = jumping; ajm = jmp_up;
        buf[8 + i * 8 + 0] = (unsigned char)rpy; buf[8 + i * 8 + 1] = (unsigned char)(rpy >> 8);
        buf[8 + i * 8 + 2] = rju; buf[8 + i * 8 + 3] = rjm;
        buf[8 + i * 8 + 4] = (unsigned char)apy; buf[8 + i * 8 + 5] = (unsigned char)(apy >> 8);
        buf[8 + i * 8 + 6] = aju; buf[8 + i * 8 + 7] = ajm;
        if (rpy != apy || rju != aju || rjm != ajm) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;
    for (;;) { }
}
