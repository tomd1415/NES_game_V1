/* C reference for world_to_screen_x, lifted verbatim from
 * steps/Step_Playground/src/scroll.c. `cam_x` is the shared 16-bit global that
 * BOTH the C reference and the ASM candidate read (cc65 places it in BSS at
 * $6000 WRAM). SCREEN_W_PX is the NES screen width (256).
 */
#define SCREEN_W_PX 256

unsigned int cam_x;

unsigned char w2sx_ref(unsigned int world_x) {
    if (world_x < cam_x) return 0xFF;
    {
        unsigned int off = world_x - cam_x;
        if (off >= SCREEN_W_PX) return 0xFF;
        return (unsigned char)off;
    }
}
