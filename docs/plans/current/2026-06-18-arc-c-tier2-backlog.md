# Arc C — Pupil Feature Backlog (Tier 2) — Implementation Plan

> **Progress (2026-06-19):** ✅ **R-10** (character bob) and ✅ **R-4** (per-sprite
> enemy speed) shipped — see the changelog. Both render-tested
> (`render-character-bob.mjs`, `enemy-speed.mjs`), byte-identical intact.
> R-10 deviated from the plan: it's pad-driven, not `anim_frame`-driven (which
> only advances when a walk animation is assigned, so it would no-op otherwise).
> Remaining: R-3, R-7, R-8, R-9, R-6.
>
> **Scope.** The seven Tier-2 pupil feature requests from
> [`2026-06-17-web-feedback-fixes.md`](2026-06-17-web-feedback-fixes.md) Part B:
> **R-10** (character bob), **R-4** (per-sprite enemy speed), **R-3** (spawn a
> sprite on hit = T2.9), **R-7** (button → attack animation, kin T2.4), **R-8**
> (checkpoints), **R-9** (background region copy/paste), **R-6** (persistent
> hurt-effect sprite = needs R-3 + T2.10).
>
> **House style (enforced by the suite).** Modules emit *data* (`#define`s,
> `const` tables) into the four named slots; *logic* lives in the compiled
> engine `tools/tile_editor_web/builder-templates/platformer.c` behind `#if`
> gates so a no-modules ROM stays **byte-identical** to
> `steps/Step_Playground/src/main.c` (the invariant guard at
> `tools/builder-tests/run-all.mjs:481`). See the architecture review
> (`project_codegen_architecture_review.md`). New engine code must be gated by a
> macro that is *undefined* unless a module turns it on, and the macro must
> default via `#ifndef` (like `BW_APPLY_GRAVITY`, `platformer.c:175`) — never
> redefine an existing macro non-identically (cc65 errors).
>
> Each feature lands a guard in `tools/builder-tests/` (drop a `.mjs` in the
> dir — zero registration, `run-all.mjs:510` auto-discovers it) and a changelog
> entry in `docs/changelog/changelog-implemented.md`.

---

## 0. Shared map of the machinery (read once)

The five facts every feature below leans on:

1. **Slots & helpers.** `builder-assembler.js` exposes `appendToSlot(tpl, slot,
   text)` (`builder-assembler.js:71`), `replaceRegion(tpl, id, body)` (`:35`),
   and `clampInt(v, lo, hi, fallback)` (`:120`). The four slots in
   `platformer.c` are `declarations` (`:166`), `init` (`:568`), `per_frame`
   (`:975`), `vblank_writes` (`:1429`). Module order is `MODULE_ORDER`
   (`builder-assembler.js:129`): `game, globals, players, scene,
   behaviour_walls, pickups, damage, hud, doors, dialogue, events,
   win_condition`. Modules return a *transformed string*, not a slot object.

2. **Schema field shape.** `{ key, label, type, min, max, step, help, options }`
   where `type ∈ 'int'|'bool'|'enum'|'sprite'|'animation'|'text'`; defaults live
   in the module's `defaultConfig`, not per-field (canonical example: the
   `globals` int field at `builder-modules.js:108`, the `game` enum at `:55`).
   A `bool` field is just `{ key, label, type:'bool', help }`.

3. **Player render / OAM build.** The player's per-tile OAM Y/X are written in
   the player loop at `platformer.c:1020-1045` (`sy = py + (r << 3)` non-scroll,
   `world_to_screen_y(...)` under `SCROLL_BUILD`). The walk/jump animation tick
   that drives `anim_frame` is `platformer.c:826-834`; `anim_mode` is selected
   at `:789-802` (0=static, 1=walk, 2=jump). The `per_frame` slot (`:975`) runs
   *before* the OAM build, so a module can set a flag there that the engine
   reads when building OAM.

4. **Scene sprites.** Per-instance arrays `ss_x[]/ss_y[]` (mutable),
   `ss_w/ss_h/ss_offset/ss_role/ss_flying`, `ss_anim_frame/ss_anim_tick` are
   emitted into `scene.inc` by `playground_server.py build_scene_inc`
   (`:1361-1372`) from the POST `sceneSprites:[{spriteIdx,x,y}]` array
   (`:1325`), which is **index-aligned** with the `scene` module's
   `config.instances:[{id,spriteIdx,x,y,ai}]`. `NUM_STATIC_SPRITES` gates every
   loop. `ROLE_ENEMY=2`, `ROLE_PICKUP=6` etc. (`scene.inc`, server `:1107`).
   OAM cap: 64 hardware sprites = 256 bytes; the engine guards every scene write
   with `if (oam_idx <= 252)` (`platformer.c:1339,1368`) and parks unused slots
   at Y=0xFF (`:1391`).

5. **Scene AI is JS-emitted per-instance.** Walker/chaser C is built as a string
   array in the `scene` module's `applyToTemplate` (`builder-modules.js:404-442`)
   and appended to `per_frame`; the shared `bw_sprite_blocked()` solid-probe
   helper goes to `declarations` (`:448-496`). Critically, **the step amount is
   a literal `1`** (`ss_x[i] += 1`, `:418`) — R-4 parametrises exactly these
   string lines, no engine change needed.

