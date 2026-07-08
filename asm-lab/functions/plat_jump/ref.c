/* C reference for the platformer JUMP TRIGGER (non-SMB), lifted from
 * platformer.c: UP edge-triggered take-off from the ground. Runs in the `else`
 * (not on_ladder) branch. The SMB A-jump / run-boost / variable-cut are
 * #ifdef BW_SMB_JUMP and out of the default platformer. Reads pad/prev_pad/
 * jumping; writes jumping/jmp_up. jump_height (jmp_up seed) is 20 in the template. */
unsigned char pad, prev_pad, jumping, jmp_up;

void plat_jump_ref(void) {
    if (((pad & 0x08) && !(prev_pad & 0x08)) && !jumping) {
        jumping = 1;
        jmp_up = 20;
    }
}
