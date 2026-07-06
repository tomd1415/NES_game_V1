/* Per-function unit driver for advance_animation. Each case seeds the 6 input
 * state vars, runs the C ref, snapshots (frame,tick,prev,baseLo,baseHi); resets
 * the seed, runs the ASM, compares in-ROM. Layout at $0308 + i*6:
 *   +0 frame +1 tick +2 prev +3 baseLo +4 baseHi +5 ok
 *   $0301 = NCASES  $0302 = mismatches  $0300 = 0xAA done
 */
extern unsigned char anim_mode, anim_prev_mode, anim_frame, anim_tick;
extern unsigned char anim_frame_count, anim_frame_ticks;
extern unsigned int  anim_base;
void advance_ref(void);
void advance_asm(void);

#define NCASES 9
/* {mode, prev, frame, tick, count, ticks} */
static const unsigned char st[NCASES][6] = {
    {1, 0, 5, 3, 2, 8},   /* mode changed -> reset frame/tick, then tick=1     */
    {1, 1, 2, 3, 4, 8},   /* no change, tick below threshold -> tick=4         */
    {1, 1, 1, 7, 4, 8},   /* tick hits threshold -> tick=0, frame=2            */
    {1, 1, 3, 7, 4, 8},   /* frame rollover -> frame=0                         */
    {0, 0, 0, 0, 1, 1},   /* static (count=1) -> no advance, base=0            */
    {2, 1, 6, 0, 1, 4},   /* mode change to a static anim -> frame/tick reset  */
    {1, 1, 9, 5, 16, 6},  /* mid-sequence, tick++ -> 6>=6 -> frame=10, base=40 */
    {1, 1, 63, 7, 64, 8}, /* frame 63->64 wrap? 64<64 false -> stays? see model*/
    {3, 3, 20, 1, 30, 2}, /* tick 1->2>=2 -> frame=21, base=84 (16-bit)        */
};

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0;
    for (i = 0; i < NCASES; i++) {
        unsigned char rF, rT, rP, rBL, rBH, ok = 1;
        anim_mode = st[i][0]; anim_prev_mode = st[i][1]; anim_frame = st[i][2];
        anim_tick = st[i][3]; anim_frame_count = st[i][4]; anim_frame_ticks = st[i][5];
        advance_ref();
        rF = anim_frame; rT = anim_tick; rP = anim_prev_mode;
        rBL = (unsigned char)anim_base; rBH = (unsigned char)(anim_base >> 8);

        anim_mode = st[i][0]; anim_prev_mode = st[i][1]; anim_frame = st[i][2];
        anim_tick = st[i][3]; anim_frame_count = st[i][4]; anim_frame_ticks = st[i][5];
        advance_asm();
        if (anim_frame != rF || anim_tick != rT || anim_prev_mode != rP
         || (unsigned char)anim_base != rBL || (unsigned char)(anim_base >> 8) != rBH) { ok = 0; mism++; }

        buf[8 + i * 6 + 0] = rF;
        buf[8 + i * 6 + 1] = rT;
        buf[8 + i * 6 + 2] = rP;
        buf[8 + i * 6 + 3] = rBL;
        buf[8 + i * 6 + 4] = rBH;
        buf[8 + i * 6 + 5] = ok;
    }
    buf[1] = NCASES;
    buf[2] = mism;
    buf[0] = 0xAA;
    for (;;) { }
}
