/*! SNIPPET
{
  "id": "follower-npc",
  "title": "NPC follows the player",
  "summary": "An NPC-tagged sprite trails the player a few frames behind.",
  "description": "Every frame, records the player's (px, py) into a ring buffer and places the first ROLE_NPC scene sprite at the position the player was at FOLLOW_LAG frames ago. Result: a companion that tracks your movement with a small delay. Tag the sprite you want to follow as 'NPC' in the Sprites editor. Change FOLLOW_LAG for a closer or more distant follower. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["npc", "follower", "movement", "ai"]
}
*/
        {
            #define FOLLOW_LAG 24
            static unsigned char trail_x[32];
            static unsigned char trail_y[32];
            static unsigned char trail_head = 0;
            static unsigned char trail_primed = 0;
            unsigned char tail;
            trail_x[trail_head] = px;
            trail_y[trail_head] = py;
            trail_head = (trail_head + 1) & 31;
            if (!trail_primed && trail_head == 0) trail_primed = 1;
            if (trail_primed) {
                tail = (trail_head + (32 - FOLLOW_LAG)) & 31;
                for (i = 0; i < NUM_STATIC_SPRITES; i++) {
                    if (ss_role[i] != ROLE_NPC) continue;
                    ss_x[i] = trail_x[tail];
                    ss_y[i] = trail_y[tail];
                    break;
                }
            }
        }
