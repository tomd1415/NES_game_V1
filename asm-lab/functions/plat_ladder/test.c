/* Per-function unit driver for plat_ladder.
 * Map: LADDER col 10 (rows 8-18), SOLID floor row 20, WALL (10,7)+(11,7) above
 * the ladder top, WALL (11,9) beside a ladder rung (tie-break). Records py/
 * jumping/jmp_up/on_ladder for ref vs asm; harness checks == JS model too.
 *   $0308 + i*10 = ref_py(2) ref_jumping ref_jmp_up ref_on_ladder  asm_...(x5)
 */
extern unsigned char the_map[];
extern unsigned int  px, py;
extern unsigned char pad, climb_speed, jumping, jmp_up, on_ladder;
void plat_ladder_ref(void);
void plat_ladder_asm(void);

#define NC 10
static const unsigned int  pxs[NC] = { 80,  80,  80,  80,  80,  80, 200,  80,  80,  80};
static const unsigned int  pys[NC] = {100, 100, 100,  80,  64, 148, 100, 100, 100, 148};
static const unsigned char pds[NC] = {0x00,0x08,0x04,0x08,0x08,0x04,0x08,0x08,0x0C,0x08};
static const unsigned char css[NC] = {  1,   1,   1,   1,   1,   1,   1,   2,   1,   1};

static void seed(unsigned char i) {
    px = pxs[i]; py = pys[i]; pad = pds[i]; climb_speed = css[i];
    jumping = 1; jmp_up = 7; on_ladder = 0;
}

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;
    for (i = 8; i <= 18; i++) the_map[i * 32 + 10] = 6;  /* LADDER col 10 rows 8-18 */
    for (i = 0; i < 32; i++) the_map[20 * 32 + i] = 1;   /* SOLID floor row 20 */
    the_map[7 * 32 + 10] = 2; the_map[7 * 32 + 11] = 2;  /* WALL above ladder top */
    the_map[9 * 32 + 11] = 2;                            /* WALL beside a rung (tie-break) */

    for (i = 0; i < NC; i++) {
        unsigned int rpy, apy;
        unsigned char rju, rjm, rol, aju, ajm, aol;
        seed(i); plat_ladder_ref(); rpy = py; rju = jumping; rjm = jmp_up; rol = on_ladder;
        seed(i); plat_ladder_asm(); apy = py; aju = jumping; ajm = jmp_up; aol = on_ladder;
        buf[8 + i * 10 + 0] = (unsigned char)rpy; buf[8 + i * 10 + 1] = (unsigned char)(rpy >> 8);
        buf[8 + i * 10 + 2] = rju; buf[8 + i * 10 + 3] = rjm; buf[8 + i * 10 + 4] = rol;
        buf[8 + i * 10 + 5] = (unsigned char)apy; buf[8 + i * 10 + 6] = (unsigned char)(apy >> 8);
        buf[8 + i * 10 + 7] = aju; buf[8 + i * 10 + 8] = ajm; buf[8 + i * 10 + 9] = aol;
        if (rpy != apy || rju != aju || rjm != ajm || rol != aol) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;
    for (;;) { }
}
