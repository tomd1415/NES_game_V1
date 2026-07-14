# Native Linux build plan — detailed implementation

**Status:** the build-out described here is **complete**. Every phase below has
landed. This document is now the record of what was built and why; the honest
list of what remains is §9.

## Progress (updated 2026-07-14)

| Phase | State |
| --- | --- |
| 0 — Triage | ✅ **Done** (`98f747f`) |
| 1 — Renderer | ✅ **Done** (`829eb9c`) |
| 2 — Play in the stage | ✅ **Done** (`08da14b`, `b37ff38`) |
| 3a — `DocumentStore` + undo everywhere | ✅ **Done** (`6e91e5c`) |
| 4a — Editors out of the CRT bezel; mode registry | ✅ **Done** (`ad8aa12`) |
| 5.1 — Project catalog + the 7 starters | ✅ **Done** (`eb396ff`) |
| 3b — Extract the modes into `ui/modes/` | ✅ **Done** |
| 4b — A dock per mode, app bar, `.qss` file, budget meters | ✅ **Done** |
| 5.2–5.11 — Validators → tutorial | ✅ **Done** |

`MainWindow`: **3,008 lines / 176 methods → 744 lines**, and it now owns **no
editor**. Tests: **214 → 363**, all green, ~4 minutes.

---

## 1. What was wrong, and what fixed it

The two root causes the original audit identified are both closed.

**Root cause A — there was no NES renderer.** Fixed in Phase 1 (`829eb9c`):
`render/` holds the real 64-entry NES palette (pinned to the web's by a contract
test), a framebuffer that honours the hardware rules, and `NesScreen`. All five
copies of the placeholder colour ramp and `_nes_colour_swatch()` are gone.

**Root cause B — `MainWindow` was a god object with no store.** The store half
landed in 3a. The god-object half is now closed too: eight modes live in
`ui/modes/`, the build and the emulator live in `ui/build_play.py`, and the File
menu lives in `ui/project_actions.py`.

### 1.1 Bugs found while doing the work, that were not on any list

1. **Every entity on the WORLD canvas was drawn with sprite 0's artwork.** The
   shell read `instance["sprite"]`; the document has only ever stored
   `instance["spriteIdx"]`. `.get("sprite", 0)` silently returned 0 for every
   entity, so a Goomba, a Koopa and a Villager all rendered as whatever sprite 0
   happened to be.
2. **`QComboBox.findData()` does not reliably match a Python tuple.** PALS stored
   `(bank, palette, slot)` as item data and looked it up with `findData` — which
   returned -1 and silently left the selection where it was. "Fix in PALS →" and
   the sprite-slot picker both pointed at the wrong slot. The index is now
   computed, not searched.
3. **The UI test suite grew superlinearly** because `processEvents()` does not
   deliver `DeferredDelete`. See §8.
4. **A clipped control is invisible to every test we had.** The inspector dock has
   no horizontal scrollbar, so `Duplicate` rendered as `Du`. Now guarded.
5. **`hasBuilt` is a one-way latch**, so it could not answer "did they build *just
   now*" — which is what a tutorial step needs. `nativeUi.buildCount` can.

---

## 2. Architecture as built

```
nes_studio/
  render/                 ✅ The single source of visual truth.
  emulator/               ✅ Wraps native/nes_core.
  state/store.py          ✅ Whole-document undo, hooked to saveScheduled.
  ui/
    main_window.py        ✅ The shell. 744 lines, and no editor in it.
    build_play.py         ✅ Threaded cc65 build + playing the ROM in the stage.
    project_actions.py    ✅ New / open / save / catalog / Time Machine.
    attention.py          ✅ Quests + validator problems + Fix-in buttons.
    tutorial.py           ✅ Step runner; "Show me" flashes the real control.
    theme.py              ✅ resources/theme.qss + accessibility preferences.
    modes/                ✅ One module per mode.
      base.py             Mode protocol, ModeContext, Level
      world.py chars.py tiles.py pals.py style.py rules.py sound.py code.py
    widgets/              world_canvas, sprite_canvas, budget, forms, visuals,
                          shared_tile_guard, preview
  core/
    validators.py         ✅ ~30 checks, contract-tested against the web's JS.
    tutorials.py          ✅ Declarative, re-baselined, lenient checks.
    assets.py             ✅ .chr / .pal / .nam.
```

**The mode contract** (`ui/modes/base.py`) — deliberately the shape the web
already proves out (`studio.js:346-358`):

