/*! SNIPPET
{
  "id": "stand-on-obstacles",
  "title": "Stand on obstacles (platforms)",
  "summary": "Turn scene sprites into platforms the player can land on and jump off.",
  "description": "If the player is falling and their feet cross the top of a scene sprite, snap py to just above it and treat that Y as the new ground. Walk off the edge and ground_y reverts to the original floor. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["collision", "world"]
}
*/
        {
            static unsigned char original_ground = 0;
            if (original_ground == 0) original_ground = ground_y;
            ground_y = original_ground;
            for (i = 0; i < NUM_STATIC_SPRITES; i++) {
                sx = ss_x[i];
                sy = ss_y[i];
                sw = ss_w[i] << 3;
                if (px + (PLAYER_W << 3) > sx && px < sx + sw
                    && sy < ground_y
                    && py + (PLAYER_H << 3) >= sy
                    && py + (PLAYER_H << 3) <= sy + 6) {
                    py = sy - (PLAYER_H << 3);
                    ground_y = py;
                    jumping = 0;
                    jmp_up = 0;
                }
            }
            if (!jumping && py < ground_y) {
                jumping = 1;
                jmp_up = 0;
            }
        }
