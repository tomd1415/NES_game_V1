# NES engine changelog

Newest first. The **engine** is the C templates + assembler + cc65 project
that turn a project into a ROM. Bump `ENGINE_VERSION` (and
`tools/tile_editor_web/engine-version.js`) and add an entry here whenever a
change alters ROM output or the project↔ROM contract, then run
`node scripts/snapshot-engine.mjs` to freeze the new version.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
for the full design (snapshots, fallback, upgrade advisor).

## v20 — 2026-07-06 — ASM engine generator Phase 1: project.inc + 4 more functions

### Added
- **`src/project.inc`** — the server (`build_project_inc`) now emits per-project
  ASM constants (WORLD_COLS/ROWS, BG_WORLD_COLS/ROWS, PLAYER_*, sprite counts) as
  ca65 `.define`s, mirroring collision.h/bg_world.h/scene.inc. The hand-written
  modules `.include "project.inc"` (via `-I src`) so ONE fixed `.s` serves any
  project — ca65 bakes the values per build. First step of the generator plan
  (`docs/plans/current/2026-07-06-asm-engine-generator.md`).
- **`src/asm_macros.inc`** — `MULC resBase, CONST`: a shift-add multiply by an
  assemble-time constant (a shift for powers of two), used for the per-project
  index/offset math.
- **Four previously-`NES_ASM_SPECIALIZED` functions generalised and SHIPPED**
  (now under `NES_ASM_LEAF` / `NES_ASM_SCROLL`): `behaviour_at` (WORLD_COLS
  shift-add), `reaction_for` (NUM_BEHAVIOUR_SPRITES bound), `advance_animation`
  (PLAYER_TILES_PER_FRAME), `scroll_stream_prepare` (BG_WORLD_COLS stride +
  conditionally-assembled vertical row path for tall worlds). So `/play` now
  ships **10** hand-written 6502 functions — including the hot enemy/collision
  query `behaviour_at`.

### Changed / migration
- **Default unchanged.** Flags off ⇒ byte-identical to v19 (pure-C golden
  `1730448e`). Matched-progress A/B identical; full builder suite green across
  every world shape (1×1, 2×1, 1×2, 2×2, racer, SMB, topdown, runner). Shipped
  everything-on ROM re-pinned in `_rom-equiv.mjs` (`27210a8f`).
- The `behaviour.c` generator now gates `behaviour_at`/`reaction_for` behind
  `#ifndef NES_ASM_LEAF`; the `platformer.c` template gates the basic animation
  block behind `NES_ASM_ANIM` (the ASM `advance_animation` covers basic anim only
  — attack one-shots / racer rotation keep the inline C). `advance_animation`
  ships via `NES_ASM_LEAF` only when the project has no attack and isn't a racer.
- **ca65 note:** constants use `.define` (textual), not `SYM = value`, because
  ca65 won't fold an `=` constant inside a `.proc` scope for `.if` / macros.

## v19 — 2026-07-06 — universal hand-written 6502 engine SHIPS by default

### Changed / migration (ROM output changes — deliberate)
- **The `/play` server now builds the universal hand-written 6502 engine by
  default** for every platformer-derived project. Pupils' ROMs are no longer pure
  cc65 C: `read_controller`, `write_palettes` (`NES_ASM_LEAF`, any build) and —
  on scroll (multi-screen) builds — `world_to_screen_x/y`, `scroll_follow`,
  `scroll_apply_ppu` (`NES_ASM_SCROLL`) are hand-written 6502. Behaviourally
  identical to the C engine at matched game-logic progress (asm-lab settle-to-rest
  A/B); the win is headroom — the engine holds 60fps where pure C dropped frames.
- **Only the six project-INDEPENDENT functions ship.** The dimension-baked ones
  (`behaviour_at`→WORLD_COLS, `scroll_stream_prepare`→BG_WORLD_COLS,
  `advance_animation`→PLAYER_TILES_PER_FRAME, `reaction_for`→sprite count) plus
  `draw_text`/`clear_text_row` moved behind a new **`NES_ASM_SPECIALIZED`** flag
  (direct/lab builds only) — the server never ships them, so a project of any
  world/player size is safe.
