#!/usr/bin/env python3
"""Convert assets/pupil/my_tiles.txt into the web editor's JSON format.

The pupil's pre-web-editor work lives in a human-readable text file with
`palette`, `tile`, `sprite` and `background` blocks. The tile/sprite web
editor stores projects as a single JSON blob (the schema written by
index.html + sprites.html). This script bridges the two:

    python3 tools/convert_my_tiles.py

Writes assets/pupil/my_project.json. Open the web editor, click
"Import sprites..." (on the Sprites page) or "Import background..." (on
the Backgrounds page), pick that JSON, and the pupil's existing work is
carried over into the new editor -- tiles, palettes, sprites and the
ground_strip background -- ready to keep going with.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import tile_editor  # noqa: E402  (local import after sys.path tweak)

SRC = ROOT / "assets" / "pupil" / "my_tiles.txt"
DST = ROOT / "assets" / "pupil" / "my_project.json"

NUM_TILES = 256
SCREEN_W = 32
SCREEN_H = 30

# Defaults mirror createDefaultState() in index.html so unused slots look
# the same as a fresh project rather than an empty pitch-black grid.
DEFAULT_BG_PALETTES = [
    [0x29, 0x19, 0x07],  # grass
    [0x07, 0x17, 0x37],  # dirt / sand
    [0x11, 0x21, 0x31],  # water
    [0x00, 0x10, 0x20],  # stone
]
DEFAULT_SPRITE_PALETTES = [
    [0x27, 0x17, 0x30],  # hero
    [0x1A, 0x30, 0x0A],  # slime
    [0x30, 0x16, 0x00],  # skeleton
    [0x16, 0x36, 0x06],  # items
]
UNIVERSAL_BG = 0x21


def empty_tile() -> dict:
    return {"pixels": [[0] * 8 for _ in range(8)], "name": ""}


def make_pool() -> List[dict]:
    return [empty_tile() for _ in range(NUM_TILES)]


def empty_nametable() -> List[List[dict]]:
    return [[{"tile": 0, "palette": 0} for _ in range(SCREEN_W)]
            for _ in range(SCREEN_H)]


@dataclass
class Conversion:
    state: dict
    info: List[str]


def convert(doc: "tile_editor.Document", project_name: str) -> Conversion:
    info: List[str] = []

    # ---- Which tiles are used where? ------------------------------------
    # Tiles may be referenced by sprites, by backgrounds, or both. We keep
    # two independent 256-tile pools (matching NES pattern tables) and only
    # copy a tile into the pool(s) that actually need it.
    used_by_sprite: Dict[str, int] = {}
    used_by_bg: Dict[str, int] = {}
    for c in doc.composites:
        target = used_by_sprite if c.kind == "sprite" else used_by_bg
        for row in c.rows:
            for tname in row:
                if tname in doc.tiles and tname not in target:
                    target[tname] = -1  # placeholder, filled below

    sprite_pool = make_pool()
    bg_pool = make_pool()
    sprite_idx: Dict[str, int] = {}
    bg_idx: Dict[str, int] = {}

    # Slot 0 is left as the universal blank (matches editor convention).
    next_sprite = 1
    next_bg = 1
    for name, tile in doc.tiles.items():
        if name in used_by_sprite:
            if next_sprite >= NUM_TILES:
                info.append(f"sprite pool full, skipping tile '{name}'")
            else:
                sprite_pool[next_sprite] = {
                    "pixels": [row[:] for row in tile.pixels],
                    "name": name,
                }
                sprite_idx[name] = next_sprite
                next_sprite += 1
        if name in used_by_bg:
            if next_bg >= NUM_TILES:
                info.append(f"bg pool full, skipping tile '{name}'")
            else:
                bg_pool[next_bg] = {
                    "pixels": [row[:] for row in tile.pixels],
                    "name": name,
                }
                bg_idx[name] = next_bg
                next_bg += 1
    info.append(
        f"tiles: {len(sprite_idx)} sprite, {len(bg_idx)} background "
        f"(slot 0 kept blank on both pools)"
    )

    # ---- Palette slot assignment ----------------------------------------
    # The editor has exactly 4 BG palettes and 4 sprite palettes. We give
    # each named palette from the pupil's file a slot, filling the rest
    # with the editor defaults so unused slots aren't pitch-black.
    bg_palettes = [{"slots": list(p)} for p in DEFAULT_BG_PALETTES]
    sprite_palettes = [{"slots": list(p)} for p in DEFAULT_SPRITE_PALETTES]
    bg_palette_idx: Dict[str, int] = {}
    sp_palette_idx: Dict[str, int] = {}

    def claim(palette_name: str, kind: str) -> int:
        table = bg_palette_idx if kind == "background" else sp_palette_idx
        slots = bg_palettes if kind == "background" else sprite_palettes
        if palette_name in table:
            return table[palette_name]
        if len(table) >= 4:
            info.append(
                f"{kind} palette '{palette_name}' ignored -- only 4 {kind} "
                f"palettes fit in the editor; reusing slot 0"
            )
            table[palette_name] = 0
            return 0
        idx = len(table)
        pal = doc.palettes.get(palette_name)
        if pal:
            slots[idx] = {
                "slots": [pal.colours.get(1, 0x0F),
                          pal.colours.get(2, 0x0F),
                          pal.colours.get(3, 0x0F)]
            }
        table[palette_name] = idx
        return idx

    # ---- Sprites --------------------------------------------------------
    sprites: List[dict] = []
    for c in doc.composites:
        if c.kind != "sprite":
            continue
        pal_idx = claim(c.palette, "sprite")
        h = len(c.rows)
        w = len(c.rows[0]) if c.rows else 0
        if w == 0:
            continue
        w = min(w, 8)   # editor caps sprites at 8x8 tiles
        h = min(h, 8)
        cells = []
        for r in range(h):
            row_cells = []
            for col in range(w):
                tname = c.rows[r][col] if col < len(c.rows[r]) else None
                if tname and tname in sprite_idx:
                    row_cells.append({
                        "tile": sprite_idx[tname],
                        "palette": pal_idx,
                        "flipH": False, "flipV": False,
                        "priority": False, "empty": False,
                    })
                else:
                    row_cells.append({
                        "tile": 0, "palette": pal_idx,
                        "flipH": False, "flipV": False,
                        "priority": False, "empty": True,
                    })
            cells.append(row_cells)
        sprites.append({
            "name": c.name, "width": w, "height": h, "cells": cells,
        })
    info.append(f"sprites: {len(sprites)} converted")

    # ---- Backgrounds ----------------------------------------------------
    backgrounds: List[dict] = []
    for c in doc.composites:
        if c.kind != "background":
            continue
        pal_idx = claim(c.palette, "background")
        h = min(len(c.rows), SCREEN_H)
        w = min(max(len(r) for r in c.rows) if c.rows else 0, SCREEN_W)
        nt = empty_nametable()
        for r in range(h):
            for col in range(w):
                if col >= len(c.rows[r]):
                    continue
                tname = c.rows[r][col]
                if tname in bg_idx:
                    # Drop the pupil's composite at the top-left corner of
                    # the 32x30 NES screen. They can nudge / duplicate in
                    # the editor if they want it centred or tiled across.
                    nt[r][col] = {"tile": bg_idx[tname], "palette": pal_idx}
        backgrounds.append({
            "name": c.name,
            "dimensions": {"screens_x": 1, "screens_y": 1},
            "nametable": nt,
        })

    # If the source file has no background blocks, start with one empty
    # scene so the editor has something to show.
    if not backgrounds:
        backgrounds.append({
            "name": "background",
            "dimensions": {"screens_x": 1, "screens_y": 1},
            "nametable": empty_nametable(),
        })
    info.append(f"backgrounds: {len(backgrounds)} converted")

    now = datetime.now(timezone.utc).isoformat()
    state = {
        "version": 1,
        "name": project_name,
        "universal_bg": UNIVERSAL_BG,
        "bg_palettes": bg_palettes,
        "sprite_palettes": sprite_palettes,
        "sprite_tiles": sprite_pool,
        "bg_tiles": bg_pool,
        "backgrounds": backgrounds,
        "selectedBgIdx": 0,
        "sprites": sprites,
        "metadata": {"created": now, "modified": now},
    }
    return Conversion(state=state, info=info)


def main() -> int:
    if not SRC.exists():
        print(f"not found: {SRC}", file=sys.stderr)
        return 1
    doc = tile_editor.parse(SRC.read_text(encoding="utf-8"))
    if doc.errors:
        print("my_tiles.txt has errors that need fixing first:", file=sys.stderr)
        for e in doc.errors:
            print("  " + e, file=sys.stderr)
        return 2
    project_name = SRC.stem  # "my_tiles"
    conv = convert(doc, project_name)
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(json.dumps(conv.state, indent=2), encoding="utf-8")
    print(f"wrote {DST.relative_to(ROOT)}")
    for line in conv.info:
        print("  " + line)
    print(
        "\nOpen the editor, click 'Import sprites...' on the sprites page\n"
        "and/or 'Import background...' on the backgrounds page, pick this\n"
        "JSON, and the pupil's existing work is loaded in."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
