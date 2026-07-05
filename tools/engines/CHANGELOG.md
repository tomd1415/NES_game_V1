# NES engine changelog

Newest first. The **engine** is the C templates + assembler + cc65 project
that turn a project into a ROM. Bump `ENGINE_VERSION` (and
`tools/tile_editor_web/engine-version.js`) and add an entry here whenever a
change alters ROM output or the project↔ROM contract, then run
`node scripts/snapshot-engine.mjs` to freeze the new version.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
for the full design (snapshots, fallback, upgrade advisor).

## v1 — 2026-07-05 (baseline)

The shipped engine as of the `redesign/ui-ux` merge: four game types
(platformer, top-down, auto-runner, two-player racer), scrolling multi-screen
worlds (editor caps at 2×2), checkpoints, spawn effects, NPC dialogue with a
reserved BG glyph sub-palette, the behaviour map + sprite-reactions table,
16×16 metatile expansion, single global door (one shared spawn/target),
mapper-0 / 1× CHR bank, 8×8 sprites.

### Added
- (baseline — no prior version.)

### Changed / migration
- Projects created from here carry `state.engineVersion = 1`. Projects
  without the field are treated as v1.

### Breaking
- (none.)
