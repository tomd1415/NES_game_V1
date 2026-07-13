# Native Linux parity tracker — 2026-07-13

This is the implementation tracker for `native/`, the PySide6 Linux client.
It complements the web Studio tracker rather than inheriting its completion
marks: a web feature is not native parity until the native UI, project-document
boundary, and owning tests support it.

## Completed native foundations

- [x] Native shell, mode rail, project persistence, snapshots, direct ROM
      build/export, and capability-gated FCEUX launch.
- [x] WORLD backgrounds/layouts, tile/palette/behaviour painting, undo/redo,
      metatile promotion/library/stamping, and a basic entity list.
- [x] CHARS lifecycle, all role values, dimensions, cells, basic animation
      frames/assignments, and sprite/background tile pixels.
- [x] PALS storage and editing; SOUND song/SFX import and budget display.
- [x] RULES game style, Player 1/2, global physics, damage and pickups.

## Next native work — ordered

### 1. Complete the unblocked Builder modules

- [x] Spawn effect — enablement, visual sprite selector and lifetime controls.
- [x] HUD (hearts) enablement and HUD-sprite guidance.
- [~] Doors — shared spawn/target controls are complete; engine-v2 per-door
      entries still need a WORLD door-cell editor.
- [x] Dialogue and win-condition controls.
- [ ] Remaining game-style modules/power-ups, with an owning test per module.
- [x] WORLD entity inspector and direct canvas selection/drag placement.

### 2. Make the core editors complete enough to replace their web pages

- [~] TILES: visual 256-tile library, usage/state indicators, background names,
      copy/paste and reference-safe swaps are complete; keyboard navigation
      remains.
- [ ] CHARS: pixel drawing tools, flip/priority/empty cell attributes,
      thumbnails/filtering, complete animation management and preview.
- [ ] WORLD: named/custom tile types, clear/zoom/fullscreen preview and a
      richer metatile picker/stamping workflow.
- [~] PALS: live NES colour swatches are complete; picker, used-by information,
      recent colours and locked-slot guidance remain.

### 3. Finish app workflows

- [~] Snapshot before Build is complete; project catalog UI
      (switch/rename/duplicate/delete/templates) remains.
- [ ] Asset-format imports/exports and partial background/sprite import.
- [ ] CODE guided editing, Advanced C/ASM, lessons/snippets/symbols/build log.
- [ ] Native gallery/account/cloud-save, accessibility preferences, help and
      feedback surfaces.

### Engine/schema work — separately reviewed

- [ ] Attribute palettes per 2x2 quadrant as the only stored truth (DM-1).
- [ ] True 8x16 sprites (DM-3) and runtime sprite-reaction dispatch.
- [ ] Larger worlds, CHR banking, and offline compiler work.

## Completion rule

Before switching any legacy page to native, walk every corresponding row in
`docs/design/feature-parity.md`, record an explicit deliberate deferral or
drop where appropriate, and add a native owning test. The native completion
state must not be inferred from `2026-07-05-studio-redesign.md`, which tracks
the browser Studio.
