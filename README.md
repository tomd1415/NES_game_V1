# Welcome to Your NES Game!

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
|------|--------|--------------|
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
|------------|--------------|
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

## More detail

There is a much longer guide in `PUPIL_GUIDE.md` at the top of this folder if you want to know more about how everything works.

Have fun!
