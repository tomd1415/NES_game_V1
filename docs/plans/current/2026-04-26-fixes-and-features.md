# Fixes-and-features plan — 2026-04-26 onwards

> **Source.**  Pupil and teacher feedback collected through to
> 2026-04-26 in [`docs/feedback/recently-observed-bugs.md`](../../feedback/recently-observed-bugs.md)
> (27 items).  This plan groups them into four tiers ordered
> *safest, quickest, lowest-risk first → architectural and most
> uncertain last*.  Each item links back to the bug list by number
> so the source is traceable.

## Status snapshot at 2026-04-26

- **Phase 4.3 audio.**  Shipped — FamiStudio engine + editor +
  starter pack + AUDIO_GUIDE.  An NMI-driven engine update was
  attempted and reverted; tempo wobble on heavy frames is now a
  documented known limitation.  See
  [`docs/plans/archive/2026-04-26-audio.md`](../archive/2026-04-26-audio.md).
- **Pre-Phase-4 sweep.**  Phase 1 (pupil-fix pass), Phase 2 (drawing
  tools / palette QoL / animation strip), Phase 3 (top-down preset,
  multi-line dialogue, per-NPC dialogue, P2 jump animation), and
  Phase 4.4 (4-screen mirroring) are all closed — see
  [`docs/plans/archive/2026-04-26-next-steps.md`](../archive/2026-04-26-next-steps.md).
- **Outstanding from earlier plans.**  2.1 *Select → resize drag
  handles* (deferred, low priority).  Everything else from
  next-steps-plan is closed or in this document under a new label.

## How this plan is ordered

Tiers are about **risk profile**, not about pupil-visible value:

- **Tier 1** — UX polish and tightly-scoped bug fixes.  Each one
  is one focused session of work, touches one or two files, has
  obvious "looks right" success criteria, and does not interact
  with engine internals or the build pipeline.
- **Tier 2** — Self-contained features and bug fixes that touch
  several editor pages or one Builder module.  Need a
  reproduction step or a small design decision before code, but
  no architectural moves.
- **Tier 3** — Architectural changes: the scroll engine, ROM-
  size/perf re-balancing, or new game styles whose runtime
  behaviour we haven't validated.  Each Tier 3 item should land
  behind a feature flag where possible and ship with regression
  coverage.
- **Tier 4** — Bigger initiatives that need their own plan
  document before code: tablet/mobile, login + cloud-saved
  projects.  Listed here so they're tracked, but the design
  conversation has to come first.

Within a tier, items are ordered by likely effort (smallest
first).  Pupils have asked for the same thing in several different
ways across the bug list — where we can address two requests with
one piece of work, that's flagged.

> **Working assumption.**  Each tier should land a regression
> entry in [`docs/changelog/changelog-implemented.md`](../../changelog/changelog-implemented.md)
> as it ships, plus a smoke-suite test in
> [`tools/builder-tests/`](../../../tools/builder-tests/) where
> behaviour is testable headlessly.  When a Tier-3+ item lands
> behind a flag, document the flag's lifecycle in this file (in
> the Tier section, *not* in a separate plan doc) so the next
> agent can see the cleanup state at a glance.

---

## Tier 1 — Quick wins (1-3 hour sessions)

Order within tier: do the four sprite/background-page items
together (one editor sweep), then the layout/UX nudges, then the
two scoped diagnostic fixes.

### T1.1 Background-tile fill option *(item 1)*  ✓ **DONE 2026-04-27**

Add a "fill area" tool on the Backgrounds page next to the
existing pencil/picker.  Bucket-fill replaces every contiguous
tile of the same value within the selected screen with the
currently-active tile.  Follows the existing tile-painting
event flow; no new state.  **Files:** `behaviour.html` (or
`backgrounds.html`, whichever owns the painting canvas), one
new helper in `sprite-render.js` or a sibling.  **Test:**
extend an existing painting smoke-suite case to fill a region
and assert the resulting `bgWorld.tiles` array.

