# Web-form pupil feedback — captured 2026-06-17

**Source.** The in-editor *💬 Leave feedback* form (`feedback.js` → `POST
/feedback`, viewable at `https://www.spritemaker.co.uk/feedback`).  These
submissions are a **separate stream** from the teacher-collected lists in
[`recently-observed-bugs.md`](recently-observed-bugs.md) and
[`PUPIL_FEEDBACK.md`](PUPIL_FEEDBACK.md) — until now they were **never
transcribed into the repo**.  This file captures every entry shown in the
viewer on 2026-06-17 so the web stream is tracked alongside the others.

**Provenance notes.**
- 25 entries, dated **2026-04-25 → 2026-06-16**.  All were marked *handled*
  in the viewer (the teacher had read them), but "handled" is just a triage
  toggle — it does **not** mean the underlying issue is fixed, and none of
  these were in the repo.  This pass re-triages each against the current code.
- Pupil **initials** are used here per the doc-wide anonymity rule in
  `PUPIL_FEEDBACK.md`; full first names are visible in the live `/feedback`
  viewer to the teacher.
- The actionable response (root causes, fixes, feature scoping) lives in
  [`../plans/current/2026-06-17-web-feedback-fixes.md`](../plans/current/2026-06-17-web-feedback-fixes.md).
  New **bugs** are also filed as numbered items 30–37 in
  [`recently-observed-bugs.md`](recently-observed-bugs.md).

---

## Triage summary

Legend — **FIXED**: fixed 2026-06-17 (see plan + changelog) ·
**PARTIAL**: first fix shipped, deeper work deferred · **OPEN**:
reproduces / not addressed · **VERIFY**: very likely already fixed,
confirm and close · **REPRO**: real but needs a reproduction before any
code · **SHIPPED**: capability already exists (often a discoverability
gap) · **HW-LIMIT**: bounded by NES hardware, explain · **NONE**: no
action (praise).

| #   | Date       | Who | Kind    | One-line                                            | Verdict | Plan ref |
| --- | ---------- | --- | ------- | --------------------------------------------------- | ------- | -------- |
| F1a | 2026-06-16 | K   | bug     | Enemies pass through solid ground / others          | FIXED   | B-1 (bug 30) |
| F1b | 2026-06-16 | K   | bug     | Glitch when enabling NPC "talk" on a gallery project| PARTIAL | B-2 (bug 31) |
| F1c | 2026-06-16 | K   | bug     | Deleting the 2nd sprite animation removes the 1st   | REPRO   | B-3 (bug 32) |
| F2  | 2026-05-19 | D   | bug     | "My game keeps crashing!"                           | REPRO   | B-10 (bug 37) |
| F3  | 2026-05-15 | K   | feature | Scene should move to the second one (stuck on 1st)  | SHIPPED | R-1 |
| F4  | 2026-05-15 | K   | feature | "make the squares hafe" (sub-tile / smaller squares)| HW-LIMIT| R-2 |
| F5  | 2026-05-15 | K   | bug     | Trigger weird — the screen turns green              | FIXED   | B-4 (bug 33) |
| F6  | 2026-05-15 | K   | bug     | Collision "1 pixel across" when pressing Start      | REPRO   | B-5 (bug 34) |
| F7  | 2026-05-15 | K   | feature | Hit a block/sprite → spawn another sprite           | NEW     | R-3 |
| F8  | 2026-05-15 | K   | feature | Change the speed for enemies                        | NEW     | R-4 |
| F9  | 2026-05-15 | A   | bug     | Enemy attack kills you instantly                    | VERIFY  | B-6 (bug 35) |
| F10 | 2026-05-15 | K   | bug     | Enemies don't bounce off blocks                     | FIXED   | B-1 (bug 30) |
| F11 | 2026-05-12 | D   | bug     | "My game keeps crashing!"                           | REPRO   | B-10 (bug 37) |
| F12 | 2026-05-08 | D   | bug     | Froze — arrow keys went to the website not emulator | VERIFY  | B-9 (bug 36) |
| F13 | 2026-05-08 | A   | bug     | Emulator froze for no reason                        | REPRO   | B-10 (bug 37) |
| F14 | 2026-05-05 | DD  | feature | Add more colours                                    | HW-LIMIT| R-5 |
| F15 | 2026-05-01 | K   | general | "I like NES, very good! good job"                   | NONE    | —   |
| F16 | 2026-05-01 | T   | bug     | Jump animation plays a different animation          | FIXED   | B-8 (bug 38) |
| F17 | 2026-05-01 | K   | feature | Adjust your / a sprite's speed                      | PARTIAL | R-4 |
| F18 | 2026-05-01 | K   | feature | On hit, a sprite plays an animation that stays      | NEW     | R-6 |
| F19 | 2026-05-01 | K   | feature | Press a button to play an animation (attack)        | NEW     | R-7 |
| F20 | 2026-05-01 | A   | feature | Make checkpoints work                               | NEW     | R-8 |
| F21 | 2026-05-01 | A   | feature | Copy and paste background elements                  | NEW     | R-9 |
| F22 | 2026-05-01 | D   | feature | Character bob when walking                          | NEW     | R-10 |
| F23 | 2026-04-29 | A   | bug     | Dialogue glitches the stage when adding letters     | PARTIAL | B-2 (bug 31) |
| F24 | 2026-04-28 | A   | feature | Infinite-runner game mode                           | NEW     | R-11 (=T3.4) |
| F25 | 2026-04-25 | M   | bug     | Movement keys navigate tileset when run from Backgrounds | VERIFY | B-9 (bug 36) |

