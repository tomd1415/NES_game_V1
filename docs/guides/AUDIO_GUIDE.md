# Audio guide

This is the pupil-facing walkthrough for adding music and sound
effects to your NES game.  We use a free music tool called
**FamiStudio** to compose, and the editor's **Audio page** to manage
the songs and sound effects that play in your game.

If you just want to hear *something* now, jump to
[Quick start with the starter pack](#quick-start-with-the-starter-pack).

## Why FamiStudio?

The NES has a tiny built-in sound chip with five "voices":

- **Square 1 / Square 2** — the classic NES blip sound (the lead and
  harmony in most games).
- **Triangle** — bass / sub.
- **Noise** — drums, explosions, ocean.
- **DPCM** — short recorded samples (we leave this off — saves ROM space).

You could *technically* poke this chip directly from C, but writing
music that way is hard.  FamiStudio is a friendly piano-roll editor
that knows exactly how to talk to the chip.  When you finish a song
you click **Export** and FamiStudio gives you a `.s` file the
editor can load.

The bit that actually plays the music inside your game is called the
**FamiStudio sound engine**.  We bundle it with the editor — you
don't need to install or configure anything separately for the
runtime.  You only need FamiStudio itself to *write* music.

## Quick start with the starter pack

The fastest way to hear audio in your game:

1. Open the **🎵 Audio** page in the editor.
2. Click **📦 Load starter pack**.
3. Click **▶ Play in NES**.
4. Listen.

The starter pack contains two original looping background tracks
(*Cheerful loop* and *Tense loop*) plus a six-slot sound-effect pack
(*jump*, *hit*, *pickup*, *land*, *blip*, *error*).  These are
generic, royalty-free starter content — feel free to keep them, or
replace any of them with your own work whenever you like.

## Writing your own music

### 1. Install FamiStudio

Download FamiStudio from <https://famistudio.org/>.  It runs on
Windows, macOS, and Linux and is free.

### 2. Compose a song

Open FamiStudio and:

- Click an **Instrument** in the left-hand panel (the default
  *Square 1* is fine to start).
- Click in the piano roll on the right to drop notes.
- Press **▶** in the toolbar to listen.

Two-minute crash course: the keyboard along the bottom is **time**
(left to right) and the rows are **pitch** (higher rows = higher
notes).  Click a cell to add a note, click again to remove it.  The
default **Square 1** instrument plays the classic NES blip.

If you want a longer guide, FamiStudio has its own tutorial:
<https://famistudio.org/doc/firstsong/>.

### 3. Export to the editor

From FamiStudio's menu:

> **File → Export → FamiStudio Sound Engine assembly**

In the dialog:

- **Format** → `ca65`
- **Output file** → save as e.g. `my_song.s` somewhere you'll find it.

Click **Export**.

### 4. Upload it to the editor

Back in the **🎵 Audio** page:

- Click **⬆ Upload song (.s)** under the *Songs* section.
- Pick the `my_song.s` file you just exported.

It now appears as a card in the songs grid.  Click **⭐ Make
default** to choose which song plays when the game starts; the card
with a yellow **default** badge is the one that boots.

## Sound effects

Sound effects work the same way but go through a *different*
FamiStudio export:

> **File → Export → FamiStudio Sound Engine sound effects**

In FamiStudio you build an SFX project where **each "Song" is one
sound effect**.  Name them clearly (`jump`, `hit`, `pickup` …) — when
you upload the resulting `.s` to the editor you'll see those names
listed as numbered slots (slot 0 = first song, slot 1 = second, etc.).

You can have **one** sfx pack per project.  Replace it any time by
clicking **🗑 Remove** on the sfx card and uploading a new one.

## Hearing it in your game

### Builder pupils

If you're using the **🧱 Builder**, audio is part of your project
the moment you've uploaded a song *and* an sfx pack.  The default
song plays when the game starts.  *Coming in a follow-up: an Audio
module in the Builder lets you map sound effects to specific events
(jump, hit, pickup, land) and switch background music when the scene
or HP changes.*  For now, you can preview the audio with the **▶
Play in NES** button on the Audio page itself.

### Code-page pupils

If you're using the **📝 Code** page (writing your own C), the
FamiStudio engine API is available to call directly from your
`main.c`.  The pupil-uploaded songs and sfx are linked into the ROM
as `audio_default_music` and `audio_sfx_data`; the engine functions
are declared in your `main.c` template.

The functions you'll use most:

```c
famistudio_init(FAMISTUDIO_PLATFORM_NTSC, audio_default_music);
famistudio_sfx_init(audio_sfx_data);
famistudio_music_play(0);            // 0 = first song you uploaded
famistudio_update();                  // call once per frame in vblank
```

And to fire a sound effect:

```c
famistudio_sfx_play(2, FAMISTUDIO_SFX_CH0);   // slot 2, on channel 0
```

The starter `main.c` does the four init calls and the per-frame
update for you — you only need to add `famistudio_sfx_play(...)`
calls where you want sound effects, and `famistudio_music_play(N)`
when you want to switch to a different song.

#### Connecting sound effects to events

The four sounds pupils most often want are **jump**, **land**,
**hit** (taking damage), and **pickup** (collecting an item).
Each one is a single `famistudio_sfx_play(...)` call placed at
the right spot in your `main.c`.  In the starter template these
spots all live inside the main game loop — search for the
existing keywords below and drop the matching line in.

| Event   | Where to add the call (search for…) | Snippet |
| ------- | ----------------------------------- | ------- |
| Jump start | `jumping = 1;` (the line that starts a new jump, around the `JOY_A` button check) | `famistudio_sfx_play(0, FAMISTUDIO_SFX_CH0);` |
| Landing | `jumping = 0;` immediately after the player hits the ground (look for the comment `feet on a surface`) | `famistudio_sfx_play(3, FAMISTUDIO_SFX_CH1);` |
| Hit / damage taken | wherever your code decreases the player's HP | `famistudio_sfx_play(1, FAMISTUDIO_SFX_CH0);` |
| Pickup collected | wherever your code marks a pickup as collected | `famistudio_sfx_play(2, FAMISTUDIO_SFX_CH1);` |

The slot numbers (0, 1, 2, 3) match the order you uploaded sfx
on the Audio page — slot 0 is the first sound, slot 1 the
second, and so on.  The channel argument (`FAMISTUDIO_SFX_CH0`
or `FAMISTUDIO_SFX_CH1`) picks which of the two engine sfx
voices plays the sound; using different channels for different
events lets two sounds play at the same time without cutting
each other off.  *Tip:* pair "jump" with "land" on the **same**
channel — when you land mid-jump the land sound naturally
replaces the jump tail.

> **Coming in a follow-up.**  The 🧱 Builder will gain an
> Audio module that lets you point each event at a sfx slot
> from a dropdown, with no code editing — see
> [`docs/plans/current/2026-04-26-fixes-and-features.md`](../plans/current/2026-04-26-fixes-and-features.md)
> §T2.6.  Until that lands, the snippets above are the way.

A more comprehensive Code-page guide (including this audio section,
plus everything else the Code page lets you do) is on the roadmap;
for now the **🧱 Builder**'s audio module is the smoothest path.

## ROM-size budget

NES cartridges are small.  The bar at the bottom of the Audio page
shows you how much of the 32 KB program area your audio is using.
A rough breakdown:

- **Engine** — about 3.5 KB (always there when audio is on).
- **Each song** — anywhere from 200 bytes (a short loop) to 2 KB+
  (a fully orchestrated track with vibrato, slides, and arpeggios).
- **SFX pack** — usually under 1 KB.

The audit panel turns yellow above 12 KB so you've got room left
over for game code, sprites, and backgrounds.  If you go over, the
build will fail with a "memory area overflow" error — remove a song
or simplify one in FamiStudio and try again.

## Troubleshooting

**"Could not find an .export line"** when uploading.  The file you
picked isn't a FamiStudio sound-engine `.s` export.  Make sure you
chose **Export → FamiStudio Sound Engine assembly** (or **Sound
effects** for the sfx upload), not one of the other export options
like NSF or WAV.

**"The starter pack is missing on the server"** when you click the
button.  The starter `.s` files haven't been built yet — your
teacher or whoever installed the editor needs to run
`tools/audio/starter/build.sh` once.  Authoring still works without
the starter pack; just upload your own files.

**The build fails after I upload audio** with a message about memory
area overflow.  You're over budget — remove a song or compress one
in FamiStudio (fewer instruments, no slides/vibrato).

**The build fails with `audio_songs.s(3): Error: Constant expression
expected`.**  This was the most common pupil-reported audio build
failure (2026-04-27).  Newer FamiStudio versions wrap their
`.export` lines in an `.if FAMISTUDIO_CFG_C_BINDINGS` block, and
ca65 errors when that symbol isn't defined.  The playground server
now auto-prepends a `FAMISTUDIO_CFG_C_BINDINGS = 0` definition to
every staged audio file, which makes the assembler skip the
wrapped exports cleanly — our editor's own alias trailer maps
`audio_default_music` and `audio_sfx_data` to the right symbols
directly, so the wrapped exports aren't needed anyway.  If you're
still seeing this error on a project from before the fix, hit
**▶ Play in NES** to rebuild — no re-upload needed.

**My sound effect plays silently in-game.**  Check that you uploaded
a sfx pack on the Audio page — the editor displays it as a card
with the slot names you exported from FamiStudio.  *(You no longer
need to upload BOTH a song and a sfx pack for audio to engage —
upload either one and the editor auto-stubs the other side.  But
you do need the sfx pack present if you want to actually hear
sound effects.)*

**My uploaded music doesn't play, but the starter pack does.**
This is the most common pupil-reported audio bug.  Causes, in
the order to check.

1. **You uploaded music but no sound effects (pre-2026-04-27 only).**
   In an earlier version, audio only engaged when a project had
   *both* a song and a sound-effects pack uploaded — a pupil
   uploading just music got silence.  This is now auto-fixed: the
   editor stubs in a silent sfx pack for you when one is missing,
   so a music-only project plays its music.  If you're hearing
   silence on a project from before the fix, just hit **▶ Play
   in NES** to rebuild — no re-upload needed.
2. **Multiple songs in your FamiStudio project, with the leftover
   empty default at song 0.**  When you create a new FamiStudio
   project it ships with a default song called *NewSong* (or
   similar).  If you compose your music in a *second* song instead
   of overwriting that one, the export contains both, with the
   empty NewSong as song 0.  Our editor currently always plays
   song 0, so you hear silence.

   **Fix.**  Open your project in FamiStudio.  Look at the
   **Songs** panel on the left.  If there's more than one song,
   either:

   - Drag the song you want to play to the **top** of the list,
     **or**
   - Right-click any extra empty songs and choose **Delete song**.

   Then re-export.  Best practice: keep one song per FamiStudio
   project so this can't happen.

3. **Wrong "machine" target on export.**  FamiStudio's project
   properties has a *Machine* setting — NTSC, PAL, or Dual.  Our
   sound engine is NTSC-only.  If the project (or the export
   dialog) is set to PAL, the song's tempo header tells the
   engine "this is a PAL song" and our NTSC engine throttles
   itself to match — making playback very slow and often
   inaudibly quiet because envelopes don't tick fast enough to
   hear.

   **Fix.**  In FamiStudio: **File → Project Properties → Machine
   → NTSC** (or, in the export dialog, pick the NTSC machine
   target).  Re-export.

4. **Wrong export type.**  FamiStudio has two engine exports —
   *FamiStudio Sound Engine* (the one we want) and *FamiTone2*
   (the older format).  Both produce `.s` files that look
   superficially similar.  If you exported FamiTone2 by mistake,
   the file uploads fine but the runtime engine reads the bytes
   the wrong way and the song plays as silence or noise.

   **Fix.**  Re-export with **File → Export → FamiStudio Sound
   Engine assembly**, format = ca65.

If you'd rather not guess: there's a diagnostic script under
`tools/audio/diagnose_song.py` that scans a `.s` file for all of
the above and tells you exactly what's wrong.  From a
terminal in the project directory:

```bash
python3 tools/audio/diagnose_song.py path/to/pupil_song.s
```

It prints `OK` if nothing obvious is wrong, or specific warnings
with fix steps if it finds one of the failure modes above.
Teachers can pipe a folder of pupil exports through it to triage
quickly.

**The music tempo speeds up or slows down when lots of stuff is
moving on-screen.**  This happens in both the in-browser preview
and the local FCEUX emulator, and it's the same root cause in
each: when the player's frame has a lot of work to do (collision
checks, moving sprites, scrolling), the main loop drops below 60
frames per second, and the FamiStudio engine — which gets called
once per game frame — ticks more slowly along with it.  We tried
moving the engine onto the NES's hardware vblank interrupt to fix
this, but the engine takes longer than the NES's tiny vblank
window allows, and pushing it there caused background tiles to
glitch on busy screens (you may have seen this in the very brief
stretch between v1 and v2 of the audio update).  The current
arrangement keeps graphics rock-steady at the cost of mild tempo
drift on heavy frames.  Two ways to mitigate it if it bothers you:
keep the scene lighter (fewer simultaneous moving sprites), or
compose your song at a slightly slower BPM so the drift is less
musically noticeable.

**The music feels too fast.**  FamiStudio bakes the song's tempo
into the exported `.s` data — there's no runtime knob in the
editor to override it.  To change tempo, open the song in
FamiStudio, click the song name in the left-hand panel, change
the **BPM** field (default is often 150 BPM, which sounds quite
brisk; 100-120 BPM is gentler for a slow-paced game), and re-
export via *File → Export → FamiStudio Sound Engine assembly*.
Upload the new `.s` over the old one on the Audio page.  The
*Cheerful loop* and *Tense loop* in the starter pack are 150
BPM — recompose them at whatever tempo fits your game.

**The 🔊 / 🔇 button doesn't seem to do anything the first time.**
Some browsers require the page to play a sound *once* before they
fully unlock audio.  Click ▶ Play, then the mute button — second
click should toggle correctly.

## What's next

Want to swap background music when you reach a new scene, or
trigger a fanfare when the player wins?  That's the Audio Builder
module's job — it's queued for the next phase.  Right now you can
do the same things by writing a few lines of C on the Code page
calling `famistudio_music_play(N)`.

For more advanced FamiStudio features (DPCM samples, expansion-chip
support, multi-channel music) see the FamiStudio docs at
<https://famistudio.org/doc/>.
