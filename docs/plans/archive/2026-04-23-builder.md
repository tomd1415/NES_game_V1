# Module-based code builder — detailed plan

A fifth editor page, tentatively **🧱 Builder**, that lets pupils build
a working NES game by **ticking modules and filling in attributes**
rather than writing C.  The module selections are assembled into a
compilable `main.c` by a deterministic algorithm; conflicts are flagged
with clear fix-up instructions before Play is enabled.

This is the feature the pupils keep asking for — an even simpler,
more reliable alternative to the Code page.

---

## 1. Motivation

**Said (multiple pupils, paraphrased):**
> *The code page is great for exploring, but I just want to pick a
> platformer, say how many players, say walk + jump use these
> animations, drop some enemies in, and hit play.  I don't want to
> read C to do that.*

The Code page's **Guided mode** already locks everything except a
handful of regions, which softens the edges — but the pupil still
has to *find* and *read* C.  Even the snippet picker presumes a
cursor position in C.  The Builder page should need **no C reading**
for the common cases.

The parallel goal is **reliability**.  Today a pupil who fiddles
with a region in Guided mode can still wedge the build with a bad
expression.  The Builder only lets them touch typed inputs (numbers,
sprite pickers, dropdowns), so the assembled output is
compilable-by-construction.

---

## 2. What's already there — reuse inventory

Before designing anything new, an honest stock-take.  This plan is
smaller than it looks because it mostly glues existing pieces
together.

| Piece                       | Where                                     | What the builder uses it for                                                            |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `state.template`            | sprites / index state                     | Platformer vs top-down seed defaults.                                                   |
| `state.movement`            | sprites state                             | Selects gravity+jump vs 4-way code path in `main.c`.                                    |
| Sprite `role`               | `state.sprites[i].role`                   | Identifies which sprites are Player / Enemy / NPC / Pickup / Projectile / Decoration.   |
| `animation_assignments`     | sprites state (`walk`, `jump`)            | Which animation plays when the player walks / jumps.                                    |
| Behaviour-map tile types    | `state.bg_behaviour[bgIdx]`               | SOLID_GROUND, PLATFORM, LADDER, HAZARD, DOOR, EXIT (teacher-extensible).                |
| Region markers in `main.c`  | `//>> id: hint … //<<`                    | Where typed values get injected.                                                        |
| Snippet library             | `snippets/*.c` with JSON header           | Each snippet already declares `regions` + `tags`.  Builder picks snippets by tag.       |
| `ROLE_*` / `ss_role[]`      | emitted by `build_scene_inc()`            | Generated C can loop over sprites by role without the pupil touching C.                 |
| `/play` endpoint            | `tools/playground_server.py`              | Build-and-run pipeline is unchanged; builder just posts its own assembled `main.c`.     |
| Per-lesson `main.c` bodies  | `lessons/*.c`                             | Pattern for a "complete compilable `main.c` with JSON header" we can copy.              |
| Code page Restore / Switch  | `code.html` behaviour                     | Same idioms (snapshot-before-replace, confirm-on-discard) apply to Builder ↔ Code jumps. |
| Tile picker / sprite picker | existing `.tp-*` and sprite-list widgets  | Reuse verbatim for "which sprite is the player / enemy / door?" UI controls.            |
| Auto-complete hints         | `HINT_SYMBOLS` in `code.html`             | Builder doesn't need them, but the assembled C can be opened in the Code page for tweaks. |

In short: **role tags, regions, snippets, and the behaviour-map
already classify *what* a pupil's game contains.**  The Builder adds
the *declarative layer* on top and the *assembler* that stitches it
into compilable code.

---

## 3. High-level approach

The pupil's game is described by a **module tree** — a JSON object
attached to the existing `state` blob as `state.builder`.  Each
module has:

- an **id** (stable string),
- an **enabled** flag,
- a **config** object of typed fields,
- optional **submodules** (same shape, recursively).

The Builder page is a tree-view UI that edits that JSON in-place.

A pure-JS **assembler** turns the tree into a `main.c` body by:

1. Picking a **base template** (platformer or top-down starter).
2. For every enabled module, expanding its **snippet template(s)**
   and substituting placeholders with the module's config values.
3. Concatenating the results into the base template's named regions
   (init code, per-frame code, declarations, etc.).

