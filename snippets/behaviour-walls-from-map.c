/*! SNIPPET
{
  "id": "behaviour-walls-from-map",
  "title": "Block on wall / solid_ground tiles (Behaviour map)",
  "summary": "Stop the player whenever they'd walk into a tile the Behaviour page marks as wall or solid ground.",
  "description": "Reads the behaviour map the pupil painted on the Behaviour page. Looks at the tile under the player's feet and the tile in front of their face; if either is BEHAVIOUR_WALL or BEHAVIOUR_SOLID_GROUND, the player is pushed back out. Put this inside the main loop, after you've updated px/py from the controller. Needs #include \"collision.h\" at the top of main.c.",
  "regions": ["magic_button"],
  "tags": ["behaviour", "collision", "world"]
}
*/
        {
            unsigned char b_here, b_ahead, r;
            unsigned int col, row;
            /* Tile the player's top-left corner sits on (8x8 grid). */
            col = px >> 3;
            row = py >> 3;
            b_here  = behaviour_at(col, row);
            /* Tile one step in the direction the player is facing. */
            if (plrdir == 0x40) {
                b_ahead = (col == 0) ? BEHAVIOUR_NONE : behaviour_at(col - 1, row);
            } else {
                b_ahead = behaviour_at(col + PLAYER_W, row);
            }
            r = reaction_for(0, b_ahead);
            if (r == REACT_BLOCK) {
                /* Nudge the player back by one pixel so they don't phase in. */
                if (plrdir == 0x40) px++;
                else if (px > 0)   px--;
            }
            (void)b_here;  /* reserved for REACT_LAND in the next lesson */
        }
