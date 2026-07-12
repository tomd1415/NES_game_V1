"""Toolkit-independent project editing transformations shared with Studio."""

from __future__ import annotations

from typing import Any


def promote_background_to_metatiles(background: dict[str, Any]) -> dict[str, Any]:
    nametable = background.get("nametable") or []
    behaviours = background.get("behaviour") or []
    rows = len(nametable)
    columns = len(nametable[0]) if nametable and isinstance(nametable[0], list) else 0
    metatiles: list[dict[str, Any]] = []
    metatile_map: list[list[int]] = []
    indices: dict[tuple[tuple[int, ...], int, int], int] = {}

    def tile(row: int, column: int) -> int:
        cell = nametable[row][column] if row < len(nametable) and column < len(nametable[row]) else None
        return int(cell.get("tile", 0)) if isinstance(cell, dict) else 0

    def palette(row: int, column: int) -> int:
        cell = nametable[row][column] if row < len(nametable) and column < len(nametable[row]) else None
        return int(cell.get("palette", 0)) & 3 if isinstance(cell, dict) else 0

    def behaviour(row: int, column: int) -> int:
        source_row = behaviours[row] if row < len(behaviours) else None
        value = source_row[column] if isinstance(source_row, list) and column < len(source_row) else 0
        return int(value) & 0xFF if isinstance(value, (int, float)) else 0

    for map_row in range(rows // 2):
        output_row = []
        for map_column in range(columns // 2):
            row, column = map_row * 2, map_column * 2
            tiles = (
                tile(row, column),
                tile(row, column + 1),
                tile(row + 1, column),
                tile(row + 1, column + 1),
            )
            pal, collision = palette(row, column), behaviour(row, column)
            signature = (tiles, pal, collision)
            if signature not in indices:
                indices[signature] = len(metatiles)
                metatiles.append(
                    {"tiles": list(tiles), "palette": pal, "behaviour": collision}
                )
            output_row.append(indices[signature])
        metatile_map.append(output_row)
    background["tileMode"] = "16x16"
    background["metatiles"] = metatiles
    background["mtmap"] = metatile_map
    return background


def delete_metatile(background: dict[str, Any], identifier: int) -> bool:
    metatiles = background.get("metatiles") or []
    if (
        not isinstance(metatiles, list)
        or len(metatiles) <= 1
        or not isinstance(identifier, int)
        or not 0 <= identifier < len(metatiles)
    ):
        return False
    del metatiles[identifier]
    for row in background.get("mtmap") or []:
        if not isinstance(row, list):
            continue
        for column, value in enumerate(row):
            if value == identifier:
                row[column] = 0
            elif isinstance(value, (int, float)) and value > identifier:
                row[column] = value - 1
    return True


def swap_tile_slots(state: dict[str, Any], bank: str, first: int, second: int) -> None:
    if bank not in {"bg", "sprite"}:
        raise ValueError(f"Unknown pattern-table bank: {bank}")
    if not 0 <= first < 256 or not 0 <= second < 256:
        raise IndexError("Pattern-table slot must be 0..255")
    if first == second:
        return
    pool_name = "bg_tiles" if bank == "bg" else "sprite_tiles"
    pool = state.get(pool_name)
    if not isinstance(pool, list) or len(pool) < 256:
        raise ValueError(f"Project has no complete {pool_name} pool")
    pool[first], pool[second] = pool[second], pool[first]

    def remap(value: Any) -> int:
        tile = int(value or 0)
        return second if tile == first else first if tile == second else tile

    if bank == "bg":
        for background in state.get("backgrounds") or []:
            if not isinstance(background, dict):
                continue
            for row in background.get("nametable") or []:
                for cell in row or []:
                    if isinstance(cell, dict):
                        cell["tile"] = remap(cell.get("tile"))
            for metatile in background.get("metatiles") or []:
                if isinstance(metatile, dict) and isinstance(metatile.get("tiles"), list):
                    metatile["tiles"] = [remap(tile) for tile in metatile["tiles"]]
    else:
        for sprite in state.get("sprites") or []:
            if not isinstance(sprite, dict):
                continue
            for row in sprite.get("cells") or []:
                for cell in row or []:
                    if isinstance(cell, dict) and not cell.get("empty"):
                        cell["tile"] = remap(cell.get("tile"))
