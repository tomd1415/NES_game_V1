/*! SNIPPET
{
  "id": "freeze-on-start",
  "title": "Freeze gravity on START",
  "summary": "Hold START to pause all up/down motion — walk on air.",
  "description": "While START is held, cancel the falling/rising by clearing the jump state so gravity stops. Handy for inspecting levels or just hovering. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if (pad & 0x10) {
            jumping = 0;
            jmp_up = 0;
        }
