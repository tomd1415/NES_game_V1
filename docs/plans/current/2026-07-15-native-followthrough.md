# Native follow-through — the work after the build-out

**Status: complete.** All five phases below have landed. Tests: 364 → **404**.

| Phase | What | State |
| --- | --- | --- |
| 1 | Fix what the app *claims* and does not do | ✅ |
| 2 | Drive the mouse | ✅ |
| 3 | Failure paths | ✅ |
| 4 | Make it a real desktop application | ✅ |
| 5 | Docs | ✅ |

**Two false claims found and fixed** (§1): the Time Machine told the pupil
"Ctrl+Z undoes this" and then cleared the undo stack, and "Hear this song"
permanently changed which song their game starts with. Both are the same class as
the `instance["sprite"]` bug from the build-out — *something the code said it did
and did not*. Both now have tests that fail against the old behaviour.

**One more clipping bug found by looking at the app** (§4): the widest inspector
(CHARS, 338px) did not fit the dock (324px), so its controls were cut off. The
guard test had passed only because it sampled the viewport width once, before the
layout settled; it now measures per mode, and also checks the dock's own contents.

Successor to
[`2026-07-14-native-build-plan.md`](2026-07-14-native-build-plan.md), whose phases
are all complete (8 modes, validators, tutorials, Time Machine, budget meters,
asset I/O; `MainWindow` 3,008 → 745 lines; 364 tests green).

This plan covers what that build-out left behind. It is deliberately short and
ordered by **honesty first**: two things the app currently *claims* that are not
true, then the tests that would have caught them, then the last of the parity
list.

---

## Phase 1 — Fix what the app claims and does not do

These are not missing features. They are **statements the UI makes to a pupil that
are false**, which is worse than a gap.

### 1.1 “Ctrl+Z undoes this” — the Time Machine restore is not undoable

`TimeMachineDialog` tells the pupil, in the confirmation dialog:

> Your current version is snapshotted first, and Ctrl+Z undoes this.

It does not. `restore()` calls `ProjectSession.reload()`, which builds a **new**
`ProjectDocument`; `MainWindow.after_project_replaced()` then calls
`store.rebind()`, which **clears the undo stack**. A pupil who restores the wrong
version cannot get back, and we told them they could.

`recover_autosave()` has exactly the same shape and the same problem.

**Fix.** Restoring a snapshot is not a *project switch* — it is an **edit**. Apply
the snapshot's JSON to the live document in place and let it commit as one normal
undo step, exactly as `DocumentStore._restore` already does for undo itself:

```python
# MainWindow
def apply_document_json(self, payload: bytes, message: str) -> None:
    """Replace the document's contents *in place*, as one undoable edit."""
    document = self.document
    document.state.clear()
    document.state.update(json.loads(payload))
    document.dirty = True
    self.document_edited(message)   # schedule_save → DocumentStore commits a step
    self.refresh_all_editors()
```

The document object is never replaced, so no mode is stranded and no history is
thrown away. `repository.restore_snapshot()` is then not needed at all: the
autosave writes the restored state back through the normal path. That deletes
code *and* makes the claim true.

**Tests.** Restore, then undo, and assert the pre-restore state is back — driven
through the real dialog, not a helper.

### 1.2 “Hear this song” silently and permanently changes the project

`SoundMode._preview()` calls `set_default_song(index)` before building. Previewing
a song is a *question*, not an edit — and this answers it by permanently changing
which song the pupil's game starts with. Undo covers it, but they did not ask for
an edit and will not know one happened.

**Fix.** Build a **detached copy** of the document with that song as default and
play the ROM from it. The project is untouched. `BuildPlayController.build()`
already builds against `ProjectDocument.from_json(document.to_json())`, so this is
a `build(document=...)` parameter, not new machinery.

---

## Phase 2 — Drive the mouse

`tests/unit/test_world_canvas.py` imports `QTest` and uses it for **keyboard
only**. Every mouse handler in the app is exercised through the direct API
(`canvas.edit_cell(3, 4)`) and never through a real event:

- `WorldCanvas.mousePressEvent/mouseMoveEvent/mouseReleaseEvent` — drag-painting,
  entity drag, rubber-band selection, and the new **right-click eyedropper**;
- `SpriteCanvas` — the whole CHARS pencil, including the flip correction;
- `_PixelCell` in TILES — the drag-across-pixels path, which is bespoke code
  written *because* `QPushButton.clicked` cannot drag.

A bug in any of the coordinate maths — `_cell_at`, `_grid_geometry`, `_pixel_at`,
the zoom factor I just added — would ship green. The geometry is the part most
likely to be wrong and the part least covered.

**Build `tests/ui/test_mouse.py`**, driving `QTest.mousePress/mouseMove/
mouseRelease` at real pixel positions and asserting on the **document**:

| What | Asserts |
| --- | --- |
| Click a WORLD cell at a known pixel | the *right* cell changed, not a neighbour |
| Drag across five cells | all five painted, and it is **one** undo step |
| Right-click a cell | tile/palette/behaviour adopted (the eyedropper) |
| Drag an entity | its `x`/`y` move, in world coordinates, not screen ones |
| Rubber-band select, copy, paste | the region lands where it was dropped |
| Zoom to 2×, then click | the cell maths still agrees with what is drawn |
| Drag on the CHARS canvas | pixels land in the right tile, through a flipped cell |
| Drag across the TILES pixel grid | a line is drawn, not one pixel |

The zoom row is the point: I added `set_zoom()` and nothing proves a click still
hits the cell under the cursor at 2×.

---