**Test plumbing.** Tests bootstrap the browser JS in Node with
`globalThis.window = globalThis; new Function(fs.readFileSync(f))()` over
`['sprite-render.js','builder-assembler.js','builder-modules.js',
'builder-validators.js']` then `window.BuilderAssembler.assemble(state, tpl)`
(`all-modules.mjs:22-27,153`). A state is a plain object with `sprites`,
`backgrounds[].{nametable,behaviour}`, `behaviour_types`, and `builder:
window.BuilderDefaults()`; flip flags under `state.builder.modules.*`. The
**static-guard idiom** (`run-all.mjs:375`, `chunk-a-hp-hud.mjs:132`) reads a
source file and asserts a regex with `[label, regex]` tables and anchored
`/^#define …$/m`. The **all-modules** end-to-end POSTs the assembled C to a
throwaway `playground_server.py` `/play` and asserts `r.ok` (real cc65 build).
**There is no jsnes render harness yet** — the "Arc-A render harness" is a
*proposed* deliverable (`docs/plans/current/2026-06-18-next-phase-suggestions.md`);
the closest existing technique is ROM-byte decode in `dialogue-font.mjs:78-113`
(`Buffer.from(r.rom_b64,'base64')`, parse iNES header, read CHR). **Plan below
targets the static-guard + all-modules/compile path for every feature**, and
flags where a future render harness would add value.

Run: `node tools/builder-tests/run-all.mjs` from repo root (needs
`cc65/ca65/ld65 + make + python3` on PATH; spawns its own servers; ~2 min). No
`package.json` — plain `node`.

---

## R-10 — Character bob when walking  *(Quick)*

A 1px sprite-Y nudge on alternate walk-animation frames while the player is
moving and grounded. Pure data-in/logic-in-engine; smallest possible change.

**Root cause / current state.** No bob exists. The player OAM Y is written at
`platformer.c:1031` (`sy = py + (r << 3)`) / `:1023` (`world_to_screen_y`); the
walk cycle counter is `anim_frame` advanced at `:826-834`; `anim_mode == 1`
means walking (`:809`). The `globals` module (`builder-modules.js:93`) is the
right home for a game-wide toggle — its `applyToTemplate` already emits
`#define`s into `declarations` (`:147`).

**Files that change**
- `tools/tile_editor_web/builder-modules.js` — `globals` module: schema + emit.
- `tools/tile_editor_web/builder-templates/platformer.c` — the player OAM Y write.
- `tools/builder-tests/round1-polish.mjs` (or a new `bob.mjs`) — guard.

**Schema / module additions.** Add a `bool` field to `globals.schema`
(`builder-modules.js:107`) and a default to `defaultConfig` (`:100`):
```js
// defaultConfig:
bobWhenWalking: false,
// schema (append after jumpSpeedPx):
{ key: 'bobWhenWalking', label: 'Bob up and down when walking', type: 'bool',
  help: 'The player hops 1 pixel on alternate walk frames — a little life ' +
        'in the step. Only while walking on the ground.' },
```
In `globals.applyToTemplate` (`:141`), append one define to `declarations`:
```js
if (c.bobWhenWalking) {
  template = A.appendToSlot(template, 'declarations',
    '#define BW_BOB_WHEN_WALKING 1');
}
```

**Engine change (data-driven).** In `platformer.c`, default the macro near the
other `#ifndef` gates (after `:186`):
```c
#ifndef BW_BOB_WHEN_WALKING
#define BW_BOB_WHEN_WALKING 0
#endif
```
Then in the player OAM loop, bias `sy` by the low bit of `anim_frame` when
walking & grounded. Both the scroll and non-scroll Y writes need it
(`:1023` and `:1031`). Compute a `bob` offset once before the `r/c` loops at
`:1020`:
```c
#if BW_BOB_WHEN_WALKING
        /* 1px hop on odd walk frames; only while walking on the ground. */
        bob = (anim_mode == 1 && !jumping && (anim_frame & 1)) ? 1 : 0;
#endif
```
and add `+ bob` to the two `sy = …` expressions (guard the add with the same
`#if` or make `bob` a file-scope `unsigned char bob = 0;` declared at `:165`
beside `sx/sy` so the non-bob build still compiles with `bob` unused — simplest
is to declare `bob` always and only *set* it under `#if`, leaving the `+ bob`
unconditional; `bob` stays 0 so the baseline is byte-identical). Because the add
is `py + (r<<3) + bob` with `bob==0` when the macro is off, **the no-module ROM
is unchanged** — verify against the byte-identical invariant.

> Subtlety to honour the baseline: declaring `unsigned char bob = 0;` at file
> scope is a new symbol → it could shift the ROM. Confirm with the invariant
> guard; if it drifts, instead scope `bob` entirely inside `#if
> BW_BOB_WHEN_WALKING` blocks (declare a local in the loop body and write
> `sy = py + (r<<3) + bob;` only inside the `#if`, with a plain
> `sy = py + (r<<3);` in the `#else`). The `#if/#else` form guarantees identity.

