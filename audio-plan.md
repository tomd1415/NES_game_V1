# Audio integration plan (Phase 4.3)

> **Status (2026-04-26 update 2).**  *Tier A complete except for
> the Builder audio module.*  Pupils can now open the **🎵 Audio**
> page, click **📦 Load starter pack** (or upload their own
> FamiStudio `.s` files), pick a default song, and hit ▶ Play to
> hear it in their game.  PlayPipeline forwards the audio assets
> to `/play` automatically on every build, so the Builder + Code
> page also pick up the audio without any extra wiring.  The
> Builder module that maps gameplay events to sfx slots is the
> only major piece remaining — sketched at the bottom of this
> file under *Remaining follow-up*.

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

---

## What landed 2026-04-26 (Tier A foundation)

The build pipeline is in place.  An NES ROM produced via `/play`
with `audioSongsAsm` and `audioSfxAsm` blobs links the FamiStudio
sound engine plus the supplied data and runs it from `main()`'s
init and per-frame vblank update.  No-audio builds stay byte-
identical to the prior baseline.

Concretely shipped:

- **Engine vendored** under
  [`tools/audio/famistudio/`](tools/audio/famistudio/):
  `famistudio_ca65.s` (~7.5 KLOC, vendored verbatim), `famistudio_cc65.h`,
  the `NoteTables/` directory, `LICENSE`, `NOTICE.md`, `VERSION.txt`,
  and `sync.sh` for upstream refresh.  A small wrapper
  `famistudio_engine.s` sets the config flags (SFX on, DPCM off,
  NTSC) before `.include`ing the engine, so the vendored file stays
  unmodified.
- **Build pipeline** —
  [`Makefile`](steps/Step_Playground/Makefile) and
  [`cfg/nes.cfg`](steps/Step_Playground/cfg/nes.cfg).
  `USE_AUDIO=1` flag flips on the audio path, which assembles the
  engine wrapper plus `src/audio_songs.s` plus `src/audio_sfx.s`
  and links them into the ROM.  Three new optional cfg segments
  (`FAMISTUDIO_ZP`, `FAMISTUDIO_BSS`, `FAMISTUDIO_CODE`) coexist
  with cc65's runtime without segment-attribute clashes.  ZP grown
  from 26 → 254 bytes to fit the engine's ~8 byte ZP footprint.
- **Runtime hooks** in [`main.c`](steps/Step_Playground/src/main.c):
  guarded `#ifdef USE_AUDIO` blocks declare the engine API, call
  `famistudio_init` + `famistudio_sfx_init` + `famistudio_music_play(0)`
  on boot, then enable hardware NMI generation.
  `famistudio_update` is wired into the NMI handler in our project-
  local [`famistudio_crt0.s`](tools/audio/famistudio/famistudio_crt0.s)
  so it fires at the PPU's true 60 Hz vblank rate independent of
  main-loop cost — see *Phase 4.3 follow-up — NMI-driven engine
  update* below for the full reasoning, including why a project-local
  crt0 is the only viable hook point in the cc65 NES target.
- **Server staging** in
  [`playground_server.py`](tools/playground_server.py): `_build_rom`
  validates optional `audioSongsAsm` + `audioSfxAsm` strings (64 KB
  cap, must be strings, both required to enable), and the build
  paths write them into the build's `src/` and append `USE_AUDIO=1`
  to the make invocation.  Asymmetric uploads (one of the two
  missing) silently fall back to no-audio.
- **Regression suite** in
  [`tools/builder-tests/audio.mjs`](tools/builder-tests/audio.mjs):
  proves the no-audio path returns the baseline ROM, the audio path
  returns a different (non-baseline) ROM, asymmetric uploads fall
  back, and bad inputs are rejected.  Wired into `run-all.mjs`.
- **Project licence + attribution.**
  [LICENSE](LICENSE) (MIT) + [NOTICE.md](NOTICE.md) at the project
  root; the FamiStudio entry was forward-referenced before this
  phase and is now real.

