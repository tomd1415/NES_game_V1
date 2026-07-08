/* C reference for the SMB horizontal ACCEL step (BW_SMB_JUMP), lifted from
 * platformer.c: the 8.8 fixed-point velocity update toward a run/walk target,
 * with a 2x "skid" when reversing direction. This is sub-step 5a-i of the SMB
 * player update; the sub-pixel integrate + world clamp + leading-edge collision
 * are a separate leaf (they reuse px_integrate). Signed 16-bit throughout.
 *   maxs   = B held ? RUN_MAX : WALK_MAX
 *   target = RIGHT? maxs : LEFT? -maxs : 0
 *   accelerate smb_vx toward target; the accel doubles when the CURRENT velocity
 *   has the opposite sign to the direction we're pushing (a skid).
 *   plrdir follows the target sign (unchanged when target == 0).
 */
#define RUN_MAX 640
#define WALK_MAX 384
#define ACCEL 24

unsigned char pad, plrdir;
signed int    smb_vx;

void smb_accel_ref(void) {
    signed int target, accel;
    signed int maxs = (pad & 0x40) ? RUN_MAX : WALK_MAX;
    if (pad & 0x01) target = maxs;
    else if (pad & 0x02) target = -maxs;
    else target = 0;
    if (smb_vx < target) {
        accel = (smb_vx < 0) ? (ACCEL * 2) : ACCEL;
        smb_vx += accel; if (smb_vx > target) smb_vx = target;
    } else if (smb_vx > target) {
        accel = (smb_vx > 0) ? (ACCEL * 2) : ACCEL;
        smb_vx -= accel; if (smb_vx < target) smb_vx = target;
    }
    if (target > 0) plrdir = 0x00;
    else if (target < 0) plrdir = 0x40;
}
