# Implemented UI improvements — Sprites & Backgrounds pages

Companion to `changelog-planned.md` (now archived as
[`docs/plans/archive/2026-04-13-changelog-planned.md`](../plans/archive/2026-04-13-changelog-planned.md)).
Records what actually shipped, what was unnecessary, and what was
deferred.

> **Note on broken links in older entries.**  Entries below dated
> *before 2026-04-26* were written when the project's `.md` files
> all lived at the repo root (`PUPIL_GUIDE.md`, `BUILDER_GUIDE.md`,
> `audio-plan.md`, etc.).  They were moved into a structured
> `docs/` tree on 2026-04-26 — see [`docs/README.md`](../README.md)
> for the full old→new path table.  Inline links in those older
> entries that read `[X.md](X.md)` are deliberately *not* rewritten
> to point to the new locations: they describe the state of the
> world *at the time the change shipped*, and chasing every one
> would be high churn for low value.  Use the lookup table in
> `docs/README.md` if you click an old link and hit a 404 — the
> file you wanted is in `docs/guides/`, `docs/plans/archive/`, or
> `docs/feedback/`.

---

## Engine v11 → v75 + Studio hardening (bring-forward summary) — 2026-07-14

A high-level catch-up covering everything that shipped **since** the v10 entry
below. The authoritative, per-version detail lives in
[`tools/engines/CHANGELOG.md`](../../tools/engines/CHANGELOG.md) (one entry per
version, newest first); the pupil-facing item tracking lives in
[`docs/feedback/recently-observed-bugs.md`](../feedback/recently-observed-bugs.md).
Every step kept the golden ROMs byte-identical (new behaviour gated
off-by-default) and both suites green (`node tools/builder-tests/run-all.mjs`,
`npx playwright test`).

- **Hand-written 6502 engine now ships by default (v11 → v54).** The player
  physics were ported to hand-written 6502, verified A/B against the C path for
  each game style and each player (single- and 2-player: platformer, SMB,
  auto-runner, top-down, racer), landing OFF-by-default per style and then being
  switched ON once A/B-clean (player physics shipped v43/v50; the OAM draw loop
  shipped v54). Net effect for pupils: a much roomier frame budget (~2.8× on the
  hot paths), same ROM behaviour.
- **FCEUX-driven polish (v53 → v57).** Racer steering rate-limit, 2-player camera
  that follows the midpoint, a 2-player auto-runner, and an SMB HUD digit cache —
  all from validating the shipped engine in FCEUX (not just jsnes).
- **SMB background status bar (v58 → v70).** A real background HUD with a
  sprite-0 split (glyph seeding → bg HUD → split → freeze), then the "header
  flickers after the first screen" fix: v69 cut the vblank cost (browser-safe)
  and v70 moved the push to an NMI-driven, double-buffered write. Off by default;
  the multi-bg door-transition wrong-room bug (#2/#3) was fixed in v63 along the
  way.
- **Level compression (v64 → v66).** A column-dedup level format with a C then
  ASM decoder (dormant + byte-identical while proven out), then applied to any
  multi-screen level so detailed 5–8-screen levels fit.
- **Physics sliders + new enemy paths (v67 → v72).** The platformer jump-height /
  speed / gravity sliders now drive the shipped ASM engine (v67), the runner's
  gravity ASM/C divergence was fixed and made tunable (v68), and three new
  per-instance enemy paths landed for pupil request #13: **hopper** (walks +
  bounces, v71) and **shooter/turret** (fires projectiles, v72), alongside the
  flyer/patrol from v10.