A separate **validator** walks the tree before build and returns a
list of problems (`"Player is enabled but no sprite has the Player
role"`), each with a one-sentence fix.  Play is greyed out until
there are zero problems.

The resulting `main.c` is posted to the existing `/play` endpoint
exactly the way the Code page does it today.  The build pipeline
doesn't change.

---

## 4. Data model

Added to `state`:

```jsonc
{
  // ...existing keys...
  "builder": {
    "version": 1,
    "modules": {
      "game": {
        "enabled": true,
        "config": {
          "type": "platformer"  // "platformer" | "topdown"
        }
      },
      "players": {
        "enabled": true,
        "config": {
          "count": 1            // 1 or 2
        },
        "submodules": {
          "player1": {
            "enabled": true,
            "config": {
              "spriteIdx": 0,
              "startX": 60,
              "startY": 155,
              "walkSpeed": 2,
              "jumpHeight": 20,
              "maxHp": 3
            },
            "submodules": {
              "walk_anim": { "enabled": true, "config": { "animationId": 1 } },
              "jump_anim": { "enabled": true, "config": { "animationId": 2 } },
              "take_damage": {
                "enabled": true,
                "config": { "invincibilityFrames": 60, "knockback": 4 }
              }
            }
          },
          "player2": { "enabled": false, "config": { /* same shape */ } }
        }
      },
      "enemies": {
        "enabled": true,
        "config": {},
        "submodules": {
          "walker": {
            "enabled": true,
            "config": {
              "spriteIdx": 4,
              "speed": 1,
              "flipAtEdge": true,
              "damagesPlayer": true
            }
          },
          "chaser": {
            "enabled": false,
            "config": { /* ... */ }
          }
        }
      },
      "doors": { /* ... */ },
      "pickups": { /* ... */ },
      "events": { /* ... */ },
      "win_condition": {
        "enabled": true,
        "config": { "type": "reach_exit_tile" }
      }
    }
  }
}
```

**Why a tree?**  Several of the pupil's asks are naturally nested —
*"Player module could be made up of smaller modules that the user can
select to turn on and off."*  A flat list would collapse that to
checkbox spam; the tree keeps "Player → Take damage → how much
knockback?" visually clustered.

**Why id-keyed?**  Arrays would make it harder for the assembler and
validator to cross-reference (`modules.players.submodules.player1
references modules.enemies.submodules.walker.config.damagesPlayer`).
String ids are stable across sessions and easy to deep-merge when we
add new module types in later phases.

**Versioning.**  `builder.version` is the schema version.
`migrateBuilderState()` (new helper in index.html + sprites.html) will
up-version old saves the way `migrateState()` already does for the
rest of the editor.

---

## 5. Module catalogue — MVP and beyond

The Builder's UI is a flat list of top-level modules with expandable
children.  Each module ships with:

- a **JSON schema** describing its config fields (for UI generation),
- a **snippet template** (one or more), with `${placeholder}` slots
  matched to config fields,
