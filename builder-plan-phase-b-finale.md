# Phase B finale — detailed plan

Four chunks that finish Phase B of [builder-plan.md](builder-plan.md)
and pick up the highest-leverage items from [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md).
Each chunk is independently shippable; they land in order of
pupil-delight-per-risk so a pause partway through still leaves the
Builder noticeably better than it was.

Order:

1. **Chunk A — HP + Damage + HUD.**  Enemies become threatening and
   collection has a visible tally.  Self-contained, no server
   reshuffle.
2. **Chunk B — Runtime animations on scene sprites.**  The
   `role + style` tags we shipped in Phase B chunk 3 are still
   metadata-only; this wires them into emitted code.  Touches the
   server for per-role animation tables.
3. **Chunk C — Doors & scene transitions (simpler MVP).**  Pupils
   get a second screen.  Biggest complexity, so a narrow MVP first.
4. **Chunk D — Polish.**  Eject-to-Code, per-module help text,
   sprite-preview picker.  Each small, together they make the
   Builder feel finished.

---

## Chunk A — HP, damage and HUD

### Goal

Enemies that hurt the player, a visible life count, and a clean
game-over signal when HP hits 0.  Makes existing enemy placement
actually *matter* and adds the most-requested platformer mechanic.

### Scope decisions

- **HP is on Player 1 only** in this chunk.  P2 HP is a follow-up
  (same `maxHp` field already in state shape).
- **HP range 0–9.**  0 = disabled (no damage / no HUD).
- **Damage source** is every sprite tagged `ROLE_ENEMY` on the
  Sprites page — same convention as the existing walker/chaser
  loops.  No per-enemy damage-on-off toggle yet (the scene-instance
  `damagesPlayer` field stays in state for Phase C).
- **HUD is opt-in** — a separate module.  Damage works without HUD
  (pupils just see the flash + freeze at 0 HP); HUD adds visible
  hearts on the top row.
- **Heart art** comes from a pupil-tagged sprite via a new
  `ROLE_HUD` role.  Pupils tag one small sprite (ideally 1×1 or
  1×2) as HUD, the first HUD-tagged sprite becomes the heart
  icon.  Keeps the HUD's art in the pupil's hands and avoids
  seeding a font tile we don't control.

### Data model additions

```jsonc
{
  "builder": {
    "modules": {
      "damage": {
        "enabled": false,
        "config": {
          "amount": 1,
          "invincibilityFrames": 30
        }
      },
      "hud": {
        "enabled": false,
        "config": {}   // future: position, hud-sprite override
      },
      "players": { "submodules": {
        "player1": { "config": {
          "maxHp": 3    // was readOnly:true, now editable 0-9
        }}
      }}
    }
  }
}
```

### Server changes (`playground_server.py`)

- Add `ROLE_HUD = 10` to the role-code table (scene.inc & asminc).
- When a sprite is tagged `hud`, emit:

  ```c
  #define HUD_ENABLED 1
  #define HUD_W <w>
  #define HUD_H <h>
  static const unsigned char hud_tiles[HUD_W*HUD_H] = { ... };
  static const unsigned char hud_attrs[HUD_W*HUD_H] = { ... };
  ```

  Otherwise emit `#define HUD_ENABLED 0`.

### Template changes (`builder-templates/platformer.c`)

All gated behind `#if PLAYER_HP_ENABLED` + `#if HUD_ENABLED`, so
projects that don't tick damage/HUD build byte-identical to today.

1. **HP state:**

   ```c
   #if PLAYER_HP_ENABLED
   unsigned char player_hp;
   unsigned char player_iframes;
   unsigned char player_dead;
   #endif
   ```

2. **Init:** `player_hp = PLAYER_MAX_HP;` inside `main()`.