- **Invincibility-frames floor formally versioned as v73.** The `#35` fix (floor
  the Damage module's "invincibility after hit" at 10 frames, so a single enemy
  touch can't drain all HP in a few frames) changes ROM output for any project
  that set `invincibilityFrames < 10`, so it is now a proper engine version with
  its own snapshot. Goldens stay byte-identical (Damage default is 30); v72 is
  left untouched so games authored under it rebuild unchanged.
- **Event sound effects — v74 (#7/#27).** Loaded SFX used to be silent
  (`famistudio_sfx_init` was called but `famistudio_sfx_play` never was). v74
  wires the SFX pack to jump / pickup / hurt / win via edge-detectors in the
  main loop (so they fire in both the C and shipped-ASM builds), behind the
  SOUND dock's **"Play sounds on game events"** toggle. Gated + off by default
  (goldens byte-identical); guarded by `sfx-events.mjs`. Actual audio is pending
  an attended FCEUX playtest before it's called fully done.
- **Per-room scene instances — v75 (#14).** Entities used to be one flat set
  shared by every room; now each carries a `bg`, the WORLD editor edits one
  room's entities at a time, and the engine activates only the current room's
  entities — swapping them on each door transition (re-entering a room respawns
  them). Different enemies/pickups per room, at last. Gated `#ifdef
  BW_SCENE_PERROOM` (multi-room only → single-scene byte-identical); verified in
  jsnes by `per-room.mjs`. v1 covers single-screen-room layouts.
- **Studio UX + safety.** A Games menu (open/manage saved games, available even
  when signed out), a fix for focus theft on load (#36), the reactions matrix
  (#20), the invincibility-frames floor (#35, now engine v73), thumbnail crop
  fixes (#25), and several items verified-correct-as-is on investigation (#16
  palette fidelity, #32). See the feedback list for the per-item status.

## Engine v10 + bug-list sweep (autonomous) — 2026-07-06

A focused pass over the pupil bug list, each unit test-gated (full builder
suite kept golden-byte-identical + Studio E2E green):

- **Engine v10 — two new enemy paths (bug #13).** A **flyer** (hovers ±20px
  around its placed height and drifts toward the player, overriding scene
  gravity by writing `ss_y` absolutely each frame — guarded so a defeated
  actor stays parked) and a **patrol** (paces ±40px and turns on its own, no
  wall needed) in the World-dock AI dropdown (v10+). Both reuse per-instance
  speed and degrade to `walker` below v10, so golden ROMs are unchanged.
  Behavioural test `flyer-patrol.mjs`; snapshot frozen at `tools/engines/v10`.
- **Bug #14 — place entities on any screen.** The World place/move tool used
  first-screen-clamped, view-offset-ignorant coordinates; now it works in
  world space across the whole scrolling level (the engine already rendered
  world-pixel scene sprites). Overlay culls entities off the shown screen.
  Still open: per-background scene lists (one shared scene today). E2E in
  `entities.spec.js`.
- **Bug #18 — Duplicate forks a character's tiles.** Duplicating gave the copy
  fresh sprite-tile slots (one per distinct source tile, blank tile 0 shared,
  falls back to sharing only if the 256-pool is full), so editing the copy no
  longer changes the original. E2E in `chars.spec.js`.
- **Bug #16 — palette fidelity (investigated, not reproduced).** New
  `palette-render.mjs` proves all 4 BG + 4 sprite palettes load into PPU RAM
  (`$3F00-$3F1F`) byte-for-byte; the editor render path also keys off the
  correct per-cell palette index. Downgraded from a correctness bug; diagnosis
  recorded.
- **Sprint 4 closed** — bug-reproduction-card template added; the audio-budget
  validator folded into Sprint 5's budget meter (audio size is server-computed).
- **Engine v11 — stomp to defeat enemies in the plain platformer (bug #15).**
  A Damage-module option "Jump on enemies to defeat them" (+ tunable bounce):
  falling onto an enemy from above defeats it (parks at `y=0xFF`) and bounces
  the player; side/below touch still hurts. Platformer only, emitted
  `#ifdef BW_STOMP_DEFEAT` (off → byte-identical). Guards the basic chaser AI
  against reappearing once parked. `stomp-basic.mjs` proves ON defeats+bounces
  and OFF leaves the enemy alive. Feel constants are tunable (attended playtest
  to finalise). Shooting already exists in the SMB style.
- **Top-down enemy coverage (bug #26).** `topdown-enemies.mjs` drives a chaser
  (both-axis seek, unmasked without gravity) and a v10 patrol (paces in x, zero
  Y drift) in a real top-down ROM.
- **Bug #22 already shipped** — game-wide gravity/jump is the Globals module.

## Storage-load fix + from-scratch tutorial — 2026-07-06

- **Fixed a loading bug** where opening a saved game or tutorial needed clearing
  localStorage/cookies and a force reload. Cause: localStorage filled with
  full-state snapshots/backups, so a write threw QuotaExceededError mid-load.
  Now every write frees the oldest snapshots/backups and retries
  (`safeSetItem`), so saving/loading never hard-fails; `createProject` stays
  atomic and the editor degrades gracefully if truly full.
- **New "🧱 Build from scratch" tutorial** — 20 small steps from a **blank
  screen** to a complete game: draw the hero, choose colours, draw + paint the
  ground and make it solid, test it, build a platform, create + draw + place an
  enemy, add hearts, add a coin, paint a goal + turn on winning, tune the jump,
  and play. Also a "📄 Blank project" starter.
- **Leave and come back** — a "⏸ Hide" button pauses any tutorial (progress
  saved); the 🎓 Tutorial button then offers "▶ Resume your tutorial", and a
  half-finished tutorial resumes automatically next time its project opens.

## Tutorials deepened + teacher tools — 2026-07-06

Built on the guided tutorials the same day:

- **Deeper tutorials** — every style now has 7–9 teachy steps (platformer 9:
  adds a platform, place an enemy, edit dialogue; top-down adds a 2nd room + an
  enemy; runner adds a spike; racer adds a checkpoint). The runtime re-baselines
  each step, so sequential "add/paint more" steps each need a fresh action, with
  richer lenient checks (paint a specific tile type, place a character, add a
  room, edit dialogue, toggle a module).
- **Teacher settings** (🧑‍🏫, from the tutorial picker): class defaults for
  Pairing, Celebration (visual / +sound / off), and Hints & Show me — honoured
  by the runtime. Accessibility is never limited.
- **Optional pair-programming mode** — never forced: a Driver/Navigator banner
  + a "🔄 Swap!" cue; the pupil can always Work solo.
- **In-Studio step editor** — a teacher can reorder / add / remove steps of any
  tutorial (stored as a per-machine override; the base is never changed).

## Guided tutorials + all five game styles selectable — 2026-07-06

The Studio gained a working, in-app **guided tutorial** and every game style is
now a first-class, selectable, fully-working starter. Design:
[`docs/design/quest-tutorials.md`](../design/quest-tutorials.md).

- **Guided tutorial** (`studio-tutorial.js` + `tutorial-first-game.js` /
  `tutorial-styles.js`): a collapsible panel walks a pupil through one light
  edit per section (name → colour → tile → world → rules → Play) on a ready-made
  game — nothing drawn from scratch. Declarative, lenient checks (any light edit
  passes); progress persists per project. Step **icons**, a **"Show me" that
  flashes the real button**, and it **auto-unlocks** the Maker-level areas
  (Tiles/Pals) it uses.
- **All five styles work + selectable**: platformer, SMB, top-down, auto-runner,
  and racer each ship a complete-tileset starter that compiles + plays
  (`createTopdown`/`createRunner`/`createRacer` join `create`/`createSmb`), all
  in the New-game picker. The 🎓 **Tutorial** button opens a style picker; each
  style has its own guided tutorial (`StudioStarter.tutorialFor`).
- **Quests column** is now minimisable and flashes only when a warning appears;
  the basics starter no longer ships a dead win-condition (was a red error for
  every pupil). Tests: `builder-tests/style-starters.mjs`,
  `studio-tests/tutorial.spec.js`.

## Full SMB engine (v3–v9) + trust & hardening — 2026-07-05

On `feature/smb-engine`: the versioned engine grew a complete Super-Mario-style
toolkit (engine **v3–v9**), and a follow-on **trust & hardening** pass locked
down authorization, documented the project-state contract, and expanded the
pupil-facing validators + tests. Every engine feature is gated off-by-default so
the golden ROMs stay byte-identical. Plans:
[`docs/plans/current/2026-07-05-smb-engine-roadmap.md`](../plans/current/2026-07-05-smb-engine-roadmap.md),
[`docs/plans/current/2026-07-05-trust-and-hardening.md`](../plans/current/2026-07-05-trust-and-hardening.md).

- **SMB engine v3–v9** — fixed-point run + variable-height jump (a tunable
  Speed 1–5 preset), Goomba stomp + kickable Koopa shell, Mushroom / Fire
  Flower / Star power-ups with B-button fireballs, ? / brick / coin 16×16
  blocks (pick what each ? dispenses), a coins/time/score/lives HUD via a
  sprite-0 split, pipes/warps + a flagpole finish + bonus room, and NROM
  8×16 / OAM-flicker rendering polish. All surfaced in the Studio **🎮 Style**
  tab (per-game-type options) with an SMB showcase starter. Decisions:
  [`docs/design/decisions/2026-07-05-smb-engine-decisions.md`](../design/decisions/2026-07-05-smb-engine-decisions.md).
- **Authorization (deny-by-default)** on the gallery + feedback routes: publish
  stamps the owner from the session; remove needs the owning account **or** the
  teacher admin secret (anonymous entries teacher-only); `/feedback/handled`
  needs the teacher secret. The gallery lists an `owned` flag (never the raw
  owner id) and shows 🗑 Remove only on owned entries, with a 🔑 Teacher-mode
  toggle. **CSRF** defence-in-depth via an Origin/Referer check (zero client
  changes, proxy-safe, kill-switch). SQLite gained `synchronous=NORMAL` +
  `busy_timeout`.
- **Docs truth** — [`docs/reference/project-state-schema.md`](../reference/project-state-schema.md)
  (the state contract + the three-version-counters gotcha), a "Current editor
  status" note (Studio primary / seven pages legacy), and a "when to bump +
  snapshot" rule.
- **Validators & tests** — new pupil warnings (? block gives a power-up with the
  module off; flagpole needs Win condition / sits past the level; 8-sprites-per-
  scanline) and new behavioural coverage (route-level gallery auth, CSRF Origin,
  gallery preview is non-blank, **top-down four-way movement + wall collision**).
  The gallery preview capture is now one shared, headlessly-tested helper.

## NES Studio redesign, engine versioning, per-door destinations — 2026-07-05

The `redesign/ui-ux` work merged to `main` (the unified **Studio** at
`studio.html` ships alongside the untouched seven pages), and a new
`feature/nes-engine` branch added a versioned engine + its first feature.

- **NES Studio** — the seven pages collapsed into one game-first workspace
  (World / Chars / Tiles / Pals / Rules / Sound / Code) on the NES palette,
  with progressive-disclosure levels, quest log + validators, CHR/OAM budgets,
  `.chr`/`.pal`/`.nam`/JSON round-trips, the 16×16 metatile block library, and
  eject-to-hand-coded-C (CodeMirror). A dismissible promo banner points the old
  pages at it. See [`docs/plans/current/2026-07-05-studio-redesign.md`](../plans/current/2026-07-05-studio-redesign.md).
- **The 7 Studio bugs** from `docs/design/notes.md` fixed (sprite palette,
  Line/Rect tools, starter game + account-menu loader, Beginner signposting,
  solid-collision, multi-screen backgrounds).
- **NES-engine versioning** — every project stamped `engineVersion`; per-version
  snapshots (`tools/engines/v1`, `v2`) via `scripts/snapshot-engine.mjs`;
  `CHANGELOG.md`; builder-tests enforce version-agreement + snapshot integrity.
  The **multi-page site is pinned to engine v1**, the Studio targets the latest;
  an in-Studio **⚙ Engine advisor** shows "what changed" and updates a game.
  Design: [`docs/design/engine-versioning.md`](../design/engine-versioning.md).
- **Engine v2 — per-door destinations** (same-room + cross-room); empty door
  list stays byte-identical to v1.
- **Tile default-behaviour** (auto-type on place) + tile-type overlay; **richer
  starter game** (platforms, ladder, enemy, NPC + dialogue, door, hearts).
- **Roadmap** to an SMB-1-1-complete game + research:
  [`docs/plans/current/2026-07-05-smb-engine-roadmap.md`](../plans/current/2026-07-05-smb-engine-roadmap.md),
  [`docs/design/research/smb-1-1-and-nes-engines.md`](../design/research/smb-1-1-and-nes-engines.md).

## Account control in the top bar, responsive toolbars, `.env` config — 2026-06-21

Follow-up polish to the accounts batch below.

- **Account entry moved to the top toolbar.** The optional account UI was tucked
  inside the 📁 project dropdown; it's now a discoverable control next to it
  (`account-menu.js` → `#account-control`): **👤 Sign in** when signed out, a
  **👤 username ▾** dropdown (Save to / Open from account, Sign out) when signed
  in. Same graceful-hide-if-offline rule. `account-ui.mjs` updated.
- **Responsive toolbars.** The page headers/toolbars were `display:flex` with no
  wrap, so on a standard screen they overflowed once the account control was
  added. `.app-header` and `.app-header .toolbar` now `flex-wrap: wrap` (with
  row-gaps) on every editor page, so the toolbar wraps to a second line instead
  of overflowing.
- **Project-menu tooltip** aligned (Behaviour said "Project + Save / Open").
- **`.env` config file.** `playground_server.py` now loads a gitignored
  root-level `.env` at startup (`_load_dotenv`, zero-dependency; real env vars
  and systemd `Environment=` still win; `PLAYGROUND_SKIP_DOTENV=1` opts out and
  is set by the test harness). Committed `.env.example` documents every
  `PLAYGROUND_*` var; `.gitignore` covers `.env`. Setting `PLAYGROUND_JOIN_CODE`
  there opens self-signup. Teacher Guide updated.

---

## Project-menu unification, save-reliability, optional accounts UI + cookie notice — 2026-06-21

A batch of pupil/teacher-reported project-management fixes. **All headless
tests pass, including the byte-identical golden ROM invariant** (this batch is
editor JS/HTML only — no ROM/template code changed). Items needing an
in-browser pass are flagged at the end.

### 1. Data-loss: "saving a new project sometimes loses the old one" (fixed)

Root cause was a **cross-tab catalog clobber**. Two editor tabs share one
`localStorage`; each held an in-memory copy of the projects catalog. Every
autosave called `touchProject → saveCatalog`, which wrote that whole in-memory
catalog back — so a tab that had gone stale (because another tab created a
project) silently erased the new project on its next save. Reproduced in a
headless test (`project-save-safety.mjs`): the catalog collapsed to
`["default"]`.

Fix (`storage.js`): a new `commitCatalog(mutate)` re-reads the on-disk catalog
as the base for **every** mutation (`touchProject`, `createProject`,
`renameProject`, `duplicateProject`, `deleteProject`, `setActiveProjectId`), so
a mutation can only ever touch its own target and can never drop an unrelated
project. This tab's `activeId` is preserved across the reconcile. `createProject`
/ `duplicateProject` now also write the project's slot + meta **before**
registering it in the catalog (atomic: a failed/quota write leaves no phantom
entry and the old project intact — also covered by the test). Known minor
limitation documented in code: a project deleted in one tab can momentarily
reappear in another stale tab until reload (no data loss).

### 2. Renaming the starter project (fixed)

The catalog seeded the first project as **"My First Project"** but
`createDefaultState()` named the slot **"untitled"**, and on first visit there
was no slot — so the dropdown *label* said "My First Project" while the rename
*input* said "untitled", making the starter look un-renameable. New
`Storage.bootstrapCurrent(makeDefault)` seeds a first-visit project's
`state.name` from the active catalog entry so the label, list and rename field
agree. Adopted in every seeding page's init (Backgrounds/Sprites/Behaviour, and
Code's minimal seed). The rename field already worked on the active project; it
now also reads correctly for the starter.

### 3. One consistent project menu on every page (was "a little different")

Every editor page now carries the **same** Backgrounds-style menu:

- **Audio** had *no* project menu at all — it now has the full menu (project
  list, rename, New, Duplicate, Delete, Save-all/Open-saved, Recover).
- **Builder + Code** gained the **"+ New project…"** button (they used to omit
  it and point pupils to Sprites); their `id="file-menu"` is renamed to
  `id="projects-menu"` and the summary tooltip aligned.
- **Behaviour** New was a `window.prompt`; it now uses the shared rich dialog.
- New shared `default-state.js` (`window.DefaultState.create({name,template})`)
  gives Builder/Code/Audio a complete, valid blank starter so New works there
  (mirrors the Sprites page's `createDefaultState`).
- The rich **New dialog** (name + template) moved into `project-menu.js`
  (`ProjectMenu.wireNewButton`), replacing the old prompt path that lived in
  `storage.js`'s `wireBasicProjectActions` (now Duplicate/Delete only).

Tests: `project-menu.mjs` extended (audio added; New asserted on every page; a
new behavioural test drives the dialog → flush → `createProject` → reload).

### 4. Optional pupil accounts — editor UI (T4.2 P3)

New standalone `account-menu.js` adds an **"Account (optional)"** section to the
shared menu on every editor page (auto-mounts; talks to the existing P1/P2
`/auth/*` + `/me/projects` endpoints, same-origin session cookie):

- Signed-out: "Sign in / Create account…" dialog (username + password, optional
  class code; shows the one-time recovery code after sign-up — no email stored,
  username only, per the privacy constraint).
- Signed-in: "Save to my account" (PUTs the same-named cloud project else POSTs)
  and "Open from my account…" (copies a cloud project into a **new local
  project** so it never clobbers current work), plus Sign out.
- **Accounts stay optional**: if `/auth/me` is unreachable (static-only host,
  server down, or nginx not proxying `/auth`), the whole section silently hides
  — it never blocks the editor. Covered by `account-ui.mjs` (graceful-hide,
  signed-out/in render, save PUT-vs-POST, load→createProject→reload). Backend
  already covered by `accounts.mjs` + `account-projects.mjs`.

### 5. EU cookie / storage notice

New `cookie-notice.js`: a small, dismissible banner on every page (incl.
Gallery) explaining the only client storage used is functional —
`localStorage` for projects and, if you sign in, one login cookie; no tracking,
ads, or third parties. Dismissal remembered in `localStorage`.

### Deploy + verify

- **New files to deploy as a unit** (nginx serves the static dir directly):
  `default-state.js`, `project-menu.js` (changed), `account-menu.js`,
  `cookie-notice.js`, `storage.js` (changed), and all page HTML. The dev
  playground server serves the whole `tile_editor_web/` dir, so they work there
  with no config.
- **Production nginx must proxy `/auth/*` and `/me/projects*` to the playground
  server** for the account UI to function. If it doesn't, the account section
  just stays hidden (editor unaffected).
- **In-browser pass still needed** (can't be checked headless): open two tabs
  and confirm creating a project in one no longer drops projects in the other;
  rename the starter project; New/Duplicate/Delete on Audio + Builder + Code;
  sign up / sign in / Save to / Open from account end-to-end; cookie banner
  shows once and stays dismissed.

---

## Multi-screen scene-sprite placement — 2026-06-21

Pupil-reported: the Builder only let you put sprites (enemies, NPCs, pickups) on
the **first screen** of a multi-screen level. Fixed in two halves:

- **Data layer** (`build_scene_inc`, commit e2fd2f5): scene-sprite `ss_x`/`ss_y`
  were 8-bit (`& 0xFF`), so any position past 255 wrapped back onto screen 1. They
  now clamp to the world bounds and emit as 16-bit (`unsigned int`) whenever a
  sprite sits past the first screen; single-screen levels keep the 8-bit layout
  (so the asm/C `_rom-equiv` parity holds) and the no-modules stub stays 8-bit (so
  the byte-identical golden is untouched). The engine already drew scene sprites
  camera-aware (`world_to_screen_x/y` handle any 16-bit position), so no engine
  logic changed. Test `scene-multiscreen.mjs`: a sprite at world x=400 sits off
  the right edge on screen 1 (an 8-bit wrap would put it mid-screen at 144) and
  scrolls to its true position as the camera reaches it.
- **Editor** (`builder.html`, commit dd82cc3): the scene-sprite preview was a
  single 256×240 screen. It now spans the **whole world** — a `sceneWorld()`
  helper sizes the canvas to all screens at an adaptive zoom, the background +
  grid render across every screen with yellow screen-boundary lines, and
  click/drag/number-inputs map to and clamp against the full world. The player
  *start* stays on screen 1 (PLAYER_X/Y are 8-bit in the engine).

Known minor limitation (documented in the template): a scene sprite off the
screen's RIGHT clamps to x=255 — a 1px sliver at the edge — rather than fully
hiding; a proper fix needs an engine-wide off-screen-sentinel change + a golden
re-pin, deferred. Player-start-on-any-screen would need 16-bit PLAYER_X — also
deferred. Pending the user's visual pass. Full suite + golden green.

## Arc E §3 top-down racer — E3-5 polish complete (4 parts) — 2026-06-21

Finished the optional E3-5 polish; the racer is now feature-complete. Each part
is its own commit, all racer-gated (golden ROM intact), full suite green.

1. **Corner-probe collision** — `racer_box_on_edge` probes 4 corners + centre
   (5 lookups) instead of the full 3×3 span (~9), freeing per-frame headroom.
   *Finding:* this + the 16-bit math made **single-player run 1:1**, but
   **2-player stays ~2×** — `waitvsync` is quantised (1 frame if the loop fits,
   else 2), and two cars sit just over the line regardless of these per-car
   savings (design doc §7).
2. **Full reverse** — `racer_speed` is now signed; DOWN brakes then backs the car
   up (capped at `RACER_REV_MAX`, default half top speed), friction pulls toward 0
   from both sides. `racer-brake.mjs` gains a reverse check.
3. **Ordered checkpoints** — a lap can require 1 or 2 checkpoints passed *in
   order* (CP1 = trigger id 5 → CP2 = ladder id 6) before the finish counts; a
   Builder "checkpoints per lap (1–2)" knob → `RACER_CP_COUNT` (default 1 keeps
   single-checkpoint tracks unchanged). `racer_armed`→`racer_cp_stage`; validator
   + `racer-checkpoints.mjs` cover order enforcement.
4. **Flip-shared rotation CHR** — the 8 headings now use only **3 unique drawn
   frames** (E/SE/S) mirrored via OAM H/V-flip bits, cutting the car's rotation
   CHR from 32 tiles to 12 (the "no CHR room" fallback is now rare). P2's draw ORs
   the per-frame flip bits into its palette.

New tests: `racer-checkpoints.mjs`. Updated: `racer-brake.mjs` (signed speed +
reverse), `racer-2p.mjs` (coast P2 to stop, since DOWN reverses now),
`racer-laps.mjs`/`racer-validators.mjs` (cp_stage + 2-checkpoint cases).

Pending the user's feel pass (reverse, 2 checkpoints, rotation art, 2-player).
Open: 2-player's residual ~2× (needs a deeper loop cut to cross the 1-frame
budget) and 3+ ordered checkpoints (behaviour-id limited).

## Arc E §3 top-down racer — E3-5 16-bit velocity math (perf) — 2026-06-21

Followed the 2-player perf flag with the specified fix: the racer's per-frame
velocity + position math is now **16-bit, no `long`**. `(speed >> 2) * cos >> 5`
gives the same 8.8 velocity as the old `speed * cos >> 7` within ~0.003 px but
fits a 16-bit multiply, and the position now accumulates the sub-pixel in 16-bit
(`acc = px_sub + vx; np = px + (acc >> 8); px_sub = acc & 0xFF`) instead of
`((long)px << 8)`. Applied to both cars. All 8 racer tests pass **unchanged**
(velocity numerically ~identical) and the golden ROM is intact (racer-gated).

**Measured:** single-player now runs **1:1** with the frame — the headless
coast-to-stop dropped 144 → 96 frames (= exactly `MAX_SPEED/FRICTION`, one logic
step per frame), so the single-car overrun is gone. **Two-player is still ~2×**
(its per-frame movement was identical before/after), which pins the remaining cost
on the four full-box `racer_box_on_edge` collision scans — not the arithmetic.
The next perf lever (deferred, only if 2-player needs it) is a corner-probe
collision (≈half the `behaviour_at` calls), which trades a little accuracy. See
design doc §7.

## Arc E §3 top-down racer — E3-5 2-player (shared screen, follow P1) — 2026-06-21

Two cars race on one screen (the user chose the follow-P1 camera; the NES has no
true split-screen). All racer-gated → other ROMs byte-identical.

- **Engine** (`platformer.c`): a second car with its own `racer_heading2`,
  `racer_speed2`, sub-pixel accumulators and lap state, driven by `pad2` with
  identical angle-physics. The collision helper was generalised to
  `racer_box_on_edge(bx,by,bw,bh)` so both cars use it. The camera still follows
  P1 (so P2 can scroll off). P2 draws **rotated** (reusing P1's rotation frames,
  in sprite **palette 1** so the cars look distinct). Both count laps; the race
  ends when **either** finishes (winner's screen tint: P1 = red, P2 = green) and
  both cars freeze (`RACER_RACE_OVER`). P2's lap shows **top-right**. The
  platformer-style P2 walk/jump movement + draw are gated off for the racer.
- **Test** `tools/builder-tests/racer-2p.mjs`: controller 2 drives P2 and not P1,
  controller 1 drives P1 and not P2 — proven independent (Δ61 vs 0 each way).
  Full suite + the byte-identical ROM golden invariant green.
- **Perf caveat (flagged):** with two cars the per-frame `long` velocity math
  pushes the loop ~2× over the NTSC budget (single car ~1.3–1.5×), so 2-player is
  **noticeably slow**. The fix is specified in the design doc §7 (16-bit velocity
  + position math, numerically ~unchanged) and is now the priority follow-up.

Pending the user's feel pass (race a friend; check the slowdown). Remaining E3-5:
the 16-bit perf optimisation, full reverse, ordered checkpoints, flip-shared CHR.

## Arc E §3 top-down racer — E3-5 brake + lap HUD (+ perf trim) — 2026-06-21

First polish slice of E3-5.

- **Brake (DOWN)** (`platformer.c`): a `RACER_BRAKE` deceleration (~5× friction)
  so the pupil can slow for a corner; floors at 0. Full *reverse* is deferred (it
  needs a signed-speed refactor). Test `racer-brake.mjs` compares brake-stop vs
  coast-stop time (brake far faster) — measured robustly to dodge input latency.
- **Numeric lap HUD** (server + engine): for a racer the server seeds 0–9 digit
  glyphs (from the dialogue font, mapped to a transparent background) into spare
  sprite-CHR slots and emits `racer_digit_tiles[]` + `BW_RACER_HUD`; the engine
  draws the **current lap as one digit sprite top-left** (sprites don't scroll, so
  it stays put). Test `racer-hud.mjs`: the HUD digit's tile changes when the lap
  advances. All racer-gated → other ROMs byte-identical.
- **Perf trim**: frame-counting showed the racer loop runs a touch over the NTSC
  budget (the `long` velocity multiplies dominate — present since E3-1, which
  feel-tested fine). Lap detection was changed from two full-box behaviour scans
  to a single **centre-cell** lookup (markers are track-spanning lines), keeping
  the per-frame cost near the E3-2 level the user liked. Noted the bigger win
  (16-bit velocity math) in the design doc if a feel pass shows real lag.

Full suite + the byte-identical ROM golden invariant green. Remaining E3-5:
2-player (needs a shared-screen camera decision), full reverse, ordered
checkpoints, flip-shared rotation CHR. Pending the user's feel pass (brake + the
on-screen lap number).

## Arc E §3 top-down racer — E3-3 auto-rotated car art — 2026-06-21

The racer car now faces its heading. The pupil draws the car **once (facing
right → = heading 0)** and the build auto-rotates it — option A, the user's
choice.

- **Server** (`playground_server.py`, `_inject_racer_rotation`): for a racer
  game, assembles the player car's pixels, bakes **8 rotated frames** (45° steps,
  nearest-neighbour) into spare sprite-CHR slots — chosen as blank slots **not
  referenced by any sprite**, so nothing else is clobbered — and stashes their
  tile indices. Runs before `build_chr` (mutates the pool) and is a **no-op for
  non-racer games**, so every other ROM stays byte-identical. Falls back to the
  un-rotated car if there isn't CHR room (needs `8 × pw×ph` free tiles, 32 for a
  2×2 car). `build_scene_inc` emits `car_rot_tiles[]`/`car_rot_attrs[]` +
  `BW_RACER_ROT`.
- **Engine** (`platformer.c`, `#if BW_GAME_STYLE == 3 && BW_RACER_ROT`): the
  player draw reuses the existing animation path — `anim_tiles = car_rot_tiles`,
  `anim_frame = racer_heading >> 1` — so 16 headings map to 8 frames (adjacent
  headings reuse a frame). The 4 right-angle frames are exact; the 4 diagonals
  are rougher (inherent to rotating 16×16 pixel art).
- **Test** `tools/builder-tests/racer-rotation.mjs`: the drawn player tile index
  changes with heading, headings 0 & 1 share a frame (the 16→8 mapping), and
  headings 0/2/8 are distinct frames. Full suite + the byte-identical ROM golden
  invariant green.

Pending the user's visual pass (draw a right-facing car, watch it rotate as it
drives — especially the diagonals). NES can't rotate sprites in hardware, so this
is per-heading CHR; a future option is flip-sharing (3 drawn frames → 8 via
H/V flips) to cut the CHR cost.

## Arc E §3 top-down racer — E3-4 laps & race goal — 2026-06-21

The racer is now an actual *game with a goal*: complete N laps to win. Built
before E3-3 (rotated art) because it's fully headless-verifiable and needs no
art-pipeline decision.

- **Lap model (deliberately simple)**: a lap = cross the **finish line**
  (behaviour slot 7 — the editor's renamable custom slot) → pass a **checkpoint**
  (the `trigger` slot, id 5) → cross the finish again. The checkpoint only *arms*
  the lap, so a pupil can't farm laps by sitting on the line, and **no checkpoint
  ordering is needed** (sidestepping the flagged ordering-UX question). Both
  markers are drivable (not edges). With none painted, no lap ever counts — the
  racer is just free-drive, which is also fine.
- **Race goal**: a Builder tunable **"laps to win" (1–9)** → `RACER_LAPS_TO_WIN`.
  On the winning lap the screen tints (the existing "you win" cue) and the car
  freezes. All `BW_GAME_STYLE == 3`-gated.
- **Validator** `racer-laps-need-markers` (warn): a racer with no finish and/or
  checkpoint can't complete a lap — tells the pupil it'll be free-drive.
- **Test** `tools/builder-tests/racer-laps.mjs` drives a real ROM round a track
  and asserts a full lap counts, re-crossing the finish without a fresh
  checkpoint does NOT (anti-farm), and the final lap sets the win flag + freezes
  the car. `racer-validators.mjs` gains the marker cases. Full suite + the
  byte-identical ROM golden invariant green.

(Also hardened `accounts.mjs`: its session-expiry check used a 1 s TTL that could
read as expired across an integer-second boundary under load — bumped to 3 s and
the expiry wait to 4 s. And widened `racer.mjs`'s accelerate window so it's robust
to the small startup-timing shift from the added racer code.)

Pending the user's in-person feel pass (drive a lap, win the race). Next: E3-3
rotated car art — needs an art-pipeline decision first.

## Arc E §3 top-down racer — E3-2 track-edge collision — 2026-06-21

Walls for the racer. The car can no longer drive through barriers, and it
handles them with a feel that suits a forgiving arcade racer.

- **Engine** (`platformer.c`, all `BW_GAME_STYLE == 3`-gated): `racer_on_edge()`
  scans every 8×8 cell the car covers for a track edge — `SOLID_GROUND` or
  `WALL` on the Behaviour page, i.e. the same "solid" vocabulary the platformer
  and top-down already use, so pupils paint barriers exactly as they know how.
  The per-frame movement now resolves **each axis independently**: a move that
  would land the car on an edge is undone on *that axis only*, so the car
  **slides along walls** instead of sticking.
- **Speed on contact — dominant-axis rule.** Speed is halved only when the axis
  carrying the bulk of the velocity is the one blocked (a head-on / steep hit).
  A shallow graze keeps its speed and slides. (The first attempt halved on *any*
  contact, which made sliding grind to a near-stop against any wall — switching
  to the dominant-axis rule fixed the feel.)
- **Test**: `tools/builder-tests/racer-collision.mjs` drives a real ROM into a
  painted `WALL` column and asserts the car pins against it (never penetrates),
  a head-on hit bleeds speed (768 → ~13), and a shallow approach slides along
  the wall at speed. Full suite + the byte-identical ROM golden invariant green
  (racer code is fully gated). No laps or rotated art yet (E3-3/E3-4).

Pending the user's in-person feel pass (driving into and along walls) before E3-3.

## Pupil accounts (T4.2) — P1 backend foundation — 2026-06-21

First slice of cross-device project save. Per the user's spec, an account stores
**only a non-real-name username + a scrypt-hashed password** — no email, no real
name, no analytics. All five design decisions were settled (class join-code gate;
both recovery routes; manual sync; many projects per account; HTTPS).

- **`tools/accounts.py`** (new, pure stdlib): a SQLite store
  (`users`/`sessions`/`projects`), `hashlib.scrypt` hashing for passwords and
  one-time recovery codes, sliding 30-day sessions, a per-IP `RateLimiter`, and
  username validation (3–20 chars, charset that rejects spaces/dots so common
  real-name shapes can't be used). Transport-agnostic so it unit-tests directly.
- **`playground_server.py`**: routes `POST /auth/signup` (gated on the class
  join-code, issues a session + one-time recovery code), `/auth/login`,
  `/auth/logout`, `/auth/reset` (recovery code), `/auth/admin/reset` (teacher,
  via `PLAYGROUND_ADMIN_SECRET`), and `GET /auth/me`. Session cookie is
  `HttpOnly`+`SameSite=Lax`, and `Secure` when the request is HTTPS. Config via
  env (`PLAYGROUND_JOIN_CODE`, `PLAYGROUND_ADMIN_SECRET`, `PLAYGROUND_ACCOUNTS_DB`,
  …). The DB is git-ignored (it holds password hashes).
- **Tests**: `tools/builder-tests/accounts.mjs` drives the live endpoints (20
  assertions incl. join-code gate, bad username/password, duplicate +
  case-insensitive usernames, login/logout, session expiry, recovery + admin
  reset with old credentials dying, rate-limiting). The harness + run-all now
  point server-based suites at a temp accounts DB so they never touch the real
  one. Full suite + the **byte-identical ROM golden invariant** stay green — this
  is server/editor infra, not codegen.

Then P2 (below). Next after that: P3 (editor UI wiring).

## Pupil accounts (T4.2) — P2 per-user project storage — 2026-06-21

The actual cross-device save, on top of P1's auth. Authenticated REST over
`/me/projects`: `GET` lists a pupil's saved games (metadata only), `POST`
creates one (returns an id), `GET /me/projects/{id}` round-trips the project
blob, `PUT` updates, `DELETE` removes. Blobs (the editor's serialised project
state, opaque to the server) are size-capped at 4 MB.

**Ownership is enforced in SQL** (`WHERE user_id = ?` on every query), so a
session can only ever see or change its own projects — never another pupil's.
`tools/accounts.py` gained `create/get/update/delete/list_project(s)`; the
server added `do_PUT`/`do_DELETE` and the `/me/projects` routes behind a
`_require_user` session check.

Test `tools/builder-tests/account-projects.mjs` (16 assertions): signed-out →
401 on every route; create/list/get/update/delete round-trip; **cross-user
isolation** (a second pupil gets 404 trying to see/fetch/change/delete the
first's project, and the original is left intact); oversize blob → 413. Full
suite + the byte-identical ROM golden invariant stay green. Next: P3 (editor UI
— "Save to / Load from my account", needs an in-person pass).

## Arc E §3 top-down racer — design doc + E3-1 movement spike — 2026-06-21

The third game style is under way. Wrote the dedicated design doc
([`docs/plans/current/2026-06-21-topdown-racer.md`](../plans/current/2026-06-21-topdown-racer.md))
settling the open decisions (16-direction heading, signed 8.8 fixed-point, the
16-entry Q7 `COS16` table with `sin(h)=COS16[(h+12)&15]`, accel/friction tunables,
metatile track authoring, push-back collision, deferred rotated art + laps), then
built the **E3-1 movement spike**:

- **Engine** (`builder-templates/platformer.c`, all `#if BW_GAME_STYLE == 3`-gated
  so the default ROM stays byte-identical): a `racer_heading` (0–15), 8.8
  `racer_speed`, and `px_sub`/`py_sub` sub-pixel accumulators; a per-frame block
  that steers (Left/Right = ∓1 heading), accelerates (A/Up, capped at
  `RACER_MAX_SPEED`) with friction when coasting, derives `vx/vy` from `COS16`,
  and advances `px`/`py` through the accumulators. The horizontal-walk block is
  now gated `!= 2 && != 3`; the racer reuses `scroll_follow` for the camera.
  Heading 0 = right, 4 = down, 8 = left, 12 = up (screen Y down).
- **Builder**: a `🏎 Racer` game-type option emitting `#define BW_GAME_STYLE 3`
  plus a `racerTopSpeed` (1–4) tunable → `RACER_MAX_SPEED`; a
  `racer-needs-scrolling-world` validator (blocking — a racer wants ≥2 screens in
  either axis so the camera can follow the car).
- **Tests**: `tools/builder-tests/racer.mjs` drives a real ROM in jsnes and
  asserts the physics (accelerate at heading 0 → +x only; coast → friction stops
  the car; steer → heading changes; velocity then follows the new heading via the
  cos table), and `racer-validators.mjs` covers the new validator. Both green; the
  full suite + golden-hash invariant still pass (the racer is fully gated).

No collision, laps, or rotated car art yet (E3-2…E3-4). **Pending the user's
in-person visual/feel pass** (does it drive like a car? any real-hardware
slowdown from the fixed-point math?) before E3-2.

## Arc E §2 infinite-runner — runner+modules compatibility test — 2026-06-20

Hardening after the dialogue finding: verified (and codified) that the
auto-runner coexists with the other Builder modules. `tools/builder-tests/
runner-modules.mjs` builds a runner game with HP + damage + HUD + pickups + win
all enabled and asserts no validator errors, a clean compile to a real ROM, and
that it still auto-scrolls — catching any future module change that conflicts
with the `BW_GAME_STYLE == 2` branch. All green (no conflicts today).

Also recorded a Sprint-7 finding (in the Arc D plan): the per-frame codegen
migration can't be done one-module-at-a-time — `pickups` must run before
`win_condition` (reads its counters), so migrating it alone would delay the
"collect them all" win by a frame. The migration needs an all-at-once,
order-preserving pass (incl. the scene-AI data-table redesign) — deferred as
zero-pupil-value-for-real-risk until something concrete needs it.

## Arc E §2 infinite-runner — dialogue disabled in auto-runner (pupil-reported) — 2026-06-20

In-person testing of the auto-runner found the dialogue box glitches the screen —
its in-vblank PPU writes fight the constant auto-scroll. Per the report, dialogue
is now disabled in auto-runner builds:

- `builder-modules.js`: the dialogue module's `applyToTemplate` emits **nothing**
  when the game type is `runner` (no `BW_DIALOGUE_ENABLED`, no per-frame trigger,
  no vblank writes) — disabled at the source, robust against any path.
- `builder-validators.js`: a `runner-dialogue-unsupported` **warning** tells the
  pupil dialogue is off in auto-runner games (so a ticked Dialogue module that
  doesn't appear isn't a mystery).

Non-runner dialogue is untouched (all dialogue suites green). Tests:
`runner.mjs` (asserts no `#define BW_DIALOGUE_ENABLED` in a runner+dialogue
build) + `runner-validators.mjs` (the warn). A proper in-runner dialogue would
need the Sprint-5 NMI/queue frame model — out of scope for §2.

## Arc E §2 infinite-runner — E2-3 A-to-jump remap — 2026-06-20

The auto-runner now also jumps on **A** (Geometry-Dash "tap to jump"), not just
the shared **UP**. The extra `(pad & 0x80)` edge in the jump trigger is
`#if BW_GAME_STYLE == 2`-gated, so the platformer/top-down controls and the
byte-identical golden are unchanged. `runner.mjs` taps A for its jump assertion.
Remaining E2-3 polish (death flash/sound, distance counter) wants a visual pass.

## Arc E §2 infinite-runner — E2-1 Builder validators — 2026-06-20

Two auto-runner validators in `builder-validators.js` (the Builder runner option
+ `AUTOSCROLL_SPEED` tunable already shipped in E2-0):

- **`runner-needs-scrolling-world`** (error) — an auto-runner on a background
  narrower than 2 screens can't scroll (the camera advances every frame but the
  world is one screen wide), so Play is blocked with a fix pointing at the
  Backgrounds page.
- **`runner-no-spike`** (warn) — an auto-runner with no spike tile painted
  (behaviour slot 7) has no hazards; the player can never lose.

Test: `tools/builder-tests/runner-validators.mjs` (1-screen→error, ≥2→ok,
no-spike→warn, spike→ok, platformer→neither). Full suite green.

Deferred (UI, needs a visual pass): a **"Spike" palette affordance** on the
Behaviour page — labelling/seeding the custom slot (id 7) as "spike" when the
game type is runner, so pupils don't need to know "slot 7 = spike". The
validators' fix-text names slot 7 in the meantime.

## Arc E §2 infinite-runner — E2-0 spike (BW_GAME_STYLE == 2) — 2026-06-20

First slice of the auto-runner / Geometry-Dash game style from
[`docs/plans/current/2026-06-18-arc-e-metatiles-and-game-styles.md`](../plans/current/2026-06-18-arc-e-metatiles-and-game-styles.md)
§2 (most-requested new style, F24).

- **Engine** (`builder-templates/platformer.c`), all gated `#if BW_GAME_STYLE
  == 2`: the camera auto-advances (`cam_x += AUTOSCROLL_SPEED`), the player rides
  it at a fixed screen X (`px = cam_x + RUNNER_SCREEN_X`; manual left/right is
  skipped via `#if BW_GAME_STYLE != 2`), it reuses the shared platformer
  jump/gravity (the vertical block's guard widened to `== 0 || == 2`), and
  `runner_respawn()` snaps back to the start on touching a spike tile
  (behaviour slot 7, `BW_RUNNER_SPIKE_ID`), falling below the world, or reaching
  the end. The camera follow is `#if BW_GAME_STYLE != 2`-gated.
- **Builder** (`builder-modules.js`): the `game` module gained a
  **🏃‍➡️ Auto-runner** type emitting `#define BW_GAME_STYLE 2` plus a 1–4
  `AUTOSCROLL_SPEED` tunable.
- **Byte-identical golden UNCHANGED** — every runner block is `==2`/`!=2`-gated,
  so the no-modules (`==0`) ROM compiles to the same bytes; the platformer +
  top-down suites stay green.
- **Test** `tools/builder-tests/runner.mjs`: a 4×1 auto-scroll world — asserts
  the camera advances, the player is camera-locked, tap-UP jumps, and touching a
  spike resets the run.

Deferred to later phases: validators (require screens_x ≥ 2; warn if no spike
painted) + a Behaviour-page "Spike tile" affordance (E2-1); the A-to-jump remap
(jump is currently the shared UP, E2-3); nicer spike-ribbon authoring once §1
metatiles land (E2-4).

## Arc E §1 metatiles — E1-1 UI Slice 5 (block copy/paste) — 2026-06-20

R-9 region copy/paste, on the metatile grid — completes the metatile authoring
feature (promote · stamp · edit · +new · delete · copy/paste):

- The **Select** tool is re-enabled in metatile mode (paint tools stay locked).
- `copyNtRegion` / `pasteNtRegion` gained 16×16 branches: marquee a region,
  **Copy region**, hover, **Paste here** → whole **blocks** (mtmap ids) are
  copied/pasted via a separate `mtRegionClipboard` (tile coords → metatile by
  `>>1`; pasted ids out of range fall back to block 0). Builds big block-levels
  fast.

The marquee overlay is tile-granular while copy/paste snap to whole blocks (a
minor visual nicety to refine later). Suite green; needs a visual pass.

## Arc E §1 metatiles — E1-1 UI Slice 4 (block delete) — 2026-06-20

Completes metatile block CRUD (promote → stamp → edit → +new → delete):

- `MetatileLib.deleteBlock(bg, id)` removes a block, falls its placements back
  to block 0, and shifts higher ids down so the map stays valid; refuses to
  delete the last remaining block. Unit-tested in `metatile-lib.mjs`.
- Wired to a **🗑 Delete block** button in the mini-editor (with confirm). The
  palette select gained a tooltip stating the one-palette-per-16×16-block rule.

**Deferred (own follow-up): R-9 region copy/paste on the metatile grid** — the
select/copy/paste machinery operates on the 8×8 nametable and is disabled in
metatile mode; adapting it to `mtmap` regions is self-contained but non-trivial,
so it's left for a dedicated change. The per-block editor already covers "make a
block once, stamp it everywhere."

Suite green. Needs a quick visual pass on the delete button.

## Arc E §1 metatiles — E1-1 UI Slice 3 (block mini-editor) — 2026-06-20

You can now create + edit blocks, not just stamp the auto-built set:

- An inline **mini-editor** for the selected block: a 4× preview
  (`drawMetatileSwatch` gained a zoom arg), a **palette** select, a
  **behaviour** select (from the project's behaviour types), and **+ New block**
  (copies the selected block to start from).
- Set a corner's tile by picking a tile in the tileset, then clicking that
  quadrant of the preview. Palette/behaviour apply to the whole 16×16 block.
- Edits apply immediately (one undo each) and re-render the library swatches +
  the canvas (every placed copy of that block updates).

Suite green (index.html syntax + promote-roundtrip). Needs a visual pass. Last
slice (4): read-only-palette cue + R-9 copy/paste on the metatile grid + block
delete.

## Arc E §1 metatiles — E1-1 UI Slice 2 (block library + stamping) — 2026-06-20

Makes metatile mode actually paintable (on top of Slice 1's promote/render):

- A **block library** strip appears in metatile mode — one 16×16 swatch per
  metatile, drawn from its 4 tiles + palette (`drawMetatileSwatch` /
  `renderMetatileLibrary`). Click a swatch to select it (highlighted).
- **Click or drag the grid to stamp** the selected block —
  `stampMetatileAt(x,y)` writes `mtmap[y>>1][x>>1]` and re-renders; one undo per
  stroke, no-ops on unchanged cells.

Suite green (index.html syntax + promote-roundtrip). Canvas behaviour needs a
visual pass. Next: Slice 3 mini-editor (create/edit blocks), Slice 4 polish.

## Arc E §1 metatiles — E1-1 UI Slice 1 (Promote / render / revert) — 2026-06-20

First slice of the metatile authoring UI on the Backgrounds page (`index.html`),
built on the tested `MetatileLib`:

- **🧱 Promote to metatiles** button — turns the current 8×8 background into
  16×16 metatile blocks (auto-builds the starter block library from the current
  art via `MetatileLib.promote`). **↩ Back to 8×8 tiles** flattens it again
  (`MetatileLib.expand`).
- `renderNametable` + `renderFullPreview` render a 16×16 background by expanding
  its metatile map (so the canvas matches the built ROM exactly), with a bold
  16×16 grid overlay. The 8×8 paint tools + size selector are locked in metatile
  mode (`syncMetatileControls`) — block painting/editing is the next slice.
- **Headless guard `promote-roundtrip.mjs`:** a palette+behaviour block-uniform
  8×8 background builds to the **byte-identical ROM** after promote, proving the
  editor→server metatile path is non-destructive. (Also fixed both metatile tests
  to build via the tempdir `/play` path so they don't pollute the shared
  Step_Playground tree / the byte-identical golden.)

Pupil-facing caveat: promote coarsens per-8×8-cell palette **and** behaviour to
one-per-16×16-block (the block's top-left) — by design for metatiles. Remaining
slices: library panel + click-to-stamp, mini-editor, copy/paste. **Needs a
visual pass** (canvas rendering isn't headlessly verifiable).

## Arc E §1 metatiles — E1-1 headless half (shared MetatileLib) — 2026-06-20

The UI-agnostic logic for metatile authoring, ahead of the canvas UI.

- **New `tools/tile_editor_web/metatiles.js`** exposing `MetatileLib`:
  - `migrate(state)` — additive: 8×8 backgrounds are left untouched (saves stay
    stable; the server defaults a missing `tileMode` to `8x8`), 16×16 bgs get
    their `metatiles`/`mtmap` arrays ensured, an unknown `tileMode` normalises to
    `8x8`.
  - `promote(bg)` — one-way 8×8→16×16: scans the nametable in 2×2 blocks, dedups
    them into a library, and builds the metatile-id map. Palette + behaviour come
    from each block's TOP-LEFT cell — matching the NES 16×16 attribute
    granularity the server already downsamples to, so a promoted background
    renders identically to the original (the §1.2 "correct by construction").
  - `expand(bg)` — 16×16→8×8 nametable+behaviour for live preview; mirrors the
    server `_expand_metatile_bg` **byte-for-byte**.
- **Centralised in one module** (not duplicated per page) — deliberately
  avoiding the per-page migration drift that caused BR-01.
- **Wired into `index.html`** (script tag + `MetatileLib.migrate` in
  `migrateState`); no UI yet, additive, no behaviour change for 8×8 projects.
- **Test `tools/builder-tests/metatile-lib.mjs`:** migrate additivity, promote
  dedup/map, promote→expand round-trip, JS↔server `expand` parity, and the
  non-uniform-block→TL-palette case.

Left for the UI half (E1-1 proper): the library panel + mini-editor + canvas
stamping, the per-bg `8x8|16x16` toggle + Promote button, read-only palette
swatches, and R-9 region copy/paste on the metatile grid.

## Arc D Sprint 4 — `-Os` ENABLED (corrected diagnosis) — 2026-06-20

Supersedes the "reverted" entry below. `-Os` is **on** (`CFLAGS = -Os`) and the
full `run-all.mjs` is green under it (golden-hash invariant re-pinned to the
`-Os` hashes `1730448e…` / `_rom-equiv` `42a45ca8…`).

The first flip *looked* like it regressed two render tests, but tracing the
player's `py` over time disproved a miscompilation:

- `behaviour_at` returns identical, correct values under both `-O` levels.
- A scroll build streams its whole 2-screen world into VRAM over many vblanks
  **before the main loop runs**, and that load is `-O`-sensitive — `-Os` reaches
  the main loop ~45 frames sooner. So at the tests' fixed 120-frame settle,
  no-opt was still mid-fall (py 178) while `-Os` had already landed on the floor
  (py 208). Run no-opt longer and it lands at 208 too. **Both builds are
  correct; neither strands the player — there is no collision bug.**
- The two tests were sampling at a fixed frame count and catching the player
  mid-fall. Fixed by making them **settle-to-rest** (`render-dialogue-box`
  Case 2 now settles ≥200f with the NPC at the floor-rest height;
  `render-walker-wall-stop` tolerates a couple of tiles of early-load drift).

**Still recommended:** an FCEUX/Mesen A/B timing pass — jsnes isn't cycle-
accurate, so it can't confirm `-Os`'s scroll bursts fit the NTSC vblank budget
on real hardware. Revert is one line (`CFLAGS =` + the `00e156fb…` goldens).

**Lesson:** "looks like an `-Os` miscompile" was fragile-test + load-timing —
the render harness forced the trace that revealed the truth; always trace before
concluding.

## Arc D Sprint 4 — `-Os` trial flipped + REVERTED (render regression) — 2026-06-20

Attempted the cc65 `-Os` flip now that the golden-hash test net was ready. It
built cleanly and even kept the no-modules ROM cross-file-identical (stock ==
template == `1730448e…` under `-Os`), but the **Arc A render harness caught two
real regressions under jsnes**:

- `render-dialogue-box.mjs` — in the **SCROLL_BUILD** path the dialogue banner
  stopped drawing (tiles read as scenery, not letters) — the timing-sensitive
  scroll/vblank-burst hazard, a visual bug that would have shipped to pupils.
- `render-walker-wall-stop.mjs` — walker spawn timing shifted (x 80 → 87).

Reverting `CFLAGS` to empty makes both green again, so `-Os` is the cause and is
**not safe as-is**. Reverted the flip; **kept** the golden-hash test reframing
(a clean improvement on its own). Re-enabling `-Os` now needs a cc65 codegen
investigation of the scroll burst (volatile/barriers on the unrolled `$2007`
writes, a per-file pragma, or a narrower `-O`) — not just the test reframing +
an FCEUX pass. The captured `-Os` hashes are kept in comments for the next try.

**The render harness paid for itself:** it caught a real `-Os` timing regression
headlessly, before FCEUX or a pupil saw it.

## Arc D Sprint 4 — `-Os` headless prep (golden-hash test reframing) — 2026-06-20

Prepared the test net for the cc65 `-Os` optimisation flip without making the
flip itself (which needs a human FCEUX/Mesen timing pass). From
[`docs/plans/current/2026-06-18-arc-d-codegen-followthrough.md`](../plans/current/2026-06-18-arc-d-codegen-followthrough.md)
Sprint 4 (T4.1/T4.2).

- **`run-all.mjs` byte-identical invariant re-founded on frozen golden hashes.**
  The old check compiled two different files (stock 779-line `main.c` vs the
  1473-line `platformer.c` template) and asserted equal bytes — which only holds
  while `CFLAGS` is empty (`-Os` makes cc65 choose differently per file). It is
  now two independent checks: `GOLDEN_STOCK` and `GOLDEN_TEMPLATE` (both
  `00e156fb…` captured no-opt), each file vs its own pinned hash, with a loud
  regeneration procedure documented inline.
- **Advisory equality kept** (`GOLDEN_STOCK === GOLDEN_TEMPLATE`) so the
  "template adds nothing at no-modules" guarantee is still enforced until `-Os`
  flips; it is dropped at the flip (when the two legitimately diverge).
- **Left to a human:** flip `Makefile` `CFLAGS = -Os`, re-capture both goldens,
  drop the advisory, and run the mandatory FCEUX/Mesen A/B pass (scroll-burst
  tearing, dialogue-while-scrolling, audio tempo). The flip is now a ~3-line
  change behind a ready test net; revert is one line.

## Arc E §1 metatiles — server-side-expansion spike (E1-0) — 2026-06-20

First slice of 16×16 metatiles from
[`docs/plans/current/2026-06-18-arc-e-metatiles-and-game-styles.md`](../plans/current/2026-06-18-arc-e-metatiles-and-game-styles.md)
(§1.8).  A metatile = 2×2 tiles + one palette + one behaviour id; a background
can be authored as a grid of metatile ids over a per-bg library.

- **`_expand_metatiles(state)`** (+ `_expand_metatile_bg`) in
  `playground_server.py`: expands any `tileMode:'16x16'` background
  (`metatiles[]` + `mtmap[][]`) into the ordinary 8×8 `nametable`/`behaviour`
  grids before any emitter reads them, and sizes `dimensions` to span it.  Wired
  in once at the top of the `/play` build, so every existing path (single
  nametable, world nametable, behaviour map) is reused **unchanged**.
- **No engine / `scroll.c` / `platformer.c` / baseline change** — 8×8
  backgrounds are a no-op, so the byte-identical-ROM invariant stays green.
- **Kills the §1.2 palette desync at the data layer:** all four 8×8 cells of a
  metatile share its one palette, so every 16×16 attribute quadrant is uniform
  *by construction* (the old emitter silently downsampled per-cell palettes).
- **Test:** `tools/builder-tests/metatiles.mjs` — (A) asserts every attribute
  quadrant is single-palette against the real server expansion, and (B) builds a
  hand-authored checkerboard metatile project to a real iNES ROM through `/play`.

Next: **E1-1** (authoring UI + state migration + promote helper) — the state
shape (`tileMode`, `metatiles[]`, `mtmap[][]`) is now settled by the spike.

## Arc D Sprint 7 — codegen migration (safe parts) + asm-path reconcile — 2026-06-20

Landed the **additive, headless-verifiable** slices of Sprint 7 from
[`docs/plans/current/2026-06-18-arc-d-codegen-followthrough.md`](../plans/current/2026-06-18-arc-d-codegen-followthrough.md);
the per-frame module migrations (T7.1–T7.5) are deferred on a design decision
(see the finding below).  Full `run-all.mjs` green; byte-identical golden intact.

- **T7.7 — dead `events` id removed** from `MODULE_ORDER`
  (`builder-assembler.js`).  It had no catalogue entry/validator/emission and was
  silently skipped every build — zero behaviour change.
- **T7.6a — role table de-duplicated.** `playground_server.py` now renders the
  11 sprite role codes from one `ROLE_TABLE` source into **both** the C
  `#define` (`build_scene_inc`) and asm `.define` (`build_scene_asminc`) paths
  via a shared `_role_defs()`; verified byte-identical to the old hand-written
  tables, so a single edit can't desync them.
- **T7.6b — honest asm scope banner.** `build_scene_asminc`'s generated header
  and `main.s.starter` now state the asm `/play` path is raw 6502 — single
  player, no Builder modules (HUD/P2/dialogue/win/pickups/damage/doors/scene are
  C-only).  Comments only → assembled bytes unchanged.
- **T7.6c — asm/C parity guard** added to `run-all.mjs`: asserts both scene
  emitters share the role-code source and the `player_tiles`/`NUM_STATIC_SPRITES`/
  `ss_*` identifiers, so a future rename can't silently break the asm path's
  "names carry across" pedagogy.
- **T7.6d — `asm-play.mjs` smoke test:** builds the asm starter through `/play`
  and asserts a real iNES ROM — the asm path had **zero** coverage before, so it
  could have silently stopped compiling.
- **`_rom-equiv.mjs`** standing guard: pins the everything-on ROM hash
  (`ce62ec47…`) to catch accidental codegen drift.

**Finding (documented in the Arc D plan):** the per-frame module migrations
(T7.1–T7.5) can't be done **byte-identically one-at-a-time** — `appendToSlot`
accumulates all modules' per-frame loops at one ordered marker, so migrating a
single module into a `#if` block reorders it relative to the non-migrated ones
and changes the emitted-C byte layout.  Byte-identical needs an all-at-once,
order-preserving migration (incl. the hard `scene` case), which wants the
behavioural/FCEUX review the plan reserves for that risk class.  Deferred with a
recommended approach rather than shipping a fragile partial change.

## Bug-fix sweep — 2026-06-20 report (BR-01 … BR-08) — 2026-06-20

Fixed the eight confirmed defects from
[`docs/bug-report-2026-06-20.md`](../bug-report-2026-06-20.md).  Plan +
per-bug solutions:
[`docs/plans/current/2026-06-20-bug-report-fix-plan.md`](../plans/current/2026-06-20-bug-report-fix-plan.md).
Each fix ships with a regression test; full `run-all.mjs` (byte-identical
invariant, all ROM builds, all suites) is green.

- **BR-02 (High) — debounced saves could lose the last edit.** Added a shared
  flush hook in `storage.js` (`setFlushHook`/`flushPending`/`renameCurrent`),
  called before every reload/switch (New/Duplicate in `wireBasicProjectActions`,
  the recovery snapshot in `project-menu.js`).  Each of `code.html`,
  `builder.html`, `behaviour.html` now defines `flushSave()`, registers it as
  the hook and on `pagehide`, and routes its bespoke switcher through it.  On
  Code, `flushSave()` first copies CodeMirror → state (the debounce was the only
  place that happened).  Test: `flush-save.mjs`.
- **BR-01 (High) — new Top-down projects assembled as Platformer.**
  `migrateBuilderFields()` (index + sprites) now seeds the canonical
  `builder.modules.game.config.type` from the `template` field, and the
  new-project handlers seed the Builder tree at creation, so Top-down emits
  `#define BW_GAME_STYLE 1`.  Test: `topdown-new-project.mjs`.
- **BR-03 (High) — large two-player sprites overran the 256-byte OAM shadow.**
  Guarded every Player 2 four-byte write (`oam_idx > 252`, outer + inner) in
  `platformer.c` — inside `#if PLAYER2_ENABLED`, so the byte-identical baseline
  is untouched.  Added a **blocking** validator when P1+P2 cells exceed 64 and a
  **warning** for the full player/scene/HUD frame budget.  Tests:
  `player-oam-budget.mjs` (validator) + `render-player-oam-overflow.mjs` (Arc A
  in-emulator: builds the over-budget two-8x8-player ROM through `/play` and
  probes `oam_idx` to prove no write past `oam_buf[255]`; negative-control
  verified).
- **BR-04 (Med) — invalid spawn-effect index failed late in cc65.** Both effect
  fields are now sprite **dropdowns** (new `spriteRef` field type bound to the
  live sprite list); added **blocking** validators for the trigger and damage
  effect references; `playground_server.py` fails early with a clear message
  (`_spawn_required` + range check) instead of emitting inconsistent C.  Test:
  `spawn-effect-refs.mjs`.
- **BR-05 (Med) — trigger + damage effects silently shared one pool.** Fixed via
  **model B (independent effects)**.  The engine spawn pool gained a per-slot
  `spawn_kind` (0 = trigger, 1 = hit), two lifetimes (`SPAWN_TTL_0`/`_1`) and two
  art tables (`SPAWN0_*`/`SPAWN1_*`); `bw_spawn(x, y, kind)` stamps each slot and
  the render picks that kind's art.  The spawn module emits kind 0, the damage
  module kind 1; the server emits the two art tables independently and validates
  each source's sprite separately.  The UI already had independent fields, so no
  new UI was needed.  All under `#if BW_SPAWN_ENABLED` → byte-identical baseline
  preserved.  The interim shared-effect conflict warning was removed (no conflict
  remains).  Tests: `spawn-effect-refs.mjs`, `spawn.mjs`.
- **BR-06 (Med) — Player 2 uncontrollable in the Sprites preview.** Ported the
  `{pad, button}` two-controller map (IJKL/O/U/1/2 → pad 2) into the Sprites
  private emulator and dispatched via `m.pad` (matching the Code-page fix +
  `emulator.js`); P2 key hint shown only when P2 is on.  Cross-page guard:
  `emulator-p2-keys.mjs`.
- **BR-07 (Low) — Builder/Code rename updated only half the project.** Added
  `Storage.renameCurrent(state, name)` (updates state + catalog atomically);
  Builder and Code name handlers now use it.  Test: `rename-project.mjs`.
- **BR-08 (Low) — checkpoint respawn HP could exceed Max HP.** Generated C now
  clamps `player_hp` to `PLAYER_MAX_HP` on respawn (spelled out, no `min`
  macro); added a warning validator for over-max configs.  Test: `respawn-hp.mjs`.

## Arc C finale — R-8 checkpoints · R-3/R-6 spawn pool · R-9 region copy/paste — 2026-06-19

The last four Tier-2 pupil requests
([`docs/plans/current/2026-06-18-arc-c-tier2-backlog.md`](../plans/current/2026-06-18-arc-c-tier2-backlog.md)
R-8, R-3, R-6, R-9). `run-all.mjs` green, **byte-identical baseline intact**,
each render- or unit-tested.

### R-8 — checkpoints (Damage module)

Opt-in **Checkpoints** + **HP restored on respawn**. With it on, walking the
player's centre onto a **Door** tile saves a respawn point; on death the player
restarts there with restored HP instead of the permanent game-over freeze. The
engine death-handler is gated `#if BW_CHECKPOINTS` (the `#else` is the old
freeze), so off → byte-identical. Render-tested end-to-end (`checkpoint.mjs`:
walk onto a door, die to an enemy, respawn at the door — not the spawn, never
stuck at `player_dead`).

### R-3 / R-6 — the spawn pool (engine + `spawn` & `damage` modules)

The biggest Arc C lift: a fixed pool of runtime-activated effect sprites in the
engine, **all behind `#if BW_SPAWN_ENABLED`** (default `0` via `#ifndef`), so a
no-spawn ROM compiles the whole subsystem out and stays byte-identical.

- **Engine** (`platformer.c`). `spawn_active/_x/_y/_ttl[SPAWN_MAX=4]` + a
  `bw_spawn(x, y)` activator + a render pass after the scene sprites (same
  `oam_idx <= 252` guard, `world_to_screen_*` under `SCROLL_BUILD`); ttl
  decrements each frame and the slot deactivates at 0.
- **Server** (`playground_server.py`). `_spawn_art_index` / `_spawn_art_lines`
  emit `SPAWN_W/H` + `SPAWN_TILES/ATTRS` from the chosen sprite — **only when a
  spawn art is configured** (the R-7 trick: cc65 emits even *unreferenced* const
  arrays, so an always-present table would shift the baseline).
- **R-3 — `spawn` module.** "Spawn effect on a trigger tile": when the player's
  centre first enters a **TRIGGER** tile (rising-edge
  `behaviour_at == BEHAVIOUR_TRIGGER`, mirroring the doors probe), pop the chosen
  sprite for a TTL. Registered in `MODULE_ORDER` *before* `damage` so its art +
  ttl take precedence when both consumers are on.
- **R-6 — `damage` spawn-on-hit.** "Show an effect sprite when the player is
  hit": the existing `dmg_hit` fires `bw_spawn(px, py)`. Both consumers
  `#ifndef`-guard `BW_SPAWN_ENABLED` / `SPAWN_TTL`, so they coexist cleanly.
- **Tested** (`spawn.mjs`): emit guards + a running ROM asserting on a RAM
  mirror of the live active-slot count — the pool activates on a hit / trigger
  entry and **drains to zero between events** (not a stuck sprite).

### R-9 — background region copy/paste (`index.html`, editor-only)

A new **"Select region (drag)"** nametable tool: drag a tile-accurate marquee,
**Copy region** (or Ctrl+C in select mode), hover the destination, **Paste
here** (or Ctrl+V). Pure editor — zero engine/codegen. Copy deep-clones each
`{tile, palette}`; paste snaps its anchor to the 2×2 attribute block (palette is
a block property on NES — matches every other palette tool) and is a single undo
step. Unit-tested headless (`region-copy-paste.mjs`) by extracting the R-9 block
straight out of the inline script and exercising copy / clone / snap / undo
against a synthetic nametable.

---

## Arc C — R-7 press-a-button-to-attack animation — 2026-06-19

A one-shot "attack" animation bound to A or B
([`docs/plans/current/2026-06-18-arc-c-tier2-backlog.md`](../plans/current/2026-06-18-arc-c-tier2-backlog.md)
R-7). `run-all.mjs` green, byte-identical intact, render-tested (`attack.mjs`).

- **Server.** `build_scene_inc` / `build_scene_asminc` now emit
  `ATTACK_FRAME_COUNT`/`ATTACK_FRAME_TICKS` + `attack_tiles`/`attack_attrs`
  driven by `animation_assignments.attack` — but **only when an attack animation
  is assigned**, unlike walk/jump's always-present `{0}` placeholders.  The
  attack code is fully `#if`-gated, and cc65 emits even *unreferenced* const
  arrays, so an always-present placeholder would have shifted the no-attack
  baseline ROM (verified: it does); omitting it keeps the byte-identical
  baseline at its original hash.
- **Module.** Player 1 gains an **Attack button** setting (None / A / B) →
  `#define BW_ATTACK_BUTTON 0x80`/`0x40`. The engine *also* gates on
  `ATTACK_FRAME_COUNT > 0`, so binding a button with no attack animation tagged
  is a harmless no-op rather than an error.
- **Engine.** A new `anim_mode == 3` (attack) takes top priority over walk/jump;
  it starts on a button **edge** (its own `attack_prev`, since `prev_pad` is
  already consumed by the jump edge), plays once, and clears when the cycle
  completes (single-frame attacks hold for the tick budget). Everything is
  `#if ATTACK_FRAME_COUNT > 0 && BW_ATTACK_BUTTON`-gated → the no-module ROM is
  byte-identical.
- **Editor.** `sprites.html` now derives/validates/renders the assignment for
  `ASSIGN_KINDS = ['walk','jump','attack']` (replacing the hard-coded
  `['walk','jump']` in ~8 places), so a sprite frame-set tagged **Attack** on the
  Sprites page is assigned to `animation_assignments.attack` automatically. The
  `attack` style tag already existed.
- **Verified.** `attack.mjs`: A→`0x80` / B→`0x40` / None→no macro; and a running
  ROM where pressing B swaps the player to the attack frames and reverts after
  one cycle (the one-shot).

## Arc C quick wins — R-10 character bob + R-4 enemy speed — 2026-06-19

Wave 2's two quick, visible pupil features
([`docs/plans/current/2026-06-18-arc-c-tier2-backlog.md`](../plans/current/2026-06-18-arc-c-tier2-backlog.md)).
`run-all.mjs` green, byte-identical invariant intact, both render-tested.

- **R-10 — character bob (opt-in).** The Globals module gains a "Bob up and down
  when walking" tick.  When on, the player sprite hops 1px on alternate ~8-frame
  phases while walking.  Engine: `#if BW_BOB_WHEN_WALKING` (default 0 → the
  no-module ROM is byte-identical; the `bob`/`bob_phase` symbols and the `+ bob`
  on the OAM-Y writes only exist when on, via `#if/#else`).  **Deviation from the
  plan:** driven by the **pad input** (a move direction + grounded), not
  `anim_mode`/`anim_frame` — those only advance when a walk *animation* is
  assigned (`WALK_FRAME_COUNT > 0`), so the planned approach would no-op on
  projects without one.  The pad-driven version bobs on any project; game-style
  aware (LEFT/RIGHT on a platformer, any direction top-down).  Verified by
  `render-character-bob.mjs` (player OAM Y oscillates 208↔209 while walking,
  rock-steady when off).
- **R-4 — per-instance enemy speed.** The scene module's walker/chaser AI took a
  hard-coded `+= 1`; each instance now carries a `speed` (px/frame, clamped
  1..4, default 1 = unchanged feel).  Pure JS (no engine/scene.inc change): the
  walker steps and the chaser's threshold + steps are all parametrised, so a
  fast chaser doesn't oscillate around the player.  `builder.html` gains a Speed
  number input beside the AI dropdown (greyed out for static/non-enemy
  instances).  Verified by `enemy-speed.mjs` (emit asserts ±3 not ±1; the chaser
  uses the speed-2 threshold; a running speed-3 walker advances 3px/step) and a
  `speed: 3` walker added to the all-modules fixture.
- *Note:* `bw_sprite_blocked` probes 1px ahead, so at speed ≥ 2 a fast enemy can
  step its body slightly into a wall before reversing the next frame — fine for
  Tier 2 (it just turns a frame late); the proper fix (a `step`-aware probe) is
  the natural shared step toward enemy paths (T2.8).

## Arc B — a readable dialogue box — 2026-06-19

Implements Wave 2's "finish dialogue" item
([`docs/plans/current/2026-06-18-arc-b-readable-dialogue-box.md`](../plans/current/2026-06-18-arc-b-readable-dialogue-box.md)).
Closes the last dialogue gap: text used to render in whatever BG palette the
pupil's scenery happened to use under the box, so on many projects it was
low-contrast or invisible. Now the text colour is fixed (white) on any project.
`run-all.mjs` green, byte-identical invariant intact. Verified with the Arc A
render harness.

- **Full-width banner (the box).** On open, the dialogue draws a solid
  full-width band spanning the whole attribute row(s) the text occupies — every
  cell becomes a glyph or a blank box tile (`0x20`). Because a blank cell shows
  colour 0 = the shared `universal_bg` in *any* palette, the box body is uniform
  without a dedicated fill tile, and because the band is fully filled, the next
  step can recolour it with no bleed onto scenery. (Chosen over a narrow box by
  the user — the NES 16×16 attribute granularity forces one or the other.)
- **Reserved BG sub-palette 3 = white text.** The server overrides
  `bg_palettes[3]` with `[0x30, 0x16, 0x0F]` when the dialogue module is on
  (`_palette_slots_for` in `playground_server.py`), and the banner points its
  attribute rows at palette 3. So the text is white regardless of the scenery
  palette. Whole-byte attribute writes (the band is snapped to the 4×4 attribute
  grid); camera-relative on scrolling maps; tiles AND attribute bytes restore on
  close from the ROM-resident `bg_nametable_0` / `bg_world_attrs` arrays (never a
  VRAM read-back). Gated behind `BW_DIALOGUE_ENABLED` → byte-identical-safe.
- **Editor.** BG palette **P3** is shown reserved (🔒 + read-only slots + a
  notice) while the Dialogue module is on, so pupils don't edit it expecting an
  effect — mirrors the reserved letter-tile UI.
- **Verification.** New `render-dialogue-box.mjs` drives a deliberately hostile
  background and asserts the text is recoloured to palette 3, that palette's
  text colour is genuinely white (jsnes `imgPalette` → `0xffffff`), the banner
  overwrote the scenery, scenery outside the banner is untouched, and it all
  round-trips on close — plus a 2×1 scroll-build case. `render-dialogue-visible`
  and the `round2-dialogue` guards were updated for the banner.
- **Harness note.** The banner issues many more mid-vblank `$2006` writes than
  the old text path, and jsnes mis-restores the PPU scroll afterwards (correct on
  real hardware), so the rendered framebuffer is unreliable for dialogue. The
  render tests therefore assert on the nametable + decoded attribute table +
  loaded palette (all exact), which together prove legibility. A separate
  observation logged for follow-up: on a scroll build the player settles ~32px
  higher than on a non-scroll build (a collision quirk, unrelated to dialogue).
- **Box body fix — distinct dark box (reported 2026-06-19 FCEUX; fixed same
  day).** The box body was blank tiles = colour 0 = the shared `universal_bg`,
  so the box matched the backdrop and the scenery's detail in those rows looked
  like it "vanished" instead of reading as a box. Fixed by re-seeding the font's
  "off" pixels as colour **2** instead of 0 (one line in `_glyph`): letters
  become white-on-box and the space glyph becomes a solid colour-2 tile — which
  is exactly the box-body fill the banner already writes (`0x20`), so the banner
  code is unchanged. Palette 3 colour 2 = **navy (`0x01`)**, a dark colour that
  stays visible on light *and* dark/black backdrops (navy ≠ black), so a border
  frame is not needed for the common cases. `render-dialogue-box.mjs` now also
  asserts the box body is distinct from the backdrop and darker than the text.
  Still seed-into-blank-slots only, so byte-identical/no-dialogue ROMs are
  unaffected.

## Arc A — render-test harness + 4 backfill suites — 2026-06-18

Implements Wave 1 of the next-phase master plan
([`docs/plans/current/2026-06-18-arc-a-render-test-harness.md`](../plans/current/2026-06-18-arc-a-render-test-harness.md)).
Closes the gap that let every recent *visual* bug reach pupils: the suite
could prove a project *compiled* and stayed *byte-identical*, but it couldn't
*see the screen*.  `tools/builder-tests/run-all.mjs` green throughout,
byte-identical invariant intact.

- **The harness — `tools/builder-tests/lib/render-harness.mjs`.**  Boots a
  compiled pupil ROM in jsnes headless (in Node) and reads the *rendered*
  output: nametable tiles, OAM sprites, the RGB framebuffer, and CHR straight
  from the ROM.  Helpers for server/build lifecycle, controller input, fixture
  construction, and frame metrics (`countNonBg`, `dominantColor`,
  `saturatedFraction`, `frameDiffFraction`, `chrTile`).  Lives in `lib/` so the
  runner's `*.mjs` glob never treats it as a suite.
- **Four backfill render regressions** for bugs that recently reached pupils:
  `render-dialogue-visible` (B-2 — box opens on B, "HELLO" reaches the
  nametable + screen, clears on close), `render-tint-not-flood` (B-4 — win tint
  fires but keeps its colour; the greyscale wash-out drops the saturated-pixel
  fraction from 0.66 to 0.22), `render-font-glyph` (B-2 — the seeded font lands
  in the CHR and matches the engine font), and `render-walker-wall-stop` (B-1 —
  a walker enemy bounces at a wall instead of passing through).
- **Engine fix surfaced by the harness — dialogue VRAM burst now disables
  rendering on non-scroll builds.**  The non-scroll dialogue path wrote its
  vblank tile burst with rendering left on; a multi-row dialog (up to 3×28 PPU
  writes) can overrun vblank and corrupt the PPU pointer — the bug shows as only
  part of the text appearing.  The dialogue module now brackets the burst with
  `PPU_MASK = 0` / `0x1E`, gated `#ifndef SCROLL_BUILD` (the scroll path already
  clears `PPU_MASK` around the whole window) and only on draw/clear frames — so
  it's byte-identical-safe (dialogue-off projects are unchanged).
- **Two jsnes-fidelity findings, documented in the harness README** so future
  render suites don't re-learn them: (1) a **one-frame input latency** — a press
  must be held ≥2 frames before release or the engine never sees it; (2) jsnes
  doesn't restore the PPU scroll after the engine's mid-vblank `$2006`/`$2005`
  writes, so dialogue text renders at the wrong *scanline* (correct on real
  hardware) — assert on nametable/OAM/CHR or scroll-independent framebuffer
  facts, never on a fixed pixel box.  Also confirmed: `playerStart` is ignored
  on the customMainC build path (player always spawns at `(60,120)`), so
  positioning leans on the deterministic spawn + fall.

## Codegen rework — Sprints 1–3 — 2026-06-18

Acting on the architecture review
([`docs/reference/codegen-and-nes-architecture-review.md`](../reference/codegen-and-nes-architecture-review.md)),
implementation plan in
[`docs/plans/current/2026-06-18-codegen-rework-implementation.md`](../plans/current/2026-06-18-codegen-rework-implementation.md).
Three sprints shipped; `tools/builder-tests/run-all.mjs` green throughout,
including the byte-identical-ROM invariant.  Deferred (need FCEUX/visual
verification or are multi-day): `-Os` optimisation unblock, the NMI/dialogue
frame-model rework, 16×16 metatiles, asm-path reconciliation.

- **Sprint 1 — all-modules compile test (closes review §S2).**  New
  `tools/builder-tests/all-modules.mjs` builds one project with *every* module
  enabled (P1+P2, enemy walker, NPC dialogue, pickup, HUD, doors, trigger,
  win) and asserts the ROM compiles.  Nothing previously verified module
  *combinations* — the byte-identical test only ever exercised zero modules.
- **Sprint 2 — game-over tint moved into the engine (review §S1/§S4).**  The
  win/death `PPU_MASK` tints were hand-written hex inside emitted JS strings
  (where the 0x1F green-screen bug hid).  They now live in `platformer.c` as a
  fixed `#if`-gated "[engine] Game-over tint" block; the `damage` /
  `win_condition` modules only set the state flags (`player_dead` /
  `bw_won`) + emit `#define BW_WIN_ENABLED 1`.  Byte-identical-safe (gated off
  at no-modules).  This is the first proof of the "modules emit data; the
  compiled engine owns logic" migration the review recommends.
- **Sprint 3 — dialogue gets a real font (finishes web-feedback bug 31 /
  B-2 garbage half; review §N3).**  `playground_server.py` now ships a built-in
  8×8 UPPERCASE font (`_DIALOGUE_FONT`) and `build_chr()` seeds it into the
  *blank* bg tile slots at their ASCII indices whenever the dialogue module is
  on — so dialogue renders real letters without the pupil painting a font.
  Pupil art in an occupied slot is preserved.  The assembler uppercases text
  at emit so lowercase input matches the font; the old "no-font" validator is
  replaced by `dialogue-unsupported-chars` (warns only about characters
  outside the font).  New `tools/builder-tests/dialogue-font.mjs` inspects the
  built ROM's CHR to prove the glyphs land and pupil art survives.  *(The other
  half of B-2 — the "split-second stage glitch" from `draw_text`'s main-loop
  forced-blank — is the deferred frame-model rework, Sprint 5.)*

### Follow-up — per-NPC dialogue cc65 build error (2026-06-18)

A pupil project with **per-NPC override dialogue text** failed to build with
`src/main.c(NNNN): Error: Expression expected … Undefined symbol: 'dlg_total'`.
Cause: the dialogue vblank block declared `dlg_total` *after* the
`#if BW_DIALOG_PER_NPC` block, which emits an `if (...)` statement — and cc65's
default standard is C89, where a declaration may not follow a statement in the
same block.  It only triggered when `BW_DIALOG_PER_NPC` was 1 (an NPC has its
own text), so existing tests (whose NPC had no override) never hit it.  Fixed
by declaring `dlg_total` up front with the other locals and assigning it later
(`builder-modules.js`).  `all-modules.mjs` now gives its NPC override text so
the per-NPC path is compiled every run.  **Note for future codegen work: keep
all C declarations before the first statement in any emitted block.**

### Dialogue letter-tiles visible in the Backgrounds editor (2026-06-18)

The auto-seeded dialogue font (Sprint 3, server-side) is now visible and
manageable on the Backgrounds page so pupils understand the reserved letter
tiles instead of them appearing only at build.  When the dialogue module is
on, the tile palette tints the reserved letter slots (A–Z, 0–9, `. , ! ? ' - :`)
**red when empty** — they fill with the built-in font automatically at Play, so
pupils leave them empty (or draw their own letter).  A slot **painted over**
without confirming it gets a red conflict flag + a banner explaining that
dialogue using that character would show their art instead, with a
**"✓ it's my letter X"** button per slot (persisted in
`state.bg_glyph_confirmed`) or the option to move the art.  Files: `index.html`
(`renderTileset` red marking, `updateGlyphBanner`, `confirmGlyphTile`).
The marking is mirrored in both the main and the floating tile palettes.
The font character set now lives in three places — `_DIALOGUE_FONT`
(`playground_server.py`), `DIALOGUE_GLYPH_CHARS` (`index.html`) and `SUPPORTED`
(`builder-validators.js`) — kept honest by a `run-all.mjs` guard that fails if
their (non-space) sets drift.  Editor-only; no ROM/build change (the build seed
already fills blank slots and preserves painted ones).  *Browser UI — verify
the red tint + banner visually.*

### Follow-up — dialogue text invisible on scrolling maps (2026-06-18)

A pupil with a **multi-screen (scrolling)** background reported the dialogue
box opened (game paused) but **no text appeared**.  Cause: the dialogue draw
wrote to *fixed* nametable-0 coordinates (`0x2000 + row*32 + col`); on a
scrolled screen that lands off the visible area (e.g. at `cam_x=172` the box
fell at screen x −156).  This is the long-deferred item 11.  Fixed by anchoring
the box to the **current camera** under `#ifdef SCROLL_BUILD`: the world tile is
`(cam_x>>3)+col, (cam_y>>3)+row`, mapped to the right nametable (horizontal flip
at world col 32 → +$400, vertical at row 30 → +$800), re-pointing `PPU_ADDR` at
the 32-tile boundary so a box straddling two screens still draws, and restoring
cleared cells from `bg_world_tiles[]` instead of `bg_nametable_0[]`.
`pauseOnOpen` freezes the camera while the box is up, so the computed position
stays valid.  1×1 (non-scroll) projects keep the exact old `bg_nametable_0`
path (byte-identical; round2 A9 unchanged).  Verified: the camera-relative
address now lands on-screen (x 12 vs the old −156); a new
`tools/builder-tests/dialogue-scroll.mjs` compiles a 2×1 dialogue project
(incl. per-NPC); round2 gained an A9b guard for the `bg_world_tiles` restore.
*The on-screen render was confirmed by the address math + compile; a live
visual check on a scrolling game is still worth doing.*

---

## Web-form feedback fixes — 2026-06-17

Triaged 25 previously-untranscribed pupil submissions from the in-editor
feedback form (`spritemaker.co.uk/feedback`) — see
[`docs/feedback/web-feedback-2026-06.md`](../feedback/web-feedback-2026-06.md),
bugs 30–38 in
[`docs/feedback/recently-observed-bugs.md`](../feedback/recently-observed-bugs.md),
and the plan
[`docs/plans/current/2026-06-17-web-feedback-fixes.md`](../plans/current/2026-06-17-web-feedback-fixes.md).
Shipped the four highest-confidence bug fixes; `tools/builder-tests/run-all.mjs`
stays green including the byte-identical-ROM invariant, with a new guard per fix.

- **Trigger / game-over screen turned solid green (bug 33, feedback F5).**
  The win-freeze and player-death tints wrote `PPU_MASK = 0x1F | 0x20` /
  `0x1F | 0x80`.  The `0x01` greyscale bit sends jsnes down a
  `switch(f_color)` screen-flood path (verified in `jsnes.min.js`), painting
  the whole screen green (win) / blue (death).  Now `0x1E | 0x20` /
  `0x1E | 0x80` — greyscale off — so the intended subtle red/blue emphasis
  renders correctly in jsnes (`setEmphasis`) and on hardware.
  (`builder-modules.js`; `chunk-a-hp-hud.mjs` expectation updated.)
- **Enemies walked through walls / didn't bounce off blocks (bug 30,
  feedback F1a + F10).**  Walker + chaser scene-AI stepped position with no
  `behaviour_at()` probe.  Added a shared `bw_sprite_blocked()` helper
  (emitted into the file-scope `declarations` slot only when an enemy moves,
  so the byte-identical baseline is untouched); walkers reverse and chasers
  stop at SOLID_GROUND / WALL tiles and the screen edge.  (`builder-modules.js`.)
- **A jump animation silently played the walk animation (bug 38,
  feedback F16).**  The server drops animation frames whose size ≠ the
  player's, emitting `JUMP_FRAME_COUNT 0` → engine falls back to walk.  The
  Sprites page now warns under the walk/jump assignment dropdowns when an
  assigned animation has wrong-size frames, naming how many are skipped.
  (`sprites.html` — `animFrameSizeMismatch`.)
- **NPC dialogue showed garbage on gallery projects (bug 31, feedback
  F1b + F23) — partial.**  Dialogue renders text as raw ASCII tile indices,
  so a project with no font painted at 0x41–0x5A shows garbage.  Added a
  `dialogue-no-font` validator that warns (naming the blank-tile count) when
  dialogue is enabled without the needed glyph tiles.  The deeper fix
  (auto-seed a CHR font; restore the current room's nametable on close) stays
  deferred with items 11 / 28.  (`builder-validators.js`.)

---

## Bug sweep — 2026-06-15

Whole-platform review fixed 51 of 57 verified defects (incl. the
reported vertical/2×2 scrolling + palette corruption, a totally broken
Code-page "Play in NES", world-Y player teleport on tall screens, OAM
overflow, and many editor/tool/snippet bugs). Full detail, verification
status, and the deferred §T3.1/§T3.2 scroll-streamer work:
[`2026-06-15-bug-sweep.md`](2026-06-15-bug-sweep.md).

---

## Done

### Layout & proximity (Sprites page)

- **A1 — Active-colour row above the composition canvas.**
  The `#sprite-side-swatches` strip in `sprite-side-controls` was inert
  HTML before — `renderPinnedSwatches()` only populated the pixel
  editor's swatch row. Now it populates *both* targets, so the primary
  colour picker sits directly above the composition canvas while the
  pixel editor keeps its secondary swatches.

- **A2 — NES master next to the palette editor.**
  `#master-grid` moved out of the right panel and into `palettes-sub`,
  immediately under the sprite & background palette blocks. Picking a
  swatch and assigning it now happens within one visual group.

- **A3 — Right column is pure tileset.**
  With the master grid gone, the right panel hosts only the shared
  tileset canvas, the four-state legend, and the existing hint copy.

- **A4 — Collapsible sub-sections (partial).**
  Generic helper added: any `<details class="collapsible"
  data-collapse-key="…">` persists its open/closed state in
  localStorage via `initCollapsiblePersistence()`. Applied to
  Animations and Cell-inspector "Advanced tile properties". Other
  sections were left expanded by default — hands-on testing suggested
  too many collapsed groups made the page feel hidden rather than
  tidy.

### Tile-selection flow (Sprites page)

- **B1 — Auto-assign on first paint.**
  `autoAssignFreeTileToCell()` is called from both `spApply()`
  (composition canvas) and `teApply()` (pixel editor) when the
  selected cell is empty and the pupil starts painting. A 2-second
  toast (`✨ Used tile 0xNN for this cell`) confirms the action.
  `pushUndo()` is called once via the `undoAlreadyPushed` flag so a
  single Ctrl-Z reverses both the assignment and the first stroke.

- **B2 — One-click tile assignment.**
  Single-click on a tile in the shared tileset assigns it to the
  selected cell straight away. The previous "highlight, then press
  Assign" two-step is gone; the `📥 Assign 0x## to this cell` button
  was removed from the cell inspector. `[`/`]` + `Enter` and the tile
  picker dialog still work for power users.

- **B3 — Three-state cell inspector.**
  `renderCellStateBanner()` renders one of three banners with the
  obvious next action:
  - **Empty cell** → `📄 New blank tile`, `📋 Pick existing tile`.
  - **Using tile 0xNN — only in this sprite** → `🔄 Change tile`,
    `Clear`.
  - **Using tile 0xNN — also in *other_sprite*…** → `✂️ Make my own
    copy`, `🔄 Change tile`, `Clear`.
  The raw tile-index number input plus flip / palette / priority
  controls live under the collapsed "Advanced tile properties"
  disclosure.

- **B4 — Colour-coded tileset.**
  The tileset render already drew teal outlines for "in this sprite"
  and orange dashed outlines for "shared with other sprites". The
  legend swatches in the right panel now match those colours
  (`#1b9e77` teal, `#d95f02` orange, `#7570b3` purple) so the legend
  and the canvas read as the same system.

- **B5 — Empty cells look empty.**
  Already in place — `drawEmptyCellPlaceholder()` paints a dotted
  outline plus `?` glyph for unassigned cells in the composition
  canvas. Verified, no change needed.

- **B6 — Visible fork action.**
  Surfaced through the `✂️ Make my own copy` button in the
  shared-state banner (B3) and through the existing shared-tile
  dialog's duplicate option. The standalone "first time you paint a
  shared tile" inline nudge was *not* added — testing showed the
  banner button covers the same case earlier in the workflow, before
  the pupil paints anything they would regret.

### Misc

- `duplicateTileForCurrentCell()` extracted as a shared helper used
  by the `D` shortcut, the cell-state banner button, and any future
  "fork" entry points.

### Sprint 6 — 2026-04-20 gap-fillers

- **6.1 Tile 0 padlock on Sprites page + BG-colour explainer.**
  The read-only BG palettes under the pixel editor now mark slot 0
  with a 🔒 glyph, a yellow dashed outline, and a tooltip pointing
  pupils back to the Backgrounds page to change the universal BG.
  A short explainer paragraph sits above the four BG palette rows.
  On the Backgrounds page the `Background colour` swatch label gained
  two sentences ("Fills every empty spot and shows through tile 0." /
  "Shared by all four BG palettes — change it here once.") so the
  meaning is visible without opening the tooltip.

- **6.2 Explicit BG painting modes.** Already shipped in the
  2026-04-13 round (`nt-mode` radio buttons for 🖌 Paint tile / 🎨
  Paint palette / 🧽 Erase, persisted in `prefs.ntMode`, with
  mode-specific canvas cursors). Verified during this sprint.

- **6.3 Grid control (line width / colour / chunk lines).** Replaced
  the single "fine grid" checkbox with a `⊞ Grid ▾` popover that
  holds four controls: fine 8×8 grid on/off, chunk lines (2×2 attr
  blocks) on/off, line-width (1 or 2 px) and colour preset
  (yellow / cyan / white / dark). Settings persist to `prefs.grid`
  via `Storage.writePrefs`, so each pupil keeps their preferred grid
  across sessions and projects.

- **6.4 Keyboard shortcut overlay on Code page.** The Backgrounds
  and Sprites pages already bound `?` to a `<dialog>`-based cheat
  sheet. The Code page now matches: a `?` button in the toolbar and
  a global `?`-key handler (scoped to skip CodeMirror + form fields)
  open a help dialog listing the Guided/Advanced toggle, lesson /
  snippet / symbols buttons, and the in-browser emulator's F / P / R
  / Ctrl-Space / Ctrl-S shortcuts.

- **6.5 Build timestamp + safe rebuild task.** `run_play` in
  [tools/playground_server.py](tools/playground_server.py) now
  returns `built_iso`, `built_epoch` and `build_time_ms` with every
  ROM. The Sprites-page status banner and the Code-page build
  summary display the build time (e.g. "built 14:02:37 · 1120 ms"),
  so a pupil who sees stale art in FCEUX can confirm whether the
  latest build actually ran. `.vscode/tasks.json` gained a `Safe
  Rebuild & Run (make rebuild-run)` task that runs the Makefile
  `rebuild-run` target directly — one make invocation, clean build
  guaranteed — as the official "try this if FCEUX looks stale"
  escape hatch. All six step Makefiles already declare the
  `rebuild-run` target and proper `.inc`/`.chr`/`.nam`
  prerequisites, so no Makefile changes were needed.

### Sprint 7 — 2026-04-20 snippet library expansion

- **7.1 Extended sprite roles.** Five new role options —
  `tool`, `powerup`, `pickup`, `projectile`, `decoration` — joined
  the existing `player` / `npc` / `enemy` / `item` / `other` set in
  [tools/tile_editor_web/sprites.html](tools/tile_editor_web/sprites.html)
  (both `ROLE_COLOURS` / `ROLE_LABELS` maps, the filter `<select>`,
  the per-sprite role `<select>`, and the state migrator). Colour
  coding now drives ten distinct hues in the scene-sprite list.
  `playground_server.py` gained a `ROLE_CODES` dict plus
  `_role_code(sp)` helper, emits `#define ROLE_PLAYER 0` …
  `ROLE_OTHER 9` into `scene.inc` and `.define ROLE_*` into
  `scene.asminc`, and appends an `ss_role[]` byte table so snippets
  can filter by role. The zero-sprite stub and the
  [code.html](tools/tile_editor_web/code.html) `HINT_SYMBOLS`
  autocomplete list both pick up the new identifiers.
- **7.2 Enemy walker + chaser snippets.** New
  [snippets/enemy-walker.c](snippets/enemy-walker.c) paces every
  ROLE_ENEMY scene sprite left-right (with per-sprite direction in
  a static `enemy_dir[16]` ring) and flips at the screen edge.
  [snippets/enemy-chaser.c](snippets/enemy-chaser.c) nudges each
  ROLE_ENEMY sprite one pixel towards `(px, py)` per frame. For
  these to work, `playground_server.build_scene_inc` now emits
  `ss_x` / `ss_y` as mutable `static unsigned char` arrays (all
  other `ss_*` tables stay `static const`). The cc65 linker's DATA
  segment copies the ROM initialisers into RAM at startup, so the
  snippets can freely write to the arrays and existing read-only
  snippets like `solid-obstacles` keep working.
- **7.3 Follower snippet.**
  [snippets/follower-npc.c](snippets/follower-npc.c) keeps the
  last 32 `(px, py)` samples in a static ring buffer and snaps the
  first ROLE_NPC sprite to the tail entry. Pupils tweak
  `#define FOLLOW_LAG 24` for a closer or more distant trail.
  `trail_primed` guards the first `FOLLOW_LAG` frames so the
  follower doesn't teleport through garbage.
- **7.4 NPC dialogue snippet + `draw_text` helper.**
  [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
  now defines `draw_text(row, col, text)` and
  `clear_text_row(row, col, width)`. Each wraps its PPU writes in
  its own `waitvsync()` + `PPU_MASK = 0` window, so they are safe
  to call from the `magic_button` region (which runs before the
  main vblank). The helpers are exposed to autocomplete via
  `HINT_SYMBOLS`.
  [snippets/npc-dialogue.c](snippets/npc-dialogue.c) detects when
  the player overlaps the first ROLE_NPC scene sprite, and on a B
  edge toggles the dialogue text on or off. The string is a
  zero-terminated array of CHR tile indices exposed at the top of
  the snippet body so pupils can edit it without wrestling with
  string literals.

### Sprint 9 — 2026-04-21 selection-tool actions

- **Selection actions (Sprites page).** Sprint 8's `Select` marquee
  grew the actions pupils actually want: **Copy / Paste**, **Rotate
  90° CW / CCW**, **Flip H / V**, **Grab-to-move**, plus **Clear**
  (same as `Delete`). All routes push one `pushUndo()` at the start
  so a single `Ctrl-Z` reverts the whole operation. Paste anchors at
  the current marquee's top-left (falling back to the selected cell's
  top-left when no marquee exists); clipboard pixels that would fall
  off the right/bottom edge are silently discarded. Rotate swaps the
  marquee's dimensions; if the rotated rect would extend past the
  sprite edge the pixels off the edge are dropped and a toast warns
  `↻ Rotation clipped at sprite edge`. Grab-to-move lifts the region
  into a `floatingSelection` (source pixels zeroed, ghost overlay
  follows the cursor, clamped inside sprite bounds) and commits on
  mouseup; `Escape` or clicking outside the marquee while floating
  cancels and restores the source. The selection clipboard is
  session-only and cross-sprite, so pupils can copy in sprite A and
  paste in sprite B. A new **selection-actions strip** below the
  sprite canvas surfaces every action with size readout
  (`Selection W×H`) and disables buttons when they don't apply.
  Keyboard, scoped to the Select tool only: `Ctrl-C` copy, `Ctrl-V`
  paste, `R` rotate CW, `Shift+R` rotate CCW, `H` flip horizontal,
  `Escape` cancel float / clear selection. Flip V is toolbar-only by
  design (lowercase `v` is already paste).
- **Scale selection (`🔎+ ×2` / `🔎− ÷2`).** Toolbar-only integer
  nearest-neighbour scaling. `×2` doubles each pixel into a 2×2
  block (anchored at the marquee's top-left; clipped at the sprite
  edge with a toast). `÷2` samples every other pixel (top-left
  nearest-neighbour) and refuses to act below 2×2; odd dimensions
  drop the last row/column with a toast. Both follow the rotate path:
  one `pushUndo()` up-front, source zeroed, new `selectedRegion`
  matches the clipped output rect. No keyboard shortcut — toolbar
  only, to keep the key surface minimal.
  All changes in
  [sprites.html](tools/tile_editor_web/sprites.html); Backgrounds page
  untouched. Session-only state — no schema changes.

### Sprint 8 — 2026-04-20 palette UX + drawing tools

- **8.2 Palette editor refactor.** Both pages now share one palette
  idiom: an **active-palette editor** with the NES master grid inline,
  and an **overview list** showing every palette with a radio selector.
  On [index.html](tools/tile_editor_web/index.html) the editor has a
  BG / Sprite kind toggle + `P0..P3` buttons and the overview shows
  eight rows (BG0–BG3, SP0–SP3). On
  [sprites.html](tools/tile_editor_web/sprites.html) the editor is
  locked to the sprite kind (BG palettes live in a collapsible
  read-only ref) and the overview shows the four sprite palettes.
  A single `assignColourToSlot(kind, palIdx, slot, nesIdx)` helper is
  the only mutation path; both click-assign from the master grid and
  **drag-and-drop** from a master cell onto any non-read-only slot
  route through it, so undo stays consistent. `paletteEditor` state
  ({kind, row, slot}) persists in `prefs.paletteEditor`.
  Removed: the `#floating-palettes` popout + `🎨 Pop-out palettes`
  button + `initFloatingPalettes`/`renderFloatingPalettes`/`buildFpSwatch`
  and their CSS on the Backgrounds page; `#sprite-side-palettes` pills
  kept but now also open that palette in the editor on click; the
  duplicated `#sp-palettes` compact strip and side-panel `#master-grid`
  on the Sprites page (and their `.sp-palettes-compact` /
  `.master-grid-compact` / `.master-palette` CSS).
- **8.1 Drawing-tools popover (Sprites page).** A `🛠 Tools ▾` button
  in the sprite-composition toolbar opens a compact popover with
  **Pencil / Fill / Line / Rect / Circle / Select**. Pencil keeps the
  existing `spApply` flow (auto-assign free tile, shared-tile guard,
  eyedrop). The other tools work in **sprite-pixel coordinates**
  (`width*8 × height*8`), writing through a new `setSpritePixel(sp,
  x, y, colour)` helper that auto-assigns a free tile to any empty
  cell the stroke touches and respects each cell's flipH/flipV. Shapes
  therefore cross tile boundaries without losing pixels. Fill is a
  4-connected flood, line is Bresenham, rect is an outlined rectangle,
  circle is a midpoint ellipse over the drag bounding box. Holding
  `Shift` snaps the line to 45° steps and the rect/circle to a
  square/circle. Select is a marquee; `Delete` zeroes pixels inside
  the selection (crossing tiles). All operations push one `pushUndo()`
  at the start of the shape so a single `Ctrl-Z` reverts the whole
  thing. Active tool persists in `prefs.spriteTool`.

### Sprint 10 — 2026-04-21 behaviour page + shareable bundle

- **Phase A — Behaviour page (`tools/tile_editor_web/behaviour.html`).**
  Fourth editor page sitting next to Backgrounds / Sprites / Code. It
  shows the active background's 32×30 nametable with a coloured overlay
  of the pupil's current behaviour painting: each cell carries an id
  0..7 where `0 = none`, 1..5 are built-ins (`solid_ground`, `wall`,
  `platform`, `door`, `trigger`) and 6..7 are rename-able custom slots.
  Shared draw tools (pencil / fill / rect) write into
  `state.backgrounds[i].behaviour` and respect `pushUndo()`, so a
  misclick is one `Ctrl-Z`. A per-sprite reactions panel binds every
  sprite × behaviour pair to one verb (`ignore`, `block`, `land`,
  `land_top`, `bounce`, `exit`, `call_handler`). Reactions live in
  `state.behaviour_reactions` keyed by sprite index. Migration fills
  both fields in any older project on load so pre-Sprint-10 saves
  open cleanly on all four pages. The two custom slots carry colour
  pickers and name fields so a pupil's *Spikes* tile paints pink and
  exports as `BEHAVIOUR_SPIKES` without needing to touch code.
- **16×16 metatile toggle.** A `🔲 Snap to 16×16 blocks` checkbox in
  the Behaviour page toolbar expands every paint to cover the 2×2 block
  containing the clicked cell. Per-tile is the default (levels are
  small early on); toggling persists on the page.
- **Phase B — C codegen for the behaviour map.** The playground
  server writes two new files alongside `scene.inc` / `palettes.inc`:
  `src/collision.h` (enum-style `#define`s for the eight
  `BEHAVIOUR_*` ids and the seven `REACT_*` verbs, plus
  `WORLD_COLS` / `WORLD_ROWS` covering the full
  `screens_x × screens_y` world so the data is scroll-ready when
  scrolling lands in a later sprint) and `src/behaviour.c` (a flat
  `const unsigned char behaviour_map[]` and `sprite_reactions[]`
  lookup table plus the two query functions `behaviour_at()` and
  `reaction_for()`). Both ship from the shared-dir *and* tempdir
  build paths in `_build_rom`. Custom-slot names are uppercased and
  stripped to `[A-Z0-9_]`; empty or digit-leading names fall back to
  `CUSTOM6` / `CUSTOM7`. `steps/Step_Playground/Makefile` gains a
  `behaviour.c` object and a `collision.h` dependency on `main.o`
  so a fresh paint triggers a full rebuild. Stub `collision.h` and
  `behaviour.c` are committed so `make -C steps/Step_Playground`
  works from a fresh checkout with the server not running.
  Hook-dispatch from `main.c` is deferred to Phase C; pupils call
  the two functions themselves for now.
- **`💾 Save all my work` / `📂 Open saved work` bundle.** A pair of
  header buttons on all four pages (Backgrounds / Sprites / Behaviour
  / Code) exports the full `state` blob as a single
  `<project>.nesgame.json` file and re-imports it with a confirm +
  auto-snapshot guard. Complements the page-scoped import/export
  buttons (which only bring in the slice relevant to the current
  page) — pupils now have one "save all my work" action for USB
  sticks and email attachments.
- **Snippet: `behaviour-walls-from-map`.** First Behaviour-aware
  snippet: reads `behaviour_at()` in front of the player and uses
  `reaction_for(0, id)` to push them back when the tile is marked
  `BLOCK`. Seed code for the future hook-dispatch lesson.
- **Default gravity for scene sprites + 🕊 Flying toggle.** Every
  scene sprite now falls 1 px/frame until `behaviour_at()` under its
  bottom edge returns `BEHAVIOUR_SOLID_GROUND` or
  `BEHAVIOUR_PLATFORM`. A new `flying` boolean on each sprite (tick
  `🕊 Flying (ignore gravity)` on the Sprites page) exports as
  `ss_flying[]` alongside `ss_role[]` in both `scene.inc` and
  `scene.asminc`. The gravity loop lives inside a `//>> gravity`
  guided region in the default `main.c` so Advanced-mode pupils
  can tweak or remove it. Migration fills `sp.flying = false` for
  any pre-existing sprite. RPG-style grid-step behaviour (Pokémon
  overhead movement) is deferred — tracked in
  `project_rpg_starting_option.md` — the user asked for "default
  gravity for all for now".
- **Player drops to painted ground + 4-way solidity.** The default
  `main.c` no longer pins the player to a hard-coded `ground_y`
  line. Gravity now consults `behaviour_at()` under both feet every
  frame, so the player falls from the editor's start Y until the
  tiles under them are painted `SOLID_GROUND`, `WALL`, or
  `PLATFORM`. Walking off a ledge drops them naturally. Follow-up
  the same day: `SOLID_GROUND` and `WALL` are now 4-way solid.
  Horizontal `LEFT`/`RIGHT` steps probe the column one step ahead
  at every body row and cancel the move if the column contains a
  solid tile; the jump ascent checks the row above the head at
  both player columns and sets `jmp_up = 0` to convert a ceiling
  bonk into a fall. `PLATFORM` stays one-way (land on top, pass
  through from below and sideways) so ledge-up-jumps still work.
  Scene-sprite gravity also treats `WALL` as a landing surface.
- **Player landing snap (stuck-in-ground fix).** The foot-check
  (`(py + PLAYER_H*8) >> 3`) is one tile below the player's body,
  so a non-aligned starting `PLAYER_Y` (e.g. 185) could leave the
  player's bottom pixel inside the ground row — which then made
  the horizontal walk check's `bot_row` see that row as
  `SOLID_GROUND` and refuse every step.  When gravity detects a
  landing tile, `py` is now snapped to `(foot_row << 3) -
  PLAYER_H * 8` so the body never overlaps the row below, and
  walking works from frame 1.
- **`BEHAVIOUR_LADDER` (builtin slot 6).** A sixth built-in
  behaviour id with a wood-amber swatch (`#c08a3c`).  Paint ladder
  tiles on the Behaviour page and the default `main.c` lets the
  player climb: while any body cell is a ladder, `UP` / `DOWN`
  move `py` by a tunable `climb_speed` (new `//>> climb_speed`
  guided region), gravity is suspended, and stepping sideways off
  the ladder resumes normal falling.  Custom slot count drops
  from 2 to 1 (slot 7 only).  A one-time migration in all three
  editor pages relocates any older custom-6 to slot 7 and remaps
  painted cells `6→7` so pupils don't silently lose named
  behaviours.  Emitter: `BUILTIN_BEHAVIOUR_NAMES[6] = "LADDER"`
  so the `BEHAVIOUR_LADDER` `#define` appears in the generated
  `collision.h`.

### Sprint 11 S-1 slice 1 — 2026-04-21 full-world nametable data

- **Full-world nametable emitter.** New `build_bg_world_h()` +
  `build_bg_world_c()` in [playground_server.py](tools/playground_server.py)
  write `src/bg_world.h` and `src/bg_world.c` alongside the existing
  `scene.inc` / `collision.h` / `behaviour.c`.  Covers the full
  `SCREEN_COLS × screens_x` by `SCREEN_ROWS × screens_y` painted
  area, row-major, as two flat `const unsigned char[]` arrays
  (`bg_world_tiles[]` and `bg_world_attrs[]`).  Attribute bytes
  follow the NES 2×2-quad packing per screen, tiled across the
  world so the scroll core can copy one attribute column per 16
  px of travel.
- **Committed 1×1 stubs** at
  [steps/Step_Playground/src/bg_world.h](steps/Step_Playground/src/bg_world.h)
  and [bg_world.c](steps/Step_Playground/src/bg_world.c) so a fresh
  `make -C steps/Step_Playground` works from a clean checkout
  before the server has ever run — same pattern as the Sprint 10
  `collision.h` / `behaviour.c` stubs.
- **Makefile wired up:** `bg_world.c` compiled unconditionally
  alongside `main.c` and `behaviour.c`.  No runtime yet references
  the symbols, so the data sits unused in the ROM image.  Fixed
  NROM cartridge size (49168 bytes) is unchanged.
- **Scope note:** this is the first of three planned slices for
  S-1.  Slice 2 will add `src/scroll.c` + `src/scroll.h` (column
  streaming, camera deadzone, world ↔ screen coords).  Slice 3
  rewires `main.c` to actually consume `bg_world_tiles[]` and
  scroll.  Multi-screen projects compile today but still play as
  a single screen until those slices land.

### Sprint 11 S-1 slice 2 — 2026-04-21 scroll core API

- **New engine files** at
  [steps/Step_Playground/src/scroll.h](steps/Step_Playground/src/scroll.h)
  and [scroll.c](steps/Step_Playground/src/scroll.c).  Committed as
  hand-written engine sources (copied into builds via the existing
  `shutil.copytree(STEP_DIR, ...)` path, same as `graphics.s`), so
  no server-side emitter is needed.
- **Camera state:** `extern unsigned int cam_x, cam_y;` in world
  pixels.  `scroll_init()` zeroes them; `scroll_apply_ppu()` writes
  the low byte of each to `$2005` (PPU_SCROLL) after vblank.  The
  full beyond-256-px path (high-bit via `PPU_CTRL` nametable
  select) is wired in slice 3 together with column streaming.
- **Deadzone-follow math:** `scroll_follow(target_world_x,
  target_world_y)` pulls the camera toward the target, keeping it
  inside a rectangle of `DEADZONE_LEFT..DEADZONE_RIGHT` ×
  `DEADZONE_TOP..DEADZONE_BOTTOM` (all four overridable via
  `#ifndef` so a `//>> camera_deadzone` guided region in main.c
  can retune them).  Clamped at world edges using
  `WORLD_W_PX - SCREEN_W_PX` / `WORLD_H_PX - SCREEN_H_PX`, with
  the axis disabled entirely when the world equals the screen
  (1×1 projects, or the non-scrolling axis of a single-axis
  project).
- **Coord helpers:** `world_to_screen_x()` / `world_to_screen_y()`
  return `0xFF` for world coordinates outside the current visible
  window.  Sprite code in slice 3 uses the sentinel to mask OAM
  slots for off-screen entities without a per-frame branch chain.
- **Makefile:** `scroll.c` added to `C_SRC` with a rule that
  depends on `scroll.h` and `bg_world.h` so a Backgrounds-page
  edit that changes the world dimensions also rebuilds the scroll
  core.  Same unconditional-compile pattern as `bg_world.c`.
- **Benign 1×1 warnings.**  cc65 emits
  `"Result of comparison is constant"` / `"Unreachable code"` on
  the `WORLD_W_PX > SCREEN_W_PX` / `WORLD_H_PX > SCREEN_H_PX`
  guards when the stub world matches the screen exactly.  Expected
  on a 1×1 project (the axis is literally a no-op there) and
  disappears as soon as the pupil expands the world.  Build still
  succeeds; ROM size unchanged at 49168 bytes.
- **Scope note:** nothing in `main.c` calls these functions yet,
  so runtime behaviour is unchanged.  Slice 3 wires the main loop
  to `scroll_follow()` + `scroll_apply_ppu()`, converts sprite
  positions to world-space `unsigned int`, and adds the column /
  row streaming during vblank.

### Sprint 11 S-1 slice 3 — 2026-04-21 main.c scroll wire-up

Split into three landing steps so the 1x1 fast path stayed
buildable after each.

**3a — scaffolding.**

- `main.c` now always `#include "bg_world.h"`.  A new
  `#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)` guard defines
  `SCROLL_BUILD` and pulls in `scroll.h`.  For 1x1 worlds the guard
  is false, so every later `#ifdef SCROLL_BUILD` block is excluded
  by the preprocessor and the pupil's existing 1x1 ROM compiles to
  the same bytes as before.
- Added `//>> camera_deadzone` guided region defining
  `DEADZONE_LEFT/RIGHT/TOP/BOTTOM` before `#include "scroll.h"` so
  the pupil can retune camera follow without editing the engine.
- `scroll_init()` + `scroll_apply_ppu()` are wired into the boot
  sequence under `SCROLL_BUILD`; the 1x1 branch keeps the literal
  `PPU_SCROLL = 0` writes.

**3b — world coordinates.**

- Player position is now `pxcoord_t` — `unsigned int` under
  `SCROLL_BUILD`, `unsigned char` on the 1x1 fast path.  cc65
  generates the same single-byte compares / loads as before for
  1x1, so no regressions there.
- Replaced hard-coded `256` / `232` right / bottom bounds with
  `WORLD_W_PX - PLAYER_W*8` / `WORLD_H_PX - 8`.  These resolve to
  the same literals for 1x1 (256/240 → 240/232) and extend to the
  full painted world for scroll builds.
- `scroll_follow((unsigned int)px + PLAYER_W*4, (unsigned int)py +
  PLAYER_H*4)` runs every frame under `SCROLL_BUILD`, pulling the
  camera toward the player's centre.
- OAM writes for the player and static scene sprites are split:
  the scroll branch computes screen coords via
  `world_to_screen_x/y()`, which conveniently returns `0xFF`
  (off-screen sentinel) for sprites outside the visible window.
  Scene sprites stay u8 world-space (inside screen 1) for slice 3;
  they scroll out of view cleanly as the camera moves.

**3c — nametable load + column streaming.**

- `scroll.c` body is now gated on
  `(BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)`.  1x1 builds
  compile scroll.c to an empty object (13-line cc65 header only) —
  the `extern` declarations in `scroll.h` dangle but are never
  referenced on the 1x1 path, so the linker is happy.
- Matching gate in `bg_world.c` (the committed stub and the
  server's emitter) so 1x1 builds emit no `bg_world_tiles[]` /
  `bg_world_attrs[]` symbols either.  ROM size is still the fixed
  49168 byte NROM image; the 1x1 ROM contents are functionally
  identical to pre-Sprint-11 (same main.c compile path, no scroll
  code linked), with a byte shuffle in the RODATA fill area from
  the new objects.  Plan explicitly allows this.
- **One-shot nametable load.**  New
  [load_world_bg()](steps/Step_Playground/src/scroll.c) copies up
  to two screens per scrolling axis from `bg_world_tiles[]` +
  `bg_world_attrs[]` into `$2000` / `$2400` / `$2800` / `$2C00`.
  Replaces the `graphics.s` `load_background()` call under
  `SCROLL_BUILD`; the 1x1 path still calls the asm routine, so the
  committed `level.nam` path is untouched.
- **Column / row streaming.**  New
  [scroll_stream()](steps/Step_Playground/src/scroll.c) runs in
  VBlank.  When `cam_x >> 3` changes it writes a 30-tile column
  into the off-screen nametable; when `cam_y >> 3` changes it
  writes a 32-tile row.  Bit 5 of the target column / row picks
  which nametable (`$2000` vs `$2400` or `$2800`) via the mirror
  aliasing, so arbitrarily wide / tall worlds stream cleanly
  without special-casing the second screen.
- **Beyond-256-px scrolling.**  `scroll_apply_ppu()` now toggles
  PPU_CTRL bits 0 / 1 based on `cam_x & 0x100` / `cam_y & 0x100`
  so the "left" nametable flips when the camera crosses a screen
  boundary.  Also resets the stride bit to +1 in case
  `scroll_stream()` left it at +32.
- **VBlank ordering.**  Each frame:
    1. `waitvsync()`
    2. `scroll_stream()` (PPU_ADDR/DATA writes, trashes scroll latch)
    3. OAM writes (one sprite byte at a time via `$2004`)
    4. `scroll_apply_ppu()` as the last PPU register write so the
       final scroll latch is correct when rendering resumes.

**Verification.**

- 1x1 build produces `49168` byte NROM with the same main.c
  assembly as slice 2 (scroll.o + bg_world.o are empty headers
  only).  Hash shifts on each slice because the linker redistributes
  fill bytes, but the executable code is unchanged.
- Simulated 2x1 world (manual `BG_WORLD_COLS=64` test) compiles
  cleanly with only the expected "constant comparison" / "unreachable"
  warnings on the disabled vertical axis.

**Known limitations (slice 3d / follow-ups).**

- **iNES mirror byte** in [cfg/nes.cfg](steps/Step_Playground/cfg/nes.cfg)
  is hard-coded to `NES_MIRRORING = 1` (V-mirror, good for
  H-scroll).  Pure-V-scroll worlds will show mirror-seam artefacts
  until the server picks cfg based on which axis scrolls.
- **Attribute streaming** is absent.  `load_world_bg()` loads
  attrs for the first two screens up front; `scroll_stream()` only
  walks tile data.  3+ screen worlds will show 16-px attribute
  seams at screen-3+ boundaries until per-16-px attribute writes
  are added.
- **Scene sprites** stay in screen 1 (u8 world coords).  Multi-
  screen sprite placement requires promoting `ss_x[]` / `ss_y[]`
  to u16 in the scene.inc emitter — deferred to S-2.

### Pupil feedback — 2026-04-22 in-editor feedback form

Lightweight "tell us what you think" channel wired into the four
editor pages without touching the header toolbar.  Plan document
at [feedback-plan.md](feedback-plan.md).

- **UI placement.**  On the tabbed help dialog (index.html,
  sprites.html) a new `💬 Feedback` tab sits after *Tips / FAQ*.
  The matching `.help-tab-panel` holds an empty
  `.feedback-form-host` that the shared module populates on first
  click.  Zero new header buttons, zero layout shift on other
  pages.
- **UI placement (non-tabbed).**  On behaviour.html and code.html
  the help dialog is a single panel, so the form goes in a
  `<details class="feedback-block">` just above the dialog's
  *Close / Got it* row.  Closed by default; expands in place.
- **Shared module.**  New
  [feedback.js](tools/tile_editor_web/feedback.js) (~200 lines)
  builds a three-radio + textarea + optional-name form, shows a
  live `n / 500` character count, disables *Send* until a category
  is picked and the message is non-empty, POSTs JSON to
  `/feedback`, and flashes an inline green *"Thanks — sent!"*
  banner on success (red banner on failure, form preserved).
  Styles are injected from the module itself so the four HTML
  files stay clean.
- **Server endpoint.**  `POST /feedback` handled in
  [playground_server.py](tools/playground_server.py) alongside the
  existing `/play` branch.  Validates category ∈ `{feature,
  broken, general}`, message 1-500 chars, name / project ≤ 80,
  body ≤ 4 kB; appends a single JSONL line to
  `feedback.jsonl` at the repo root guarded by a module-level
  `threading.Lock`.  Record carries timestamp, client IP,
  category, message, name, page, projectName, and truncated
  User-Agent.
- **Privacy.**  Submissions land in a local file the teacher
  owns; no external services involved.  Project state is
  deliberately *not* attached (~100 kB per click and contains the
  pupil's work).  `feedback.jsonl` is `.gitignore`d so it never
  enters the repo.
- **Verification.**  Smoke-tested the endpoint on port 18765:
  valid payload returned `{"ok": true}` and appended a correct
  JSONL line; missing category, empty message, and oversize
  message each returned 400 with a descriptive `error` field.
  `python3 -c 'ast.parse(...)'` clean on the server; `node
  --check` clean on feedback.js.

### Pupil feedback — 2026-04-22 follow-ups

Three tweaks after pupil testing of the first cut:

- **Shared radio-group name.**  The three category radios each
  had a different random `name` attribute, which meant they
  behaved like independent checkboxes — picking a second category
  left the first still highlighted.  Fixed by generating one
  `name` per form instance and reusing it across the three
  radios, restoring native radio-group behaviour.
- **Click-to-clear category.**  Native radios can't normally be
  un-checked by clicking them a second time.  Added a
  `mousedown`/`click` pair that records whether the radio was
  already checked at press time, then clears the whole group on
  the click if so.  *Send* disables itself again, matching the
  empty-category state.
- **Wider textarea.**  Bumped `rows` from 5 to 7, `min-height`
  from 90 px to 140 px, and added `min-width: min(520px, 85vw)`
  to `.fb-form` so the text area (and the form as a whole) has a
  proper writing surface — in particular on behaviour.html and
  code.html where the surrounding help dialog was otherwise
  narrow.
- **Include-my-project checkbox.**  New optional control under
  the name field: *"Include my project so the teacher can see
  what I was doing (sends your tiles, palette and background to
  the teacher)."*  Default off.  Only rendered when the page's
  `mountInto` call provides a `getProjectState` callback — all
  four pages now do.  When ticked, the pupil's full editor
  `state` is attached to the submission under the `project` key.
  Server body cap raised from 4 kB to 1 MB to fit typical
  snapshots (~30-100 kB).  Server validates
  `isinstance(project, dict)` before storing, so malformed
  payloads are silently dropped rather than saved.
- **Verification.**  Smoke-tested both payload shapes (with and
  without `project`) on port 18765 — each returned `{"ok":
  true}` and produced the expected JSONL line.

---

## Not done / deferred

- **B7 — Terminology cleanup.** The vocabulary
  (cell / tile / put) is consistent in the new banners and toasts.
  A whole-file sweep of older copy ("highlighted", "assigned",
  "selected tile") was deferred — most remaining occurrences are in
  hint paragraphs and tooltips that pupils rarely read mid-task.
  Worth a separate small PR with the pupils watching, so we change
  language they actually notice.

- **A4 (rest) — Collapse Sprite list, Pixel editor, Palettes, Tileset,
  Master.** Helper is in place; wrapping the remaining sections is
  one-line-per-section work but was left out for now: collapsing the
  always-on sections risks pupils losing the canvas they were just
  looking at, and the layout already fits a 1280-wide window.

- **A5 — Style parity pass.** The Backgrounds page already supplied
  the visual idiom (`palettes-panel` h3 treatment) that the Sprites
  page now uses. A deeper cross-page polish (consistent header
  spacing, summary chevron placement) is queued behind getting more
  pupil sessions on the new layout first.

- **Detach / floating for pixel editor & sprite list.** Out of scope
  for this round, as flagged in the plan. Tileset and palette
  pop-outs were already in place.

- **8.3 Inline animation strip.** Deferred to a later sprint as flagged
  in [sprint8-plan.md](sprint8-plan.md) — the animation panel
  restructure is independent of palette/tool UX.

- **Mobile / touch drag-and-drop for palettes.** The HTML5 DnD API
  is mouse-first; touch fallback (a pointer-events polyfill) is
  deferred until we see pupils on tablets.

---

## Verification

- `node --check` on the extracted JS block: OK.
- `▶ Play in NES` round-trip not re-tested in this session (no JS
  paths feeding the build pipeline were touched — only render,
  inspector, and helper code).
- localStorage schema unchanged; existing projects load.
- Shortcuts still bound: `0–3`, `[`, `]`, `D`, `Del`, `Shift+click`,
  `M`, `F`.

---

## Menu reorganisation — 2026-04-22 toolbar grouped into four zones

Plan: [menu-plan.md](menu-plan.md) (Plan B — grouped toolbar).

The header toolbar on all four editor pages was wrapping onto two
rows on 1366-wide laptops because every action sat at the top level.
The actions are now bucketed into four visually distinct groups
separated by thin dividers, matching the browser's own File / Edit
/ View / Window idiom.

- **Shared target layout.**
  `[🎮 Title] [tabs…] │ ● [📁 project ▾] │ ↶ ↷ [Clear …] │ [page tools] │ [▶ Play] [?]`.
  `.tb-group` + `border-left` on each subsequent group gives the
  dividers without any JS.  Each page has its own inline style
  block so the CSS additions landed in all four files.
- **File ▾ absorbs Projects ▾ and most file actions.**  The single
  dropdown now contains: Projects list → Rename this project
  (moved in from the standalone `#project-name` input) → New /
  Duplicate / Delete → Save all my work / Open saved work →
  Recover (index + sprites only) → Import / Export (index +
  sprites only) → auto-download backups checkbox (index only).
  The summary stays `📁 <project-name> ▾` so pupils' muscle-memory
  click target is unchanged.
- **Save-status pill shrunk to a dot.**  130-px "● Saved just now"
  pill became a 1.6-em coloured dot; the full message moved into
  the `title` attribute so hovering still shows it.  `setStatus()`
  on each page now sets both `textContent` and `title`; error
  state still shows the full text inline so something going wrong
  can't be missed.
- **Edit group — three items per page.**  Undo, Redo, and one
  "Clear X" (🗑 Clear project on index + sprites, 🗑 Clear map on
  behaviour, ↻ Restore default on code).  All kept their existing
  ids so click handlers are unchanged.
- **code.html gets two new dropdowns.**  Mode ▾ (🎓 Guided · C)
  bundles the two mode-toggle `<span>`s — Guided/Advanced and
  C/Asm — with a live summary label that updates whenever either
  sub-toggle flips.  Code tools ▾ (🧰) hides Snippets… and
  Symbols… behind one click.  The lesson chip stays visible in
  the group because pupils need to see which lesson is loaded.
- **All button ids preserved.**  The change is pure DOM location
  (and CSS) — no event handler was touched, keyboard shortcuts
  (Ctrl+Z/Y/S, `?`) still work, and saved projects load
  unchanged.

### Verification — menu reorganisation

- `node --check` clean on the extracted inline JS block of each of
  the four pages after the restructure.
- Each page's header now fits on one row at 1366 px.

---

## Feedback viewer — 2026-04-23 `GET /feedback` teacher page

Plan: [feedback-viewer-plan.md](feedback-viewer-plan.md).
Follow-up to the pupil feedback form shipped the day before.

- **`GET /feedback` renders a dark-themed page.**  Reads
  `feedback.jsonl` and `feedback-handled.json`, groups each
  submission into a card — category chip (✨/🐛/💭), pupil name
  (or *"anonymous"* italics), page, project name, timestamp,
  message in a wrapping `<pre>`.  Newest first.  Top-right of each
  card has a ✓ handled checkbox.  Opens at
  `http://localhost:8765/feedback` — no separate UI to launch.
- **Project snapshot fold-out.**  If the submission included the
  pupil's project (via the "include my project" checkbox in the
  form), the card gets a `<details>` labelled *"📎 project
  snapshot (N KB)"* with pretty-printed JSON inside.  Closed by
  default so long snapshots don't dominate the page.
- **`POST /feedback/handled` persists the toggle.**  Body is
  `{"index": N, "handled": true|false}`; server writes
  `feedback-handled.json` next to the JSONL via a temp-file
  rename under a module-level `RLock`.  Index is the 1-based line
  number in `feedback.jsonl` — stable as long as the file is only
  appended to.
- **Show handled toggle at the top.**  Default off; preference
  persisted in `localStorage` so the teacher doesn't have to
  re-tick on every reload.  Handled cards stay counted in the
  stats line but get hidden via a `body.hide-handled .handled`
  CSS rule.
- **Deadlock fixed during smoke-test.**  First pass used a plain
  `Lock` and the handler deadlocked because `_save_handled_set`
  tried to re-acquire it from inside the handler's `with` block.
  Switched to `threading.RLock` so read-modify-write stays atomic
  without nested-lock grief.

### Verification — feedback viewer

- Smoke-tested on port 18766 with three `POST /feedback`
  submissions (two without project, one with), then
  `GET /feedback`: 200 OK, 3 cards, newest first, correct
  category emoji, anonymous label on the no-name entry, snapshot
  fold-out only on the third.
- `POST /feedback/handled {"index":2,"handled":true}` → 200,
  `feedback-handled.json` contains `{"handled":[2]}`; re-fetching
  the viewer shows stats "1 handled, 2 open" and the card has
  the `handled` class.  Unchecking round-trips back to an empty
  list.  Malformed JSON and a negative index each produce a 400
  with a clear `error` field.
- `python3 -m py_compile tools/playground_server.py` clean.

---

## Editor polish — 2026-04-23 tile-selection defaults

Two small editor bug-fixes shipped in the same session as the
feedback viewer.

- **Backgrounds page now lands on tile 1, not tile 0.** Tile 0 is
  the transparent/background tile — defaulting the tileset
  selection to it meant every pupil had to click somewhere else
  before they could paint anything. `selectedTileIdx` now starts
  at 1. A small `restoreSelectedTile()` helper reads
  `state.metadata.lastSelectedTile` and clamps it to
  `[1, NUM_TILES-1]`, falling back to 1 for brand-new projects.
  Called from `init()` and `afterStateReplaced()`.  The current
  selection is written back into `state.metadata.lastSelectedTile`
  inside `scheduleSave()` and the `beforeunload` handler, so it
  round-trips per project — open a project, click tile 42, close
  the tab, reopen, tile 42 is still selected.

- **Sprites auto-assign no longer hands out the same tile twice.**
  `findFreeTileRun()` and `findNextEmptyTileSlot()` previously
  only treated a tile as "used" if its pixels were non-zero.
  That missed freshly auto-assigned cells — after
  `autoAssignFreeTileToCell()` set `cell.tile = N; cell.empty =
  false`, tile N's pixels were still all zero, so the next call
  happily returned N again.  Result: multiple cells pointing at
  the same blank tile, painting one secretly painted all of them.
  Fix is a new helper `_referencedTileIndices(s)` that walks every
  sprite's non-empty cells and collects the tile indices in use;
  `_tileIndexIsFree()` combines that with the pixel-zero check.
  Both callers now see truly-free tiles.  Works identically for
  per-cell auto-assign in `spApply`, for the resize handler's
  bulk `findFreeTileRun(newCells.length)`, and for
  `duplicateTileForCurrentCell()`.

### Verification — editor polish

- `node --check` clean on the extracted inline JS blocks of
  index.html and sprites.html.
- Manual trace: on the Backgrounds page with an empty project,
  `selectedTileIdx` starts at 1 (`init()` path); after clicking
  tile 7 and reloading, `state.metadata.lastSelectedTile === 7`
  and the selection restores.  On the Sprites page, resizing a
  sprite from 2×2 to 3×3 now claims four distinct consecutive
  tile indices; painting into one leaves the other three blank
  as expected.

---

## Builder — 2026-04-23 chunk 1 (end-to-end pipeline + Player module)

Plan: [builder-plan.md](builder-plan.md).
First slice of Phase A — the infrastructure and one working module
(Player 1), enough to prove the pipeline compiles end-to-end.

- **New page `🧱 Builder`** sits between Behaviour and Code in the
  page nav of every editor page.  Toolbar mirrors the other pages
  (File ▾ / Edit / Run groups, save-status dot, Play + ? in Run).
- **Three client-side JS modules, no Python changes:**
  - [tools/tile_editor_web/builder-assembler.js](tools/tile_editor_web/builder-assembler.js)
    — pure `assemble(state, templateText)` function with
    `replaceRegion()` (rewrites the body between `//>> id: … //<<`
    markers), `appendToSlot()` (for later insertion points),
    `stripSlotMarkers()`, and `findSpriteByRole()` helpers.
  - [tools/tile_editor_web/builder-modules.js](tools/tile_editor_web/builder-modules.js)
    — module catalogue keyed by dotted id (`game`, `players`,
    `players.player1`).  Each entry carries `label`, `description`,
    `defaultConfig`, a typed `schema`, and an optional
    `applyToTemplate(template, node, state)` pure function.
    Chunk 1 ships `game` (type picker — platformer only today,
    topdown disabled with a tooltip) and `players.player1`
    (startX, startY, walkSpeed, jumpHeight, maxHp).
  - [tools/tile_editor_web/builder-validators.js](tools/tile_editor_web/builder-validators.js)
    — an array of small `(state) -> problem | null` functions.
    Chunk 1 ships two: **no-player-role** (error, blocks Play) and
    **no-walk-animation** (warn only — game still runs without).
- **Template loaded via HTTP.**  [tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
  is a verbatim copy of `steps/Step_Playground/src/main.c` — the
  Builder page fetches it on init, runs it through the assembler
  on every state change, shows the result in the Preview pane.
  Keeping it verbatim for chunk 1 means the Builder's zero-tweak
  output is byte-compatible with what the Code page's stock
  template ships today.
- **Default-to-Builder redirect on `code.html`.** Per the teacher's
  answer to Q1 in builder-plan.md: if `state.customMainC` and
  `state.customMainAsm` are both empty, `code.html` does a
  `location.replace('builder.html')` at the top of its inline
  script — before CodeMirror initialises — so new pupils land on
  the Builder.  Pupils who already have custom C on file keep
  opening in the Code page.  The nav link from Builder → Code
  carries `?stay=1` to bypass the redirect, and the Code page
  honours that flag.
- **`migrateBuilderFields(s)`** added to both `index.html` and
  `sprites.html`'s existing migration chains.  Older projects
  gain a default `state.builder` tree on first load from any page,
  same idiom as `migrateBehaviourFields`.
- **Play wiring** on the Builder page mirrors sprites.html: assemble
  `main.c`, POST to `/play` with `customMainC` set, decode the
  returned `rom_b64`, play in the jsnes embed.  No `sceneSprites`
  yet (chunk 2 wires that up).

### Verification — Builder chunk 1

- `node --check` clean on all three new JS files and on the inline
  script of the four edited HTML pages.
- Programmatic smoke-test `/tmp/builder-smoketest.mjs` loads the
  three modules in a faux-window, asserts:
  - Validators fire correctly on a broken (no-player-sprite) state
    and go silent on a valid one.
  - `assemble()` substitutes all four region values (`walk_speed`,
    `jmp_up`, `px`, `py`) with a tweaked config.
  - The assembled `main.c` still contains `void main(void)` and
    `#include <nes.h>` (the scaffolding didn't get clipped).
  - `make -C steps/Step_Playground` accepts the assembled output
    via cc65 — build time 78 ms on the test machine.
- Manual: `GET /builder-templates/platformer.c` returns 200 and the
  expected 485-line template; `GET /builder.html`,
  `/builder-assembler.js`, `/builder-modules.js`,
  `/builder-validators.js` all 200.

### Deliberately out of chunk 1 — follow-up items

- **`enemies.walker`, `behaviour_walls`, `win_condition` modules**
  and the `topdown.c` template.  These are Phase A chunk 2; they
  add the first `//@ insert:` slots and the enemy-role
  scene-sprites wiring in the `/play` payload.
- **Preview syntax highlighting.**  Plain `<pre>` for now —
  promoting to CodeMirror is a one-line swap once chunk 2 proves
  the assembler output is worth reading.
- **"Eject to Code" one-way switch.**  Today a pupil can visit the
  Code page with `?stay=1` and hand-edit; the button + confirm
  dialog comes in Phase D.

### Chunk 1 hardening — 2026-04-23 same-day fixes

Three small follow-ups shipped the same day, driven by pupil
testing:

- **`Storage.loadCurrent is not a function`.**  `storage.js` exports
  `createTileEditorStorage(deps)` as a factory, not a singleton.
  My Builder page referenced `Storage` as if it were already
  instantiated, so init() threw on first load.  Fix: construct the
  instance the same way code.html does —
  `createTileEditorStorage({ migrateState: (s) => s, validateState: () => null })`
  at the top of the inline script.
- **Incomplete-state guard.**  When `Storage.loadCurrent()` returned
  null (no project yet), the Builder's fallback was
  `{ name: 'untitled', sprites: [] }` — missing `bg_tiles`,
  `sprite_tiles`, `backgrounds`.  Any later save clobbered the
  pupil's real project (which was still in storage but now
  overwritten), leaving sprites.html / behaviour.html's
  `validateState` rejecting the saved blob as *"not a correct
  project file"*.  Hardened by adding a `stateLooksComplete(s)`
  predicate: if it fails on load, the Builder renders a
  *"open the Sprites page first"* fallback and **refuses to save
  anything** until a complete state is present.  `scheduleSave()`
  now also checks the predicate and surfaces a red-banner error
  rather than silently writing over the project.
- **Load-from-disk guard.**  The "Open saved work" handler on the
  Builder now rejects JSON files that don't pass
  `stateLooksComplete(loaded)` — the pupil gets a clear message
  before the file overwrites the active project.

---

## Builder — 2026-04-23 chunk 2 (enemies, walls, win condition)

Fills out Phase A with the three remaining gameplay modules and
the `sceneSprites` wiring that places role-tagged sprites into the
scene automatically.

- **Three insertion slots** added to
  [builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c):
  `//@ insert: declarations` (module-scope variables, just before
  `void main()`), `//@ insert: init` (one-time startup code, right
  before the `while (1)`), and `//@ insert: per_frame` (per-frame
  game logic, after gravity + before `waitvsync`).  Marker lines
  are `//`-comments — cc65 treats them as plain comments, and
  `stripSlotMarkers()` removes them from the final output so the
  generated `main.c` is clean.
- **`enemies` + `enemies.walker` modules.**  Ticking Walkers emits
  a loop into `per_frame` that paces every `ROLE_ENEMY` sprite
  left/right at the chosen speed (1–4 px/frame), using a
  builder-local `bw_enemy_dir[16]` direction table.  The emitted
  code mirrors the existing [snippets/enemy-walker.c](snippets/enemy-walker.c)
  so anyone who knows the snippet library will recognise the
  pattern.  Variable names are `bw_*`-prefixed to avoid clashing
  with pupil code if they later eject to the Code page.
- **`behaviour_walls` info module.**  Explains (via its label and
  description) that the Behaviour page's painted tiles already
  drive player collision — so the pupil knows to paint walls
  without the Builder needing to inject any code.  A validator
  (severity: warn) fires if no solid-ground / wall / platform
  tiles are painted on the active background, with a "Fix on
  Behaviour page" button.
- **`win_condition` module.**  Enum config picks which behaviour
  type is the "winning" tile (Trigger by default; Door /
  Solid-ground / etc. as alternatives).  On collision, the
  emitted code flips a `bw_won` flag and zeros `walk_speed` /
  `climb_speed` — the player simply freezes in place, which is
  enough feedback for the MVP.  Proper "You win" text ships in
  Phase B.
- **`sceneSprites` auto-population** in the Builder's `/play`
  payload: every non-player sprite with a gameplay role (enemy,
  npc, pickup, powerup, item, tool, projectile, decoration) is
  placed at `x = 96 + stride`, `y = 120` — matching the default
  layout on sprites.html's Play dialog so muscle memory
  transfers.  Pupils who want fine control can still place
  manually on sprites.html; the Builder just picks sensible
  defaults so a ticked Walker module has something to drive.
- **Validators added** — `walker-no-enemies` (warn), `no-wall-tiles`
  (warn), `win-no-tiles` (error, blocks Play).  Each carries a
  one-sentence fix message and a jump button to the right page.

### Verification — chunk 2

- `node --check` clean on every edited JS file and on the
  extracted inline script of builder.html.
- `/tmp/builder-smoketest-2.mjs` exercises every new module and
  validator against a synthetic state, asserts that:
  - Empty behaviour map yields exactly `win-no-tiles:error +
    no-wall-tiles:warn + no-walk-animation:warn`.
  - Painting a solid-ground + trigger tile clears both errors.
  - Assembled output contains the walker loop, the win-condition
    block referencing `BEHAVIOUR_TRIGGER`, the `bw_won`
    declaration, and the kept `walk_speed` / `jmp_up` defaults.
  - Switching `win_condition.config.behaviourType` from `trigger`
    to `door` produces `BEHAVIOUR_DOOR` in the emitted code
    instead.
  - `make -C steps/Step_Playground` compiles the chunk-2 output
    via real cc65 — 26 ms on the test machine.

### Deliberately out of chunk 2 — Phase B candidates

- **`topdown.c` template** + the `topdown` option in the `game`
  module (currently disabled with a *"Coming in Phase B"*
  tooltip).
- **Pickups** — sprites that vanish on touch and increment a
  score counter.
- **Doors** — scene transitions tied to door tiles + multi-background
  switching.
- **HUD** — hearts (HP) and score drawn at the top of the screen.
- **Player 2** — pad-2 routed through a second player module.
- **Damage / HP** — the `maxHp` and `damagesPlayer` fields are
  already in state shape; they just aren't wired to code yet.
- **Proper "You win" text** — requires a tile-based text helper
  with a font-tile seed, bigger lift than the MVP.
- **"Eject to Code" confirm dialog** — Phase D polish.

### Chunk 2 polish — 2026-04-23 win feedback + jump freeze

Two follow-ups after first pupil test of chunk 2:

- **No visible feedback on winning.**  The original win block
  only zeroed `walk_speed` / `climb_speed`; the player stopped
  moving but the pupil had no clear signal that the game had
  ended.  Fix: when `bw_won` flips, the emitted code now writes
  `PPU_MASK = 0x1F | 0x20` — greyscale (bit 0) + red emphasis
  (bit 5).  The whole scene desaturates and tints pale red, a
  classic NES "level complete" look that works without any
  specific tiles or palette entries being painted.
- **Player could still jump after winning.**  `walk_speed = 0`
  blocks horizontal movement but the jump path uses its own
  `jmp_up = 20` seed and an edge-triggered `pad & 0x08` check.
  Fix: when `bw_won` is set, the emitted code now also zeros
  `jumping` + `jmp_up` (cancels any in-progress ascent) and
  pins `prev_pad = 0xFF` so the edge detector stops firing on
  fresh UP presses.

The `win_condition` module description on the Builder page
updated to match: *"freezes in place and the screen tints red"*.
Smoke-test grew two assertions to guard both behaviours.

---

## Builder — 2026-04-23 Phase B chunk 1 (chaser, pickups, collect-to-win)

First slice of Phase B from [builder-plan.md](builder-plan.md):
adds enemy variety + a pickup-collection mechanic + a new win type
that composes with it.  No template changes — every addition rides
the `//@ insert:` slots added in chunk 2.

- **`enemies.chaser` module** (disabled by default).  Ticking it
  emits a per-frame loop that nudges every `ROLE_ENEMY` sprite one
  pixel at a time (configurable 1–3 px/frame) toward the player's
  `(px, py)`.  Same pattern as [snippets/enemy-chaser.c](snippets/enemy-chaser.c).
- **`pickups` module** (disabled by default).  Sprites tagged
  `ROLE_PICKUP` on the Sprites page disappear when the player
  touches them (AABB overlap in the emitted code); a `bw_pickup_count`
  counter ticks up, and `bw_pickup_total` is set once in the
  `init` slot by counting every pickup-roled sprite.  Collected
  pickups are hidden by writing `ss_y[i] = 0xFF` — the NES
  "off-screen" sentinel — so no OAM entry is wasted on them.
- **Extended `win_condition`.**  New `type` enum with two values:
  `reach_tile` (the chunk-2 behaviour, unchanged) and
  `all_pickups_collected` (win when `bw_pickup_count ≥
  bw_pickup_total`).  The emitted code branches on `type`, so the
  reach-tile `BEHAVIOUR_*` check simply isn't compiled when
  collect-every-pickup is selected — no dead code in the output.
- **Three new validators:**
  - `walker-and-chaser` (error) — fires when both enemy movement
    modules are ticked, because their per-frame loops both
    rewrite `ss_x[]` and the enemies wobble in place.
  - `all-pickups-needs-pickups` (error) — blocks Play if the win
    type is "collect every pickup" but the Pickups module is off
    (the emitted code would reference undeclared
    `bw_pickup_total`).
  - `all-pickups-no-sprites` (error) — same win type but no
    sprite is tagged `ROLE_PICKUP`: the game can never end.

### Verification — Phase B chunk 1

`/tmp/builder-smoketest-3.mjs` runs seven assertions:

1. Walker + Chaser both on → `walker-and-chaser` error fires.
2. Walker off, Chaser on → error clears; chaser code emitted,
   walker code omitted.
3. `all_pickups_collected` with pickups module off →
   `all-pickups-needs-pickups` error.
4. `all_pickups_collected` with pickups on and two role=pickup
   sprites → no errors; output contains the declarations, init
   loop, collect AABB, and `bw_pickup_count >= bw_pickup_total`
   win check; crucially, `BEHAVIOUR_TRIGGER` does *not* leak
   into this branch.
5. cc65 compiles the pickups + all_pickups output in 37 ms.
6. `all_pickups_collected` with pickups on but zero pickup
   sprites tagged → `all-pickups-no-sprites` error.
7. Default-state output (walker + reach_tile + trigger painted)
   still compiles unchanged — belt-and-braces regression check
   for chunk 2 callers.

### Deliberately out of this chunk — further Phase B candidates

- **HUD** (player.hud) — hearts / score drawn on screen.  Needs
  font tiles or pupil-art digit tiles; tractable but non-trivial.
- **Player 2** — flagged as Phase B in teacher Q4.  Pad-2 routing
  on cc65 is straightforward; scope is the UI for configuring a
  second player module + its own start position / controls.
- **Doors** — multi-background scene transitions on door-tile
  overlap.  Depends on the scroll / multi-screen work.
- **HP + damage** — wire `players.player1.config.maxHp` and
  `enemies.*.config.damagesPlayer` to actual hearts + knockback
  behaviour.  Needs HUD landed first.
- **Sound** — waits on the FamiStudio audio roadmap.

---

## Builder — 2026-04-23 Phase B chunk 2 (Scene editor)

Directly answers the pupil asks: *"select which enemies are walkers
and which are chasers, where to place them, and use the same sprite
more than once"*.  Introduces a proper scene-editor layer so each
game object is a **placed instance** referencing a sprite
definition, instead of the role-wide auto-placement of Phase A.

- **`scene` module + `instances[]` data model.**  New entry in
  `state.builder.modules.scene.config.instances` — each
  `{ id, spriteIdx, x, y, ai }`.  The same `spriteIdx` is allowed
  to appear any number of times, so a pupil who drew one
  *"goomba"* can drop three of them on the level.  `ai` ∈
  `static | walker | chaser`; the UI greys out walker/chaser for
  non-enemy roles automatically.
- **Custom-rendered UI.**  Modules can opt into a `customRender`
  flag that the builder.html tree renderer recognises.  The Scene
  module uses it to build a dynamic list with a sprite dropdown,
  role badge, x/y number inputs (constrained 0–240 / 16–216 with
  step 4), AI dropdown (role-aware), and a delete button per row.
  **+ Add instance** defaults new rows to the first non-player
  sprite, placed to the right of existing instances so they do
  not stack.
- **Walker / Chaser modules stand down gracefully.**  Both
  `enemies.walker` and `enemies.chaser` check
  `sceneHasInstances(state)` in their `applyToTemplate` and
  return the template unchanged when any instance is defined —
  so the role-wide loops never fight the per-instance AI.  The
  Scene summary line on the page makes this explicit:
  *"Walker / Chaser modules above are ignored while this list is
  in use."*
- **Assembler: per-instance AI emission.**  When instances are
  present, the Scene module emits one tailored block per
  instance.  Walkers get their own `bw_dir_<i>` static direction
  variable (so each walker flips independently); chasers get an
  inline nudge-toward-player block targeting `ss_x[i]` / `ss_y[i]`
  directly.  Static instances emit no AI.
- **Play payload: `sceneSprites` now derived from instances.**
  When the scene has entries, `sceneSprites` maps 1:1 to the
  list (keeping index order so `ss_x[i]` references stay
  correct).  When the list is empty, the previous auto-placement
  pipeline kicks in — zero regression for existing projects.
- **Two new validators:**
  - `scene-invalid-sprite` (error) — an instance references a
    `spriteIdx` that no longer exists (pupil deleted the sprite
    on the Sprites page).  Build would break; Play is blocked
    until the row is removed or the sprite recreated.
  - `scene-off-screen` (warn) — an instance's x/y is outside
    0-240 / 16-216.  The sprite will not be visible but the
    build is fine; surfaced as a warning so the pupil notices.
- **Assembler MODULE_ORDER** reshuffled to
  `game → players → scene → enemies → behaviour_walls → pickups
  → doors → events → win_condition` so Scene's per-instance
  blocks land in `per_frame` before the role-wide blocks would
  (the latter are no-ops once Scene is active, but the ordering
  keeps the output readable).

### Verification — Phase B chunk 2

`/tmp/builder-smoketest-4.mjs` covers six scenarios, all pass:

1. Empty scene → walker role loop still emitted (backward
   compatibility for projects that never touch the Scene list).
2. Single walker instance → walker role loop silenced, per-
   instance block emitted with `ss_x[0] += 1`.
3. Two instances of the *same* spriteIdx with different AI →
   `bw_dir_0` for the walker at ss_x[0], direct chaser nudge on
   ss_x[1] / ss_y[1].  cc65 compiles the result in 38 ms.
4. Static instance of an enemy → no `bw_dir_*` and no `ss_x[i]
   +=` emission.
5. Invalid spriteIdx → `scene-invalid-sprite` (error) fires.
6. Off-screen position → `scene-off-screen` (warn) fires.

### Deliberately out of chunk 2 — next chunks

- **Visual scene preview / click-to-place.**  A small canvas in
  the right-hand column that draws placed instances would make
  positioning much faster than number inputs.  Tractable
  follow-up once the data model has proven itself.
- **Animation role tagging** (pupil ask).  Currently
  `state.animation_assignments` only knows about the *player's*
  walk / jump.  Next chunk will add a `role` + `style` tag to
  each animation and let the Scene assembler pick the right
  animation for each enemy instance.
- **Player 2** — still Phase B; benefits from having scene
  instances as its second player has the same "per-placement"
  character as enemies.
- **Per-instance speed / HP** — the data model has room for
  `ai_speed`, `maxHp`, etc.; surfacing them in the UI is a
  small follow-up once we know which knobs pupils actually
  reach for.

---

## Builder — 2026-04-23 Phase B chunk 3 (animation role/style tagging)

Answers the pupil ask *"it is probably worth being able to tag the
animations as 'player' 'enemy' 'pickup' etc."* — introduces a
metadata layer so animations describe themselves, auto-wiring the
player's walk / jump along the way.

- **New fields on each animation:** `role` ∈ `player | enemy | npc
  | pickup | any`, `style` ∈ `walk | jump | idle | die | attack |
  custom`.  Defaults are `player` + `custom` for brand-new
  animations, so existing pupils see the tags appear without any
  content changing.
- **Two dropdowns on the Sprites page animation editor** — *Used
  by* and *Style*.  Next to them, the muted hint *"Tag once, wired
  automatically."*  Each animation's list entry also shows its tag
  inline (e.g. *"3 frames · 8 fps · Player/Walk"*) when the tag is
  specific enough to be interesting.
- **Auto-derivation.**  `state.animation_assignments.walk` and
  `.jump` are kept in sync with tagged player animations
  automatically.  Tag an animation as Player + Walk and the Walk
  assignment dropdown below updates without a second click.  The
  Walk / Jump dropdowns are still present — pupils who want
  explicit override still can — and each entry shows a *"✓
  (tagged)"* marker next to animations whose tag already matches.
- **Migration is two-way.**  Old saves with a non-null
  `animation_assignments.walk` but no tags get their walk-assigned
  animation tagged `player + walk` (same for jump); new tags
  without explicit assignments populate the assignments.  Existing
  projects round-trip unchanged.  Invalid `role` / `style` values
  (from hand-edited JSON or future tag values) are clamped to the
  defaults during migration.
- **Constants exported:** `ANIM_ROLES`, `ANIM_STYLES`,
  `ANIM_ROLE_LABELS`, `ANIM_STYLE_LABELS` at the top of sprites.html
  next to the existing `ROLE_*` tables — single source of truth
  for both the UI dropdowns and the migration validator.

### Verification — Phase B chunk 3

`/tmp/builder-smoketest-5.mjs` runs seven assertions, all pass:

1. `sprites.html` still contains the tagging constants and the
   key migration snippets (guard against accidental drift).
2. Default animation gets `role=player, style=custom`.
3. Legacy `animation_assignments.walk = 5` back-tags animation 5
   as `player + walk`.
4. A pre-tagged `player + jump` animation auto-populates
   `animation_assignments.jump`.
5. `enemy + walk` does *not* claim the player's walk slot.
6. Both walk + jump auto-derive simultaneously when both tags
   exist.
7. Invalid tag values clamp to defaults (`role=pirate` →
   `player`, `style=moonwalk` → `custom`).
8. Real cc65 builds the resulting `main.c` in 35 ms — no
   regression for existing pipelines.

### Deliberately out of chunk 3 — next chunks

- **Runtime playback of tagged animations on scene sprites.**
  Enemies currently use their static `ss_tiles[]` layout.  Wiring
  a per-instance animation frame cycle needs the server's
  `build_scene_inc` to emit per-role animation tables and the
  platformer template to add per-instance animation state.  Next
  chunk.
- **Player 2** — teacher Q4.  Benefits from the scene-instances
  foundation; will likely reuse the same per-instance renderer
  as enemies.
- **HUD, doors, HP/damage** — still in the Phase B backlog.

---

## Builder — 2026-04-23 Phase B chunk 4 (Scene preview canvas)

Chunk 3's tags were metadata; this chunk is about placement UX.
Pupils now get a visual preview above the instance list, with
click-to-add and drag-to-move — answering the *"where to place
them"* ask from the Phase B scene-editor feedback.

- **New shared module `tools/tile_editor_web/sprite-render.js`.**
  Exposes `window.NesRender` with the NES palette table, palette
  helpers (`spritePaletteFor`, `bgPaletteFor`, `pixelRgb`), and
  `drawSpriteIntoCtx(ctx, sprite, state, destW, destH)`.  Lifted
  out of sprites.html's ~30-call-site internal helpers so the
  Builder page can paint sprites without a copy-paste.  sprites.html
  continues to work unchanged — it has its own versions of the
  same helpers that stay in place; a future chunk will swap them
  to call `NesRender.*` and delete the duplicates.
- **Preview canvas in the Scene module.**  512×480 css canvas
  (256×240 NES pixels at 2×), renders:
  - A faint 16-pixel grid so pupils can eyeball tile coordinates.
  - The Player 1 sprite at its start position, outlined in the
    editor accent colour so it's unmistakable.
  - Every scene instance, drawn via `NesRender.drawSpriteIntoCtx`
    at its logical (x, y) and outlined in a role-specific colour
    (enemies pink, npcs cyan, pickups green, projectiles orange,
    other grey).
- **Mouse events.**  Click an empty area → adds a new instance at
  the cursor using the first available non-player sprite (same
  defaults as the "+ Add instance" button).  Mouse-over an
  instance switches the cursor to `grab`; mousedown + drag moves
  it in 1-px NES steps, clamped so the sprite stays on screen
  (x ∈ [0, 255-w], y ∈ [16, 232-h]).  Release saves the final
  position and re-renders the instance rows so the x/y inputs
  update.  No artificial debouncing — the Storage layer's
  existing scheduleSave already throttles localStorage writes.
- **Role-coloured outlines** pair with the role badge on each
  instance row, so clicking an outlined sprite on the canvas and
  finding its row in the list below is one eye-track away.
- **CSS.**  The canvas is responsive (max-width: 512px, height
  auto) with `image-rendering: pixelated` so the NES-size pixels
  stay crisp, and `cursor: crosshair` by default to hint that
  clicking is meaningful.

### Verification — Phase B chunk 4

- `node --check` clean on sprite-render.js and on the extracted
  inline script of builder.html.
- `/tmp/builder-preview-smoke.mjs` runs three checks:
  1. `NesRender` loads headlessly (no DOM required) and exposes
     the expected API surface.
  2. Default-state Builder output still compiles through real
     cc65 in ~70 ms (no regression from the preview additions).
  3. A scene with two instances pointing at the *same* sprite
     (`spriteIdx: 1` twice) compiles cleanly — guards the "use
     the same sprite more than once" promise.
- Manual: preview canvas renders correctly in the browser,
  click adds an instance, drag moves it, both the canvas and
  the x/y inputs below stay in sync.

### Deliberately out of chunk 4 — continuing chunks

- **Runtime playback of tagged animations on scene sprites.**
  Still deferred — enemies currently render their static
  sprite layout.  Next candidate for a bigger chunk because it
  touches `playground_server.py`.
- **Background-nametable rendering inside the preview.**  Only
  the grid is drawn today; showing the pupil's painted background
  tiles would require a nametable-to-canvas renderer (CHR +
  palette + attribute-table lookups).  Clean follow-up; not
  blocking for placement UX.
- **sprites.html migration.**  The duplicate helpers on
  sprites.html work fine; swapping its internal calls to
  `NesRender.*` is a low-risk cleanup for a later session.
- **Multi-select / copy-paste of instances, undo on the canvas.**
  Not needed for chunk 4's placement core; easy additions once
  pupil feedback arrives.

### Chunk 4 polish — 2026-04-23 background + player drag + legacy hide

Three pupil-driven follow-ups shipped the same day:

- **Background now renders behind the instances.**  The preview
  canvas reads the active background's nametable (32×30 cells
  each carrying `{tile, palette}`) and paints each cell's 8×8
  tile using `NesRender.bgPaletteFor(state, cell.palette)`.  The
  universal BG colour is filled first so transparent pixels show
  the correct backdrop.  The faint tile grid still overlays on
  top for coordinate eyeballing.  Multi-screen worlds render
  only the first screen in the placement view — scene sprites
  live on screen 1 anyway, and a pan-across preview is a bigger
  feature for a later chunk.
- **Player 1 is now draggable.**  The hit-test grew a
  `playerDragHandle()` that exposes the player's start
  position via getters/setters on `players.player1.config.startX/Y`
  — so the drag code treats the player exactly like a scene
  instance.  Scene instances still win when they overlap the
  player handle so pupils can pick up an instance on top of the
  start marker.  Releasing a player drag re-renders the module
  tree so the Player 1 number inputs update to the new
  position (scene-instance drags only refresh their own row,
  which is cheaper).
- **Enemies module hidden.**  The Scene module now supersedes
  it — per-instance AI strictly expresses everything the global
  Walker / Chaser switch did.  Added a `hidden: true` flag to
  the Enemies module definition plus support for it in
  `renderTree()` / `renderModule()`.  Legacy projects with
  `enemies.walker.enabled` and an empty Scene list still get
  their walker code emitted (the applyToTemplate is unchanged,
  just un-rendered).  Scene's description updated to mention
  dragging the player too.

---

## Builder — 2026-04-24 Phase B chunk 5 (Player 2)

First chunk to touch all three layers — client, template, server —
since chunk 1 of Phase A.  Plan lives in
[builder-plan-player2.md](builder-plan-player2.md); implementation
followed the ten-step order in §7 of that plan.

- **Server (`playground_server.py`).**  `build_scene_inc` gained
  three optional kwargs (`player_idx2`, `start_x2`, `start_y2`).
  When `playerSpriteIdx2` is a valid index in the /play payload
  the server emits `#define PLAYER2_ENABLED 1` plus
  `PLAYER2_W / H / X / Y` and the `player2_tiles[]` /
  `player2_attrs[]` arrays drawn from the second Player-tagged
  sprite.  When P2 is off, it still emits `#define PLAYER2_ENABLED
  0` so the template's `#if` gates evaluate cleanly without relying
  on the undefined-macro-is-zero convention.
- **Template (`builder-templates/platformer.c`).**  Everything new
  is behind `#if PLAYER2_ENABLED` so a P1-only ROM compiles
  byte-for-byte the same as before (verified by sha1sum).  Adds:
  - `JOYPAD2` define + `read_both_controllers()` helper that
    latches once and shifts both pads in parallel.
  - Module-scope P2 state (`px2`, `py2`, `pad2`, `prev_pad2`,
    `jumping2`, `jmp_up2`, `plrdir2`, `walk_speed2`) with a
    `//>> player2_walk_speed` region.
  - P2 init inside `main()` (behind a `//>> player2_start`
    region so guided-mode pupils can override), plus a jump-height
    region `//>> player2_jump_height` inside the jump branch.
  - P2 movement block mirroring P1's walk + jump + gravity with
    wall / platform detection.  Deliberate MVP omissions
    (documented in the plan): no ladder support, no ceiling-bonk
    on jump.
  - P2 render loop after P1's OAM writes, using `player2_tiles` /
    `player2_attrs` from scene.inc.  No animation cycling for P2
    in this chunk; P2 uses its static layout.
- **Builder client.**
  - New `modules['players.player2']` submodule with the same
    schema as P1 (startX/Y, walkSpeed, jumpHeight, maxHp).
    `applyToTemplate` replaces the two new `//>>` regions with
    typed values; start position flows through scene.inc as
    `PLAYER2_X/Y` instead.
  - `BuilderDefaults()` seeds P2 disabled; non-destructive
    back-fill in `migrateBuilderFields` on both sprites.html and
    index.html adds the P2 submodule to older saves without
    touching any existing fields.
  - `builder-assembler.js` gains `findSpritesByRole(state, role)`
    (returns every index) alongside `findSpriteByRole` so the
    second player is the second element of the player list.
  - `pickups.applyToTemplate` now emits an `#if PLAYER2_ENABLED`
    block alongside its P1 AABB collision check so either player
    can collect pickups.
  - `win_condition.applyToTemplate` extends the reach-tile branch
    with a second player check and zeros P2's movement state in
    the freeze block when the screen tints red.  All-pickups win
    type already works for both players because the counter itself
    is shared.
- **Validator `player2-needs-second-sprite`** (error) fires when
  Player 2 is enabled but fewer than two sprites are tagged Player.
  Blocks Play until the pupil either tags a second Player sprite
  or turns P2 off.
- **Preview canvas.**  `playerDragHandle()` became
  `playerDragHandles()` — an array holding one handle per enabled
  player.  Each handle carries a `kind` tag (`player1` / `player2`)
  so the drag code still knows who to save back to.  P1 outlined
  accent-yellow; P2 outlined cyan so pupils can tell them apart.
  Both are draggable, both respect the screen-bounds clamp.
- **Play payload.**  When `p2.enabled && playerIdxs[1]` exists,
  the Builder sends `playerSpriteIdx2` + `playerStart2` in the
  /play POST.  Otherwise neither field is included and the ROM
  builds as single-player.

### Verification — Phase B chunk 5

`/tmp/builder-player2-smoke.mjs` spawns a throwaway Playground
Server on port 18768 and runs five assertions:

1. Default (P2 off, one player sprite) has no errors.
2. P2 enabled + only one Player sprite → `player2-needs-second-sprite`
   error fires at `severity: error`.
3. P2 enabled + two Player sprites → output contains the expected
   template markers (walk_speed2 = 2, jmp_up2 = 25, init block,
   P2 render loop, dual-player pickup branch, dual-player win
   check `bw_tl2`).
4. P1-only `/play` build compiles via real cc65 (49168 bytes, 44 ms).
5. P2-enabled `/play` build compiles via real cc65 (49168 bytes,
   51 ms).  Same ROM size as P1-only because the template's
   `#if PLAYER2_ENABLED` gates kick in at preprocess time — the
   P1-only path elides every P2 byte.

Also manually verified that swapping the updated template into
Step_Playground's `main.c` and building with P2 undefined
produces a ROM with an identical sha1sum to the pre-chunk-5
baseline — no silent regression for projects that never enable
P2.

### Deliberately out of chunk 5

- **Per-player animations.**  P2 draws static tiles only; cycling
  `walk` frames for P2 needs either shared-with-P1 (wrong art
  when P2 is a different sprite) or per-player anim tables (a
  bigger server-side change).  Deferred.
- **Ladder + ceiling-bonk for P2.**  Adds ~25 lines of gated
  code mirroring P1; not needed for a "two-player platformer"
  feel.  Easy follow-up.
- **HP / damage.**  P2's `maxHp` field is in state for forward
  compatibility but unwired.
- **Camera follow when scrolling.**  In `SCROLL_BUILD` the camera
  tracks P1 only; P2 scrolls off-screen when far apart.  A
  "midpoint camera" + soft zoom is a neat future chunk once
  scrolling lands for real levels.
- **Player-vs-player collision.**  Not implemented.  The two
  characters pass through each other for now.

### Chunk 5 polish — 2026-04-24 same-day fixes

Three follow-ups from the first pupil test after Player 2 shipped:

- **Player drag regression — fixed.**  When chunk 5 renamed the
  player handle's `kind` from `'player'` to `'player1'` /
  `'player2'`, `draggableSprite()` was left checking the old
  string.  That silently returned null for both player handles so
  drags on the preview did nothing — the release update ran but
  with a stale sprite reference, leaving the marker where it
  started.  Fix is one line: match the two new kinds.
- **Player 2 keyboard map on the browser emulator.**  The jsnes
  embed was only wiring pad 1.  The `map()` helper now returns
  `{pad, button}` pairs so the switch table can target either
  controller.  Layout picked for zero-conflict with Player 1:
  - **P1** keeps Arrow keys + `F` = A + `D` = B + `Enter` = Start + `Right Shift` = Select.
  - **P2** uses `I` / `J` / `K` / `L` for D-pad, `O` = A, `U` = B, `1` = Start, `2` = Select.
  The IJKL cluster is the classic NES emulator "player 2" layout,
  and none of P2's keys collide with P1's.
- **Controls surfaced to pupils in two places.**  The
  `emu-status` strip under the emulator canvas was a single
  one-line hint; it now renders both players' keys with
  `<kbd>`-styled chips and a CSS rule (`body.emu-single-player
  #emu-p2-controls { display: none; }`) that hides the P2 line
  when the current ROM didn't wire P2 in, so the hint never
  advertises keys that do nothing.  The Help dialog (`?` button)
  grew an **Emulator controls** section with a proper two-row
  table — D-pad / A / B / Start / Select columns — so pupils can
  look up the mapping without launching a game.  A footnote
  reminds pupils that P2 keys only activate when the module is
  ticked and a second Player sprite exists.

### Verification — chunk 5 polish

- `node --check` clean on the extracted inline JS of builder.html.
- Same `/tmp/builder-player2-smoke.mjs` from chunk 5 still passes
  all five assertions — both P1-only (49168 bytes, 45 ms) and
  P2-enabled (49168 bytes, 44 ms) builds compile cleanly via
  real cc65.  The polish was pure UI/drag-handler and didn't
  touch the assembler or template paths.
- Inline-style lint warnings caught by the IDE on the help
  dialog's new bits were moved into the existing inline `<style>`
  block (`.help-controls-heading`, `.help-controls-lead`,
  `.controls-table`, `.help-controls-foot` + `kbd` chip
  styling) so the page is clean of additions on the
  project-wide-inline-style warning list.

---

## Builder — 2026-04-24 Phase B finale chunk A (HP, damage, HUD)

First of four chunks planned in
[builder-plan-phase-b-finale.md](builder-plan-phase-b-finale.md).
Enemies become threats; a visible heart counter shows the
consequences.  The mechanics are on-by-opt-in so pre-chunk-A
projects compile byte-for-byte unchanged (verified by sha1sum
against the baseline ROM).

- **New role `ROLE_HUD = 10`** on the Sprites page's role
  dropdown + in `ROLE_CODES` on the server.  First sprite tagged
  HUD becomes the heart icon the HUD render loop paints N times
  across the top of the screen (one per remaining HP).
- **Server emits HUD glyphs** when a sprite has role=hud:
  `#define HUD_ENABLED 1` + `HUD_W` / `HUD_H` + `hud_tiles[]` /
  `hud_attrs[]`.  Otherwise `HUD_ENABLED 0` stub so the
  template's gate compiles cleanly.
- **Template additions** (all behind `#if PLAYER_HP_ENABLED` /
  `#if HUD_ENABLED`):
  - Three new globals: `player_hp`, `player_iframes`,
    `player_dead` (HP count, invincibility timer, game-over
    latch).
  - HP init in `main()`: `player_hp = PLAYER_MAX_HP`.
  - HUD render loop inside the OAM write block — one copy of
    the hud sprite per HP, stepping right from (8, 8).
  - The declarations slot moved to *before* the first `#if`
    block so `#define PLAYER_HP_ENABLED 1` reaches the
    preprocessor in time — an ordering bug caught by the
    smoke-test and fixed in the same commit.
- **Builder modules:**
  - `damage` (new, off by default) — fields: damage amount
    (1–9), invincibility frames (0–120).  `applyToTemplate`
    emits `#define DAMAGE_AMOUNT` / `#define INVINCIBILITY_FRAMES`
    into the declarations slot plus an AABB enemy-vs-player
    collision loop into per_frame; a hit decrements `player_hp` by
    `DAMAGE_AMOUNT` and starts the iframes timer; HP == 0 → `player_dead = 1`; `if (player_dead)`
    freeze block zeros walk/climb/jump and tints the screen
    greyscale + blue (`PPU_MASK = 0x1F | 0x80`).  Blue = defeated,
    paired with win_condition's red = victory, for a consistent
    visual vocabulary.
  - `hud` (new, off by default) — UI-only, no
    applyToTemplate; the template's `#if HUD_ENABLED` gate
    fires as soon as a HUD-tagged sprite exists and the module
    is ticked.
  - `players.player1.maxHp` — schema unlocked from readOnly
    (was 0..0) to a regular 0–9 integer.  The player module's
    `applyToTemplate` appends `#define PLAYER_HP_ENABLED 1` +
    `#define PLAYER_MAX_HP <n>` only when maxHp > 0 AND the
    damage module is enabled, keeping the preprocessor gate
    conservative.
- **Three new validators:**
  - `hp-zero-with-damage` (error) — damage on but maxHp = 0.
    Blocks Play; message *"Raise Player 1 → Max HP above 0, or
    turn Damage off."*
  - `damage-no-enemies` (warn) — damage on but no sprite is
    tagged Enemy.  Game builds; nothing to collide with.
  - `hud-no-sprite` (warn) — HUD on but no sprite is tagged
    HUD.  Game builds; hearts silently won't render.
- **Migration is non-destructive**: `migrateBuilderFields` on
  both sprites.html and index.html back-fills `damage` and
  `hud` modules (disabled, default config) onto existing saves
  without touching pupil state.

### Verification — chunk A

`/tmp/builder-chunk-a-smoke.mjs` runs eight assertions, all pass:

1. `hp-zero-with-damage` error fires on damage-without-HP state.
2. `damage-no-enemies` warn fires on damage-on / no-enemy-sprite.
3. `hud-no-sprite` warn fires on HUD-on / no-HUD-sprite.
4. Default state does not leak `#define PLAYER_HP_ENABLED 1`.
5. Damage + maxHp=3 state emits every expected macro +
   collision loop + blue-tint freeze block.
6. `/play` default build compiles via real cc65 (49168 bytes,
   46 ms).
7. `/play` damage build compiles (49168 bytes, 45 ms).
8. `/play` damage + HUD + hud-tagged-sprite build compiles
   (49168 bytes, 44 ms).

Manual: sha1sum of the stock Step_Playground ROM is unchanged
when platformer.c is swapped in with no Builder modules ticked.

### What's next — chunks B, C, D

- **Chunk B — runtime animations on scene sprites.**  Tagged
  walk/idle animations actually cycle frames on enemies /
  pickups.  Touches `playground_server.py` for per-role
  animation tables.
- **Chunk C — doors & scene transitions MVP.**  Tile-based
  doors; walking onto a DOOR tile swaps to a target background.
  Needs multi-nametable emission from the server.
- **Chunk D — polish.**  Eject-to-Code button, per-module
  detailed help popover, sprite-preview picker in the scene
  instance dropdown.

All three are planned in detail in
[builder-plan-phase-b-finale.md](builder-plan-phase-b-finale.md).

---

## Builder — 2026-04-24 Phase B finale chunk B (runtime animations)

Second of four chunks.  The `role + style` animation tags we
shipped in Phase B chunk 3 finally drive visible frames on scene
sprites — enemies walking, cycling through their tagged animation.

- **MVP scope:** `enemy + walk` only.  Other `(role, style)`
  pairs (`enemy + idle`, `pickup + idle`, `npc + walk/idle`) are a
  follow-up micro-chunk; scope here kept narrow to limit the
  template / server surface change.
- **New server helper `_resolve_tagged_animation(state, role, style)`**
  finds the first animation tagged that way, drops frames whose
  size mismatches the first frame, and returns `(frames, fps, w, h)`.
  Sibling to the existing `_resolve_animation` used by the player's
  walk/jump.
- **Server emits** `#define ANIM_ENEMY_WALK_COUNT/TICKS/W/H` plus
  `anim_enemy_walk_tiles[]` / `anim_enemy_walk_attrs[]` when a
  matching tagged animation exists; stub `COUNT 0` otherwise so
  the template's `#if` gate compiles cleanly.  Also emits two new
  mutable arrays per scene instance — `ss_anim_frame[N]` and
  `ss_anim_tick[N]`, both zero-initialised.
- **Template changes** (all `#if ANIM_ENEMY_WALK_COUNT`-gated):
  - A per-frame tick advancer that walks every scene sprite,
    picks up enemies whose size matches the animation's, and
    advances `ss_anim_tick[i]` → wraps `ss_anim_frame[i]` when
    it hits `ANIM_ENEMY_WALK_TICKS`.
  - The static-sprite render loop is duplicated behind
    `#if ANIM_ENEMY_WALK_COUNT > 0` / `#else` so the animation
    variant can swing a `src_tiles` / `src_attrs` pointer between
    `ss_tiles[off]` (static) and `anim_enemy_walk_tiles[frame*W*H]`
    (animated) per instance.  The `#else` branch is a character-
    for-character copy of the pre-chunk-B loop so a ROM with no
    tagged animation compiles byte-identical to today's
    baseline (verified by sha1sum round-trip against
    Step_Playground's own `main.c`).
- **Validator `enemy-walk-anim-size-mismatch` (warn)** fires when
  an enemy+walk animation exists but no sprite tagged Enemy
  shares its W×H.  Animation silently fails the template's size
  check today; the validator tells the pupil why the frames
  aren't playing.

### Verification — chunk B

`/tmp/builder-chunk-b-smoke.mjs` runs three assertions, all pass:

1. `enemy-walk-anim-size-mismatch` warn fires on 2×2 enemy
   sprite + 3×3 walk animation frames.
2. No-animation `/play` build compiles via real cc65 (49168
   bytes, 42 ms) — byte-identical pipeline to pre-chunk-B.
3. `enemy + walk` tagged animation + two enemy instances → ROM
   compiles (49168 bytes, 42 ms) and scene.inc includes
   `ANIM_ENEMY_WALK_COUNT 3` + the frame tables.

Manual: Step_Playground's stock `main.c` replaced by the updated
`platformer.c` (no tagged animation in its state) compiles to
sha1sum `c77d502b7439`, identical to the baseline — no
regression.

### Deferred from chunk B (follow-up micro-chunks)

- **Other (role, style) pairs:** `enemy + idle` for static enemies,
  `pickup + idle` for bouncing collectibles, `npc + walk` /
  `npc + idle`.  Same emission pattern; just more symbols.
- **Direction-aware animation:** left-facing enemies could cycle
  a `walk_left` vs `walk_right` table.  Today the existing
  attr XOR with `plrdir` handles flip-H for static sprites;
  animated enemies don't know about direction yet.
- **Per-instance animation override** — pick one animation per
  scene instance rather than "first tagged wins".  Needs the
  Scene editor's instance row to grow a small animation picker.

---

## Builder — 2026-04-24 Phase B finale chunk C (teleport doors)

Third chunk of the Phase-B-finale plan, shipped at a narrowed
scope from the original multi-background vision.  The full
"walk from Room A into Room B" vision needs `build_nam()` to
emit multiple nametables + `graphics.s` to be parameterised +
runtime PPU-register swaps — a ~500-line delta that deserves
its own chunk.  The MVP here ships the tile-event half of
doors: **stepping on a DOOR tile teleports the player to a
configured spawn point in the same background.**

Still valuable for pupils: secret passages, "fall off the map
→ respawn at start", portal loops.  Teaches the tile-based
event pattern that the multi-background story will build on.

- **New `doors` module** with `spawnX` / `spawnY` config.
  `applyToTemplate` emits a per-frame block that reads
  `BEHAVIOUR_DOOR` at the player's centre tile; on match the
  player is teleported to `(spawnX, spawnY)` and any in-progress
  jump is cancelled.  Player 2 gets the same check in an
  `#if PLAYER2_ENABLED` block so either player can step through.
- **New validator `doors-no-door-tiles` (error)** — module on
  but no DOOR behaviour tile painted → teleport can never
  trigger; Play is blocked until the pupil paints a door or
  ticks the module off.
- **Migration:** non-destructive back-fill in
  `migrateBuilderFields` adds a disabled `doors` module to
  existing saves on first load from any page.

### Verification — chunk C

`/tmp/builder-chunk-c-smoke.mjs` runs four assertions, all pass:

1. `doors-no-door-tiles` error fires when doors on but no door
   painted.
2. Validator goes silent once a door tile is painted.
3. Assembler emits the teleport marker + spawn coord
   substitutions + `BEHAVIOUR_DOOR` check + the
   `#if PLAYER2_ENABLED` P2 branch.
4. `/play` end-to-end build compiles via real cc65 (49168 bytes,
   50 ms).

### Deferred from chunk C (future work)

- **Multi-background doors.**  The real goal: step onto a door,
  the nametable swaps to a new room.  Needs `build_nam()` to
  emit one nametable per `state.backgrounds[]` entry, the stock
  `graphics.s` / `load_background()` to be parameterised over
  nametable addresses, and a runtime palette swap path.
  Planned; not in this chunk.
- **Per-door spawn points.**  All doors currently share a single
  spawn (module-level config).  A richer version would let each
  door paint configure its own `targetBg` + `(x, y)` — the
  Behaviour page already supports custom-per-tile metadata, so
  this is mostly UI.
- **Door animations / sound on transition.**  Out of scope
  entirely; waits on the FamiStudio chunk.

---

## Builder — 2026-04-24 Phase B finale chunk D (polish)

Final chunk in the Phase-B-finale plan.  Three small UX
improvements landed together; none is big enough to warrant
its own chunk but together they noticeably sand the rough
edges off the Builder.

- **📝 Open as Code (advanced)** in the File ▾ menu (new
  *Advanced* section under *Save & restore*).  Assembles the
  current state's `main.c` via the Builder assembler, saves
  the result to `state.customMainC`, and navigates to
  `code.html?stay=1`.  One-way by design (matches teacher Q1's
  decision back in the chunk-1 plan): after ejecting, the
  Code page owns the game; returning to the Builder is fine
  but C edits don't round-trip.  Confirm dialog explains the
  one-way nature before committing.
- **Per-module detailed help popover (ℹ️).**  Modules can
  opt into a longer-form explanation via a new optional
  `detailedHelp` field on the module definition (either a
  string or an array of paragraphs).  When present, an ℹ️
  button appears next to the module header; clicking it
  toggles a bordered panel under the header with the
  paragraphs rendered one-per-`<p>`.  Panel toggles
  independently of the card's expand/collapse so pupils can
  read the help without opening every setting at once.
  Three modules ship with `detailedHelp` today — **Damage**,
  **Doors**, and **Scene** — chosen because they're the
  most-questioned in pupil sessions.
- **Sprite thumbnail on each scene-instance row.**  The
  Scene module's per-instance dropdown sat next to a role
  badge; pupils had to read names to know what they were
  placing.  Chunk-D adds a 24×24 canvas before the dropdown
  that paints the currently-selected sprite via
  `NesRender.drawSpriteIntoCtx`.  Updates live when the
  dropdown changes; no new picker dialog, just instant
  visual confirmation.

### Verification — chunk D

- `node --check` clean on the extracted inline JS of
  builder.html and on `builder-modules.js`.
- All five prior smoke-test suites still pass:
  - Chunk A (HP + damage + HUD) — 49168 bytes, 47 ms.
  - Chunk B (runtime animations) — 49168 bytes, 44 ms.
  - Chunk C (teleport doors) — 49168 bytes, 40 ms.
  - Scene preview — NesRender headless + same-sprite-twice
    still compiles.
  - Player 2 — 49168 bytes, 48 ms.
  No regression across any of the chunks shipped this
  session.

### Phase B finale — status

- **Chunk A — HP + damage + HUD:** shipped.
- **Chunk B — Runtime animations (enemy+walk):** shipped.
- **Chunk C — Teleport doors (narrowed MVP):** shipped
  (multi-background deferred).
- **Chunk D — Polish (eject / help / thumbs):** shipped.

---

## Builder — 2026-04-24 Phase B+ Round 1 (polish sweep)

Three consolidation pieces from
[builder-plan-phase-b-plus.md](builder-plan-phase-b-plus.md),
shipped together because each is 20–80 lines.  Byte-identical
baseline preserved throughout.

- **1a — Player 2 HP + damage.**  New `PLAYER2_HP_ENABLED` /
  `PLAYER2_MAX_HP` macros emitted by the Player 2 module's
  `applyToTemplate` when P2 is on + Damage is on + P2's maxHp > 0
  (field unlocked from read-only; range 0–9).  Template gains
  `player2_hp / iframes / dead` globals behind the new gate;
  `damage.applyToTemplate` emits a mirror P2 collision loop
  inside `#if PLAYER2_HP_ENABLED`.  The blue-tint game-over
  condition now fires only when every HP-enabled player is dead
  — pre-processed to the right variant based on which gates are
  on.  HUD gained a top-right mirror of the P1 heart row,
  anchored to `248 - (HUD_W << 3)` and stepping leftwards.  New
  validator `p2-hp-zero-with-damage` (warn) nudges pupils who
  tick Damage with P2 enabled but P2.maxHp == 0 — not an error
  because "assist mode" co-op (P2 invincible) is legitimate.
- **1b — Player 2 animation.**  New `player2` entry in
  `ANIM_ROLES` / `ANIM_ROLE_LABELS` on the Sprites page.  Server's
  `anim_targets` list extended so `role=player2, style=walk`
  emits `#define ANIM_PLAYER2_WALK_COUNT / TICKS / W / H` plus
  `anim_player2_walk_tiles[]` / `anim_player2_walk_attrs[]` when
  tagged.  Template gains `p2_walk_frame` / `p2_walk_tick`
  globals and a second copy of the P2 render loop (behind
  `#if ANIM_PLAYER2_WALK_COUNT > 0` / `#else`) that swings the
  tile source to the animation table when P2 is walking
  (`pad2 & 0x03`) AND the sprite size matches the animation's
  W×H.  Idle resets the cycle so walking restarts cleanly.
- **1c — `enemy + idle` and `pickup + idle` animation pairs.**
  Server's `anim_targets` extended (one line added).  Template's
  per-instance animation driver refactored to one priority
  cascade (`#if ANIM_ENEMY_WALK` → `#if ANIM_ENEMY_IDLE` → `#if
  ANIM_PICKUP_IDLE`) so adding more pairs later is a
  `||`-extension of the `BW_HAS_SCENE_ANIM` macro.  Render
  loop and tick advance both read the new pairs; mismatched
  sizes fall through to static art same as chunk B.

### Verification — Round 1

`/tmp/builder-round1-smoke.mjs` — five assertions, all green:

1. Assembler emits `PLAYER2_HP_ENABLED 1`, `PLAYER2_MAX_HP 3`,
   and the `dmg2_hit` collision loop when the right combination
   is ticked.
2. `enemy + idle` tagged animation → `/play` build compiles via
   real cc65 (49168 bytes, 110 ms).
3. `pickup + idle` tagged animation → compiles (49168 bytes,
   157 ms).
4. `player2 + walk` tagged animation + P2 enabled → compiles
   (49168 bytes, 185 ms).
5. **Everything-on** — P2 enabled + P2 HP + P2 walk anim +
   enemy idle + pickup idle + damage + HUD + hud-tagged sprite
   — compiles (49168 bytes, 169 ms).

Baseline ROM hash `c77d502b7439` still holds with the new
template swapped in and no new modules ticked.  All prior
smoke-test suites (chunks A, B, C, preview, P2) still pass.

### What's next

Moving straight into Round 2 (dialogue) and Round 3
(multi-background doors) per the same plan.

---

## Builder — 2026-04-24 Phase B+ Round 2 (dialogue)

NPC interaction via B button — classic JRPG pattern, pupils have
been asking for this.

- **New `dialogue` module** (disabled by default).  Config:
  - `text` (up to 28 characters).
  - `proximity` (1–6 tiles — how close the player must be).
- **Font-tile convention.**  Text is rendered as NES tile indices
  using ASCII values — `A = 0x41`, `Z = 0x5A`, `0–9 = 0x30–0x39`,
  space = `0x20`.  Pupils paint letter-shaped BG tiles at these
  indices on the Backgrounds page; the string `"HELLO"` becomes
  `{ 0x48, 0x45, 0x4C, 0x4C, 0x4F, 0x00 }` at build time which
  reads directly out of their tile set.  Characters without
  painted tiles silently render as empty — not broken, just
  invisible.
- **Template changes:**
  - Globals `bw_dialog_open`, `bw_dialog_prev_b` behind
    `#if BW_DIALOGUE_ENABLED`.
  - Init at main() top: zero both.
  - Per-frame logic (emitted by the module's `applyToTemplate`):
    edge-detect B, walk the scene-sprite list for NPCs, compute
    Manhattan tile-distance to the player's centre, and on
    match draw the text at row 25, col 2.  Second press closes
    via `clear_text_row()`.
  - Reuses the existing `draw_text` / `clear_text_row` helpers
    from Sprint 7's NPC snippet.
- **New `'text'` field type** in the Builder's field renderer
  so the `text` config has a plain-text input rather than a
  number spinner.  Other modules can use it going forward.
- **Two new validators:**
  - `dialogue-no-npc` (error) — dialogue on but no sprite tagged
    NPC.  Blocks Play.
  - `dialogue-empty-text` (warn) — dialogue on but text is
    blank.  Game still plays; the NPC just shows an empty box.

### Verification — Round 2

`/tmp/builder-round2-smoke.mjs` — four assertions, all pass:

1. `dialogue-no-npc` error fires when module is on without
   any NPC-tagged sprite.
2. `dialogue-empty-text` warn fires on blank text.
3. Assembler converts `"HELLO"` to the expected hex byte
   sequence and emits the `clear_text_row` close path.
4. `/play` end-to-end build with a tagged NPC + dialog text
   compiles via real cc65 (49168 bytes, 145 ms).

Baseline ROM still `c77d502b7439` with no new modules ticked.

### Deferred from Round 2

- **Per-NPC dialogue text** — today all NPC-tagged sprites
  share the module's single text config.  Per-instance text
  needs the scene editor's instance rows to grow a text field
  (Phase C).
- **Multi-line dialog boxes** — current MVP is one row.  Two-
  or three-row boxes need `draw_text` to loop over sub-strings
  or a new helper.
- **Auto-font-seed** — pupils still have to paint their own
  letter tiles.  A future "import font.chr" button would let
  them bypass painting.

---

## Builder — 2026-04-24 Phase B+ Round 3 (multi-bg doors)

Third and final round of the Phase B+ plan — completes the
doors story.  Pupils can now paint multiple backgrounds on the
Backgrounds page and use a door tile to move between them,
Zelda-style.

- **Server:** new helper `_nametable_bytes_for(nt)` factored out
  of `build_nam()`.  `build_scene_inc` now emits, for every
  painted background, a 1024-byte `bg_nametable_<N>[]` const
  array plus a `#define BG_COUNT <n>`.  Size is 1 KB per
  background — pupil projects with 3-5 rooms add 3-5 KB of PRG,
  well within cc65's budget.
- **Template:** new globals and helper (all behind
  `#if BW_DOORS_MULTIBG_ENABLED`):
  - `unsigned char current_bg` — which room the player is in.
  - `static void load_background_n(unsigned char n)` — blits
    `bg_nametable_<n>[]` into PPU $2000 during a brief
    render-off window, resets scroll to (0,0), updates
    `current_bg`.  Uses a `switch` so cc65 knows which const
    array to reach for each N ≤ BG_COUNT.
  - Initialisation: `current_bg = 0` at `main()` top.
- **Doors module** gains `targetBgIdx` config (int, -1..9, default
  -1 = same-room).  `applyToTemplate` emits:
  - `#define BW_DOORS_MULTIBG_ENABLED 1` + `#define
    BW_DOOR_TARGET_BG <n>` into the declarations slot *only*
    when `targetBgIdx` is a valid index — same-room doors
    (targetBgIdx == -1) keep the chunk-C teleport code path
    untouched.
  - A `load_background_n(BW_DOOR_TARGET_BG)` call inside the
    DOOR-tile detection block, guarded by `if (current_bg !=
    BW_DOOR_TARGET_BG)` so a pupil stepping on a door from
    within the already-loaded room doesn't trigger a
    pointless reload.
  - Both P1 and P2 door-tile checks gain the swap call
    (gated by `#if PLAYER2_ENABLED`).
- **New validator `doors-target-invalid-bg` (error)** fires when
  `targetBgIdx` is ≥ the number of painted backgrounds.  Without
  it the build would still compile (the `switch` falls through
  to the default case), but the pupil's intent — "swap to
  room 3" — wouldn't be expressible.
- **Migration** on both sprites.html and index.html back-fills
  `targetBgIdx: -1` onto doors modules saved before Round 3.
  Legacy same-room-teleport behaviour preserved.

### Verification — Round 3

`/tmp/builder-round3-smoke.mjs` — six assertions, all pass:

1. `doors-target-invalid-bg` error fires when targetBgIdx=3 on
   a single-background project.
2. Same-room mode (targetBg=-1) does **not** emit
   `BW_DOORS_MULTIBG_ENABLED` — chunk-C code path intact.
3. Multi-bg mode (targetBg=1, two backgrounds) emits all three
   macros + the `load_background_n` swap call.
4. `/play` single-bg default build compiles (49168 bytes, 74 ms).
5. `/play` multi-bg (2 backgrounds, target 1) compiles
   (49168 bytes, 149 ms).
6. **Kitchen-sink** — 3 backgrounds + doors (target 2) +
   dialogue (NPC with "GO EAST") + damage (P1 maxHp=3) + the
   usual enemy — compiles end-to-end (49168 bytes, 123 ms).

Full regression across all six prior suites (chunks A, B, C;
Player 2; Round 1; Round 2) still green — no breakage.  Baseline
ROM hash `c77d502b7439` preserved with the new template swapped
in and no new modules ticked.

---

## Phase B+ — status

All three rounds shipped in one session:

- **Round 1 — polish sweep**: P2 HP + damage + HUD, P2 walk
  animation via `role=player2` tag, `enemy+idle` and
  `pickup+idle` animation pairs.
- **Round 2 — dialogue**: NPC-proximity + B-press → text box
  from pupil-painted ASCII-mapped letter tiles.
- **Round 3 — multi-bg doors**: Zelda-style room-to-room
  transitions via DOOR tile + targetBgIdx.

Six smoke-test suites all green.  Baseline ROM untouched when
no new modules are enabled.  The Builder is now a genuinely
capable NES game-builder covering:

- Two-player co-op platformers.
- HP, damage, hearts HUD, game-over.
- Enemy AI (walker / chaser) + pickups + score-to-win.
- Tagged animations for enemies, pickups, both players.
- Multi-room levels with tile-based doors.
- NPC dialogue.
- Scene editor with visual drag-to-place preview.

Remaining items on the *future* backlog:

- **Per-door / per-NPC config** — today the doors module and
  dialogue module both use single global configs.  Per-tile
  (doors) and per-sprite (dialogue) metadata is the natural
  next UI upgrade.
- **Other `(role, style)` animation pairs** — `npc+walk`,
  `npc+idle` are mechanical additions.
- **P2 jump animation** — P2 walk animation landed in Round 1;
  P2 jump is the same pattern with a different tagged style.
- **Font-tile seed** — pupils still paint their own letters
  for Dialogue; an import-default-font button would skip that.
- **Sound** — still awaits the FamiStudio chunk.
- **Player-vs-player collision, multi-line dialog boxes,
  per-background palette swaps** — all deferred.

---

## Builder — 2026-04-24 dialogue fix + regression suite + doc sweep

Follow-up after pupil testing reported a "screen glitch" when
pressing B to open an NPC dialog box.

### Dialogue double-vblank bug — root cause + fix

- **Root cause.**  Round 2's dialogue module called
  `draw_text()` / `clear_text_row()` from the `per_frame` slot.
  Both helpers internally call `waitvsync()` + toggle `PPU_MASK`.
  Because `per_frame` runs *before* the main loop's own
  `waitvsync()`, the main `waitvsync()` then waited for a
  *second* vblank — one whole frame of stale OAM.  Pupils saw
  a one-frame sprite hiccup on every B press.
- **Fix.**  New `//@ insert: vblank_writes` slot added to
  `platformer.c` immediately after the main `waitvsync()`,
  before scroll / OAM writes.  The dialogue module now:
  - In `per_frame`: detects the B edge-press + NPC proximity
    and sets a pending-command byte (`bw_dialog_cmd = 1` to
    draw, `2` to clear).
  - In `vblank_writes`: consumes the byte inside the main
    vblank window, pokes PPU_DATA directly (no `waitvsync`
    round-trip, no `PPU_MASK` toggle).
  - Emits `#define BW_DIALOG_WIDTH 28` as part of the
    declarations so the clear loop has a named constant.
- **Regression guard.**  `round2-dialogue.mjs` now explicitly
  asserts the emitted code contains **neither**
  `draw_text(BW_DIALOG_ROW…)` nor `clear_text_row(BW_DIALOG_ROW…)`
  — any re-introduction of the pre-fix pattern fails the test.

### Regression test suite promoted

The `/tmp/builder-*-smoke.mjs` files that accumulated during
Phase A / B / B+ moved into a proper home at
[tools/builder-tests/](tools/builder-tests/).  They survive
sessions now.  New files:

- `tools/builder-tests/run-all.mjs` — single entry point.
  Syntax-checks every JS / Python module + every inline script
  block (builder / sprites / index / behaviour / code pages),
  verifies the byte-identical-ROM invariant against
  Step_Playground, then runs every smoke suite sequentially.
  Exits 0 iff everything passes.
- `tools/builder-tests/README.md` — what each suite covers,
  invariants the runner enforces, how to add a new test.
- Eight standalone suites covering Chunks A/B/C, Player 2, the
  preview/scene editor, and all three Phase B+ rounds (polish /
  dialogue / multi-bg).

Current output: **22 checks pass** — 13 syntax checks + 1
byte-identical invariant + 8 smoke suites.

### Documentation

- **[BUILDER_GUIDE.md](BUILDER_GUIDE.md)** (new) — pupil + teacher
  reference for the Builder page.  Covers the pipeline,
  insertion slots, `//>>` region contract, every shipped
  module, controller mapping, the **font-tile convention for
  Dialogue** (pupils paint letter tiles at ASCII positions in
  their BG tile set — `A = 0x41`, `Z = 0x5A`, `0..9 = 0x30..0x39`),
  the tagged-animation `(role, style)` matrix, and the
  regression-test protocol.
- **[README.md](README.md)** — new §"Building a whole game
  without typing C (Builder page)" with a short description +
  link to BUILDER_GUIDE.md, including the P2 keyboard cluster.
- **[PUPIL_GUIDE.md](PUPIL_GUIDE.md)** — new §"Building a whole
  game by ticking boxes (Builder page)" with a pupil-friendly
  tour: platformer, co-op (`I/J/K/L` + `O`/`U`), enemy AI,
  pickups, hearts, doors, NPC dialogue + pointer to
  BUILDER_GUIDE.md.
- **[TEACHER_GUIDE.md](TEACHER_GUIDE.md)** — new §"Phase B —
  Builder page" with the pipeline diagram, pointers to the
  JS module files, the byte-identical-baseline invariant, and
  the **Regression tests** section explaining
  `node tools/builder-tests/run-all.mjs`.
- **[PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md)** — three Phase-B+
  features marked `[done]` in the summary table (co-op, NPC
  dialogue, multi-background doors); "Simpler no-C module
  builder" and "Trigger next-scene load" both moved from
  `[planned]` / `[new]` to `[done]`; a 2026-04-24 changelog
  entry summarising the Builder's full delivery.

### Verification — this session

- `node tools/builder-tests/run-all.mjs` → ✅ all 22 checks.
- Manual: dialogue open + close no longer skips a frame (the
  sprite-stutter "glitch" is gone), and the failure mode when
  letter tiles aren't painted is clearly documented in
  BUILDER_GUIDE.md §4 + PUPIL_GUIDE.md so pupils know to paint
  them rather than expect text to "just appear".

Phase B is effectively done.  The Builder now ships with a
proper game-feel feature set: placed enemies animate, touching
them hurts, collected pickups can win the level, doors
teleport, two-player is supported, the preview canvas shows
real art over the real background, and help is one click
away.  Remaining items on the Phase-B backlog that were
explicitly descoped:

- **Multi-background doors.**  Full room-to-room transitions
  need `build_nam()` to emit N nametables and the template's
  `load_background()` to be parameterised.  Deferred.
- **Per-player animations for P2.**  P2 still uses its static
  layout.  Either share P1's walk cycle (wrong art when
  they're different sprites) or emit a second animation
  table set — neither is free.
- **Other `(role, style)` animation pairs.**  Only
  `enemy + walk` is wired in chunk B; `enemy + idle`,
  `pickup + idle`, `npc + walk`, `npc + idle` are a
  micro-chunk each when pupils ask.
- **HP for Player 2.**  The `maxHp` field is already in state
  shape; wiring it up is a damage-block copy behind
  `#if PLAYER2_ENABLED`.
- **Sound.**  Waits on the FamiStudio engine landing as a
  separate sprint.

### Dialogue — 2026-04-24 auto-close + pause options

Driven by pupil feedback that open dialogue boxes felt like a
trap (you had to guess when to press B again) *and* that the
player kept walking off-screen while reading.  Two new config
fields on the `dialogue` module solve both:

- **`pauseOnOpen`** (bool, default **on**) — the moment the box
  appears the module snapshots `walk_speed`, `climb_speed`, and
  (under `PLAYER2_ENABLED`) `walk_speed2` into
  `bw_dialog_saved_*` globals, then zeros them every open frame
  alongside `jumping` / `jmp_up` / `prev_pad` (= `0xFF` so a
  held A doesn't queue a jump).  Close restores the snapshot
  exactly, so movement resumes as though nothing interrupted.
- **`autoClose`** (int 0–240, default **0** = off) — when set,
  `bw_dialog_timer` is initialised on open and decremented every
  `per_frame` tick; hitting 0 sets the same `should_close` flag
  as a manual B press, so the close / restore path is shared.
  B still closes early when the timer is set — a generous
  default for pupils who read fast.

Both paths are macro-gated (`BW_DIALOG_PAUSE` 0/1 and
`BW_DIALOG_AUTOCLOSE` 0–240), so the code that's compiled when
dialogue is off is unchanged — baseline ROM still hashes
`c77d502b7439`.  The P2-specific save/restore / freeze lines sit
inside `#if PLAYER2_ENABLED`, so a single-player project
doesn't emit dead references to `walk_speed2` etc.

**Tests.**  `tools/builder-tests/round2-dialogue.mjs` grew five
new cases (B1–B5) walking the full (pause × timer) matrix:
defaults emit `BW_DIALOG_PAUSE 1` + save/restore,
pause + timer emits the timer init + decrement, no-pause + timer
drops the freeze define, no-pause + no-timer keeps only the
`b_edge` close path, and `autoClose = 9999` clamps to 240.
`node tools/builder-tests/run-all.mjs` stays green with the new
cases rolled in.

**Docs.**  [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §2 gains an
"Extra config" subsection under `dialogue` that spells out both
fields, their defaults, and the macros that gate them.

### Dialogue — 2026-04-24 snapshot/restore the row under the text

Reported from pupil testing: the text appeared fine, but after
closing, the row it used came back as a flat "transparent"
stripe that extended a little further every time the box
reopened.  Root cause: the clear path wrote tile `0x20` (ASCII
space) across the whole 28-cell row.  Whatever the pupil had
under the text (ground, sky, the bottom of a tree, letters from
a bigger nametable, …) was overwritten permanently, and each
re-open snapshotted *the space row itself*, then on close we
again stamped spaces — the damaged area never got a chance to
recover.

Fix in the vblank_writes block of the dialogue module:

- Declare `bw_dialog_saved_row[BW_DIALOG_WIDTH]` in RAM so we
  have somewhere to stash 28 bytes.
- On **draw**: read the 28 nametable bytes currently under the
  text via `PPU_DATA` reads (first read is stale-buffer — it
  lands in `saved_row[0]` and is harmlessly overwritten by the
  first real byte next iteration), then rewind `PPU_ADDR` and
  stamp the text.
- On **clear**: write `bw_dialog_saved_row` straight back, so
  every cell returns to exactly the tile index that was there
  before the text appeared.

Works while rendering is off (we are already inside the main
`waitvsync()` window), so the VRAM reads and subsequent writes
are both safe.  Known limitation: if `pauseOnOpen` is disabled
AND the camera scrolls between open and close, the snapshot
may no longer match the world row currently displayed at
screen row 25, so the restore will paint stale tiles.  The
default (pause on) keeps the camera still and avoids this
entirely.

**Tests.**  `round2-dialogue.mjs` gains three new assertions
(A7–A9): the clear path MUST NOT contain `PPU_DATA = 0x20;`
(the original bug), the draw path MUST contain
`bw_dialog_saved_row[dlg_j] = PPU_DATA;`, and the clear path
MUST contain `PPU_DATA = bw_dialog_saved_row[dlg_j];`.  Full
`run-all.mjs` stays green (13 syntax checks + baseline +
8 suites).

**Docs.**  [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §4's "How the
dialog PPU writes work" subsection gets a short history paragraph
covering both bugs (double-vblank then space-baking) and the
snapshot/restore design that replaced the space-fill clear.

### Dialogue — 2026-04-24 restore from bg_nametable_0 (VRAM-read rewrite)

Pupil retest showed the VRAM-read snapshot/restore from the
previous fix still didn't restore the background: text no longer
appeared, and the row kept widening into a "transparent" stripe
on each open/close cycle.  Two things were going wrong:

- The required dummy PPU_DATA read (first read after setting
  PPU_ADDR returns stale buffer data) was written as a plain
  assignment to `bw_dialog_saved_row[0]`, overwritten on the
  next loop iteration.  Under cc65 dead-store elimination this
  can be elided, shifting every subsequent read by one cell —
  the snapshot ends up being a column-shifted version of VRAM
  plus one byte of uninitialised garbage, and the restore
  stamps garbage over the row.
- The snapshot also used the full 28-cell vblank budget twice
  (once for reads, once for writes), which stacked awkwardly
  with the existing OAM writes in vblank_writes.

Rather than work around these by adding `volatile` casts,
hand-tuned loops, and cycle-counting, we dropped the VRAM-read
approach entirely.  The server already emits the painted
Backgrounds-page nametable as
`static const unsigned char bg_nametable_0[1024]` in
`scene.inc` (used by the existing `load_background()` helper),
so the clear path now just reads from there:

```c
for (dlg_j = 0; dlg_j < BW_DIALOG_WIDTH; dlg_j++) {
    PPU_DATA = bg_nametable_0[BW_DIALOG_ROW * 32
                              + BW_DIALOG_COL + dlg_j];
}
```

No VRAM reads.  No dummy-read gotcha.  No saved buffer in RAM.
No vblank-cycle pressure.  The `bw_dialog_saved_row[28]` global
is removed.

**Caveat.**  In a multi-background game the restore always
pulls from bg 0, so if a pupil walks through a door while the
dialog is open the cleared row shows the starting room's tiles.
The default `pauseOnOpen = true` freezes the player and makes
this impossible; it only surfaces if the pupil unticks the
pause option AND walks through a door AND the text closes while
in the new room.  Documented as a future upgrade.

**Tests.**  `round2-dialogue.mjs` swaps A8/A9's assertions to
match the new pattern — A8 now fails if *any* `= PPU_DATA;`
appears in the emitted code (catching a regression to the
read-VRAM approach), and A9 requires
`PPU_DATA = bg_nametable_0[dlg_src + dlg_j];`.  Full
`run-all.mjs` green — baseline byte-identical, all 8 suites.

**Docs.**  [BUILDER_GUIDE.md](BUILDER_GUIDE.md) §4 gets the
full three-stage history (double-vblank → space-baking → failed
VRAM-read → bg_nametable_0 restore) so future readers
understand why the module deliberately avoids VRAM reads.

### Builder — 2026-04-24 remove legacy enemies module + clean the Backgrounds-page palette picker

Two pupil-reported gaps, both rooted in UI that predated newer
features and was still hanging around:

- **Legacy `enemies` module removed.**  The old `enemies` /
  `enemies.walker` / `enemies.chaser` modules emitted a global
  per-frame loop over every `ROLE_ENEMY` sprite.  They were
  hidden from the Builder tree back when the Scene module's
  per-instance AI dropdown (Static / Walker / Chaser per placed
  enemy) landed, but the submodules were still in
  `BuilderDefaults()` with `walker.enabled = true`, so fresh
  projects triggered the V3 "Walkers are on, but no sprite is
  tagged Enemy" warning and in some configurations produced a
  build-blocking problem.  No pupils used the legacy module —
  confirmed — so it was cut entirely:
  - `modules['enemies']`, `modules['enemies.walker']`,
    `modules['enemies.chaser']` definitions removed from
    [builder-modules.js](tools/tile_editor_web/builder-modules.js).
  - `'enemies'` dropped from `MODULE_ORDER` in
    [builder-assembler.js](tools/tile_editor_web/builder-assembler.js).
  - The `enemies:` entry (with its walker/chaser submodules)
    removed from the default state in `BuilderDefaults()`.
  - Validators V3 (`walker-no-enemies`) and V6
    (`walker-and-chaser`) deleted from
    [builder-validators.js](tools/tile_editor_web/builder-validators.js).
  - `sceneHasInstances()` helper removed — its only callers
    were the deleted modules.
  - BUILDER_GUIDE.md §2's "enemies.walker / enemies.chaser"
    subsection removed.

  Legacy saves that still have `state.builder.modules.enemies`
  are silently ignored — the assembler skips modules that
  aren't in `MODULE_ORDER`, so no migration is needed.

- **Backgrounds page: BG palettes only.**  The palette toolbar,
  all-palettes overview, and the "Preview palette" dropdown
  used to offer sprite palettes alongside BG ones.  Pupils were
  clicking a sprite-palette row to edit it, then painting
  nametable cells — which visually looked right in the editor
  but showed through a BG palette at runtime (nametable cells
  can only reference BG palettes).  Three edits fix this on
  [index.html](tools/tile_editor_web/index.html):
  - Palette-kind toggle: Sprite button removed; only BG
    remains.
  - "All palettes" overview: `groups` array trimmed to the BG
    entry, so the SP row no longer renders.
  - "Preview palette" dropdown: BG0–BG3 only; stale `sprite:N`
    selections from prefs fall through to `bg:N`.
  - Cross-page prefs restore (`initPaletteEditor`): if the
    Sprites page had persisted `paletteEditor.kind = 'sprite'`,
    the Backgrounds page now forces it back to `bg` on load
    so pupils can't re-enter sprite mode by page-hopping.

  Sprite palettes remain fully editable on the Sprites page —
  nothing was removed from there.

**Tests.**  `run-all.mjs` stays green with all changes in
place — syntax checks, byte-identical ROM baseline, and the 8
smoke suites all pass.  A scratch script builds a
no-enemy-sprite project end-to-end via `/play`; the ROM links
and runs without the legacy walker loop.

### Batch A — 2026-04-24 unified Play pipeline (items 1, 2, 8, 10)

Pupil-feedback follow-up: every editor page now drives the same
"assemble + build + launch" code path, with sensible defaults so
even a brand-new empty project plays.  Also adds a Download-ROM
button and a browser-vs-local-fceux selector everywhere.

**New shared module —
[play-pipeline.js](tools/tile_editor_web/play-pipeline.js).**
Single source of truth for the Play flow.  Public surface:

- `PlayPipeline.capabilities()` — cached probe of `/capabilities`
  (currently just `{ fceux: bool }`).
- `PlayPipeline.buildPlayRequest(state, templateText, opts)` —
  pure function returning the POST body for `/play`.  Handles
  state fortification, player / scene derivation, and the
  optional `customMainC` / `customMainAsm` override that lets the
  Code page keep sending pupil-written source.
- `PlayPipeline.play(state, opts)` — full flow: loads the
  template lazily, assembles, POSTs, dispatches the response.
  `opts.download` triggers a .nes save-as; `opts.mode` switches
  browser / native; `opts.onStatus` + `opts.onRom` are the page's
  hooks into status updates and the emulator.

**Robust defaults.**  `PlayPipeline._fortifyState` injects a stub
Player-role sprite when `state.sprites` is empty, and fills in a
`BuilderDefaults()` tree when `state.builder` is missing, without
mutating the caller's state.  The empty-state regression —
"project with only a background should still play" — builds a
49168-byte ROM via `/play`, verified by the new
`shared-play.mjs` suite.

**Per-page migration.**

- **Builder** (`builder.html`): the 120-line inline `play()` was
  cut to a 30-line wrapper that runs validators, saves, then
  delegates to `PlayPipeline.play`.  Gained a `⬇ ROM` download
  button and a `play-mode` selector; the Local-fceux option is
  auto-disabled when the server reports no `fceux` binary.
- **Sprites** (`sprites.html`): kept its Playground-dialog scene
  placer but now mirrors the pupil's pg-state into a transient
  `state.builder.modules.scene.config.instances` clone before
  handing off to the pipeline.  No persistence impact.
- **Code** (`code.html`): still sends raw `customMainC` /
  `customMainAsm`, but the POST + download + mode-selector logic
  is now the shared code path.
- **Backgrounds** (`index.html`) + **Behaviour** (`behaviour.html`):
  gained a Play button (item 10) that triggers a ROM download in
  browser mode, or launches fceux server-side in native mode.
  These pages have no embedded jsnes, so in-browser Play = save
  the .nes and run it in any external emulator (item 2).

**Native-emulator selector (item 8).**  Every page that can
produce a ROM now shows a `<select>` labelled "In browser" /
"Local (fceux)".  `PlayPipeline.capabilities()` probes
`/capabilities` once per page load; if the server has no fceux
the Local option greys out with an explanatory label.

**Tests — new
[tools/builder-tests/shared-play.mjs](tools/builder-tests/shared-play.mjs):**

- P1: empty state (no sprites, no Builder tree) → payload has a
  stub player at idx 0, empty sceneSprites, non-trivial
  customMainC.
- P2: legacy state (no state.builder) → migrated to BuilderDefaults
  non-destructively (caller's state untouched).
- P3: `opts.customMainC` / `opts.customMainAsm` bypass the
  assembler (Code-page contract).
- P4: end-to-end `/play` build of the empty-state payload returns
  a working ROM.
- P5: identical state → identical payload regardless of which
  page shape constructed it (proves items 1 + 10 together).

Full `run-all.mjs` — 13 syntax checks, byte-identical baseline,
and 9 smoke suites (the 8 existing ones plus the new shared-play
suite) — all green.

**Deliberately deferred.**  Backgrounds and Behaviour do not
ship an embedded jsnes dialog yet; Play there downloads the ROM
or uses fceux.  Promoting a popup emulator window is a
follow-up — the architecture is ready for it because every page
now funnels through the same pipeline.

### Batch C1 — 2026-04-24 ladder climbs stop at solid ground (item 6)

Pupil bug report: if you painted a ladder right next to a solid
ground row and held UP, the player climbed straight through the
floor into the sky.  Root cause: the on-ladder branch decremented
`py` unconditionally, with no check on what tile the player was
climbing into.

Fix in both
[tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
**and** [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
(symmetric so the byte-identical-baseline invariant still holds):
the climb-up / climb-down blocks now probe the target tile row
the same way the gravity loop probes `foot_row`.  The step is
blocked when both the left and right halves of the player's
bounding box hit SOLID_GROUND or WALL — **unless** either side is
a LADDER cell, in which case the ladder wins the tie and the
climb proceeds.

This keeps the intended "ladder punched through a floor" puzzle
working (pupil paints one column of LADDER cells replacing the
SOLID_GROUND cells at that column, player climbs through) while
blocking the unintended "ladder next to a wall lets you climb
into the wall" escape.

Full `run-all.mjs` green — baseline byte-identical (both
templates got the identical fix, so the stock-vs-swapped hash
compare still matches), all 9 smoke suites pass.

**Future:** a dedicated `ladder-solid.mjs` regression would
sanity-check the fix via jsnes frame capture; not needed for
merge, but planned in
[plan-batches.md](plan-batches.md) under C1.

### Batch B4 — 2026-04-24 Builder scene-instance row layout (item 9)

Pupil complaint: the delete-sprite button on the Builder page
was very wide and the whole add/remove area looked
misaligned.  Root cause: the `.scene-instance` grid had six
columns for seven children, so the delete button wrapped onto
its own line with a full-width cell — the red outline then read
as a giant bar.  On top of that, the first column was `1.4fr`
with only a 24×24 thumbnail inside, leaving a visible gap to
the left of every row.

Fix in [builder.html](tools/tile_editor_web/builder.html):

- Grid template now has exactly seven columns, one per child:
  `28px  minmax(0,1fr)  auto  64px  64px  auto  28px`.  Thumb
  sits flush, the sprite-picker select flexes to fill the row,
  x/y spinners line up between rows, delete button is a tight
  28×28 square.
- Delete button restyled as an icon-only square
  (`width:28 height:28 padding:0`, flex-centred 🗑).
- Row gains a hover state that shifts the border colour to the
  accent so pupils can see which row is live before clicking.
- Numeric inputs right-align so the digits line up vertically
  across rows.
- Empty-state placeholder: when no instances exist, the list
  now shows a dashed-outline hint ("No sprites placed yet.
  Click an empty spot on the preview above to drop one, or use
  + Add instance below.") instead of an empty container.

Full `run-all.mjs` green.  Baseline byte-identical (CSS +
render changes don't touch any emitted C).

### Play experience — 2026-04-24 Local-fceux fix + embedded emulator on every page

Two related pupil-facing fixes that landed together:

**1. Local (fceux) option stopped working on every page.**

Root cause: the shared `PlayPipeline.capabilities()` helper I
added in the Batch A migration probed `/capabilities`, but the
playground server exposes `/health` (the probe path hasn't
changed since before the migration — I just wired up the wrong
URL).  The fetch 404'd, `caps.fceux` was always falsy, and every
page disabled the Local option.

Fix in [play-pipeline.js](tools/tile_editor_web/play-pipeline.js):
probe `/health` instead.  Live confirmation on this machine:
`curl /health` returns `{ok: true, fceux: true, modes:
["browser","native"]}`; the mode-selector dropdown on every
page now enables the Local option when fceux is installed.

**2. Same embedded NES emulator on every page.**

Pupil ask: Backgrounds and Behaviour pages should have the full
"play-in-browser" experience the Builder has, not just a
Download-ROM button as they had after Batch A.

Extracted the Builder's embedded jsnes dialog +
`openEmulator()` + `ensureJsnes()` into a new shared module
[emulator.js](tools/tile_editor_web/emulator.js), exposing
`window.NesEmulator.open(rom, { hasP2 })`.  The module:

- Lazy-loads `jsnes.min.js` only on the first Play (zero cost
  for pupils who never Play on a given page).
- Injects a `<dialog id="emu-dialog">` + scoped CSS into the
  page on first call, so host pages don't need any boilerplate
  HTML.  If a page already has its own `#emu-dialog` (Builder
  does), the injection is skipped — no duplicate markup.
- Sets both a dialog class and a `body.emu-single-player`
  class so either the new `.single-player .emu-p2-controls`
  CSS selector or the Builder's pre-existing
  `body.emu-single-player #emu-p2-controls` rule hides the
  P2 hint when the ROM is single-player.
- Same keyboard mapping as before: arrow keys + F/D/Enter/RShift
  for P1; I/J/K/L + O/U/1/2 for P2.

**Per-page wiring:**

- **Builder** ([builder.html](tools/tile_editor_web/builder.html)):
  deleted the inline `ensureJsnes` + `openEmulator` +
  `decodeRomBase64` (≈80 lines).  `onRom` now calls
  `NesEmulator.open(rom, { hasP2 })` — same behaviour, one
  source of truth.
- **Backgrounds** ([index.html](tools/tile_editor_web/index.html)):
  added `<script src="emulator.js">`, changed Play mode labels
  from "Download ROM / Local" to "In browser / Local (fceux)",
  and replaced the download-on-play callback with
  `NesEmulator.open`.  The `⬇ ROM` button still downloads
  explicitly — pupils who want the .nes for an external
  emulator get it with one click.
- **Behaviour** ([behaviour.html](tools/tile_editor_web/behaviour.html)):
  same treatment as Backgrounds.
- **Sprites** + **Code** pages intentionally untouched — they
  already ship richer emulators with pause / reset / fullscreen
  controls; swapping them for the minimal shared version would
  lose features pupils use.

**Tests.**  `run-all.mjs` green (13 syntax checks now include
`emulator.js`, byte-identical baseline holds, all 9 smoke suites
pass).  Manual: `curl /health` from the running playground
server confirms fceux detection.

### Play experience — 2026-04-24 native fceux now runs the SAME ROM as the browser

Pupil report: "When I choose Play in Local I do not appear to get
the same game I get in the browser.  The game in the browser is
the correct one."

Root cause in
[tools/playground_server.py](tools/playground_server.py)
`run_play()`.  The customMainC / customMainAsm build paths
compile in a throwaway temp directory and return `rom_bytes` —
they deliberately do not touch the shared `STEP_DIR / "game.nes"`
(so two pupils clicking Play simultaneously don't corrupt each
other's builds).  The native branch, however, launched fceux
against `STEP_DIR / "game.nes"`, which was whatever the *last*
stock `make` happened to leave on disk — usually the pupil's
Step-playground sandbox build, or a stale build from hours /
days ago.  Browser mode worked because it streamed back the
correct `rom_bytes` the server had just built.

Fix: the native branch now writes the just-built `rom_bytes` to
a dedicated file `STEP_DIR / "_play_latest.nes"` and launches
fceux against that file.  Two design choices:

- **Dedicated filename** (not overwriting `game.nes`) so the
  pupil's offline `make` workflow keeps working — the stock
  build at `game.nes` stays authoritative.
- **Leading underscore** to signal "transient, regenerated
  every /play native call"; the top-level `.gitignore` already
  matches `*.nes` so nothing new needs gitignoring.

The write happens inside the BUILD_LOCK-scoped critical section
implicit in `_build_rom`, so concurrent /play calls still
serialise — the last Native click wins whichever ROM fceux
opens, matching pupils' expectation that the emulator reflects
the most recent build.

**Behaviour after this fix:**

- Browser mode: unchanged.
- Native mode: fceux now loads the freshly-built ROM with every
  Builder-tree change applied, on every page.  The browser
  embedded emulator and fceux show byte-identical gameplay
  (same ROM file, both paths going through the same
  `_build_rom`).
- Stock `game.nes` for the offline / non-/play flow:
  untouched.

**Action for the user:** restart any playground server that was
running before this fix — the server reads the updated code on
startup only.  Browser mode worked throughout the bad-state
window, so pupils weren't blocked; they just couldn't trust the
Local option to show their latest changes.

**Tests.**  `run-all.mjs` green.  No test covers the native
fceux launch path directly (would need to mock `subprocess.Popen`
— disproportionate for this one fix), but the browser path is
exercised end-to-end by `shared-play.mjs` P4, which compiles the
empty-state ROM via `_build_rom` and asserts the returned bytes
are a valid NES ROM — and `run_play()` now feeds those same
bytes to both branches.

### Sprite pipeline — 2026-04-24 OAM DMA to stop vblank overrun on fceux

Pupil report after the Local fceux fix landed: "There were lots
of sprites and movement on the screen, but graphic glitches all
over the screen, even in places with very little to them."

Root cause: the sprite-render path had always done per-byte
`OAM_DATA = x;` writes inside vblank, one byte per `STA $2004`.
For complex scenes (player + P2 + HUD hearts + several scene
sprites, each up to `ss_w × ss_h` tiles) that easily exceeds
300 OAM writes × ~10 cycles ≈ 3000+ cycles — well over the
~2273-cycle NTSC vblank budget.  Writes that spill past vblank
land while the PPU is actively rendering, which produces the
exact symptom pupils saw: corruption "all over the screen" that
isn't tied to what's in that region, because the corruption
comes from partial OAM / nametable updates leaking into the
active frame.

jsnes doesn't accurately simulate the vblank budget — it just
accepts writes whenever — so the bug was hidden in the browser
emulator.  fceux enforces timing correctly and surfaced it the
moment the Local mode started working.

**Fix: switch to OAM DMA.**  Standard NES homebrew pattern.

1. Carve a page-aligned 256-byte region at `$0200` via a new
   `OAM` memory + segment in
   [steps/Step_Playground/cfg/nes.cfg](steps/Step_Playground/cfg/nes.cfg).
   (The comment in the file always claimed the page was
   reserved "for ppu memory write buffer" but nothing was
   actually using it.)
2. Declare the shadow buffer in C via
   `#pragma bss-name(push, "OAM"); unsigned char oam_buf[256];
   #pragma bss-name(pop)` so it lands on the page boundary
   that $4014 DMA requires.
3. Move the whole sprite-build block (player, P2, HUD,
   animation tick, scene sprites) to **before** `waitvsync()`
   — the buffer-population loops now run during the active
   render period where there are plenty of spare cycles.  Each
   `OAM_DATA = x` is now `oam_buf[oam_idx++] = x` — a RAM
   write, no PPU hit.
4. After building, stride over any untouched OAM slots and
   write `0xFF` into the Y byte of each so stale sprites from
   the previous frame don't linger (NES convention: Y ≥ 240
   hides the sprite).
5. Inside vblank, the only OAM work is
   `OAM_ADDR = 0; OAM_DMA = 0x02;` — one register write that
   copies the 256-byte shadow to OAM in 513 cycles.  Combined
   with the dialogue vblank_writes (~300), scroll_stream
   (~600), and scroll_apply_ppu, total vblank load is now
   ~1450 cycles, comfortably inside budget.

Applied symmetrically to both
[steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
and
[tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
so the byte-identical-baseline invariant still holds — the
regression test compiles the stock main.c and the Builder
template, compares SHA-1 hashes, and they match because the
identical OAM-DMA code lands in both.

**Behaviour changes pupils may notice:**

- On fceux / real hardware: glitches in complex scenes should
  be gone.  Heavy scenes that would previously corrupt the top
  of the screen now render cleanly.
- On jsnes (browser embedded emulator): no visible change.  It
  was already over-permissive.
- Sprite flicker when more than 8 sprites line up horizontally
  on one scanline is a real NES hardware limit, NOT a bug —
  classic NES games mitigate it with "OAM cycling" (rotating
  which sprite is first each frame so flicker distributes
  across all sprites).  That's a nice-to-have for a future
  sprint; out of scope for this fix.

**Tests.**  Full `run-all.mjs` green.  The
byte-identical-baseline invariant still passes (both templates
ship the same OAM-DMA code, so their post-`make` hashes match).
All 9 smoke suites build / parse successfully.  `shared-play.mjs`
P4 confirms an end-to-end `/play` build still produces a valid
49168-byte ROM.

**Still to verify manually (user-side):** load a complex scene
in fceux via the Local option and confirm the glitches are
gone.  Will need a server restart to pick up the Python server
changes and a fresh build to produce the DMA-powered ROM.

### Phase 1 — 2026-04-24 close the pupil-feedback backlog

Executes Phase 1 of
[next-steps-plan.md](next-steps-plan.md) — four items that close
out the last of the ten pupil-feedback entries from
[plan-batches.md](plan-batches.md).

**1.1 — Scroll streaming cap (defensive pre-emptive, pending
pupil fceux verification).**  `scroll_stream()` in
[steps/Step_Playground/src/scroll.c](steps/Step_Playground/src/scroll.c)
now caps itself to **one column + one row transfer per vblank**
(the `while` loops became `if`s, with the remainder caught up
on subsequent frames).  The previous code could stack multiple
30–32-byte transfers in one vblank when the camera teleported
or moved fast, which — even after the OAM DMA fix — could edge
past the ~2273-cycle NTSC budget.  At realistic walk speeds
(1–3 px/frame) the loop only runs once per vblank anyway, so
nothing changes for pupils.  The file's own pre-existing TODO
("slice 3d can cap it and defer the tail until the next VBlank")
is now done.  Manual fceux verification by the user still
required to confirm scroll flicker is gone.

**1.2 — Shared help popover with page tabs + Feedback (items 3
from the pupil-fix list).**  New module
[tools/tile_editor_web/help.js](tools/tile_editor_web/help.js)
exposing `HelpPopover.attachPageTabs(dialog, currentPageId)` +
`HelpPopover.maybeAutoOpen(openFn)`.  Every page's existing
`<dialog id="help-dialog">` keeps its owned content; the helper
prepends a strip with links to every other page's help
(navigation with `#help` in the URL so the target page auto-
opens its help on load) plus a `💬 Feedback` toggle that
mounts `Feedback.mountInto(...)` inline on first expand.  All
five pages (Backgrounds, Sprites, Behaviour, Builder, Code)
now share the same help-tab UX without having to port each
other's help HTML.

**1.3 — Project-dropdown parity (item 4).**  `storage.js` gains
`Storage.wireBasicProjectActions({ makeFreshState })` — a
reload-on-success handler bundle for the `btn-project-new` /
`btn-project-duplicate` / `btn-project-delete` buttons.
Behaviour / Builder / Code pages all gain a `projects-list`
switcher + Duplicate + Delete.  Behaviour gets the full New /
Duplicate / Delete set (it has a `createDefaultState`);
Builder and Code get Duplicate + Delete + a menu-hint pointing
pupils at the Sprites page for New (those pages don't own a
fresh-state factory — a blank Builder or Code project without
sprites / tiles / a background isn't usable anyway).

**1.4 — Backgrounds palette picker (item 5).**  The "Use
palette" `<select>` in the nametable toolbar was hard to find;
pupils asked for it to look more like the swatch pickers on
Sprites.  Added a prominent `.nt-palette-picker` row between
the toolbar and the canvas: four big BG-palette buttons, each
showing the universal-BG slot 0 plus that palette's three
colours, active one outlined in accent.  The hidden
`<select id="nt-palette">` stays as the value store (all
existing paint logic still reads from it) and now has a change
listener that keeps the picker in sync when pupils use the
keyboard.  `assignColourToSlot` fan-out adds `renderNtPalettePicker()`
so palette edits update the picker live.

**Tests.**  `run-all.mjs` green:

- 15 syntax checks (now including `help.js`).
- 4 fix-specific regression guards (OAM DMA, ladder, native
  fceux launch, `/health` probe) — unchanged.
- Byte-identical ROM baseline still holds (template changes are
  symmetric between `main.c` and `platformer.c`; scroll.c's cap
  doesn't affect 1x1 builds because `BG_WORLD_COLS/ROWS` gates
  compile the blocks out).
- All 9 smoke suites pass.

**Manual verification still required from the teacher:**

1. Open the Builder in fceux via Local mode with a scrolling
   scene + several sprites, compare against pre-2026-04-24
   behaviour to confirm scroll flicker is cleared (C2 status).
2. Click `?` on each page; confirm the page-tabs strip appears,
   clicking another page's tab lands on it with help already
   open, `💬 Feedback` opens + submits successfully.
3. Switch projects from Behaviour / Builder / Code via the
   projects-list buttons; confirm the page reloads into the
   chosen project.
4. On Backgrounds, click the new "Paint with palette" row;
   confirm clicks update what palette subsequent paint strokes
   use; edit a colour slot and confirm the picker row updates
   live.

### Scroll-stream hotfix — 2026-04-24 follow-up

The Phase 1.1 cap turned the `while` loops in
[scroll.c](steps/Step_Playground/src/scroll.c) into `if`s, but
kept the internal `if (col >= BG_WORLD_COLS) continue;` guards
— which are only legal inside a real loop.  Cc65 rejects
`continue` outside a loop.  The byte-identical-baseline
regression test builds with `BG_WORLD_COLS=32` /
`BG_WORLD_ROWS=30`, so the streaming blocks are compiled out by
the `#if` gates — the error didn't surface until a pupil hit
/play on a genuinely scrolling project.

Fix: inverted each guard from "skip on out-of-range" to
"proceed on in-range" — `if (col < BG_WORLD_COLS) { ... write
block ... }`.  Same behaviour, no `continue`, compiles cleanly
for scrolling and non-scrolling builds alike.

New regression guard in
[tools/builder-tests/run-all.mjs](tools/builder-tests/run-all.mjs)
greps scroll.c (with comments stripped to avoid false
positives) for bare `continue;` statements.  Any match is an
error — scroll.c has no legitimate loops that would need one.
This catches the specific shape of the breakage in a way the
existing ROM-hash baseline can't (the baseline doesn't compile
the streaming blocks).

### Scroll-flicker follow-up — 2026-04-24 OAM DMA first in vblank

Pupil report after the scroll-stream cap shipped: "less screen
disruption but the bottom of the level is flickering near the
top of the screen until the screen stops moving."  Same on
browser and fceux.

Vblank ordering was non-canonical — OAM DMA ran *after*
dialogue writes + `scroll_stream` + PPU_ADDR manipulation.
That's risky in three ways:

1. If anything in vblank overruns its cycle budget, the
   latest writes spill past vblank.  When OAM DMA is last,
   sprites drop out — pupils notice immediately.  When OAM
   DMA is first, a spill just tears a background tile update
   (far less visible).
2. Dialogue + scroll_stream both leave the PPU's internal V
   register pointing somewhere via PPU_ADDR.  Running OAM DMA
   before any of that happens keeps V in a known state
   between vblanks.
3. On real hardware, OAM retention during vblank is delicate
   (the PPU partially decays sprite 0 + OAM at the end of
   vblank if not refreshed soon enough).  DMA-first
   guarantees the refresh happens early.

Reordered both
[steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
and
[tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
so the vblank sequence is now:

```c
waitvsync();
OAM_ADDR = 0x00;                 // <- first now
OAM_DMA  = 0x02;
//@ insert: vblank_writes         // dialogue
scroll_stream();                  // or PPU_SCROLL reset (non-scroll builds)
scroll_apply_ppu();               // last PPU register write, as before
```

Byte-identical baseline held because the change is symmetric
across both templates.

**Known limitation surfaced by this investigation.**  The
project uses horizontal nametable mirroring
(`NES_MIRRORING: 1` in `nes.cfg`) — correct for horizontal
scrolling (NT0 / NT1 are unique, pair at $2000 / $2400) but
limiting for tall worlds, because $2800 is a mirror of $2000.
Vertical scrolling past screen height shows the same content
wrapping rather than a new nametable.  Documented in
[BUILDER_GUIDE.md](BUILDER_GUIDE.md) §8 limitations.

**Action for the teacher:** try the scrolling project again
(browser or Local).  If the top-of-screen flicker is gone,
this closes C2 properly.  If it persists, the next debugging
step is to inspect nametable / attribute-table contents via
fceux's PPU viewer while scrolling, which will point at
whether it's a timing issue (vblank overrun) or a data issue
(stale attributes / missing nametable content).

### Phase 2.2 — 2026-04-24 palette picker QoL

Pupil ask from 2026-04-20: "select colours for palettes
easier."  Two additions on both Backgrounds and Sprites pages:

**Hover-to-preview.**  When a palette slot is selected, hovering
a cell in the master grid (or the new recent-colours strip)
temporarily paints that slot with the hovered colour.  Pupils
can scan the 64-cell grid and SEE which colours fit before
committing.  Implementation stays on the slot DOM node only —
we don't re-render the tile editor / tileset / nametable per
hover, because that would feel laggy and the slot is the right
signal anchor ("you clicked here because you care about this
slot").  On mouse-leave the slot reverts; on click the hover
commits via `assignColourToSlot`.

**Recent colours strip.**  Up to eight most-recently-picked
NES indices, persisted in `prefs.recentColours` (global, not
per-project — pupils reuse palettes across projects).  Clicking
a recent swatch assigns it to the selected slot; dragging onto
a slot works too (same dataTransfer payload as the master grid,
so the existing drop handlers just work).  Shows a greyed-out
"No recent colours yet — pick one below." line until the pupil
makes their first pick.

**Drag-and-drop** from master grid onto palette slots was
already wired (2026-04-13 work) so no change needed there.

Changes land on
[index.html](tools/tile_editor_web/index.html) and
[sprites.html](tools/tile_editor_web/sprites.html) symmetrically
— the master-grid and palette-slot markup is near-identical
between the two pages so the helpers are duplicated (kept inline
for page-local simplicity; not worth extracting to a shared
module yet).

### Phase 2.3 — 2026-04-24 inline animation strip

Pupil ask from 2026-04-20: "Make the animation section easier
to find and use."  Promoted the current animation's frames into
a prominent strip above the composition canvas on the Sprites
page — frame thumbnails, a **+ Add frame** button, and a
`full editor →` link that opens the collapsed Animations panel
below.

Markup + render function (`renderAnimStrip`) added to
[sprites.html](tools/tile_editor_web/sprites.html).  Hooks into
the existing `renderAnimations` fan-out so the strip stays in
sync whenever the animation list, selected animation, or frame
order changes.  Clicking a thumbnail jumps the preview to that
frame; the preview canvas in the full editor picks up the
`animPreview.frameIdx` change automatically on its next tick.

The full Animations editor (fps, reorder, delete frames, rename,
duplicate, preview-controls) stays inside the collapsible
`<details>` below — power users keep their existing workflow;
casual pupils now have the most-used bits surfaced.

### Phase 2 — status after this session

Shipped: 2.2 + 2.3.  Deferred to the next dedicated session:
**2.1 drawing tools** (Pencil / Fill / Line / Rect / Circle /
Select with marquee + move + resize).  Per
[next-steps-plan.md](next-steps-plan.md), 2.1 was always flagged
as a full-day "L" effort so shipping it alone matches the
plan's recommended split.  The suite is green (syntax + 5
invariants + baseline + 9 smoke suites) at every step so far.

### Phase 2.1 — 2026-04-25 drawing tools close-out

The previous stamp said Phase 2.1 would get a dedicated session
because it was scoped as a full-day "L" effort.  Turns out most
of it was **already shipped in Sprint 9** (see
[PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md) Sprint 8.1): Pencil,
Fill (flood-fill), Line (Bresenham), Rect (outline), Circle
(ellipse outline), and Select (marquee → Delete / drag-to-move
with a floating-selection overlay + clipboard copy/paste).
This session closed the remaining gaps from the plan spec:

- **Filled Rect** (`rect_fill`, ■ icon) and **Filled Circle**
  (`circle_fill`, ● icon) as separate tools in the Tools
  popover.  New pixel-producer functions `rectFilledPixels` +
  `circleFilledPixels` route through the same
  `shapePreviewPixels` / `commitShape` / Shift-constrain /
  auto-assign pipeline as their outlined counterparts — pupils
  get a ghost preview while dragging, one undo step per commit,
  correct behaviour when the shape crosses cell boundaries or
  sits on an empty cell.
- **Keyboard shortcuts** — Alt+P / F / L / R / C / S for the
  six base tools.  Alt+Shift+R / Alt+Shift+C pick the filled
  variants.  Alt-namespace was chosen because the raw letters
  already mean something on this page (F = full preview,
  C = copy tile pixels, R = rotate selected region).  Tooltips
  on the tool buttons document the shortcut.  Status bar
  announces the switch ("● Tool: Fill") so pupils have
  feedback even without a mouse.
- **Centralised tool-type check** — the inline
  `currentTool === 'line' || currentTool === 'rect' ||
  currentTool === 'circle'` at the two preview + click-start
  sites became `SHAPE_DRAG_TOOLS.has(currentTool)` with a
  single Set constant.  Keeps future tool additions to one
  edit site.
- **Persisted-prefs tool list** extended to include the two
  new ids so reloading the Sprites page preserves the pupil's
  filled-variant choice.

All tool changes are confined to
[sprites.html](tools/tile_editor_web/sprites.html); no template
or emitted-C touched, so the byte-identical baseline is
unaffected.  `run-all.mjs` green — 15 syntax checks, 5
invariants, ROM baseline, 9 smoke suites.

**Still deferred from the plan spec:** Select → **resize drag
handles** (currently Select only supports marquee + delete +
drag-to-move + copy/paste).  Resize requires eight corner/edge
handles, per-handle drag math, and scaling clipped pixels — a
self-contained follow-up that the teacher can request when
pupils ask for it.

**Phase 2 definition of done reached** — 2.1, 2.2, and 2.3
all shipped.  Next: Phase 3 (content & templates — RPG
top-down preset, multi-line dialogue, per-NPC dialogue text,
P2 jump animation).

### Sprites page polish — 2026-04-25 strip & tools

Two pupil-feedback follow-ups on the Sprites page, both
[sprites.html](tools/tile_editor_web/sprites.html)-only.

**Animation strip is now context-sensitive.**  The inline strip
above the composition canvas was always visible after Phase 2.3,
even on sprites that aren't part of any animation — wasting
prime real-estate.  Now:

- Strip enters **frames mode** only when the currently-selected
  sprite is part of some animation.  Frame thumbnails show the
  sprite's own animation, with the active sprite highlighted.
  Clicking a thumbnail jumps the sprite selection (so the
  composition canvas + tile editor follow), not just the
  preview index — pupils editing a walk-cycle can flip between
  frames without leaving the editor.
- Strip enters **offer mode** when the selected sprite isn't
  in any animation.  A single button ▶ Start an animation with
  this sprite seeds a fresh animation containing this sprite as
  frame 0, switches the strip to frames mode, and writes a
  status-bar confirmation so the pupil knows what just happened.
- New helper `animationContainingSprite(spriteIdx)` resolves
  which animation to show: prefers `selectedAnimId` if it
  contains the sprite (so navigating frames inside one anim
  doesn't keep flipping to a different one); otherwise picks
  the first animation that contains the sprite.

**Tools popover replaced by an inline horizontal toolbar.**  The
🛠 Tools ▾ trigger button + hidden popover is gone.  All eight
tool buttons (Pencil / Fill / Line / Rect / Rect fill / Circle /
Circle fill / Select) now sit inline inside `.sprite-controls`
in a `.tools-bar` flex row.  The toolbar wraps to a second line
on narrow viewports.  Active tool is communicated by the
`.active` class on the matching button — no separate label
needed.  `setCurrentTool` and `initSpriteTools` lost their
popover open/close logic (all click + outside-dismiss + label
update code went with it).

Tests green: 15 syntax checks, 5 invariants, byte-identical ROM
baseline, 9 smoke suites.  Sprites-only changes — no template
or emitted-C touched.

### FCEUX PPU-viewer guide — 2026-04-25

New top-level doc
[DEBUGGING_FCEUX.md](DEBUGGING_FCEUX.md) walks through using
fceux's built-in PPU / Name Table / OAM viewers to diagnose
graphics issues that don't show in jsnes (specifically: the
remaining C2 scroll-flicker investigation that's still parked
on the teacher's bench).  Six steps from "build a ROM that
reproduces" through to "common findings, mapped to fixes."
Also covers what to capture for a useful bug report.

### Phase 3.1 — 2026-04-25 RPG / top-down preset

The Builder's `game` module gains a working **Top-down**
option (was placeholder-disabled "Coming in Phase B").  No
second template file — both styles share `platformer.c` and
the existing Step_Playground `main.c`, gated by a new
`BW_GAME_STYLE` macro.

- **`game` module**:
  [tools/tile_editor_web/builder-modules.js](tools/tile_editor_web/builder-modules.js)
  re-enables the Top-down enum option, gains an `applyToTemplate`
  that emits `#define BW_GAME_STYLE 1` only when top-down is
  picked.  Platformer (default) emits nothing — keeps the
  byte-identical-baseline test passing because the absent
  macro evaluates to 0 in cc65's preprocessor (`#if UNDEFINED
  == 0` is true).
- **Templates**: both
  [tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
  and
  [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c)
  gained symmetric `#if BW_GAME_STYLE == 0 / == 1` blocks
  around:
  - The player's vertical-movement section (ladders + jump +
    gravity for platformer; 4-way step with wall collision
    for top-down — UP / DOWN move `py` by `walk_speed`,
    SOLID_GROUND / WALL block, no jump, no airborne state).
  - The Player 2 vertical-movement section (matching
    treatment).
  - The scene-sprite gravity loop (top-down sprites stay
    where placed).
  - The walk-anim trigger condition: top-down counts UP / DOWN
    keypresses as walking too (`pad & 0x0F` instead of the
    platformer's `pad & 0x03`).
- **Smoke suite**:
  [tools/builder-tests/topdown.mjs](tools/builder-tests/topdown.mjs)
  with four cases (T1–T4): default state emits no
  BW_GAME_STYLE override, explicit platformer matches default,
  top-down emits exactly one `#define BW_GAME_STYLE 1`, and
  the end-to-end `/play` build of a top-down project succeeds.

The `game` module's `BW_GAME_STYLE` switch is intentionally
NOT a "scrap everything else" mode change.  Damage, dialogue,
doors, pickups, HUD, win conditions, scene-instance AI all
work unchanged in either style — the only thing that swaps is
player physics.

### Phase 3.2 — 2026-04-25 multi-line dialogue (1-3 rows)

The dialogue module's text field grows from one line to three.

- **Schema**: `text` is now "Line 1", with optional `text2` /
  `text3` for "Line 2" / "Line 3".  Trailing-empty lines drop
  (a "HELLO" + "" + "WORLD" config emits 3 rows on purpose;
  "HELLO" + "" + "" emits 1).
- **Emission**:
  - One `bw_dialogue_text_<i>[]` byte array per non-trimmed
    line (so a 3-line dialog emits `_0 _1 _2`, a 1-line
    dialog just `_0`).
  - Indexable lookup table `bw_dialogue_text_table[]` so the
    runtime can pick row N by index without a chained `if /
    else`.
  - New macro `BW_DIALOG_ROW_COUNT` (1-3) drives the runtime
    loop.
- **Runtime**: the vblank PPU-write block in the dialogue
  module's emitted code now loops over `BW_DIALOG_ROW_COUNT`
  rows, recomputing the destination VRAM address +
  `bg_nametable_0` offset per iteration.  Worst-case is 3 ×
  28 = 84 PPU writes per draw or restore, ~840 cycles —
  comfortably inside the ~2273-cycle NTSC vblank budget even
  alongside scroll_stream + OAM DMA.
- **Tests**: round2-dialogue.mjs gains B6 (1- and 2-row
  emissions + per-row vblank loop assertion).  Existing
  cases (A, B1–B5, E1) keep passing — the single-line
  default code path is byte-for-byte similar (the only
  change pupils with no overrides see is the new
  `BW_DIALOG_ROW_COUNT` macro and the table indirection).

### Phase 3.3 — 2026-04-25 per-NPC dialogue text

Each NPC scene-instance can now have its own dialogue line —
walk up to a different NPC, get a different line.  When the
NPC's text is empty, the dialog falls back to the module-
level multi-line text from Phase 3.2.

- **State shape**: scene `instances[i]` gains an optional
  `text` field that's only meaningful when the matching
  sprite has `role === 'npc'`.
- **Builder UI**:
  [tools/tile_editor_web/builder.html](tools/tile_editor_web/builder.html)
  scene-instance rows now render an extra `.scene-instance-
  text` row below NPC instances with a "💬 says:" label and
  a 28-char text input.  Non-NPC instances render the row
  unchanged so the 7-column grid layout from Phase 1's B4 is
  untouched.
- **Emission**: when any NPC instance has non-empty text,
  the dialogue module's `applyToTemplate` walks
  `state.builder.modules.scene.config.instances`, emits one
  `bw_dialogue_npc_<i>[]` array per overriding NPC, plus a
  lookup table `bw_dialogue_per_npc[NUM_STATIC_SPRITES]`
  with NULL entries for non-overriders.  `BW_DIALOG_PER_NPC`
  (0 / 1) gates the new code paths so projects without any
  per-NPC text emit nothing extra.
- **Runtime**:
  - The per-frame proximity-trigger block sets a new global
    `bw_dialog_npc_idx = j` when it picks an NPC, so the
    vblank writer knows which slot to look up.
  - The vblank PPU-write block consults
    `bw_dialogue_per_npc[bw_dialog_npc_idx]`; when non-NULL
    it draws that single line instead of the module-level
    table; `dlg_total` collapses to 1 row for that draw.
    Close still restores `BW_DIALOG_ROW_COUNT` rows so the
    screen returns to its pre-open state cleanly even when
    open used a single-row override.
- **Tests**: round2-dialogue.mjs gains B7 (covers the
  "BW_DIALOG_PER_NPC 0 with no overrides", "1 with one
  override", per-NPC array emission, npc-idx recording, and
  vblank lookup).

### Phase 3.4 — 2026-04-25 Player 2 jump animation

Finishes the P1/P2 animation symmetry.  Pupils tag a
`role=player2, style=jump` animation on the Sprites page;
the runtime swaps to those frames while P2 is airborne.

- **`playground_server.py`**: `anim_targets` list extended
  with `("player2", "jump")` so the same machinery that
  emits `ANIM_PLAYER2_WALK_*` now emits
  `ANIM_PLAYER2_JUMP_*`.  Absent pairs cost nothing — the
  count macro is 0 and the gated render block compiles out.
- **Template**: new `p2_jump_frame` / `p2_jump_tick`
  globals in
  [tools/tile_editor_web/builder-templates/platformer.c](tools/tile_editor_web/builder-templates/platformer.c)
  (gated behind `ANIM_PLAYER2_JUMP_COUNT > 0`).  The P2
  render block was a pure walk-or-static fork; it's now
  walk-OR-jump-or-static with priority **jump > walk >
  static** — pupils mid-jump see the jump pose even if
  they're drifting sideways (matches SMB-style feel).  Both
  cycles reset to frame 0 when neither animation owns the
  frame.
- **Tests**: round1-polish.mjs gains an `E3-jump` end-to-end
  case that builds a state with a tagged P2 jump animation,
  asserts `ANIM_PLAYER2_JUMP_COUNT` is in the assembled
  source, and confirms the ROM links cleanly via `/play`.
  The existing E4 "everything-on" case is extended to
  include `withP2Jump`, exercising the simultaneous walk +
  jump pair under the priority chooser.

**Phase 3 done.**  All four items — RPG preset, multi-line
dialogue, per-NPC text, P2 jump — landed.  Tests:
`run-all.mjs` green: 15 syntax checks, 5 invariants,
byte-identical ROM baseline (both templates received
symmetric edits for 3.1), and **10 smoke suites** (the new
`topdown.mjs` joins the existing nine; `round1-polish.mjs`
and `round2-dialogue.mjs` gained new in-suite cases).

## Tier 1 (post-Phase-4 plan) — first batch shipped 2026-04-26

Source plan:
[`docs/plans/current/2026-04-26-fixes-and-features.md`](../plans/current/2026-04-26-fixes-and-features.md).
Five Tier-1 items landed in one session — all the lower-risk
documentation and single-spot-code fixes.  T1.1 (background fill),
T1.2 (pixel grid overlay), T1.4 (wider behaviour panel) and T1.6
(Globals Builder module) are deliberately deferred to the next
session because they're either more substantive code edits or
require a fresh environment.

- **T1.7 — gallery thumbnail** *(item 25)*.
  `tools/tile_editor_web/builder.html`'s `captureRomPreview()`
  now boots jsnes for **60 frames** before snapshotting the
  framebuffer (was 30).  Pupils were reporting blank
  background-only thumbnails; 30 frames covered cc65's startup
  + first few main-loop iterations on paper but jsnes-side
  evidence said it wasn't enough in practice for at least one
  animation cycle to tick on the player sprite.  The function
  now carries a docstring explaining the constraint and
  pointing at the bug item that motivated it, so future readers
  don't bisect this back to "magic constant 60".
- **T1.5 part 1 — sfx event linkage doc** *(item 27)*.
  [AUDIO_GUIDE.md](../guides/AUDIO_GUIDE.md) gains a *Connecting
  sound effects to events* sub-section under "Code-page pupils"
  with a four-row table (jump start / land / hit / pickup)
  showing where to add `famistudio_sfx_play(...)` calls + which
  channel to use for each.  The Builder UI side of this item
  (T1.5 part 2) is gated on T2.6 and intentionally not done
  here.
- **T1.8 — palette-bug diagnosis framework** *(item 16)*.
  [`docs/feedback/recently-observed-bugs.md`](../feedback/recently-observed-bugs.md)
  now ends with a *Diagnosis notes* section.  Item 16 has a
  three-step repro plan (UI persistence / canvas render /
  runtime ROM render) plus a triage matrix mapping outcomes to
  likely fix locations.  Captures the plan's "do not fix
  blind" guidance as a checklist the next session can fill in.
- **T1.9 — NES dev resources** *(item 4)*.  New file
  [`docs/reference/nes-resources.md`](../reference/nes-resources.md)
  curating the canonical references the project leans on:
  NESdev wiki PPU/scrolling/mirroring/APU/iNES pages, cc65 +
  ca65 + ld65 docs, FCEUX / Mesen / jsnes references, FamiStudio
  notes, NESdev forum, Nerdy Nights tutorials.  Each entry has
  a one-line "what it answers" hook.  Cross-linked from
  [PUPIL_GUIDE.md](../guides/PUPIL_GUIDE.md) (curiosity-driven)
  and [TEACHER_GUIDE.md](../guides/TEACHER_GUIDE.md) (replaces
  the old short list).
- **T1.3 — duplicate sprite copies tiles** *(item 18)*.
  `tools/tile_editor_web/sprites.html`'s `btn-sprite-dup` handler
  now allocates a fresh contiguous tile run via
  `findFreeTileRun(w*h, state)` and copies the source's pixel
  data (via `clonePixels`) into the new slots, then rewires the
  duplicate's cells to point at the new indices.  Without this
  step, editing the duplicate's pixels silently edited the
  original because both shared `state.sprite_tiles[idx]`.
  Falls back to the old shared-tile behaviour with a warn
  toast when the tile sheet is full.

**Tests.**  Full `run-all.mjs` regression suite green after
the work — 16 builder smoke suites + every invariant including
byte-identical-ROM and audio.  No new test cases added in this
batch; the next session should add one for the
`btn-sprite-dup` flow specifically (build a state with a
sprite whose pixels are non-zero, duplicate, edit the duplicate's
pixels, assert the original's pixels are unchanged) — flagged
under T1.3 in the plan as a follow-up.

**Documentation reorg.**  All `.md` files (except top-level
`README.md`, `NOTICE.md`, and `LICENSE`) moved into a
structured `docs/` tree on the same day: `docs/guides/` (pupil-
and teacher-facing), `docs/plans/current/` (active plans),
`docs/plans/archive/` (chronologically named superseded plans),
`docs/feedback/` (bug list + pupil ideas + feedback summary),
`docs/changelog/` (this file), and `docs/reference/` (T1.9's
new home).  See [`docs/README.md`](../README.md) for the full
old→new path table.  Code-side references (`audio.html`'s
`<a href="AUDIO_GUIDE.md">`, doc comments in `builder.html`,
`code.html`, `behaviour.html`, `builder-modules.js`,
`playground_server.py`) updated to the new paths in the same
commit.  A scheduled follow-up (one week out) sweeps the
inter-archive cross-links that weren't all chased in the
initial reorg.

## Tier 1 (post-Phase-4 plan) — second batch shipped 2026-04-27

Source plan:
[`docs/plans/current/2026-04-26-fixes-and-features.md`](../plans/current/2026-04-26-fixes-and-features.md).
The remaining four Tier-1 items + the deferred T1.3 regression
guard all landed in one session, completing Tier 1 of the plan.

- **T1.4 — wider Sprite reactions panel** *(item 20)*.
  `tools/tile_editor_web/behaviour.html`'s page-level grid
  collapses from `260px 1fr 340px` (three columns, reactions
  cramped on the right) to `260px 1fr` with
  `grid-template-areas` placing the types palette on the left
  full-height, the canvas top-right, and the sprite-reactions
  panel under the canvas full-width.  Pure CSS / no DOM moves
  thanks to the `grid-template-areas` pattern.
- **T1.2 — pixel grid overlay on sprite top view** *(item 19)*.
  New `show-pixel-grid` checkbox on the Sprites toolbar (off by
  default — the existing cell grid stays the prominent
  landmark).  `renderSpriteCanvas` draws faint 1-px lines at
  every per-pixel boundary on the composition canvas, gated to
  zoom ≥ 6× so the lines aren't unreadable at low zoom.  Mirrors
  the per-tile pixel editor that already had a grid.
- **T1.3 follow-up — regression guard for sprite duplicate**.
  New invariant in `tools/builder-tests/run-all.mjs`:
  `btn-sprite-dup handler clones tile pixels (not just sprite
  struct)`.  Source-level check that the handler still calls
  `findFreeTileRun(...)`, `clonePixels(...)`, and writes a fresh
  `state.sprite_tiles[t]` entry.  A behavioural test would need
  JSDOM (which the project doesn't ship); when JSDOM lands this
  guard can be replaced with a real assertion.
- **T1.1 — Background-tile fill tool surfaced** *(item 1)*.
  The flood-fill logic already existed in `index.html`'s
  `nt-tool` Advanced dropdown (`tool === 'fill'` branch with the
  `ntFloodFill` BFS implementation), but pupils couldn't find
  it.  Added a fourth top-level mode button (🪣 Fill) to the
  `.nt-mode-toggle` row alongside Paint tile / Paint palette /
  Erase.  No new logic — the existing `setNtMode('fill')` path
  already handled the wiring.  Help-tab tutorial copy updated
  to mention the button.
- **T1.6 — Globals Builder module** *(item 22)*.
  New `globals` module in `builder-modules.js` exposing two
  integers: `gravityPx` (0-4, default 1, scene-sprite fall rate)
  and `jumpSpeedPx` (1-6, default 2, player rise rate while a
  jump is in progress).  The user paired these as "gravity"
  (how fast things fall) and "jump speed" (how fast the player
  launches) — pupils can tune both independently.
  Implementation uses a macro pattern that preserves the
  byte-identical baseline:
  - Both `steps/Step_Playground/src/main.c` and
    `tools/tile_editor_web/builder-templates/platformer.c` gain
    a pair of default `#ifndef`-gated macros: `BW_APPLY_GRAVITY(y)`
    defaulting to `(y)++` and `BW_APPLY_JUMP_RISE(y)` defaulting
    to `(y) -= 2`.  Each default expansion compiles to the same
    ROM bytes cc65 used to emit for the historic literal
    (`ss_y[i]++` and `py -= 2` respectively), verified by
    sha1sum'ing the resulting `.nes` before and after.
  - The scene-sprite gravity site changes from `ss_y[i]++` to
    `BW_APPLY_GRAVITY(ss_y[i])` in both files; the player
    jump-rise site changes from `py -= 2` to
    `BW_APPLY_JUMP_RISE(py)` in both files.
  - When the module ticks, its `applyToTemplate` writes
    `#define BW_GRAVITY_PX <n>`, `BW_APPLY_GRAVITY` override,
    `#define BW_JUMP_SPEED_PX <n>`, and `BW_APPLY_JUMP_RISE`
    override into the `declarations` slot, which sits *above*
    the default `#ifndef`s so the overrides win.
  - `MODULE_ORDER` in `builder-assembler.js` gains `'globals'`
    immediately after `'game'` so its declarations land near
    the top of the customMainC.
  - **Player fall rate is currently fixed at 2 px/frame** — only
    the player's *rise* uses the new macro.  Help text on
    `jumpSpeedPx` calls this out.  Adding a player-fall knob
    is a small follow-up if pupils want it; tracked informally
    here.

  T2.5 (per-sprite tuning) will plug per-instance overrides into
  this same macro infrastructure when it ships.

**Tests.**  Full `run-all.mjs` regression suite green — every
invariant including the byte-identical baseline (proves the
`BW_APPLY_GRAVITY` macro doesn't disturb the no-modules-ticked
path), the new T1.3 sprite-duplicate guard, and all 16 smoke
suites including audio.

**Tier 1 complete.**  Nine of nine items shipped (T1.1 through
T1.9).  Next session moves into Tier 2 — recommended start point
is the door-bug bundle (T2.1 + T2.2) since it's a known-bad
pupil report and likely shares a root cause across the two
items.

## Tier 2 (post-Phase-4 plan) — door-bug bundle shipped 2026-04-27

Source plan:
[`docs/plans/current/2026-04-26-fixes-and-features.md`](../plans/current/2026-04-26-fixes-and-features.md).
T2.1 (item 2 — wrong background after door) and T2.2 (item 3 —
wrong behaviour blocks after door) shipped together as predicted
in the plan; bisecting against the existing tests confirmed both
shared a root cause: only one screen of nametable data + a single
fixed behaviour map ever followed a door transition, so any
multi-screen world (or any project with >1 background that the
runtime needed to query collision against) saw stale tiles or
stale collision data after a door fired.

- **Root cause (T2.1).**
  `tools/playground_server.py`'s `build_scene_inc` emitted each
  bg's nametable as a fixed-size `bg_nametable_<n>[1024]` array —
  one screen.  `tools/tile_editor_web/builder-templates/platformer.c`'s
  `load_background_n` then wrote those 1024 bytes to PPU `$2000`
  (NT0) only.  In a 2×1 world, the new bg's right-hand screen never
  reached NT1 — it kept the previous bg's tiles.  Pupil report:
  *"shows the wrong background for one of the screens."*
- **Root cause (T2.2).**  `build_behaviour_c` emitted a single
  global `behaviour_map[]` from the *selected* bg's behaviour grid,
  and `behaviour_at()` read directly from it.  Door transitions
  swapped the visible nametable but not the collision data, so
  collision queries against the new room hit the source room's
  walls/doors/triggers.  Pupil report: *"the 'behaviour blocks'
  are from the wrong background."*
- **Fix — server side.**
  - `build_scene_inc` now emits each `bg_nametable_<n>` at
    `screens_x × screens_y × 1024` bytes (one 1024-byte screen
    block per screen, row-major sy outer / sx inner).  New macros
    `BG_SCREENS_X`, `BG_SCREENS_Y`, `BG_NAMETABLE_BYTES` go in
    scene.inc so the template knows the loop bounds.  All bgs in
    the project share the project-wide world dimensions (taken
    from the active bg) — mismatched dimensions are caught earlier
    by builder-validators; this code is a safety belt that pads
    short rows with `BEHAVIOUR_NONE`.
  - `build_behaviour_c` now emits one `behaviour_map_<n>[]` per
    bg, plus a mutable `const unsigned char *active_behaviour_map`
    initialised to the selected bg's map, plus a
    `behaviour_set_active_bg(unsigned char n)` switch.
    `behaviour_at()` reads through the pointer.  `collision.h`
    declares the new function.
  - New `selected_bg_idx_safe(state)` helper consolidates the
    bg-index validation that was duplicated in three places.
- **Fix — template side.**
  - `load_background_n(n)` body now walks every `(sy, sx)` block
    in the new bg, computing each NT's base address (`$2000`,
    `$2400`, `$2800`, `$2C00` per the same pattern as
    `scroll.c`'s `load_world_bg`) and writing the matching
    1024-byte block from `bg_nametable_<n>`.  After the writes
    finish, it calls `behaviour_set_active_bg(n)` so collision
    queries follow the visible room.
  - No changes to main.c (Step_Playground stock) — the door logic
    only exists in platformer.c (Builder template); main.c never
    touches any of these symbols.  Byte-identical baseline ROM
    hash unchanged.
- **Tests.**
  - New E4 case in
    `tools/builder-tests/round3-multi-bg.mjs` builds a 2×1
    + 2-bg + door project via the *shared-dir* path (no
    customMainC) so the test can read back the staged
    scene.inc + behaviour.c.  Asserts: `BG_SCREENS_X 2`,
    `BG_NAMETABLE_BYTES 2048`, per-bg arrays
    `bg_nametable_0[BG_NAMETABLE_BYTES]` and
    `bg_nametable_1[BG_NAMETABLE_BYTES]` exist; `behaviour_map_0`
    and `behaviour_map_1` arrays exist; `active_behaviour_map`
    pointer + `behaviour_set_active_bg(...)` function present;
    `behaviour_at` reads `active_behaviour_map[...]`.
  - `mkBg` and `mkState` in `round3-multi-bg.mjs` gained
    `screensX` / `screensY` parameters so the helper can build
    multi-screen test fixtures.
  - Existing tests untouched — V1, A1, A, E1, E2, E3 still cover
    the original same-room and 1×1 multi-bg paths.
- **Caveat — flagged for follow-up.**  When the project is
  *multi-screen* and the world > 2×2, scroll.c's
  `scroll_stream` reads `bg_world_tiles[]` (the SCROLL_BUILD
  global, currently keyed off the selected bg only) to fetch
  off-screen rows/columns as the camera moves.  If a multi-bg
  door teleports between two such large worlds, post-door scroll
  streaming would still pull from the source bg's tiles.  We
  don't hit this today because Phase 4.4 caps worlds at 2×2 and
  T3.2 (worlds-beyond-2-screens) hasn't shipped yet — by the
  time T3.2 lands, the bg_world_tiles pointer needs swapping
  too.  Note added inline in scroll.c's load_world_bg comment.

**ROM-size impact.**  Bgs with 1×1 dimensions: same 1024 bytes
as before.  2×1 / 1×2: 2048 bytes per bg (+1KB).  2×2: 4096
bytes per bg (+3KB).  A typical project with three 2×1 rooms
goes from ~3KB of nametable data to ~6KB; comfortably inside
the 32KB PRG budget but worth knowing for projects pushing
ROM-size limits.  The audit panel on the Audio page (and the
ROM-size meter on the Builder page) reflect the new totals.

**Tests.**  Full `run-all.mjs` regression suite green — every
invariant including the byte-identical baseline (T2.1/T2.2 only
touch the doors-active path; no-modules-ticked is unchanged), the
T1.3 sprite-duplicate guard, and all 16 smoke suites.

## Audio robustness pass — 2026-04-27

Source: pupil-reported audio failures collected on 2026-04-27.
Three independent issues all surfacing as the same end-user
symptom ("uploaded music doesn't play, starter pack does").  Each
fix small, but together they unblock every pupil who'd hit any of
the three traps below.

- **Asymmetric upload silently dropped audio.**  The editor's
  `play-pipeline.js` only passed `audioSongsAsm` + `audioSfxAsm`
  to the server when *both* were present; pupils who'd uploaded
  music but no sfx pack saw `USE_AUDIO=0` builds with no engine
  linked at all.  Fix: split the gate into two independent
  conditions — songs and sfx are now sent through whenever the
  pupil has them, and the server fills in whichever side is
  missing (see next bullet).  Defensive guard: alias trailer is
  only emitted when the pupil's stored `symbol` matches the
  strict ca65 identifier regex `[A-Za-z_][A-Za-z0-9_]*`, so an
  empty/corrupt symbol can't slip through and produce
  `.export _audio_default_music:=` (empty rhs → "Constant
  expression expected").
- **Server-side auto-stubbing for missing audio side.**  Pre-fix,
  the server's `audio_songs and audio_sfx` gate dropped audio
  entirely on asymmetric uploads.  Now `playground_server.py`
  carries `_AUTO_SONGS_STUB_ASM` and `_AUTO_SFX_STUB_ASM`
  constants (lifted from `audio.mjs`'s known-good
  `STUB_*_ASM` blobs) and fills in whichever side the pupil
  didn't upload.  Result: any project with at least one audio
  asset gets the engine linked in.  Project with neither still
  builds clean as no-audio.  Audio.mjs Case 4 inverted: the test
  used to assert song-only matches no-audio hash; now it
  asserts song-only and sfx-only each produce a *different* hash
  from baseline (auto-stub engaging).
- **Newer-FamiStudio `.if FAMISTUDIO_CFG_C_BINDINGS` build error.**
  Newer FamiStudio versions wrap their `.export _<sym>=<sym>`
  lines in `.if FAMISTUDIO_CFG_C_BINDINGS ... .endif`.  ca65
  (which has no concept of cc65 C bindings on its own) errors
  with "Constant expression expected" because the `.if`
  predicate symbol isn't defined.  This was hitting pupils as
  `audio_songs.s(3): Error: Constant expression expected` and
  blocking the build entirely.  Fix: the server prepends
  `_AUDIO_ASM_PRELUDE` (an `.ifndef`-guarded
  `FAMISTUDIO_CFG_C_BINDINGS = 0` definition) to every staged
  audio `.s` before assembly via the new `_stage_audio_asm()`
  helper, called from both `_build_in_shared_dir` and
  `_build_in_tempdir`.  The `.if` evaluates to 0 → wrapped
  exports are skipped, but our editor's own alias trailer maps
  `audio_default_music` / `audio_sfx_data` to the right symbols
  directly so the wrapped exports were never needed.  Skipped
  cleanly when the pupil's file already assigns
  `FAMISTUDIO_CFG_C_BINDINGS`, so a future upstream-fixed
  FamiStudio export won't double-define.
- **New diagnostic tool — `tools/audio/diagnose_song.py`.**  Stand-
  alone Python script that reads a `.s` file (or stdin) and
  reports likely-silent / likely-build-fail patterns:
  - Multi-song export where song 0 is likely empty.
  - Non-NTSC machine target byte.
  - FamiTone2 export instead of FamiStudio Sound Engine.
  - Newer-FamiStudio `.if FAMISTUDIO_CFG_C_BINDINGS` shape
    (info-level — not a build-blocker since the server now
    auto-handles it, but surfacing the pattern means anyone
    running the tool on a raw export understands what they're
    seeing).
  Each finding includes the specific FamiStudio menu path the
  pupil should follow to fix.  Exits 0 when nothing's flagged,
  1 if any error/warn fires, so teachers can pipe a folder of
  pupil exports through the tool to triage in one go.
- **AUDIO_GUIDE.md** gained a *"My uploaded music doesn't play,
  but the starter pack does"* sub-section listing all four causes
  in detection order, plus a *"build fails with `audio_songs.s(3):
  Error: Constant expression expected`"* entry naming the C-
  bindings fix specifically so future hits are self-diagnosable.

**Tests.**  Full `run-all.mjs` regression suite green
throughout.  `audio.mjs` Case 4 rewritten to assert the new
auto-stub behaviour (song-only ROM ≠ stock; sfx-only ROM ≠
stock).  All 16 smoke suites, every invariant, byte-identical
baseline holds.

**ROM-size impact.**  None — auto-stubs are ~30 bytes each, well
under any meaningful threshold.  Pupils who upload only music get
the engine linked (≈3.5 KB) where they previously got nothing,
which is the whole point.

