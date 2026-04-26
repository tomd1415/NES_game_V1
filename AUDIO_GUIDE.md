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
```

And to fire a sound effect:

```c
famistudio_sfx_play(2, FAMISTUDIO_SFX_CH0);   // slot 2, on channel 0
```

The starter `main.c` does the three init calls for you, and wires
the per-frame engine update into the NES's hardware vblank
interrupt so the music ticks at exactly 60 Hz regardless of what
the rest of your code is doing — you don't need to call
`famistudio_update()` yourself.  Just add `famistudio_sfx_play(...)`
calls where you want sound effects, and `famistudio_music_play(N)`
when you want to switch to a different song.

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

**My sound effect plays silently in-game.**  Check that you uploaded
both a song *and* an sfx pack — the engine needs both to start up.
The Audio page won't enable audio in the build until both are
present.

**The music tempo speeds up or slows down when lots of stuff is
moving on-screen** in the *in-browser* emulator (the ▶ Play button
on this page or the Builder page).  This is a known limitation of
the in-browser NES emulator (jsnes) when the page is doing heavy
work: emulation runs slightly slower than 60 fps, the audio
hardware keeps consuming samples at the same rate, and the music
sounds like it's stuttering or warping.  Running the same ROM in a
*local* emulator like FCEUX (the *Local* play mode in the dropdown
next to ▶ Play) gives steady playback because the emulator runs in
its own native process and the engine is now driven by the NES's
hardware vblank interrupt — that means the music ticks at exactly
60 Hz no matter how heavy the game's per-frame work is.  Pupils
with older laptops or busy scenes may still notice some drift in
the *browser* preview, but the local play and the final ROM
itself are rock-steady — record your gameplay in FCEUX if you
want the audio captured for sharing.

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
