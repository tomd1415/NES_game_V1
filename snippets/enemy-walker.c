/*! SNIPPET
{
  "id": "enemy-walker",
  "title": "Enemies walk side-to-side",
  "summary": "Sprites tagged as Enemy pace left and right, bouncing off the screen edges.",
  "description": "Runs every frame. For each scene sprite whose role is ROLE_ENEMY, it nudges ss_x along by one pixel and flips direction when the enemy hits the left/right edge. Uses two per-sprite static arrays (enemy_dir, enemy_init) that are set up on the first frame. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["enemy", "movement", "ai"]
}
*/
        {
            // Track direction for up to 16 enemies; extras stay still.
            static signed char enemy_dir[16] = {
                1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
            };
            unsigned char ew;
            for (i = 0; i < NUM_STATIC_SPRITES && i < 16; i++) {
                if (ss_role[i] != ROLE_ENEMY) continue;
                ew = ss_w[i] << 3;
                if (enemy_dir[i] > 0) {
                    if (ss_x[i] + ew < 255) ss_x[i] += 1;
                    else enemy_dir[i] = -1;
                } else {
                    if (ss_x[i] > 0) ss_x[i] -= 1;
                    else enemy_dir[i] = 1;
                }
            }
        }