**Test.** Static guard: with `bobWhenWalking:true`, `assemble()` output contains
`#define BW_BOB_WHEN_WALKING 1`; with it false/absent, it does **not** (the
present-when-on / absent-when-off pair, per `chunk-a-hp-hud.mjs:124-130`). Add a
`run-all.mjs` invariant that `platformer.c` contains `BW_BOB_WHEN_WALKING` and
the `#ifndef` default (so the engine side can't be deleted). The byte-identical
invariant already covers "off = baseline".

**Effort:** Quick. **Dependencies:** none.

---

## R-4 — Enemy / per-sprite speed  *(Medium; ties T2.5/T2.8)*

Per-instance `speed` (px/frame) for walker/chaser AI, replacing the hard-coded
`+= 1`. B-1 already landed the prospective-position probe (`bw_sprite_blocked`),
so the step composes cleanly.

**Root cause.** The walker/chaser steps are literal `1`s emitted as strings in
the `scene` module: `ss_x['+i+'] += 1` (`builder-modules.js:418`),
`-= 1` (`:421`), and the chaser's `+1/-1` compares + steps (`:429-438`). There
is **no per-instance speed field** — instances are `{id,spriteIdx,x,y,ai}`
(`:391`). Because the AI is JS-generated per instance, **this is entirely a JS
change** — no engine or scene.inc edit required.

**Files that change**
- `tools/tile_editor_web/builder-modules.js` — `scene` AI emission.
- `tools/tile_editor_web/builder.html` — the scene per-instance editor (it
  `customRender`s the instance list, `builder-modules.js:394`) gains a speed
  control. *(Editor UI lives in builder.html; confirm the instance-row
  renderer there and add a number input next to the AI dropdown.)*
- `tools/builder-tests/` — new `enemy-speed.mjs` guard.

**Schema / module additions.** Extend the per-instance object to
`{id, spriteIdx, x, y, ai, speed}` (document at `:391`). Read + clamp it in the
loop (`:404`):
```js
const speed = A.clampInt(inst.speed, 1, 4, 1);   // px/frame; 1 = today's feel
```
Then parametrise every step. Walker (replace `:418` and `:421`):
```js
parts.push('                else ss_x[' + i + '] += ' + speed + ';');
// …and the reverse branch:
parts.push('                else ss_x[' + i + '] -= ' + speed + ';');
```
Chaser is more careful — the existing `+1 <= px` / `>= px+1` comparisons
(`:429,431,434,436`) must use `speed` so a fast chaser doesn't oscillate around
the player. Replace the literal threshold and step with `speed`:
```js
parts.push('        if (ss_x[' + i + '] + ' + speed + ' <= px) {');
parts.push('            if (!bw_sprite_blocked(ss_x['+i+'], ss_y['+i+'], ss_w['+i+'], ss_h['+i+'], 0)) ss_x['+i+'] += ' + speed + ';');
parts.push('        } else if (ss_x[' + i + '] >= px + ' + speed + ') {');
parts.push('            if (!bw_sprite_blocked(ss_x['+i+'], ss_y['+i+'], ss_w['+i+'], ss_h['+i+'], 1)) ss_x['+i+'] -= ' + speed + ';');
// …same for the Y pair against py.
```

> **Correctness note:** `bw_sprite_blocked` probes only the tile **1px** ahead
> (the leading edge), not `speed` px ahead. At `speed >= 2` a fast enemy can
> step its body partly *into* a wall before the probe trips on the next frame.
> For Tier 2 this is acceptable (the enemy reverses one frame late, visually
> fine at speed 2-3). To do it properly, generalise the helper to take a
> `step` argument and probe `sx + wpx + step - 1` (mirror the player's
> `px + (PLAYER_W<<3) + walk_speed - 1` at `platformer.c:584`). Keep that as a
> follow-up; clamp `max:4` to bound the overshoot. This generalisation is the
> natural shared step toward **T2.8** (enemy paths).

**Editor UI.** In the scene instance-row renderer in `builder.html`, add a small
`<input type="number" min="1" max="4">` (or a 4-option select) labelled "Speed",
wired to write `inst.speed` and re-serialise like the AI dropdown does. Only
meaningful for `ai !== 'static'`; grey it out for static instances.

**Test.** `enemy-speed.mjs`: build a state with one walker instance `speed:3`,
assert the emitted C contains `ss_x[0] += 3` and `ss_x[0] -= 3` and **not**
`+= 1` for that instance; a chaser `speed:2` asserts the `px + 2` threshold.
Add to all-modules' fixture a `speed` on its walker (`all-modules.mjs:100`) so
the end-to-end build exercises it. (Optional future: a render-harness run
asserting the enemy advances 3px/frame.)

**Effort:** Medium. **Dependencies:** B-1 (done) for the probe.

---

## R-3 — Spawn a sprite when you hit a block/sprite  *(Medium; = T2.9)*

The foundational **spawn machinery**: a pool of runtime-activatable OAM sprites
that the engine can turn on in response to a collision. R-6 builds directly on
this. This is the biggest design lift in Arc C.

**Root cause.** No spawn effect exists anywhere. Behaviour reactions are
**collision verbs only** — `REACTION_VERBS = ['ignore','block','land','land_top',
'bounce','exit','call_handler']` (`behaviour.html:1375`), stored as a flat
per-sprite map `behaviourId → verb` (`behaviour.html:719`), and they are
emitted as a *data table the pupil must call themselves* — no module reads them
to generate behaviour (`builder-modules.js` does not reference the reaction
table). All scene sprites are **statically** declared in `scene.inc`
(`build_scene_inc:1361`); there is no notion of a dynamically created entity.

**Design decision — where spawns live.** Don't try to grow the static `ss_*`
arrays (they're `const`/server-generated and index-aligned with placements).
Instead add a **separate fixed spawn pool** in the engine, gated by a module
macro. This keeps the OAM cost opt-in and the baseline byte-identical.

**Files that change**
- `tools/tile_editor_web/builder-templates/platformer.c` — the spawn pool +
  activation + render.
- `tools/tile_editor_web/builder-modules.js` — a new `spawn` config surface
  (simplest: extend the `damage` module first for R-6, then expose a general
  trigger spawn). For R-3's "hit a block" we also need a behaviour-tile hook.
- `tools/tile_editor_web/behaviour.html` — a "spawn" reaction effect (the verb
  list at `:1375`) *or* a new SPAWNER behaviour-type. See trade-off below.
- `tools/playground_server.py` — emit the spawn sprite's tiles/attrs table
  (reuse the `_resolve_tagged_animation` path so the spawned art comes from a
  tagged animation).
- `tools/builder-tests/` — `spawn.mjs` guard + all-modules wiring.

**Engine: the spawn pool (data-driven).** Pick a small cap (NES OAM is 64
sprites; the player+scene already consume slots). Cap concurrent spawns at e.g.
**4** single-tile (or `SPAWN_W×SPAWN_H`) effects. Emit into `declarations` only
when enabled:
```c
#if BW_SPAWN_ENABLED
/* Fixed pool of runtime-activated effect sprites. Activated by a
 * collision (engine sets active[k]=1, x/y), drawn after scene sprites,
 * subject to the same oam_idx<=252 guard. art = SPAWN_TILES/SPAWN_ATTRS. */
#define SPAWN_MAX 4
unsigned char spawn_active[SPAWN_MAX];
unsigned char spawn_x[SPAWN_MAX];
unsigned char spawn_y[SPAWN_MAX];
unsigned char spawn_ttl[SPAWN_MAX];   /* 0 = lives until off-screen / forever */
unsigned char spawn_frame[SPAWN_MAX];
unsigned char spawn_tick[SPAWN_MAX];
#endif
```
`SPAWN_TILES[]`, `SPAWN_ATTRS[]`, `SPAWN_W`, `SPAWN_H`, `SPAWN_FRAME_COUNT`,
`SPAWN_FRAME_TICKS` come from the server (a tagged animation — see below).
Init the pool (zero `spawn_active`) in the `init` slot path / `main()` reset.
**Activation** happens in `per_frame` (the slot at `:975`, before OAM build):
the collision that fires the spawn (R-3: player overlaps a SPAWNER tile or a hit
sprite; R-6: damage hit) finds a free slot (`for k: if(!spawn_active[k]) …`) and
sets `active=1, x, y, ttl, frame=0`. **Render** after the scene-sprite loop
(after `:1386`), tick the animation and emit OAM under the same `oam_idx<=252`
guard, decrement `ttl`, deactivate at 0.

**Two ways to expose the trigger** (pick per sub-feature):
1. **R-6 (hurt effect)** — easiest: the `damage` module sets the spawn on the
   existing `dmg_hit` (`builder-modules.js:648`). No behaviour-tile work. **Do
   this first** (see R-6).
2. **R-3 (hit a block/sprite)** — needs a tile or sprite trigger. The cleanest
   pupil-facing option is a new **SPAWNER behaviour reaction**: add `'spawn'` to
   `REACTION_VERBS` (`behaviour.html:1375`) *and* its id to the three synced
   places (`steps/Step_Playground/src/collision.h` verb ids, `playground_server.py`
   `REACTION_VERB_IDS` ~`:1459` and the C `REACT_*`). But the reaction table is
   currently *advisory* (pupil-called) — so for an MVP that "just works", a
   simpler path is a dedicated **block-hit check in a small `spawn` module**:
   when the player's leading tile is a chosen behaviour id (e.g. reuse TRIGGER=5
   or add a SPAWNER type), activate a pool slot. Adding a behaviour TYPE is the
   more honest model but costs the 3-bit id widening (ids are capped 0-7, all
   built-ins 0-6 taken, 7 is the custom slot — `behaviour.html:663`,
   `playground_server.py` masks `& 0x07`). **Recommendation:** ship R-6's
   damage-driven spawn first (no behaviour change), then do R-3 as a
   `spawn` module that reads a "spawn when player touches <behaviour tile>"
   config and emits a `behaviour_at`-based check into `per_frame` (mirrors how
   the `doors` module checks `behaviour_at(...) == BEHAVIOUR_DOOR`,
   `builder-modules.js:809`). That avoids touching the 3-bit id space.

**Server: the spawn art.** Reuse `_resolve_tagged_animation(state, role, style)`
(`playground_server.py:1021`) with a new style (e.g. `role='any', style='effect'`
or a dedicated `spawn` role) to emit `SPAWN_TILES/SPAWN_ATTRS/SPAWN_*` exactly
like the enemy-walk path emits `ANIM_ENEMY_WALK_*`. This means the pupil tags an
animation as the spawn art on the Sprites page (see R-6/R-7 style additions).

**NES limits to honour.** 64 OAM sprites total / 8 per scanline. `SPAWN_MAX 4` ×
`SPAWN_W*SPAWN_H` tiles, plus the existing `oam_idx<=252` guard on each write,
keeps overflow safe. Document that many concurrent spawns + a busy scene will
drop sprites (the engine already parks overflow at Y=0xFF).

**Test.** `spawn.mjs` static guard: enabling spawn emits `#define
BW_SPAWN_ENABLED 1`, `SPAWN_MAX`, and the pool declarations; disabled = none
(baseline). all-modules: enable a spawn-on-damage and assert the build is `r.ok`
(real cc65). The activation/render is hard to assert statically beyond "the C
compiles and the symbols are present" — flag a **render-harness** follow-up
(spawn a sprite on a scripted hit, assert a non-0xFF OAM entry appears).

**Effort:** Medium (the pool + render is the bulk). **Dependencies:** none to
build the pool; the *art* path shares the tagged-animation mechanism with R-6/R-7.

---

## R-7 — Press a button to play an attack animation  *(Medium; kin T2.4)*

Bind a controller button (A or B) to a one-shot "attack" animation that
overrides walk/idle while playing.

**Root cause.** `anim_mode` is movement-driven only (`platformer.c:789-802`);
`A` (0x80 in the pad byte... actually UP=0x08 is jump here) — the only button
read for gameplay is **UP=jump** (`:690`) and **B** for dialogue (in the
dialogue module). No module binds a button to an animation. Good news: the
**`attack` style already exists** in the Sprites page —
`ANIM_STYLES = ['walk','jump','idle','die','attack','custom']`
(`sprites.html:2749`) — it's currently metadata only (migration comment
`sprites.html:2855`). The server already has the generic
`_resolve_tagged_animation` (`playground_server.py:1021`) to emit any
`role+style` table.

