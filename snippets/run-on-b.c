/*! SNIPPET
{
  "id": "run-on-b",
  "title": "Hold B to run fast",
  "summary": "Hold B to triple the walking speed.",
  "description": "Sets walk_speed = 3 whenever B is held, and 1 otherwise. Pair with 'Hold A to fly' or 'Dash on B' for fun combinations. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if (pad & 0x40) {
            walk_speed = 3;
        } else {
            walk_speed = 1;
        }
