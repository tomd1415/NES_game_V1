/*! SNIPPET
{
  "id": "wrap-screen",
  "title": "Wrap around screen edges",
  "summary": "Walk off the right edge and reappear on the left.",
  "description": "Catches the player when they reach either side of the screen and teleports them to the other side, like Pac-Man's side-tunnels. Put this in the main loop.",
  "regions": ["magic_button"],
  "tags": ["movement"]
}
*/
        if (px >= 240) {
            px = 0;
        }
        if (px < 4) {
            px = 232;
        }
