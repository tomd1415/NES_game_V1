/* Unit driver for racer_drive. Sweeps steer (L/R/both, heading wrap), accelerate
 * (from rest / from reverse / cap clamp), brake (to reverse / -REV clamp), and
 * friction (decel toward 0 from +/-, the |speed|<=FRICTION snap-to-0, boundary).
 * $0308 + i*6: ref{heading speed(2)} asm{heading speed(2)}. */
extern unsigned char pad, racer_heading;
extern signed int    racer_speed;
void racer_drive_ref(void);
void racer_drive_asm(void);

#define NC 16
static const unsigned char pds[NC] = {0x01, 0x02, 0x80, 0x08, 0x88, 0x04, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x88, 0x01};
static const unsigned char hds[NC] = {  15,    0,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    5,    0};
static const signed int    sps[NC] = {   0,    0,    0,  100,  635,  100,    0, -300,  100,    5,   -5, -100,    8,    0, -600,    0};

static void seed(unsigned char i) { pad = pds[i]; racer_heading = hds[i]; racer_speed = sps[i]; }

void main(void) {
    volatile unsigned char *buf = (unsigned char *)0x0300;
    unsigned char i, mism = 0, firstBad = 0xFF;

    for (i = 0; i < NC; i++) {
        unsigned char rh, ah; signed int rs, as;
        seed(i); racer_drive_ref(); rh = racer_heading; rs = racer_speed;
        seed(i); racer_drive_asm(); ah = racer_heading; as = racer_speed;
        buf[8 + i * 6 + 0] = rh;
        buf[8 + i * 6 + 1] = (unsigned char)rs;  buf[8 + i * 6 + 2] = (unsigned char)(rs >> 8);
        buf[8 + i * 6 + 3] = ah;
        buf[8 + i * 6 + 4] = (unsigned char)as;  buf[8 + i * 6 + 5] = (unsigned char)(as >> 8);
        if (rh != ah || rs != as) { mism++; if (firstBad == 0xFF) firstBad = i; }
    }
    buf[1] = NC; buf[2] = mism; buf[3] = firstBad; buf[0] = 0xAA;
    for (;;) { }
}
