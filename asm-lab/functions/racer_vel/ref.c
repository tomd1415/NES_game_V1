/* C reference for the racer VELOCITY-from-heading step (BW_GAME_STYLE 3), lifted
 * from platformer.c: vx = ((speed>>2) * COS16[heading]) >> 5 and vy likewise with
 * COS16[(heading+12)&15] (sin). All shifts are C signed ints -> ARITHMETIC (floor),
 * which matters for negative products: e.g. (-25*127)>>5 = floor(-99.2) = -100, NOT
 * -(3175>>5) = -99. The ASM must two's-complement the signed product THEN shift, not
 * shift a magnitude and negate. Shared globals both the C ref and the ASM read/write. */
signed int   racer_speed;
unsigned char racer_heading;
signed int   vx, vy;

/* cos(angle) in Q7 (+-127 ~ +-1.0); sin(h) = COS16[(h+12)&15]. Heading 0=right,
 * 4=down, 8=left, 12=up (screen Y down). Matches platformer.c's COS16 exactly. */
const signed char COS16[16] = { 127, 117, 90, 49, 0, -49, -90, -117,
                               -127, -117, -90, -49, 0, 49, 90, 117 };

void racer_vel_ref(void) {
    vx = ((signed int)(racer_speed >> 2) * COS16[racer_heading]) >> 5;
    vy = ((signed int)(racer_speed >> 2) * COS16[(racer_heading + 12) & 15]) >> 5;
}
