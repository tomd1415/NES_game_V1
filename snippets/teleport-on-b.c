/*! SNIPPET
{
  "id": "teleport-on-b",
  "title": "Teleport on B button",
  "summary": "When B is pressed, jump the player to the top-left corner.",
  "description": "Add a secret 'emergency escape'. Put this inside the main loop so it runs every frame — it only fires on the frame B is first pressed.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if ((pad & 0x40) && !(prev_pad & 0x40)) {
            px = 16;
            py = 24;
            ground_y = 24;
        }
