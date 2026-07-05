# Data-model audit → tracked tickets (Phase 0.1)

**Date:** 2026-07-05 · **Branch:** `redesign/ui-ux`

The Phase 0.1 audit confirmed the mappings in
[`target-data-model.md`](../target-data-model.md) against live Studio
state. The current build already has the correct tile-first foundation
(shared `bg_tiles`/`sprite_tiles`, metatiles as `{tiles,palette}`,
metasprites as `cells[][]` of shared refs with per-cell
flip/palette/priority, a real 32×30 nametable, 4+4 palettes of 3). This
file records the *remaining* gaps as tracked tickets, with current status.

| # | Gap | Status (2026-07-05) |
| - | --- | ------------------- |
| DM-1 | **Attribute granularity.** The NES colours per 2×2 chunk, but each nametable cell stores its own `palette` (per-8×8). Divergent cells within a chunk are a compile-time lie. | **Partly closed.** WORLD now paints palette per-2×2 quadrant (Colour tool) and flags conflicting chunks with a red overlay + count (Phase 2.5). **Open:** retiring the per-cell field as the *sole* source of truth — a shared-schema + cc65-emitter change across `index.html`/`sprites.html`/`behaviour.html` and the build; deferred to protect the golden-ROM contract. |
| DM-2 | **Two per-page 8×8 tile editors.** Backgrounds and Sprites each had their own tile editor. | **Closed.** Consolidated into the Studio **TILES** mode over both banks (Phase 2), incl. reference-rewriting swap (2.3) and in-context jump-ins (2.4). |
| DM-3 | **8×16 sprite mode (OAM).** Per-cell flip/palette/priority already ship; the gap is the tall-sprite PPU mode. | **Blocked on engine.** The cc65 build emits 8×8 OAM only — no PPUCTRL sprite-size path. A Studio toggle would be a lie until the engine emits 8×16. Needs an engine ticket before the editor work (Phase 3.3). |
| DM-4 | **Budget surfacing.** Usage stats existed but weren't aggregated for the pupil. | **Closed.** CHR/OAM budget meters (Phase 3.1) + 8-per-scanline analysis with a flicker warning (Phase 3.2). |
| DM-5 | **Import round-trips.** Exports existed (`.chr`/`.nam`/`.pal`/`my_tiles.txt`/`sprites.inc`+`.h`/cc65 C); imports did not. | **Partly closed.** Whole-project JSON round-trips (Phase 3.5 partial) and **`.chr` now imports+exports with a lossless round-trip test.** **Open:** `.nam` / `.pal` / `my_tiles.txt` / `sprites.inc`+`.h` imports (same pattern, lower priority). |

## Notes

- DM-1 and DM-3 are the two items that need a **coordinated change beyond
  the Studio UI** (shared storage schema and/or the cc65 engine). They are
  the natural candidates for a dedicated engine sprint and should not be
  "fixed" in the editor alone, or the on-screen model will disagree with
  the ROM.
- DM-2 and DM-4 are fully closed by the redesign work.
- DM-5 is mechanically straightforward to finish (mirror the existing
  exporters) whenever the remaining formats are prioritised.
