/*! SNIPPET
{
  "id": "dash-on-b",
  "title": "Dash on B",
  "summary": "Tap B to rocket forward for a few frames.",
  "description": "Starts a 10-frame horizontal dash in the direction the player is facing. Uses static locals to track how many dash frames remain and to edge-trigger the B press. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        {
            static unsigned char dash_frames = 0;
            static unsigned char prev_b = 0;
            if ((pad & 0x40) && !prev_b && dash_frames == 0) {
                dash_frames = 10;
            }
            if (dash_frames > 0) {
                if (plrdir == 0x40) {
                    if (px >= 4) px -= 4;
                } else {
                    if (px < (256 - PLAYER_W * 8 - 4)) px += 4;
                }
                dash_frames--;
            }
            prev_b = (pad & 0x40) ? 1 : 0;
        }