- **Server gating.** `_build_in_tempdir` passes `NES_ASM_LEAF=1` (and
  `NES_ASM_SCROLL=1` for scroll builds) only when the `main.c` is ASM-ready — the
  stock main.c or a template-derived `customMainC` carrying the
  `NES_ASM_READY_V1` marker. A bespoke `customMainC` (e.g. the audio.html
  preview) lacks the marker and is built as pure C, so it can define those
  helpers itself without a clash. `palette_bytes` is emitted non-`static` so the
  ASM `write_palettes` can import it (linkage-only).
- **Kill switch:** set `PLAYGROUND_NO_ASM=1` in the server env to fall back to the
  pure-C engine for every build.
- **Golden invariant intact.** The byte-identity test builds via `make` with no
  flags (pure C) and is UNCHANGED (`1730448e…`); the flag-off ROM is still
  byte-identical. The shipped (ASM) everything-on ROM is re-pinned in
  `_rom-equiv.mjs` (`8172e353…`).

### Note
- The engine snapshot captures sources, not the server's build invocation, so a
  snapshot rebuild with `make` (no flags) reproduces the pure-C ROM — an
  acceptable behaviourally-identical fallback (byte-identity across engine
  versions was never guaranteed).

## v18 — 2026-07-06

### Added
- **First main-loop *gameplay* function on hand-written 6502:**
  `advance_animation` (extends `NES_ASM_LEAF`) in `main_asm.s`. This is the
  per-frame player animation state machine (mode-change reset → tick advance at
  `anim_frame_ticks` → frame wrap at `anim_frame_count` → `anim_base =
  anim_frame * PLAYER_TILES_PER_FRAME`). It runs on the engine-owned, already
  non-`static` `anim_*` globals — no per-project generated data — so it is a
  clean hand-conversion. The inline C block in `main.c` is preserved verbatim
  under `#else`; flag-on calls the ASM. Proven equivalent in
  `asm-lab/functions/advance_animation` (9 cases: mode-change reset, tick
  threshold, frame wrap, static `count==1`, the `*4` base).
- A compile-time `#error` guards the baked `PLAYER_TILES_PER_FRAME==4` (the ASM
  computes `anim_base` as `<<2`), so a project with a different player size fails
  loudly instead of silently baking the wrong shift.

### Changed / migration
- **Default unchanged.** Flags off ⇒ byte-identical to v17 (golden
  `d0a0fa7ad715`). At matched game-logic progress the all-ASM build (now
  including the anim state machine, exercised live every walking frame) is
  byte-identical to all-C (OAM/palette/nametables).
- **Boundary finding — the scene-sprite gravity loop stays in C.** The other hot
  main-loop block (per-enemy gravity) reads/writes the **server-generated
  `ss_x/ss_y/…` scene arrays**, which are `static` and whose element width
  varies u8↔u16 by sprite position and whose count varies per project. A stable
  hand-written twin isn't possible; it needs the *server* to emit a
  project-matched ASM variant (codegen generation) — the "full ASM engine"
  route. Its dominant per-sprite cost (`behaviour_at`) is already ASM.

## v17 — 2026-07-06

### Added
- **`scroll_stream_prepare` (horizontal column path) on hand-written 6502**
  (extends `NES_ASM_SCROLL`) in `scroll_asm.s`; C body gated with
  `#ifndef NES_ASM_SCROLL`. This is the function whose cc65-slow
  `bg_world_tiles[rr*64 + col]` index loop (30 iterations, each a 16-bit
  multiply + array load) pushed the column-stream frame over the NTSC vblank
  budget. The ASM replaces it with a constant **+64-stride pointer walk** down
  the column. Proven equivalent to the C in
  `asm-lab/functions/scroll_stream_prepare` (8 cases: no-cross, right/left
  boundary cross, NT0/NT1 select, col-0, out-of-world clamp, the column copy).
- **Shared streaming state de-`static`'d** in `scroll.c` (`col_buf`, `col_addr`,
  `col_pending`, `prev_cam_x`) so the ASM can `.import` them — linkage-only, BSS
  unchanged, default ROM byte-identical.

### Changed / migration
- **Default unchanged.** `NES_ASM_SCROLL` off ⇒ pure C ⇒ byte-identical to v16
  (golden `d0a0fa7ad715`). At matched game-logic progress the all-ASM build is
  byte-identical to all-C (cam_x, OAM, palette, nametables); the all-ASM engine
  holds 60 fps (0 dropped frames) over a scroll where pure-C drops 5.
