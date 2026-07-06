/* C reference for clear_text_row (non-scroll build), from main.c. Writes
 * `width` zero tiles into nametable 0 at (row,col), with the render-off framing.
 */
#define PPU_MASK   (*(unsigned char *)0x2001)
#define PPU_SCROLL (*(unsigned char *)0x2005)
#define PPU_ADDR   (*(unsigned char *)0x2006)
#define PPU_DATA   (*(unsigned char *)0x2007)
void waitvsync(void);

void ctr_ref(unsigned char row, unsigned char col, unsigned char width) {
    unsigned int addr;
    unsigned char j;
    waitvsync();
    PPU_MASK = 0;
    addr = 0x2000 + ((unsigned int)row * 32) + col;
    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);
    for (j = 0; j < width; j++) {
        PPU_DATA = 0x00;
    }
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
}