### T1.2 Pixel grid overlay on sprite top view *(item 19)*  ✓ **DONE 2026-04-27**

The per-tile pixel editor already has a faint pixel grid; the
sprite top view (composition canvas) doesn't.  Add the same
grid as a CSS overlay or canvas-stroke pass, with a toggle in
the existing view-options menu so it can be hidden.  **Files:**
`sprites.html` + a couple of lines in `sprite-render.js`.

### T1.3 Duplicate-sprite copies tiles *(item 18)*  ✓ **DONE 2026-04-27**

Right now duplicating a sprite gives you a new sprite cell-list
that points at the *same* tile indices, so editing the duplicate
edits the original.  Fix: when duplicating, also duplicate the
tile entries each cell points at, allocate fresh tile indices,
and rewire the new cell list.  **Files:** the sprite-clone path
in `storage.js` or `sprites.html`.  **Test:** duplicate, edit
the duplicate's pixels, assert the original's pixels are
unchanged.

### T1.4 Behaviour editor — wider sprite-reactions box *(item 20)*  ✓ **DONE 2026-04-27**

The Sprite reactions panel is currently in the right-hand
column and feels cramped.  Move it into a row *under* the
background canvas, full width.  Pure CSS / DOM-shuffle.
**Files:** `behaviour.html` only.

### T1.5 Make sfx-event linkage discoverable *(item 27)*  ✓ **PART 1 DONE 2026-04-26** (part 2 still gates on T2.6)

