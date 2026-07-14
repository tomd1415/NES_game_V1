# Native Linux build plan — detailed implementation

**Status:** active. This is the single source of truth for `native/` work.

## Progress (updated 2026-07-14)

| Phase | State |
| --- | --- |
| 0 — Triage | ✅ **Done** (`98f747f`) |
| 1 — Renderer | ✅ **Done** (`829eb9c`) |
| 2 — Play in the stage | ✅ **Done** (`08da14b`, `b37ff38`) |
| 3a — `DocumentStore` + undo everywhere | ✅ **Done** (`6e91e5c`) |
| 4a — Editors out of the CRT bezel; mode registry | ✅ **Done** (`ad8aa12`) |
| 5.1 — Project catalog + the 7 starters | ✅ **Done** (`eb396ff`) — taken early; six starters shipped unreachable |
| **3b — Extract modes into `ui/modes/`** | ⬜ **NEXT.** `MainWindow` is **3,008 lines / 176 methods** — it has *grown*. `ui/modes/` is still empty. The dispatch is now a registry, so the seams are visible; the widgets have not moved. |
| 4b — A dock per mode, app bar, `.qss` file, budget meters | ⬜ Not started |
| 5.2+ — Remaining parity (validators → tutorial) | ⬜ Not started |

Test count: 180 → **214**, all green.

**Bugs found and fixed along the way that were not in the original plan:**

1. Viewing CODE **ejected the project into hand-edited source** — populating the
   editor wrote the generated C into `customMainC`, which feeds the build, so
   opening a tab silently changed how the game compiled. `blockSignals()` does
   not help: the syntax highlighter re-touches the document and `textChanged`
   fires after the blocked window closes.
2. **Every dialog rendered light-on-light** — the theme was on `MainWindow`, and a
   `QDialog` is a top-level window that does not inherit a `QMainWindow`
   stylesheet. Now applied to the application. Same class of bug as the white
   PALS panel; fixing it at the application level closes the class.
3. **No audio device meant no picture at all** — see §5.3a.
4. **Every undo re-ran the cc65 codegen.** `_refresh_all_editors()` eagerly
   re-read every mode, including `_refresh_code_preview()`, which invokes the
   generator. The undo test suite took 178 s. Refresh is now lazy — the visible
   mode refreshes, the rest are marked stale and refresh when opened — which
   brought it to 38 s. Worth remembering when adding a mode: **never put
   expensive work in a refresh that runs for modes nobody is looking at.**

## About this document

It supersedes the ranking in
[`2026-07-14-native-web-gap-audit.md`](2026-07-14-native-web-gap-audit.md): that
audit is honest about *what* is missing, but understates the gap (§1.3) and misses
the architectural root causes (§1.2) that make every item on its list expensive.
The parity tracker [`2026-07-13-native-parity.md`](2026-07-13-native-parity.md)
remains the per-feature checklist; this document is the build order.

**Audience:** whoever picks up `native/` next, human or AI. Every symbol named
here was verified against the tree on 2026-07-14; every measured number was
measured, not estimated.

---

## 1. What we are building and why

`native/` is the PySide6 Linux sibling of the browser Studio. Today it is a
**working ROM pipeline behind a prototype UI**. The goal of this plan is a native
app that (a) looks like the design guide claims, (b) has workflows a pupil can
actually follow, and (c) reaches feature parity with the web Studio.

### 1.1 What is already good — do not rewrite it

| Area | Where | Verdict |
| --- | --- | --- |
| Shared codegen / ROM contract | `codegen/runtime.py`, `codegen/differential.py`, `core/build_request.py` | **Excellent.** Proves native and web emit byte-identical ROMs. `tests/contract/` is why that stays true. |
| Persistence | `persistence/projects.py` (`ProjectRepository`), `session.py` (`ProjectSession`), `manager.py` (`StorageManager`), `autosave.py`, `bundles.py`, `portability.py` | **Solid.** SQLite store, 500 ms debounced saves, 30 s deduplicated snapshots, atomic import/export, XDG recovery. |
| Document model | `core/project_document.py` (`ProjectDocument`, 1294 lines, ~120 mutators) | Sound data model. Its *change-notification* story is the problem (§4.2), not its contents. |
| Starters | `core/starters.py` (`StarterCatalog`), `resources/starters/` | 7 checksummed fixtures: `basics`, `geodash`, `racer`, `runner`, `scratch`, `smb`, `topdown`. |
| Threaded build | `ui/main_window.py:82` (`_BuildWorker`), `integrations/direct_build.py` (`DirectBuildController`) | Correct: builds against a detached document copy on a `QThread`. |
| **Embedded NES core** | `native/nes_core/` | **New, done, proven.** See §5. |

