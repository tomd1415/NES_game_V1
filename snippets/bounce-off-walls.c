/*! SNIPPET
{
  "id": "bounce-off-walls",
  "title": "Bounce off walls",
  "summary": "Walk the player automatically; reverse direction at each screen edge.",
  "description": "Uses a static local to remember the current walk direction. When the player reaches either screen edge, flip the direction and the sprite's facing. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["movement", "autopilot"]
}
*/
        {
            static signed char auto_dir = 1;
            if (auto_dir == 1) {
                if (px < (256 - PLAYER_W * 8)) {
                    px += walk_speed;
                } else {
                    auto_dir = -1;
                }
                plrdir = 0x00;
            } else {
                if (px >= walk_speed) {
                    px -= walk_speed;
                } else {
                    auto_dir = 1;
                }
                plrdir = 0x40;
            }
        }
