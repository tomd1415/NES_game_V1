# Player 2 — Phase B chunk 5 plan

Answers teacher Q4 in [builder-plan.md](builder-plan.md) and the
direct pupil request. A second character controlled by a second NES
controller, rendered from a second Player-tagged sprite, with its own
start position / walk speed / jump height.

---

## 1. Scope & non-scope

**In:**

- A second character that appears on screen alongside Player 1.
- Controller 2 (`JOYPAD2` / `$4017`) drives walk + jump.
- Each player has its own typed config (startX, startY, walkSpeed,
  jumpHeight, maxHp) on `state.builder.modules.players.submodules.*`.
- Server emits a second set of `player2_*` symbols so P2 can have its
  own art, drawn from the *second* sprite tagged Player on the
  Sprites page.
- Pickup collection and win-condition triggers work for either
  player.
- Preview canvas renders P2 at its start position and lets the pupil
  drag it exactly like P1 (chunk-4 polish extended).
- Validator: Player 2 enabled but fewer than 2 sprites tagged
  Player → error, blocks Play.

**Out (deferred to later chunks):**

- Per-player walk / jump animations. P2 uses its static
  `player2_tiles` layout — no frame cycling yet. (Reusing the
  player1 animation table on P2's art would mean the tiles
  mismatch, which is worse than no animation.)
- Player-2 HUD (hearts, score counter).
- Ladder climbing for P2 — P1 gets ladders, P2 does not in this
  chunk. Simpler code and matches the classic "co-op 2-player
  platformer" vibe where only one character is acrobatic.
- Damage / HP wiring — the `maxHp` field stays in state shape so
  the future HP chunk has nowhere to grow *into*, but no runtime
  uses it yet.
- P2 in scroll mode. When `SCROLL_BUILD` is active the camera
  tracks P1 only. P2 can walk off-screen; that's a reasonable
  MVP compromise pending a proper camera-midpoint follow.
- Player-vs-player collision.

---

## 2. Data model

Under the existing `state.builder.modules.players`:

```jsonc
{
  "players": {
    "enabled": true,
    "config": { "count": 1 },   // deprecated — kept for back-compat
    "submodules": {
      "player1": { /* unchanged */ },
      "player2": {
        "enabled": false,       // opt-in
        "config": {
          "startX": 180,
          "startY": 120,
          "walkSpeed": 1,
          "jumpHeight": 20,
          "maxHp": 0             // Phase B later
        }
      }
    }
  }
}
```

`players.count` becomes advisory — the actual P2-is-on signal is
`players.player2.enabled`. Leaving the field so existing saves
don't throw on lookup.

Migration: `migrateBuilderFields` in sprites.html / index.html adds
a disabled `player2` submodule to every pre-existing `players`
node. Never overwrites if one exists.

---

## 3. Server contract (`playground_server.py`)

### Payload additions

`POST /play` body gains two optional fields (both present or both
absent):

```jsonc
{
  "playerSpriteIdx":  0,              // existing — first P1 sprite
  "playerStart":      { "x": 60, "y": 120 },
  "playerSpriteIdx2": 2,              // NEW — which sprite is P2 (role=player)
  "playerStart2":     { "x": 180, "y": 120 }
  // ...
}
```

If `playerSpriteIdx2` is an integer ≥ 0 and points to a
different sprite than `playerSpriteIdx`, the server treats P2 as
enabled for this build.

### Emission in `scene.inc`

Always:

```c
#define PLAYER2_ENABLED <0 or 1>
```

When enabled, also:

```c
#define PLAYER2_X   <start.x>
#define PLAYER2_Y   <start.y>
#define PLAYER2_W   <sprite.width>
#define PLAYER2_H   <sprite.height>
const unsigned char player2_tiles[PLAYER2_W * PLAYER2_H] = { ... };
const unsigned char player2_attrs[PLAYER2_W * PLAYER2_H] = { ... };
```

When disabled we still emit `#define PLAYER2_ENABLED 0` so the
template's `#if PLAYER2_ENABLED` gates evaluate cleanly without
compiler warnings, and nothing else is emitted. Byte-for-byte the
P1-only ROM is unchanged.

