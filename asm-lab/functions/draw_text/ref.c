/* C reference for draw_text (non-scroll build), from main.c. Writes a
 * zero-terminated run of tile indices into nametable 0 at (row,col), with the
 * rendering-off / scroll-reset framing. Observable effect: the nametable.
 */
#define PPU_MASK   (*(unsigned char *)0x2001)
#define PPU_SCROLL (*(unsigned char *)0x2005)
#define PPU_ADDR   (*(unsigned char *)0x2006)
#define PPU_DATA   (*(unsigned char *)0x2007)
void waitvsync(void);

void dt_ref(unsigned char row, unsigned char col, const unsigned char *text) {
    unsigned int addr;
    unsigned char j;
    waitvsync();
    PPU_MASK = 0;
    addr = 0x2000 + ((unsigned int)row * 32) + col;
    PPU_ADDR = (unsigned char)(addr >> 8);
    PPU_ADDR = (unsigned char)(addr & 0xFF);
    j = 0;
    while (text[j] != 0x00) {
        PPU_DATA = text[j];
        j++;
    }
    PPU_SCROLL = 0;
    PPU_SCROLL = 0;
    PPU_MASK = 0x1E;
}
