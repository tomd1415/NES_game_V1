/*! SNIPPET
{
  "id": "rainbow-player",
  "title": "Rainbow player",
  "summary": "Cycle the player's main colour every frame.",
  "description": "Rewrites sprite palette 0, slot 1 (that's PPU $3F11) every frame so the player's primary colour strobes through the palette. Uses anim_tick as a free-running counter. Put this in the main loop — near the end works best so the write lands during vblank.",
  "regions": ["magic_button"],
  "tags": ["palette", "effect"]
}
*/
        PPU_ADDR = 0x3F;
        PPU_ADDR = 0x11;
        PPU_DATA = anim_tick + anim_frame;
