/*! SNIPPET
{
  "id": "enemy-chaser",
  "title": "Enemies chase the player",
  "summary": "Sprites tagged as Enemy step one pixel towards the player every frame.",
  "description": "Runs every frame. For each scene sprite whose role is ROLE_ENEMY, it nudges ss_x / ss_y one pixel closer to (px, py). A simple chaser: fast at short range, slow to catch a sprinter. Put this inside the main loop. Combine with 'Enemies walk side-to-side' at your own risk — only use one AI snippet at a time per enemy. Single-screen only — scene sprites live in screen-1 (0-255) space; in a scrolling project the enemy cannot follow the player past x=255.",
  "regions": ["magic_button"],
  "tags": ["enemy", "movement", "ai"]
}
*/
        {
            unsigned char tx = (px > 255u) ? 255u : (unsigned char)px;
            unsigned char ty = (py > 255u) ? 255u : (unsigned char)py;
            for (i = 0; i < NUM_STATIC_SPRITES; i++) {
                if (ss_role[i] != ROLE_ENEMY) continue;
                if (ss_x[i] < tx) ss_x[i] += 1;
                else if (ss_x[i] > tx) ss_x[i] -= 1;
                if (ss_y[i] < ty) ss_y[i] += 1;
                else if (ss_y[i] > ty) ss_y[i] -= 1;
            }
        }