Pupils don't currently see how sound effects connect to game
events because the wiring is implicit (the audio Builder module
isn't shipped yet).  Two-step:

1. **Documentation patch** — add a "Connecting sound effects to
   events" sub-section to
   [`docs/guides/AUDIO_GUIDE.md`](../../guides/AUDIO_GUIDE.md)
   pointing at the four `audio.events.*` slots that already
   exist in the Code page (jump / pickup / hit / land), with
   copy-paste C snippets.
2. **UI hint on Audio page** — show a "Used by" line on each
   sfx slot card indicating which event(s) currently call it,
   reading from `state.builder.modules.audio` (which doesn't
   exist yet — gates this on T2.6).

The doc patch can ship today; the UI hint waits on T2.6.

### T1.6 Game-wide variables in Builder *(item 22)*  ✓ **DONE 2026-04-27** (partial — see Status block below)

Add a "Globals" Builder module exposing a small set of
top-level numeric overrides: `gravity`, `walk_speed`,
`climb_speed`, `jump_strength` initially.  Each maps to a
`#define BW_*` slot consumed by the platformer template.
**Files:** `builder-modules.js` (new module),
`builder-assembler.js` (slot emit), `builder-templates/platformer.c`
(`#ifdef`-gated defaults).  **Test:** new smoke suite asserts
the emitted C contains the expected `#define`s when set.
Overlaps with T2.5 (per-sprite jump speed) — do this first
because the global default is the natural fallback for the
per-sprite override.

> **Status (2026-04-27).**  Shipped with `gravityPx` (scene-
> sprite fall) and `jumpSpeedPx` (player rise).  Player fall
> rate, climb speed, walk speed defaults, and Player 2's
> mirrored jump/gravity block are *not* yet macro-ified —
> they're each a small follow-up using the same
> `BW_APPLY_<thing>` pattern.  See the changelog entry for
> 2026-04-27 for what landed.
>
> **Future direction (note from user, 2026-04-27).**  As pupils'
> games get more sophisticated, this module will need to grow in
> two directions:
>
> 1. **More physics constants exposed** — player fall rate, P2
>    mirrors, walk/climb defaults, friction-style decay etc.
>    Each is a ~30-line addition (default macro in the templates,
>    schema entry in `builder-modules.js`, no test churn) once
>    the macro pattern is in place — which it now is.
> 2. **Game-type-aware schema.**  Each game style (platformer,
>    top-down, future Geometry-Dash T3.4, future racing T3.5)
>    has different physics knobs.  Top-down has no gravity at
>    all (the scene-sprite gravity loop is already gated behind
>    `#if BW_GAME_STYLE == 0`); racing wants angle + velocity
>    rather than fall rate.  When T3.4 / T3.5 land, the Globals
>    module's `schema` should branch on
>    `state.builder.modules.game.config.type` so pupils only see
>    the controls that matter for the style they picked, and the
>    `applyToTemplate` should emit a different macro set per
>    style.  That's a structural change to `builder-modules.js`
>    (schemas can already be functions of state — see the
>    `'sprite' | 'animation'` types in the catalogue intro), so
>    no engine work is required to enable it.
>
> Tracking these inline rather than spinning out a separate plan
> doc — they're refinements of the same module, not a new
> feature.

### T1.7 Better gallery thumbnail *(item 25)*  ✓ **DONE 2026-04-26** (shipped at frame 60, not 30 — see Decisions)

Currently the gallery captures frame 0 which is almost always
the background palette colour with no sprites yet.  Capture
frame ~30 instead (so init has run, sprites are placed,
animations have a tick on them).  **Files:**
`tools/playground_server.py` (the gallery capture path) and/or
the in-browser capture in `play-pipeline.js`.  Single-line
constant; the harder part is verifying the new frame is
actually representative — pick a frame number after the player
has settled on the ground and at least one animation cycle has
played.

### T1.8 Scoped palette diagnosis *(item 16)*  ✓ **DONE 2026-04-26** (framework only — no reproduction run yet)

"The palettes on the background and for the sprites sometimes
do not match what they should be and the ones that are selected
are not always represented."  Don't try to fix this blind —
*first* write down what's reproducible:

1. Open Sprites page.  Pick palette index 2 for a sprite.  Save.
   Reload.  Does palette 2 still show as selected?
2. Same on Backgrounds page.
3. Set BG palette 0 colours to known values.  Open Builder ▶
   Play.  Do the rendered sprites and BGs use those colours?

Capture the outcome of each step in
[`docs/feedback/recently-observed-bugs.md`](../../feedback/recently-observed-bugs.md)
under item 16.  Only then triage the actual mismatch — could
be storage round-trip, UI display, or assembler emit.  **Risk
of doing this blind:** wasted session chasing a phantom case.

### T1.9 NES dev resources collected *(item 4)*  ✓ **DONE 2026-04-26**

Add a new file `docs/reference/nes-resources.md` curating the
canonical references we already lean on plus the ones we should:
nesdev.org wiki, the FCEUX docs, FamiStudio docs, cc65 wiki,
specific blog posts about scroll splits and CHR layout.  Keep
each entry to a single line + short "what it answers" note so
pupils and future contributors can scan it.  Cross-link from
[`docs/guides/PUPIL_GUIDE.md`](../../guides/PUPIL_GUIDE.md) and
[`docs/guides/TEACHER_GUIDE.md`](../../guides/TEACHER_GUIDE.md).
**Risk:** none — pure documentation.

---

## Tier 2 — Targeted features (½–1 day sessions)

Do these in roughly the order listed.  T2.1 / T2.2 are
prerequisites for several others (any feature touching
multi-screen behaviour benefits from getting the Builder's
scene-instance model fully reliable first).

### T2.1 Door / scene-transition wrong background *(item 2)*  ✓ **DONE 2026-04-27** (bundled with T2.2)

When a project has a multi-screen background and the player
walks through a door into a different background, *one* of the
visible screens shows the wrong source.  Almost certainly a
bug in the scene-instance staging pipeline that walks the
nametable for non-zero `screen_idx` values.  Approach:

1. Reproduce in the Builder against a known-good 2×1 project
   pair (we already have a saved one in the gallery).
2. Bisect against the four-screen smoke suite — does it
   trigger there?  If yes, fix at the suite level.  If no,
   reproduce manually and capture the failing nametable bytes.
3. Likely root cause is the door-target nametable cropping in
   `playground_server.py`'s scene-stage path; look for places
   where we hard-code `bg_world_tiles` for screen 0.

**Test:** new case in `four-screen.mjs` or `chunk-c-doors.mjs`
that builds a multi-screen door pair and asserts ROM bytes for
the second nametable region.

### T2.2 Door transition uses wrong behaviour blocks *(item 3)*  ✓ **DONE 2026-04-27** (bundled with T2.1)

Symmetric problem to T2.1 but on the behaviour map: after a
door, the destination scene's behaviour map shows blocks from
the source scene for one screen.  Same bisect approach as
T2.1; likely the same code path that stages nametables also
stages collision data with the same bug.  **Bundle these two
into a single PR** if the cause turns out to be shared.

### T2.3 Place enemies / players on every screen *(item 14)*

Currently the Builder's scene editor only lets pupils drop
sprites into screen (0, 0) of the first background.  Lift that
limit:

- Scene editor canvas gains a screen selector (already exists
  for backgrounds — re-use the same UI control).
- `state.builder.modules.scene.instances[]` gains
  `screen_x` and `screen_y` per instance.
- Assembler emits per-screen sprite-spawn lists; the runtime
  spawns each list on entry to that screen (Phase 3.2's
  per-scene spawn already exists, this just generalises to
  per-screen).

**Risk:** moderate — the runtime change touches the scene-
instance state machine, which is one of the more
test-coverage-thin parts of the codebase.  Plan one regression
test per game style (platformer + top-down).

### T2.4 Way to defeat enemies *(item 15)*

Two mechanics, both opt-in via Builder module options:

- **Stomp** — jumping on top of an enemy kills it.  Detect via
  the existing collision test, but only when the player's
  vertical velocity is *downward* and the contact point is
  near the enemy's top edge.
- **Projectile** — the player can press a button to fire; if
  a projectile collides with an enemy, both are destroyed.
  Adds a `projectile` module with sprite role + speed +
  cooldown.

Ship stomp first (smaller change, no new sprite role) and
defer projectile to T2.4b once stomp is proven.  Both should
be Builder-flag-gated so existing projects don't change
behaviour.

### T2.5 Per-sprite tuning, starting with jump speed *(item 6)*

Builder gains a "per-sprite settings" panel that exposes a
small set of overrides per sprite role: `jump_strength`,
`walk_speed`, `climb_speed`.  Each falls back to the
T1.6 globals when unset.  **Files:** `builder-modules.js`
(panel), `builder-assembler.js` (per-role emit),
`platformer.c` (per-role override macros).  Builds on T1.6 —
do not start until that's in.

### T2.6 Audio events module *(item 27 part 2)*

The Builder module that lets pupils map game events (jump,
pickup, hit, land, dialogue-open, door-transition) to sfx
slots and select per-scene background music.  This is the
piece audio-plan.md called out as the Tier-A-finale follow-up
and is the right unblock for T1.5's UI hint.  **Files:**
new module in `builder-modules.js`, emit in
`builder-assembler.js` that inserts `famistudio_sfx_play(...)`
into the matching event hooks of `platformer.c`, optional UI
mirror on the Audio page showing the current mappings.

### T2.7 Default sound effects in the audio section *(item 7)*

The starter pack already ships six sfx (`jump`, `hit`,
`pickup`, `land`, `blip`, `error`).  What pupils want is for
**fresh projects** to start with these wired up — currently
pupils have to click *Load starter pack* first.  Fix: the
project initialiser seeds `state.audio` with the starter pack
contents (or a "minimal" subset) when a pupil starts a new
project on the Sprites page.  **Risk:** small — the starter
pack is already a server endpoint, just needs to be fetched
on first project create.

> **Status note (2026-04-27).**  The audio robustness pass
> partially addresses this: pupils who upload music *without*
> an sfx pack now get audio engaged anyway (the server
> auto-stubs a silent sfx, see the changelog).  So a pupil who
> ignores the sfx side entirely still hears their music.
> T2.7 is still worth shipping for the "I want sfx slots
> available without manual setup" UX — but the urgency is
> down, and the user explicitly answered (in the original
> Decisions section) that the starter pack should default for
> every new project.  Sequencing-wise, do this AFTER T2.6 so
> the auto-seeded sfx slots can be wired to events out of the
> box.

### T2.8 More enemy path options *(item 13)*

The current `enemies.walker` module supports horizontal
back-and-forth; `enemies.chaser` does straight-line homing.
Pupils have asked for: vertical patrol, square-loop patrol
(four corners), follow-platform-edges (drop off, turn around).
Add as preset path types in the existing enemies module —
each is a small state-machine extension to the runtime tick.

### T2.9 Triggers / doors with different effects *(item 21)*

Today every trigger does one thing (typically: open the win
dialog) and every door does one thing (transition to a target
scene).  Generalise:

- Each door instance gains a target scene + a *per-instance*
  effect (transition, win, lose, set-flag).
- Each trigger instance gains an effect picker (set-flag,
  spawn-sprite, change-music, etc.).

Most of the work is UI; the runtime side is just a switch on
the effect type.  **Risk:** moderate — touches the scene
state machine in the same way T2.3 does, so do them in the
same week if possible.

### T2.10 Animations for enemies and pickups *(item 17)*

The Builder's animation module already understands the
`player` role (walk + jump).  Extend it to enemies and pickups
so a walker can have a 2-frame waddle and a coin can have a
4-frame spin.  **Files:** `builder-modules.js` (animation slot
per role), `builder-assembler.js` (emit per-role animation
table), `platformer.c` (per-role animation tick).  **UX:**
also surface an "(animated)" badge on the Sprites page when
a sprite has an animation assigned, so pupils don't have to
remember whether they wired it up — fixes the second half of
item 17.

### T2.11 Pupil-side audio tempo workflow *(item 8 part 1)*

Item 8 asks for "set the default tempo for the audio and the
ability to trigger tempo changes."  FamiStudio bakes BPM into
the exported `.s` data — there is **no runtime API** to change
tempo, only to play different songs.  So the deliverable is:

- Documentation in
  [`docs/guides/AUDIO_GUIDE.md`](../../guides/AUDIO_GUIDE.md):
  walk pupils through changing the BPM in FamiStudio, re-
  exporting, and re-uploading.  Already started during the
  Phase 4.3 wrap-up; expand with a screenshot.
- "Tempo changes during the song" are achievable today by
  composing them in FamiStudio (groove changes mid-track).
  Document that.
- Pupil-driven *runtime* tempo changes (e.g. speed up music
  on low HP) are achievable by composing two songs at
  different tempos and calling `famistudio_music_play(N)` to
  switch — i.e. it's already supported by T2.6.  Cross-link.

### T2.12 NES dev research follow-through *(item 4 part 2)*

Once T1.9 has the resource list, *use* it to pre-fetch
answers for the two architecture items in Tier 3 (T3.1 scroll
fixes, T3.2 beyond-2-screens, T3.3 C→asm).  Likely deliverable:
a one-page "what the canonical references say about X" note
appended to each Tier 3 item before that item is started.

---

## Tier 3 — Architectural / risky (multi-day, may need experiments)

Each Tier 3 item is preceded by a research/spike day where we
prove the approach against a throwaway branch before committing.
Code changes ship behind feature flags where they affect
existing pupil projects.

### T3.1 Vertical and 2×2 scrolling fixes *(item 9)*

Pupils have reported that vertical-only and 2×2 multi-screen
worlds have rendering glitches when the camera crosses screen
boundaries.  Strong suspicion this is a `scroll_stream` row-
burst bug (the column burst is well-trodden; the row burst
sees less practical use).  Approach:

1. Build a deliberately-pathological 2×2 test ROM with a
   known nametable pattern.
2. Inspect in FCEUX's PPU viewer at the boundary crossing.
3. If the row burst is the cause, the fix is likely the
   same volatile-write ordering issue that hit the column
   burst; look at `scroll.c` lines 247-265.

**Risk:** medium-high — scrolling is the most fragile part of
the runtime.  Land behind a project-level "vertical scroll
enabled" flag if any change might affect 1×1 builds.  Add a
4-screen-vertical regression test once green.

### T3.2 Worlds beyond 2 screens *(item 10)*

The current 4-screen mirroring (Phase 4.4) caps worlds at 2×2.
Going beyond requires either a CHR-bank-switching mapper
(MMC1 / MMC3) or a runtime nametable rewrite scheme that
streams more than the four hardware nametables provide.

**Spike first, code second.**  Open question: how big can a
project get before either CHR-ROM or the cc65 link map
overflows?  The answer determines whether we need a mapper
upgrade (which breaks every existing project) or whether
runtime streaming with a single PRG bank is enough.  Capture
the spike result in this file before scoping the engineering.

### T3.3 Convert more C to assembly *(item 5)*

The pupil noted "last time this was done there was a massive
improvement" — referring to the column-burst unrolling in
`scroll.c`.  Targets for the next pass, in expected payoff
order:

1. The OAM build loop in `main.c` / `platformer.c` — runs
   every frame on every project.  ~50% per-iteration speedup
   would translate to ~5-10% main-loop budget back.
2. The collision-test inner loop in `behaviour.c` — runs once
   per active sprite per frame.
3. The behaviour-tick state machine in `platformer.c` — only
   pays off if a project has many sprites or top-down 4-way
   movement.

**Risk:** asm-level changes are the easiest place to hide
subtle bugs (e.g. forgetting to preserve a register).  Each
target needs its own benchmark ROM and a regression case in
the existing smoke-suite that proves the byte-identical
behaviour against the C version (or, if behaviour changes
deliberately, locks the new behaviour in).

### T3.4 Geometry-Dash-style game *(item 11)*

A new game style alongside platformer / top-down: forced
auto-scroll, tap-to-jump, instant restart on collision.
Pupils have requested it specifically because it's
"approachable" — the lowest skill ceiling of the three.

**Design before code.**  Write a one-page design note in this
file (a future `T3.4` subsection) covering:

- Auto-scroll mechanism — re-use the existing scroll engine
  with a forced cam_x increment, or implement separately?
- Death + respawn loop — Builder-configurable instant restart
  vs. lives count.
- Level authoring — does the existing Backgrounds page work
  for a sideways-scrolling spike-field, or do we need a
  level-strip tool?

Code only after the design note is signed off.

### T3.5 Top-down racing game like *Micro Machines* *(item 12)*

Combines top-down (Phase 3.1) with a forced-curve track.  Most
of the engine work is *new* — an angle-based velocity model,
track-edge collision, lap counting.  Treat as its own initiative
with its own design doc, not a quick add-on.  Probably the last
Tier 3 item to start.

### T3.6 Top-down code parity with platformer *(item 26)*

The top-down preset shipped in Phase 3.1 hasn't been exercised
by pupils as much as the platformer.  Audit: walk the
platformer feature list, confirm which features (HP / damage /
HUD / dialogue / doors / animations / audio events) work in
top-down mode, fix or document the gaps.  Pair with the T1.9
research output so we have known-good NES references for any
feature we re-implement.

---

## Tier 4 — Big initiatives (own plan doc required)

These items need a dedicated design conversation before any
code.  Listed here so they're tracked, but each one's
implementation plan should live in its own
`docs/plans/current/<date>-<name>.md` once we're ready to start.

### T4.1 Tablet / mobile UX *(item 23)*

The user has explicitly flagged this as low priority.  Worth a
spike to confirm what *currently* breaks (the editor UI
assumes pointer + keyboard; in-browser play assumes a
keyboard).  Output of the spike: a list of changes ranked by
"pupils can use the editor at all" → "pupils can play their
ROM" → "polished".  Don't start code until the spike has run.

### T4.2 Optional user accounts + cloud-saved projects *(item 24)*

Biggest item on the list.  Touches the playground server,
gallery, every editor page that currently uses
`localStorage`, and any session-state code.  Compounds with
two existing roadmap entries: gallery removals (currently
unowned because we have no identity), and project sync between
home and school computers.

The user's framing already nails the design constraint:
*"without an account the user can only post to the gallery and
not remove from the gallery unless there is a way to be sure
that it was that user that posted it to the gallery"* — i.e.
optional account, with anonymous posts using a per-browser
nonce so a pupil at home can still take down their own post
without an account.

Likely sub-pieces, in order:

1. Anonymous nonce stored in `localStorage` so anonymous
   gallery deletions work without accounts.  (This is small
   and probably belongs in **Tier 2** as a near-term fix.)
2. Login backend + session model.  Big.
3. Per-user project storage backed by the backend.  Bigger.
4. Cross-device project sync.  Biggest.

The first sub-piece may be promotable to Tier 2 once we
confirm the user wants the anonymous-deletion behaviour as a
standalone feature.

---

## Cross-cutting / non-tier work

These show up in multiple items and benefit from being
addressed holistically rather than per-feature.

- **Regression coverage gap (audio + scroll).**  The audio
  tests don't currently exercise SCROLL_BUILD projects, and
  the scroll tests don't currently exercise USE_AUDIO
  projects.  The combined matrix is where the most recent
  bug bites lived.  Add a "SCROLL_BUILD + audio" case to
  `audio.mjs` (or a dedicated `audio-scroll.mjs`) before
  starting Tier 3 scroll work.
- **Documentation map.**  The reorg this plan is shipping
  alongside (see `docs/README.md`) puts current vs archived
  plans in distinct directories.  Each new tier item should
  ship with a one-line entry in
  [`docs/changelog/changelog-implemented.md`](../../changelog/changelog-implemented.md)
  pointing at the matching tier number above so future agents
  can map "what shipped" back to "what was planned".
- **Pupil-feedback intake.**  When new bugs come in, append
  to [`docs/feedback/recently-observed-bugs.md`](../../feedback/recently-observed-bugs.md)
  *and* link from the matching tier item here, rather than
  starting a new plan doc.
- **Audio robustness pass — shipped 2026-04-27.**  Three
  pupil-reported audio failures (silent music, asymmetric
  upload dropping audio, `audio_songs.s(3)` build error from
  newer-FamiStudio `.if FAMISTUDIO_CFG_C_BINDINGS` exports) all
  fixed in one pass.  See the *Audio robustness pass* entry in
  [`docs/changelog/changelog-implemented.md`](../../changelog/changelog-implemented.md)
  and the new
  [`tools/audio/diagnose_song.py`](../../../tools/audio/diagnose_song.py)
  diagnostic.  No new tier item — these are bug fixes against
  existing functionality, but recording here so the audio
  workstream's history is followable.
- **Diagnostic-pending bugs (re-reported 2026-04-27).**  Items
  28 (NPC dialogue misbehaving) and 29 (vertical scroll
  glitches) in
  [`docs/feedback/recently-observed-bugs.md`](../../feedback/recently-observed-bugs.md)
  need symptom capture before triage.  The bug-list file
  carries question-frameworks for both — whoever runs the
  next pupil session should fill in the `[ ]` checkboxes as
  symptoms surface.  Item 29 will feed T3.1's spike when
  it starts (the symptom data is what determines whether the
  fix is a small ordering tweak in `scroll.c` or a deeper
  rework).  Item 28's tier assignment depends on what the
  symptoms turn out to be — could be a quick T2.x fix
  (e.g. assembler-side per-NPC text mapping bug), could be
  T3.6 dialogue-parity territory if it's a top-down-specific
  regression.

---

## Sequencing summary

The first three sessions are already done — Tier 1 + the
door-bug bundle, plus the (unnumbered) Audio robustness pass —
see
[changelog-implemented.md](../../changelog/changelog-implemented.md)
for full write-ups.  Sessions are listed below in order;
struck-through items are shipped, the rest are the
recommended order from here.

1. ~~**Session 1** — T1.1, T1.2, T1.3, T1.4 (sprite/background
   page sweep).~~ Shipped 2026-04-27.
2. ~~**Session 2** — T1.5 part 1, T1.6, T1.7, T1.8, T1.9
   (UX nudges + research note).~~ Shipped 2026-04-26 / 27.
3. ~~**Session 3** — T2.1 + T2.2 (door bug bundle).~~ Shipped
   2026-04-27.
4. **Session 4 (next)** — T2.6 + T1.5 part 2 (audio events
   module + the deferred Audio page UI hint).  Highest
   near-term pupil value: maps the existing sfx slots to game
   events from a Builder dropdown, and finishes off the T1.5
   half that was waiting on T2.6.
5. **Session 5** — T2.3 (place enemies/players on every
   screen) + T2.9 (per-instance trigger / door effects)
   bundled, since both touch the scene-instance state machine
   so doing them together avoids re-reading the same code
   twice.
6. **Sessions 6-7** — T2.4 (stomp first), T2.5 (per-sprite
   tuning, builds on T1.6's macro infrastructure), T2.10
   (animations for enemies / pickups).  Roughly one Builder
   module per session.
7. **Session 8** — T2.7 (default sfx seeded into new
   projects — note the audio robustness pass relieved the
   urgency, see Decisions section), T2.8 (more enemy paths).
8. **Session 9** — T2.11 + T2.12 (audio tempo workflow doc +
   NES-research follow-through).  No code; produces the
   input Tier 3 needs.
9. **Tier 3 spikes.**  T3.1 (vertical / 2×2 scroll fixes —
   bug item 29 needs symptom capture *before* this starts) →
   T3.2 (worlds beyond 2 screens) in one pair of sessions;
   T3.3 (C → asm) in another; T3.4 (Geometry Dash) design
   note before any T3.4 code.

Tier 4 is on hold pending design conversations the user
initiates.

---

## Decisions (answers from 2026-04-26)

- **T1.7 gallery thumbnail.**  Capture **frame 60** — initially
  tried 30 (per the original answer) but the resulting thumbnails
  were still blank because cc65's startup + the main loop's first
  iteration takes longer than 30 jsnes frames.  60 covers boot +
  at least one animation cycle on the player sprite, and is what
  shipped (2026-04-27).
- **T2.4 enemy defeat.**  Ship **stomp first**, defer projectile —
  confirmed.
- **T2.7 default sfx.**  **Yes, default for every new project for
  the time being.**  Re-evaluate (and possibly switch to "default
  for platformer preset only") once the top-down preset's
  audio-event vocabulary is in.
  *Status (2026-04-27): the audio robustness pass partially
  relieved this — pupils with no sfx pack uploaded now hear their
  music anyway because the server auto-stubs a silent sfx side.
  Default-sfx-seeding is still queued for T2.7 (so the slots are
  available for the audio events module to wire up), but it's no
  longer blocking pupils from hearing audio.*
- **T3.2 beyond-2-screens.**  **Add an MMC1 path, keep the
  existing mapper-0 path as a per-project opt-out.**  Net effect:
  default new projects to whichever is *currently* simplest (most
  likely mapper 0 stays the default until the MMC1 path is proven),
  expose a project-level "large world support" toggle that flips
  the build to MMC1, and make sure the toggle is one-way per
  project (turning it off after content has been laid out for
  >2 screens silently truncates, which we should warn the pupil
  about).  All existing projects boot identically with no toggle
  flip.  Add an ADR-style note to T3.2 once the spike has
  confirmed CHR-ROM banking works under jsnes + FCEUX.
- **T4.2 account scope.**  **Cross-device project sync is the
  goal** (pupils continue work from home).  Sub-piece order from
  the original list stands; promote sub-piece 1 (anonymous
  per-browser nonce so anonymous gallery deletions work) to a
  Tier 2 near-term item — it's small, useful by itself, and
  unblocks the gallery-removal UX before the full account stack
  lands.  Tracked here for now; the full plan doc gets written
  before any backend work starts.
