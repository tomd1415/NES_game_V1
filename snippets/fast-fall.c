/*! SNIPPET
{
  "id": "fast-fall",
  "title": "Fast-fall on DOWN",
  "summary": "Hold DOWN while in the air to slam back to the ground.",
  "description": "If the player is jumping and the DOWN button is held, skip ahead by 4 extra pixels. This does not break landing — the regular gravity code still snaps py back to ground_y once it is reached. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if (jumping && (pad & 0x04)) {
            jmp_up = 0;
            if ((unsigned char)(py + 4) < ground_y) {
                py += 4;
            } else {
                py = ground_y;
                jumping = 0;
            }
        }
