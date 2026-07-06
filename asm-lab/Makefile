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

# Split SRC into C and ASM sources. Objects go in a PER-ROM subdir so different
# functions never share ref.o/test.o/asm.o names (that cross-contaminated ROMs
# when run-all built several in a row).
OBJDIR = $(BUILD)/$(ROM)
C_SRC  = $(filter %.c,$(SRC))
S_SRC  = $(filter %.s,$(SRC))
C_OBJ  = $(patsubst %.c,$(OBJDIR)/%.o,$(notdir $(C_SRC)))
S_OBJ  = $(patsubst %.s,$(OBJDIR)/%.o,$(notdir $(S_SRC)))
OBJ    = $(C_OBJ) $(S_OBJ)

VPATH  = src:$(dir $(SRC))

.PHONY: rom clean
rom: $(BUILD)/$(ROM).nes

$(OBJDIR):
	mkdir -p $(OBJDIR)

$(OBJDIR)/%.o: %.c | $(OBJDIR)
	$(CC) -t $(TARGET) $(CFLAGS) -o $(OBJDIR)/$*.s $<
	$(AS) -t $(TARGET) -o $@ $(OBJDIR)/$*.s

$(OBJDIR)/%.o: %.s | $(OBJDIR)
	$(AS) -t $(TARGET) -o $@ $<

$(BUILD)/$(ROM).nes: $(OBJ)
	$(LD) -C $(CONFIG) -m $(BUILD)/$(ROM).map -o $@ $(OBJ) $(NESLIB)

clean:
	rm -rf $(BUILD)
