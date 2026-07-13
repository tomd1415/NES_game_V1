# Recent bugs and feature requests

1. Have a fill option for the background tile
2. The 'door' or any movement to a new background when there are more than screen in the background
appears to get confused and show the wrong background for one of the screens.
   *FIXED 2026-07-10 (engine v63).* Was reproduced on FCEUX: a door from a
   2-screen bg0 to a 2-screen bg1 loaded bg1's visible screen but showed **bg0's**
   tiles on bg1's second screen (a control test starting *in* bg1 rendered both
   its screens correctly, so bg1's data was fine — the *transition* broke it).
   **Root cause:** `scroll_stream()` fetches from `bg_world_tiles[]`, a fixed
   compile-time array = the *starting* room, which `load_background_n()` does not
   swap on a door (it swaps the nametables T2.1 and behaviour map T2.2), so the
   streamer re-streamed the old room over the door-loaded destination.
   **Fix (v63):** a multi-bg door build within 2×2 now **skips the streamer** —
   `load_world_bg`/`load_background_n` already blit the whole room into all four
   nametables from the per-bg `bg_nametable_<n>` data, so the camera only pans
   (`scroll_apply_ppu`); streaming was redundant there. This also handles
   differently-sized rooms (each loaded by its own `bg_nametable_<n>`) which a
   `bg_world_tiles` pointer-swap would not, and is guarded so a >2-screen
   *selected* room keeps its streamer. Gated behind `BW_DOORS_MULTIBG_ENABLED` +
   `SCROLL_BUILD` → non-multi-bg byte-identical. FCEUX-confirmed the door
   destination now renders correctly on both screens.
3. When the there is a jump to a different background, sometimes the the 'behaviour blocks' are from the
wrong background.
   *FIXED 2026-07-10 (engine v63) — same fix as item 2.* T2.2 already swapped the
   behaviour *map* on a door (collision followed the room), but the streamer
   re-streaming the old room's *tiles* (item 2) meant the visible tiles and the
   behaviour map could disagree. Skipping the streamer for multi-bg (item 2's
   v63 fix) keeps both in sync — the room the pupil sees is the room they
   collide with.
4. Please find NES game creation resources and reference them to help.
   *Done:* curated in [`docs/reference/nes-resources.md`](../reference/nes-resources.md)
   (NESdev wiki frame/NMI/PPU/scrolling, cc65, FamiStudio, etc., each with a
   one-line "what it answers"), anchored by the codegen/architecture review.
5. Convert more parts of the C code for game creation into assembly as last time this was done there
was a massive improvement.
6. Add more to the builder, including more fine tuning and the ability to be more specific to individual sprites and areas on the game. Have the ability to change the speed of the jump.
   *Jump-speed done + verified 2026-07-11.* The 🎮 Style tab exposes **Jump speed**
   (globals `jumpSpeedPx`, drives `BW_APPLY_JUMP_RISE`), **Jump height**, **Walk
   speed** and **Gravity**. New `builder-tests/physics-globals.mjs` proves it
   behaviourally: js=2 lifts the player 32px, js=6 lifts 84px (jsnes OAM), plus
   codegen + clamp + byte-identical-when-off. (Broader per-sprite/area fine-tuning
   remains open.)
7. Include default sound fx in the audio section.
8. Allow the user to set the default tempo for the audio and the ability to trigger tempo changes.
9. Fix scrolling errors in vertical and 2 by 2 backgrounds.
   *Confirmed fixed 2026-07-10 (engine v62).* A 2×2 world now scrolls seamlessly
   across all four nametables in both axes — FCEUX + jsnes verified: the two
   screen seams render as one clean full-height column / full-width row, scroll
   the correct direction, stay put with no jitter (consecutive frames identical),
   and the world edge stops the player instead of drifting into garbage. Guarded
   by `tools/builder-tests/scroll-2x2.mjs` (drives the camera across both seams
   and asserts they render + stream correctly), on top of `four-screen.mjs` (the
   iNES 4-screen bit). See also items 2/3 for the *door-transition* room-load,
   which is a separate concern from the scroll core.
