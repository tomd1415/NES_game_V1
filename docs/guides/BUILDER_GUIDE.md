# Builder guide

The **🧱 Builder** is one of the five editor pages, alongside
Backgrounds, Sprites, Behaviour, and Code.  It lets pupils build a
compilable NES game by ticking *modules* and filling in attributes
rather than writing C.  This document describes every module that
ships today, the shared machinery underneath them, and the
conventions pupils need to know.

For the underlying design + history see
[builder-plan.md](builder-plan.md) (the original proposal) and the
chunk-by-chunk plan + implementation docs it cross-references.

---

## 1. How the Builder works

The Builder's state lives at `state.builder` inside each project's
save blob (same localStorage as every other editor page).  Each
module has an `enabled` flag and a `config` object with its own
typed fields.

Pressing **▶ Play** triggers the following pipeline:

1. The Builder's client-side **assembler**
   ([builder-assembler.js](tools/tile_editor_web/builder-assembler.js))
   loads `builder-templates/platformer.c` and walks every enabled
   module in a deterministic order, asking each to contribute
   either a named-region substitution (`//>> id … //<<`) or an
   appendage into a named insertion slot (`//@ insert: <slot>`).
2. The shared **Play pipeline**
   ([play-pipeline.js](tools/tile_editor_web/play-pipeline.js))
   takes the assembler output, derives player / scene sprites
   from the Builder state, injects sensible fallbacks (a stub
   player sprite when the project has none, a default Builder
   tree when the project was created before the Builder shipped)
   so brand-new / empty projects still compile, then POSTs the
   whole payload to `/play`.  Every editor page calls the same
   helper, so clicking Play on Backgrounds / Sprites / Behaviour /
   Builder / Code all produce the same ROM from the same state.
3. [playground_server.py](tools/playground_server.py) emits the
   scene include files (`scene.inc`, `palettes.inc`, etc.), swaps
   `main.c` for the Builder's version, runs `cc65`, and hands
   back the ROM bytes.
4. One of three things happens depending on the pupil's chosen
   run mode:
   - **In browser** — the shared
     [emulator.js](tools/tile_editor_web/emulator.js) opens a
     `<dialog>` hosting jsnes and runs the ROM in-page.  Same
     dialog + keyboard mapping on every page.
   - **Download** — the `⬇ ROM` button saves the `.nes` bytes
     to disk so the pupil can open them in any external
     emulator.
   - **Local (fceux)** — the server writes the just-built ROM
     to `_play_latest.nes` and launches fceux against that
     file.  Requires fceux on the playground-server host; the
     option is greyed out when `/health` reports fceux is
     unavailable.