3. **Damage detection** (via a new `damage.applyToTemplate` in
   the Builder, which emits code into the `per_frame` slot):

   ```c
   if (!player_dead && player_iframes == 0) {
     for (i = 0; i < NUM_STATIC_SPRITES; i++) {
       if (ss_role[i] != ROLE_ENEMY) continue;
       if (ss_y[i] >= 240) continue;  // off-screen
       // AABB check vs (px, py, PLAYER_W*8, PLAYER_H*8)
       if (!(px + (PLAYER_W << 3) <= ss_x[i] || ...)) {
         player_hp = (player_hp > DAMAGE_AMOUNT)
                   ? (player_hp - DAMAGE_AMOUNT) : 0;
         player_iframes = INVINCIBILITY_FRAMES;
         if (player_hp == 0) player_dead = 1;
         break;
       }
     }
   } else if (player_iframes > 0) {
     player_iframes--;
   }
   ```

4. **Game-over freeze** (emitted only when damage is on):

   ```c
   if (player_dead) {
     jumping = 0; jmp_up = 0; prev_pad = 0xFF;
     walk_speed = 0; climb_speed = 0;
     PPU_MASK = 0x1F | 0x80;  // greyscale + blue emphasis = "defeated"
   }
   ```

   Note the **blue emphasis** here vs the win_condition's **red**:
   same visual vocabulary, different outcome.

5. **Invincibility flash** while `player_iframes > 0`: flicker
   the player sprite's `attr` (XOR with 0x03 to cycle palette) on
   odd frames.  Standard NES trick — no extra state, no extra OAM.

6. **HUD render** (emitted by `hud.applyToTemplate` into
   the OAM-write block):

   ```c
   #if HUD_ENABLED
   {
     unsigned char hx = 8;
     const unsigned char hy = 8;
     unsigned char h;
     unsigned char rr, cc, ht;
     for (h = 0; h < player_hp; h++) {
       for (rr = 0; rr < HUD_H; rr++) {
         for (cc = 0; cc < HUD_W; cc++) {
           ht = hud_tiles[rr * HUD_W + cc];
           OAM_DATA = hy + (rr << 3);
           OAM_DATA = ht;
           OAM_DATA = hud_attrs[rr * HUD_W + cc];
           OAM_DATA = hx + (cc << 3);
         }
       }
       hx += (HUD_W << 3) + 4;
     }
   }
   #endif
   ```

   Hearts draw in the top-left, growing right.  Uses OAM sprites
   (the only RAM we have) at `(8, 8)` spaced by sprite-width+4.

### Builder client changes

- **`damage` module:** checkbox + two config fields (amount,
  invincibility).  `applyToTemplate` emits the collision loop.
- **`hud` module:** checkbox only.  `applyToTemplate` emits the
  HUD render loop.
- **`players.player1.maxHp`:** field becomes editable (min 0,
  max 9).  When `maxHp > 0`, the template should see
  `PLAYER_HP_ENABLED = 1`.  This flag is emitted by the player
  module's `applyToTemplate` as an `appendToSlot('declarations',
  '#define PLAYER_HP_ENABLED 1')` + `#define PLAYER_MAX_HP <n>`.
- **Defaults:** `damage` and `hud` default `enabled: false` so
  existing projects don't break.  `player1.maxHp` stays at 0 by
  default (no HP system).  Ticking damage bumps maxHp to 3 if
  still 0, as a helpful nudge.

### Validators

- `damage-no-enemies` (warn) — damage ticked but no
  role=enemy sprite.
- `hud-no-sprite` (warn) — hud ticked but no role=hud sprite
  tagged on the Sprites page.
- `hp-zero-with-damage` (error) — damage ticked but player.maxHp
  is 0.  Fix message: "Raise Player 1 → Max HP above 0, or turn
  Damage off."

### Files touched

- `tools/playground_server.py` (ROLE_HUD + hud_tiles/attrs)
- `tools/tile_editor_web/builder-templates/platformer.c`
- `tools/tile_editor_web/builder-modules.js`
- `tools/tile_editor_web/builder-validators.js`
- `tools/tile_editor_web/sprites.html` (role dropdown gains "HUD")
- `tools/tile_editor_web/index.html` (same — shared role list)

### Acceptance

1. Tick damage + set maxHp=3 on P1.  Walk into a walker enemy →
   player flashes (invincibility) + HP drops to 2.
2. After 30 frames the flashing stops and another hit can happen.
3. HP hits 0 → player freezes, screen tints blue.
4. Tick HUD + tag a sprite as HUD → three hearts appear in the
   top-left.
