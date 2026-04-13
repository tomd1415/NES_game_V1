/*! SNIPPET
{
  "id": "auto-bounce",
  "title": "Auto-bounce",
  "summary": "Make the player bounce non-stop without pressing UP.",
  "description": "As soon as the player lands, fire another jump. Put this in the main loop. Combine with a big jump_height for a pogo-stick character.",
  "regions": ["magic_button"],
  "tags": ["movement"]
}
*/
        if (!jumping) {
            jumping = 1;
            jmp_up = 20;
        }
