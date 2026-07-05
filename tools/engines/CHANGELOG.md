# NES engine changelog

Newest first. The **engine** is the C templates + assembler + cc65 project
that turn a project into a ROM. Bump `ENGINE_VERSION` (and
`tools/tile_editor_web/engine-version.js`) and add an entry here whenever a
change alters ROM output or the project↔ROM contract, then run
`node scripts/snapshot-engine.mjs` to freeze the new version.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
for the full design (snapshots, fallback, upgrade advisor).

## v4 — 2026-07-05

### Added
- **SMB actor AIs** — two new per-instance enemy behaviours on the Scene page,
  the meat of the SMB‑1‑1 enemy set:
  - **Goomba** (`ai: 'goomba'`): walks side to side, reverses at walls, **walks
    off ledges** (no ledge sensing, exactly like SMB). **Stomping** it from
    above (player descending, feet in the sprite's top half) defeats it and
    bounces the player; any other touch hurts.
  - **Koopa Troopa** (`ai: 'koopa'`): a three-state machine — **walk → stomp
    turns it into a still shell → touching the still shell kicks it** into a
    shell that slides at 3 px/f away from the player, **chains kills** on other
    enemies it overtakes, and hurts the player on contact; stomping a sliding
    shell stops it again.
- Shared, index-parameterised `BW_SMB_TOUCH` / `BW_SMB_STOMP` / `BW_SMB_BOUNCE`
  / `BW_SMB_HURT` / `BW_SMB_GUARD` helpers. `BW_SMB_HURT`/`GUARD` respect the
  Damage module's invincibility frames (with sane fallbacks when Damage is off),
  so a stomp never also counts as a side-hit — the actor AIs compose with the
  Damage module in either apply order.

### Changed / migration
- No migration. The `goomba`/`koopa` AIs only emit when the design targets
  **engine v4+**; a pre-v4 target (and the pinned v1 pages) degrades them to the
  plain `walker`, so every existing game builds byte-identically — golden‑ROM
  hashes unchanged. The advisor tells v3 designs that upgrading to v4 unlocks
  the SMB enemies.

### Breaking
- (none.)

## v3 — 2026-07-05

### Added
- **SMB game style** (`🍄 SMB platformer`): the platformer engine plus the
  signature **variable-height jump** — A jumps (as well as Up), a tap is a
  short hop and a hold is a full jump (releasing A+Up mid-rise cuts the
  ascent to a small minimum), and a running take-off (B held) jumps higher.
  Emitted as `#define BW_SMB_JUMP 1` on top of `BW_GAME_STYLE 0`, so it reuses
  the proven platformer path. First step of the SMB‑1‑1 roadmap
  (`docs/plans/current/2026-07-05-smb-engine-roadmap.md`).
- **SMB fixed-point horizontal physics**: signed 8.8 velocity (`smb_vx`) with a
  sub-pixel accumulator — accelerate to a walk (1.5 px/f) or run (2.5 px/f, hold
  B) max, friction decel on release, **2× skid** on reversal, leading-edge
  solid/wall collision cancels the step.

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