**Files that change**
- `tools/tile_editor_web/sprites.html` — add an "attack" **assignment slot**
  (the assignment loops are hard-coded to `['walk','jump']` at `:4082,4106,
  4164,4215,4274` and the storage object `animation_assignments` at `:2656`;
  add an `attack` key). The `attack` *style tag* already exists, so the
  derivation `syncAnimationAssignmentsFromTags` (`:4163`) just needs `attack`
  added to its kind list.
- `tools/playground_server.py` — emit `ATTACK_FRAME_COUNT/TICKS` +
  `attack_tiles/attack_attrs` via `_resolve_animation(state, 'attack', pw, ph)`
  (mirror walk/jump at `:1131-1132`), and `#define ATTACK_BUTTON` from the
  module config.
- `tools/tile_editor_web/builder-modules.js` — a new `attack` config (button
  choice) on the `players.player1` module (or a small dedicated `attack`
  module). Emits `#define BW_ATTACK_BUTTON 0x40` (B) / `0x80` (A).
- `tools/tile_editor_web/builder-templates/platformer.c` — the attack mode +
  edge check.
- `tools/builder-tests/` — `attack.mjs`.

**Schema / module additions.** Add to `players.player1.schema`
(`builder-modules.js:186`) an enum:
```js
{ key: 'attackButton', label: 'Attack button (plays the Attack animation)',
  type: 'enum', options: [
    { value: 'none', label: 'None' },
    { value: 'a',    label: 'A button' },
    { value: 'b',    label: 'B button' } ] }
```
In `applyToTemplate` (`:232`), when `attackButton !== 'none'` and an attack
animation is assigned, emit to `declarations`:
```js
A.appendToSlot(template, 'declarations',
  '#define BW_ATTACK_BUTTON ' + (attackButton === 'a' ? '0x80' : '0x40'));
```
(NES pad bit order from `read_controller` at `:305`: A=0x80, B=0x40, Select,
Start, Up=0x08, Down, Left, Right=0x01 — confirm bit positions against the
existing strobe loop; the engine reads MSB-first into bit7..bit0.)