**Size sanity.** PLAYER_W × PLAYER_H is typically 4 (2×2) or 16
(4×4), so `player2_tiles + player2_attrs` add tens of bytes — well
under the MMC0 PRG budget.

---

## 4. Template changes (`builder-templates/platformer.c`)

The template is the source of truth for the Builder assembler; the
equivalent regions land in `steps/Step_Playground/src/main.c` only
when the Builder's output gets spliced in on `/play`.

### 4.1 Define `JOYPAD2`

```c
#define JOYPAD2       *((unsigned char*)0x4017)
```

Placed next to the existing `JOYPAD1` define.

### 4.2 Module-scope state

All gated behind `#if PLAYER2_ENABLED`. Mirror P1's globals so the
duplicate code is obvious when read side-by-side.

```c
#if PLAYER2_ENABLED
pxcoord_t px2;
pxcoord_t py2;
unsigned char pad2;
unsigned char prev_pad2;
unsigned char jumping2;
unsigned char jmp_up2;
unsigned char plrdir2;
//>> player2_walk_speed: How many pixels Player 2 moves each frame.
unsigned char walk_speed2 = 1;
//<<
#endif
```

Two new `//>>` regions: `player2_walk_speed`, `player2_jump_height`.
Region bodies get replaced by the Builder's `players.player2`
`applyToTemplate`, same idiom as P1.

### 4.3 Single-strobe controller read

Replace the current in-loop `pad = read_controller();` with a
helper that reads both pads in one strobe when P2 is enabled:

```c
#if PLAYER2_ENABLED
static void read_both(void) {
    unsigned char j;
    JOYPAD1 = 1; JOYPAD1 = 0;
    pad = 0; pad2 = 0;
    for (j = 0; j < 8; j++) {
        pad  = (pad  << 1) | (JOYPAD1 & 1);
        pad2 = (pad2 << 1) | (JOYPAD2 & 1);
    }
}
#endif

// inside main loop:
#if PLAYER2_ENABLED
read_both();
#else
pad = read_controller();
#endif
```

Keeps the single-player path byte-identical.

### 4.4 P2 movement logic

Inlined duplicate of P1's walk + jump + gravity block, variable
names suffixed `2`. Gated behind `#if PLAYER2_ENABLED`. **Deliberate
omissions** vs P1: no ladder support, no ceiling-bonk during jump.
See §1 for rationale.

Uses the same `behaviour_at()` for wall / platform / floor
detection, so painted Behaviour-page tiles block P2 the same way
they block P1.

### 4.5 P2 render

After P1's OAM write loop, a second loop for P2 using
`player2_tiles / player2_attrs / PLAYER2_W / PLAYER2_H`. Does not
share animation state with P1 (see §1).

### 4.6 Shared systems

Pickups and win-condition already iterate with `for (i = 0; i < NUM_STATIC_SPRITES; ...)`
and check overlap against `px, py`. Extend each to also check
against `px2, py2` when `PLAYER2_ENABLED`:

```c
// collision check, condensed:
if (overlap(px, py)  && ...) { ... }
#if PLAYER2_ENABLED
if (overlap(px2, py2) && ...) { ... }
#endif
```

This happens inside the Builder's `pickups` and `win_condition`
module outputs, not in the base template — the modules are the
right place to decide how many players to test.

---

## 5. Builder (client-side) changes

### 5.1 `builder-modules.js`

- New module entry `modules['players.player2']` mirroring `player1`'s
  config + schema.
- Its `applyToTemplate` replaces the two new `//>>` regions with
  typed values.
- `BuilderDefaults()` adds `player2: { enabled: false, config: { ... } }`.

### 5.2 Pickups + win_condition updates

- `pickups.applyToTemplate` emits the second collision loop inside
  a `#if PLAYER2_ENABLED` block.
- `win_condition.applyToTemplate` extends the trigger + all-pickups
  win checks so either player triggers win.

### 5.3 `builder-validators.js`

New validator `player2-needs-second-sprite` (error):

- Fires when `players.player2.enabled && countSpritesByRole(state, 'player') < 2`.
- Fix: "Open the Sprites page and tag a second sprite as Player".

### 5.4 Preview canvas (`builder.html`)

