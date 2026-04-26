# Phase B+ plan — polish sweep, dialogue, multi-bg doors

Three rounds, implemented in order.  Round 1 is a fast, low-risk
consolidation of everything Phase B shipped.  Round 2 unlocks NPC
interaction.  Round 3 completes the doors story with real
room-to-room transitions.

Each round ends with smoke-tests and a changelog entry; the
Builder's baseline-ROM-hash invariant is preserved throughout
(a stock Step_Playground ROM built from the platformer template
with no new modules ticked must compile to the same sha1sum).

---

## Round 1 — Polish sweep

Three small additions that round out Player 2, animations, and
the shared-rendering story.  Each piece is 20-80 lines of code,
so they ship together.

### 1a. Player 2 HP + damage

Currently only Player 1 takes damage.  Extend `damage.applyToTemplate`
to emit a second collision loop behind `#if PLAYER2_ENABLED` that
checks P2 against enemies.  Add `player2_hp`, `player2_iframes`,
`player2_dead` globals (template), and a parallel
`PLAYER2_HP_ENABLED` / `PLAYER2_MAX_HP` macro pair emitted by
the `players.player2.applyToTemplate`.

HUD: P1's hearts stay top-left.  P2's hearts render top-right
(anchored to `256 - hud_x`) so two-player games can read both
lives at a glance.  Gated by `#if HUD_ENABLED && PLAYER2_HP_ENABLED`.

Game-over condition: both players dead → blue-tint freeze.  If
one player is dead and the other alive, the dead one stops
rendering (or ghosts) — pragmatic MVP: dead players teleport
off-screen (ss_y-style sentinel) until the game restarts.
Actually simpler: when a player dies, they freeze in place
(same as one-player game-over), but the other keeps playing.
The game-over blue-tint only fires when **both** players are
dead.

Validator: `p2-hp-zero-with-damage` — P2 enabled + damage on +
P2 maxHp == 0 → error.

### 1b. Player 2 animation

Currently P2 always uses its static `player2_tiles` layout.  Add a
new animation tag `role = player2` (sits alongside existing
`player`, `enemy`, `npc`, `pickup`, `any`) on the Sprites page.
When a pupil tags `role=player2, style=walk` animation, the
server emits `anim_player2_walk_*` symbols (parallel to the
existing `anim_enemy_walk_*`) and the template's P2 render loop
picks them up the same way P1 currently uses `walk_tiles[]`.

Jump animation for P2 follows the same pattern via `role=player2,
style=jump`.

### 1c. More `(role, style)` animation pairs

Chunk B shipped `enemy + walk`.  Add `enemy + idle`, `pickup +
idle` via the same pattern.  Generalise the server's
`anim_targets` list and the template's per-frame tick advance
so adding more pairs later is mechanical (future: `npc + walk`,
`npc + idle` land with dialogue in Round 2).

Template gate pattern stays `#if ANIM_<ROLE>_<STYLE>_COUNT > 0`
per pair; the template grows ~20 lines per new pair but each
block is self-similar and scannable.

Validator: `pickup-idle-no-pickups` (warn) — idle animation
tagged but no pickup-roled sprite with matching W×H.

### 1d. Deferred

- **Per-door spawn points** (stayed in the deferred list from
  chunk C) — still deferred, needs per-tile behaviour-map metadata
  which is a bigger UI lift.
- **Direction-aware animation** (walk-left vs walk-right).
- **Per-instance animation override** — pick one animation per
  scene instance rather than "first tagged wins".

---

## Round 2 — Dialogue

NPCs that speak when the player stands next to them and presses
B.  Classic RPG interaction pattern; unlocks quest-givers,
level intros, hints.

### Scope

- New `dialogue` module (off by default).  Config:
  - `text`: string, up to 28 characters (fits on one row of the
    nametable with 2-char margin).
  - `key`: which button triggers — A or B.  B default
    (conventional NPC-talk key on the NES).
  - `proximity`: how many tiles away the player can be.  Default 2.
- Pupils tag one or more sprites as NPC on the Sprites page.
- At runtime: every frame, if any NPC is within proximity tiles
  of the player AND the trigger key was just pressed (edge), the
  text box opens.  A second press closes it.  While open, the
  player can't move.

### Font-tile convention

Text rendering needs letter glyphs in the BG CHR.  Pupils paint
their own letters at well-known positions:

- `0x41`..`0x5A` (65..90) = A..Z
- `0x30`..`0x39` (48..57) = 0..9
- `0x20` (32) = space (transparent is fine)
- `0x21` (33) = `!` (commonly needed)
- `0x2E` (46) = `.` (punctuation)

These match ASCII so converting a pupil-typed string to tile
indices is `s.charCodeAt(0)` per character, no lookup table.

Pupils don't *have* to paint every letter — unpainted indices
render as whatever art happens to be at that tile.  Validator
warns if the dialogue text contains characters whose tiles are
all-zero on the BG tileset.

### Template changes

- `dialog_open` (bool), `dialog_prev_pad` (for edge-detection),
  `dialog_text_ptr` (pointer to the current dialogue string).
- Per-frame: if `dialog_open` is true, freeze player motion and
  check for B-release + B-press to close.
- If `dialog_open` is false, scan NPC-tagged scene sprites (using
  `ss_role[i] == ROLE_NPC`), compute tile-distance from player,
  and if any is ≤ proximity AND B edge-press fired, call
  `draw_text(row, col, text)` and set `dialog_open = 1`.
