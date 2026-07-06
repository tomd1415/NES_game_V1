# Modular Step Rewrites

These are isolated, buildable rewrites of the tutorial step games. The original
`steps/` directories were not edited.

Each copied step keeps its own assets, `cfg/nes.cfg`, `src/graphics.s`, and
`Makefile`, but `src/main.c` has been reorganized into compact helpers:

- setup: PPU on/off, palette writes, background loading
- input: controller read and edge presses
- player: movement, jump, gravity, animation
- actors: enemy patrols, NPC drawing, item collection
- dialogue: text/box nametable writes
- frame flow: `game_update()` and `game_draw()`

Build any step from its rewrite directory with `make`.
