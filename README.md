# Welcome to Your NES Game

You are going to make a game for the **Nintendo Entertainment System (NES)** using the C programming language.

This project is split into **5 steps**. Each step is a complete, working game - each one is a little more advanced than the last.

---

## How to use this workspace

You can see a list of folders on the left side of the screen. Each step folder has everything it needs to run.

### The one-key workflow

1. Open the `src/main.c` file inside the step you want to play with.
2. Press **`Ctrl + Shift + B`** on your keyboard.
3. The game will compile and launch in the FCEUX emulator.
4. Close the emulator window when you're done - you can then edit and run again.

If you would rather click than press keys, open the **Terminal** menu at the top of the screen and choose **Run Build Task...**.

---

## The 5 Steps

| Step | Folder | What it does |
| ---- | ------ | ------------ |
| 1 | Step 1 - Player Movement | Move a character around with the arrow keys |
| 2 | Step 2 - Background Level | Add a scenery background with ground, platforms, and clouds |
| 3 | Step 3 - Enemies and Items | Add enemies, gems, and a heart pickup |
| 4 | Step 4 - Dialogue | Talk to an NPC character who shows a message |
| 5 | Step 5 - Multi NPC Dialogue | Two NPCs with a proper bordered dialogue box |

Each step builds on the one before. **Start with Step 1** if this is your first time!

---

## Controls (in FCEUX)

The emulator maps your keyboard to NES controller buttons. The defaults are usually:

| NES Button | Keyboard Key |
| ---------- | ------------ |
| D-pad Up | Up arrow |
| D-pad Down | Down arrow |
| D-pad Left | Left arrow |
| D-pad Right | Right arrow |
| A button | F |
| B button | D |
| Start | Enter |
| Select | S |

If those don't match yours, ask your teacher to check the FCEUX settings (Config > Input > Gamepad 1).

---

## What can I edit?

Some files in this project are locked for safety - you'll see a little padlock on them if you try to open them. **The file you will edit is always called `main.c`** inside the `src/` folder of each step.

Inside `main.c`, look out for these special comments:

- `// TRY: ...` - a suggestion of something fun to change
- `// EDIT: ...` - a value you are meant to change
- `// NOTE: ...` - an explanation of what's happening
- `// WARNING: ...` - something you should be careful with

These comments are colour-coded and listed in the **TODO Tree** sidebar (click the checkbox icon on the left).

---

## Tips for experimenting

- **Only change one thing at a time.** If your game breaks, it's easier to work out what went wrong.
- **Start small.** Change a number by 1 or 2 before changing it by 100.
- **Save often.** Press `Ctrl + S` before you run to make sure your change takes effect.
- **If it won't compile**, read the red error message at the bottom of the screen. It usually tells you which line is broken.

---

## What to try first

Open `Step 1 - Player Movement` > `src` > `main.c` and scroll down to the comments marked `// TRY:`. Pick one, change the number it points to, press `Ctrl + Shift + B` and see what happens!

Some ideas:

- Make the player jump higher
- Make the player move faster
- Change the player's colours
- Change where the player starts

---

## Designing your own sprites and backgrounds

The fastest way is the **visual tile editor**: a web page that runs in
your browser with tools for drawing tiles, arranging sprites, and
laying out backgrounds.

### 🎨 Opening the visual editor

1. Press **Ctrl+Shift+P → Tasks: Run Task → Open Editor via Playground Server**.
2. A browser tab opens at `http://127.0.0.1:8765/` with the **Backgrounds** page.
3. Click the **Sprites** link at the top of the page to switch to the sprites editor. Both pages share one project.

The first time you open the editor a Quick-start tour pops up. If you
dismiss it and want it back, click **?** → **↺ Replay on next load**.

### 🎨 What's in the editor

- **Tileset** — 256 tiles. Click one to edit it. Press **C** to copy a tile's pixels, select another slot and press **V** to paste.
- **Tile editor** — click pixels to paint. Numbers 0–3 map to the four palette colours.
- **Palettes** — 4 background palettes + 4 sprite palettes, 3 colours each. Click any of the 64 NES colours to assign.
- **Backgrounds page** — a 32×30 tile grid (plus multi-screen scrolling). You can create **multiple named backgrounds** with **+ New** above the grid and flip between them.
- **Sprites page** — build multi-tile sprites (up to 8×8 tiles) out of the shared tileset.