What this checkpoint can do today: any caller (test, future Builder
module, future audio editor page) can POST a state with
FamiStudio-exported `.s` blobs in `audioSongsAsm` + `audioSfxAsm`
and get back an NES ROM that boots, calls `famistudio_init`, and
plays song 0 from the supplied music data.

---

## What landed 2026-04-26 (update 2 — full editor stack)

The Tier A pupil-facing experience is now complete *except* for the
Builder audio module.  Pupils can:

- Open the new **🎵 Audio** page from the nav bar (added on every
  editor page).
- Click **📦 Load starter pack** to seed two original looping
  background tracks (*Cheerful loop*, *Tense loop*) and a six-slot
  sfx pack (*jump / hit / pickup / land / blip / error*).  All
  starter content is original — no commercial NES game music.
- Upload their own FamiStudio `.s` exports (drag-drop or button).
- See per-song cards with filename / detected `music_data_*`
  symbol / byte size, mark any song as **default** (the one that
  plays at boot), or 🗑 remove individual songs.
- Watch the ROM-size audit panel turn yellow above 12 KB so they
  know when they're approaching the 32 KB program budget.
- Hit **▶ Play in NES** on the Audio page itself to build a tiny
  ROM with the current audio choices and run it in the shared
  emulator dialog.
- Have audio "just work" on the Builder + Code pages too —
  PlayPipeline serialises `state.audio` into the `audioSongsAsm`
  / `audioSfxAsm` body fields the foundation already plumbed.

Concretely shipped in update 2:

- **`state.audio` schema** in
  [play-pipeline.js](tools/tile_editor_web/play-pipeline.js):
  `{ songs: [{name, filename, symbol, asm, size}], sfx: {…} | null,
  defaultSongIdx: number }`.  New `ensureAudio` fortifier seeds an
  empty block for projects that predate the schema.
- **`audio.html` editor page** in
  [tools/tile_editor_web/audio.html](tools/tile_editor_web/audio.html):
  full library UI as described above.  Reuses `a11y.js` for text-size
  and theme controls, and the shared NesEmulator dialog.
- **PlayPipeline integration** —
  `buildPlayRequest` reads `state.audio`, concatenates every song's
  `.asm`, appends an alias trailer pointing
  `audio_default_music` at the pupil-chosen default song's symbol,
  and similarly aliases `audio_sfx_data` to the sfx pack's symbol.
  Asymmetric state (only songs OR only sfx) silently produces a
  no-audio build, matching the server's existing fallback.
- **Starter content** under
  [`tools/audio/starter/`](tools/audio/starter/): `song_cheerful_loop.fmstxt`,
  `song_tense_loop.fmstxt`, `sfx_pack.fmstxt` plus their `.s`
  outputs.  `build.sh` invokes the FamiStudio CLI (auto-builds it
  from `~/git-stuff/FamiStudio/` if missing) to regenerate the `.s`
  files from the `.fmstxt` sources; both are committed so offline
  use works without FamiStudio installed.  All starter content is
  original — no commercial-game samples.
- **`/starter/audio` server endpoint** in
  [playground_server.py](tools/playground_server.py): parses the
  bundled `.s` files for their export symbols, parses the matching
  `.fmstxt` for sfx slot names, returns a JSON payload
  `{ songs: [{name, filename, symbol, asm, size}], sfx: {…} }` the
  Audio page consumes when pupils click *Load starter pack*.
- **Audio nav link** added to all six editor pages (index,
  sprites, behaviour, builder, code, gallery) so pupils can hop to
  the Audio page from anywhere.
- **`AUDIO_GUIDE.md`** at project root: pupil-facing walkthrough
  covering install → compose → export → upload → hear it, plus
  troubleshooting and a Code-page section showing how to call
  `famistudio_music_play(N)` / `famistudio_sfx_play(idx, channel)`
  directly from a custom `main.c`.
- **`platformer.c` mirrored** — same audio macros + boot init +
  NMI-vector wiring as `main.c`, so the byte-identical-baseline
  test still passes when no modules are ticked.
- **Extended regression suite** —
  [audio.mjs](tools/builder-tests/audio.mjs) now also asserts:
  `/starter/audio` returns ≥2 songs + a sfx pack with named slots,
  the starter pack actually builds end-to-end via `/play`, and
  swapping the default-song target through PlayPipeline's alias
  trailer produces a different ROM.  All 16 smoke suites + every
  invariant in `run-all.mjs` green.

