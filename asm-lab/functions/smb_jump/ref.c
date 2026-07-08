/* C reference for the SMB jump extras (BW_SMB_JUMP), lifted from platformer.c:
 * the jump trigger takes off on a UP-edge OR an A-edge (not just UP like the
 * plain platformer), from the ground, and a running take-off (B held) boosts the
 * ascent; then a variable-height cut trims an in-progress rise once both jump
 * buttons are released. inputs pad/prev_pad/jumping/jmp_up -> jumping/jmp_up. */
unsigned char pad, prev_pad, jumping, jmp_up;

void smb_jump_ref(void) {
    if ((((pad & 0x08) && !(prev_pad & 0x08)) || ((pad & 0x80) && !(prev_pad & 0x80))) && !jumping) {
        jumping = 1;
        jmp_up = 20;
        if (pad & 0x40) jmp_up += 8;   /* running take-off */
    }
    if (jumping && jmp_up > 4 && !(pad & 0x88)) jmp_up = 4;   /* variable-height cut */
}