- Draw-text uses the existing helper in the template (already
  there from Sprint 7's NPC snippet).

### Builder wiring

- `dialogue.applyToTemplate` emits the text as a null-terminated
  byte array: `static const unsigned char bw_dialogue_text[] = { 'H','E','L','L','O', 0 };`
  in the declarations slot, plus the per-frame dispatch in
  per_frame.
- Validator `dialogue-no-npc` (error) — module on but no NPC
  sprite.

### Phase C preview

If this round lands well, the next micro-chunk is **multi-dialogue**:
per-NPC text via a per-instance dialogue config on the scene
instance row.  Out of scope for Round 2.

---

## Round 3 — Multi-background doors

The big unlock: step onto a DOOR tile, the screen swaps to a
different room.  This is the "real" doors story deferred from
Chunk C.

### Architecture

The editor already supports multiple backgrounds in state
(`state.backgrounds[]` is an array; only background 0 is
currently emitted to `level.nam`).  Goal: when the Builder's
doors module targets background N, the server emits all
backgrounds' nametables + palette data, the template keeps a
`current_bg` global, and swap-on-door writes the new data to
PPU during a brief render-off window.

### Server changes

- `build_nam()` stays (single active-bg file is fed into
  `graphics.s`'s `load_background()` which blits the first
  background at boot).
- **New: C-emission of every background.**  Add to scene.inc:
  - `#define BG_COUNT <n>`
  - `static const unsigned char bg_nametable_0[1024] = { ... };`
  - `...` one per background.
  - `static const unsigned char bg_palette_0[32] = { ... };`
    (each background has its own universal_bg + bg_palettes +
    sprite_palettes flattened).
- `_role_code` / cell emission unchanged.

Size check: each nametable is 1024 bytes.  10 backgrounds =
10 KB of ROM.  Well within PRG budget.

### Template changes

- `current_bg` (unsigned char).  Init 0 at main().
- `load_background_n(unsigned char n)` — helper function:
  - `waitvsync()`
  - `PPU_MASK = 0`
  - Set `PPU_ADDR = 0x20, 0x00` (nametable 0 start).
  - Blit 1024 bytes from `bg_nametable_<n>[]` through `PPU_DATA`.
  - Write palette bytes via `PPU_ADDR = 0x3F, 0x00` path.
  - `PPU_SCROLL = 0; PPU_SCROLL = 0`.
  - `PPU_MASK = 0x1E`.
- On DOOR tile overlap (per-frame), call `load_background_n(
  DOOR_TARGET_BG)` + teleport player to spawn point.

Because the nametable is const data in PRG, we blit it
deterministically — no scroll state / no worries about the
transition taking more than one vblank (it does, but we don't
care: rendering is off during).

### Builder wiring

- `doors.config` gains `targetBgIdx` (int, default 1).
- `doors.applyToTemplate` emits the load-and-teleport path
  instead of the pure teleport path when `targetBgIdx >= 0`.
- The scene-instance world extends: scene sprites currently live
  on background 0 only; a future chunk will let pupils place
  scene instances per-background.  For Round 3 MVP, scene
  sprites survive across background swaps — they stay in their
  original screen positions.  Pupils can hide them manually.

### Validator

- `doors-target-invalid-bg` (error) — `targetBgIdx` is out of
  range of `state.backgrounds[]`.
- `multi-bg-no-bg-1` (warn) — doors targets bg 1 but pupil only
  has one background painted.

### Deferred from Round 3

- **Per-door target background** — today all doors share
  `targetBgIdx`.  A richer world would let each DOOR tile encode
  its target (behaviour-map metadata) — same deferral as chunk
  C.  Future micro-chunk.
- **Per-background scene sprites** — enemies / pickups attached
  to specific backgrounds.  Out of scope.
- **Transition effects** — fade / scroll-in.  Out of scope.

---

## Order + budgets

- Round 1 — polish sweep.  Three pieces in one chunk, ~150 lines
  across server + template + modules.  1 smoke-test suite.
- Round 2 — dialogue.  ~200 lines + font-tile convention docs +
  1 smoke-test suite.
- Round 3 — multi-bg doors.  ~400 lines (server emission is the
  biggest change).  1 smoke-test suite + manual browser test
  for the actual swap.

Each round verifies the byte-identical-baseline invariant holds
after its changes land.

---

## Risks

- **Template crowding.**  Every round adds `#if`-gated blocks.
  Past ~800 lines the file becomes hard to read side-by-side.
  Mitigation: each block stays commented + dedicated section
  header; pupils who eject have a clear roadmap.
- **Scene.inc bloat.**  Round 3 adds ~1 KB per background.
  Acceptable for pupil projects (rarely > 5 rooms); revisit
  only if a pupil complains.
- **Font-tile validator subtlety.**  Round 2's "did the pupil
  paint letters" check compares against empty-tile = all-zero.
  Pupils might paint in tile indices *outside* the ASCII range
  and expect those to work.  Mitigation: validator checks the
  exact character range used in the pupil's text, not all of
  A-Z.
- **Multi-bg player position wrapping.**  If player is near the
  right edge on bg 0 and teleports to a bg 1 spawn at x=200,
  no problem.  But if pupil configures a door's spawn to be
  x=180 on a bg where nothing is at (180, y) … pupils will
  discover this by playing.  Not a bug, a feature of their
  level design.