---

## Phase 4.3 follow-up — NMI-driven engine update (2026-04-25)

**Symptom (pupil-reported, after the in-browser tempo fix).**  Even in
the *local* FCEUX emulator — where the in-browser timing problems
described below don't apply — music tempo varied with on-screen
activity.  Calm scenes ran at the composed tempo; the moment the
player started moving, music slowed in proportion.  Because FCEUX
is a native 60 Hz emulator with its own audio backend, this
couldn't be a host-timing problem — it had to be in the ROM.

**Root cause.**  `famistudio_update` was being called from the main
loop's vblank window:

```text
build OAM → waitvsync → DMA → scroll_stream → scroll_apply_ppu →
famistudio_update → loop
```

When the main loop's per-frame work fits in one frame, this runs
60 times per second and music plays at the composed tempo.  When
the player starts moving, behaviour + scroll + collision work
inflates per-frame cost; the loop can't reach `waitvsync` before
the *next* vblank arrives, and effectively runs at 30 Hz.  The
engine update fires half as often, and tempo halves with it.

**Fix.**  Move `famistudio_update` off the main loop and into the
hardware NMI handler — the standard NES pattern for audio-driving
work.  The PPU asserts NMI at the start of every vblank
(60.0988 Hz NTSC) regardless of what the CPU is doing, so the
engine ticks at exactly the rate FamiStudio expects no matter how
heavy the main loop's frame is.

The wiring is non-obvious because cc65's stock NES `crt0.o`
supplies the entire `VECTORS` segment (NMI / RESET / IRQ at
$FFFA-$FFFF) with NO project-level NMI hook — the handler it
points at does `ppubuf_flush` + a scroll reset + `rti` and
nothing else.  A user-land `const void *vectors[] = {…}` array
in C lands in `RODATA` by default, NOT in `VECTORS`, so it has
no effect on the iNES vector table (this is true of every step
in the project's history; the `vectors[]` declarations in
`main.c` / `platformer.c` have always been pedagogical dead
code).  The only viable hook is to provide our own `crt0.s` —
ld65 only pulls library objects to satisfy unresolved symbols,
so once *our* crt0 exports `__STARTUP__` and `_exit`, the
library's crt0 isn't pulled and we own the vectors.

Concretely:

- New
  [`tools/audio/famistudio/famistudio_crt0.s`](tools/audio/famistudio/famistudio_crt0.s) —
  copy of cc65 v2.18's `libsrc/nes/crt0.s` (BSD-licensed; see
  `NOTICE.md`) with one substantive change: a `jsr _famistudio_update`
  in the NMI handler before the register-restore.  Everything else
  (the iNES header bytes, the startup zerobss/copydata/initlib/
  callmain dance, the `ppubuf_flush` + scroll-reset NMI work cc65's
  conio relies on) is preserved verbatim, so we don't accidentally
  break any cc65 runtime feature the rest of the project might
  depend on.
- Step_Playground Makefile assembles `famistudio_crt0.s` and lists
  it *first* in `AUDIO_OBJS` so ld65 sees its `__STARTUP__` /
  `_exit` exports before searching `nes.lib`, preventing a
  double-vectors overflow.  Only built when `USE_AUDIO=1` — the
  no-audio build still uses cc65's stock crt0, keeping the
  byte-identical baseline test honest.
- `main.c` and `platformer.c` drop the in-vblank
  `famistudio_update()` call, leaving the engine driven entirely
  by our crt0's NMI handler.  After the engine init triple, they
  write `PPU_CTRL = 0x90` (BG pattern table 1 + NMI enable bit) —
  strictly *after* init so the first vblank doesn't fire the
  handler into uninitialised engine state.
- `scroll.c`'s `PPU_CTRL_BASE` becomes `0x90` (was `0x10`) when
  `USE_AUDIO=1` — every vblank-window scroll_apply_ppu and
  column-burst stride flip writes back the NMI bit, so it stays
  asserted across frames.  Without this, scroll_apply_ppu would
  silently disable NMI on every frame and the handler would
  stop firing.

