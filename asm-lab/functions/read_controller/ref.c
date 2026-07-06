/* C reference for read_controller, from main.c. Strobes JOYPAD1 ($4016) then
 * shifts in 8 button bits, A first -> bit 7 (A B Select Start Up Down Left Right).
 */
#define JOYPAD1 (*(unsigned char *)0x4016)

unsigned char rc_ref(void) {
    unsigned char result = 0;
    unsigned char j;
    JOYPAD1 = 1;
    JOYPAD1 = 0;
    for (j = 0; j < 8; j++) {
        result = result << 1;
        if (JOYPAD1 & 1) result = result | 1;
    }
    return result;
}
