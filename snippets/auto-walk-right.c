/*! SNIPPET
{
  "id": "auto-walk-right",
  "title": "Autopilot: always walk right",
  "summary": "The player walks right on its own, no buttons needed.",
  "description": "Every frame, nudge px to the right by walk_speed. The bounds clamp stops the player slipping off the edge. Combine with 'Wrap around screen edges' or 'Bounce off walls' to keep them moving forever. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["movement", "autopilot"]
}
*/
        if (px < (256 - PLAYER_W * 8)) {
            px += walk_speed;
        }
        plrdir = 0x00;
