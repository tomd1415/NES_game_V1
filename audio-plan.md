# Audio integration plan (Phase 4.3)

> **Status (2026-04-26).**  Plan agreed.  Implementation pending.
> Existing 4.3 sketch in [next-steps-plan.md](next-steps-plan.md)
> rolled into this document; that section now points back here.

This document fleshes out Phase 4.3 — adding music + sound effects
to pupil games.  Two tiers, in order:

- **Tier A (this phase) — Vendor + integrate.**  Bundle Mathieu
  Gauthier's [FamiStudio sound engine](https://famistudio.org/)
  into the build, expose it through a new `audio` Builder module
  and an `audio.html` editor page.  Pupils author their music in
  standalone FamiStudio desktop, export to `.s` assembly, upload
  to our editor.  Works for every pupil who has FamiStudio
  installed (most do already).
- **Tier B (deferred follow-up) — Browser-native simplified
  composer.**  Only if Tier A's "install FamiStudio" friction
  blocks pupils on Chromebooks / locked-down classroom kit.
  Targeted at pupils new to programming, so a deliberately
  *narrow* feature set: monophonic 1-channel jingles, click-cell
  pattern editor, single-octave palette, Web Audio preview, export
  to the same `.s` format the Tier A engine consumes.  Sketched
  at the end of this document; full plan when needed.

---

## Licensing — clear before we vendor

| Component                                       | Licence                                                     |
|--------------------------------------------------|--------------------------------------------------------------|
| `famistudio_ca65.s` (the runtime)                | "Copying and distribution permitted in any medium without royalty provided the copyright notice and this notice are preserved" — i.e. more permissive than MIT, just keep the notice |
| `famistudio_cc65.h` (the cc65 wrapper)           | Same permissive notice                                       |
| FamiStudio root `LICENSE`                        | MIT (Copyright (c) 2019 BleuBleu)                            |
| `ThirdParty/NesSndEmu`, `NotSoFatso`, `ShineMp3` | LGPL / GPL — *editor only, not the runtime*.  We do **not** vendor these. |

Net: we vendor only the two files that ship inside the pupil's
NES ROM.  Their notice goes in `tools/audio/NOTICE.md` and the
file headers are preserved verbatim.  No copyleft contagion.

---

## Tier A — file-by-file plan

### A.1  Vendor the runtime

- New folder `tools/audio/famistudio/` (sibling of
  `tools/tile_editor_web/`, `tools/builder-tests/`, `tools/gallery/`).
- Files (copied verbatim, headers preserved):
  - `famistudio_ca65.s` (~7 500 lines) — the runtime
  - `famistudio_cc65.h` (151 lines) — cc65 API
  - `LICENSE.txt` — copy of FamiStudio's root MIT
  - `NOTICE.md` — credit to Mathieu Gauthier + Shiru (FamiTone2),
    pointer to https://famistudio.org/, version stamp (4.5.0)
  - `README.md` — one-liner "what this is, where it came from,
    don't edit by hand, regenerate from upstream by running
    `tools/audio/sync.sh`"
- New `tools/audio/sync.sh` — pulls the two files from a
  configurable upstream path (default
  `/home/duguid/git-stuff/FamiStudio/SoundEngine/`), applies a
  short banner above each saying "vendored — do not edit", commits
  hash recorded in `tools/audio/famistudio/VERSION.txt`.

### A.2  Build pipeline

- [steps/Step_Playground/Makefile](steps/Step_Playground/Makefile)
  gains an opt-in `USE_AUDIO` flag (defaults off — keeps the 1×1
  byte-identical baseline test honest):
  - When `USE_AUDIO=1`: assemble `tools/audio/famistudio/famistudio_ca65.s`
    and link it; assemble + link any per-project `audio_songs.s`
    and `audio_sfx.s` blobs that the playground server stages
    into `src/`; `#define FAMISTUDIO_CFG_*` flags driven by the
    Builder module's settings (per below).