10. Enable scrolling platform games to go beyond 2 screens (research how far we can make these go)
    *Done 2026-07-11 (engine v64/v65 + editor).* WORLD now has **➕ Add a screen**
    arrows (◀▶▲▼) that grow the level one screen at a time in any direction
    (▶/▼ extend, ◀/▲ push the level over and shift the art/entities). **How far:**
    the engine already scrolled up to **8 screens** wide (256 cols) with no
    change; a raw ~1KB/screen tile array then overflows NROM's 32KB PRG. So wide
    1-tall levels are **column-deduplicated** (repeated sky/floor/blocks collapse
    to a unique-column table + a 1-byte index), decoded by both the C and ASM
    engines, letting levels reach **~12 screens** (the editor cap; further is
    ROM-limited by the level's unique-column count). **Vertical** scroll stays
    capped at **2 screens** (a hard engine limit — a follow-up if wanted). Guarded
    by `builder-tests/scroll-wide-compressed.mjs` (C≡ASM nametables past screen 8)
    + `studio-tests/world-grow.spec.js`. Truly full-SMB-*game* scale (many long
    levels) would need a bigger mapper — a separate effort. Engine changelog v64
    (format+C) / v65 (ASM).
    *Follow-up fix 2026-07-11:* a wide level too **varied** to compress (>8
    screens with ≥256 distinct columns, more than a 1-byte index can hold) used
    to crash `/play` with a Python `ValueError` → HTTP **500** and no game. The
    server now (a) counts unique columns without overflowing and (b) rejects the
    un-fittable case up front with a clear, kid-readable message ("too big / too
    many different-looking columns — make it shorter or reuse repeated
    sections"). Guarded by `builder-tests/scroll-wide-too-varied.mjs`. Server-only
    (`playground_server.py`); no ROM-output change, goldens byte-identical.
    *Follow-up fix 2026-07-11 (engine v66):* a pupil reported a **5-8 screen
    detailed** level failing to build (`ld65: RODATA overflows ROM0 by 5950
    bytes`) — compression only engaged **above 8 screens**, so a shorter but
    detailed level got no help and overflowed on the raw path. v66 widens
    compression to **any 1-tall multi-screen level** (`cols>32`) that packs down
    (dedup fits a 1-byte index AND is smaller than raw); 1-screen stays raw
    (byte-identical). Also made the dialogue box-restore read compression-aware
    (`builder-modules.js`) and turned the raw `ld65` overflow into a
    kid-readable "your game is too big + how to slim it" message shown in a
    Studio modal (`studio.js`). Guarded by `scroll-narrow-compressed.mjs`
    (6-screen C≡ASM). Goldens `1730448e` + `_rom-equiv` `0aed6e95` unchanged.
    **NB the live site runs on a separate host — it needs `main` deployed + the
    Python server restarted to pick this up.**
11. Add the ability to make a 'Geometry Dash' style game. This has been requested by many of the younger pupils and making this as easy as possible would be very helpful.
    *Largely covered:* the **runner** style is an auto-scroller with tap-to-jump
    and an instant restart when the player touches a spike tile — the Geometry
    Dash core loop. It has a starter + tutorial. A dedicated "Geometry Dash"
    preset name / obstacle-pack could still make it more discoverable for the
    younger pupils (nice-to-have, not a missing capability).
12. Add an option for a top down racing game (like the classic Micro Machines game).
13. More options for enemy paths.
    *Extended 2026-07-06 (v10: flyer + patrol), 2026-07-11 (v11: goomba/koopa
    stomp), and 2026-07-13 (**v71: hopper** — walks + turns at walls AND bounces
    on a set rhythm; **v72: shooter** — a stationary turret that fires a projectile
    toward the player, reusing the firing enemy's own tile as the shot; the shot
    hurts on contact when the Damage module + Max HP are on).* The WORLD **AI**
    dropdown now offers static / walker / chaser / goomba / koopa / item / flyer /
    patrol / hopper / shooter per enemy, each gated to its engine and degrading to
    a walker on older targets. Guarded by `flyer-patrol.mjs` + `hopper-enemy.mjs`
    + `shooter-enemy.mjs`. Further paths (chaser variants, homing, etc.) remain
    open but the pupil ask for "more enemy paths" is well covered now.
14. Currently the user can only place enemies and players on the first screen of the first background they should be able to do that for all screens in all backgrounds.
    *Partially resolved 2026-07-06:* the World-dock **place/move tool now works
    across every screen** of a scrolling background — entity coordinates are
    world-space (screen-local click + view offset), clamped to the whole
    `worldCols×worldRows`, and the overlay culls entities off the shown screen
    (the engine already supported world-pixel scene sprites — `scene-multiscreen.mjs`).
    Still open: scene instances are **not yet per-background** (one shared scene
    list across all `backgrounds[]`), so "different enemies per room" needs a
    per-bg scene model + codegen change — tracked as a follow-up.
15. There is currently no way for a player to kill an enemy, we should add some options like jumping on top of enemy or shooting etc.
    *Status 2026-07-06:* the **SMB style already has both** — stomp (goomba/koopa
    `ai`, engine v4) and fireballs (shooting). What's missing is a **stomp for
    the plain platformer** (walker/chaser/flyer/patrol enemies). Design sketch
    for that (a future engine bump): gate a "jump on enemies to defeat them"
    flag; in the scene-AI per-instance block, after moving enemy `i`, if the
    player's AABB overlaps it AND the player is descending (`jumping` &&
    `jmp_up == 0`) with its feet above the enemy's top + a small margin, set
    `ss_y[i] = 0xFF` (defeat) and give a short upward bounce via the basic jump
    vars (`jumping = 1; jmp_up = BOUNCE_FRAMES`); otherwise leave it for the
    Damage module to hurt.
    *Resolved 2026-07-06 (engine v11):* shipped as a **Damage-module option**
    "Jump on enemies to defeat them" (+ tunable bounce height). Falling onto an
    enemy from above (not rising, feet within 8px of its top) defeats it (parks
    at `y=0xFF`) and bounces the player; side/below touch still hurts.
    Platformer only, emitted `#ifdef BW_STOMP_DEFEAT` so OFF is byte-identical.
    The basic `chaser` AI got a parked-guard so a stomped chaser can't crawl
    back on screen. Behavioural test `stomp-basic.mjs` (ON defeats + bounces,
    OFF leaves it alive). **Feel constants (margin 8px, bounce 12) have sensible
    defaults but want an attended playtest to fine-tune.** Shooting (the other
    suggestion) already exists in the SMB style (fireballs).
16. The pallets on the background and for the sprites sometimes do not match what they should be and the ones that are selected are not always represented.
    *Verified correct 2026-07-13 — not reproducible in the Studio.* Audited all
    three steps of the reproduction card: **(B) mapping** — the render pipeline
    maps the *selected* slot to the right pixel value (pixel 0 = backdrop /
    transparent; pixel N = `slots[N-1]`) for both bg and sprite palettes, with no
    off-by-one; **(A) persistence** — the picked colours survive save + reload;
    **(C) ROM** — already guarded by `builder-tests/palette-render.mjs`. New
    `tools/studio-tests/palette-fidelity.spec.js` locks A + B. The report predates
    the Studio redesign (it was filed against the legacy Sprites/Backgrounds
    pages); the Studio's PALS editor + shared `NesRender` pipeline are consistent
    end-to-end. The one case where a *selected* palette legitimately isn't shown
    is the NES **2×2-attribute limit** (a whole 16-px block shares one palette) —
    which the WORLD editor already flags with a red conflict overlay.
17. Make it clearer to the user that the sprite animation is being used and allow for enemies and pickups etc. to have animations.
    *Resolved 2026-07-06:* the engine + server already baked role-tagged scene
    animations (`ANIM_ENEMY_WALK/IDLE`, `ANIM_PICKUP_IDLE` — see
    `round1-polish.mjs`), but the CHARS "+ New" animation button always created
    a **player** animation, so enemies/pickups could never get one. Now "+ New"
    tags the animation for the **selected character's role** (enemy → enemy/walk,
    pickup → pickup/idle, else player+auto-wired-walk), and each animation row
    shows a `role·style` chip so it's clear which character an animation drives.
    E2E in `chars.spec.js`.
