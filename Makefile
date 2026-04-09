# NES Game - Zelda 2 inspired
# Toolchain: cc65 v2.18

CC      = cc65
AS      = ca65
LD      = ld65
TARGET  = nes
CONFIG  = nes.cfg
NESLIB  = /usr/share/cc65/lib/nes.lib

ROM     = game.nes

# Source files
C_SRC   = main.c
ASM_SRC = graphics.s

# Intermediate files
C_ASM   = $(C_SRC:.c=.s)
C_OBJ   = $(C_SRC:.c=.o)
ASM_OBJ = $(ASM_SRC:.s=.o)
OBJECTS = $(C_OBJ) $(ASM_OBJ)

.PHONY: all clean run

all: $(ROM)

$(ROM): $(OBJECTS)
	$(LD) -C $(CONFIG) -o $@ $(OBJECTS) $(NESLIB)

# Compile C to assembly, then assemble
%.o: %.c
	$(CC) -t $(TARGET) -o $*.s $<
	$(AS) -t $(TARGET) -o $@ $*.s
	rm -f $*.s

# Assemble .s files directly
%.o: %.s
	$(AS) -t $(TARGET) -o $@ $<

run: $(ROM)
	~/projects/nesgame/mesen/Mesen $(ROM)

clean:
	rm -f $(OBJECTS) $(ROM)
