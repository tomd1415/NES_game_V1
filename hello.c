#include <nes.h>

// specific NES hardware addresses are defined in nes.h, 
// but we interact with the PPU (Picture Processing Unit) to change colors.

void main(void) {
    // 1. Wait for the screen to refresh (VSync) to avoid graphical glitches
    waitvsync();

    // 2. Turn OFF rendering so we can mess with the video memory (PPU) safely
    // PPU_MASK ($2001) controls sprite/background visibility. 0 = all off.
    PPU.mask = 0; 

    // 3. Set the PPU address to the Palette RAM ($3F00)
    // We have to write the address one byte at a time (High byte, then Low byte)
    PPU.vram.address = 0x3F; 
    PPU.vram.address = 0x00;

    // 4. Write the color "Blue" (Hex $11) to the first palette slot.
    // This sets the "Universal Background Color" we discussed earlier.
    PPU.vram.data = 0x27; 

    // 5. Turn rendering back ON
    // Enable Backgrounds (bit 3) and Sprites (bit 4) -> Hex 0x1E is standard
    PPU.mask = 0x1E; 

    // 6. Infinite Loop (The game logic would go here)
    while(1) {
        // Do nothing, just keep the NES running
    }
}
