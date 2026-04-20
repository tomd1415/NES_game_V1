/*! SNIPPET
{
  "id": "npc-dialogue",
  "title": "NPC dialogue on B button",
  "summary": "Stand next to an NPC and press B to show a line of text.",
  "description": "Finds the first scene sprite tagged ROLE_NPC. When the player is touching it and presses B, the dialogue string is drawn onto the background. Press B again to hide it. Edit the npc_msg bytes at the top of the block to change the message — each byte is a TILE INDEX in your CHR (open the Backgrounds page to see which tiles you have drawn as letters). Uses the draw_text() helper in main.c. Put this inside the main loop.",
  "regions": ["magic_button"],
  "tags": ["npc", "dialogue", "input"]
}
*/
        {
            // Tile indices from your CHR. Each byte is one 8x8 tile slot.
            // 0x00 ends the string. Draw letters on the Backgrounds page
            // first, note their hex tile numbers, then change these:
            static const unsigned char npc_msg[] = {
                0x48, 0x49, 0x00
            };
            #define DIALOG_ROW 3
            #define DIALOG_COL 4
            #define DIALOG_W   20
            static unsigned char dlg_shown = 0;
            static unsigned char dlg_prev_b = 0;
            unsigned char b_now;
            unsigned char nx, ny, nw, nh;
            unsigned char near_npc = 0;
            for (i = 0; i < NUM_STATIC_SPRITES; i++) {
                if (ss_role[i] != ROLE_NPC) continue;
                nx = ss_x[i];
                ny = ss_y[i];
                nw = ss_w[i] << 3;
                nh = ss_h[i] << 3;
                if (px + (PLAYER_W << 3) > nx && px < nx + nw
                    && py + (PLAYER_H << 3) > ny && py < ny + nh) {
                    near_npc = 1;
                }
                break;
            }
            b_now = (pad & 0x40) ? 1 : 0;
            if (b_now && !dlg_prev_b && near_npc) {
                if (!dlg_shown) {
                    draw_text(DIALOG_ROW, DIALOG_COL, npc_msg);
                    dlg_shown = 1;
                } else {
                    clear_text_row(DIALOG_ROW, DIALOG_COL, DIALOG_W);
                    dlg_shown = 0;
                }
            }
            dlg_prev_b = b_now;
        }