**Counts:** 12 bug reports (collapsing to 9 distinct defects), 12 feature
requests, 1 praise.  Of the bugs: **3 FIXED 2026-06-17** (enemy collision
bug 30, green-screen trigger bug 33, jump-animation bug 38), **1 PARTIAL**
(gallery dialogue bug 31 — a no-font warning shipped, font rework deferred),
**3 REPRO**, **2 VERIFY**.  The fixes all keep `run-all.mjs` green including
the byte-identical-ROM invariant.

---

## Verbatim entries (newest first)

> Quotes are reproduced exactly, including spelling, so the pupil's intent
> isn't lost in paraphrase.

### F1 — K, 2026-06-16 — 🐛 broken
> "Enemy's go throe stuff. solid ground or others go one to the side. it
> bugs when I enable talk on gallery. the animations for sprites when I try
> to get rid of the 2nd one it get's rid of the first. and others."

Three distinct defects packed together:
- **F1a** enemies pass through solid ground (and through each other / "others"),
  and jitter "one to the side". → **OPEN**, root cause confirmed (bug 30).
- **F1b** a glitch when "talk" (NPC dialogue) is enabled on a project from
  the gallery. → **OPEN**, same family as F23 (bug 31).
- **F1c** deleting the 2nd sprite animation removes the 1st. → **REPRO**
  (delete handlers read index-correct; needs the pupil's exact steps — bug 32).
- "and others" — unspecified; ask K to list them next session.

### F2 — D, 2026-05-19 — 🐛 broken
> "My game keeps crashing! =["

No symptom captured. → **REPRO** — needs the project + repro steps (bug 37).

### F3 — K, 2026-05-15 — ✨ feature
> "can you add so the scene can move to the second one because I'm stuck on
> the first one"

→ **SHIPPED** but undiscoverable: the **Doors** module already transitions
between backgrounds, but its *Target background* defaults to `-1` (same-room
teleport), so a freshly-painted door does nothing visible.  See R-1.

### F4 — K, 2026-05-15 — ✨ feature
> "Can you add to you can make the squares hafe"

Best reading: smaller / half-size squares (sub-tile detail). → **HW-LIMIT**:
NES background tiles are a fixed 8×8 and attribute colour is 16×16 — there's
no sub-8px tile.  See R-2 for what *is* possible (finer pixel grid is already
there; a 16×16 metatile helper is the nearest feasible thing).

### F5 — K, 2026-05-15 — 🐛 broken
> "Trigger is a bit weird the screen turns green"

→ **OPEN**, high-confidence root cause: the win/trigger freeze writes
`PPU_MASK = 0x1F | 0x20` (= 0x3F) intending "pale red", but jsnes renders
that as a solid green backdrop (bug 33).

### F6 — K, 2026-05-15 — 🐛 broken
> "the collision is a bit weird its 1 pixel across when I press start on NES
> start"

→ **REPRO**: there is no Start/pause handling in the engine, so "press Start"
can't itself move collision.  Most likely the one-time landing-snap on the
first grounded frame after spawn.  Reproduce on FCEUX before changing code
(bug 34).

### F7 — K, 2026-05-15 — ✨ feature
> "can you add when you hit a block or sprite a other sprite spawn"

→ **NEW** (Medium).  No spawn reaction exists; this is the planned T2.9
trigger-effect work.  See R-3.

### F8 — K, 2026-05-15 — ✨ feature
> "can you add so you can change the speed for enemy's"

→ **NEW** (Medium).  Enemy walker/chaser AI hard-codes `+= 1` px/frame with
no speed field.  See R-4.

### F9 — A, 2026-05-15 — 🐛 broken
> "when the enemy attacks you, you die instantly"

→ **VERIFY**: the damage module now has invincibility frames (default 30) so
one touch = one hit.  Predates that fix; only still reproduces if a pupil
sets *Invincibility frames* to 0.  Confirm + consider a non-zero schema
minimum (bug 35).

### F10 — K, 2026-05-15 — 🐛 broken
> "enemy's don't bounce of block"

→ **OPEN**: same root cause as F1a — walker enemies only reverse at the
screen edge, never probe the tile ahead, so they walk through walls instead
of turning around (bug 30).

### F11 — D, 2026-05-12 — 🐛 broken
> "My game keeps crashing! =("

Duplicate of F2. → **REPRO** (bug 37).

### F12 — D, 2026-05-08 — 🐛 broken
> "It froze because the keyboard arrows connected to the website not the
> emulator."

→ **VERIFY**: both Backgrounds (`index.html`) and Sprites (`sprites.html`)
now bail their page-level key handler while the emulator dialog is open, and
the shared emulator owns its own listeners.  Confirm no page still leaks
arrows (bug 36).

### F13 — A, 2026-05-08 — 🐛 broken
> "My emulator froze for some reason, i tried it twice but it froze for no
> reason. =["

→ **REPRO**: generic freeze.  The OAM-overflow guards from the June sweep
cover most loops; the in-browser emulator still has no watchdog around the
jsnes frame loop (bug 37).

### F14 — DD, 2026-05-05 — ✨ feature
> "Could you please add more colours please. =)"

→ **HW-LIMIT**: the editor already exposes the full 64-entry master palette
and all four BG + four sprite sub-palettes — that's the entire NES colour
capability.  Action is an in-editor explanation, not more colours.  See R-5.

### F15 — K, 2026-05-01 — 💭 general
> "I like NES, its very good! good job"

→ **NONE** — praise.  Pass it back to the pupil. :)

### F16 — T, 2026-05-01 — 🐛 broken
> "when you try to make a jump animation it does another animation as the
> jump animation"

→ **OPEN**: `_resolve_animation` in `playground_server.py` silently drops
animation frames whose sprite size differs from the player's, emitting
`JUMP_FRAME_COUNT 0`; the engine then falls back to the **walk** animation
in the air.  No prominent editor warning for the jump case (bug 38).

### F17 — K, 2026-05-01 — ✨ feature
> "can you add so you can adjust your or a sprites speed."

→ **PARTIAL**: player walk speed + the Globals module already ship; *per-
sprite/enemy* speed does not (same gap as F8).  See R-4.

### F18 — K, 2026-05-01 — ✨ feature
> "Can you add when the player gets hit a sprite dose a animation that
> stays."

→ **NEW** (Medium): a persistent hurt/effect sprite on hit — needs the spawn
machinery (R-3) plus non-player animation (T2.10).  See R-6.

### F19 — K, 2026-05-01 — ✨ feature
> "Can you add so when you press a button you can do a animation."

→ **NEW** (Medium): no module binds a controller button to an animation;
animation state is movement-driven only.  Kin to T2.4 "press to fire".
See R-7.

### F20 — A, 2026-05-01 — ✨ feature
> "make checkpoints work"

→ **NEW** (Medium): there is no checkpoint/respawn at all — on death the
damage module just freezes the screen.  ("make … work" probably reflects
seeing the Doors spawn-point and expecting mid-level checkpoints.)  See R-8.

### F21 — A, 2026-05-01 — ✨ feature
> "Copy and paste background elements"

→ **NEW** (Medium): the Backgrounds page has *fill* and single-tile *pixel*
copy, but no marquee region select + paste of placed tiles.  See R-9.

### F22 — D, 2026-05-01 — ✨ feature
> "Option to make character bob when walking."

→ **NEW** (Quick): a 1px sprite-Y nudge on the walk-animation tick, gated by
a toggle.  No NES constraint.  See R-10.

### F23 — A, 2026-04-29 — 🐛 broken
> "Dialogue is broken. Tried to add letters onto the ASCII tiles but alas,
> it just glitches the stage for a split second instead."

→ **OPEN**: same family as F1b.  Dialogue renders text as raw ASCII tile
indices and only looks right if the project's tilesheet has glyph tiles at
0x41–0x5A; the brief "glitch" is the render-off window + single-background
clear-restore (bug 31).

### F24 — A, 2026-04-28 — ✨ feature
> "Can you add an infinite runner feature pls. =)"

→ **NEW** (Architectural): this is the planned **T3.4** Geometry-Dash-style
auto-scroll mode — design-note-first.  See R-11.

### F25 — M, 2026-04-25 — 🐛 broken
> "Bug #2: I am sure this bug is already known about but when I run the game
> from 'Backgrounds' the movement keys also navigate through the tileset. I
> think this is what's causing my game to not run smoothly."

→ **VERIFY**: same keyboard-focus issue as F12; guards now exist on both
pages.  Confirm closed on Backgrounds specifically (bug 36).