```python
class Mode(QWidget):
    id: str; title: str; help_text: str
    min_level: Level          # BEGINNER | MAKER | ADVANCED
    uses_stage: bool          # True → this mode edits *on the NES screen*

    def build_dock(self) -> QWidget | None      # its inspector; every mode has one
    def stage_widget(self) -> QWidget | None    # its canvas, inside the CRT bezel
    def refresh(self) -> None                   # the document changed
    def on_enter(self) / on_leave(self)
```

A mode reaches the project only through `ModeContext`, and **never caches the
document**: an undo replaces its contents in place, and switching project replaces
the object outright. A mode that cached it would edit a stranded document.

`ModeContext.edited()` is the single place an edit is recorded — it saves,
retitles, re-runs the validators and advances the tutorial. No mode has to
*remember* to do any of that, which is what the 66 hand-written `schedule_save()`
calls used to be.

---

## 3. Phase 3b — the mode extraction

Done in the order the plan set (easiest first, so the pattern was proven before
the hard ones): `pals → tiles → sound → code → rules → style → chars → world`.

The dock work from 4b was done **with** the extraction rather than after it, as
§7.1 recommended: a mode's dock content is exactly what the extracted mode owns,
and splitting the two would have meant touching every mode twice.

**One trap worth writing down.** Adding the first item to an empty `QComboBox`
fires `currentIndexChanged`. A handler that calls `refresh()` therefore re-enters
the mode's own construction and recurses. Every mode now populates its selectors
**before** connecting them.

---

## 4. Phase 4b — making it look like the design guide

- **A dock per mode.** `setVisible(mode == "WORLD")` is gone; the inspector is a
  `QStackedWidget` of the modes' own docks.
- **Top app bar**: project name (live rename), save-status dot, level select,
  Tutorial, Build, ▶ Play, Help.
- **`resources/theme.qss`** — a real file, not a 47-line Python string. Chrome
  colours are sourced from the real NES system palette, each documented with the
  index it comes from, as the web does.
- **Budget meters** (`ui/widgets/budget.py`): background tiles N/256, sprite tiles
  N/256, sprites-on-screen N/64 (OAM), audio N/32 KB. Three bands: comfortable,
  tight, over. *Over* is a state, not a warning — a project past a hardware limit
  will not render as drawn.
- **The label hacks are dead.** `Racer laps: 3` was a `QSpinBox` *prefix*, rendered
  inside the box as part of its value and unreachable to a screen reader as a
  label. `ui/widgets/forms.py` gives every field a real `QLabel` buddy, and groups
  settings into cards that hide themselves when the game type does not use them.

---

## 5. Phase 5 — parity

| Item | State |
| --- | --- |
| Validators | ✅ `core/validators.py`, ~30 checks + **both** of the web's two disagreeing sprites-per-scanline analyses. Pinned to the web by `tests/contract/test_validator_parity.py`, which runs the real `builder-validators.js` in node. |
| PALS | ✅ Used-by counts; BG slot 0 locked to the shared backdrop; sprite slot 0 shown as transparent. |
| CHARS canvas | ✅ Paint the character; the pixel lands in whichever tile owns it, through cell flips. Includes the **shared-tile guard**. |
| WORLD viewport | ✅ Attribute-conflict overlay, right-click eyedropper, zoom, hover readout, full-screen preview (F11). |
| STYLE | ✅ The missing 8th mode. |
| Time Machine | ✅ `Ctrl+H`. Restoring is itself undoable, and snapshots the present first. |
| CODE | ✅ Build-log pane, line numbers, and **restore-from-generated** — until now there was no way back once `customMainC` was set. |
| Expertise levels | ✅ Locked modes stay **visible**, with a padlock and a nudge. |
| Assets | ✅ `.chr` / `.pal` / `.nam`, both ways. |
| Accessibility | ✅ Text scale, high contrast, reduced flashing. |
| Tutorial | ✅ Six tutorials. Steps advance on their own; "Show me" flashes the real control. |

### 5.1 Why the validators needed a contract test

The web's checks are full of behaviour that looks like a bug and is not: messages
that interpolate a raw index so a missing one reads `sprite #undefined`, two
scanline analyses that disagree with each other, curly apostrophes in one message
and straight ones in the next, double spaces after full stops. A port that
"tidied" any of it would diverge from the product the pupil used yesterday.

So the contract test runs **the actual JavaScript**, in node, over 30 project
states, and diffs the output. It found a real divergence on its first run: Python's
`dict.get()` collapses "key absent" and "key present but null", which JavaScript
distinguishes as `undefined` and `null` — and both appear in user-visible messages.

