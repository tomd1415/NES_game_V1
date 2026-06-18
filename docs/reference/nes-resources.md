# NES development resources

> **Why this file exists.**  The NES has been around since 1983
> and has been reverse-engineered in extraordinary detail by
> hobbyists.  Almost every problem this project hits has already
> been solved somewhere; this page is the curated short-list of
> *the* references I'd reach for first, with one line on what
> each answers.  Pupils, teachers, and future contributors —
> when something feels stuck, check here before reinventing.

## Architecture & best-practice review (read this first)

- **[Codegen & NES architecture review](codegen-and-nes-architecture-review.md)**
  (2026-06-17) — how the Builder turns pupil choices into a ROM, where the
  engine deviates from NES best practice (the NMI/frame model, metatiles, CHR
  fonts, the vblank budget), the "should we rewrite in assembly?" verdict
  (no — and why), and a prioritised roadmap.  The references below are the
  evidence behind it.

## Hardware reference (start here for "why does X behave that way?")

- **NESdev wiki — The frame and NMIs** — <https://www.nesdev.org/wiki/The_frame_and_NMIs>.
  The canonical NES game-loop structure: build a VRAM-update buffer in the
  main loop, flush it to the PPU *inside* the NMI handler during vblank, and
  never write `$2006`/`$2007` mid-frame.  The playground engine uses a
  simpler `waitvsync()` model instead — see the architecture review §N1/N2.
- **NESdev wiki — PPU frame timing** — <https://www.nesdev.org/wiki/PPU_frame_timing>.
  The ~2273-cycle NTSC vblank budget — how much you can write per frame
  before writes spill into active render (the dialogue glitch, review §N5).
- **NESdev wiki — PPU rendering** — <https://www.nesdev.org/wiki/PPU_rendering>.
  Authoritative cycle-accurate diagram of when the PPU fetches
  tiles, when sprite evaluation happens, and what scanline
  triggers each PPU register latch.  Indispensable when scroll
  glitches show up.
- **NESdev wiki — PPU scrolling** — <https://www.nesdev.org/wiki/PPU_scrolling>.
  Loopy's diagram of T (temp) and V (current) VRAM-address
  registers, and exactly which `$2000`/`$2005`/`$2006` write
  affects which bits.  Read this before touching `scroll.c`.
- **NESdev wiki — Mirroring** — <https://www.nesdev.org/wiki/Mirroring>.
  Why nametables alias, what 4-screen mirroring buys you, and the
  iNES-header byte-6 bit layout.  Background for Phase 4.4 and
  any future T3.2 (beyond-2-screens) work.
- **NESdev wiki — APU** — <https://www.nesdev.org/wiki/APU>.
  The five audio channels and their registers ($4000-$4017).
  Pair with the FamiStudio engine source when debugging audio.
- **NESdev wiki — INES file format** — <https://www.nesdev.org/wiki/INES>.
  The 16-byte ROM header.  Phase 4.4 patches byte 6 of this
  header from the playground server.

## Toolchain

- **cc65 — NES target docs** — <https://cc65.github.io/doc/nes.html>.
  How cc65's NES backend is wired up: linker config, calling
  conventions, what `crt0.s` does (which we now ship a project-
  local copy of for audio).
- **cc65 — `__fastcall__` etc.** — <https://cc65.github.io/doc/cc65.html>.
  C language extensions that affect how the compiler emits
  parameters.  Critical for bridging C and asm.
- **ca65 user guide** — <https://cc65.github.io/doc/ca65.html>.
  Macros, segments, and the `.proc`/`.endproc` scoping that the
  vendored FamiStudio engine relies on.
- **ld65 user guide** — <https://cc65.github.io/doc/ld65.html>.
  How memory areas + segments + the `.cfg` file fit together.
  Read this before debugging "memory area overflow" errors.
- **cc65 — coding for size/speed** — <https://cc65.github.io/doc/coding.html>
  and **ilmenit's CC65 advanced optimisations** —
  <https://github.com/ilmenit/CC65-Advanced-Optimizations>.
  How to write cc65 C that compiles tight (zeropage, no recursion, static
  locals, struct-of-arrays).  Relevant to the no-optimisation tradeoff the
  engine currently makes for byte-identical builds — review §N7/§3.1.
