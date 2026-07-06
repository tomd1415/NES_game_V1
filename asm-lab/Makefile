# asm-lab build — mirrors steps/Step_Playground's toolchain (cc65 V2.18) but
# stays completely separate from the shipped engine. Builds a small test ROM
# per target from a C driver + (optionally) a hand-written .s candidate.
#
#   make ROM=smoke   SRC="src/smoke.c"                       -> build/smoke.nes
#   make ROM=w2sx    SRC="functions/world_to_screen_x/test.c functions/world_to_screen_x/asm.s"
#
# The Node harness (harness/run.mjs) boots build/$(ROM).nes in jsnes.

CC     = cc65
AS     = ca65
LD     = ld65
TARGET = nes
CONFIG = cfg/nes.cfg
NESLIB = /usr/share/cc65/lib/nes.lib
CFLAGS = -Os

ROM   ?= smoke
SRC   ?= src/smoke.c
BUILD  = build

# Split SRC into C and ASM sources; compile each to build/<base>.o
C_SRC  = $(filter %.c,$(SRC))
S_SRC  = $(filter %.s,$(SRC))
C_OBJ  = $(patsubst %.c,$(BUILD)/%.o,$(notdir $(C_SRC)))
S_OBJ  = $(patsubst %.s,$(BUILD)/%.o,$(notdir $(S_SRC)))
OBJ    = $(C_OBJ) $(S_OBJ)

VPATH  = src:$(dir $(SRC))

.PHONY: rom clean
rom: $(BUILD)/$(ROM).nes

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/%.o: %.c | $(BUILD)
	$(CC) -t $(TARGET) $(CFLAGS) -o $(BUILD)/$*.s $<
	$(AS) -t $(TARGET) -o $@ $(BUILD)/$*.s

$(BUILD)/%.o: %.s | $(BUILD)
	$(AS) -t $(TARGET) -o $@ $<

$(BUILD)/$(ROM).nes: $(OBJ)
	$(LD) -C $(CONFIG) -m $(BUILD)/$(ROM).map -o $@ $(OBJ) $(NESLIB)

clean:
	rm -rf $(BUILD)