18. When the user selects to duplicate the sprite it should duplicate the sprite's tiles for the new sprite as well so that the duplicated sprite can be edited without affecting the original sprite.
    *Resolved 2026-07-06:* the CHARS **Duplicate** button now allocates fresh
    sprite-tile slots for the copy (one per distinct source tile, preserving the
    sprite's internal tile reuse; the blank tile 0 stays shared, and it falls
    back to sharing only if the 256-slot pool is full). Editing the copy no
    longer touches the original. Covered by `chars.spec.js` ("duplicating a
    character forks its tiles so the copy is independent").
19. There should be an option to add a pixel grid to the top view of the sprite (just like the one on the individual tile of the sprite.)
    *Satisfied in the Studio (2026-07-06 audit):* the CHARS whole-sprite editor
    (`studio-chars.js` `onRenderOverlay`) always draws a per-pixel grid **plus**
    brighter cell/tile boundaries over the assembled metasprite — exactly the
    "top view + pixel grid" asked for. This was a gap on the **legacy** Sprites
    page only, which is now secondary to the Studio.
20. On the behaviour editor the Sprite reactions box needs to be wider so I think it should be below the background window and therefore have a bit more width to help make it easier to use.
21. The triggers and doors on different places should be able to have different effects.
    *Satisfied (2026-07-06 audit):* the **per-door** module gives every door
    (keyed by background + tile x/y) its own `spawnX`/`spawnY` and `targetBgIdx`,
    so each door can send the player to a different spot and/or a different room.
    Covered by `perdoor.mjs` (two doors, different destinations).
22. There should be the ability to change variables that affect the whole game, like gravity and similar in the builder section.
    *Done + verified 2026-07-11 (Globals module, T1.6).* The 🎮 Style tab exposes
    game-wide physics knobs — **Gravity** (`gravityPx`, enemy fall via
    `BW_APPLY_GRAVITY` at `platformer.c:1789`), **Jump speed**, **Jump height**,
    **Walk speed**, walk-**Bob** — emitted as `#define BW_*` overrides that are
    byte-identical to the baseline when untouched. Now behaviourally guarded by
    `builder-tests/physics-globals.mjs` (jump-speed measurably changes jump height;
    codegen + clamping asserted).
    *Fixed properly 2026-07-11 (engine v67):* the sliders had only worked in the
    C-fallback — the shipped **ASM** player hardcoded jump budget/rise/fall, so
    pupils saw no effect. The ASM player now reads `JUMP_BUDGET` / `JUMP_SPEED` /
    `PLAYER_GRAVITY` from project.inc; **Gravity now moves the player too** (not
    just enemies: `PLAYER_GRAVITY = gravityPx + 1`), and Jump height/speed take
    effect on the real engine. Byte-identical at defaults (goldens + asm-ab/corpus
    unchanged); `physics-globals.mjs` now drives the DEFAULT ASM engine (js 2→6:
    28→84px, jh 8→24: 24→72px, gravity 1→4: player falls 16→40px). Runner + SMB
    keep their own fixed fall feel.
23. Very low priority -- make sure it is usable on tablets and mobiles eventually.
24. Add an optional user login system that saves the users work between computers and allows them to put their creations into the gallery and remove them, whereas without an account the user can only post to the gallery and not remove from the gallery unless there is a way to be sure that it was that user that posted it to the gallery.
25. The very first frame of the game that is used in the gallery is almost always just the background transparent colour and nothing else. A different way of generating the thumbnail for the gallery might be useful.
26. The top down code has not been tested as much as the platform based code so that will need updating with everything that was discovered in the platform builder code writing and then testing. All should be documented. Again the NES is a very old system so there are probably many solutions to these problems already you should carry out a detailed search for sources of information to aid in writing this application and a suitable way of recording the information needed.
27. It is not clear where the sound effects are linked to events or how to do that currently.
28. NPC dialogue is misbehaving in pupil projects.  Re-reported
    2026-04-27 — symptoms not yet captured in detail; please add to
    the diagnosis-notes section below when next observed (does the
    dialogue box not open at all, does it open with wrong text,
    does it freeze the game, does it lock player input, does it
    show stale text from a previous NPC, …?).
    *2026-07-06 audit — the font-tile class of bug is well-guarded now,*
    so a fresh symptom capture is needed before coding. The old "adding
    letters onto the ASCII tiles glitches the stage" report (feedback
    2026-04-29) is addressed: the server seeds a built-in uppercase font into
    **blank** bg slots only (preserving pupil art, `_seed_dialogue_font`); the
    Studio TILES view **marks the reserved glyph slots** (space/0-9/A-Z/a-z)
    with a `T` badge + a "reserved for text glyphs" banner when dialogue is on
    (`studio-tiles.js`); the `dialogueUnsupportedChars` validator warns on
    characters the font lacks; and a `run-all.mjs` guard keeps the font set, the
    editor marking, and the validator in sync. Existing behaviour is covered by
    `render-dialogue-box.mjs`, `dialogue-scroll.mjs`, `dialogue-font.mjs`,
    `round2-dialogue.mjs`. If dialogue still misbehaves, capture WHICH symptom
    (box/text/freeze/input) with the module config so it can be reproduced.
