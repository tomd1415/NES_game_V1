# ASM-Converted Step Games

This directory contains assembly equivalents of the modular step rewrites in
`../step_game_modular`.

For each step, `src/main.c` was converted to ca65-compatible assembly as
`src/main.s` with the same cc65 target used by the project:

```sh
cc65 -t nes -o src/main.s path/to/modular/src/main.c
```

The copied Makefiles in this directory build `src/main.s` directly, alongside
the existing `src/graphics.s`. The original project files were not edited.

This is the safe baseline conversion: every C helper is represented by its own
assembly `.proc` in `src/main.s`, including setup, input, movement, gravity,
enemy, item, NPC, dialogue, draw, update, and `main` routines. Because the ASM
comes from the same compiler pass used by the C build, it is at least as
efficient as the modular C build and is suitable as a verified starting point
for later hand-optimized replacements.

Run the accuracy test from the repo root:

```sh
sh rewrites/step_game_asm_generated/test_accuracy.sh
```

The test force-rebuilds each modular C ROM and each ASM ROM, then compares the
ROM bytes. A match means the ASM conversion is byte-for-byte identical to the C
rewrite for that step.