### 5.2 Why the tutorial checks are re-baselined

A step says "draw a tile", and it is satisfied by drawing a tile **since the step
began** — not by the project already containing one. A pupil who opens the `basics`
starter must still do the work; a check that asked "does any drawn tile exist"
would tick itself the moment they arrived, teach nothing, and skip the step.

They are also **lenient**: they ask "did something of this shape happen", never
"did you do exactly what I said". A pupil who paints a wall instead of a floor has
painted a solid, and the step moves on.

---

## 6. Explicitly out of scope

**Gallery / accounts / cloud publish.** Server-coupled product decisions, not
native UI gaps. Recorded as a deliberate deferral rather than left implicitly
"missing".

---

## 7. Packaging

Unchanged and still true: the `nes_core` wheel is vendored (568 KB, `manylinux`,
abi3), so installation needs **no Rust toolchain, no compiler and no apt packages**
on the target. Install with `--find-links nes_core/dist`. Upstream attribution
lives in `native/nes_core/THIRD-PARTY-LICENSES.md`.

Engine-source files under `steps/Step_Playground/src/` are regenerated per build
and must not be committed (see `CLAUDE.md`).

---

## 8. Testing policy — the thing that matters most

**180 tests once passed against an app with a transparent emulator frame, a
white-on-white PALS panel, and a `NameError` on every background switch** — because
they asserted `document.field == X` and never asserted that anything *rendered*.
That is still the single most important thing to know about this codebase's tests.

**Now: 363 tests, all green, ~4 minutes.** `tests/ui/test_shell.py` is no longer a
240-line monolith that aborted everything after its first failure; each mode has
its own file, and anything visual asserts on pixels via `assertRenders()`.

### Four traps, all of which have bitten

1. **Assert pixels, not document fields.**
2. **Destroy your windows.** `processEvents()` does **not** deliver
   `DeferredDelete`, so `deleteLater()` on its own frees nothing. A leaked
   `MainWindow` keeps ~1,170 widgets alive, and the theme is applied to the
   *application* — so every later `setStyleSheet()` re-polishes all of them. One
   test file went from 1.4 s for its first test to 12 s for its ninth. The suite
   was growing superlinearly and nobody had noticed.
3. **Never put expensive work in a refresh for a mode nobody is looking at.**
   CODE's refresh invokes the cc65 codegen; refreshing every mode on every undo
   made one file take 178 seconds.
4. **A clipped control passes every field assertion.** The dock has no horizontal
   scrollbar, so a control wider than it is cut in half rather than scrolled to.

---

## 9. What is honestly still missing

> **Superseded.** Everything in this section except the last two bullets was done
> in [`2026-07-15-native-followthrough.md`](2026-07-15-native-followthrough.md),
> which also found and fixed **two false claims this build-out shipped**: the Time
> Machine told the pupil "Ctrl+Z undoes this" and then cleared the undo stack, and
> "Hear this song" permanently changed their game's default song.

- **No image assets.** There is still no app icon and no mode-rail icons; every
  icon is procedurally painted at runtime. This is a design job, not an
  engineering one.
- **SOUND cannot play a song on the host.** A `.s` file is ca65 assembly for the
  NES's APU, and nothing on a PC can play it. "Hear this song" makes it the
  default, builds the ROM and plays *that* — the honest preview. A real one would
  need an APU-only harness around `nes_core`.
- **Cross-mode live repaint is still partial.** Editing a tile in TILES does not
  live-repaint an open WORLD; WORLD re-renders when you next enter it. Closing
  this properly needs a per-edit change signal on the document, which
  `DocumentStore` (whole-document snapshots) deliberately does not have. It is a
  real piece of work and nothing else depends on it.
- **The direct-mutation sites remain.** Modes still call `document.set_*()` and
  rely on `ModeContext.edited()` rather than a command object. They are no longer
  *dangerous* — undo covers them, and `edited()` is one place — but a per-edit
  command API is what a live change signal would want.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| The validator port drifts from the web | The contract test runs the real JS and diffs it. A new check with no case in `CASES` fails the suite. |
| Screenshot baselines are brittle across Qt/font versions | We assert on *distinct colour counts* and specific pixels, never on file hashes. |
| Rendering real tiles is slower than the placebo | Measured: a full `MainWindow` builds in 0.78 s, and the emulator leaves ~8 ms/frame spare. |
| `tetanes-core` becomes unmaintained | The Python API is core-neutral by design; `plastic_core` (MIT, Rust, full APU) is a drop-in-shaped fallback — one file changes. |
