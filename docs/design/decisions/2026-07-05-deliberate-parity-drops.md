# Deliberate parity drops & deferrals (redesign)

**Date:** 2026-07-05 · **Branch:** `redesign/ui-ux`

As the Studio reached parity mode-by-mode, a few old-page affordances were
**deliberately dropped or deferred** rather than ported 1:1. Recording them
here so the [`feature-parity.md`](../feature-parity.md) walk before
switch-over has an explicit answer for each, instead of reading as a
regression.

## Deliberate drops (not coming back as-is)

- **Intro tours / guided overlays.** Replaced by the self-ticking **Quest
  Log** + "Needs attention" validators (design intent, Phase 1.6). The old
  page tours are retired on purpose.
- **Per-page inline emulators.** The Studio runs on the one shared
  `emulator.js` (`NesEmulator`). The three per-page variants retire with
  their pages; their union of controls already lives in the shared one.

## Deferred (planned, not a drop) — tracked elsewhere

- **CHARS marquee *region* ops** (rotate / scale / rectangular copy-paste of
  a pixel selection). Whole-character Flip H/V shipped; region-marquee is
  deferred. Whole-tile flip/rotate live in TILES.
- **Tile-swap by drag in CHARS/WORLD.** The reference-rewriting swap shipped
  in **TILES** (Phase 2.3) instead — one place, both banks.
- **WORLD pop-out tileset window** and **in-TV zoom.** Minor conveniences;
  the dockable tile grid + full-screen preview cover the need for now.
- **Remaining format imports** (`.nam` / `.pal` / `my_tiles.txt` /
  `sprites.inc`+`.h`). `.chr` and whole-project JSON round-trip today; the
  rest mirror the same pattern when prioritised (DM-5).
- **Full CODE port** (CodeMirror guided regions, lessons, snippets, symbol
  reference, C/asm toggle). The Advanced whole-file **eject-to-C** flow
  shipped (Phase 3.6 core); the guided-editing layer is deferred.

## Blocked on engine / backend (need a decision) — not editor-only

- **8×16 sprite mode** (DM-3) — needs a cc65 8×16 OAM path first.
- **Per-2×2-quadrant palette as the sole stored truth** (DM-1) — shared
  schema + cc65 attribute-emitter change across the old pages.
- **Bigger scrolling worlds, per-door destinations, in-runner dialogue,
  CHR bank switching, in-browser wasm compile** — Phase 4 items gated on
  NES-engine reworks the phased plan already sequences separately.

*No parity line is dropped silently: each is either superseded, deferred
with a home, or blocked on engine work called out above.*
