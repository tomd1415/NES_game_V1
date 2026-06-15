/*! SNIPPET
{
  "id": "stand-on-obstacles",
  "title": "Stand on obstacles (platforms)",
  "summary": "Turn scene sprites into platforms the player can land on and jump off.",
  "description": "If the player is falling and their feet cross the top of a scene sprite, snap py to just above it and stop falling, so the sprite acts like a platform. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["collision", "world"]
}
*/
        if (jumping && !jmp_up) {
            for (i = 0; i < NUM_STATIC_SPRITES; i++) {
                sx = ss_x[i];
                sy = ss_y[i];
                sw = ss_w[i] << 3;
                if (px + (PLAYER_W << 3) > sx && px < sx + sw
                    && py + (PLAYER_H << 3) >= sy
                    && py + (PLAYER_H << 3) <= sy + 6) {
                    py = sy - (PLAYER_H << 3);
                    jumping = 0;
                    jmp_up = 0;
                    break;
                }
            }
        }
