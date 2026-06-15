/*! SNIPPET
{
  "id": "fast-fall",
  "title": "Fast-fall on DOWN",
  "summary": "Hold DOWN while in the air to slam back to the ground.",
  "description": "If the player is jumping and the DOWN button is held, drop 4 extra pixels. This does not break landing — the engine's foot-collision still snaps py onto the tile below once it is reached. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if (jumping && (pad & 0x04)) {
            jmp_up = 0;
            py += 4;
        }