29. Vertical scrolling still not behaving as it should.  Originally
    item 9; re-reported 2026-04-27 — pupils are still seeing
    glitches in 1×2 / 2×2 backgrounds even after the multi-bg
    door bundle (T2.1 / T2.2 — those addressed *behaviour* and
    *which nametable bytes get loaded*, not the scroll engine
    itself).  Architectural fix is tracked as plan §T3.1.  Symptom
    detail still needed for diagnosis (jitter at the scroll
    boundary?  ghost row appearing 12 tiles above / below where
    it should?  visible top scanline mid-scroll?  player drifts
    past world bottom into garbage?).
    *Resolved — confirmed fixed 2026-07-10 (engine v62).* None of the listed
    symptoms reproduce: FCEUX + jsnes drives of a 2×2 world show seamless
    horizontal AND vertical scroll across all four nametables, clean seams, no
    jitter (byte-identical consecutive frames), and the world edge halts the
    player. Locked in by `tools/builder-tests/scroll-2x2.mjs`. (Sometime between
    the §T3.1 tracking and v62 the scroll core was corrected.) The remaining
    open scroll-adjacent items are the door/room-load ones (2/3) and going
    **beyond** 2 screens (10) — both distinct from this.

---

## Bug-reproduction card (template)

Copy this block into the diagnosis-notes section below when a new bug
is reported (or an old one is re-reported).  A filled-in card turns a
vague "it's broken" into something a future debugger can act on
without re-interviewing the pupil.  Leave blanks you genuinely can't
fill — an empty field is itself a signal of what to capture next time.

```
### Item <N> — <one-line title> (status: NOT YET REPRODUCED, <YYYY-MM-DD>)

- Reported by / when: <name or "anonymous"> · <date>
- Game style:         <platformer | smb | top-down | runner | racer>
- Engine version:     <state.engineVersion, e.g. 10>   (Engine button in Studio)
- Modules on:         <damage? dialogue? doors? pickups? scene? audio? …>

**What the pupil saw** (their words, verbatim if possible):
> <quote>

**Minimal repro** (fewest steps that still show it):
1. <step>
2. <step>
3. <step>

**Expected vs actual:**
- Expected: <…>
- Actual:   <…>

**Where it likely lives** (tick one after a first look, don't guess blind):
- [ ] Editor UI / state (studio-*.js) — wrong data saved
- [ ] Codegen (builder-modules.js / builder-assembler.js) — wrong C emitted
- [ ] Engine C template (builder-templates/*.c) — wrong runtime behaviour
- [ ] Server build (playground_server.py) — build/link/asset step
- [ ] Render only (sprite-render.js) — editor preview ≠ ROM

**First observation** (run the repro ONCE, record what you actually see —
OAM dump, a screenshot, the emitted C snippet, the server log tail):
> <observation>

Resolved <YYYY-MM-DD>: <commit ref>   (add on close; do not delete the card)
```

---

## Diagnosis notes

When fixing items below, rather than guessing at a cause, run a
small reproduction first and record what you see here.  This
section grows over time and is meant to be re-read; please do
**not** delete entries when an item is closed — leave the
diagnosis trail in place for future debuggers (just add a
"Resolved YYYY-MM-DD: <commit ref>" line at the bottom of the
relevant sub-entry).

### Item 16 — palette mismatch (status: VERIFIED CORRECT in the Studio, 2026-07-13 — see item 16 above + palette-fidelity.spec.js)

The reported symptom is "the palettes on the background and for
the sprites sometimes do not match what they should be and the
ones that are selected are not always represented."  Three
distinct things this could mean, each with a different fix
location.  Run each step and record the outcome here before
writing code.

#### Step A — selected-palette UI persistence

1. Open the Sprites page.
2. Click sprite palette index 2 to select it.
3. Save the project (or wait for autosave).
4. Reload the page.

**Question:** does palette 2 still show as the active selection
after reload?

- [ ] Outcome (Sprites page): _____
- [ ] If broken: storage round-trip likely.  Inspect
      `state.spritesActivePaletteIdx` (or equivalent) before /
      after save.

5. Repeat Steps 1-4 on the Backgrounds page with BG palette
   index 2.

- [ ] Outcome (Backgrounds page): _____

#### Step B — palette display on the canvas

1. Open the Backgrounds page.
2. Set BG palette 0 to known colours: e.g. `0F`, `30`, `15`, `27`.
3. Place tiles using palette 0 onto the canvas.
4. Open the Sprites page (still same project).
5. Set sprite palette 0 to a different recognisable set: e.g.
   `0F`, `12`, `27`, `30`.
6. Place a multi-tile sprite using sprite palette 0.

**Question:** do the colours that *render* on each canvas match
the palette values you picked, or do they show stale / wrong
hues?

- [ ] BG canvas matches BG palette 0: _____
- [ ] Sprite canvas matches sprite palette 0: _____
- [ ] If broken: probably a render-side bug in
      `sprite-render.js` looking up the wrong palette index.

#### Step C — runtime ROM render

1. Set both palettes to the recognisable values from Step B.
2. Open the Builder page.
3. Click ▶ Play in NES (browser mode is fine).

**Question:** in the running ROM, do BG and sprites use the
expected colours?

- [ ] Outcome: _____
- [ ] If broken but Step A and B were OK: assembler-side bug.
      Check `builder-assembler.js` palette emit and
      `playground_server.py` palette `.inc` writer.

#### Triage matrix (fill in once Steps A/B/C are done)

| Step A | Step B | Step C | Likely fix location |
| ------ | ------ | ------ | ------------------- |
| ❌ | — | — | Storage round-trip (`storage.js`) |
| ✅ | ❌ | — | Editor render (`sprite-render.js`) |
| ✅ | ✅ | ❌ | Assembler emit (`builder-assembler.js` / `playground_server.py`) |
| ✅ | ✅ | ✅ | Cannot reproduce — ask reporter for steps |

Until at least one step has been run, **do not start writing a
fix.**  See plan §T1.8 for the rationale (avoids burning a
session on a phantom case).

**Findings 2026-07-06 (Steps B + C run):**

