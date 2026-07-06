/* C reference for world_to_screen_y, from scroll.c. Same shape as _x but the
 * screen height is 240 (NOT 256), so the ">= SCREEN_H_PX" test is a real
 * compare, not a clean high-byte test — a useful contrast to _x.
 */
#define SCREEN_H_PX 240

unsigned int cam_y;

unsigned char w2sy_ref(unsigned int world_y) {
    if (world_y < cam_y) return 0xFF;
    {
        unsigned int off = world_y - cam_y;
        if (off >= SCREEN_H_PX) return 0xFF;
        return (unsigned char)off;
    }
}