**Engine change (data-driven).** Default `#ifndef BW_ATTACK_BUTTON` to 0 and
gate the attack animation behind `#if ATTACK_FRAME_COUNT > 0 && BW_ATTACK_BUTTON`.
Add an `attack_playing` + `attack_frame/tick` state (file scope, gated). In the
animation-mode select block (`:789`), give attack **highest priority** (above
jump) and make it **one-shot**: on a `BW_ATTACK_BUTTON` edge-press
(`(pad & BW_ATTACK_BUTTON) && !(prev_pad & BW_ATTACK_BUTTON)`) set
`attack_playing = 1; attack_frame = 0`; while playing, set `anim_mode = 3`,
advance its own tick, and clear `attack_playing` when `attack_frame` wraps past
`ATTACK_FRAME_COUNT`. Add the `anim_mode == 3` branch to the
tiles/attrs/count/ticks selector at `:804-819`:
```c
#if ATTACK_FRAME_COUNT > 0 && BW_ATTACK_BUTTON
        if (anim_mode == 3) {
            anim_tiles = attack_tiles; anim_attrs = attack_attrs;
            anim_frame_count = ATTACK_FRAME_COUNT; anim_frame_ticks = ATTACK_FRAME_TICKS;
        } else
#endif
        if (anim_mode == 2) { … }   /* existing jump/walk/static chain */
```
Reuse `prev_pad` (already maintained at `:697`) for the edge. Baseline stays
identical because every line is `#if`-gated on macros that are 0/undefined
without the module.

> **Design-with-T2.4 note.** T2.4 is "press a button to *fire*" (spawn a
> projectile). The button-edge read here is the same primitive as a fire
> trigger. If R-3's spawn pool lands first, the attack animation can *also*
> activate a spawn slot on the edge, unifying R-7 + T2.4 + the `attack` style
> into one "button → animation [+ optional projectile]" surface. Design the
> `attackButton` config to be reusable by a future `fire` module.

**Test.** `attack.mjs`: tag an attack animation + set `attackButton:'b'`; assert
emitted C has `#define BW_ATTACK_BUTTON 0x40` and the server emits
`ATTACK_FRAME_COUNT` > 0; assert the engine has the `anim_mode == 3` branch
(invariant guard on `platformer.c`). Off = no `BW_ATTACK_BUTTON` define.

**Effort:** Medium. **Dependencies:** none required; *optionally* composes with
R-3 spawn for a projectile.

---

## R-8 — Checkpoints  *(Medium)*

A checkpoint behaviour tile that saves a respawn `(x,y)`; on death, respawn
there with restored HP instead of the permanent freeze.

**Root cause.** No respawn anywhere (`grep checkpoint/respawn` = 0 hits in the
editor/engine). The `damage` module's death path **permanently freezes**:
`if (player_dead) { jumping=0; jmp_up=0; prev_pad=0xFF; walk_speed=0;
climb_speed=0; }` (`builder-modules.js:657-660`), set when
`if (player_hp == 0) player_dead = 1;` (`:652`). Behaviour tiles are a `number[][]`
grid of ids 0-7 read via `behaviour_at(col,row)` (`collision.h`); the built-in
TRIGGER (id 5) has no built-in effect.

**Files that change**
- `tools/tile_editor_web/builder-modules.js` — `damage` module: respawn state +
  checkpoint capture + death→respawn.
- `tools/tile_editor_web/builder-templates/platformer.c` — (mostly module-emitted
  C; possibly a small engine reset helper).
- `tools/tile_editor_web/behaviour.html` — surface a "checkpoint" use of a tile.
- `tools/builder-tests/` — `checkpoint.mjs`.

**Design — which tile is the checkpoint.** Two options:
1. **Reuse TRIGGER (id 5)** with a `damage`-module sub-option "TRIGGER tiles act
   as checkpoints". No id-space change. But TRIGGER already drives the default
   win condition (`win_condition.defaultConfig.behaviourType:'trigger'`,
   `builder-modules.js`), so reusing it conflicts on projects that use TRIGGER
   to win.
2. **Add a CHECKPOINT behaviour type.** Cleaner semantics, but ids are capped
   0-7 (built-ins 0-6, custom is 7 — `behaviour.html:663`, server masks
   `& 0x07`). No free slot without widening the 3-bit id space across JS +
   Python + C.

