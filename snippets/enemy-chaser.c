/*! SNIPPET
{
  "id": "enemy-chaser",
  "title": "Enemies chase the player",
  "summary": "Sprites tagged as Enemy step one pixel towards the player every frame.",
  "description": "Runs every frame. For each scene sprite whose role is ROLE_ENEMY, it nudges ss_x / ss_y one pixel closer to (px, py). A simple chaser: fast at short range, slow to catch a sprinter. Put this inside the main loop. Combine with 'Enemies walk side-to-side' at your own risk — only use one AI snippet at a time per enemy.",
  "regions": ["magic_button"],
  "tags": ["enemy", "movement", "ai"]
}
*/
        for (i = 0; i < NUM_STATIC_SPRITES; i++) {
            if (ss_role[i] != ROLE_ENEMY) continue;
            if (ss_x[i] < px) ss_x[i] += 1;
            else if (ss_x[i] > px) ss_x[i] -= 1;
            if (ss_y[i] < py) ss_y[i] += 1;
            else if (ss_y[i] > py) ss_y[i] -= 1;
        }
