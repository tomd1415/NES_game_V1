/*! SNIPPET
{
  "id": "double-jump",
  "title": "Double jump on A",
  "summary": "Once in the air, pressing A gives one more bounce before landing.",
  "description": "Uses a static local ('air_jumps_left') to remember whether you have used your second jump this airtime. It resets to 1 every time you touch the ground. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        {
            static unsigned char air_jumps_left = 1;
            static unsigned char prev_a = 0;
            if (!jumping) air_jumps_left = 1;
            if ((pad & 0x80) && !prev_a && jumping && air_jumps_left) {
                jmp_up = 14;
                air_jumps_left = 0;
            }
            prev_a = (pad & 0x80) ? 1 : 0;
        }