**Recommendation:** ship as a **`damage`-module checkpoint behaviour** keyed off
a **configurable behaviour id** (default: the DOOR tile id=4, which is rarely
the death surface, or a new sub-config). Simplest robust MVP: a `checkpoint`
bool on the `damage` module that treats **DOOR tiles** (id=4) as checkpoints
when the player's centre overlaps one — reusing the exact `behaviour_at` pattern
the `doors` module uses (`builder-modules.js:809`). (If doors are also in use,
expose the id as a config so the pupil picks a free behaviour tile.)

**Schema / module additions.** Add to `damage.defaultConfig` (`:605`) and
`schema` (`:609`):
```js
// defaultConfig:
checkpoints: false, respawnHp: 1,
// schema:
{ key: 'checkpoints', label: 'Checkpoints (respawn instead of game over)',
  type: 'bool', help: 'Touch a checkpoint tile to save your spot. On death ' +
  'you restart there with some HP instead of the game ending.' },
{ key: 'respawnHp', label: 'HP restored on respawn', type:'int', min:1, max:9,
  help: 'How much health you get back when you respawn at a checkpoint.' },
```

**Engine / module C.** Emit into `declarations` (when `checkpoints`):
```c
#define BW_CHECKPOINTS 1
#define BW_RESPAWN_HP <n>
```
Add respawn state — `unsigned char cp_x, cp_y, cp_set;` — gated `#if
BW_CHECKPOINTS` (emit into `declarations`; init `cp_set=0, cp_x=PLAYER_X,
cp_y=PLAYER_Y` in `init`). In `per_frame` (before the death-freeze block), the
`damage` module emits:
```c
#if BW_CHECKPOINTS
        /* Save the checkpoint when the player's centre is on a checkpoint tile. */
        if (behaviour_at((px + (PLAYER_W<<2)) >> 3, (py + (PLAYER_H<<2)) >> 3) == BEHAVIOUR_DOOR) {
            cp_x = (unsigned char)px; cp_y = (unsigned char)py; cp_set = 1;
        }
#endif
```
Then **replace the permanent-freeze branch** (`:657`) with a respawn when
checkpoints are on:
```c
        if (player_dead) {
#if BW_CHECKPOINTS
            /* Respawn at the last checkpoint with restored HP. */
            px = cp_x; py = cp_y;
            player_hp = BW_RESPAWN_HP; player_dead = 0; player_iframes = INVINCIBILITY_FRAMES;
            jumping = 0; jmp_up = 0;
#else
            jumping = 0; jmp_up = 0; prev_pad = 0xFF;
            walk_speed = 0; climb_speed = 0;
#endif
        }
```
(Under `SCROLL_BUILD`, `px/py` are `pxcoord_t` u16 — store `cp_x/cp_y` as
`pxcoord_t` too; for the non-scroll u8 case the casts above are fine. Mirror the
type with the `pxcoord_t` typedef at `:135`.)

> **Pairs with B-4.** The death tint (`PPU_MASK = 0x1E | 0x80`, engine-owned at
> `platformer.c:990`) should only fire on a *final* game-over. With checkpoints
> on, death is transient, so the tint must be suppressed when `BW_CHECKPOINTS`
> respawns. Guard the death-tint `#if` (`:987-993`) so it doesn't tint when a
> respawn just cleared `player_dead`. (Cleanest: the tint reads `player_dead`,
> which the respawn clears the same frame — verify the order so no blue flash.)

**Editor.** In `behaviour.html`, add a one-line hint near the DOOR/TRIGGER tile
palette that "with Checkpoints on (Damage module), these tiles save your spawn."
If you add a real CHECKPOINT type later, register it in the three synced places
(`behaviour.html:663`, `playground_server.py` `BUILTIN_BEHAVIOUR_NAMES`,
`builder-validators.js:49`).

**Test.** `checkpoint.mjs`: `checkpoints:true, respawnHp:2` → assert `#define
BW_CHECKPOINTS 1`, `#define BW_RESPAWN_HP 2`, and the respawn branch (`player_hp
= BW_RESPAWN_HP; player_dead = 0`) is present; off → the permanent-freeze branch
is present and `BW_CHECKPOINTS` absent. all-modules build stays `r.ok`.

**Effort:** Medium. **Dependencies:** B-4 (death tint, done) — coordinate the
tint suppression.

---

## R-9 — Background region copy/paste  *(Medium; pure editor)*

Marquee region select on the nametable canvas, a clipboard of placed cells'
`{tile, palette}`, paste at the cursor. Zero engine/codegen — `index.html` only.

**Root cause.** `index.html` has flood-fill (`ntFloodFill`, `:3607`), a palette
rectangle (`applyPaletteRect`, `:3523`), and single-tile **pixel** copy
(`tileClipboard` = CHR pixels of one tile, `:2699/4204/4212`, keys C/V) — but
**no marquee select / paste of placed nametable cells** (grep `marquee/region/
ntClipboard` = 0 hits).

**Files that change**
- `tools/tile_editor_web/index.html` — only this file.

**The data model to operate on.** The nametable is per-background:
`activeBg().nametable[y][x]` where each cell is `{ tile, palette }`
(`emptyNametable` at `:1630`, accessor `activeBg()` at `:1675`). Dimensions:
`cols = SCREEN_W * dimensions.screens_x`, `rows = SCREEN_H * dimensions.screens_y`
(`SCREEN_W=32, SCREEN_H=30`, `:1605`). Always guard `if (row && row[x])` (ragged
multi-screen rows).

**Implementation.**
1. **New tool.** Add `<option value="select">Select region (drag)</option>` to
   `#nt-tool` (`:1273`) and extend the persisted-mode whitelist (`:4340`) to
   include `'select'`. Add a cursor CSS rule for
   `.nt-canvas-wrap[data-mode="select"] #nt-canvas { cursor: crosshair; }`
   (beside `:803`).
