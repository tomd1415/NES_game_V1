# Native-to-web gap audit — 2026-07-14

> **⚠ SUPERSEDED, same day.** Read
> [`2026-07-14-native-build-plan.md`](2026-07-14-native-build-plan.md) instead —
> it is the single source of truth for `native/` work.
>
> This audit is kept because its *ranking* is still a useful record of what a
> reviewer saw. But it was wrong in two ways, and both mattered:
>
> 1. **It understated the gap.** It missed whole systems the web has and native
>    does not: a **STYLE mode** (the web has 8 modes, not 7), Beginner/Maker/
>    Advanced **expertise levels**, a 934-line **validator engine** with "Fix in
>    \<Mode\> →" jumps, the **guided tutorial**, the **Time Machine UI**, **CHR/OAM
>    budget meters**, the **shared-tile duplicate guard**, and `.chr`/`.pal`/`.nam`
>    **import/export**.
> 2. **It missed the root causes**, which is why its P0 list looked like a set of
>    independent features rather than one blocked dependency. Native had **no NES
>    renderer at all** — the WORLD canvas painted `NES_COLOURS[value % 4]`, keyed
>    off the tile index, and the PALS grid *invented* its colours with
>    `QColor.fromHsv()`. Nearly every item below was blocked behind that.
>
> **Status of this audit's P0 list:** items 1 (PALS picker), 3 (partly — attribute
> conflicts, real rendering) and 4 (project catalog) are **done**; item 2 (CHARS
> composition canvas) is not. See the build plan's progress table.

This audit compares the current PySide6 application with the supported web
Studio and legacy editor surfaces. A native feature is only complete when the
workflow is usable from the Qt UI, persisted by `ProjectDocument`, covered by
an owning test, and rendered legibly at the supported minimum size.

## Confirmed usable in native

- Project persistence/snapshots, direct ROM build/export and capability-gated
  FCEUX launch.
- WORLD basic painting, layouts, metatiles, entity placement/drag, undo/redo.
- Shared BG/sprite tile editing, naming, transforms, copy/paste, reference-safe
  swaps, and WORLD/CHARS jump-ins to the TILES pixel editor.
- Sprite lifecycle, roles, basic composition/animation management.
- Basic Builder/RULES fields, song/SFX import, and editable C/ASM sources.

## High-impact gaps (ranked)

### P0 — currently makes equivalent web workflows impractical

1. **PALS visual picker and context.** Native exposes coloured numeric spin
   boxes but not the web’s 64-colour master grid, selected-slot workflow,
   recent colours, or used-by information.
2. **CHARS composition canvas and drawing tools.** Native can edit a selected
   shared tile, but lacks the web’s direct metasprite canvas, paint/browse
   modes, fill/line/rectangle/circle/select tools, zoom and shared-tile
   conflict guidance.
3. **WORLD viewport tooling.** Native lacks clear background, zoom, fullscreen
   preview, hover coordinate readout, rectangle palette paint, and the richer
   block picker/stamping workflow.
4. **Project workflow.** No catalog to switch, rename, duplicate, delete, or
   choose a starter/template project.

### P1 — prevents feature parity for complete games

5. Builder module gaps: per-door WORLD entries, remaining game-style/power-up
   fields, and validators with Fix/Show-me actions.
6. CODE gaps: Guided/Advanced access model, restore starter, snippets, lessons,
   generated-symbol reference, and build log.
7. Asset imports/exports: partial background/sprite import and CHR/NAM/PAL
   export surfaces.
8. SOUND: drag/drop, SFX-slot listing, starter pack, preview/play controls.

### P2 — product and inclusive workflow gaps

9. Gallery/account/cloud-save workspaces.
10. Accessibility preferences (text scale/high contrast), help and feedback.
11. Browser-equivalent emulator controls and two-player input legend.

## Deliberately not marked complete

The web parity checklist is broader than current native implementation. In
particular, green native tests do not prove visual editing-tool, project-catalog,
validator, import/export, gallery, or inclusive-chrome parity. Each item above
requires a focused implementation plan and UI/functional verification before
its status changes.

## Next slice

Implement a PALS master-grid picker with explicit selected palette slot,
keyboard-accessible colour buttons, recent-colour history, and used-by context;
then render and test the workflow before advancing to CHARS composition.
