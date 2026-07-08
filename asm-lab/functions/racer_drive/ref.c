/* C reference for the racer DRIVE step (BW_GAME_STYLE 3): steer + accel / friction
 * / brake / reverse, lifted from platformer.c. Pure register math on racer_heading
 * (0..15, 22.5deg steps) + racer_speed (8.8 signed, -REV_MAX..+MAX). No memory or
 * collision — velocity-from-heading (racer_vel) and the per-axis move (px_integrate
 * + box_on_edge) are separate leaves. Shared globals both the C ref and the ASM
 * candidate read/write (the smb_accel convention). Constants match the engine's
 * #ifndef defaults + the RACER_MAX_SPEED default (Builder Speed knob tier 3). */
#define RACER_ACCEL     13
#define RACER_FRICTION  8
#define RACER_BRAKE     40
#define RACER_MAX_SPEED 640
#define RACER_REV_MAX   (RACER_MAX_SPEED / 2)

unsigned char pad;
unsigned char racer_heading;
signed int    racer_speed;

void racer_drive_ref(void) {
    if (pad & 0x02) racer_heading = (racer_heading + 15) & 15;   /* LEFT  = turn CCW */
    if (pad & 0x01) racer_heading = (racer_heading + 1) & 15;    /* RIGHT = turn CW  */
    if (pad & 0x88) {                                            /* A or UP = accelerate */
        racer_speed += RACER_ACCEL;
        if (racer_speed > RACER_MAX_SPEED) racer_speed = RACER_MAX_SPEED;
    } else if (pad & 0x04) {                                     /* DOWN = brake, then reverse */
        racer_speed -= RACER_BRAKE;
        if (racer_speed < -(RACER_REV_MAX)) racer_speed = -(RACER_REV_MAX);
    } else {                                                     /* coast = friction toward 0 */
        if (racer_speed > RACER_FRICTION) racer_speed -= RACER_FRICTION;
        else if (racer_speed < -(RACER_FRICTION)) racer_speed += RACER_FRICTION;
        else racer_speed = 0;
    }
}