- **Shiru — Programming NES games in C** — <https://shiru.untergrund.net/articles/programming_nes_games_in_c.htm>.
  The reference write-up for the cc65-plus-neslib approach this project uses;
  good background on where C is fine and where you drop to asm.

## Emulators / debugging

- **FCEUX wiki** — <https://fceux.com/web/help/Overview.html>.
  PPU Viewer, Name Table Viewer, Hex Editor, code/data logger.
  See [DEBUGGING_FCEUX.md](../guides/DEBUGGING_FCEUX.md) for the
  workflows we use.
- **Mesen 2** — <https://www.mesen.ca/docs/>.
  Strictly more accurate emulator than FCEUX with a more modern
  debugger; useful as a second opinion when FCEUX disagrees with
  hardware on edge cases.  Not currently in our toolchain — flag
  this if you suspect FCEUX-specific behaviour.
- **jsnes** — <https://github.com/bfirsh/jsnes>.
  The in-browser emulator embedded in every editor page.  Less
  cycle-accurate than FCEUX or Mesen; document any deltas you
  hit in [`docs/feedback/recently-observed-bugs.md`](../feedback/recently-observed-bugs.md).

## Audio

- **FamiStudio docs** — <https://famistudio.org/doc/>.
  Reference for the music tool itself: tempo modes, grooves, and
  the export options we drive from `tools/audio/starter/build.sh`.
- **FamiStudio engine source notes** — at the top of
  `tools/audio/famistudio/famistudio_ca65.s`.  The vendored
  engine has comprehensive comments — when wiring a new feature,
  read the matching `.if FAMISTUDIO_USE_*` block first.
- **Shiru's FamiTone2 page** — <https://shiru.untergrund.net/code.shtml>.
  FamiTone2 is the predecessor FamiStudio's engine builds on.
  Useful when you want a lighter-weight engine reference.

## Graphics workflow

- **NESdev wiki — CHR ROM/RAM** — <https://www.nesdev.org/wiki/PPU_pattern_tables>.
  How the 8 KB pattern-table area is organised on the cartridge
  side.  Background for the Aseprite → CHR pipeline in
  [ASEPRITE_WORKFLOW.md](../guides/ASEPRITE_WORKFLOW.md).
- **NESdev wiki — OAM** — <https://www.nesdev.org/wiki/PPU_OAM>.
  64 sprite slots, 4 bytes each, $4014 DMA timing.  Read before
  touching the OAM build loop in `main.c` / `platformer.c`.
- **nesdoug — Metatiles** — <https://nesdoug.com/2018/09/05/11-metatiles/>.
  Why backgrounds are usually authored as 16×16 metatiles (2×2 tiles): a
  metatile aligns 1:1 with attribute-table colour granularity, so palettes
  stay correct by construction and maps shrink ~75 %.  The engine does *not*
  do this yet — review §N4; it's the right answer to "bigger worlds" + "make
  the squares half".
- **NESdev wiki — Fonts** — <https://www.nesdev.org/wiki/Fonts>.
  A font must physically exist in CHR before you can print text; reserve a
  fixed glyph range and convert `tile = ascii − offset` at emit time.  The
  dialogue garbage bug (web-feedback 31) is exactly this missing — review §N3.

## Tutorials worth reading end-to-end (optional, for deeper context)

- **Nerdy Nights NES programming series** —
  <https://www.nesdev.org/NerdyNights/nerdynights.html>.
  Twenty-five chapters, asm-first, written in 2008.  Still the
  best "build a game from nothing" walkthrough for the NES.
  Mentioned here so future contributors who want to understand
  the underlying machine don't have to discover it cold.
- **NESdev forum** — <https://forums.nesdev.org/>.
  When the wiki doesn't answer something, the forum probably does.
  Search before asking — almost every reasonable question is
  already answered there.

## Things this project deliberately does *not* use

Listed so future contributors don't go hunting:

- **PPU bus conflicts.**  We're on mapper 0 for now; bus conflict
  workarounds aren't relevant.  If T3.2 brings in MMC1, this
  changes — read the matching mapper notes.
- **DPCM samples.**  Disabled in our FamiStudio engine config to
  keep the ROM small.  Re-enabling is a deliberate Tier-B audio
  follow-up, not a casual flag flip — see the engine wrapper for
  the cost analysis.
- **Mapper 0 cap of 32 KB PRG / 8 KB CHR.**  Documented here so
  it's the obvious thing to relax when T3.2 starts.