### 1.2 The two root causes of everything else *(as audited; see the status notes)*

**Root cause A — there is no NES renderer.** The web's centrepiece is a live
256x240 framebuffer (`studio.js:183 renderLive`) painting real tiles through the
real 64-entry `NES_PALETTE_RGB` table (`sprite-render.js:29`), which each mode can
take over via `renderTV` / `onRenderOverlay`. Native has nothing equivalent:

- `ui/widgets/world_canvas.py:422` fills each cell with `NES_COLOURS[value % 4]` —
  a four-colour placebo keyed off the **tile index**. The WORLD canvas has never
  drawn the pixel art made in TILES and never applies PALS palettes.
- The same placeholder ramp `("#181828", "#4878d8", "#78d878", "#f8d878")` is
  copy-pasted 5x (`main_window.py:195,210,795,1358`, `world_canvas.py:18`) and is
  what every tile/sprite thumbnail renders with.
- `main_window.py:264 _nes_colour_swatch()` **invents** colours via
  `QColor.fromHsv((tone * 23) % 360, ...)`. PALS shows 64 colours the NES cannot
  produce.

Consequence: the CRT bezel framed a screen that never showed the game. Every
visual feature was blocked behind this one missing module.

> **Status: fixed** (§4, `829eb9c`). `render/` now holds the real 64-entry NES
> palette (pinned to the web's by a contract test), a framebuffer that honours the
> hardware rules, and `NesScreen`. All five placeholder ramps and
> `_nes_colour_swatch()` are deleted.

**Root cause B — `MainWindow` is a god object with no store.** At audit: 2,665
lines, 157 methods, 129 widget attributes, all 7 modes built inline in a single
597-line `_create_stage()` and dispatched by a nested ternary. `ui/modes/` was
scaffolded for per-mode widgets and left **empty**.

No store and no change signal, so the UI mutated the document directly (154 call
sites) and had to *manually remember* `schedule_save()` (66 sites) and
`_update_document_title()` (55 sites) after each edit; 77 `blockSignals()` pairs
papered over the missing data flow.

What the user felt:
- **Editing a tile in TILES did not repaint WORLD.**
- **Undo/redo worked only in WORLD.** Tile pixels, sprites, animations, all ~40
  RULES fields, palettes and sound were **not undoable at all**.
- `WorldCanvas.load_tiles()` cleared history unconditionally, so switching screen
  or background **wiped WORLD undo too**.

> **Status.** The *store* half is fixed (§6.1): undo now covers every mode, groups
> a drag into one step, and survives a background switch. The *god object* half is
> **not**: `MainWindow` is **3,008 lines / 176 methods** today — it has grown, and
> the 159 direct mutations, 67 `schedule_save()` calls and 78 `blockSignals()`
> pairs are all still there. Live cross-mode repaint (a tile edit repainting WORLD)
> is still missing. **Extracting the modes (§6.2) is the next task.**

### 1.3 Scale of the parity gap

The existing audit lists 11 gaps. These whole systems are missing outright:

| System | Web | Native |
| --- | --- | --- |
| **STYLE mode** | `studio-style.js` — a full 8th mode | **Absent**; crammed into RULES |
| **Expertise levels** (Beginner/Maker/Advanced) | Gates modes, stage tools *and* dock sections | Absent |
| **Validators** | `builder-validators.js` (934 lines), ~20 checks + sprites-per-scanline analysis, each with a **"Fix in \<Mode\> →"** jump | Absent |
| **Guided tutorial** | 6 tutorials, lenient re-baselined checks, "Show me" flashes the real control, teacher settings | Absent |
| **Time Machine** | Browse/restore snapshots; restoring is itself undoable | Snapshots exist, **no UI** |
| **Budget meters** | CHR bg/sprite N/256, OAM N/64 | Absent |
| **Attribute-conflict display** | Red cross on 2x2 quadrants whose palettes disagree | ✅ Now present (`829eb9c`) |
| **Shared-tile guard** | "Used by Villager… Duplicate first / Change everywhere / Cancel" | Absent |
| **Asset import/export** | `.chr` / `.pal` / `.nam` both ways | Absent |
| **Emulator** | In-page jsnes, audio, 2P | ✅ Embedded core, audio, 2P (§5) |
| **Gallery / accounts** | Full | Absent (out of scope, §9) |

Native's CHARS has **no drawing canvas at all** — you edit one cell through four
spin boxes. SOUND is import-only. CODE discards the build log
(`main_window.py:2434`).

---

## 2. Target architecture

Legend: ✅ exists · ⬜ still to build.

```
nes_studio/
  render/                 ← ✅ The single source of visual truth.
    palette.py            NES_PALETTE_RGB (64 entries, verbatim from the web)
    framebuffer.py        nametable+tiles+palettes -> QImage; tile/sprite thumbs
    screen.py             NesScreen widget: QImage at integer scale + overlay hook
  emulator/               ← ✅ Wraps native/nes_core.
    session.py            EmulatorSession: frame loop, QAudioSink, input mapping
  state/                  ← ✅ The store.
    store.py              DocumentStore: whole-document undo, hooked to saveScheduled
  ui/
    main_window.py        ⬜ STILL 3,008 lines. Should shrink to: app bar, rail,
                          stage, dock host, quests, build/play orchestration.
    project_catalog.py    ✅ Switch/rename/duplicate/delete + starter picker
    modes/                ⬜ STILL EMPTY. One QWidget per mode. THE NEXT TASK.
      base.py             Mode protocol
      world.py chars.py tiles.py pals.py rules.py style.py sound.py code.py
    widgets/
      world_canvas.py     ✅ Renders via render/; owns interaction, not pixels
  core/ persistence/ codegen/ integrations/   ← largely unchanged
```

**The mode contract** — deliberately the same shape the web already proves out
(`studio.js:346-358`), so the two products stay conceptually aligned:

```python
class Mode(Protocol):
    id: str                                     # "world", "chars", ...
    title: str
    min_level: Level                            # BEGINNER | MAKER | ADVANCED

    def build_dock(self) -> QWidget: ...        # left inspector; every mode has one
    def render_tv(self, image: QImage) -> None: ...      # optional: take over the stage
    def render_overlay(self, painter: QPainter) -> None: ...  # grid, hover, entities
    def on_tv_press(self, cell: Cell, event) -> None: ...
    def on_tv_move(self, cell: Cell, event) -> None: ...
    def on_tv_release(self, cell: Cell, event) -> None: ...
    def on_key(self, event) -> bool: ...        # True if handled
    def refresh(self) -> None: ...              # store said something changed
```

---

## 3. Phase 0 — triage — ✅ DONE (`98f747f`)

These are shipped defects. Do them before any refactor so the refactor starts from
a working app.

### 0.1 Background switching crashes — `main_window.py:2234`

```python
self.statusBar().showMessage(f"WORLD layout changed to {dimensions[0]} × {dimensions[1]}")
```
`dimensions` is undefined in `_select_background()`. **Reproduced:** `NameError` on
every background change, raised *after* the document was mutated and autosaved, so
the UI half-updates. Line 2234 is also a copy-paste of the layout message and is
dead even once defined — delete it, keep 2235.

**Test:** `tests/ui/` — add a background, switch to it, assert no exception and
that `selected_background_index` moved. No existing test touches this path.

### 0.2 PALS renders white-on-white — `main_window.py:2557`

The theme rule lists `#rulesEditor`, `#tileEditor`, `#charsEditor` and their
`…Content` widgets, but never `#paletteEditor` / `#paletteEditorContent`. The
(currently uncommitted) `QScrollArea` conversion therefore falls back to Qt's
default white, with light-blue labels on it. Add both object names.

> This is the whole class of bug the theme's design invites: styling is one 47-line
> QSS string keyed by `objectName`, so **every new widget must be manually
> registered or it renders wrong**, and no test catches it. Phase 4.3 fixes the
> class; this fixes the instance.

### 0.3 `Open Project…` silently overwrites the current project

`main_window.py:2373` calls `import_project(..., replace_project_id=self._session.project_id)`
— opening a file **overwrites the currently open project's row** rather than
creating a new one, with no confirmation dialog. Create a new project; if replace
is ever wanted, ask first.

### 0.4 Remove the dev scaffolding shipped as UI

- `main_window.py:1177-1183` — the quest log is 5 hardcoded labels, all `done=True`
  ("Launch a real Qt application"). Delete; Phase 4.4 builds the real panel.
- `main_window.py:1190` — the notice "Development preview / No project files are
  modified by this shell." is **false**: the shell writes SQLite continuously.
  Delete it.

### 0.5 Keyboard basics

`Ctrl+S` (save), `F5` (build), `1`–`8` (mode switch). Today there is no `Ctrl+S`
at all — only `Save Project As…` (`main_window.py:2600`), which *exports* a JSON
copy while the real store is SQLite.

---

## 4. Phase 1 — the renderer — ✅ DONE (`829eb9c`)

### 4.1 `render/palette.py`

Port `NES_PALETTE_RGB` **verbatim** from `tools/tile_editor_web/sprite-render.js:29`
(64 entries, `[[0x62,0x62,0x62], [0x00,0x1F,0xB2], …]`).

```python
NES_PALETTE_RGB: tuple[tuple[int, int, int], ...]   # exactly 64 entries

def nes_rgb(index: int) -> tuple[int, int, int]: ...   # index & 0x3F
def nes_qcolor(index: int) -> QColor: ...
```

**Contract test** (`tests/contract/test_palette_parity.py`): parse the array out of
`sprite-render.js` and assert the Python table is byte-identical. This is exactly
the kind of cross-target invariant `tests/contract/` already exists to hold, and it
permanently kills the `_nes_colour_swatch()` class of bug.

### 4.2 `render/framebuffer.py`

```python
def render_nametable(doc, background_index, screen_x, screen_y) -> QImage   # 256x240
def render_tile(pixels, palette, *, bank) -> QImage                          # 8x8
def render_sprite(doc, sprite) -> QImage                                     # w*8 x h*8
```

Rules that must be honoured (the current code honours none of them):
- A cell's colour = `palette[value]`, where `palette` is the **2x2 attribute
  quadrant's** BG palette, not a per-tile choice.
- BG palette slot 0 is the **universal backdrop**, shared by all four palettes.
- Sprite palette slot 0 is **transparent**.

Format: **`QImage.Format_RGBX8888`**, not `RGBA8888` — see §5.3.

### 4.3 `render/screen.py` — `NesScreen`

The widget the whole app hangs off. Owns:
- a 256x240 `QImage`, drawn at **integer scale** with
  `Qt.TransformationMode.FastTransformation` (nearest-neighbour; anything else
  turns pixel art to mush);
- hover cell tracking → emits `hovered(x, y)` for the coordinate readout;
- an overlay hook so a mode can draw grid/attribute/entity/conflict layers on top;
- mouse press/move/release → `Cell` in **world** coordinates (not screen), because
  entities are world-space.

**Then delete** all five copies of the placeholder ramp and `_nes_colour_swatch()`.

### 4.4 Tests — the current suite's blind spot

180 tests passed while the app rendered a transparent screen and a white PALS
panel, because the tests asserted `document.field == X` and **never asserted that
anything rendered**. Phase 1 established the missing habit:

- pixel assertions: render a known nametable, assert specific `QImage.pixel()`
  values;
- the palette-parity contract test above;
- a per-mode screenshot baseline (`QWidget.grab()`), which would have caught **both**
  Phase 0 bugs.

---

## 5. Phase 2 — Play in the stage — ✅ DONE (`08da14b`, `b37ff38`)

### 5.1 What exists

`native/nes_core/` — a PyO3 binding around **`tetanes-core`**, built and verified
on 2026-07-14.

- **Licence `MIT OR Apache-2.0`**, verified at source; no GPL/LGPL anywhere in its
  dependency tree. The project stays MIT.
- Ships as a self-contained `manylinux` abi3 wheel (568 KB). **Target machines need
  no Rust, no compiler, no apt packages** — the point, for locked-down school images.

```python
from nes_core import Nes
nes = Nes(44100.0)                      # must match the QAudioSink sample rate
nes.load_rom(rom_bytes)
nes.set_button(1, "right", True)        # player 1|2; up/down/left/right/a/b/start/select
pixels, samples = nes.clock_frame()     # 256x240 RGBA bytes + this frame's f32 audio
```

Measured against the real gallery ROM:

| Check | Result |
| --- | --- |
| Speed | **119 fps** — 8.43 ms/frame against a 16.67 ms budget (~2x headroom) |
| Video | 91 distinct colours; the platformer renders correctly |
| Audio | 733.5 samples/frame at 44.1 kHz (expected 735), non-zero APU output |
| Input | Holding RIGHT changes the screen; bad player/button rejected |
| Qt blit + 2x scale | 0.26 ms/frame — 1.6% of budget, so Python can drive the loop |

### 5.2 Why not libretro

Every mature libretro core (fceumm, nestopia, quicknes — GPLv2; Mesen — GPLv3)
would force GPL onto an MIT school product, and Debian's `libretro-nestopia`
depends on `retroarch | libretro-frontend`, so an apt install drags in RetroArch.
`nes-py` has no APU at all. `cynes` emulates the APU but emits no samples.

> **Correction to `2026-06-22-wasm-emulator-spike.md`:** that doc claims "jsnes is
> already GPL, so we're very likely shipping under GPL terms today" and "a permissive
> NES core barely exists". **Both are false.** jsnes is Apache-2.0; the project today
> is cleanly MIT + Apache-2.0. Following that doc's reasoning would have quietly
> relicensed the product. The doc now carries a correction.

### 5.3 Two traps — both already hit, keep them written down

1. **Do not use `clock_frame_into()`.** It does
   `audio_samples.copy_from_slice(&audio[..audio_samples.len()])`, which **panics**
   unless the buffer length exactly equals the samples produced — and NES
   samples-per-frame varies (733/734/735 at 44.1 kHz). Use `clock_frame()` +
   `frame_buffer_into()` + a variable-length `audio_samples()` copy. `nes_core`
   already does this.
2. **Alpha is zero.** tetanes leaves the fourth byte at 0, so
   `QImage.Format_RGBA8888` renders a **fully transparent (white) screen**. Use
   **`Format_RGBX8888`**. This is the same reason `render/` must use RGBX (§4.2).

### 5.3a A third trap, found while wiring it up

**A machine with no audio device rendered nothing at all.** Pacing the loop on
`QAudioSink.bytesFree()` is correct — but when there is no sound card, `bytesFree()`
is permanently 0, so the loop never clocks a frame and Play shows a black screen.
`EmulatorSession` now falls back to a fixed 16 ms timestep when the sink fails to
open. On a locked-down school image with no working audio, the game must still be
playable.

### 5.4 `emulator/session.py`

```python
class EmulatorSession(QObject):
    frame_ready = Signal(QImage)
    def start(self, rom: bytes) -> None
    def stop(self) -> None
    def set_paused(self, paused: bool) -> None
    def key_event(self, event, pressed: bool) -> None
```

- **Clock the loop off `QAudioSink` buffer level, not a bare 16.67 ms `QTimer`.**
  A timer-driven loop drifts against the 44.1 kHz sink and underruns — this is
  precisely the bug the web hit and solved with a fixed-timestep loop plus a
  catch-up cap (`emulator.js:299-327`). Pull frames when the sink wants samples.
- `QAudioFormat`: 44100 Hz, mono, `Int16` (verified valid in the venv). Convert the
  core's `f32` samples.
- Input map — **match the web exactly** (`emulator.js:121-141`) so a pupil moving
  between browser and native does not have to relearn:
  P1 = Arrows, `F`=A, `D`=B, `Enter`=Start, `RShift`=Select;
  P2 = `I/J/K/L`, `O`=A, `U`=B, `1`=Start, `2`=Select.

### 5.5 Wiring

`NesScreen` (§4.3) shows either the **edited** framebuffer (LIVE) or the
**emulated** one (PLAYING) — the same widget, which is exactly why Phase 1 and
Phase 2 belong together. `▶ PLAY` builds (already threaded) then swaps the source.
Retire `integrations/fceux.py` as the primary path; keep an "Open in FCEUX" escape
hatch if it is installed.

---

## 6. Phase 3 — store ✅ / mode extraction ⬜ **(next)**

### 6.1 `state/store.py` — ✅ **DONE** (`6e91e5c`), but *not* as this plan first specified

The original spec here proposed a per-edit `QUndoCommand` API (`store.do(command)`)
and claimed it would "retire" the 66 `schedule_save()` calls, the 55
`_update_document_title()` calls and most of the 78 `blockSignals()` pairs.

**That is not what was built, and the claim was wrong.** Rewriting 159 direct
mutation sites into commands is a large, risky change with no user-visible payoff
on its own. What shipped instead:

`DocumentStore` hooks **`ProjectSession.saveScheduled`** — a signal every edit
*already* emits. An edit anywhere therefore becomes undoable **without touching a
single one of those call sites**. Snapshots are whole-document JSON, 40 deep,
exactly as the web does it (`studio.js` `pushUndo`/`cloneState`). Measured on the
largest starter: 180 KB per snapshot, ~5 ms to take, ~7 MB for a full stack.

Consequences to be honest about:

- The 159 direct-mutation sites, 67 `schedule_save()` calls and 78
  `blockSignals()` pairs **are all still there.** They are no longer *dangerous*
  (undo covers them), but they are still the tax on adding features, and cleaning
  them up is a separate job that Phase 3b can chip at.
- **Cross-mode refresh is only partial.** The store's `changed` signal fires on
  undo/redo and project switch, not on every edit — so editing a tile in TILES
  still does not live-repaint WORLD. WORLD re-renders when you next enter it
  (modes are marked stale). Closing that properly needs the per-edit change signal
  the original spec described.

`WorldCanvas`'s private history is gone; it now emits `stroke_began`/`stroke_ended`
so the store groups a paint drag into one undo step. That also fixed the
"switching background wipes undo" bug, because `load_tiles()` no longer clears a
stack that no longer exists.

### 6.2 Fill `ui/modes/` — ⬜ **NOT DONE. This is the next task.**

One `QWidget` per mode implementing the §2 protocol. Extraction order — easiest
first, so the pattern is proven before the hard ones:

`pals` → `tiles` → `sound` → `code` → `rules` → `style` (new) → `chars` → `world`.

`MainWindow` keeps only: app bar, mode rail, stage, dock host, quest panel, menus,
build/play orchestration. Target **under 600 lines** — it is **3,008 lines and 176
methods today**, i.e. it has *grown* during phases 0–4a, because features landed
in it. This is the single biggest remaining piece of work in the whole plan.

The seams are now visible: `_mode_pages()` and `_mode_refreshers()` already name,
per mode, which widget and which refresh functions belong to it. Extracting a mode
means moving its `_create_*` block, its refresh methods and its handlers into
`ui/modes/<mode>.py` behind the §2 protocol, then deleting the entry from those
two registries.

### 6.3 Kill the nested-ternary dispatch — ✅ **DONE** (`ad8aa12`)

The nested ternary plus six sequential `if mode == …` refresh blocks is replaced by
the `_mode_pages()` / `_mode_refreshers()` registries.

---

## 7. Phase 4 — make it look like the design guide — 🟡 partly done

### 7.0 Take the editors out of the CRT bezel — ✅ **DONE** (`ad8aa12`)

The television used to wrap the whole editor stack, so RULES rendered as forty spin
boxes inside a TV frame. The bezel now frames an NES screen and only an NES screen:
a screen stack (WORLD canvas / running game) sits inside the television, and the
other modes get a plain bordered editor panel.

### 7.1 Give every mode a dock — ⬜ **NOT DONE**

`main_window.py:1307` still does `self.context_dock.setVisible(mode == "WORLD")` —
the inspector **only exists in WORLD**. In the other six modes the entire left
column vanishes and the mode is a single full-width editor panel.

Every mode gets a dock (§2 `build_dock`). Best done *with* the mode extraction
(§6.2), not before it — the dock content is exactly what each extracted mode owns.

### 7.2 Top app bar

Mirror `studio.html:422-457`: project name (live rename), **save-status dot**,
`▶ Play`, `Build`, `Tutorial`, `Help`, level select. Native currently has menus only.

### 7.3 Theme — ⬜ **NOT DONE** (one fix landed)

The theme is now applied to the **application**, not the window (`ad8aa12`/`eb396ff`)
— a `QDialog` is a top-level window and does not inherit a `QMainWindow` stylesheet,
so every dialog used to render as light-on-light default Qt chrome. That closes the
class of bug that produced the white PALS panel.

Still to do: extract the inline QSS string into a real `.qss` file with
design tokens. Adopt the web's discipline of **sourcing chrome colours from the real
NES system palette** (`studio.html:15-45`, each documented with its hex index).
Ship an app icon and mode-rail icons — there are currently **no image assets at
all**; every icon is procedurally painted at runtime.

Kill the label hacks: `Racer laps: 3` is a **spin-box prefix**, not a label. Group
RULES into cards. Hide racer fields in a platformer.

### 7.4 Real quest / attention panel — 🟡 **PARTLY DONE**

The hardcoded developer checklist ("Launch a real Qt application", all ticked) is
gone; quests are now derived from the pupil's own document (`98f747f`).

Still to do: **CHR budget meters** (bg N/256, sprite N/256), **OAM** (N/64), and
validator output (§8.2) with **"Fix in \<Mode\> →"** jump buttons.

---

## 8. Phase 5 — feature parity (ordered by value)

1. ~~**Project catalog**~~ — ✅ **DONE** (`eb396ff`). `File → My Games` (`Ctrl+M`):
   switch / rename / duplicate / delete, plus a starter picker offering all seven.
   Taken out of order because six starters shipped on disk and were unreachable.
2. **Validators** — port `builder-validators.js` to `core/validators.py`. Pure logic,
   no Qt, shareable, and **contract-testable against the web's output**. Highest
   value-per-risk item on this list.
3. **PALS** — 🟡 the master grid and every swatch are correct after Phase 1
   (`829eb9c`). Still to do: used-by counts, and locking slot 0 (BG = the shared
   backdrop, sprite = transparent) so it cannot be edited as if it were free.
4. **CHARS composition canvas** — real metasprite painting on the stage via
   `render_tv`; pencil/fill/line/rect/select. Include the **shared-tile duplicate
   guard** (`studio-chars.js:283-326`) — the best teaching moment in the web app.
5. **WORLD viewport** — 🟡 the **attribute-conflict overlay** landed with Phase 1
   (`829eb9c`); `render/framebuffer.attribute_conflicts()` is the data behind it.
   Still to do: zoom, hover coordinate readout, right-click eyedropper, fullscreen
   preview, richer block picker.
6. **STYLE mode** — the missing 8th mode; splits game-type tuning out of RULES.
7. **Time Machine UI** over the snapshots that already exist.
8. **CODE** — 🟡 a failed build now shows the compiler log in a dialog, and
   `NativeBuildResult.log` is kept in `_last_build_log` rather than discarded
   (`98f747f`). Still to do: a real build-log pane, line numbers, snippets, and
   **restore-from-generated** — once `customMainC` is set there is still no way
   back to the generated source from the UI. Note CODE still saves on **every
   keystroke**; it no longer *ejects* the project just for being opened
   (`eb396ff`), but the write-per-character remains.
9. **Expertise levels** — gate modes/tools/dock sections. Keep the web's rule that
   locked modes stay **visible** with a nudge rather than disappearing.
10. `.chr` / `.pal` / `.nam` import/export; SOUND preview; accessibility prefs
    (text scale, high contrast).
11. **Guided tutorial** — largest single item; port last, reusing the web's
    declarative check list.

---

## 9. Explicitly out of scope

**Gallery / accounts / cloud publish.** These are server-coupled product decisions,
not native UI gaps. Recorded as a deliberate deferral rather than left implicitly
"missing".

---

## 10. Packaging

- ✅ The `nes_core` wheel is vendored (`native/nes_core/dist/`, 568 KB), so
  installation needs **no Rust toolchain, no compiler and no apt packages** on the
  target. Rust >= 1.85 is needed on the *build* machine only.
- ✅ `native/pyproject.toml` declares `nes-core`. It is **not on PyPI**, so install
  with `--find-links nes_core/dist` (documented in `native/README.md`). The app
  degrades gracefully if the core is missing — Play warns instead of crashing — but
  a machine without it cannot play.
- ✅ `native/nes_core/target/` (120 MB) is gitignored.
- ✅ Upstream attribution is vendored in `native/nes_core/THIRD-PARTY-LICENSES.md`
  (tetanes-core MIT, PyO3 Apache-2.0). Attribution is the one obligation those
  licences impose. Keep it accurate if the core is ever swapped.
- Engine-source files under `steps/Step_Playground/src/` are regenerated per build
  and must not be committed (see `CLAUDE.md`).

---

## 11. Testing policy — the change that matters most

**180 tests passed against an app with a transparent emulator frame, a
white-on-white PALS panel, and a `NameError` on every background switch** — because
they asserted `document.field == X` and never asserted that anything *rendered*.
That is the single most important thing to know about this codebase's tests.

**Now: 214 tests, all green.** Added during phases 0–4a:

| Added | Covers |
| --- | --- |
| `contract/test_palette_parity.py` | Re-parses `sprite-render.js` and pins the native NES palette to the web's, so they can never drift. |
| `unit/test_framebuffer.py` | **Pixel assertions** — backdrop vs palette slots, sprite transparency, cell flips, attribute conflicts, opacity, render speed. |
| `unit/test_emulator_session.py` | Real ROM → picture + audio + input; frames are opaque; stop is idempotent; P2 keys match the web. |
| `ui/test_phase0_triage.py` | The shipped defects: background-switch crash, destructive Open, quest panel, themed dialogs, Save, and CODE-ejection. |
| `ui/test_undo_everywhere.py` | Undo in palettes/tiles/sprites/rules/WORLD; drag = one step; survives background switch; bounded; does not leak across projects. |

Still to add, in priority order:

1. **Per-mode screenshot baselines** — would have caught both Phase 0 bugs. Assert
   on downscaled/quantised images or specific pixels, never on file hashes.
2. **Per-mode widget tests**, replacing the 240-line monolith in
   `tests/ui/test_shell.py`, which aborts everything after its first failure.
3. **Failure-path tests** — most `QMessageBox` branches are still untested.
4. **Real mouse tests.** There is still no `QTest.mouseClick` anywhere, so
   drag-painting, entity drag and rubber-band selection are exercised only through
   the direct `edit_cell()` API, never through the actual mouse handlers.
   `pytest-qt` is a declared dev dependency but `qtbot` is never used.

### Two traps that have already bitten

- **Close windows in tests** (`self.addCleanup(window.close)`). A live `MainWindow`
  keeps a 30 s snapshot timer and an open session; leaking them makes two sessions
  race on one project and raise `StaleRevisionError` inside a *later* test.
- **Never put expensive work in a refresh that runs for modes nobody is looking
  at.** `_refresh_code_preview()` invokes the cc65 codegen; refreshing every mode on
  every undo made one test file take **178 seconds**. Refresh is now lazy (visible
  mode refreshes; the rest are marked stale) — 38 s.

The full suite takes ~2 minutes, dominated by `MainWindow` construction.

---

## 12. Where we are, and what to do next

| Phase | Work | State |
| --- | --- | --- |
| 0 | Triage: shipped bugs, dev scaffolding, shortcuts | ✅ `98f747f` |
| 1 | `render/` — palette, framebuffer, `NesScreen` | ✅ `829eb9c` |
| 2 | Play in the stage, embedded NES core | ✅ `08da14b`, `b37ff38` |
| 3a | `DocumentStore` — undo everywhere | ✅ `6e91e5c` |
| 4a | Editors out of the CRT bezel; mode registry | ✅ `ad8aa12` |
| 5.1 | Project catalog + the 7 starters | ✅ `eb396ff` |
| **3b** | **Extract the modes into `ui/modes/`** | ⬜ **← next** |
| 4b | A dock per mode; app bar; `.qss` file; budget meters | ⬜ |
| 5.2+ | Validators, CHARS canvas, STYLE mode, tutorial, … | ⬜ |

### The next task, concretely

**Extract the seven modes out of `MainWindow` into `ui/modes/`** (§6.2). It is the
biggest single piece of work left, and everything in Phase 4b wants it done first —
"a dock per mode" *is* the extracted mode's `build_dock()`.

Why now and not earlier: the store (3a) was the half of Phase 3 with user-visible
payoff, so it went first. The extraction is mechanical, low-risk **per mode**, and
high-risk if half-done — so do it one mode at a time, keeping the suite green at
each step, and delete the old code path last.

Start here:

1. `_mode_pages()` and `_mode_refreshers()` in `main_window.py` already name, per
   mode, the widget and the refresh functions that belong to it. That is the seam.
2. Extract in this order (easiest first, so the pattern is proven before the hard
   ones): `pals` → `tiles` → `sound` → `code` → `rules` → `chars` → `world`.
3. `MainWindow` is **3,008 lines / 176 methods** today. Target: under 600.

### Effort on what remains

| Phase | Effort |
| --- | --- |
| 3b — mode extraction | 3–5 d |
| 4b — docks, app bar, theme, budget meters | 3–4 d |
| 5.2+ — remaining parity (validators → tutorial) | 3–4 w |

Phase 5 parallelises freely once 3b and 4b land.

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| The Phase 3 refactor stalls mid-way, leaving two mutation paths | Port **one mode at a time**, keep tests green at every step, delete the old path last. |
| Audio underrun / drift in the frame loop | Clock off `QAudioSink` buffer level, not a `QTimer` (§5.4). This is a known, already-solved bug in the web. |
| Screenshot baselines are brittle across Qt/font versions | Assert on a downscaled/quantised image, or on specific pixels, not on exact file hashes. |
| Rendering real tiles is slower than the placebo | Cache tile `QImage`s, invalidate on `changed("bg_tiles.N")`. Budget is generous: the emulator already leaves ~8 ms/frame spare. |
| `tetanes-core` becomes unmaintained | The Python API is core-neutral by design; `plastic_core` (MIT, Rust, full APU) is a drop-in-shaped fallback — one file changes. |
