# Native Linux parity tracker — 2026-07-13 (updated 2026-07-14)

This is the per-feature checklist for `native/`, the PySide6 Linux client.
It complements the web Studio tracker rather than inheriting its completion
marks: a web feature is not native parity until the native UI, project-document
boundary, and owning tests support it.

> **Build order lives elsewhere.** This file says *what*; the
> [build plan](2026-07-14-native-build-plan.md) says *in what order, and where we
> got to*. When they disagree, the build plan wins.

## Completed native foundations

- [x] Native shell, mode rail, project persistence, snapshots, direct ROM
      build/export.
- [x] WORLD backgrounds/layouts, tile/palette/behaviour painting,
      metatile promotion/library/stamping, and a basic entity list.
- [x] CHARS lifecycle, all role values, dimensions, cells, basic animation
      frames/assignments, and sprite/background tile pixels.
- [x] PALS storage and editing; SOUND song/SFX import and budget display.
- [x] RULES game style, Player 1/2, global physics, damage and pickups.

## Landed 2026-07-14 — see the build plan

- [x] **A real NES renderer** (`render/`): the true 64-colour palette, pinned to
      the web's by a contract test; a framebuffer honouring the universal backdrop
      and sprite transparency; `NesScreen`. WORLD now shows the pupil's actual
      tiles, palettes and sprites, and flags 2×2 attribute conflicts on-canvas.
- [x] **The game plays in the Studio** — an embedded, MIT-licensed NES core
      (`nes_core/`, tetanes-core) with audio and two-player input, in the CRT
      stage. FCEUX is demoted to an optional "Open in FCEUX".
- [x] **Undo/redo in every mode** (40 deep), grouping a drag into one step and
      surviving a background switch. It was previously WORLD-only.
- [x] **Project catalog** — switch/rename/duplicate/delete, and all **seven**
      starters (six of which shipped on disk unreachable).
- [x] Editors no longer render inside the CRT bezel.

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

- [x] TILES: visual 256-tile library, usage/state indicators, background names,
      copy/paste, keyboard navigation and reference-safe swaps.
- [~] CHARS: flip/priority/empty cell attributes, animation rename/duplicate,
      frame ordering, preview and role filtering are complete. Thumbnails now
      render real sprite art. **A pixel-drawing canvas remains** — you still jump
      to TILES to draw, and the web's shared-tile duplicate guard is absent.
- [~] WORLD: the canvas now renders real tiles/palettes/sprites and flags 2×2
      attribute conflicts. Remaining: named/custom tile types, zoom, hover
      coordinate readout, right-click eyedropper, fullscreen preview, and a richer
      metatile picker/stamping workflow.
- [~] PALS: the master picker, live swatches and recent colours are complete, and
      the palette is now the **real** NES palette (it was previously invented with
      an HSV formula). Remaining: used-by information, and locking slot 0.

### 3. Finish app workflows

- [x] Snapshot before Build; **project catalog UI** (switch/rename/duplicate/
      delete + all seven starters) — `File → My Games`, `Ctrl+M`.
- [x] **Play in the Studio** with audio and two-player input (embedded NES core).
- [x] **Undo/redo across every mode**, 40 deep.
- [ ] Asset-format imports/exports and partial background/sprite import.
- [~] CODE: a failed build now shows the compiler log in a dialog. Remaining:
      a build-log pane, line numbers, snippets, symbols, and a way back to the
      generated source once `customMainC` is set.
- [ ] Time Machine UI over the snapshots that already exist.
- [ ] CHR/OAM budget meters and validator output ("Fix in \<Mode\> →").
- [ ] Expertise levels (Beginner/Maker/Advanced) and the STYLE mode.
- [ ] Accessibility preferences, help and feedback surfaces.
- [~] Native gallery/account/cloud-save — **deliberately deferred**: server-coupled
      product decisions, not native UI gaps.

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
