# Slide Decks

Colourful Marp-based slide decks for each step of the NES game project.
Designed for on-screen viewing, with a Nintendo-history tone for bright but reluctant readers.

## Viewing the slides

### Option 1 — VS Code (easiest)

Install the **Marp for VS Code** extension:

- Extension ID: `marp-team.marp-vscode`
- Open any `slides/step*.md`
- Click the **Marp preview** icon (top right) to get a side-by-side rendered view
- Works offline, no extra tools needed

### Option 2 — Browser (HTML export)

```bash
npx @marp-team/marp-cli slides/step1.md --html -o slides/step1.html
xdg-open slides/step1.html
```

### Option 3 — PDF (for printing)

```bash
npx @marp-team/marp-cli slides/step1.md --pdf -o slides/step1.pdf
```

The first `npx` run will fetch Marp (~40 MB). After that it's instant.

## Regenerating diagrams

The diagrams under `slides/assets/` are generated programmatically from
the game's own sprite data so they stay in sync with the code.

```bash
python tools/generate_slide_assets.py
```

This produces:

- `nes_palette.png` — the full 64-colour NES master palette
- `player_sprite_frames.png` — the 4 walk-cycle frames as they appear in the ROM
- `player_tile_layout.png` — annotated 2×4 tile grid showing how the hero is built
- `jumpman_vs_player.png` — Donkey Kong Jumpman (1981) vs your 2026 hero
- `tile_planar_demo.png` — how a single 8×8 tile is encoded in 16 bytes
- `oam_sprite_diagram.png` — the 4 bytes of an OAM entry
- `nes_system_diagram.png` — CPU/OAM/PPU/TV signal path

## Decks

| File | Step | Status |
|------|------|--------|
| `step1.md` | Your First NES Sprite | ✅ ready |
| `step2.md` | Backgrounds & Levels | planned |
| `step3.md` | Enemies & Items | planned |
| `step4.md` | Dialogue | planned |
| `step5.md` | Multi-NPC Dialogue | planned |
