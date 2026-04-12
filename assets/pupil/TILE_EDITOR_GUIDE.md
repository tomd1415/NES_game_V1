# Tile Editor Guide

Draw your own sprites and backgrounds for the NES game. You can use
the **visual editor** (click and paint) or the **text editor** (type
digits). They're compatible — you can swap between them any time.

---

## Visual editor — the 60-second version

1. Press **Ctrl+Shift+P → "Tasks: Run Task" → "Open Editor via Playground Server"**.
2. A browser tab opens at `http://127.0.0.1:8765/` showing the **Backgrounds** page.
3. Click the **Sprites** link at the top to switch. Both pages share one project.
4. Paint tiles, build sprites, lay out backgrounds. Everything auto-saves to the browser.
5. When you're ready, click **▶ Play in NES** (sprites page) to walk the player around in your scene.

### What's on each page

#### Backgrounds page

- **Tileset** (256 tiles) on the right — click a tile to open it in the editor.
- **Tile editor** — click pixels. Numbers 0–3 map to the four palette colours (0 = transparent / sky).
- **Nametable** — the 32×30 grid. Click or drag to place tiles. Right-click to erase.
- **Background tabs** — above the grid. **+ New** makes another named background in the same project, **⎘ Duplicate** copies the current one, **🗑 Delete** removes it.
- **Palettes** (4 BG palettes, 3 colours each) at the bottom.

#### Sprites page