- **Step C — ROM render: ✅ FAITHFUL, not reproduced.** A new headless
  test (`tools/builder-tests/palette-render.mjs`) builds a project whose
  4 BG + 4 sprite palettes each hold distinctive, all-different NES colour
  indices and asserts the emulator's palette RAM (`$3F00-$3F1F`) matches
  exactly — all 8 palettes load byte-for-byte, byte 0 of every group being
  `universal_bg`. So the assembler emit + server `.inc` writer are correct;
  a mismatch is **not** on the ROM path.
- **Step B — editor render: ✅ code path is correct on inspection.**
  `sprite-render.js` `spritePaletteFor(state, cell.palette)` /
  `bgPaletteFor(...)` map `slots[0..2] → slot1..3` with `slot0 = universal_bg`
  (bg) / transparent (sprite), keyed off the **cell's own** palette index —
  i.e. it looks up the right palette, contradicting the card's "wrong index"
  hypothesis. Not yet driven with a live pixel-compare in the browser.
- **Remaining suspect — Step A (which palette is the *active selection*).**
  The colour *values* persist (they live in `state.bg_palettes` /
  `sprite_palettes`, saved with the whole project). What may not persist is
  the *highlighted* palette index in the editor UI — a cosmetic
  "selection not remembered" issue, not a colour-correctness one. Needs a
  browser repro (select palette 2, reload, is it still active?).

Net: this reads as **"cannot reproduce a colour mismatch"** (matrix row 4) at
the data/ROM level — likely the reporter saw the active-selection reset (Step A)
or the old shared-tile aliasing (now fixed, see item 18). Kept open pending a
live Step-A/B pixel repro, but downgraded from a correctness bug.

### Item 28 — NPC dialogue (status: NEEDS DETAIL, 2026-04-27)

User reported the dialogue is "still playing up" without a more
specific symptom.  Capture below when next observed so the next
session can triage rather than chase.

#### Item 28 — Reproduction questions

- [ ] **Game style?** *(platformer / top-down)*: _____
- [ ] **Is the dialogue Builder module ticked?** *(check the
      Builder page → Dialogue)*: _____
- [ ] **Is there at least one NPC sprite tagged with `role: npc`
      on the Sprites page?**: _____
- [ ] **What's the dialogue text in the module config?**: _____
- [ ] **Multi-line (BW_DIALOG_ROW_COUNT > 1) or single-line?**: _____
- [ ] **Per-NPC override text on any scene instance?**: _____

#### Item 28 — Behavioural questions

- [ ] Does the dialogue box appear at all?  *(yes / no / sometimes)*
- [ ] If yes, is the text correct, or is it text from a different
      NPC, or garbage tiles?
- [ ] Is player input locked while the box is up, or does the
      player keep moving?
- [ ] Does pressing B again close the box, or is it stuck open?
- [ ] Does the bug show in the in-browser jsnes preview, the
      *Local (fceux)* mode, or both?

#### Item 28 — Likely fix locations

| Symptom | Where to start |
| ------- | -------------- |
| Box never opens | `platformer.c` dialogue trigger block (search for `BEHAVIOUR_NPC` / `bw_dialog_cmd`) |
| Wrong text per NPC | `bw_dialogue_text_table` emission in `playground_server.py` and per-instance override path in `builder-assembler.js` |
| Garbage tiles | font-tile convention (see `BUILDER_GUIDE.md` §dialogue) — pupil's project may not have the dialogue font tiles painted |
| Game freezes | `vblank_writes` slot — dialogue draw is per-row across multiple vblanks, may be hanging |

Until a real symptom is captured, **don't start writing a fix.**

### Item 29 — Vertical scroll glitches (status: NEEDS DETAIL, 2026-04-27)

T2.1 / T2.2 (multi-bg door bundle) were *not* about scrolling — they
fixed the *what nametable bytes get loaded post-door* path.  The
scroll engine itself (`scroll.c`) is the area to examine for this
item.  T3.1 in the plan tracks the architectural work; this entry
captures the symptoms pupils are seeing right now so when T3.1 starts
we have real reproduction data.

#### Item 29 — Reproduction questions

- [ ] **World shape?**  *(2×1 horizontal-only, 1×2 vertical-only,
      2×2)*: _____
- [ ] **In-browser preview, FCEUX, or both?**: _____
- [ ] **Is iNES 4-screen mirroring enabled?**  Hex-dump byte 6 of
      the ROM — bit 3 should be set for any project that scrolls
      vertically: _____

#### Item 29 — Behavioural questions (tick all that apply)

- [ ] Tear / flicker at the scanline where the scroll boundary
      sits.
- [ ] Ghost row appears ~12 tiles above or below where the camera
      is — classic "PPU scroll register set after the T→V copy
      window" symptom.
- [ ] Stale tiles from before the camera moved persist in the
      newly-revealed region.
- [ ] Player can walk past the world bottom edge into garbage
      tiles (collision wrong on the boundary screen).
- [ ] Other: _____________

#### Item 29 — Likely fix locations

| Symptom | Where to start |
| ------- | -------------- |
| Tear / flicker at boundary | `scroll.c`'s `scroll_apply_ppu` ordering + `scroll_stream` row burst |
| Ghost row 12 tiles offset | scroll-stream timing — check `scroll_stream_prepare` / `scroll_stream` cycle budget vs vblank end |
| Stale tiles in newly-revealed region | row burst in `scroll_stream` may not fire; check the `prev_cam_y` boundary-crossing logic |
| Wrong collision past world edge | `behaviour_at()` bounds in `behaviour.c` — `world_row >= WORLD_ROWS` check should already reject, confirm it does |

T3.1 in the plan is the umbrella architectural task; this entry
captures what pupils are seeing *today* so the spike at the start
of T3.1 has real failure cases to chase.

---

## Codebase-wide bug sweep — 2026-06-15