- **Specialisation (documented):** the ASM `scroll_stream_prepare` bakes
  `BG_WORLD_COLS=64` and the horizontal-only world shape (like `behaviour_at`
  bakes `WORLD_COLS=64`). A vertically-scrolling world (`BG_WORLD_ROWS>30`) needs
  the C row path, so `NES_ASM_SCROLL` remains a horizontal-64-wide-world flag.
- **Left in C on purpose:** `scroll_stream`'s in-vblank burst is already fully
  unrolled by cc65 to `lda buf+N / sta $2007` (optimal), so an ASM twin would
  save ~nothing; `load_world_bg` runs once at startup (no per-frame budget).

## v16 — 2026-07-06

### Added
- **`scroll_apply_ppu` on hand-written 6502** (extends `NES_ASM_SCROLL`) in
  `scroll_asm.s`; the C body in `scroll.c` is gated with `#ifndef NES_ASM_SCROLL`.
  Folds `cam_y` into a 0..239 scroll value + vertical-band parity, derives the
  nametable-select bits (`cam_x` bit 8 → horizontal, band parity → vertical), and
  streams `$2000`/`$2005`/`$2005`, resetting the auto-increment stride to +1.
  Proven equivalent to the C in `asm-lab/functions/scroll_apply_ppu` (16 cases:
  the 256-px NT boundary, the 240-px band fold, the illegal 240..255 region, a
  full 0..479 range). The lab redirects the three PPU stores to a RAM capture
  buffer so ref-vs-asm is comparable; the engine version hits the real registers.

### Changed / migration
- **Default unchanged.** `NES_ASM_SCROLL` still defaults off ⇒ pure C ⇒
  byte-identical to v15 (golden hash `d0a0fa7ad715`, golden-safe).
- **A/B methodology corrected (finding, not a code change).** The settle-to-rest
  A/B was extended to sustained scrolling and surfaced a stable 6-px X offset on
  static sprites in the all-ASM build. Root-caused (not a bug): with RIGHT held
  and no walls, `px` advances once per main-loop iteration, so it doubles as an
  iteration counter — over 130 vblanks the all-ASM build ran 130 iterations while
  pure-C ran only 124. **The pure-C engine drops one frame per 30-tile
  column-stream burst (it overruns the NTSC vblank budget); the ASM engine is
  fast enough to hold 60 fps.** At *matched game-logic progress* (equal `px`) the
  two builds are byte-identical (cam_x, OAM, palette, nametables all equal). So
  the correct equivalence lens for a faster engine is matched-progress, not
  matched-vblank; the streamer conversion (next) should remove the drops outright.

## v15 — 2026-07-06

### Added
- **The last three lab-proven leaf helpers on ASM** (extends `NES_ASM_LEAF`):
  `write_palettes`, `draw_text`, `clear_text_row` in `main_asm.s`, C bodies
  gated. `draw_text`/`clear_text_row` are emitted in this build's `SCROLL_BUILD`
  variant (they `jsr scroll_apply_ppu`, matching the C exactly). To let the ASM
  reach the palette data, `palette_bytes` in `palettes.inc` is now non-`static`
  (a linkage-only change — the emitted bytes are unchanged, so the ROM stays
  byte-identical). Prototypes added for the three so their call sites compile
  when the bodies are gated out.
- **All 9 lab-proven engine functions are now integrated** (behind
  `NES_ASM_SCROLL` + `NES_ASM_LEAF`): `world_to_screen_x/y`, `scroll_follow`,
  `read_controller`, `behaviour_at`, `reaction_for`, `write_palettes`,
  `draw_text`, `clear_text_row`. Verified pure-C vs all-ASM: palette RAM +
  OAM identical at rest, scrolling, and jumping. (`draw_text`/`clear_text_row`
  are lab-proven; they are present-but-uncalled in Step_Playground's main.c, so
  the in-engine A/B exercises the other seven.)

### Changed / migration
- **Default unchanged.** Both flags default off ⇒ pure C ⇒ byte-identical to v14
  (golden-safe). NOTE for turning the flags on via the server (`/play`): the
  server's codegen (`playground_server.py` behaviour/palette emit + the
  `platformer.c` template for main.c) would need the same `#ifndef` gates +
  non-`static` `palette_bytes` so regenerated files match — a follow-up; today
  the flags are exercised by building `steps/Step_Playground` directly.

