/* Unit driver for racer_laps. Car fixed at (100,100) -> centre cell (13,13); each
 * case places one marker there + seeds cp_stage/laps. Covers: CP1 arm (0->1), CP1
 * re-touch (no change), CP2 in order (1->2), CP2 out of order (no change), FINISH
 * with stage>=CP_COUNT (lap++), FINISH with stage<CP_COUNT (no lap), FINISH that
 * reaches LAPS_TO_WIN (finished=1), non-marker cell (no change).
 * $0308 + i*6: ref{cp_stage laps finished} asm{cp_stage laps finished}. */
extern unsigned char the_map[];
extern unsigned int  px, py;
extern unsigned char racer_cp_stage, racer_laps, racer_finished;
void racer_laps_ref(void);
void racer_laps_asm(void);

#define NC 8
static const unsigned char mk[NC] = { 5, 5, 6, 6, 7, 7, 7, 1 };
static const unsigned char st[NC] = { 0, 1, 1, 0, 1, 0, 1, 1 };
static const unsigned char lp[NC] = { 0, 0, 0, 0, 0, 0, 2, 0 };

static void seed(unsigned char i) {
    px = 100; py = 100;
    racer_cp_stage = st[i]; racer_laps = lp[i]; racer_finished = 0;
    the_map[13 * 32 + 13] = mk[i];   /* centre cell (13,13) */
}

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned int k;
    unsigned char i, mism = 0, firstBad = 0xFF;
    for (k = 0; k < 32u * 30u; k++) the_map[k] = 0;

    for (i = 0; i < NC; i++) {
        unsigned char rs, rl, rf, as, al, af;
        seed(i); racer_laps_ref(); rs = racer_cp_stage; rl = racer_laps; rf = racer_finished;
        seed(i); racer_laps_asm(); as = racer_cp_stage; al = racer_laps; af = racer_finished;
        buf[8 + i * 6 + 0] = rs; buf[8 + i * 6 + 1] = rl; buf[8 + i * 6 + 2] = rf;
        buf[8 + i * 6 + 3] = as; buf[8 + i * 6 + 4] = al; buf[8 + i * 6 + 5] = af;
        if (rs != as || rl != al || rf != af) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC; buf[2] = mism; buf[3] = firstBad; buf[0] = 0xAA;
    for (;;) { }
}
