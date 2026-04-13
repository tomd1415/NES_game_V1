/*! SNIPPET
{
  "id": "sprint-on-a",
  "title": "Sprint while A held",
  "summary": "Hold A to double your walk speed.",
  "description": "Changes walk_speed every frame based on whether A is being held. Put this inside the main loop. Remember: walk_speed is also used to check the left-edge boundary, so keep it at least 1.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if (pad & 0x80) {
            walk_speed = 2;
        } else {
            walk_speed = 1;
        }