A multi-agent review of the whole platform (Python build server,
browser editor, NES C/asm engine, pupil example code) surfaced 57
verified defects.  51 were fixed this session; 5 are deferred (see
below).  The full `tools/builder-tests/run-all.mjs` suite stays
green, including the byte-identical-ROM invariant, after every fix.

### Vertical / 2×2 scrolling + palette glitches (items 9, 16, 29)

Three separate root causes, now fixed:

- **`scroll.c` `scroll_apply_ppu`** used a 256-px vertical
  nametable boundary (`cam_y & 0x100`) and wrote an illegal
  Y-scroll of 240–255.  NES nametables are 240 px tall — the
  bottom screen was never selected and rendered garbage.  Now
  folds `cam_y` into a 0–239 offset + a 240-px band whose low bit
  selects NT2.
- **`scroll.c` `scroll_stream_prepare`** row streamer used mod-32
  row maths (`(row & 0x20)`, `(row & 0x1F)*32`), writing tile rows
  into the **attribute table** ($23C0+) and the wrong NT row as the
  camera scrolled down — corrupting palettes.  Now maps rows 0–29 →
  NT0 and 30–59 → NT2 to match `load_world_bg`.
- **`playground_server.py` `_world_nametable`** sized the world
  attribute table as `(rows+3)//4` rows, so a 1×2 / 2×2 world's
  bottom screen read **past the array end** and from mis-aligned
  rows → wrong palettes.  Now emits a full 8-attr-row band per
  screen, each derived from that screen's own tile rows.  Verified
  byte-identical for 1×1 and 2×1 worlds (the baseline test still
  passes); only the previously-broken 1×2 / 2×2 layouts change.

Within the 2×2 cap `load_world_bg` pre-loads every visible
nametable, so with the three fixes above the streamer only ever
re-writes already-correct data into the correct NT.  Resolved for
all worlds the editor can currently produce.

### Player teleport on vertically-scrolled screens (multi-bg / tall worlds)

`main.c` / `platformer.c` truncated world-Y to 8 bits in the
landing snap (`py = (unsigned char)(...)`) and in the ladder
climb temporaries (`unsigned char new_top/new_foot`), teleporting
the player to the top of the world once `py > 255`.  Now computed
in `pxcoord_t` (u16 under `SCROLL_BUILD`, u8 otherwise → still
byte-identical on 1×1).  Player 2's landing snap fixed the same way.

### Other engine fixes (`main.c` + `platformer.c`, kept byte-identical)

- **OAM overflow**: the scene-sprite / HUD / animated-sprite OAM
  fill loops wrote with no upper bound, scribbling past the
  256-byte `oam_buf` into adjacent RAM when a scene exceeded 64
  hardware sprites.  Each 4-byte group is now guarded.
- **Dialogue snap** (item 28, partial): `draw_text` / `clear_text_row`
  unconditionally reset `PPU_SCROLL` to 0, jerking the camera to
  the world origin every dialogue frame on scrolling games.  Now
  restore the camera via `scroll_apply_ppu()` under `SCROLL_BUILD`.
  (Text still lands in NT0 fixed coords — making it follow the
  camera in a scrolled view is left for the dialogue rework.)
- **Multi-tile scene-sprite gravity**: gravity probed only the left
  foot column, so wide sprites fell through platform edges; now
  probes both columns like the player.
- **Doors to backgrounds 4–9**: `load_background_n` only had
  `case 0..3`, so doors targeting rooms 4–9 silently loaded room 0;
  added the missing `#if BG_COUNT > N` cases.

### Editor / tools / pupil-code fixes (highlights)

- **Code page "Play in NES" was completely broken** — it fed jsnes
  a base64 string instead of ROM bytes, so every browser run threw
  "Not a valid NES ROM" (`code.html`).
- Code-page redirect read a deleted legacy storage key, always
  bouncing pupils with custom C back to the Builder (`code.html`).
- Background delete/duplicate didn't remap door targets; switching
  to a size-mismatched background crashed the renderer; rename
  flooded the undo history (`index.html`).
- Sprite duplicate/delete now keeps `behaviour_reactions`
  index-aligned; undo mid-drag no longer re-stamps lifted pixels
  (`sprites.html`).
- Doors starting on a non-zero background (`builder-modules.js`);
  HP=0 co-op validator false positive (`builder-validators.js`);
  emulator audio pitch / sample-rate mismatch (`emulator.js`).
- Python: leading-zero palette parse crash (`tile_editor.py`),
  destructive `png2chr --into`, CHR padding, FamiStudio song
  diagnostics, `/play` body-size cap, attribute-table `None`
  deref (`playground_server.py`).
- Snippets that referenced an undefined `ground_y` and never
  compiled; `wrap-screen` double-wrap; CHR-copy pointer bug in
  `graphics.s`.

### Deferred (tracked, not fixed this session)

- **Beyond the 2×2 cap** — the scroll *streamer* (mid-game column/
  row fetch, attribute streaming, per-bg tile swap after a door)
  is still incomplete for worlds larger than 2×2.  This is the
  plan's T3.1 / T3.2 architectural work; the fixes above make
  everything ≤2×2 correct, which is all the editor can produce
  today.
- **`screen-shake-on-landing` snippet** — needs a shared shake
  offset the engine consumes in its post-vblank scroll write;
  deferred to avoid threading engine state through the
  byte-identical baseline for a cosmetic effect.
- **`Step_Playground/cfg/nes.cfg` CHR-bank/header mismatch** — the
  ROM declares 8 KB CHR but emits 16 KB (8 KB of it the unused
  NESfont).  The ROM runs in every emulator/flashcart we use; a
  conformance clean-up (drop NESfont or correct the header byte)
  is lower-value than the link/crt0 risk, so deferred.

---

## Web-form feedback bugs — 2026-06-17 (items 30–38)

