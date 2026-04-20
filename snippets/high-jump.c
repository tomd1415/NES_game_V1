/*! SNIPPET
{
  "id": "high-jump",
  "title": "Super high jump",
  "summary": "Makes every jump go roughly twice as high.",
  "description": "When the player has just started jumping (jmp_up is at its fresh value and we are near the ground) boost jmp_up by 20 extra frames of ascent. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["movement"]
}
*/
        {
            static unsigned char boosted = 0;
            if (jumping && jmp_up > 15 && !boosted) {
                jmp_up += 20;
                boosted = 1;
            }
            if (!jumping) boosted = 0;
        }
