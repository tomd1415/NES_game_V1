# Sprint 11 — Scrolling platformer + RPG / top-down template

Two user-visible features that share one underlying infrastructure
change.  Planned as a multi-sprint bundle (S-1 … S-5) so the
dependencies are explicit and we can ship a useful slice after each
sub-sprint.

References:
- [index.html](tools/tile_editor_web/index.html) — Backgrounds page
  (the `screens_x × screens_y` field already exists; editor already
  paints multi-screen backgrounds).
- [sprites.html](tools/tile_editor_web/sprites.html) — Sprites page
  (will gain 4-direction animation slots + movement-model radio).
- [behaviour.html](tools/tile_editor_web/behaviour.html) — Behaviour
  page (no UI change; map already emits at full world size).
- [main.c](steps/Step_Playground/src/main.c) — current default
  platformer main, gains a scrolling-aware sibling and a top-down
  sibling.
- [playground_server.py](tools/playground_server.py) — build pipeline
  (nametable emitter currently crops to one screen at
  [line 166-174](tools/playground_server.py#L166-L174); template
  selection at `state.template` is not yet consumed).

---

## Problem & goal

Two gaps, one root cause:

1. **Scrolling platformer.**  Pupils can paint a 2×1 or 3×2 background
   today, but the emitter only ships the first 32×30 screen.  They
   hit a wall as soon as they try to make a level bigger than one
   screen — the stock side-scroller they're trying to recreate just
   isn't possible.
2. **RPG / Pokémon-style template.**  `state.template` can be set to
   `'topdown'` but no code path reads it — picking the top-down
   starter on the Sprites page produces the same platformer ROM as
   picking the platformer starter.

Both depend on the same missing piece: **the engine must know about
worlds larger than one screen**.  Doing scrolling first unblocks
both templates cleanly.

Goal: pupils can choose *platformer* or *RPG* as their starter, paint
a world that spans several screens on any axis, and the generated ROM
scrolls with the player.  Existing 1×1 projects must continue to work
unchanged.

## Scope summary

- **In (across the five sub-sprints):** full-world nametable emission,
  shared scroll core with column/row streaming, world ↔ screen
  coordinate swap, camera-follow with a pupil-tunable deadzone, a
  scrolling-aware platformer main, a new top-down main, per-direction
  sprite animations, A-button interact (NPC talk / DOOR step-through),
  optional classic grid-step movement for the RPG template.
- **Out for this sprint bundle:** battles / encounters / menus,
  tall-grass random encounters, sprite 0 HUD strip, mapper upgrade
  beyond NROM (single-axis scrolling only), pixel-perfect collision,
  per-screen music tracks, save states.  All flagged in *Out of
  scope* below.

---

## Existing scaffold (do not rebuild)

- `state.template` ∈ `'platformer' | 'topdown'`, `state.movement` ∈
  `'platformer' | 'fourway'` already exist in the schema.  Both are
  set when a pupil picks a starter template on the Sprites page —
  nothing downstream consumes them yet.
- `state.backgrounds[i].dimensions.screens_x / screens_y` already
  let pupils paint multi-screen worlds in the Backgrounds page; the
  canvas scales accordingly.
- The behaviour map already emits at full world size
  (`WORLD_COLS × WORLD_ROWS`, covering `SCREEN_COLS * screens_x` by
  `SCREEN_ROWS * screens_y`) in `src/behaviour.c`.  `behaviour_at()`
  already takes world coordinates.
- `draw_text()` / `clear_text_row()` helpers in the default
  `main.c` already know how to write to the nametable during VBlank —
  good pattern to reuse for the scroll-time column streaming.
- `collision.h` already defines 7 behaviour ids (`NONE`,
  `SOLID_GROUND`, `WALL`, `PLATFORM`, `DOOR`, `TRIGGER`, `LADDER`)
  plus one custom slot — all useful in both templates.

---

## S-1 — Scrolling foundation (shared)

This is the big plumbing sprint.  Nothing user-visible changes at
the end of it — no new page, no new template — but every later
sub-sprint depends on the infrastructure.  Small existing projects
(`screens_x == screens_y == 1`) must build a byte-identical ROM to
today once this lands.

### Emitter — full-world nametable

- New emitter `build_bg_world()` alongside `build_scene_inc`.  Writes
  a flat row-major byte array `bg_tiles[WORLD_COLS * WORLD_ROWS]` and
  attribute array `bg_attrs[]` covering every screen the pupil
  painted.  Replaces / supplements the cropped 32×30 emission at
  [playground_server.py:166-174](tools/playground_server.py#L166-L174).
- Two new files: `src/bg_world.c` (the data + a `copy_world_column()`
  helper) and `src/bg_world.h` (dimensions + prototype).
- `src/graphics.s` stays single-screen for the 1×1 fast path.  Server
  picks which path based on `WORLD_COLS > SCREEN_COLS ||
  WORLD_ROWS > SCREEN_ROWS`.
- Commit a stub `bg_world.{c,h}` the same way we did for
  `collision.h` / `behaviour.c` so a fresh `make` works with no
  server running.

### Scroll core — `src/scroll.c` + `src/scroll.h`

- Owns `scroll_x`, `scroll_y` (u16), `camera_x`, `camera_y` (u16),
  and the VBlank-time PPU scroll register writes.
- Single shared function `scroll_tick(target_x, target_y)` that both
  platformer and top-down mains call once per frame.
- **Column / row streaming.**  When the camera crosses an 8-px
  boundary, copy the next 30-tile column (H-scroll) or 32-tile row
  (V-scroll) from `bg_tiles[]` into the off-screen nametable via
  `PPU_ADDR` / `PPU_DATA`.  Classic NES side-scroller technique.
  Attribute writes happen every 16 px because attribute tiles cover
  2×2 metatiles.
- **Mirroring mode.**  Pick iNES header byte based on which axis
  scrolls: horizontal mirroring for H-scroll, vertical for V-scroll.
  2-axis scrolling needs a mapper bump — see *Risks*.
- **Camera deadzone.**  Pupil-tunable rectangle (default 48 px wide,
  32 px tall, centred).  Player can move freely inside the deadzone
  without the camera following; crossing the edge pulls the camera.
  Guided region `//>> camera_deadzone` in both mains.
- **World edges.**  Camera clamps to `[0, WORLD_W - 256]` /
  `[0, WORLD_H - 240]` so we never scroll past painted data.

### World ↔ screen coordinates

- `player_world_x`, `player_world_y` (u16) become the source of
  truth.  Screen coords for OAM writes are `world - scroll`.
- `behaviour_at()` already takes world coords — no change needed.
- Scene sprites (`ss_x[]`, `ss_y[]`) become world-space u16s.
  Migration: when loading a pre-S-1 project, promote the existing
  u8 values.
- Player bounds clamp becomes `[0, WORLD_W - PLAYER_W*8]` /
  `[0, WORLD_H - PLAYER_H*8]`.

### Fast path for 1×1 projects

- If both `WORLD_COLS == SCREEN_COLS` and `WORLD_ROWS == SCREEN_ROWS`:
  - Skip `scroll.c` entirely.
  - Use today's `graphics.s`-based nametable load.
  - Player x/y stay u8 (no world coords).
- Decision made in `playground_server.py` based on world dims;
  generated main.c `#include`s the right set of headers so the
  non-scrolling build is byte-identical to today.  Existing pupil
  projects must not regress.

### UI — Backgrounds page

- Small affordance: "🗺 World size: N × M screens (≈K tiles)" label
  under the size selector, with a soft warning when total tile bytes
  would exceed ~4 KB on NROM.  No hard cap — pupils learn the limit
  by bumping into the warning.

### Acceptance

- Building a 2×1 platformer project produces a ROM that scrolls
  horizontally with the player and clamps at both edges.
- Building a 1×2 project scrolls vertically.
- Building a 1×1 project produces the same ROM bytes as before
  (or close enough that the diff is explained — e.g. a new unused
  symbol may appear).
- No seam flicker on FCEUX or Mesen for the first 20 s of scrolling.
- `make -C steps/Step_Playground` still works from a fresh checkout
  with the server not running.

---

## S-2 — Scrolling platformer (current default + scroll)

Lean sprint: reuse S-1's infrastructure, wire it into the existing
platformer main.

- New `main.c` variant (or conditional additions to the current one)
  that:
  - Tracks `player_world_x/y`.
  - Calls `scroll_tick(player_world_x, player_world_y)` each frame.
  - Draws the player at screen-space `world - scroll`.
  - Keeps today's gravity / jump / ladder / 4-way solidity unchanged.
- Server picks this variant when `state.template === 'platformer'`
  *and* the world is larger than one screen; 1×1 platformer projects
  keep today's single-screen main exactly.
- Snippet: `edge-camera-deadzone` teaching pupils how to tighten /
  loosen the deadzone.
- Changelog + a fresh screenshot in `assets/pupil/preview.png`
  showing a 2×1 side-scroller.

### Acceptance

- A 2×1 platformer with SOLID_GROUND and a LADDER in screen 2 plays
  as a Mario-style side-scroller.
- LADDER still suspends gravity; 4-way solidity still blocks; DOOR
  still triggers the pupil's DOOR handler (no change needed).
- 1×1 platformer projects untouched.

---

## S-3 — RPG / top-down core

This is where the new template actually appears.  Depends on S-1.

- **New entry point:** `src/main_topdown.c` alongside `src/main.c`.
  Server picks which one to compile based on `state.template` by
  swapping the `C_SRC` in the tempdir build path.  Shared-dir build
  stays platformer.  Keeps pupil-facing code readable: one file
  matching the template they picked, no `#ifdef` clutter.
- **Movement model: smooth 4-way pixel walk.**  LEFT/RIGHT/UP/DOWN
  each move `walk_speed` px.  `jumping` / `jmp_up` / `on_ladder` all
  absent — no gravity.
- **4-way solidity.**  `SOLID_GROUND`, `WALL` block every direction
  via the same "probe ahead at every body row/column" pattern the
  platformer uses for horizontal walls.
- `PLATFORM` and `LADDER` are platformer-only concepts — treat them
  as walkable in the top-down main.  Painted LADDER tiles don't
  break anything; they just don't do what pupils might expect
  from the platformer template.  Flag in the Behaviour page hint.
- **Facing direction:** `plr_facing` ∈ `{UP, DOWN, LEFT, RIGHT}`.
  Updated whenever the D-pad is pressed.  Drives which tile table
  feeds the OAM write.
- **Scene sprites: no gravity.**  The default loop draws them in
  place.  `🕊 Flying` checkbox becomes a no-op in top-down mode;
  leave the UI as-is and mention in the hint.
- **Per-direction animation slots on the Sprites page.**  Four new
  mini-sheets: `walk_up`, `walk_down`, `walk_left`, `walk_right`
  alongside the existing `walk` and `jump` slots.  Each follows the
  same pattern: `FRAME_COUNT`, `FRAME_TICKS`, a tiles/attrs byte
  table per frame.  Walk-up and walk-down fall back to the static
  `player_tiles` table when left empty; walk-left and walk-right
  fall back to the existing `walk` table (with walk-right as
  flip-H of walk-left).
- **Emitter extensions:** four more `unsigned char[]` tables in
  `scene.inc` (and `scene.asminc`), four matching `FRAME_COUNT` /
  `FRAME_TICKS` `#define`s.
- **Migration:** existing `walk` animation auto-populates
  `walk_left`; server synthesises `walk_right` as flip-H at build
  time.  `walk_up` / `walk_down` start empty → static fallback.
  Pupils opt in to custom up/down art when they want it.
- Uses S-1's scrolling out of the box: a 2×2 or 3×3 top-down world
  plays as a Pokémon-style map with camera-follow scrolling.
- Changelog + a second preview screenshot.

### Acceptance

- Picking the `topdown` starter produces a ROM with 4-way smooth
  movement, 4-way solidity, no gravity.
- Walk-left and walk-right animate from the existing `walk` frames;
  walk-up and walk-down fall back to the static frame until the
  pupil adds art.
- A 2×2 top-down project scrolls in both axes (within the mapper
  limit — see *Risks*).

---

## S-4 — RPG interactions

Landing after S-3 because it builds on the 4-way facing model.

- **A-button interact.**  Press A → probe the tile *directly in
  front* of the player in the facing direction.
  - If a scene sprite with `role === 'npc'` occupies that tile,
    call `//>> on_interact` with the sprite index.  Default body:
    `draw_text(row, col, ss_dialogue[idx])`.
  - If the tile's behaviour id is `DOOR`, call `//>> on_door`.
    Default body: empty — pupil fills in the scene transition
    themselves (out of scope to auto-emit).
  - If `TRIGGER`, call `//>> on_trigger` (already present today in
    concept; formalised here with the A-button hook).
- **Per-sprite dialogue field.**  `state.sprites[i].dialogue: string`
  (single short string for v1, ≤ 64 chars).  Added to the Sprites
  page under the NPC role section.  Emitted as `ss_dialogue[]` —
  flat concatenated bytes + `ss_dialogue_off[]` offsets so the C
  code indexes by sprite id.
- Snippet: `rpg-npc-talk` showing the minimal implementation of an
  interact hook that reads the sprite's dialogue and draws it.
- Dialogue UI: draws a 2-row text box at the bottom of the screen
  using `draw_text`; advances / clears on the next A press.
- Migration: `dialogue` defaults to `""` on existing sprites; empty
  dialogue + A press = no-op.

### Acceptance

- Painting an NPC sprite, typing `"hello!"` in their dialogue field,
  and pressing A in front of them shows `hello!` at the bottom of
  the screen.  Pressing A again clears it.
- DOOR tiles call the pupil's `on_door` hook; default is a no-op
  so nothing regresses.

---

## S-5 — Classic grid-step movement (RPG opt-in)

Feel-tweak sprint.  Closest to actual Pokémon.  Purely opt-in — the
smooth 4-way movement from S-3 stays the default.

- `state.movement === 'grid_step'` becomes a third legal value
  (alongside `'platformer'` and `'fourway'`).
- Radio on the Sprites page under the top-down starter: **Smooth /
  Grid-step**.
- Engine behaviour when grid-step active:
  - Tap D-pad → player steps exactly one 8-px tile, animated over N
    frames (default 8, so 1 tile/second at 60 fps feels Pokémon-ish
    without being sluggish).
  - Input locked during a step; queued input (next D-pad press) fires
    as soon as the current step completes, so holding the D-pad
    chains steps smoothly.
  - Solidity check happens *before* the step begins — if the target
    tile is blocked, the player plays a half-step "bump" animation
    instead of moving.
- Guided region `//>> step_frames` so pupils can tune the speed.
- Snippet: `rpg-grid-step-tuning` showing how to speed up / slow
  down and how to add a bump sound hook.
- Migration: existing topdown projects default to `smooth`; pupil
  can switch any time without losing progress.

### Acceptance

- Switching to grid-step makes a top-down project feel like a
  cartridge-era RPG: tile-aligned, tap-to-step, bump animation on
  walls.
- Switching back to smooth is instant with no data loss.

---

## Out of scope (for this sprint bundle)

- **Battles / turn-based combat / menus / stats.**  Whole feature
  family, at least 2–3 sprints of its own.
- **Encounter system** (tall grass, random battles).  Depends on
  battles.
- **Mapper upgrade** beyond NROM.  We'll stick with NROM +
  single-axis mirroring choice.  2-axis scrolling on a real
  Pokémon-style cart needs MMC1; flagged in *Risks*.
- **Sprite 0 hit / HUD strip.**  Common NES technique for a
  non-scrolling status bar on top of a scrolling playfield.
  Genuinely useful for both templates; deferred to keep S-1 small.
- **Pixel-perfect collision.**  Still tile-granularity only.
- **Multi-background per-room scene transitions.**  `on_door` is a
  pupil-filled hook; we don't auto-emit the transition logic.
- **Per-screen or per-region music tracks.**  Sound system is
  separate work entirely.

---

## Risks & open questions

- **Mapper choice.**  NROM (mapper 0) + horizontal mirroring gives
  clean H-scroll; + vertical mirroring gives clean V-scroll.
  Clean 2-axis scrolling wants MMC1 or similar, which is a
  non-trivial toolchain change (different `.cfg`, different linker
  layout, CHR bank switching).  S-1 ships single-axis support
  only; 2-axis is a later follow-up.  Pupils building a
  2×2 Pokémon map will get scrolling along whichever axis they
  moved most recently with a visible seam on the other — document
  this clearly in the pupil guide rather than hiding it.  Revisit
  when a pupil complains.
- **Seam artefacts.**  Even single-axis scrolling can show a
  1-column flicker on some emulators if the streaming write misses
  VBlank.  Budget for early smoke-testing on FCEUX + Mesen during
  S-1; if it's bad, fall back to buffering the column into a zero-
  page staging area and DMA-ing it during the next VBlank.
- **World-size budget.**  Full-world nametable is
  `WORLD_COLS × WORLD_ROWS × 1` bytes + attributes.  A 4×2 world
  is already ≈ 4 KB of tile bytes — still fine on NROM's 32 KB
  PRG, but getting within an order of magnitude of the cart
  budget.  Backgrounds page should show a soft warning above ~6
  screens total so pupils learn the limit before hitting it.
- **Existing 1×1 projects.**  S-1 must include an honest fast path
  that produces byte-equivalent ROMs to today, otherwise every
  existing pupil project regresses when they open it.  Worth
  keeping a golden-file test ROM of a simple 1×1 project and
  diffing the bytes before/after S-1.
- **Up/down sprite frames are new art.**  Pupils who just want to
  poke around must get a graceful fallback (static tile all
  directions), otherwise S-3 feels broken until they spend an
  hour drawing frames.  The "fall back to `player_tiles`" rule
  handles this.
- **A-button overload.**  A is currently unused in both templates.
  S-4 claims it for interact.  If a pupil has wired A for a custom
  action via a snippet, their snippet silently stops firing when
  they step in front of an NPC.  Document this clearly.
- **Grid-step + scrolling.**  Grid-step movement makes scroll
  streaming trivially predictable (camera jumps exactly 8 px at a
  time) — this is the classic Pokémon approach and may actually
  simplify S-5's implementation.  Worth revisiting whether
  grid-step should fold scroll handling into the step tween
  rather than reusing the generic `scroll_tick`.

---

## Cut-lines

- **Smallest useful shipment:** S-1 + S-2.  Pupils get scrolling
  platformers; the existing template gains a major new capability.
  RPG work stays deferred but becomes cheap.
- **Pupil-facing RPG release:** S-1 + S-2 + S-3.  Two templates,
  both scroll-capable, both playable.  Feels like a real choice
  between Mario and Pokémon.
- **Full bundle:** + S-4 (interact) + S-5 (grid-step) for the full
  classic-RPG feel.  Nice-to-have, not blocking.

---

## Dependencies between sub-sprints

```
        S-1 (scroll foundation)
        /                    \
      S-2 (scrolling         S-3 (top-down core)
      platformer)                 |
                                  |
                                S-4 (interact)
                                  |
                                S-5 (grid-step)
```

S-1 is the only hard blocker.  S-2 and S-3 are independent of each
other — ship whichever is in demand first after S-1 lands.  S-4 and
S-5 both depend on S-3 but not on each other.
