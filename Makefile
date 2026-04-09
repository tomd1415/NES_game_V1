# =============================================================================
# NES Game - Zelda 2 Inspired
# =============================================================================
# Toolchain: cc65 v2.18
#
# Directory layout:
#   src/       - C and assembly source code
#   assets/    - sprites, backgrounds, palettes (CHR, NAM, PAL files)
#   cfg/       - linker configuration
#   build/     - compiled object files (created automatically)
#
# Usage:
#   make          - Build the ROM
#   make run      - Build and run in Mesen emulator
#   make clean    - Delete build files and ROM

CC      = cc65
AS      = ca65
LD      = ld65
TARGET  = nes
CONFIG  = cfg/nes.cfg

# We use none.lib (cc65 runtime without platform startup) because
# we provide our own startup and NMI handler in src/reset.s
RTLIB   = /usr/share/cc65/lib/none.lib

# Output ROM
ROM     = game.nes

# Build directory for intermediate files
BUILD   = build

# Source files
C_SRC   = src/main.c
ASM_SRC = src/reset.s src/graphics.s

# Object files go in build/
C_OBJ   = $(patsubst src/%.c,$(BUILD)/%.o,$(C_SRC))
ASM_OBJ = $(patsubst src/%.s,$(BUILD)/%.o,$(ASM_SRC))
OBJECTS = $(C_OBJ) $(ASM_OBJ)

.PHONY: all clean run

all: $(ROM)

# Create build directory if needed
$(BUILD):
	mkdir -p $(BUILD)

$(ROM): $(OBJECTS)
	$(LD) -C $(CONFIG) -o $@ $(OBJECTS) $(RTLIB)

# Compile C to assembly, then assemble
$(BUILD)/%.o: src/%.c | $(BUILD)
	$(CC) -t $(TARGET) -o $(BUILD)/$*.s $<
	$(AS) -t $(TARGET) -o $@ $(BUILD)/$*.s
	rm -f $(BUILD)/$*.s

# Assemble .s files directly
$(BUILD)/%.o: src/%.s | $(BUILD)
	$(AS) -t $(TARGET) -o $@ $<

# Build and run in Mesen emulator
run: $(ROM)
	~/projects/nesgame/mesen/Mesen $(ROM)

clean:
	rm -rf $(BUILD) $(ROM)
