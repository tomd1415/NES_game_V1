/* C reference for write_palettes, from main.c. Sets the PPU address to $3F00
 * then streams 32 palette bytes through PPU_DATA (auto-increment). The driver
 * fills palette_bytes[] before calling. Observable effect: PPU palette RAM.
 */
#define PPU_ADDR (*(unsigned char *)0x2006)
#define PPU_DATA (*(unsigned char *)0x2007)

unsigned char palette_bytes[32];   /* driver-filled */

void wp_ref(void) {
    unsigned char i;
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x00;
    for (i = 0; i < 32; i++) {
        PPU_DATA = palette_bytes[i];
    }
}
