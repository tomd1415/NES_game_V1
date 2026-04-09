#include <nes.h>

// --- DIRECT HARDWARE DEFINITIONS ---
// We define these pointers to point exactly to the NES hardware addresses.
// This bypasses any header file naming mismatches.

#define PPU_CTRL      *((unsigned char*)0x2000)
#define PPU_MASK      *((unsigned char*)0x2001)
#define PPU_STATUS    *((unsigned char*)0x2002)
#define OAM_ADDR      *((unsigned char*)0x2003) // Object Attribute Memory (Sprites) Address
#define OAM_DATA      *((unsigned char*)0x2004) // Object Attribute Memory (Sprites) Data
#define PPU_SCROLL    *((unsigned char*)0x2005)
#define PPU_ADDR      *((unsigned char*)0x2006) // VRAM Address
#define PPU_DATA      *((unsigned char*)0x2007) // VRAM Data

#define JOYPAD1       *((unsigned char*)0x4016)


// --- VARIABLES ---
unsigned char x = 120;
unsigned char y = 120;
unsigned char pad;
unsigned char jump = 1;
unsigned char jmptime = 0;
unsigned char plrdir = 0x00;
unsigned char plrxmod = 0;
unsigned char moved = 0;
unsigned char moveWait = 0;

// --- FUNCTIONS ---
    unsigned char read_controller() {
    unsigned char result = 0;
    unsigned char i;
    
    JOYPAD1 = 1;
    JOYPAD1 = 0;

    for (i = 0; i < 8; i++) {
        result = result << 1;
        if (JOYPAD1 & 1)
            result = result | 1;
    }
    return result;
}

void main(void) {
    // 1. Wait for startup stability
    waitvsync();
    
    // 2. Turn off rendering
    PPU_MASK = 0; 

    // 3. Set Background Color (Palette)
    PPU_ADDR = 0x3F; // High Byte of Palette RAM address
    PPU_ADDR = 0x00; // Low Byte
    PPU_DATA = 0x12; // Blue (Universal Background)

    // 4. Set Sprite Palette
    PPU_ADDR = 0x3F;
    PPU_ADDR = 0x11; // Address 0x3F11 (Sprite Color 1)
    PPU_DATA = 0x30; // eye
    PPU_DATA = 0x27; // outline
    PPU_DATA = 0x17; // main

    // 5. Turn Screen On
    // Enable Sprites (Bit 4) and Background (Bit 3) -> 0001 1000 = 0x18 + 0x06...
    // Let's use 0x1E (Show sprites, Show background, Show in left column)
    PPU_MASK = 0x1E; 
    // 6. Game Loop
    while(1) {
        // A. Logic
        pad = read_controller();
        // read controller input here
        if (pad & 0x08) {
            if (jump == 1 && jmptime <= 0){
               y = y-3; // Up
               jmptime = 15;
            }
        }
        if (pad & 0x04)  // Down
        {
           if (y < 150)
           {
             y++;
           }
        }
        if (pad & 0x02) {
           x--; // Left
           plrdir = 0x40;
           plrxmod = 1;
           moveWait ++;
           if (moveWait >= 7) {
              moved = moved + 1;
              moveWait = 0;
           }
        }
        if (pad & 0x01) {
          x++; // Right
          plrdir = 0x00;
          plrxmod = 0;
          moveWait ++;
          if (moveWait >= 7) {
              moved = moved + 1;
              moveWait = 0;
          }
        }

        // B. Wait for Draw Phase
        waitvsync();

        // C. Draw Sprite
        // We reset the OAM address to 0 every frame to update the first sprite
        OAM_ADDR = 0x00; 

        OAM_DATA = y;    // Y Position
        OAM_DATA = 0x01;
        /*
        if (moved % 4 == 0)  {
            OAM_DATA = 0x01; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x09; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x0B; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x01; // Tile Index (Make sure you have a tile in slot 1!)
        }
        */
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x+8;    // X Position
        } else {
            OAM_DATA = x;
        }
        OAM_DATA = y;    // Y Position
        OAM_DATA = 0x02;
        /*
        if (moved % 4 == 0)  {
            OAM_DATA = 0x02; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x0a; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x0c; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x02; // Tile Index (Make sure you have a tile in slot 1!)
        }
        */
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x;    // X Position
        } else {
            OAM_DATA = x+8;
        }
    //
        OAM_DATA = y+8;    // Y Position
        if (moved % 4 == 0)  {
            OAM_DATA = 0x11; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x19; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x1b; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x11; // Tile Index (Make sure you have a tile in slot 1!)
        }

        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x+8;    // X Position
        } else {
            OAM_DATA = x;
        }
    //
        OAM_DATA = y+8;    // Y Position
        if (moved % 4 == 0)  {
            OAM_DATA = 0x12; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x1a; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x1c; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x12; // Tile Index (Make sure you have a tile in slot 1!)
        }
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x;    // X Position
        } else {
            OAM_DATA = x+8;
        }
    //