**Two false-start gotchas worth recording, since both bit during
implementation.**

- `PPU_CTRL` is *write-only* on the NES — `$2000` returns
  open-bus on read.  The intuitive `PPU_CTRL |= 0x80;` to flip
  the NMI bit after init compiles to a read-modify-write that
  ORs in random open-bus bits, often including the column-stride
  bit and the 8×16 sprite bit; symptom is "tile-sized pixel"
  rendering corruption on first run.  The fix is to write a full
  literal value (`PPU_CTRL = 0x90;`).
- Boot ordering matters even when we *do* write a literal.
  scroll.c's `PPU_CTRL_BASE = 0x90` means the boot-time
  `scroll_apply_ppu()` writes the NMI-enable bit *before*
  `famistudio_init` runs, and the very next vblank fires the NMI
  handler into zeroed engine state — APU registers get garbage
  and music dies.  Fix: call `famistudio_init` first thing in
  `main()` (before `scroll_init` / `load_world_bg` / the explicit
  `PPU_CTRL` literal in the no-scroll branch), so the engine is
  ready by the time any code path enables NMI generation.

**Safety analysis.**

- `famistudio_update` only writes APU registers ($4000–$4017).  It
  never touches the PPU, so an NMI firing in the middle of, say, a
  scroll_stream column burst (it can't — see below) wouldn't
  corrupt rendering.
- NMI fires at vblank *start*; the main loop is always either
  pre-vblank (still computing OAM / scroll prepare) or in
  `waitvsync` busy-polling `$2002`.  In both cases the NMI runs to
  completion before the main loop's vblank work begins, so the
  engine doesn't preempt mid-burst writes.
- The handler costs ~200–400 cycles, which is exactly what the old
  in-vblank `famistudio_update` cost — the cycle budget for
  OAM DMA + scroll_stream is unchanged in aggregate.
- FamiStudio's ZP footprint lives in its own `FAMISTUDIO_ZP`
  segment (declared in `cfg/nes.cfg`), separate from cc65's
  `ZEROPAGE`.  The NMI handler can write its ZP without disturbing
  any cc65-emitted state on the main loop's stack frame.
- A/X/Y are pushed/popped in the cc65-derived NMI prologue / epilogue
  because `famistudio_update` (and `ppubuf_flush`) clobber all three
  and the interrupted main-loop code expects them preserved across
  an interrupt return.

**Verification.**  Full regression suite (`run-all.mjs`) green:
all 16 builder smoke suites pass, and the byte-identical-ROM
invariant proves the no-audio path is unchanged (`famistudio_crt0.s`
is only assembled / linked when `USE_AUDIO=1`; without it, ld65 falls
back to cc65's stock crt0 exactly as before).  Manually verified by
dumping the iNES vectors out of an audio-build ROM (`$FFFA = $8035`
points into our crt0, and the bytes there decode to the documented
NMI handler ending in `jsr $99F3` — the linker map confirms `$99F3`
resolves to `_famistudio_update`).

---

## Known limitation — in-browser audio tempo wobble

**Symptom (pupil-reported 2026-04-26).**  When the in-browser
emulator (jsnes) runs a ROM with audio, the music tempo can speed
up or slow down based on what's happening on screen — calm scenes
play at near-60 Hz, busy ones (lots of sprites + scrolling) drop
the emulator below 60 Hz and the music sounds like it's
stuttering or warping.

**Root cause.**  jsnes is single-threaded JavaScript that runs on
the browser's main thread; we drive its `nes.frame()` from a
fixed-rate `setInterval` and feed `onAudioSample(left, right)`
into a Web Audio ring buffer that a `ScriptProcessorNode` drains.
The audio device consumes at 44.1 kHz regardless of what the
emulator is doing.  When the main thread is busy (heavy scenes,
GC, layout reflow, the ScriptProcessorNode's own callback running
in the same thread), `nes.frame()` runs slower than its target
16.67 ms cadence, the ring buffer underruns, and the audio device
reads stale samples — perceived as tempo wobble.

**What we've done about it (2026-04-26).**

- Switched the emulator's frame loop from `requestAnimationFrame`
  to `setInterval(tick, 1000 / 60)` with a small catch-up loop
  (max 4 frames / tick).  rAF was getting throttled by the same
  rendering pressure that was slowing the page; setInterval is
  steady and runs at the same priority as the audio script
  processor.
- Audio ring buffer at 4096 stereo frames (~93 ms) so a single
  late tick doesn't underrun.  Larger buffer would mask more
  wobble but adds noticeable input latency, so we kept it
  conservative.
- The `Local (fceux)` play mode is unaffected — it runs the ROM
  in a native emulator with its own audio backend.  Pupil docs
  point pupils at it when they need rock-steady playback (for
  recording, classroom showcases, etc.).

**What we haven't done (potential future work).**

- Move emulation off the main thread into a Web Worker, so the
  rendering pressure on the editor pages can never starve the
  emulator.  Worth doing if Web Audio's `AudioWorklet` migration
  is also on the cards (the worklet runs in its own thread
  already, and could pull samples directly from the worker via a
  SharedArrayBuffer).
- Replace `ScriptProcessorNode` (deprecated) with `AudioWorklet`.
  The worklet runs on the audio thread, so the emulation step
  could be triggered from there, guaranteeing tempo accuracy.
  Bigger change — needs a separate worklet file and changes to
  how we ship `emulator.js`.
- Resample emulator output to match the audio device's actual
  sample rate (we currently request 44.1 kHz and hope the browser
  honours it).  Most do; some Pixel-class Android browsers are
  fixed at 48 kHz and the slight pitch shift is currently
  imperceptible.

For pupils who need recording-grade audio today, the *Local
(fceux)* play mode in the ▶ Play dropdown is the answer.

---

## Remaining follow-up

The major piece left in Tier A is the Builder audio module — the
piece that lets non-Code-page pupils map gameplay events to specific
sfx slots without writing C.  Concrete plan:

1. **Builder `audio` module** in
   [tools/tile_editor_web/builder-modules.js](tools/tile_editor_web/builder-modules.js).
   Pupils tick the module, optionally fill in:
   - **Event sfx** — `jump`, `player_hit`, `pickup`, `land`,
     `dialog_open`, `door_transition`.  Each maps to either
     "(none)" or a numbered slot from the project's sfx pack.
   - **Track triggers** — `start_song` (which song plays at boot),
     `track_per_scene[]` (one per scene instance), `low_hp_track`
     (when HP ≤ threshold), `win_jingle`, `lose_jingle`.
   - Pulls the available songs / sfx slots from `state.audio` so
     the dropdowns auto-populate as pupils upload content.
2. **Assembler emit** in
   [tools/tile_editor_web/builder-assembler.js](tools/tile_editor_web/builder-assembler.js):
   inserts `famistudio_sfx_play(N, FAMISTUDIO_SFX_CH0)` calls into
   the matching event hooks of `platformer.c` (jump, hit, etc.) and
   a `track_for_state(...)` switch that runs in vblank to swap
   tracks based on game state.
3. **Audit panel addition** on the Audio page: list which events
   currently fire which sfx slot (single source of truth via
   `state.builder.modules.audio` mappings, mirrored on the audio
   page so pupils don't need to switch to the Builder to check).
4. **Update `audio.mjs`** to assert that an enabled audio Builder
   module emits the expected `famistudio_sfx_play(...)` strings in
   the assembled `customMainC`.

Effort: ~½–1 focused session, as scoped above.  Schedule whenever a
pupil starts wanting hand-mapped event sfx without going to the
Code page.

---

## Roadmap parking spot

**Comprehensive Code-page pupil documentation
(`CODE_GUIDE.md`).**  Separate work item — flagged by the user
during the Phase 4.3 kick-off.  Tracked under §4.7 of
[next-steps-plan.md](next-steps-plan.md).  Covers what the Code
page does, when to use it vs the Builder, the project-state
contract, common patterns (input / animation / scrolling /
audio), and debugging build errors.  This audio guide already
covers the Code-page audio bits; the broader guide rolls those in.
