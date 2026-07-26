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

## Making your own game — the Studio

The 5 steps above are about reading and tweaking C. When you want to build a
game of your own, use the **Studio**: one browser page where you draw the
art, lay out the level, set the rules and press Play — and a real `.nes` ROM
comes out the other end.

### 🎨 Opening the Studio

1. Press **Ctrl+Shift+P → Tasks: Run Task → Open Editor via Playground Server**.
2. A browser tab opens at `http://127.0.0.1:8765/studio.html`.

(Or from a terminal: `python3 tools/playground_server.py`, then open that
address yourself. The server prints it on startup.)

The first time you open it you can pick a **starter** — a guided tutorial, a
platformer, an SMB-style showcase, a top-down adventure, an auto-runner, Geo
Dash, a top-down racer, or a blank project.

### 🖥 How the Studio is laid out

Four regions, left to right:

- **Mode rail** — which part of the game you're working on (see below).
- **Edit column** — the tools for the mode you picked. Drag its right edge
  to make it wider or narrower.
- **The TV** — your actual game screen, live. You stamp straight onto it with
  the **▣ Select** / **✎ Paint** tools in the bar above.
- **Quests panel** — what to do next, and anything that needs attention.

### 🗺 The modes

There's a **Level** control in the top-right — *Beginner*, *Maker*,
*Advanced*. Higher levels unlock more modes. Locked modes stay visible with a
🔒 so you can see what's still to come.

| Mode | Level | What it's for |
| ---- | ----- | ------------- |
| 🗺 **World** | Beginner | Stamp blocks and characters onto the live screen, set what each tile does, build the level |
| 🦸 **Chars** | Beginner | Every character, assembled out of shared tiles, and what role it plays (player, enemy, pickup, NPC…) |
| 🎮 **Style** | Beginner | Your game style — platformer, top-down, runner, racer — and its options |
| ⚙ **Rules** | Beginner | How the game behaves: movement, damage, win condition, reactions |
| 🧩 **Tiles** | Maker | The 8×8 tiles everything else is built from |
| 🎨 **Pals** | Maker | Backdrop + 4 background and 4 sprite palettes of 3, from the 64 NES colours |
| 🎵 **Sound** | Maker | Music and sound effects |
| 💻 **Code** | Advanced | The real C the game compiles to (and 6502 assembly) |

Your work **auto-saves** to the browser as you go. **Recover…** brings back an
earlier snapshot if something goes wrong.

### ▶ Playing your game

Press **▶ Play**. The Studio compiles your project into a real NES ROM and runs
it in the emulator built into the page.

- **⬇ .nes** downloads the ROM so you can run it in any NES emulator, or keep it.
- **In browser / Local (fceux)** picks where it runs. *In browser* uses the
  built-in jsnes. *Local (fceux)* launches fceux on the machine running the
  server, and is greyed out when fceux isn't installed there.

Play needs the **Playground Server** running — the "Open Editor via Playground
Server" task starts it for you. If you see "is the server running?", run the
task again.

Two-player co-op works throughout: Player 2 uses the `I` / `J` / `K` / `L`
cluster, with `O` = A and `U` = B.

### 📚 Going further

- **[`docs/guides/BUILDER_GUIDE.md`](docs/guides/BUILDER_GUIDE.md)** — the full
  module reference (players, enemies, pickups, damage, HUD, doors, dialogue…)
  and the font-tile convention Dialogue needs.
- **[`docs/guides/TILE_EDITOR_GUIDE.md`](docs/guides/TILE_EDITOR_GUIDE.md)** —
  detailed editor instructions.
- All 64 NES colours: run `python3 tools/generate_palette_reference.py` to
  generate **`assets/pupil/palette_reference.png`** (produced on demand, not
  checked in).

### 💾 Exporting your work

Most of the time you want **JSON save** — portable and re-importable — or you
can just leave everything in browser storage. The other formats exist for the
cc65 build.

| Format | Use for |
| ------ | ------- |
| `.json` | Round-trip save you can email or commit to git |
| `.chr` | Raw tile bitmap for cc65 |
| `.nam` / `.pal` | Nametable + palette bytes for cc65 |
| `sprites.inc` / `sprites.h` | C arrays compiled into the game |
| `my_tiles.txt` | Feeds the text-based preview + converter (legacy) |

### 🕹 The older pages

Before the Studio there were seven separate pages — Backgrounds, Sprites,
Behaviour, Builder, Code and friends. They're **still served** (`index.html`,
`sprites.html`, `code.html`, …) so nothing that relied on them breaks, but the
Studio is where the work happens now and the older pages only get critical
fixes. Prefer the Studio unless you have a specific reason not to.

There's also a text-file workflow if you'd rather type digits than click: edit
`assets/pupil/my_tiles.txt`, open it alongside `preview.png`, and run
`python3 tools/tile_editor.py assets/pupil/my_tiles.txt --watch` — every save
refreshes the preview. `python3 tools/convert_my_tiles.py` turns such a file
into a project you can **Import…**.

---

## More detail and where to find it

The project's documentation now lives in **[`docs/`](docs/)** — see
[`docs/README.md`](docs/README.md) for a navigation index.  The
short version:

- **Picking up development cold? Start with
  [`docs/STATUS.md`](docs/STATUS.md)** — the living "where we are now" file:
  engine version, test state, what's open and what it's blocked on.

- **Developing the web or native Linux application?** Read
  **[`CONTRIBUTING.md`](CONTRIBUTING.md)** for ownership, branching, review and
  shared-contract rules.

- **[`docs/guides/`](docs/guides/)** — pupil-facing
  ([PUPIL_GUIDE](docs/guides/PUPIL_GUIDE.md),
  [BUILDER_GUIDE](docs/guides/BUILDER_GUIDE.md),
  [AUDIO_GUIDE](docs/guides/AUDIO_GUIDE.md),
  [TILE_EDITOR_GUIDE](docs/guides/TILE_EDITOR_GUIDE.md)) plus
  teacher / debugging / Aseprite workflow docs.
- **[`docs/plans/current/`](docs/plans/current/)** — plans by date.  Active work
  is feedback-driven: the running list is
  [`docs/feedback/recently-observed-bugs.md`](docs/feedback/recently-observed-bugs.md)
  and the Studio tracker is
  [2026-07-05-studio-redesign.md](docs/plans/current/2026-07-05-studio-redesign.md)
  (the April `2026-04-26-fixes-and-features.md` plan is kept for history).
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