/*
        OAM_DATA = y+8;    // Y Position
        OAM_DATA = 0x18; // Tile Index (Make sure you have a tile in slot 1!)
        OAM_DATA = 0x00; // Attributes (Color Palette 0, No flipping)
        OAM_DATA = x+8;    // X Position
    //
        OAM_DATA = y+8;    // Y Position
        OAM_DATA = 0x19; // Tile Index (Make sure you have a tile in slot 1!)
        OAM_DATA = 0x00; // Attributes (Color Palette 0, No flipping)
        OAM_DATA = x+16;    // X Position
*/ 
        OAM_DATA = y+16;    // Y Position
        if (moved % 4 == 0)  {
            OAM_DATA = 0x21; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x29; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x2b; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x21; // Tile Index (Make sure you have a tile in slot 1!)
        }
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x+8;    // X Position
        } else {
            OAM_DATA = x;
        }
    //
        OAM_DATA = y+16;    // Y Position
        if (moved % 4 == 0)  {
            OAM_DATA = 0x22; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x2a; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x2c; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x22; // Tile Index (Make sure you have a tile in slot 1!)
        }
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x;    // X Position
        } else {
            OAM_DATA = x+8;
        }
    //
/*
        OAM_DATA = y+16;    // Y Position
        OAM_DATA = 0x28; // Tile Index (Make sure you have a tile in slot 1!)
        OAM_DATA = 0x00; // Attributes (Color Palette 0, No flipping)
        OAM_DATA = x+8;    // X Position
    //
        OAM_DATA = y+16;    // Y Position
        OAM_DATA = 0x29; // Tile Index (Make sure you have a tile in slot 1!)
        OAM_DATA = 0x00; // Attributes (Color Palette 0, No flipping)
        OAM_DATA = x+16;    // X Position
*/ 
        OAM_DATA = y+24;    // Y Position
        if (moved % 4 == 0)  {
            OAM_DATA = 0x31; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x39; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x3b; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x31; // Tile Index (Make sure you have a tile in slot 1!)
        }
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x+8;    // X Position
        } else {
            OAM_DATA = x;
        }
    //
        OAM_DATA = y+24;    // Y Position
        if (moved % 4 == 0)  {
            OAM_DATA = 0x32; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 1) {
            OAM_DATA = 0x3a; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 3) {
            OAM_DATA = 0x3c; // Tile Index (Make sure you have a tile in slot 1!)
        } else if (moved % 4 == 2) {
            OAM_DATA = 0x32; // Tile Index (Make sure you have a tile in slot 1!)
        }
        OAM_DATA = 0x00 | plrdir; // Attributes (Color Palette 0, No flipping)
        if (plrxmod == 1) {
            OAM_DATA = x;    // X Position
        } else {
            OAM_DATA = x+8;
        }
    //
    /*
        OAM_DATA = y+24;    // Y Position
        OAM_DATA = 0x38; // Tile Index (Make sure you have a tile in slot 1!)
        OAM_DATA = 0x00; // Attributes (Color Palette 0, No flipping)
        OAM_DATA = x+8;    // X Position
    //
        OAM_DATA = y+24;    // Y Position
        OAM_DATA = 0x39; // Tile Index (Make sure you have a tile in slot 1!)
        OAM_DATA = 0x00; // Attributes (Color Palette 0, No flipping)
        OAM_DATA = x+16;    // X Position
     */
        if (y < 150) {
            //y++;
            jump = 0;
            if (jmptime > 0) {
               jmptime--;
               y = y - 3;
            }else{
               y = y + 3;
            }
        } else {
            jump = 1;
        }
    }
  // --- VECTORS ---
// The NES processor looks at address $FFFA to know what to do.
// We must point these to our main function.

}


const void *vectors[] = {
    (void *) 0,    // NMI Vector (unused for now)
    (void *) main, // Reset Vector (Start the game here!)
    (void *) 0     // IRQ Vector (unused)
  };