Your work **auto-saves** to the browser on every change, with a snapshot
every 30 s and a backup every 5 min. Hit **Recover…** in the toolbar if
anything ever goes wrong. **New** starts fresh (snapshotting your
current work first, so it's never lost).

### ▶ Play your scene in the NES

Every editor page — Backgrounds, Sprites, Behaviour, Builder, Code —
has a **▶ Play in NES** button in the top-right.  Click it and the
editor compiles your project into a real NES ROM and runs it in the
embedded emulator.

Alongside Play, two other controls:

- **⬇ ROM** — downloads the compiled `.nes` file so you can open it
  in any external NES emulator (or email it to a friend).
- **In browser / Local (fceux)** dropdown — picks where the ROM
  runs.  *In browser* uses the page's embedded jsnes.  *Local
  (fceux)* launches fceux on the machine running the playground
  server; the option is greyed out when fceux isn't installed there.

Play needs the **Playground Server** running — the
"Open Editor via Playground Server" task starts it for you. If you see
"is the server running?" in the status bar, run the task again.

### 📝 Editing the game code (Code page)

The **📝 Code** tab (alongside Backgrounds / Sprites) is an in-browser
editor for the game's main source file. Your edits drive the ROM that
**▶ Play in NES** builds.

- **Guided mode** (default) locks everything except a few highlighted
  regions — `player_start`, `walk_speed`, `magic_button`, and so on —
  so you can change interesting numbers without breaking the rest.
  Use the **📚 Lesson** chip to follow a short lesson, or drop in a
  ready-made block of code from the **🧩 Snippets…** picker.
- **Advanced mode** unlocks the whole file for free editing.
- **C / Asm toggle** (advanced only): flip the editor between C
  (cc65) and 6502 assembly (ca65). Both compile to a real NES ROM
  through the same Play button. Your C and asm code are saved
  separately so you can switch back and forth without losing work.

Code auto-saves to the browser. **Restore default** reverts the file
to the stock starter for the current language.

### 🧱 Building a whole game without typing C (Builder page)

The **🧱 Builder** tab is the simplest way to make a working game.
Instead of writing code, you tick modules (Players, Enemies,
Pickups, Damage, HUD, Doors, Dialogue, …) and fill in the
attributes you care about.  The Builder assembles all of that
into a real `main.c` behind the scenes and hits the same ▶ Play
pipeline as the Code page.

You can:

- Tag sprites by role (Player, Enemy, NPC, Pickup, HUD…) on the
  Sprites page, then drag-and-place them on the Builder's
  preview canvas.
- Give enemies walker or chaser AI per instance.
- Turn on HP + hearts, damage, pickup collection, win-condition
  logic.
- Paint Door tiles on the Behaviour page and have them swap to
  a second background.
- Add NPC dialogue boxes (press B near the NPC).

Two-player co-op is supported — Player 2 uses the `I` / `J` / `K`
/ `L` cluster on the keyboard.  See
[docs/guides/BUILDER_GUIDE.md](docs/guides/BUILDER_GUIDE.md) for
the module reference + the font-tile convention you need to know
for Dialogue.

### 💾 Exporting your work

The editor writes a few different formats. Most of the time you want
**JSON save** (portable, re-importable) or leave everything in browser
storage. The other formats are there for the cc65 build.

| Format | Where | Use for |
| ------ | ----- | ------- |
| `.json` | both pages | Round-trip save you can email / commit to git |
| `my_tiles.txt` | backgrounds | Feed the text-based preview + converter |
| `.chr` | backgrounds | Raw tile bitmap for cc65 |
| `.nam` / `.pal` | backgrounds | Nametable + palette bytes for cc65 |
| `sprites.inc` / `sprites.h` | sprites | C arrays compiled into the game |

### 📝 Or: text editor (type digits)

If you prefer typing, edit `assets/pupil/my_tiles.txt` directly. Open it
alongside `preview.png` and run **Tasks: Run Task → Start Live Tile
Preview** — every save refreshes the preview image.

To move a text-format file into the visual editor, run
`python3 tools/convert_my_tiles.py` and then on each page click
**Import…** and pick the resulting `assets/pupil/my_project.json`.

Full editor instructions: **[`docs/guides/TILE_EDITOR_GUIDE.md`](docs/guides/TILE_EDITOR_GUIDE.md)**.
All 64 NES colours: **`assets/pupil/palette_reference.png`**.

---

## More detail and where to find it

The project's documentation now lives in **[`docs/`](docs/)** — see
[`docs/README.md`](docs/README.md) for a navigation index.  The
short version:

- **[`docs/guides/`](docs/guides/)** — pupil-facing
  ([PUPIL_GUIDE](docs/guides/PUPIL_GUIDE.md),
  [BUILDER_GUIDE](docs/guides/BUILDER_GUIDE.md),
  [AUDIO_GUIDE](docs/guides/AUDIO_GUIDE.md),
  [TILE_EDITOR_GUIDE](docs/guides/TILE_EDITOR_GUIDE.md)) plus
  teacher / debugging / Aseprite workflow docs.
- **[`docs/plans/current/`](docs/plans/current/)** — what we're
  working on now.  The active plan is
  [2026-04-26-fixes-and-features.md](docs/plans/current/2026-04-26-fixes-and-features.md).
- **[`docs/plans/archive/`](docs/plans/archive/)** — superseded
  plans, named chronologically (`YYYY-MM-DD-name.md`) so you can
  walk the history of how the project evolved.
- **[`docs/feedback/`](docs/feedback/)** — pupil bug reports and
  feature requests, including the running
  [recently-observed bugs list](docs/feedback/recently-observed-bugs.md).
- **[`docs/changelog/`](docs/changelog/)** — what shipped, when.

Have fun!

---

## Licence

This project is **free and open-source software** released under the [MIT Licence](LICENSE).
You — and your pupils — can use it, copy it, change it, share it, or build on it for any purpose.

A few third-party components are bundled (jsnes, CodeMirror) or relied on (cc65, FCEUX, optionally FamiStudio).
Each one's original licence and credit lives in [NOTICE.md](NOTICE.md).