- an **insertion region** in the base `main.c` template,
- optional **validation rules** ("needs at least one sprite with
  role=player").

### MVP modules (Phase A)

Enough to build a playable one-screen platformer.

| Module id       | Config fields                                               | Produces                                                                                                      |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `game`          | `type: platformer \| topdown`                               | Chooses base template + movement handler.                                                                     |
| `player`        | `spriteIdx, startX, startY, walkSpeed, jumpHeight, maxHp`   | Expands `player_start`, `walk_speed`, `jump_height` regions.  HP counter + death handler emitted if `maxHp>0`. |
| `player.walk_anim` | `animationId` (autofilled from `animation_assignments.walk`) | Emits walk-frame table references.  No-op if animation not assigned.                                         |
| `player.jump_anim` | `animationId` (autofilled from `animation_assignments.jump`) | Same for jump.                                                                                                |
| `enemies.walker` | `spriteIdx, speed, flipAtEdge, damagesPlayer`               | Uses the existing `enemy-walker.c` snippet, expanded once per enemy sprite of role=enemy.                    |
| `behaviour_walls` | `enabled`                                                  | Wires the existing `behaviour-walls-from-map.c` snippet so the pupil's behaviour-map is respected.           |
| `win_condition` | `type: reach_exit_tile` (only option in MVP)                | Detects the player entering a tile flagged `EXIT` on the behaviour map; draws a "You win" banner.            |

### Phase B — richer content

| Module id         | What it adds                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `enemies.chaser`  | Enemies steer towards the player (reuses `enemy-chaser.c` snippet).         |
| `pickups`         | Sprites tagged pickup vanish on touch, increment a score.                   |
| `doors`           | Tile flagged DOOR + linked target background → on overlap, swap background. |
| `player.hud`      | Draws HP hearts + score at top of screen.                                   |
| `player_2`        | Second player with its own controller (configurable pad mapping).           |
| `sound.jingle_on_pickup` | Tiny beep when a pickup is collected (once FamiStudio lands).        |

### Phase C — events & scripting

| Module id         | What it adds                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `events.on_collide`   | "When player touches sprite X, do Y" — Y chosen from a small menu (take damage, open dialogue, spawn sprite). |
| `events.on_enter_region` | "When player enters tile area (x1,y1)-(x2,y2), do Y". |
| `dialogue`        | Each NPC sprite gets a single-page dialogue string; B button opens it.  |

### Phase D — polish

- **Eject to Code.**  A button that drops the currently-assembled
  `main.c` into the Code page and disables the Builder for that
  project.  One-way by design — once ejected, the pupil owns the C.
- **Preview in UI.**  Show the assembled C in a read-only pane so
  curious pupils can peek under the hood.
- **Module help.**  Each module has a one-paragraph explainer and a
  link to the nearest lesson.

MVP is enough to make a tiny platformer.  Everything beyond MVP is
independently shippable.

---

## 6. Code assembly algorithm

Deterministic, same input always produces the same output.  Runs
entirely in the browser (so pupils see the result before Play).

Given the `state.builder.modules` tree:

1. **Load the base template** matching `modules.game.config.type`
   (e.g. `builder-templates/platformer.c`).  The template looks like
   the current `main.c` but with extra *named insertion slots* —
   `//@ insert: declarations`, `//@ insert: init`, `//@ insert:
   handle_input`, `//@ insert: per_frame`, `//@ insert: on_collide`.
2. **Walk enabled modules in a fixed order** (so the output is stable
   across runs).  For each:
   a. Collect its **snippet templates** (one per applicable target —
      e.g. `enemies.walker` with three role=enemy sprites produces
      three expansions).
   b. Substitute `${placeholder}` strings with config values.
   c. Append each expansion to the matching slot.
3. **Also inject typed values into the template's existing `//>>`
   regions** — that's how `walk_speed`, `jump_height`, `player_start`
   get their values.  Same region-parser as the Code page
   (`parseEditableRegions()`), but writing values in instead of
   reading them out.
4. **Strip the `//@ insert:` markers** so the output is clean C.
5. **Ship the result** to `/play` exactly as `code.html` does.

**Placeholder syntax** is deliberately narrow — just
`${config.fieldname}` and `${sprite(role).idx}` — so authoring a new
module's template is mechanical.  No eval, no conditionals inside
templates (conditionals are expressed by *whether a module is
enabled*, not by template logic).

**Snippet reuse vs new templates.**  Most MVP modules reuse existing
`snippets/*.c` verbatim — they already accept the generated symbols
(`ROLE_ENEMY`, `ss_x[]`, `WALK_FRAME_COUNT`, …).  Where a snippet
hard-codes a number we want the pupil to control, we add a
`${placeholder}` variant alongside the plain one — no deletion, the
original stays for Code-page users.

---

## 7. Validation / conflict detection

Runs on every change to `state.builder`, populates a Problems panel
below the module tree.  Play button is disabled while `problems >
0`.

**Rule examples** (MVP):

| Problem                                                      | Detection                                                                     | Suggested fix                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| *"Player module is on but no sprite has the Player role."*   | `modules.players.*.enabled && !state.sprites.some(s => s.role === 'player')`  | "Open the Sprites page and tag a sprite as Player (or turn the Player module off)." |
| *"Walk animation chosen but not assigned to any sprite."*    | `player.walk_anim.enabled && !animation_assignments.walk`                     | "Open the Sprites page → Animations panel and assign an animation to walk."     |
| *"Enemy module has no enemies."*                             | `enemies.walker.enabled && 0 enemy-role sprites`                              | "Tag at least one sprite as Enemy on the Sprites page."                         |
| *"Win condition says 'reach exit' but no EXIT tile painted."* | `win_condition.type === 'reach_exit_tile' && 0 EXIT tiles on active bg`       | "Open the Behaviour page and paint at least one EXIT tile."                     |
| *"Two players enabled but only one has a Player sprite."*    | `players.count === 2 && player-role sprites < 2`                              | "Tag a second sprite as Player, or set players.count = 1."                      |

Rules live in `builder-validators.js` as small pure functions `(state)
=> {ok: true} | {ok: false, fix: "..."}` — easy to write, easy to
test, easy to extend.

Each problem in the UI shows the fix text *and a button that jumps
to the right page* — "Open Sprites page" takes the pupil straight
to the relevant editor.  Lessons and snippets already do this kind
of cross-page jump, so the plumbing is free.

---

## 8. UI layout

The Builder is the **fifth page tab** — `🧱 Builder` — alongside the
existing four.  Because a sensible pupil session flows
*Backgrounds → Sprites → Behaviour → Builder → Play*, the tab goes
between Behaviour and Code.

```
┌──── Builder tab ───────────────────────────────────────────────┐
│ left column (module tree)        │ right column (right half) │
│ ┌──────────────────────────────┐ │ ┌───────────────────────┐ │
│ │ ☑ Game type                  │ │ │ Problems              │ │
│ │   Platformer ○ Top-down ●    │ │ │  ⚠ no Player sprite…  │ │
│ │ ☑ Players                    │ │ │  ⚠ walk anim not set  │ │
│ │   └ ☑ Player 1               │ │ │                       │ │
│ │       sprite: [picker]       │ │ │ [Fix on Sprites page] │ │
│ │       start X: [60]          │ │ └───────────────────────┘ │
│ │       start Y: [155]         │ │ ┌───────────────────────┐ │
│ │       walk speed: [2]        │ │ │ Preview (read-only)   │ │
│ │       jump height: [20]      │ │ │   void main() { …     │ │
│ │       ☑ Walk animation       │ │ │     px = 60;          │ │
│ │         → anim #1 (Hero walk)│ │ │     py = 155;         │ │
│ │       ☑ Jump animation       │ │ │     ...               │ │
│ │         → anim #2 (Hero jump)│ │ │   }                   │ │
│ │       ☑ Take damage          │ │ │                       │ │
│ │         invincibility: [60]  │ │ │ [Copy to Code page]   │ │
│ │   └ ☐ Player 2               │ │ └───────────────────────┘ │
│ │ ☑ Enemies                    │ │                           │
│ │   └ ☑ Walker                 │ │ [▶ Play]  [?]             │
│ │       …                      │ │                           │
│ └──────────────────────────────┘ │                           │
└──────────────────────────────────┴───────────────────────────┘
```

- **Module tree on the left** — a vertical accordion.  Ticking a
  parent expands its settings + child list.  Each config field
  renders from the module schema (dropdown for enums, number input
  with min/max, sprite picker opening the existing sprite dialog).
- **Problems panel top-right** — empty + green when everything's OK,
  amber list otherwise.  Clicking "Fix" jumps to the right page.
- **Preview bottom-right** — the assembled C, read-only, same
  CodeMirror idiom as the Code page so it looks familiar.  Updates
  on every tick of every checkbox.  Curious pupils can see
  ticking a box adds a block of C.
- **Play + ? buttons in the shared run group** — identical to the
  other pages (consistent with the menu reorg).

No header clutter — the Builder page has the same `File ▾ / Edit /
Run` toolbar as the others, plus one extra `Modules ▾` dropdown in
the *page tools* group with **Collapse all / Expand all / Reset
module defaults**.

---

## 9. Files touched — MVP scope

New:

- `tools/tile_editor_web/builder.html` — the new page.  Same
  structural shape as `code.html` / `behaviour.html`.
- `tools/tile_editor_web/builder-modules.js` — module schemas +
  templates (one file for MVP; splits later if it gets long).
- `tools/tile_editor_web/builder-assembler.js` — pure function
  `assemble(state) -> string`.
- `tools/tile_editor_web/builder-validators.js` — list of pure
  validator functions.
- `builder-templates/platformer.c` — base template with `//@ insert:`
  slots.
- `builder-templates/topdown.c` — ditto.

Modified:

- `tools/tile_editor_web/index.html` + `sprites.html` + `behaviour.html`
  + `code.html` — **one line each**, add `🧱 Builder` to the page
  nav.  Same idiom as the existing four-way nav.
- `tools/playground_server.py` — **no new routes required**.  The
  Builder posts to `/play` with `customMainC` set, exactly like the
  Code page.  Optional: a `GET /builder-templates/<id>` helper if we
  want the templates live-editable (not needed for MVP).
- `tools/tile_editor_web/sprites.html` and `index.html` — add
  `migrateBuilderState()` in the existing `migrateState()` chain so
  old projects gain a default `builder` object.

No Python changes at all for the MVP.  That's a deliberate goal —
the Builder is a pure client-side feature over the existing
`/play` contract.

---

## 10. Phasing

Each phase ends with a working end-to-end demo a pupil can run.

- **Phase A — MVP** (effort: M).  Game type + Player + enemies.walker
  + behaviour_walls + win_condition.  Enough to make a simple
  platformer where the hero walks, jumps, bounces off enemies, and
  reaches an exit tile.
- **Phase B — Richer content** (effort: M).  Chaser enemies, pickups
  with score, doors, HUD, second player.
- **Phase C — Events** (effort: L).  On-collide and on-enter-region
  events; NPC dialogue.  Risk lives here — event composition is
  where the "deterministic assembler" story gets tricky.
- **Phase D — Polish** (effort: S–M).  Eject to Code, preview
  prettifying, per-module help text.

Recommend: ship Phase A, run a pupil session, let pupil feedback
shape Phase B priorities.  This is the *entire point* of the feature
— get ahead of pupil requests by asking them directly.

---

## 11. Risks & unknowns

- **Template drift.**  The base templates duplicate the
  `Step_Playground/src/main.c` scaffolding.  If the stock template
  gains a feature (e.g. scroll wrapping) the Builder templates need
  to be updated in lockstep.  **Mitigation:** keep them *small* —
  base templates contribute only the scaffold + empty insertion
  slots, and all game-specific behaviour comes from module
  expansions.  The stock `main.c` is then allowed to drift without
  breaking Builder.
- **Combinatorial explosion.**  n modules × n submodules = many
  reachable configs.  Not all of them compile.  **Mitigation:**
  every module template is unit-tested by an offline Node script
  that generates a known-good `main.c` for a fixed config and
  compiles it against `cc65` — any template regression is caught
  before it reaches pupils.  CI is local (add a
  `tools/builder-smoketest.mjs`).
- **Placeholder escapes.**  `${config.startX}` substitution must
  never let a pupil inject C via e.g. a negative value parsed as a
  string.  **Mitigation:** all config fields are typed; placeholders
  take a typed getter (`int`, `uint8`, `bool`, `spriteIdx`,
  `animationId`), not raw strings.  Invalid values fail validation
  before assembly runs.
- **UI clutter.**  The tree could grow huge as modules are added.
  **Mitigation:** modules start collapsed; the module schema has a
  `hidden_until_ticked: true` flag for niche submodules (e.g.
  knockback tuning) so the default view stays short.
- **Interaction with Guided / Advanced Code mode.**  A pupil who
  edits C in the Code page then switches back to Builder risks
  losing their edits — the Builder assembler overwrites
  `customMainC`.  **Mitigation:** `state.builder` tracks a
  `mode: "builder" | "code"` flag.  In Builder mode the Code page
  is *read-only* (with a big banner: "This project is in Builder
  mode.  Click Eject to switch to Code mode").  The eject button
  is one-way, with a confirm dialog.  Round-tripping between the
  two modes is explicitly out of scope — pupils who want that live
  in Advanced Code mode.
- **Teacher-authored modules.**  Teachers may want to add their own
  modules (e.g. a "spawn extra lives every 30 s" module for a
  specific lesson).  **Mitigation:** `builder-modules.js` is a
  plain JS object; adding a new module is dropping a new entry.  A
  `builder-modules.local.js` loaded after the shipped one (if
  present) lets teachers override or extend without editing the
  main file.  Stretch goal — if this becomes common, promote to
  a `builder-modules/*.js` folder the way `lessons/` and
  `snippets/` work.

---

## 12. Open questions (for teacher to decide)

1. **Default Builder mode for new projects?**  Off (opt-in via the
   tab), on (the Builder page is the default landing), or "ask on
   first project creation"?  Default-on is the pupil-friendliest; the
   risk is that long-time pupils lose their Code page muscle memory.

   ### Answer to 1

  Default on when going to the code page unless they have done anything on any of the other code pages.

2. **Snippet and Builder module overlap.**  Today the Code page has
   a `sprint-on-a.c` snippet; the Builder will almost certainly grow
   a `player.sprint` submodule.  Do they coexist, or does the
   Builder module *replace* the snippet in the library?  (Suggest:
   coexist — snippets stay as one-line recipes for Code-page pupils;
   modules are the high-level wrapper.)

   ### Answer to 2

  I would like them to coexist, I see them as aiding in progression to programming the game in C or Assembly.

3. **"Templates" vs "lessons".**  Should every Builder-produced game
   also show up as a lesson the pupil can flip into Code mode and
   study?  Nice-to-have, but could be a later phase.

  ### Answer to 3

  I would like to think how to approach the 'lessons' aspect as I want them to grow the pupils knowledge
  at the correct speed so they don' loose interest but keep feeling like they are making something new and
  fun. So please leave the lessons for the moment but be aware some lessons will be with this new system.

4. **Two-player input mapping.**  Pad 2 routing is straightforward
   on cc65, but the Step_Playground template currently ignores
   `JOYPAD2`.  Does Phase B add Joypad 2 support directly, or wait
   until a pupil actually asks?

  ### Answer to 4

  Pupils have already requested 2 player options so I think adding it to phase B is a good idea.

5. **Ordering vs Sprint 11 scroll work.**  The current Sprint 11
   effort is scrolling.  The Builder MVP is effort M; it could land
   *before* Sprint 11 scroll (if priorities shift) or *after*.  My
   recommendation: let the pupil feedback queue decide — if two or
   more pupils explicitly ask for the Builder in the next session,
   jump queue; otherwise finish Sprint 11 first.

   ### Answer to 5

   More pupils want this implemented than the scrolling levels at the moment. I can see that once this is working
   the requests for more scrolling levels will quickly increase so it should be ready to include scrolling.

---

## 13. Acceptance criteria (Phase A)

The Phase A build is done when a pupil can:

1. Open a new project, switch to the Builder page.
2. Tick **Game type → Platformer** (already default).
3. Tick **Players → Player 1**, pick a sprite with role=player, set
   start position, set walk speed and jump height, assign walk +
   jump animations.
4. Tick **Enemies → Walker**, and see it confirm "3 enemies will
   walk" (or whatever the enemy-role count is).
5. Tick **Win condition → Reach exit tile**.
6. See the Problems panel go green.
7. Click Play and walk their character around, bumping enemies,
   reaching an EXIT tile to trigger a "You win" message.

All without reading a line of C.

### Verification

- `node --check` on every new JS file.
- Unit tests in `tools/builder-smoketest.mjs`:
  - Assembler output for a canonical config matches a golden file
    byte-for-byte.
  - `make -C /tmp/build-smoketest` compiles the golden output with
    the real `cc65` toolchain, no warnings.
  - Each validator fires exactly once on a crafted broken state, and
    zero times on a good state.
- Manual pupil walkthrough on the first weekend after the MVP lands.

---

## 14. What this plan deliberately doesn't cover

- **A visual script editor** (Scratch-for-NES).  That's a much
  bigger project and is out of scope for the Builder.  Events in
  Phase C are *dropdown-selected*, not visually composed.
- **Audio / FamiStudio integration.**  Already flagged as a separate
  big piece of work in `PUPIL_FEEDBACK.md`.  When it lands, a
  `sound.jingle_on_pickup` module falls in naturally.
- **Procedural level gen / random enemies.**  Dice-based placement
  is a lovely advanced lesson but far off the critical path.
- **Multiplayer over LAN / save states.**  NES ROM scope; out.
- **Mobile / touch UI.**  Same story as the rest of the editor — the
  Builder works best with mouse + keyboard.

---

## 15. Next step

This plan is not an implementation commitment — it's a proposal.
Recommended next decision for the teacher:

1. **Skim this doc and push back on anything that feels wrong** —
   the data model and the module catalogue are the parts most worth
   arguing about early.
2. **Pick a phase to greenlight first.**  Phase A is the natural
   start; it's 2–4 focused sessions of work.
3. **Pick a Builder tab placement.**  Between Behaviour and Code is
   my suggestion; reasonable alternatives are last-on-the-right or
   first-on-the-left.

Once greenlit, implementation starts with the base template +
assembler + a single working module (the `game` type picker), which
is enough to prove the end-to-end pipeline before investing in more
modules.