- **Sprite list** on the left — **+ New** to make a new sprite, **⎘ Duplicate**, **🗑 Delete**.
- **Composite sprite** in the middle — up to 8×8 tiles, with flip-H / flip-V / priority per cell.
- **Shared tileset** on the right — the same 256 slots, but a different pool from the backgrounds page (so you can't clobber BG art by editing sprite tiles).
- **🖱 Browse / ✏️ Paint mode** (top of the sprite area) — Browse lets you click cells to select without painting by accident.
- **Animations** panel (below the sprite list) — group sprites into a walking or jumping cycle. See the next section.

### Making an animation

An animation is just a list of your **full sprites** played in order. A
walk cycle might be three poses; a jump might be two. The same sprite
can appear in more than one animation, and frames can repeat.

1. In the **Animations** panel, click **+ New animation** and give it a name (e.g. `walk`).
2. Choose a sprite from the dropdown and click **+ Add frame**. Repeat to build the cycle.
3. Drag the **FPS** slider to speed it up or slow it down. The preview window plays it live.
4. Use **▲ / ▼** beside a frame to reorder, or **✕** to drop it.

### Using it in the game

At the bottom of the panel, pick an animation for **Walking** and
another (optionally) for **Jumping**. When you press **▶ Play in NES**:

- Holding **← / →** plays the walk animation.
- Holding **↑** plays the jump animation.
- Standing still shows the player's plain (non-animated) sprite.

All frames of one animation must be the **same width × height** as the
Player sprite you chose in the Play dialog. The editor warns you if a
frame doesn't match, and the server silently skips the mismatched ones.

### Handy keys

| key | does |
| --- | ---- |
| **C** | Copy the highlighted tile's pixels into a clipboard |
| **V** | Paste clipboard pixels into the highlighted tile slot |
| **D** | Duplicate the current tile into the next free slot |
| **H** | Flip the selected sprite cell horizontally (sprites page) |
| **M** | Toggle Browse ↔ Paint mode (sprites page) |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / redo |
| **Ctrl+S** | Manual snapshot (in addition to auto-save) |
| **?** | Open the help dialog |

**C + V** is the fastest way to make a variant of an existing tile:
highlight the tile, press **C**, click an empty slot, press **V**, then
tweak a few pixels. Beats drawing from scratch every time.

### Saving and recovering

- Auto-saves to the browser on every change.
- Snapshot every 30 s (last 5 kept), emergency backup every 5 min.
- Click **Recover…** in the toolbar to roll back to any snapshot.
- **New** starts a fresh project (snapshots the current one first).
- **Export → JSON save** gives you a portable file you can commit to git or email around.

### ▶ Playing your scene in the NES

The **Sprites** page has a big **▶ Play in NES** button. It opens a
dialog where you:

1. Pick which sprite is the **Player** (this is the one that moves).
2. Click **Place extra sprite** to drop a few non-moving sprites on the background (optional).
3. Press **Play**.

The editor sends your tiles + background + sprites to the local
**Playground Server**, which compiles them into a real `.nes` ROM
and opens it in FCEUX. The D-pad moves the player.

If you see _"is the server running?"_ in the status bar, run the
**Open Editor via Playground Server** task again.

---

## Text editor — the 60-second version

Prefer typing? Edit `assets/pupil/my_tiles.txt` directly.

1. Open **`my_tiles.txt`** and **`preview.png`** side-by-side.
2. Press **Ctrl+Shift+P → "Tasks: Run Task" → "Start Live Tile Preview"**.
3. Every **Ctrl+S** refreshes the preview image.

### What the file looks like

Four kinds of block:

```text
palette player:              # pick 3 NES colours
  1 = 0x27                   # orange
  2 = 0x17                   # brown
  3 = 0x30                   # white

tile head_left:              # one 8×8 picture
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

### The rules (the preview checks these for you)

| rule | why |
|------|-----|
| tiles are exactly **8 rows of 8 digits** | the NES PPU draws in 8×8 tiles |
| pixel values are **0, 1, 2, or 3** only | only 4 colours per tile |
| palettes set slots **1, 2 and 3** | slot 0 is transparent (shows sky) |
| palette bytes are **0x00–0x3F** | the NES only has 64 colours, ever |

If you break a rule, the preview shows a red banner with the line number.

### Picking colours

Open **`palette_reference.png`** side-by-side. Every NES colour is there
with its hex code. Popular ones:

- `0x21` sky blue · `0x29` grass · `0x07` dirt
- `0x27` orange · `0x16` red · `0x30` white · `0x0F` black

### Tips

- **Copy a tile and rename it** to make a variant — quicker than starting fresh.
- Use `.` instead of `0` for transparent pixels; it makes the shape easier to see while drawing.
- Draw the **left half first**, then mirror it for the right half.
- Two tiles that differ by one pixel make an animation frame — drop them in a row and blink between them.

---

## Moving between the two editors

If you started in the **text editor** and want to continue in the
**visual editor**, run:

```bash
python3 tools/convert_my_tiles.py
```

That writes `assets/pupil/my_project.json`. Open the visual editor:

- **Backgrounds** page → **Import background…** → pick `my_project.json`
- **Sprites** page → **Import sprites…** → pick the same file

Your palettes, tiles, sprites and background will all be there.

Going the other way (visual → text) isn't supported — the visual editor
is the main workflow, and its **Export → JSON** is the portable format.

---

## What should I export?

The editor writes several formats. You mostly don't need to worry —
the browser auto-saves and **▶ Play in NES** builds a ROM for you. But
if you're moving graphics into the step folders yourself:

| Format | Button (page) | Use for |
| ------ | ------------- | ------- |
| `.json` | Export → JSON (both pages) | Permanent backup you can re-import |
| `my_tiles.txt` | Export (backgrounds) | Feeds the text-based preview |
| `.chr` | Export (backgrounds) | Raw tile bitmap for the cc65 build |
| `.nam` | Export (backgrounds) | Nametable bytes for the step code |
| `.pal` | Export (backgrounds) | Palette bytes for the step code |
| `sprites.inc` / `sprites.h` | Export (sprites) | C arrays that get compiled into the game |

For most pupils: **save a JSON now and then as a backup, and press ▶ Play in NES** to try your work.

---

## When things go wrong

### Visual editor

- Nothing happens when I click? You might be in 🖱 **Browse** mode on the sprites page — press **M** (or click ✏️ Paint) to paint.
- Paste (V) does nothing? You haven't copied anything yet — highlight a tile and press **C** first.
- Lost work? Open **Recover…** — there's a snapshot from seconds ago.

### Text editor

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
