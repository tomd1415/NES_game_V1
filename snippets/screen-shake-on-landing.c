/*! SNIPPET
{
  "id": "screen-shake-on-landing",
  "title": "Screen shake on landing",
  "summary": "Wobble the background for a few frames whenever the player hits the ground.",
  "description": "A static local remembers whether the player was airborne last frame and counts down a shake timer. When they land (airborne -> grounded) the timer is set to 8 frames; each shake frame writes a random-ish PPU scroll offset. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["effect"]
}
*/
        {
            static unsigned char was_jumping = 0;
            static unsigned char shake_frames = 0;
            if (was_jumping && !jumping) shake_frames = 8;
            was_jumping = jumping;
            if (shake_frames > 0) {
                PPU_SCROLL = (shake_frames & 1) ? 2 : 254;
                PPU_SCROLL = (shake_frames & 2) ? 2 : 254;
                shake_frames--;
            }
        }
