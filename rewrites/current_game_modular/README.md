# Current Game Modular Rewrite

This directory is a separate rewrite of the root `src/main.c` game. No existing
project files were changed.

The original program is a single C file with startup, input, movement, physics,
animation, and drawing all inside `main()`. This version keeps the same simple
NES game behavior, but breaks it into compact functions:

- `ppu_off`, `ppu_on`, `write_palette`, `init_graphics`: hardware setup.
- `read_controller`: controller strobe/read.
- `begin_jump`, `move_player`, `apply_gravity`: player motion.
- `step_walk_animation`, `animation_frame`: animation state.
- `draw_sprite`, `draw_player`: OAM sprite output.
- `init_player`, `game_update`, `game_draw`: frame-level game flow.

The rewrite is intentionally small, so each function has one job and can be
ported to assembly or tested in isolation more easily.

Build from this directory with:

```sh
make
```

It writes build output only inside this rewrite directory.
