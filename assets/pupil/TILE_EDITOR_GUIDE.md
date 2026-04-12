# Tile Editor — Quickstart

Draw your own sprites and backgrounds. See them on screen as you type.

## The 60-second version

1. Open the **Tile Editor** folder in the sidebar (it's at the bottom).
2. Open **`my_tiles.txt`** — this is the only file you edit.
3. Open **`preview.png`** in a side-by-side tab (drag it to the right).
4. Press **Ctrl+Shift+P → "Tasks: Run Task" → "Start Live Tile Preview"**.
5. Now every time you save `my_tiles.txt` with **Ctrl+S**, the preview refreshes.

That's it. You can close the guide and start doodling.

---

## What the file looks like

Four kinds of block:

```text
palette player:        # pick 3 NES colours
  1 = 0x27             # orange
  2 = 0x17             # brown
  3 = 0x30             # white

tile head_left:        # one 8×8 picture
  ..1111..
  .111111.
  11.11.11
  11.11.11
  .122221.
  ..3113..
  ..1111..
  ...11...

sprite hero using player:    # stitch tiles into a character
  head_left head_right
  body_left body_right

background ground_strip using grass_ground:   # stitch tiles into scenery
  grass grass grass grass grass grass grass grass
  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt
```

Every pixel is a **digit 0–3** (or `.` which means the same as `0`).

---

## The rules (the editor checks these for you)

| rule | why |
|------|-----|
| tiles are exactly **8 rows of 8 digits** | the NES PPU draws in 8×8 tiles |
| pixel values are **0, 1, 2, or 3** only | only 4 colours per tile |
| palettes set slots **1, 2 and 3** | slot 0 is transparent (shows sky) |
| palette bytes are **0x00–0x3F** | the NES only has 64 colours, ever |

If you break a rule, the preview shows a red banner with the line number.

---

## Picking colours

Open **`palette_reference.png`** side-by-side. Every NES colour is there
with its hex code. Write the code in the palette block:

```
palette sunset:
  1 = 0x26   # warm pink
  2 = 0x17   # brown ground
  3 = 0x30   # white highlight
```

Popular ones:

- `0x21` sky blue · `0x29` grass · `0x07` dirt
- `0x27` orange · `0x16` red · `0x30` white · `0x0F` black

---

## Stitching tiles

A **sprite** or **background** is just a grid of tile names.
Rows go top-to-bottom, tiles in a row go left-to-right.

**A 2×4 sprite** (Link-sized: 16×32 pixels):

```
sprite link using player:
  head_left  head_right
  chest_left chest_right
  hip_left   hip_right
  boot_left  boot_right
```

**A repeating ground** across the whole screen width (32 tiles):

```
background full_floor using grass_ground:
  grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass grass
  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt  dirt
```

---

## Tips for drawing

- **Copy a tile and rename it** to make a variant — quicker than starting fresh.
- Use `.` instead of `0` for transparent pixels; it makes the shape easier
  to see while you're drawing.
- Draw the **left half first**, then mirror it to make the right half.
  The preview shows them side-by-side so you can spot mistakes fast.
- Two tiles that differ by one pixel make an animation frame — drop them
  in a row and blink between them.

---

## When things go wrong

The preview banner tells you:

- `line 42: tile 'grass' has 7 row(s) — must be exactly 8`
- `line 17: palette byte 0x80 is out of range — must be 0x00..0x3F`
- `line 60: sprite 'hero' references tile 'lag_left' which is not defined` (typo)

Fix the line it names and save again.

---

## Nintendo trivia

The whole world of **Super Mario Bros.** is made of **256 tiles**.
Every cloud, pipe, question block, castle brick — all 8×8.
The clouds and the bushes? **The same tile** with a different palette.
That's the trick you're about to use.