5. Take damage → a heart disappears.
6. Defaults unchanged → single-player P1-only project still
   compiles byte-identical to the pre-chunk-A output.

---

## Chunk B — Runtime animations on scene sprites

### Goal

Enemies, pickups, NPCs all animate using their tagged walk/idle
animations.  Turns the metadata-only tagging of Phase B chunk 3
into visible motion.

### Scope decisions

- **Shared-per-role animation.**  One table per `(role, style)` —
  first matching tagged animation wins.  Scene instances whose
  sprite role matches (and whose sprite W×H matches the
  animation's) play it.  No per-instance animation override in
  this chunk (Phase C territory).
- **Two roles × three styles in MVP:** `enemy + walk`,
  `enemy + idle`, `pickup + idle`, `npc + walk`, `npc + idle`.
  Walk for moving sprites; idle for still ones.  The assembler
  picks walk if the scene instance is walking (AI = walker or
  chaser), else idle.
- **Size constraint.**  All frames of a role/style animation must
  share the same W×H — already enforced by `_resolve_animation`
  in the server.  If the pupil paints mismatched frames, those
  frames get dropped with a warning (same as today's player-walk
  behaviour).

### Server changes

- `build_scene_inc`: scan `state.animations[]` for each (role, style)
  pair in the matrix above.  Emit:

  ```c
  #define ANIM_<ROLE>_<STYLE>_COUNT  <N>
  #define ANIM_<ROLE>_<STYLE>_TICKS  <ticks-per-frame>
  #define ANIM_<ROLE>_<STYLE>_W      <w>
  #define ANIM_<ROLE>_<STYLE>_H      <h>
  static const unsigned char anim_<role>_<style>_tiles[N*W*H] = { ... };
  static const unsigned char anim_<role>_<style>_attrs[N*W*H] = { ... };
  ```

  Absent pair → `COUNT=0` stub (cc65 needs 1-byte arrays not zero).

### Template changes

- Per-instance anim state: one byte of `ss_anim_frame[]` +
  `ss_anim_tick[]` per scene sprite, already sized by
  `NUM_STATIC_SPRITES`.  Initialised to 0.
- In the static-sprites render loop, if a matching animation
  table exists for that sprite's role + style, read the tile from
  `anim_<role>_<style>_tiles[frame*W*H + r*W + c]` instead of the
  static `ss_tiles[...]`.
- Frame tick: `ss_anim_tick[i]++;` every frame; when it hits
  `TICKS`, `frame++ % COUNT`.

### Builder changes

- New helper `hasAnimation(state, role, style)` in the assembler.
- Scene `applyToTemplate` emits a tiny per-instance animation
  dispatch (mostly a no-op since the template reads the tables
  itself from `ss_role[]`).
- Validators: `enemy-walk-anim-size-mismatch` (warn) if the
  tagged walk animation's sprite size doesn't match any
  enemy-roled sprite.

### Acceptance

1. Tag an animation as `enemy + walk` with 2+ frames.  Place a
   walker enemy instance.  Hit Play.  Enemy's art cycles through
   the frames as it moves.
2. Tag a second animation as `pickup + idle`.  Place a pickup
   sprite.  The pickup idle-animates in place.
3. No tagged animation → enemies use their static `ss_tiles`
   (unchanged behaviour).

---

## Chunk C — Doors & scene transitions (MVP)

### Goal

Pupils can build a level that spans multiple "rooms".  Walking
onto a DOOR tile takes them to a chosen second background.  The
two rooms each have their own painted tiles, palettes, and
behaviour map.

### Scope decisions

- **Tile-based, not edge-based.**  Pupils paint a tile type DOOR
  on the Behaviour page; touching it triggers the transition.
  Edge-based exits (walk off the right side → next screen) is
  scrollland's job; we're not reinventing scroll here.
- **Two backgrounds only in MVP.**  `state.backgrounds[]`
  already supports more, but MVP limits to the currently-selected
  background + one target.  Doors specify `targetBgIdx`.
- **Full reload on transition.**  Cheap and correct: switch
  nametable, repaint all tiles, teleport player to a spawn
  position.  No animation on the transition itself.

### Data model

```jsonc
{
  "builder": {
    "modules": {
      "doors": {
        "enabled": false,
        "config": {
          "spawn_x_on_arrival": 24,
          "spawn_y_on_arrival": 120,
          "targetBgIdx": 1
        }
      }
    }
  }
}
```

### Server changes

- Emit *all* backgrounds' nametables instead of just the selected
  one.  `nametable_<0>[]`, `nametable_<1>[]`, etc.
- Pattern-table CHR already includes every tile, so no extra work
  there.
- Emit a `bg_count` define + a `palette_<N>[]` per background so
  palette swaps land on transition.

### Template

- `load_background_n(unsigned char n)` — copies nametable N into
  the PPU via `waitvsync()` + blit.  Similar to existing
  `load_background()` but parameterised.
- `current_bg` global.  On DOOR tile overlap, switch.
- After switch, set `px = DOOR_SPAWN_X; py = DOOR_SPAWN_Y` (from
  `doors.config`).

### Validators

- `doors-need-two-bgs` (error) — doors ticked but
  `state.backgrounds.length < 2`.
- `doors-need-door-tile` (error) — doors ticked but no DOOR
  behaviour tile painted on the source background.

### Acceptance

1. Create a second background.  Paint a DOOR tile on the first.
2. Tick Doors module → set `targetBgIdx = 1` + spawn position.
3. Play → walk into the DOOR tile → the screen swaps to the
   second background and the player teleports to the spawn point.
4. No regression for single-bg projects.

---

## Chunk D — Polish

Three small things that don't deserve their own chunk but
collectively finish the feel.

### D1. Eject-to-Code button

- New entry in the Builder's File ▾ menu: "📝 Open as Code (advanced)".
- Action: run the assembler to produce the current `main.c`,
  save it to `state.customMainC`, navigate to `code.html?stay=1`.
- Confirm dialog: "Once you hand-edit, the Builder won't re-assemble
  your game.  Continue?"
- One-way (matches teacher Q1's decision earlier).  Pupils can
  wipe `customMainC` from the Code page's Restore default to come
  back.

### D2. Per-module help text

Each module's `description` already has a paragraph.  Add an
optional `detailedHelp` field with a few more paragraphs +
example walkthrough.  Render as a ℹ️ icon next to the module
header; click to open a small popover.

### D3. Sprite-preview picker

Today the scene-instance sprite dropdown shows names.  Replace
with a grid of sprite thumbnails (already supported by
`NesRender.drawSpriteIntoCtx`).  Each thumb is ~32×32; click to
select.  Falls back to the dropdown when the pupil has many
sprites and a grid would be huge (>16).

---

## Implementation order & verification

I'll ship each chunk as a separate commit-style unit:

1. Plan doc → **this file.**
2. Chunk A implementation + smoke-test + changelog.
3. Pause, verify in browser (manual), continue.
4. Chunk B implementation + smoke-test + changelog.
5. Pause, verify, continue.
6. Chunk C implementation + smoke-test + changelog.
7. Chunk D — each polish item is tiny; land together.

Every chunk goes through `/tmp/builder-*-smoke.mjs` running the
assembler + validator + real cc65 build so regressions surface
immediately.  The single-player, P1-only, no-damage, no-HUD path
must remain byte-identical at each step — that's the invariant
that protects existing pupil projects.

## Risks

- **Combinatorial #if complexity in platformer.c.**  P1, P2, HP,
  HUD, doors all gated behind their own macros means the template
  grows dense.  Mitigation: comment every `#if` block with which
  module enables it, so pupils who eject can navigate.
- **Server emission fatigue.**  `build_scene_inc` is getting long.
  If it tops ~400 lines we should split into per-subsystem helpers
  (`_emit_player`, `_emit_anim_tables`, `_emit_hud`, etc.) — but
  not pre-emptively in this plan.
- **Acceptance drift.**  Each chunk defines clear acceptance
  criteria above; keep them in the smoke-tests so the build
  fails rather than silently regressing.
