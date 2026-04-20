/*! SNIPPET
{
  "id": "fly-on-a",
  "title": "Hold A to fly",
  "summary": "While A is held, the player rises through the air. Release to fall.",
  "description": "Each frame A is held, nudge py upward by 4. Keeping jumping=1 with jmp_up=0 means the existing gravity code will pull the player back down as soon as you release A. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if (pad & 0x80) {
            if (py > 18) py -= 4;
            jumping = 1;
            jmp_up = 0;
        }