## v14 — 2026-07-06

### Added
- **Three more engine leaf helpers on hand-written ASM** (new opt-in flag
  `NES_ASM_LEAF`): `read_controller` (main.c → `main_asm.s`) and `behaviour_at`
  + `reaction_for` (behaviour.c → `behaviour_asm.s`). The C bodies are
  `#ifndef NES_ASM_LEAF`-gated; `read_controller` gains a forward prototype so
  the call still compiles when its body is gated out. Proven equivalent in
  `asm-lab/` (per-function harness) **and** in-engine: built pure-C vs
  all-ASM (leaf + scroll), OAM is identical at rest, while scrolling, and while
  jumping — the last two exercise the ASM `behaviour_at` collision and
  `read_controller` input every frame.
- Note: `behaviour_at`'s index multiply is specialised to this build's
  `WORLD_COLS=64` (a power of two → shifts). A general-`WORLD_COLS` variant is a
  follow-up; the flag is only enabled for matching builds.

### Changed / migration
- **Default unchanged.** `NES_ASM_LEAF` defaults off ⇒ pure C ⇒ ROM
  byte-identical to v13 (golden-safe). Build-time flag, not a project setting.

## v13 — 2026-07-06

### Added
- **`scroll_follow` on hand-written ASM** (opt-in, extends `NES_ASM_SCROLL`).
  The camera dead-zone follow is now in `scroll_asm.s`; the C body in `scroll.c`
  is `#ifndef`-gated. The per-project edge clamp is exposed as two flag-gated
  const globals (`scroll_max_cam_x/y = WORLD_*-SCREEN_*`) the ASM reads; the
  deadzone (96/144) is a fixed engine default baked in; an axis whose max is 0
  (single-screen) is skipped at runtime, matching the C's per-axis `#if`. Uses
  a private BSS scratch (`sf_*`), not cc65's shared `ptr1..4`. Proven equivalent
  in `asm-lab/` (20 cases incl. a dead-zone boundary sweep) **and** in-engine:
  built all-C vs all-ASM on a 64-col world, OAM is identical at rest and while
  scrolling once both settle. (A transient 1-frame offset appears only during
  the startup VRAM-load window because the faster ASM finishes the load ~1 frame
  sooner — the documented `-Os` load-timing sensitivity, not a logic difference.)

### Changed / migration
- **Default unchanged.** `NES_ASM_SCROLL` still defaults off ⇒ pure C ⇒ ROM
  byte-identical to v12/v11 (golden-safe). Build-time flag, not a project setting.

## v12 — 2026-07-06

### Added
- **Hand-written 6502 scroll helpers (opt-in)** — the first integration from the
  `asm-lab/` ASM-engine effort. A new fixed engine file
  `steps/Step_Playground/src/scroll_asm.s` provides ca65 versions of
  `world_to_screen_x` / `world_to_screen_y`, and the Makefile flag
  **`NES_ASM_SCROLL=1`** links them while `#ifdef`-ing out the matching C bodies
  in `scroll.c` (so exactly one definition of each symbol links). Multi-screen
  builds only (the ASM reads the `cam_x` global that a 1×1 ROM's empty
  `scroll.c` never defines). The ASM is proven byte-for-byte-behaviour-equal to
  the C in `asm-lab/` (unit harness: aligned / 255-256 & 239-240 boundaries /
  underflow / max) **and** in-engine: a 64-col world built both ways renders
  identical OAM across 160 frames incl. 80 of scrolling. Smaller + faster than
  cc65 -Os (20/24 bytes vs 66, no `pushax`/`ldax0sp` runtime helpers).

### Changed / migration
- **Default is unchanged.** `NES_ASM_SCROLL` defaults to `0`; with it off the
  build is pure C and the ROM is **byte-identical** to v11 (golden ROMs
  unaffected). The flag is a build-time toggle, not a project setting, so
  existing projects rebuild identically. Turning it on is the start of the
  engine running on hand-written assembly; more functions follow the same
  off-by-default pattern (see `asm-lab/STATUS.md`).

## v11 — 2026-07-06

