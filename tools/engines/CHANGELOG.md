# NES engine changelog

Newest first. The **engine** is the C templates + assembler + cc65 project
that turn a project into a ROM. Bump `ENGINE_VERSION` (and
`tools/tile_editor_web/engine-version.js`) and add an entry here whenever a
change alters ROM output or the project↔ROM contract, then run
`node scripts/snapshot-engine.mjs` to freeze the new version.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
for the full design (snapshots, fallback, upgrade advisor).

## v3 — 2026-07-05

### Added
- **SMB game style** (`🍄 SMB platformer`): the platformer engine plus the
  signature **variable-height jump** — A jumps (as well as Up), a tap is a
  short hop and a hold is a full jump (releasing A+Up mid-rise cuts the
  ascent to a small minimum), and a running take-off (B held) jumps higher.
  Emitted as `#define BW_SMB_JUMP 1` on top of `BW_GAME_STYLE 0`, so it reuses
  the proven platformer path. First step of the SMB‑1‑1 roadmap
  (`docs/plans/current/2026-07-05-smb-engine-roadmap.md`).

### Changed / migration
- No migration. `BW_SMB_JUMP` is emitted only for the new `smb` game type on
  engine‑v3+ pages, so every existing game (and the v1/v2 game types) builds
  byte-identically — golden‑ROM hashes unchanged.

### Breaking
- (none.)

## v2 — 2026-07-05

### Added
- **Per-door destinations.** Each Door tile can carry its own spawn point and
  target background (same-room teleport *or* a room swap), instead of one
  spawn/target shared by every door. Authored in WORLD → Doors; stored as
  `builder.modules.doors.config.doorList` (`[{bg,tx,ty,spawnX,spawnY,targetBgIdx}]`).
  Emits a `bw_door_tbl[]` lookup keyed by (room, tile-x, tile-y).

### Changed / migration
- **No migration needed.** An empty `doorList` (all existing v1 projects)
  builds the exact v1 single-global-door code — byte-identical ROM, so the
  golden-ROM hash is unchanged. A v1 game opened here still works; to use
  per-door destinations, configure the door list.

### Breaking
- (none.)

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