Filed from the in-editor *💬 Leave feedback* form (the live
`/feedback` viewer), which had never been transcribed into the repo.
Full verbatim quotes + per-item triage are in
[`web-feedback-2026-06.md`](web-feedback-2026-06.md); the fix plan is
[`../plans/current/2026-06-17-web-feedback-fixes.md`](../plans/current/2026-06-17-web-feedback-fixes.md).
Root causes below were verified against the current code on 2026-06-17.

30. **Enemy sprites pass through solids and through each other; jitter
    "one to the side".**  (Feedback F1a + F10, reporter K.)  Walker /
    chaser AI in `tools/tile_editor_web/builder-modules.js` (`scene`
    module, lines ~409–434) steps `ss_x`/`ss_y` by a hard-coded `+= 1`
    and **never calls `behaviour_at()`**, so enemies ignore
    SOLID_GROUND / WALL / PLATFORM.  Walkers only reverse at the
    *screen edge* using a literal `255` (should be `WORLD_W_PX`), which
    also causes the one-pixel jitter for a sprite spawned near the
    right edge.  No enemy-vs-enemy test at all.  The "don't bounce off
    block" half (F10) is the same missing-`behaviour_at()` gap.
    **Resolved 2026-06-17:** walker + chaser AI now probe the leading
    edge across the sprite body via a shared `bw_sprite_blocked()`
    helper (emitted once into the `declarations` slot), reversing
    (walker) / stopping (chaser) at SOLID_GROUND / WALL tiles and the
    screen edge instead of walking through them.  The literal `255`
    screen clamp was kept (correct — `ss_x` is a u8 single-screen
    coord, not a world coord).  Guarded in `run-all.mjs`; byte-identical
    baseline unaffected (helper only emits when an enemy moves).
    Enemy-vs-enemy overlap remains a follow-up (needs an AABB pass).
    Plan §B-1.