2. **Drag-select.** Reuse the existing rubber-band scaffold (`ntRectStart`/
   `ntRectEnd`, `:3508`) — add parallel `ntSelStart/ntSelEnd` (or branch on tool
   inside the same vars). In `mousedown` (`:4355`), on `tool === 'select'` set
   `ntSelStart = ntSelEnd = ntPointToCell(e)` and early-return (mirror the
   `palette-rect` branch). In `mousemove` (`:4391`) update `ntSelEnd`,
   `renderNametable()` then draw a marquee overlay (clone `drawNtRectOverlay`,
   `:3553`, but **don't** snap to 2×2 — copy is tile-accurate). In `mouseup`
   (`:4408`) **freeze** the selection into a persistent `ntSelection` rect;
   **do not mutate** the model.
3. **Copy.** New `ntRegionClipboard` var (separate from `tileClipboard`!,
   `:2699`). On a copy action (a button + a key that isn't C/V — e.g. a "Copy
   region" button, or Ctrl+C scoped to select mode in the keydown handler
   `:4498`), read `activeBg().nametable[y][x]` over `ntSelection`, deep-clone
   each `{tile, palette}` into a 2-D array, record its `w×h`.
4. **Paste.** New `pasteNtRegion(anchorX, anchorY)` modelled on `applyPaletteRect`
   (`:3523`): `pushUndo()` (no args, full-state snapshot, `:2034`), write
   `cell.tile`/`cell.palette` over the destination rect (guarding `row[x]`),
   then `markDirty()` (`:2067`) and `renderNametable()` (`:3393`). Anchor at the
   last-hovered cell (track `{x,y}` from the `nt-info` readout at `:4372`) or a
   dedicated "paste here" click.

> **NES attribute caveat:** palette is stored per-cell but is really a
> **2×2 attribute-block** property on hardware — every existing palette tool
> snaps to `& ~1` (`normalisedBlockRect`, `:3514`). A tile-accurate paste whose
> origin isn't 2-block-aligned can land two source palettes in one destination
> attribute block (last write wins). **Decision:** copy/paste tiles at single-cell
> granularity (tiles are per-cell on hardware — always correct), and either
> (a) snap paste origin to even/even for predictable palettes, or (b) paste
> palette too and document the attribute-block approximation. Recommend (a):
> snap the paste anchor to `& ~1` like the rest of the palette tooling, matching
> pupil expectations set by the existing tools.

**Test.** This is editor-only DOM logic with no codegen, so the static-guard and
compile harnesses don't reach it. Add a **lightweight headless DOM check** in
`run-all.mjs` style: load `index.html`'s inline script under a minimal `window`
stub and unit-test `pasteNtRegion` writes the expected cells into a synthetic
`activeBg().nametable` (the existing tests already `new Function(...)` browser
JS; the nametable functions are pure given a `state`). At minimum, add a
`run-all.mjs` syntax/inline-script guard (it already syntax-checks every inline
`<script>`, `:51`) — confirm the new functions parse. Manual QA: select a
region, copy, paste elsewhere, undo (one step), save round-trips.

**Effort:** Medium (UI plumbing). **Dependencies:** none.

---

## R-6 — Persistent hurt-effect sprite on hit  *(Medium; depends on R-3 + T2.10)*

On damage, spawn a sprite that plays a looping animation and stays (a hit spark /
"ouch" effect). This is **R-3's spawn pool, triggered by the `damage` hit, with
non-player animation (T2.10)**.

**Root cause.** No spawn-on-hit exists. The `damage` module already detects the
hit (`dmg_hit = 1` at `builder-modules.js:648`) but only subtracts HP and sets
i-frames; it has no effect-sprite. Non-player animation already exists for
enemies/pickups (`ANIM_ENEMY_*`, render at `platformer.c:1296`), proving the
tagged-animation → OAM path (T2.10 is essentially this generalised to an effect
role).

**Files that change**
- Everything R-3 touches (the spawn pool), plus:
- `tools/tile_editor_web/builder-modules.js` — `damage` module: activate a spawn
  slot on `dmg_hit`.
- `tools/tile_editor_web/sprites.html` — add an `effect`/`hurt` **role** or
  **style** so the pupil can tag the effect art (`ANIM_ROLES`/`ANIM_STYLES` at
  `:2747-2758` — note `ANIM_ROLES` lacks a `decoration`/`effect` entry; add one
  to the array + its `_VALUES` Set + `_LABELS` map, the three synced spots).
- `tools/playground_server.py` — emit the effect art via
  `_resolve_tagged_animation(state, '<effect-role>', 'idle')` (or a `hurt`
  style), feeding `SPAWN_TILES/SPAWN_*` from R-3.

**Module additions.** Add to `damage.schema` (`:609`):
```js
{ key: 'hurtEffect', label: 'Show a hit effect when an enemy hurts you',
  type: 'bool', help: 'Spawns a small effect sprite at the hit for a moment.' }
```
When on (and an effect animation is tagged), the `damage` module: (1) requires
`BW_SPAWN_ENABLED` (turn the R-3 pool on); (2) on `dmg_hit`, emit the activation
into the existing hit branch (`:648`):
```c
            if (dmg_hit) {
                player_hp = …; player_iframes = INVINCIBILITY_FRAMES;
                if (player_hp == 0) player_dead = 1;
#if BW_SPAWN_ENABLED
                { unsigned char k; for (k = 0; k < SPAWN_MAX; k++) {
                    if (!spawn_active[k]) {
                        spawn_active[k] = 1; spawn_x[k] = (unsigned char)px;
                        spawn_y[k] = (unsigned char)py;
                        spawn_ttl[k] = 30; spawn_frame[k] = 0; spawn_tick[k] = 0;
                        break;
                    } } }
#endif
            }
```
"Stays" = either `spawn_ttl=0` (lives until off-screen, the prompt's "plays an
animation that stays") or a long TTL; expose a "fades after N frames vs stays"
choice. The pool render (R-3) loops `SPAWN_FRAME_COUNT` so it animates.

**Test.** Extend `spawn.mjs`: `damage` with `hurtEffect:true` emits the
`spawn_active[k] = 1` activation inside the `dmg_hit` branch and pulls in
`BW_SPAWN_ENABLED`; all-modules builds `r.ok`. Render-harness follow-up: scripted
enemy contact → assert a spawn OAM entry (non-0xFF Y) appears for ~30 frames.

**Effort:** Medium (small once R-3 exists — it's the trigger + an art role).
**Dependencies:** **R-3 (spawn pool) is a hard prerequisite**; shares the
tagged-animation art path with R-7.

---

## Recommended build order (value-per-effort)

Ordered to front-load cheap pupil-visible wins, then build the spawn
infrastructure once and reuse it.

1. **R-10 — Character bob** *(Quick).* One bool, ~6 lines of engine, trivially
   guarded. Highest value-per-effort; ships a visible feature in one session.
   No dependencies. *(Already slotted into "Session 2" of the feedback plan.)*

2. **R-4 — Enemy speed** *(Medium, but JS-only).* No engine/server edit — pure
   string parametrisation in the `scene` module + one editor input. High value
   (pupils repeatedly ask), low risk. B-1's probe is already in. First concrete
   slice of T2.5/T2.8.

3. **R-9 — Region copy/paste** *(Medium, isolated).* Pure `index.html`; touches
   nothing the other features touch, so it can run **in parallel** with the
   engine work. Big authoring-time win.

4. **R-7 — Button → attack animation** *(Medium).* Independent of the spawn pool
   (it only plays an animation). Introduces the **button-edge primitive** and
   exercises the **tagged-animation art path** + a **new assignment slot** — both
   reused by R-3/R-6 and the future T2.4 fire. Build it before spawn so the art
   pipeline (tagging a non-walk animation, server emitting its table) is proven.

5. **R-3 — Spawn pool** *(Medium, foundational).* The one genuinely new engine
   subsystem. Build the **pool + activation + render + OAM guard** here. Ship the
   first trigger as the simplest one (damage-driven, i.e. fold into R-6) to avoid
   the behaviour-id-space question; add a tile/block trigger as a follow-up
   `spawn` module that reuses the `doors`-style `behaviour_at` check.

6. **R-6 — Hurt effect on hit** *(Medium, cheap on top of R-3).* Literally R-3's
   pool + the `damage` hit trigger + an effect art role. Do it **with/just after
   R-3** — it's the natural first consumer that justifies the pool.

7. **R-8 — Checkpoints** *(Medium).* Self-contained in the `damage` module +
   engine death path; coordinate the death-tint suppression with B-4. Independent
   of the spawn work, so it can interleave anywhere after R-4.

**Suggested sessions:** (S1) R-10 + start R-4. (S2) finish R-4 + R-9 in parallel.
(S3) R-7 (proves art path). (S4) R-3 + R-6 together. (S5) R-8.

---

## Shared infrastructure (build once, reuse)

- **Spawn pool (R-3) → R-6, and feeds T2.4.** The fixed `spawn_*[SPAWN_MAX]`
  pool + activation-by-collision + post-scene OAM render is the single most
  reused new thing. R-6 is just "activate it on the damage hit"; T2.4 (fire) is
  "activate it on a button edge"; a future moving projectile adds velocity to the
  pool. **Design the activation as a tiny helper** (`spawn_emit(x, y, ttl)`) so
  every trigger calls one function.

- **Tagged-animation art path (server) → R-3, R-6, R-7.** `_resolve_tagged_
  animation(state, role, style)` (`playground_server.py:1021`) already emits any
  `role+style` table; R-3/R-6 (effect art) and R-7 (attack art) all ride it. The
  one-time cost is adding the new role/style strings to the **three synced spots**
  in `sprites.html` (`ANIM_ROLES`/`ANIM_STYLES` + `_VALUES` + `_LABELS`,
  `:2747-2758`) and a `_resolve_*` call server-side. The `attack` style already
  exists; add one effect role/style for R-3/R-6.

- **Button-edge read (R-7) → T2.4 fire.** `(pad & BTN) && !(prev_pad & BTN)`
  using the already-maintained `prev_pad` (`platformer.c:697`). The
  `attackButton` enum config is reusable as a generic "action button" picker.

- **`behaviour_at`-based tile trigger (doors precedent) → R-3 block-hit, R-8
  checkpoints.** The `doors` module's `behaviour_at(centre) == BEHAVIOUR_X`
  check (`builder-modules.js:809`) is the template for "player touches a special
  tile" without growing the 3-bit behaviour-id space — both R-3 (spawn on block)
  and R-8 (checkpoint tile) use it.

- **`#if`-gated engine + `#ifndef` default macro → every feature.** The
  byte-identical invariant (`run-all.mjs:481`) is the contract: each feature's
  engine code is dead (preprocessed out) unless its module emits the enabling
  `#define`, and each macro self-defaults via `#ifndef` (pattern at
  `platformer.c:175`). New `run-all.mjs` invariants should assert the *engine*
  carries the gated logic (the project is migrating logic out of module strings
  into `platformer.c` — architecture review).

- **Test scaffolding → every feature.** Copy `chunk-a-hp-hud.mjs` (state factory
  → `assemble` → `[label, regex]` table with anchored `/^#define …$/m`, plus
  present-when-on / absent-when-off pairs), and wire each new module into
  `all-modules.mjs`'s `makeEverythingState()` so the all-modules cc65 build
  exercises it. **Gap to flag:** the proposed jsnes render harness would let
  R-3/R-6/R-10 assert *visible* behaviour (OAM Y offset for bob; a spawned
  non-0xFF OAM entry); until it exists, those stay "compiles + symbols present".
