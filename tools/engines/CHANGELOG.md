# NES engine changelog

Newest first. The **engine** is the C templates + assembler + cc65 project
that turn a project into a ROM. Bump `ENGINE_VERSION` (and
`tools/tile_editor_web/engine-version.js`) and add an entry here whenever a
change alters ROM output or the project↔ROM contract, then run
`node scripts/snapshot-engine.mjs` to freeze the new version.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
for the full design (snapshots, fallback, upgrade advisor).

## v6 — 2026-07-05

### Added
- **Interactive blocks** (`? / brick / coin`) — a new **Blocks** module on the
  SMB path (`#define BW_SMB_BLOCKS`, SMB game type + engine v6). A position→kind
  table (`bw_block_tbl`, mirroring the per-door table) + a `bw_block_used[]`
  state array drive three block behaviours in the per-frame path:
  - **coin** — collected on touch; `bw_coins++`.
  - **? block** — bump from below (while rising) to step the power state up
    (small→super→fire, when Power-ups are on) or +1 coin otherwise; then inert.
  - **brick** — bump from below; **breaks (vanishes) only while super**, else
    just bonks the head.
- Studio: a **Blocks editor** in the WORLD dock (Maker+, SMB, engine v6) to
  place blocks and pick each one's kind + tile position.

### Changed / migration
- No migration. All block code is gated on `BW_SMB_BLOCKS` (only emitted for the
  SMB game type on engine v6+, with a non-empty block list), so every existing
  game (and pre-v6 targets) builds byte-identically — golden‑ROM hashes
  unchanged.

### Not yet
- Runtime **tile-graphics swap** for used/broken blocks (a used ? block and a
  broken brick currently stop reacting but keep their painted art) — needs a
  queued vblank nametable poke; next increment. Coin→score/HUD and the
  `? → dispensed item that jumps out` animation land with the v7 HUD.

### Breaking
- (none.)

## v5 — 2026-07-05

### Added
- **Power-ups & fireballs** — the SMB power-up state machine, behind a new
  **Power-ups** module (`#define BW_SMB_POWERUPS`, SMB game type + engine v5):
  - A player **power state** — small → super → fire — set by touching items.
  - **Items** as a new Scene AI kind (`ai: 'item'`) with a `power`:
    **Super Mushroom** (→ super), **Fire Flower** (→ fire), **Starman**
    (invincibility timer), **1-Up** (full heal; true lives arrive with the HUD).
  - **Fireballs**: in the fire state, **B** throws one from a 2-slot pool —
    it arcs under gravity, bounces off the ground, despawns on a wall / off the
    world edge, and **defeats enemies** on contact.
  - The shared hurt path now **demotes a super/fire player to small** (instead
    of costing HP), and a **Starman** ignores hits entirely.
- **SMB-tuned jump/fall** for the smb style: the fall is now a touch faster
  than the rise (3 vs the rise speed) so the arc lands snappily — closer to the
  original. Gated on `BW_SMB_JUMP`, so all other styles are unchanged.
- **Performance — SMB enemy AI runs at full speed.** Two changes keep a wide,
  enemy-packed scrolling level inside the per-frame vblank budget (cc65 code is
  ~5× slower than asm, so the enemy AI was the dominant cost and a full screen
  of Goombas dropped the ROM below 30 fps): (1) Goomba/Koopa now turn at walls
  with a **single mid-line `behaviour_at` probe** (`bw_smb_wall`) instead of the
  5-arg, body-row-looping `bw_sprite_blocked` — measured **8 on-screen Goombas
  from ~25 fps to a full 60 fps**; (2) an **on-screen dormancy gate**
  (`BW_SMB_ONSCREEN`) skips AI for off-screen actors, exactly like the original.
  Both touch only the Goomba/Koopa path (the `walker`/`chaser` AIs and the
  golden ROM are unchanged).

### Changed / migration
- No migration. All power-up code is gated on `BW_SMB_POWERUPS` (only emitted
  for the SMB game type on engine v5+) and the faster fall on `BW_SMB_JUMP`, so
  every existing game (and pre-v5 targets) builds byte-identically — golden-ROM
  hashes unchanged. The **SMB showcase** starter now spans **two scrolling
  screens** and wires the power-ups; the Studio adds a Power-ups module card and
  an `item` Scene-AI option (with a power picker).

### Breaking
- (none.)

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