- The playground server's `_build_in_tempdir` / `_build_in_shared_dir`
  paths get a small `_stage_audio_assets(state, dst_src_dir)` helper
  that writes the pupil's uploaded `audio_songs.s` / `audio_sfx.s`
  bytes (or empty stubs) into `src/`.  When the audio Builder
  module is enabled, the helper sets `make USE_AUDIO=1`.
- The build invariant test stays green for 1×1 because audio is
  off by default.  A new `audio.mjs` smoke suite covers the
  `USE_AUDIO=1` paths (see A.6).

### A.3  Builder module

- New `audio` module in
  [tools/tile_editor_web/builder-modules.js](tools/tile_editor_web/builder-modules.js).
  Default state: disabled.  When enabled, contributes:
  - `#define USE_AUDIO 1` into the Builder declarations slot (so
    the platformer template's `#if USE_AUDIO` blocks compile in).
  - `#define FAMISTUDIO_CFG_SFX_SUPPORT 1` if any sfx mappings
    exist; otherwise leaves it 0 to save ROM space.
  - Init code in the `boot` slot:
    ```c
    famistudio_init(FAMISTUDIO_PLATFORM_NTSC, music_data_default);
    famistudio_sfx_init(sounds);  // only when sfx enabled
    famistudio_music_play(0);
    ```
  - One frame call in the `vblank_writes` slot:
    ```c
    famistudio_update();
    ```
  - **Event sfx hooks** — small `play_sfx(idx, channel)` calls
    inserted into the relevant Builder modules' existing event
    points (no new event hooks required):
    - `players.player1.jump`         → `audio.events.jump`         (default sfx 0)
    - `damage.player_hit`             → `audio.events.player_hit`   (default sfx 1)
    - `pickups.collect`               → `audio.events.pickup`       (default sfx 2)
    - `players.player1.land_solid`    → `audio.events.land`         (off by default)
    - `dialogue.open`                 → `audio.events.dialogue_in`  (off by default)
    - `door.transition`               → `audio.events.door`         (off by default)
    Unmapped events compile to nothing.
  - **Track triggers** — `track_for_state(scene_idx, hp, …)`
    returns the right song index for the current game state.
    Implemented as a small switch in the assembler emitter; the
    runtime calls `famistudio_music_play(track_for_state(...))`
    only when the previous frame's state→track mapping yields a
    different result, so we don't restart the song every frame.
    Triggers exposed today:
    - `start_song`                    — index played at boot
    - `track_per_scene[scene_idx]`    — different song per scene
      (uses the existing scene-instance system from Phase B)
    - `low_hp_track`                  — when `player_hp <=
      LOW_HP_THRESHOLD` (configurable, defaults 1)
    - `win_jingle`                    — one-shot non-looping song
      played on win-condition trigger (already in Builder)
    - `lose_jingle`                   — same, on death
- Builder UI: a panel listing every event + every trigger, each
  with a dropdown of available songs/sfx.  "(none)" is always
  the first option so pupils can leave an event silent.  Disabled
  events show "(no audio uploaded)" until the pupil uploads at
  least one sfx.

### A.4  Audio editor page

- New page [tools/tile_editor_web/audio.html](tools/tile_editor_web/audio.html)
  added to the nav on every editor page.
- Layout (top to bottom):
  1. **Quick start banner.**  Three steps + screenshots:
     1. Install [FamiStudio](https://famistudio.org/) (link).
     2. Compose a song.  *File → Export → FamiStudio Sound
        Engine assembly* → choose `ca65` format → save the `.s`
        file.
     3. Drag the `.s` here, or click *Upload song*.
  2. **Songs section.**  Card list of uploaded songs.  Per-song:
     filename, detected `music_data_*` symbol, byte count, "▶
     Preview" button (uses the existing `/play` pipeline to
     build a one-tap "play this song" ROM and run it in the
     shared emulator), 🗑 Remove.  *Upload song* button at the
     bottom.
  3. **Sound effects section.**  Same shape as Songs but for
     sfx files (single `.s` exported from FamiStudio's *Export →
     FamiStudio Sound Engine sound effects* — one file holds
     up to 128 sfx slots).
  4. **Mappings.**  Two tables — *Events → SFX* and *Triggers
     → Songs*.  Same dropdowns as the Builder module; editing
     here updates the same `state.builder.modules.audio` entries
     so opening the Builder shows the same selections.
  5. **Audit panel.**  Live size estimate (sum of song bytes +
     sfx bytes + sound engine ~3.5 kB).  Warns if the ROM is
     getting close to 30 kB so pupils know they're approaching
     the NROM limit.
- Persists to `state.builder.modules.audio.songs[]` and
  `state.builder.modules.audio.sfx` (single sfx blob — FamiStudio
  packs them all into one file).  Storage layer is the existing
  `Storage.saveCurrent` — no schema migration needed beyond the
  new module key, which the Builder fortifier will fill in with
  defaults on load.

### A.5  Pupil-facing quick-start guide

- New file `AUDIO_GUIDE.md` at project root, modelled on
  `PUPIL_GUIDE.md`.  Covers:
  - "What is FamiStudio?" — 2 paragraphs + a screenshot.
  - **Install** — links to Windows / macOS / Linux installers.
  - **Compose** — 60-second walkthrough: pick an instrument
    (square 1), click some notes on the piano roll, hit play to
    hear it.
  - **Export to our editor** — *File → Export → FamiStudio
    Sound Engine assembly* → `ca65` format → save somewhere
    you'll remember.
  - **Upload** — open our Audio page, drop the `.s` file in.
  - **Wire it up** — in the Builder, tick *Audio → Play
    music_data_my_song on start*.  Hit ▶ Play.
  - **Sound effects** — same flow but use *Export → Sound
    effects*; each sfx in FamiStudio becomes a numbered slot.
- A link to this file goes in the audio.html quick-start banner.

### A.6  Tests

New `tools/builder-tests/audio.mjs` smoke suite covers:

- **Default off → byte-identical preserved.**  Build a no-modules
  project and assert byte 6 of the ROM is unchanged from the
  baseline (already covered by the existing `byte-identical-ROM`
  invariant; the audio test re-asserts to make the dependency
  explicit).
- **Engine assembles + links.**  Build a tiny project with the
  audio module enabled but no songs/sfx uploaded — should
  succeed and produce a slightly-larger ROM.  Asserts the
  produced binary contains the symbol `_famistudio_init`
  (linker map check).
- **Song upload round-trip.**  POST a tiny stub song (single
  `.byte` blob exporting `music_data_test`) to `/play` with an
  audio-enabled state, assert the build links it and the ROM
  contains the song bytes at the expected offset.
- **SFX upload round-trip.**  Same shape, with the demo sfx
  blob from `SoundEngine/DemoSource/sfx_ca65.s`.
- **Event-to-sfx wiring.**  With damage + audio enabled and the
  `player_hit` event mapped to sfx 1, assert the assembler
  emits `famistudio_sfx_play(1, FAMISTUDIO_SFX_CH0)` somewhere
  in the damage handler.
- **Trigger wiring.**  Boot-song trigger emits the matching
  `famistudio_music_play(N)` in the boot block; per-scene
  trigger emits a `track_for_state` switch table.

Wired into `run-all.mjs` next to the other `*.mjs` suites.

### A.7  Documentation updates

- [next-steps-plan.md](next-steps-plan.md) §4.3 replaced with a
  one-paragraph summary pointing at this file.
- [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md): the 2026-04-20 "Import
  FamiStudio music/SFX files" entry flips to `[planned]` while
  this lands, then `[done]` on ship.
- [README.md](README.md) gains an *Audio* paragraph linking to
  `AUDIO_GUIDE.md`.

### A.8  Effort + ordering

| Step | Effort | Notes |
|---|---|---|
| A.1 vendor + sync script | S (½ day) | mechanical |
| A.2 Makefile + server staging | M (1 day) | requires careful gating to keep byte-identical baseline |
| A.3 Builder module + emitter | M (1 day) | event hooks are the fiddly bit |
| A.4 audio.html page | M (1 day) | upload UI + previews |
| A.5 AUDIO_GUIDE.md | S (½ day) | content writing + screenshots |
| A.6 tests | S (½ day) | mostly stub-and-assert |
| A.7 doc updates | S (½ hour) | small |
| **Total** | **L (~4 focused days)** | spread across 2-3 sessions |

Risks:
- **ROM size**.  Audio engine + a few songs + sfx can easily
  push past 24 kB PRG.  We're on NROM-256 (32 kB PRG), so
  margin is real but finite.  The audit panel (A.4) makes it
  visible to pupils.
- **Tempo / NTSC vs PAL**.  Engine handles both, we hard-code
  `FAMISTUDIO_PLATFORM_NTSC` since the cartridge config is NTSC.
  Document the limitation.
- **OAM DMA / vblank budget**.  `famistudio_update` runs in
  vblank.  Cost is small (~200-400 cycles) but combined with the
  scroll engine + dialogue + OAM DMA could push close to budget
  on busy frames.  The same `PPU_MASK` wrap that protects
  scroll_stream covers this for free; verify in the smoke test.

---

## Tier B — browser-native simplified composer (deferred)

Triggered if pupils on locked-down kit can't install FamiStudio.
Deliberately *narrow* — these pupils are new to programming and
won't use most FamiStudio features.

**Scope (kept tight on purpose):**

- One song per project (multi-song stays a Tier A feature).
- Up to 16 patterns of 16 cells each (256 steps).
- Two melodic channels (Pulse 1 + Pulse 2) — no triangle / noise
  / DPCM.
- Single octave (C4 - B4) on a click-grid; pupils click a cell to
  set a note, click again to clear.
- Fixed tempo dropdown (60 / 90 / 120 / 150 BPM) — no in-song
  tempo changes.
- Two pre-defined instruments: "lead" (square 12.5%) and
  "chord" (square 50%).  No envelope editor.
- One sfx editor that's the same grid UI but 8 cells × 1
  channel.

**Architecture:**

- New `tools/tile_editor_web/audio-composer/` module folder
  (separate from the Tier A page so they coexist).
- Web Audio API for preview — *not* cycle-accurate APU, just
  oscillators tuned to the right frequencies with the right
  duty cycle.  Good enough for "did I write the song I meant
  to?".  Document the discrepancy with FamiStudio output.
- **Export to FamiStudio engine `.s` format** (so it goes
  through the same Tier A pipeline — single source of truth for
  the runtime).  Port the relevant slice of
  [`Source/IO/FamitoneMusicFile.cs`](https://github.com/BleuBleu/FamiStudio/blob/master/FamiStudio/Source/IO/FamitoneMusicFile.cs)
  to JS.  Only the subset that handles our narrow feature set —
  probably ~300-500 lines of JS vs the original 2 700 of C#.
- Test suite asserts the JS export of a known sequence is
  byte-identical to FamiStudio desktop's export of the same
  sequence (round-trip via the FamiStudio CLI export, captured
  once into a fixture).

**Effort: weeks, not days.**  Roughly Phase 4.2-sized.  Wait until
a pupil actually hits the install-blocker before scheduling.

---

## Summary

Tier A is the right next thing.  Pupils who already use
FamiStudio (most of them, per the user's report) get music + sfx
in their games at the cost of a vendoring step + a Builder module
+ a page.  Tier B sits parked behind a deliberately-tight scope
so it can ship in weeks rather than months *if* it turns out to
be needed.