## Phase 3 — Failure paths

Most `QMessageBox` branches are untested. A dialog that crashes, or that never
appears, is invisible to every test we have.

**Build `tests/ui/test_failure_paths.py`**, monkeypatching `QMessageBox` and
`QFileDialog` to record calls rather than block:

- a build that fails → the error dialog *and* the log lands in CODE;
- importing a `.chr` that is not a whole number of tiles → warned, project intact;
- importing a `.pal` of the wrong length → warned, palettes intact;
- deleting the last background → refused;
- duplicating a tile with no free slot → informed, not crashed;
- the shared-tile guard's three answers → Everywhere / Duplicate / Cancel each do
  what they say;
- opening a corrupt project file → refused, current project intact.

---

## Phase 4 — Make it a real desktop application

There are **no image assets at all**; every icon is procedurally painted at
runtime, and the app has no icon in the launcher, the task switcher, or the
window decoration. On a school image, an app with no icon looks like it does not
belong there.

- **`resources/icons/`** — a real app icon, and one per mode, generated as 8×8/16×16
  NES-style pixel art scaled with nearest-neighbour, coloured **from the NES system
  palette** (so the chrome is honest about the machine, as the theme already is).
  Generated by a checked-in script so they can be regenerated, not hand-drawn
  binaries nobody can edit.
- **Wire them**: `QApplication.setWindowIcon`, the mode rail, the About box.
- **`io.github.tomd1415.NESStudio.Devel.desktop`** + AppStream metainfo, so the app
  installs into a launcher like any other Linux application, and `.nes`/project
  files can be associated with it.

---

## Phase 5 — Documentation and commit hygiene

- Fold the two false claims (§1) into the build plan's "bugs found" list — they are
  the same class as the `instance["sprite"]` bug: something the code *said* it did.
- A hook committed the build-out as `d1512ee "Claude added work"`. Ask the user
  whether to squash/rewrite it before adding to it.

---

---

## What landed

| Phase | Delivered |
| --- | --- |
| 1.1 | `MainWindow.apply_document_json()`. Restoring a snapshot mutates the document **in place** and commits one undo step, instead of reloading the session (new document + `store.rebind()` = cleared history). `repository.restore_snapshot()` is no longer used by either path — the autosave writes the restored state back normally, so this **deleted** code as well as fixing the lie. Covers the Time Machine *and* `File → Restore Latest Snapshot`. |
| 1.2 | `BuildPlayController.build(document=…, transient=True)` + `preview()`. SOUND builds a **throwaway copy** with the chosen song as default; the project's default song, dirty flag, undo stack, ROM, build log and build count are all untouched. |
| 2 | `tests/ui/test_mouse.py` — 12 tests driving real `QMouseEvent`s: click-a-cell, drag-paints-a-line, drag-is-one-undo-step, right-click eyedropper, **click-at-2×-zoom**, entity drag (world coordinates, not widget ones), rubber-band + copy/paste, the CHARS pencil through a flipped cell, and the TILES pixel-grid drag. Needed two new public accessors — `WorldCanvas.cell_centre()` / `entity_position()` and `SpriteCanvas.pixel_centre()` — so a test can click the cell it *means* to. |
| 3 | `tests/ui/test_failure_paths.py` — 14 tests. Both halves asserted every time: **the pupil was told**, and **the project survived**. Required a seam: `SharedTileGuard.ask()` (the question) is now separate from `check()` (the consequences), so the three answers can be tested without faking Qt. |
| 4 | `scripts/generate_icons.py` → an app icon at six sizes and one per mode, as NES pixel art (a test asserts every colour is an index into the real system palette). Wired into the window, the application, and the mode rail — where a **locked** mode now shows a dimmed icon as well as a padlock. `packaging/` ships a `.desktop` entry, AppStream metainfo, and a rootless installer. |
| 5 | This document, `native/README.md`, `CLAUDE.md`, the build plan. |

### Bugs found while doing it

1. **The Time Machine's promise was false** (§1.1) — the headline of this plan.
2. **"Hear this song" silently edited the project** (§1.2).
3. **The widest inspector did not fit the dock.** CHARS needs 338px; the dock gave
   it 324. The guard test from the last round *passed* because it sampled the
   viewport width once, before the layout settled — so it measured a width no mode
   was ever laid out at. It now measures per mode, and also checks the dock host's
   own contents (the mode help text was wrapping past the edge).

### Two new testing traps, both of which cost time

- **A modal dialog hangs the suite.** `QMessageBox.warning(...)` is a static helper
  you can patch, but a failed build *constructs* a `QMessageBox` and calls
  `.exec()` — which blocks forever with nobody to click it. Patch `.exec` as well.
- **`QTest.mouseMove` does not carry the button state.** A drag driven with it
  arrives as a hover and paints nothing, so the test passes vacuously.
  `test_mouse.py` builds its `QMouseEvent`s by hand for exactly this reason.

---

## Explicitly still not doing

- **Cross-mode *live* repaint.** On re-examination this is close to moot: only one
  mode is visible at a time, and `select_mode()` refreshes unconditionally, so a
  tile edited in TILES *is* shown when WORLD is next opened. A per-edit change
  signal would buy simultaneous views and cheaper refreshes, and nothing needs it
  yet. Recorded as a deliberate deferral rather than left implicitly missing.
- **A per-edit command API** to replace the direct `document.set_*()` calls. Undo
  covers them and `ModeContext.edited()` is one place; rewriting ~160 call sites
  has no user-visible payoff.
- **Gallery / accounts / cloud publish** — server-coupled, out of scope.
