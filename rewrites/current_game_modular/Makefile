CC      = cc65
AS      = ca65
LD      = ld65
TARGET  = nes
CONFIG  = ../../cfg/nes.cfg
NESLIB  = /usr/share/cc65/lib/nes.lib

ROM     = modular-game.nes
BUILD   = build

C_SRC   = src/main.c
ASM_SRC = src/graphics.s

C_OBJ   = $(patsubst src/%.c,$(BUILD)/%.o,$(C_SRC))
ASM_OBJ = $(patsubst src/%.s,$(BUILD)/%.o,$(ASM_SRC))
OBJECTS = $(C_OBJ) $(ASM_OBJ)

.PHONY: all clean

all: $(ROM)

$(BUILD):
	mkdir -p $(BUILD)

$(ROM): $(OBJECTS)
	$(LD) -C $(CONFIG) -o $@ $(OBJECTS) $(NESLIB)

$(BUILD)/%.o: src/%.c | $(BUILD)
	$(CC) -t $(TARGET) -o $(BUILD)/$*.s $<
	$(AS) -t $(TARGET) -o $@ $(BUILD)/$*.s
	rm -f $(BUILD)/$*.s

$(BUILD)/%.o: src/%.s | $(BUILD)
	$(AS) -t $(TARGET) -o $@ $<

clean:
	rm -rf $(BUILD) $(ROM)