### Added
- **Stomp to defeat (plain platformer)** (bug #15 "no way to kill an enemy").
  A new **Damage** module option — *"Jump on enemies to defeat them"* — plus a
  tunable **bounce height**. When Player 1 falls onto an enemy from above (not
  rising, feet within `BW_STOMP_MARGIN`=8px of the enemy's top) the enemy is
  defeated (parked at `y=0xFF`) and the player bounces (`jmp_up =
  BW_STOMP_BOUNCE`, default 12) instead of taking damage; a side/below touch
  still hurts. Platformer style only (it needs the jump/gravity state) and
  emitted `#ifdef BW_STOMP_DEFEAT`, so a project with the option off is
  **byte-identical**. The SMB style already had goomba/koopa stomp + fireballs;
  this brings a defeat mechanic to the basic platformer's walker/chaser/flyer/
  patrol enemies. Behavioural test `stomp-basic.mjs` (ON defeats + bounces;
  OFF leaves the enemy alive).

### Changed / migration
- **Chaser AI now skips a defeated (parked) actor.** The basic `chaser` seeks
  the player on both axes, so once a defeat mechanic (the new stomp) can park
  it at `y=0xFF` it would otherwise crawl its Y back on-screen. Guarded with
  `if (ss_y[i] < 0xEF)`. Only affects projects that place a `chaser`; the
  no-modules golden ROM and the walker/static `_rom-equiv` config are unchanged.

## v10 — 2026-07-06

### Added
- **Two new enemy paths** (bug #13 "more enemy paths") selectable per scene
  instance in the World dock's **AI** dropdown when the project targets v10+:
  - **flyer** — ignores gravity, bobs up and down a fixed ±20px range and
    drifts horizontally toward the player. A flying enemy for open air and
    ceilings; uses no wall probe, so it floats freely.
  - **patrol** — walks back and forth a fixed ±40px distance and turns on its
    own (no wall required), so it stays put on an open platform where a plain
    `walker` would march straight off the edge.
  Both use the existing per-instance **speed** (1..4). Emitted by
  `builder-modules.js` only when an instance's `ai` is `flyer`/`patrol` **and**
  the target engine is ≥10; on any older target they degrade to `walker`, so a
  design that picked one still builds and the non-flyer/patrol golden ROMs are
  byte-identical.

### Changed / migration
- None. Existing projects contain no `flyer`/`patrol` instances, so their ROM
  output is unchanged. New projects stamp `engineVersion: 10`.

## v9 — 2026-07-05

### Added
- **Tunable SMB speed** — the SMB horizontal max walk/run + accel are now
  `#define`s (`BW_SMB_WALK_MAX` / `BW_SMB_RUN_MAX` / `BW_SMB_ACCEL`) driven by a
  **Speed** preset (**1 slow … 5 fast**) in the Style tab. Fixes: the generic
  "walk speed" never affected the SMB style (it uses fixed-point velocity, not
  `walk_speed`), so changing it did nothing — now there's a control that does.
  Preset 2 ≈ SMB's 1.5 / 2.5 px/f; preset 5 ≈ 3 / 5. **Acceleration is snappier
  than SMB's authentic 0x18** at every preset (players found the original too
  gradual). Non-SMB golden ROM unchanged; the showcase ships at preset 3.
- **SMB OAM flicker** (`BW_OAM_FLICKER`, SMB + engine v9) — the engine rotates
  the scene-sprite OAM region one slot per frame, so a scanline with more than
  the NES's 8 sprites drops a **different** sprite each frame (a flicker) instead
  of the same one permanently — exactly how the real SMB copes with crowded
  rows. Player + HUD keep their fixed priority (drawn earlier). Toggle in the
  Style tab's Rendering panel. Stays **NROM** (decision D-9).

### Changed / migration
- No migration. Gated on `BW_OAM_FLICKER` (SMB game type, engine v9+), so every
  existing game (and pre-v9 targets) builds byte-identically — golden‑ROM
  hashes unchanged.

### Not yet
- **8×16 sprite mode** and a true **sprite-0 background HUD split** — larger
  rendering changes deferred as advanced polish; the 8×8 metasprites + OAM HUD
  work well and stay NROM. Column-stream scroll is already in place from the
  multi-screen work.

### Breaking
- (none.)

## v8 — 2026-07-05

### Added
- **Pipes** (`BW_SMB_PIPES`, SMB + engine v8) — hold **Down** while standing on
  a pipe cell to **warp** to a spawn spot: the classic underground bonus section
  of a tall (1×2) level, or any teleport. A position→spawn table
  (`bw_pipe_tbl`), placed in a **Pipes editor** on the World page.
- **Flagpole finish** (`BW_SMB_FLAG`, SMB + engine v8) — crossing a configured
  column **wins the level** (via the Win condition's `bw_won`) with a **+5000
  score bonus**. Toggle + column in the Style tab.

### Changed / migration
- No migration. Both are gated on their SMB flags (only emitted for the SMB game
  type on engine v8+), so every existing game (and pre-v8 targets) builds
  byte-identically — golden‑ROM hashes unchanged. The flagpole needs the Win
  condition module on; pipes warp **same-room** only (cross-room bonus areas use
  a per-door warp, which already exists).

### Not yet
- Cross-**room** pipe warps (use a door), a scripted flagpole slide animation,
  and the automatic **staircase** builder — a staircase is just painted solid
  tiles today, so it needs no engine feature.

### Breaking
- (none.)

## v7 — 2026-07-05

### Added
- **SMB HUD** — a new HUD module (`BW_SMB_HUD`, SMB game type + engine v7): a
  fixed on-screen read-out of **coins**, a **count-down timer**, a **score**
  and **lives**, drawn as **OAM digit sprites** at fixed screen positions (so it
  doesn't scroll with the level). The server seeds the 0-9 glyphs into the
  **sprite** pool at their ASCII indices, so the digits have art automatically.
- **Game logic:** the timer counts down ~every 0.4s and **time-up is a death**;
  each death **spends a life**; **coins add 200 to the score** (enemy-stomp
  points are a later addition). Digits spread over two tile-rows so no scanline
  exceeds the 8-sprite limit.
- Studio: a **HUD panel in the Style tab** (SMB) — toggle + start time + lives.

### Changed / migration
- No migration. All HUD code is gated on `BW_SMB_HUD` (only emitted for the SMB
  game type on engine v7+), so every existing game (and pre-v7 targets) builds
  byte-identically — golden‑ROM hashes unchanged. Needs Player HP for the
  time-up death / life spend.

### Not yet
- A true **sprite-0 background split** (SMB draws the HUD in the nametable and
  splits scroll mid-frame). The current HUD is OAM-sprite based — simpler and
  scroll-fixed, but costs sprites; the background/split version is deferred to
  the **v9** rendering pass. Also: a 6-digit score, enemy-stomp scoring, and
  deeper lives↔checkpoint-respawn integration.

### Breaking
- (none.)

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
- **Runtime tile-graphics swap** — a consumed block queues a nametable poke
  (`bw_poke_*`, flushed in the vblank window) so its tile visibly changes: a
  collected coin / broken brick vanishes, and a used ? block shows a
  configurable **used tile**. Verified in jsnes (collecting a coin flips its
  nametable byte). *Limitation:* a block that scrolls off-screen and back is
  re-streamed from the `const` world map, so its art reverts even though it
  stays logically inert — fine for a forward-scrolling level.
- **? block contents choice + item pop-out** — each ? block picks what it gives:
  **coin**, **Super Mushroom**, **Fire Flower**, **Starman**, or **1-Up**. A
  power-up **rises out of the block** (a 1-slot dispense pool) — the mushroom
  then walks and falls onto the ground, the others sit — and applies its effect
  when the player touches it (reusing the v5 power state). Gated so a coin (or a
  power-up with no Power-ups module) just adds a coin.
- Studio: a **Blocks editor** in the WORLD dock (Maker+, SMB, engine v6) to
  place blocks and pick each one's kind, **contents** (for ? blocks), tile
  position, and used tile.

### Changed / migration
- No migration. All block code is gated on `BW_SMB_BLOCKS` (only emitted for the
  SMB game type on engine v6+, with a non-empty block list), so every existing
  game (and pre-v6 targets) builds byte-identically — golden‑ROM hashes
  unchanged.

### Not yet
- Invisible/hidden blocks (need runtime solidity change) and multi-coin bricks
  (bump-window timer) — deferred; and coin→**score** lands with the v7 HUD.

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