- `playerDragHandle()` becomes an array of handles (P1 + optional P2).
- Each handle has a kind tag (`'player1'` / `'player2'`) so drag
  writes into the right module config.
- P2 outlined in a distinct colour (suggest `--info` cyan) to
  visually separate from P1's yellow.
- `instanceAtPoint` walks handles alongside scene instances; scene
  instances win on overlap so pupils can still grab an instance on
  top of a player marker.

### 5.5 Play-button payload

When `player2.enabled && secondPlayerIdx >= 0`:

```js
payload.playerSpriteIdx2 = secondPlayerIdx;
payload.playerStart2 = { x: p2.config.startX, y: p2.config.startY };
```

`secondPlayerIdx` is the *second* sprite where `role === 'player'`
(existing `findSpriteByRole` finds the first; we'll add a
sibling helper `findSpritesByRole` that returns all indices, then
take `[1]`).

---

## 6. Risks + mitigations

- **Duplicate movement code bloat.** ~80 lines of `#if`-gated P2
  code in the template. Mitigation: keep P2 simpler than P1 (no
  ladder / ceiling) so diff is readable, and the `#if` gate keeps
  P1-only ROMs byte-identical — no silent regression.
- **Scene.inc backward compatibility.** Adding `#define
  PLAYER2_ENABLED` unconditionally could clash with pupil code
  that hand-defined the same macro. Mitigation: the name is
  namespaced (`PLAYER2_*`) and the Code page's stock `main.c` will
  gain the same gates so it matches the Builder output.
- **Scroll-mode edge case.** P2 off-screen in a scrolling world is
  ugly. Mitigation: flagged in §1 as a known limitation; a later
  chunk can add a "keep both players on screen" camera mode.
- **JOYPAD2 reads during OAM DMA.** NES DMA from the CPU can
  corrupt controller reads if OAM DMA transfer races the read. The
  stock template reads controllers before `waitvsync()`, well
  clear of DMA. Keep that ordering for both pads. No mitigation
  needed beyond the existing code path.

---

## 7. Implementation order

1. Plan doc committed (this file).
2. Server change: emit `PLAYER2_*` symbols in `build_scene_inc`
   when `playerSpriteIdx2` is present. Unit-test: POST a /play
   payload with and without P2, assert `scene.inc` shape.
3. Template change: add P2 state + movement + render, gated.
   Smoke-test that the stock template (P2 disabled) still builds.
4. Builder module `players.player2` + `BuilderDefaults` update +
   `migrateBuilderFields` update in sprites.html / index.html.
5. Assembler `applyToTemplate` for player2 + extensions to pickups
   / win_condition for dual-player overlap.
6. Validator `player2-needs-second-sprite`.
7. Builder preview canvas — P2 handle in the drag array + render
   the P2 sprite at its start position.
8. Play-button payload — include `playerSpriteIdx2` + `playerStart2`.
9. Smoke-test — headless Node build, cc65 compiles default state
   with P2 enabled (two player sprites) and disabled.
10. Changelog entry.

Step 2 (server) first because it defines the scene.inc contract
the template depends on. Step 3 (template) follows, so we can
smoke-test the C path in isolation before wiring up the Builder
UI. Steps 4-8 are client-only and can ship together.

---

## 8. Acceptance criteria

- Reload the Builder, tick Players → Player 2. A second sprite
  marker appears on the preview canvas (distinct colour) at
  `startX2 / startY2`.
- Drag the P2 marker; release; the row's x/y inputs + the
  preview stay in sync.
- Hit Play. The ROM launches in jsnes; plugging a second keyboard
  mapping (or a second NES controller via hardware) moves P2
  independently of P1 — walk left/right and jump both work.
- Paint a trigger tile; walking EITHER player onto it triggers
  the win (screen tints red, both players freeze).
- Place a pickup; EITHER player can collect it. Counter increments
  correctly; collect-all-pickups win triggers as expected.
- Remove the second Player-tagged sprite → Player 2 module shows
  `player2-needs-second-sprite` error; Play disabled until fixed
  or P2 is disabled.
- Re-test Player-1-only flow: disable P2, Play, confirm ROM is
  byte-identical to the pre-chunk-5 output.
