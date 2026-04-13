/*! SNIPPET
{
  "id": "rainbow-background",
  "title": "Rainbow background",
  "summary": "Cycle the background colour every frame for a seizure-friendly disco effect.",
  "description": "Writes a new background colour to PPU $3F00 each frame. Uses anim_tick as a free-running counter. Put this inside the main loop, near the end after waitvsync so the write lands during vblank.",
  "regions": ["magic_button"],
  "tags": ["palette", "effect"]
}
*/
        PPU_ADDR = 0x3F;
        PPU_ADDR = 0x00;
        PPU_DATA = anim_tick + (anim_frame << 2);
