/*! SNIPPET
{
  "id": "wrap-vertical",
  "title": "Wrap top and bottom",
  "summary": "Fly off the top of the screen and reappear at the bottom (and vice versa).",
  "description": "Catches the player when py leaves the playable region and flips them to the opposite edge — like a space-asteroids screen. Works well with 'Hold A to fly'. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["movement"]
}
*/
        if (py < 16) {
            py = 200;
            ground_y = 200;
            jumping = 0;
        }
        if (py > 210 && py < 240) {
            py = 16;
            jumping = 1;
            jmp_up = 0;
        }
