/* Per-function unit driver for reaction_for.
 *   $0300=0xAA done  $0301=NCASES  $0302=mismatches  $0303=first bad
 *   $0308+i*2=ref[i]  $0309+i*2=asm[i]
 * Cases: valid corners, sprite OOB, behaviour OOB, both OOB (behaviour checked
 * first, so a both-OOB case still returns via the behaviour branch).
 */
extern unsigned char sprite_reactions[16];
unsigned char rf_ref(unsigned char sprite_idx, unsigned char behaviour_id);
unsigned char rf_asm(unsigned char sprite_idx, unsigned char behaviour_id);

#define NCASES 10
static const unsigned char sprites[NCASES] = {0, 1, 0, 1, 2, 0, 1, 2, 0, 1};
static const unsigned char behs[NCASES]    = {0, 7, 7, 0, 0, 8, 8, 8, 3, 5};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (i = 0; i < 16; i++) sprite_reactions[i] = (unsigned char)(i * 11 + 5);

    for (i = 0; i < NCASES; i++) {
        unsigned char rref, rasm;
        rref = rf_ref(sprites[i], behs[i]);
        rasm = rf_asm(sprites[i], behs[i]);
        buf[8 + i * 2 + 0] = rref;
        buf[8 + i * 2 + 1] = rasm;
        if (rref != rasm) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[3] = firstBad;
    buf[0] = 0xAA;
    for (;;) { }
}