31. **NPC dialogue glitches the stage, especially on gallery projects.**
    (Feedback F1b + F23, reporters K and A.)  Dialogue draws text as
    **raw ASCII tile indices** (`A` = 0x41 …) and restores cleared rows
    from `bg_nametable_0[]` only.  A gallery-loaded project usually has
    no glyph tiles painted at 0x41–0x5A, so the box shows garbage; the
    "split-second glitch" is the `PPU_MASK = 0` render-off window in
    `draw_text` plus the single-background clear-restore (it always
    reads bg 0, not the current room).  See `platformer.c`
    `draw_text` / `clear_text_row` and the `vblank_writes` dialogue
    block in `builder-modules.js`.  This is the still-open half of the
    long-standing **item 28**.  **Garbage half resolved 2026-06-18:** the
    server now ships a built-in UPPERCASE 8×8 font (`_DIALOGUE_FONT`) and
    `build_chr()` seeds it into the *blank* bg tile slots at their ASCII
    indices whenever dialogue is on, so dialogue renders real letters with
    no painting (pupil art in an occupied slot is preserved); the assembler
    uppercases text at emit so lowercase input matches, and the old
    `dialogue-no-font` warning became `dialogue-unsupported-chars`.  Verified
    by `dialogue-font.mjs` (inspects the built ROM's CHR).  **Scrolling
    visibility resolved 2026-06-18 (was item 11):** a pupil with a multi-screen
    background saw the box open but no text — the dialogue drew to *fixed* NT0
    coords, which fall off a scrolled screen.  The vblank draw now anchors to
    the live camera under `#ifdef SCROLL_BUILD` (world tile `(cam_x>>3)+col,
    (cam_y>>3)+row`; nametable flip at col 32 / row 30; restore from
    `bg_world_tiles[]`); `pauseOnOpen` keeps the camera still while open.
    Verified by address math (on-screen x 12 vs the old off-screen −156) +
    `dialogue-scroll.mjs` (2×1 compile) + round2 A9b.  **Still deferred (minor):**
    the brief forced-blank flash when the box opens (the vblank `PPU_MASK=0`
    window) — cosmetic, part of the frame-model rework (codegen plan Sprint 5).
    Plan §B-2; codegen plan `2026-06-18-codegen-rework-implementation.md`.

32. **Deleting the 2nd sprite animation appears to delete the 1st.**
    (Feedback F1c, reporter K.)  The delete handlers in `sprites.html`
    (`removeAnimFrame`, line ~4039; `btn-anim-del`, line ~4145) splice
    the *selected* item and read index-correct.  The suspicious line is
    the post-delete re-selection
    `selectedAnimId = state.animations[Math.max(0, idx - 1)].id`
    (≈4156): after deleting animation #2 it selects #1, which can *look*
    like the wrong one was removed.  **Do not fix blind.**  Status:
    **NEEDS REPRO** — capture the exact pupil steps (frame strip vs the
    animation list?  Which item was actually gone after?) below before
    any change.  Plan §B-3.

33. **Trigger / win freeze turns the whole screen green.**  (Feedback
    F5, reporter K.)  `win_condition` module freeze writes
    `PPU_MASK = 0x1F | 0x20` (= 0x3F) — the comment intends "greyscale +
    pale-red emphasis", but jsnes maps `(mask >> 5) & 7 == 1` to a solid
    **green** backdrop fill.  `builder-modules.js` ≈1305–1309.  The
    death tint `0x1F | 0x80` (= 0x9F) hits the same path → blue.  Fix:
    drop the greyscale bit (`0x1E | 0x20` for win, `0x1E | 0x80` for
    death) and confirm the tint in jsnes, which renders emphasis as a
    flat fill rather than an NTSC wash.  **Resolved 2026-06-17:** win
    freeze now emits `PPU_MASK = 0x1E | 0x20` and death `0x1E | 0x80` —
    dropping the greyscale bit (0x01), which is the bit that sent jsnes
    down its `f_dispType=1` screen-flood path.  With greyscale off the
    intended subtle red/blue emphasis renders correctly via jsnes
    `setEmphasis` and on hardware.  Verified against the jsnes source;
    `chunk-a-hp-hud.mjs` updated + a `run-all.mjs` guard added.  Plan
    §B-4.

34. **Collision feels "1 pixel across" when pressing Start.**  (Feedback
    F6, reporter K.)  The engine reads no Start/pause button anywhere,
    so the button can't move collision.  Most likely the one-time
    landing-snap (`platformer.c` ≈737 / `main.c` ≈487:
    `py = (foot_row << 3) - (PLAYER_H << 3)`) that rounds the player to
    a tile boundary on the first grounded frame, perceived as a shift on
    the first input.  The 8-bit truncation that *did* teleport tall
    worlds was fixed in the June sweep.  Status: **NEEDS REPRO** on
    FCEUX — is it the spawn snap or an emulator input artefact?  Plan
    §B-5.

35. **Enemy contact can kill the player instantly.**  (Feedback F9,
    reporter A.)  The current `damage` module (`builder-modules.js`
    ≈568–644) decrements HP by `DAMAGE_AMOUNT`, sets
    `player_iframes = INVINCIBILITY_FRAMES` (default 30) and only dies
    at HP 0, with an `else if (player_iframes > 0) iframes--` gate that
    blocks repeat hits — so one touch = one hit.  The report predates
    this i-frame handling.  Only still reproduces if a pupil sets
    *Invincibility frames* to **0** (schema `min: 0`), where every
    overlapping frame re-hits.  Status: **VERIFY**, then optionally
    raise the schema minimum to ~10.  Plan §B-6.

36. **Arrow keys drive both the page and the emulator (focus theft).**
    (Feedback F12 + F25, reporters D and M.)  Both page-level keydown
    handlers now bail while the emulator dialog is open — Backgrounds
    `index.html` ≈4374 and Sprites `sprites.html` ≈8546 both do
    `if (document.getElementById('emu-dialog')?.open) return;` — and the
    shared `emulator.js` owns its own window listeners.  The latest
    commit (`26fbb82` "running game from the sprite page") fixed a
    *different* bug (ROM byte-format); keyboard capture was resolved
    earlier.
    *Fixed properly 2026-07-13.* The legacy-page bails only stopped each
    page's *own* keydown logic — they never stopped the **browser's native
    arrow-key scroll**, and the Studio (`studio.html`, the primary UI) had no
    such bail at all, so playing there scrolled the page under the TV.  The
    shared `emulator.js` now calls `e.preventDefault()` on any key it maps to a
    pad button, so arrow keys (and Enter/Space) no longer do their browser
    default while the emulator is open — for **every** page that uses it. It
    skips the preventDefault while a text field is focused, so a pupil can still
    rename a project with the emulator open.  Guarded by `studio-tests/play.spec.js`
    (an ArrowDown is `defaultPrevented` while playing; a key in a focused input
    is not).

37. **"My game keeps crashing" / "emulator froze for no reason."**
    (Feedback F2, F11, F13; reporters D and A.)  Generic, no repro.
    OAM-overflow guards from the June sweep cover the scene-sprite and
    HUD fill loops, but the player / Player-2 OAM loops
    (`platformer.c` ≈999 and ≈1099) are **unguarded** (bounded by sprite
    size, so only a risk with a very large player), and the in-browser
    jsnes frame loop (`emulator.js` ≈287) has **no watchdog** — a
    malformed/oversized ROM or a tight vblank can hang it with no
    recovery banner.  Status: **NEEDS REPRO** + harden (bound the
    player loops; add a jsnes try/catch + frame-time watchdog).  Plan
    §B-10.

38. **A jump animation plays the walk (or another) animation in the
    air.**  (Feedback F16, reporter T.)  `_resolve_animation` in
    `tools/playground_server.py` (≈863–892) **silently drops** any
    animation frame whose sprite size differs from the player's
    `(PLAYER_W, PLAYER_H)` and returns `None` if none match, so the
    server emits `JUMP_FRAME_COUNT 0`.  The engine only plays the jump
    animation when that count `> 0` (`main.c` ≈538 / `platformer.c`
    ≈790) and otherwise falls through to `anim_mode = 1` (walk).  So a
    jump animation authored at a different sprite size plays as walk,
    with no prominent Sprites-page warning.  **Resolved 2026-06-17:**
    the Sprites page now shows a warning under the walk/jump assignment
    dropdowns when an assigned animation has frames that aren't the
    player size, naming how many will be skipped and why — so the silent
    drop becomes a fixable hint (`renderAnimationAssignments` /
    `animFrameSizeMismatch`).  Rendering a differently-sized jump pose
    in-engine stays a deferred enhancement.  Guarded in `run-all.mjs`.
    Plan §B-8.

### Item 32 — animation delete: reproduction questions

- [ ] **Which control?** the per-frame ✕ in the animation's frame strip,
      or the 🗑 *Delete* button on the whole animation?: _____
- [ ] **Starting state:** how many animations in the list, how many
      frames in the one being edited?: _____
- [ ] **Exact step:** click which item, then which delete?: _____
- [ ] **After:** which item was actually gone — the one clicked, or the
      first?  Was it gone from the *list* or just no longer *selected*?: _____
- [ ] Reproduces in a fresh project, or only this pupil's project?: _____

### Item 34 — collision-on-Start: reproduction questions

- [ ] **Emulator:** in-browser jsnes, FCEUX/local, or both?: _____
- [ ] **When exactly:** the very first frame after the game boots, or
      after pressing a specific button mid-game?: _____
- [ ] Does the shift happen once (settle after) or every time?: _____
- [ ] Game style (platformer / top-down) and player sprite size?: _____

### Item 37 — random crash/freeze: reproduction questions

- [ ] **Which page** was the game launched from?: _____
- [ ] Roughly how many sprites on screen (could it exceed 64 OAM)?: _____
- [ ] Does it freeze on boot, on a transition (door), or randomly?: _____
- [ ] Is audio enabled?  Does it freeze with audio off?: _____
- [ ] Same project every time, or different projects?: _____