There's a **Problems panel** on the right of the Builder page that
lists validator failures (errors block ▶ Play; warnings don't).
Every emitted source line comes from a tiny pure function —
there's no `eval`, no stringy template logic — so a teacher who
wants to audit what the Builder did can open the Preview panel and
read the `main.c` the pipeline just compiled.

### Insertion slots

The template defines four named slots where modules can contribute:

- **`//@ insert: declarations`** — just before `main()`, for
  module-scope `#define`s and global state.
- **`//@ insert: init`** — inside `main()`, just before the `while
  (1)` loop, for one-off startup code.
- **`//@ insert: per_frame`** — inside the main loop, after the
  built-in walk / jump / gravity block, before `waitvsync()`.
  **Do not call PPU-register helpers that internally
  `waitvsync()` from this slot** (see §4 below).
- **`//@ insert: vblank_writes`** — right after the main
  `waitvsync()`, before OAM writes.  Rendering is effectively off
  (we're inside vblank) so VRAM writes are safe.  Use this slot
  for nametable / palette updates that must land in one frame.

### `//>>` regions in the template

The template keeps a few classic pupil-tunable knobs inside
`//>> id: hint` / `//<<` markers — the Builder's player module
rewrites them when its config changes.  Regions in play today:

- `walk_speed`, `climb_speed`, `jump_height`, `player_start`
  (Player 1 knobs).
- `player2_walk_speed`, `player2_jump_height`, `player2_start`
  (Player 2 knobs).
- `camera_deadzone` (only meaningful in `SCROLL_BUILD` projects).
- `gravity` (scene-sprite gravity loop).

---

## 2. Modules reference

Every module has a **tick-box** that turns it on or off.  Modules
that are off contribute nothing to the emitted `main.c`.

### `game`
Picks the player-physics style.  Two options:

- **Platformer** (default) — side-on, gravity, jumping, ladder
  climbing.  The original Step 1 / SMB-style mental model.
- **Top-down** — Pokémon / Zelda-style four-way movement.  No
  gravity, no jump, ladder tiles are walkable floor.  Wall and
  solid-ground tiles still block movement on every axis.

Both styles share the same `platformer.c` template.  Picking
top-down emits `#define BW_GAME_STYLE 1` into the declarations
slot; the template's `#if BW_GAME_STYLE == 0 / 1` blocks gate
the platformer-only pieces (gravity loop, jump state machine,
ladder probe, scene-sprite gravity) and the top-down equivalents
(4-way step + collision).  All other modules — damage, dialogue,
doors, pickups, HUD, win conditions, scene-instance AI — work
identically in either style; only player physics swaps.

### `players` + `players.player1` + `players.player2`
Configure the main character(s).  Fields per player: `startX`,
`startY`, `walkSpeed`, `jumpHeight`, `maxHp`.  Player 2 is a
submodule of Players; ticking it adds a second character driven by
controller 2 (see §3 for key mapping).

Both players share the jump / walk / gravity / wall-collision
logic.  The template duplicates the P1 block variable-for-variable
for P2 behind `#if PLAYER2_ENABLED`.

Max HP > 0 combined with the **Damage** module below enables the
HP system.

### `scene`
Explicit sprite placement.  A scene instance is `{spriteIdx, x, y,
ai}` — `spriteIdx` points at a sprite definition (same sprite can
appear multiple times), `x/y` are pixel coordinates, `ai` is
`static` / `walker` / `chaser`.

Leaving the list empty auto-places one of every non-player sprite
so quick-and-dirty projects still work.

The **Preview canvas** (built into the module body) draws every
placement on top of the selected background; click an empty area
to drop a new instance, drag an existing one to move it, drag the
Player 1 / 2 markers (yellow / cyan outline) to set their start
position.

### `damage`
Enemies with `role = 'enemy'` hurt the player(s) on touch (AABB
collision).  Config: `amount` (HP lost per touch) and
`invincibilityFrames` (player can't be hit again for N frames).
Screen tints blue-grey when HP reaches 0 — pairs with
win_condition's red tint so the two end-states are visually
distinct.

### `hud`
Draws hearts across the top of the screen — left-anchored for P1,
right-anchored for P2.  Needs a sprite tagged **HUD** on the
Sprites page; the first HUD-tagged sprite is the heart icon.

### `pickups`
Sprites tagged `pickup` vanish on AABB overlap with either player.
A counter `bw_pickup_count` / `bw_pickup_total` is emitted so
win_condition can wait for "all collected".

### `behaviour_walls`
Informational module — the stock template already respects the
Behaviour page's painted `solid_ground` / `wall` / `platform` /
`ladder` tiles.  The validator nags the pupil if they haven't
painted any walls yet.

### `doors`
Walk onto a tile painted **Door** on the Behaviour page and
either:

- **Same-room teleport** — set Target background to **-1** (the
  default).  Player teleports to the configured spawn X/Y.
- **Room-to-room transition** — set Target background to any
  valid index in `state.backgrounds[]`.  The PPU nametable swaps
  to that background during vblank and the player teleports to
  the spawn point.

All doors share the same (spawn, target) in this version.
Per-door configuration is a future upgrade (it needs behaviour-map
per-tile metadata).

### `dialogue`
NPC speech boxes.  Press **B** near an NPC-tagged sprite (within
`proximity` tiles of the player's centre) to pop up text rows at
the bottom of the screen.  Press B again to close.  See §4 for
the **critical font-tile convention** — pupils have to paint
letter glyphs on the Backgrounds page for text to render.

Extra config:

- **Lines 1–3** (`text`, `text2`, `text3`) — up to 3 rows of
  text.  Trailing-empty lines drop, so leaving line 2 and 3
  blank still gives a single-row dialog (matches pre-3.2
  behaviour exactly when only line 1 is filled).  Each line is
  capped at 28 characters.
- **Pause while open** (`pauseOnOpen`, default on) — freezes both
  players in place (zeros `walk_speed` / `climb_speed`, cancels
  any in-progress jump, swallows the current pad edge) while the
  box is up, restoring the snapshot on close.  Untick for a
  floating-hint style where the player keeps moving.
- **Auto-close after N frames** (`autoClose`, 0–240, default 0 =
  off) — counts down once per `per_frame` tick and closes the box
  when it hits zero.  B still closes early even when a timer is
  set, so pupils who read fast aren't stuck waiting.

**Per-NPC dialogue text.**  In the Builder's Scene module, each
NPC scene-instance gains a "💬 says:" text input below its row.
Filling it in overrides the module-level shared text for THAT
NPC only (single line up to 28 characters); leaving it blank
falls back to the shared multi-line text.  Pupils can mix —
have most NPCs share a default greeting and one or two named
NPCs say something specific.

Emitted macros control the extra code paths so the baseline ROM
stays byte-identical when dialogue is off:
`BW_DIALOG_PAUSE` (0/1) gates the save/restore + freeze block,
`BW_DIALOG_AUTOCLOSE` (0–240) gates the timer decrement,
`BW_DIALOG_ROW_COUNT` (1–3) controls the vblank loop, and
`BW_DIALOG_PER_NPC` (0/1) gates the per-NPC override table.

### `win_condition`
How the pupil's game ends.  Two types:

- **Reach a tile** — touch a tile painted the chosen behaviour
  kind (Trigger / Door / …).
- **Collect every Pickup** — depends on the Pickups module's
  counter reaching its total.

Either way the screen tints red-grey, the players freeze, and the
HUD (if on) stays visible.

---

## 3. Controller mapping

The browser emulator wires two pads from one keyboard:

|            | D-pad                         | A (jump) | B   | Start   | Select        |
| ---------- | ----------------------------- | -------- | --- | ------- | ------------- |
| Player 1   | Arrow keys                    | `F`      | `D` | `Enter` | `Right Shift` |
| Player 2   | `I` / `J` / `K` / `L`         | `O`      | `U` | `1`     | `2`           |

Classic NES emulator "player 2" cluster — none of the P2 keys
collide with P1's.  The Help dialog (`?`) inside the Builder has
the same table rendered with `<kbd>` chips; the emulator's own
status strip shows only the P1 row when a single-player ROM is
running.

---

## 4. The dialogue font-tile convention

**This is the single most-asked question about Dialogue**, so it
gets its own section.

Dialogue renders text one tile per character.  The NES is
hardware — it has no font.  Text on the screen is just a pattern
of BG tiles selected from the pupil's CHR.  The Builder converts
the pupil's typed string to a sequence of tile indices using the
ASCII values of each character:

- `A`..`Z` → BG tile indices `0x41`..`0x5A`
- `0`..`9` → BG tile indices `0x30`..`0x39`
- space → `0x20`
- `.` / `!` → `0x2E` / `0x21`

**To make dialog readable, pupils paint letter-shaped art at these
tile indices on the Backgrounds page**.  If they type `HELLO` but
haven't painted tiles at `0x48 0x45 0x4C 0x4C 0x4F`, the text box
appears as a row of whatever those tile indices happen to contain
(empty, duplicated ground-tile art, whatever).

Pupils don't have to paint every letter — unpainted indices just
render as the existing tile art at that index (or empty if it's
blank).

### How the dialog PPU writes work

Originally the dialogue module called the template's
`draw_text()` helper from the `per_frame` slot.  `draw_text()`
internally calls `waitvsync()` + toggles `PPU_MASK`, and because
`per_frame` runs mid-frame, the main loop's later `waitvsync()`
then waited a *second* time — producing a one-frame sprite
hiccup.  A second bug followed the fix: the clear path stamped
tile `0x20` (space) across the row, which permanently erased the
background that sat behind the text (you saw a "transparent"
stripe that grew every time the box opened).  A short-lived
attempt read the nametable back out of VRAM via `PPU_DATA` and
stashed it in RAM, but the buffered-read semantics + cc65
quirks around the required dummy read made the restore
unreliable in practice.

The current clear path restores every cell from
`bg_nametable_0[row * 32 + col]` — the ROM-resident copy of the
first background that `scene.inc` already ships in every
Builder build.  No PPU reads, no saved buffer in RAM, no
vblank-cycle budget concerns.  The caveat is multi-background
games: the restore always uses bg 0, so if a pupil leaves
dialogue open while walking through a door the cleared row will
show tiles from the starting background instead of the current
one.  Default settings (`pauseOnOpen = true`) make that
impossible because the player can't move while the box is up.

The current implementation splits the work:

1. `per_frame` detects the B edge-press near an NPC and sets a
   pending-command byte (`bw_dialog_cmd` = 1 for draw, 2 for
   clear).
2. `vblank_writes` (the new slot) consumes the byte inside the
   main vblank window and writes PPU_DATA directly.  No
   `waitvsync()` round-trip, no `PPU_MASK` toggle — we're
   already in vblank.

The regression-guard smoke test (see §6) asserts that the emitted
code does **not** call `draw_text()` / `clear_text_row()` from
per_frame; if someone re-introduces that pattern the test fails.

---

## 5. Tagged animations

Any animation on the Sprites page can carry a `role` + `style`
tag (Round 3 of Phase B).  The Builder's server emission picks up
specific `(role, style)` pairs and emits per-role animation
tables; the template cycles them at runtime:

| Role      | Style | What happens                                                                        |
| --------- | ----- | ------------------------------------------------------------------------------------ |
| `player`  | walk  | P1 uses the tagged walk cycle when walking (auto-wired via `animation_assignments`). |
| `player`  | jump  | P1 uses the tagged jump cycle when airborne.                                         |
| `player2` | walk  | P2 uses the tagged walk cycle when walking.                                          |
| `enemy`   | walk  | Every enemy scene instance whose sprite size matches the animation cycles frames while the walker/chaser AI is moving it. |
| `enemy`   | idle  | Same for enemies that don't move (tagged as `static` in the scene).                  |
| `pickup`  | idle  | Pickup sprites idle-animate (e.g. coins bobbing).                                     |

Frame sizes must match.  Frames of different sizes in one
animation are silently dropped server-side, same as the classic
player walk/jump animation contract.

---

## 6. Testing and verification

The Builder ships with a regression test suite at
[tools/builder-tests/](tools/builder-tests/).  Run it from the
repo root:

```
node tools/builder-tests/run-all.mjs
```

What it does:

1. `node --check` on every JS module (standalone files —
   `storage.js`, `feedback.js`, `sprite-render.js`,
   `builder-assembler.js`, `builder-modules.js`,
   `builder-validators.js`, `play-pipeline.js`, `emulator.js`,
   `tour.js` — plus the inline `<script>` blocks inside
   builder.html / sprites.html / index.html / behaviour.html /
   code.html) + `py_compile` on playground_server.py.
2. **Fix-specific regression guards** — cheap regex
   assertions so pupil-reported bugs we've already fixed don't
   silently come back:
   - OAM DMA pipeline still in use (both templates write to
     `oam_buf[oam_idx++]` and issue a single `OAM_DMA = 0x02`
     inside vblank — no per-byte `OAM_DATA = x` assignments).
   - Ladder climb probes the target cell's behaviour and lets
     LADDER override SOLID_GROUND in both the climb-up and
     climb-down branches.
   - `playground_server.py` native-fceux launch uses
     `_play_latest.nes` (the ROM the current `/play` just
     built) rather than the stale shared `game.nes`.
   - `play-pipeline.js` `capabilities()` probes `/health`, not
     `/capabilities` (the wrong endpoint silently 404'd and
     disabled the Local-fceux option everywhere).
3. **Byte-identical-baseline invariant** — the stock
   `steps/Step_Playground/src/main.c` ROM hash must match after
   swapping in the Builder's template with no modules ticked.
   Guards the "Builder additions are strictly gated" rule.
4. Each smoke-test file in `tools/builder-tests/*.mjs`:
   - `preview.mjs` — sprite-render + same-sprite-reuse.
   - `player2.mjs` — Player 2 end-to-end.
   - `chunk-a-hp-hud.mjs` — HP + damage + HUD.
   - `chunk-b-anim.mjs` — runtime animations.
   - `chunk-c-doors.mjs` — teleport doors.
   - `round1-polish.mjs` — P2 HP + P2 anim + enemy/pickup idle.
   - `round2-dialogue.mjs` — dialogue (with regression guards
     against the `draw_text` pattern, space-fill clear, and
     VRAM-read snapshot — all three earlier bugs).
   - `round3-multi-bg.mjs` — multi-background doors.
   - `shared-play.mjs` — the `play-pipeline.js` helper: empty
     state produces a valid ROM, missing Builder tree is
     migrated non-destructively, `customMainC` / `customMainAsm`
     overrides bypass the assembler, and identical state from
     any page yields an identical payload.

Each smoke file can also run on its own (`node
tools/builder-tests/round2-dialogue.mjs`).  They launch their
own throwaway Playground Server on a unique port (18768-18792)
and exit 0 on success, non-zero on any failed assertion.

**All suites must pass before any Builder change ships** —
anything less and the byte-identical-baseline invariant is at
risk, which protects every existing pupil project.

---

## 7. Contributing a new module

If you're adding a new module:

1. **Data model** — add a `state.builder.modules.<id>` entry in
   `BuilderDefaults()` (module disabled by default for back-compat)
   and back-fill it in the `migrateBuilderFields` helpers on
   sprites.html and index.html.
2. **Module definition** — add `modules['<id>']` to
   [builder-modules.js](tools/tile_editor_web/builder-modules.js)
   with `label`, `description`, `defaultConfig`, `schema` (typed
   fields) and an optional `applyToTemplate(template, node, state)`
   transform that returns a new template string.
3. **Assembly order** — add the id to `MODULE_ORDER` in
   [builder-assembler.js](tools/tile_editor_web/builder-assembler.js)
   at the right position (earlier modules can't see later
   modules' declarations).
4. **Validation** — add a small function to the array in
   [builder-validators.js](tools/tile_editor_web/builder-validators.js)
   with a clear `message` + `fix` + optional `jumpTo`.
5. **Documentation** — add a row to §2 above + update the
   tests reference in §6 if you added a smoke suite.
6. **Tests** — add a `.mjs` file to
   [tools/builder-tests/](tools/builder-tests/).  At minimum:
   assembler-level output checks (does the emitted C contain the
   expected markers?) + an end-to-end `/play` build.

Keep the byte-identical-baseline invariant holding at every step:
a disabled-by-default new module MUST NOT change the output ROM
for existing projects that don't tick it.  The runner enforces
this automatically.

---

## 8. Known limitations

- **Per-door config** — doors module still uses a single config
  object today.  Per-tile metadata (each painted DOOR tile having
  its own destination) is a future UI upgrade; per-NPC dialogue
  shipped in Phase 3.3.
- **No audio** — waits on the FamiStudio engine chunk.
- **Scrolling + multi-background** — `SCROLL_BUILD` projects
  can still use doors, but the camera follow snaps to the new
  room with no transition.  Minor visual quirk, not a breaker.
- **Player-vs-player collision** — not implemented.  P1 and P2
  can overlap freely.
- **Select tool resize handles** — the Sprites-page Select tool
  supports marquee + delete + drag-to-move + clipboard copy/paste,
  but resizing a selection by dragging a handle isn't wired yet.
  Filed as a follow-up.
- **Vertical scrolling** — the project's `NES_MIRRORING: 1`
  (horizontal arrangement) lets `$2800` mirror `$2000`, which
  rules out tall worlds with a unique top/bottom nametable.
  Pupils building horizontal scrollers are unaffected; if you
  want a tall world, that needs a different mirroring choice
  (one-way rebuild).

See the `Deferred from …` sections in
[changelog-implemented.md](changelog-implemented.md) for the full
running list and context.
