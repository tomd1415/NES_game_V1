/*! SNIPPET
{
  "id": "solid-obstacles",
  "title": "Solid obstacles (walls)",
  "summary": "Scene sprites block the player's horizontal movement.",
  "description": "Checks every scene sprite (the ones placed in the Sprites editor's 'Scene' list) and, if the player overlaps one, pushes them back out sideways. Works best for vertical pillars and crates. Combine with 'Stand on obstacles' to make full platforms. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["collision", "world"]
}
*/
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            sx = ss_x[i];
            sy = ss_y[i];
            sw = ss_w[i] << 3;
            sh = ss_h[i] << 3;
            if (px + (PLAYER_W << 3) > sx && px < sx + sw
                && py + (PLAYER_H << 3) > sy && py < sy + sh) {
                if (plrdir == 0x40) {
                    px = sx + sw;
                } else {
                    if (sx >= (PLAYER_W << 3)) px = sx - (PLAYER_W << 3);
                    else px = 0;
                }
            }
        }
