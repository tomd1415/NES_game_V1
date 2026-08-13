"""Pure full-world nametable and source generation."""

from __future__ import annotations

from typing import Any

from .build import BuildError
from .graphics import SCREEN_COLS, SCREEN_ROWS


def world_nametable(
    state: dict[str, Any],
) -> tuple[bytes, bytes, int, int, int, int]:
    backgrounds = state.get("backgrounds")
    background: dict[str, Any] = {}
    if isinstance(backgrounds, list) and backgrounds:
        index = state.get("selectedBgIdx", 0) or 0
        if not isinstance(index, int) or not 0 <= index < len(backgrounds):
            index = 0
        candidate = backgrounds[index]
        if isinstance(candidate, dict):
            background = candidate
    dimensions = background.get("dimensions") or {}
    screens_x = max(1, int(dimensions.get("screens_x") or 1))
    screens_y = max(1, int(dimensions.get("screens_y") or 1))
    columns = SCREEN_COLS * screens_x
    rows = SCREEN_ROWS * screens_y

    nametable = background.get("nametable")
    if not isinstance(nametable, list):
        nametable = state.get("nametable") or []
    tiles = bytearray(columns * rows)
    for row_index in range(rows):
        row = nametable[row_index] if row_index < len(nametable) else []
        base = row_index * columns
        for column in range(columns):
            cell = row[column] if column < len(row) else None
            if isinstance(cell, dict):
                tiles[base + column] = int(cell.get("tile", 0)) & 0xFF

    attribute_columns = 8 * screens_x
    attribute_rows = 8 * screens_y
    attributes = bytearray(attribute_columns * attribute_rows)
    for screen_y in range(screens_y):
        for screen_x in range(screens_x):
            tile_row_start = screen_y * SCREEN_ROWS
            tile_column_start = screen_x * SCREEN_COLS
            for screen_row in range(8):
                for screen_column in range(8):
                    value = 0
                    for quadrant in range(4):
                        quadrant_row = (quadrant >> 1) & 1
                        quadrant_column = quadrant & 1
                        tile_row = tile_row_start + screen_row * 4 + quadrant_row * 2
                        tile_column = (
                            tile_column_start + screen_column * 4 + quadrant_column * 2
                        )
                        palette = 0
                        if tile_row < len(nametable):
                            row = nametable[tile_row]
                            if tile_column < len(row) and isinstance(row[tile_column], dict):
                                palette = int(row[tile_column].get("palette", 0)) & 3
                        value |= palette << (quadrant * 2)
                    offset = (screen_y * 8 + screen_row) * attribute_columns
                    attributes[offset + screen_x * 8 + screen_column] = value
    return (
        bytes(tiles),
        bytes(attributes),
        columns,
        rows,
        attribute_columns,
        attribute_rows,
    )


def _dedup_columns(
    tiles: bytes, columns: int, rows: int
) -> tuple[list[int], bytearray, int]:
    """Column-deduplicate a row-major tile array.

    Returns (column_index, column_data, unique).  column_index[c] is the
    unique-column id for world column c; column_data lays the unique columns out
    contiguously so column_data[uid * rows + r] is that column's tile at row r.
    Levels repeat columns heavily (sky, flat floor, repeated blocks), so this
    shrinks a raw ~1KB/screen tile array to a small unique-column table plus a
    1-byte-per-column index — the compression that lets levels exceed the
    ~8-screen NROM raw cap.
    """
    seen: dict[bytes, int] = {}
    # A plain list (not a bytearray) so the uid can exceed 255 without raising:
    # levels with >=256 unique columns cannot be indexed in one byte, but we must
    # still count them so the caller can reject the world with a clear message
    # instead of crashing with "byte must be in range(0, 256)".
    column_index: list[int] = []
    column_data = bytearray()
    for column in range(columns):
        column_bytes = bytes(tiles[row * columns + column] for row in range(rows))
        uid = seen.get(column_bytes)
        if uid is None:
            uid = len(seen)
            seen[column_bytes] = uid
            column_data.extend(column_bytes)
        column_index.append(uid)
    return column_index, column_data, len(seen)


def bg_compression(
    state: dict[str, Any],
) -> tuple[bool, int, bytes | None, bytes | None]:
    """Decide whether the selected background's tiles are column-compressed.

    Compress ANY 1-tall world wider than one screen (>32 cols) when the dedup
    both fits a 1-byte index (<256 unique columns) AND is actually smaller than
    the raw array.  (v66: was gated to >8 screens = >256 cols, which left a
    *detailed* 5-8 screen level overflowing NROM on the raw path with no help;
    real hand-painted levels repeat columns heavily — sky, flat floor, repeated
    blocks — so compressing them shrinks the ROM and lets them fit.)  A 1-screen
    world (32 cols) stays raw so its ROM is byte-identical to the baseline; tall
    worlds (rows>30) stay raw (tall scroll is capped at 2 screens).  Returns
    (compress, unique, column_index, column_data).
    """
    tiles, _attributes, columns, rows, _acols, _arows = world_nametable(state)
    if rows == SCREEN_ROWS and columns > SCREEN_COLS:
        column_index, column_data, unique = _dedup_columns(tiles, columns, rows)
        # Compressed size = unique-column data + a 1-byte index per world column.
        # Only compress when it fits a 1-byte index and genuinely shrinks the ROM.
        if unique < 256 and (unique * rows + columns) < (columns * rows):
            return True, unique, bytes(column_index), bytes(column_data)
        # Couldn't compress usefully.  Return the real count so guard_world_fits
        # can reject a *wide* (>8 screen) un-compressible world with a clear
        # message (a raw >8-screen array always overflows NROM).
        return False, unique, None, None
    return False, 0, None, None


def guard_world_fits(state: dict[str, Any]) -> None:
    """Reject worlds that provably cannot fit an NROM cartridge, with a clear,
    kid-friendly message instead of a Python traceback or an obscure
    "memory area overflow" linker error.

    The one case we can prove up front: a world more than 8 screens wide (>256
    cols) that also can't column-compress (too many distinct columns for a
    1-byte index, or not compressible enough).  A raw >8-screen array always
    overflows NROM, so such a world can never build — better to say why.  A
    world of 8 screens or fewer is NOT rejected here: it may fit raw, and if it
    doesn't the linker overflow is turned into a friendly message downstream.
    """
    _tiles, _attributes, columns, rows, _acols, _arows = world_nametable(state)
    if rows == SCREEN_ROWS and columns > 8 * SCREEN_COLS:
        compress, unique, _index, _data = bg_compression(state)
        if not compress:
            raise BuildError(
                "This level is too big to fit on the cartridge. It is more than "
                "8 screens wide and its columns are too varied to pack down "
                f"({unique} different columns — the compressor needs fewer than "
                "256 and works best with lots of repeats). Try making it "
                "shorter, or reuse more repeated sections (flat floor, repeated "
                "blocks) so columns can be shared."
            )


def build_bg_world_h(state: dict[str, Any]) -> str:
    _, _, columns, rows, attribute_columns, attribute_rows = world_nametable(state)
    compress, unique, _index, _data = bg_compression(state)
    lines = [
        "/* Auto-generated by playground_server.py — do not edit by hand. */",
        "/* Source: the Backgrounds page of the tile editor.              */",
        "#ifndef BG_WORLD_H",
        "#define BG_WORLD_H",
        "",
        "/* Full-world nametable, row-major.  Covers every screen the pupil",
        "   painted; the scroll core (Sprint 11 S-1) streams columns/rows",
        "   from this data into the off-screen nametable as the camera moves.",
        "   1x1 projects still include this header but nothing consumes it. */",
        f"#define BG_WORLD_COLS       {columns}",
        f"#define BG_WORLD_ROWS       {rows}",
        f"#define BG_WORLD_ATTR_COLS  {attribute_columns}",
        f"#define BG_WORLD_ATTR_ROWS  {attribute_rows}",
        f"#define SCROLL_COMPRESSED   {1 if compress else 0}",
        "",
        "/* Full-world pixel dimensions.  Exposed here (rather than in",
        "   scroll.h) because main.c bounds-checks the player against them",
        "   even on the 1x1 fast path, where scroll.h is not included. */",
        "#define WORLD_W_PX          (BG_WORLD_COLS * 8)",
        "#define WORLD_H_PX          (BG_WORLD_ROWS * 8)",
        "",
        *(
            [
                f"#define BG_COL_UNIQ         {unique}",
                "extern const unsigned char bg_col_index[BG_WORLD_COLS];",
                "extern const unsigned char bg_col_data[BG_COL_UNIQ * BG_WORLD_ROWS];",
            ]
            if compress
            else [
                "extern const unsigned char bg_world_tiles[BG_WORLD_COLS * BG_WORLD_ROWS];",
            ]
        ),
        "extern const unsigned char bg_world_attrs[BG_WORLD_ATTR_COLS * BG_WORLD_ATTR_ROWS];",
        "",
        "#endif",
        "",
    ]
    return "\n".join(lines)


def _hex_table(name: str, size_expression: str, data: bytes) -> list[str]:
    output = [f"const unsigned char {name}[{size_expression}] = {{"]
    if not data:
        output.append("  0")
    else:
        for index in range(0, len(data), 16):
            chunk = data[index : index + 16]
            output.append("  " + ", ".join(f"0x{value:02X}" for value in chunk) + ",")
    output.append("};")
    return output


def build_bg_world_c(state: dict[str, Any]) -> str:
    tiles, attributes, columns, rows, attribute_columns, attribute_rows = world_nametable(
        state
    )
    compress, unique, column_index, column_data = bg_compression(state)
    lines = [
        "/* Auto-generated by playground_server.py — do not edit by hand. */",
        "/* Source: the Backgrounds page of the tile editor.              */",
        '#include "bg_world.h"',
        "",
        "/* Gate the arrays on world size so 1x1 builds emit no symbols,",
        "   keeping their ROM byte-identical to the pre-Sprint-11 baseline.",
        "   The scroll core only references these arrays under the same",
        "   guard — dangling externs are harmless as long as no caller",
        "   actually links against them. */",
        "#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)",
        "",
        f"/* {columns} cols x {rows} rows of 8x8 tiles ({columns * rows} bytes). */",
    ]
    if compress:
        lines += [
            f"/* Column-deduplicated (feedback #10 — go beyond 8 screens): {unique} "
            f"unique columns x {rows} rows = {unique * rows} bytes + a {columns}-byte "
            f"index; the raw array would be {columns * rows} bytes. The scroll core "
            f"reads bg_col_data[bg_col_index[col] * BG_WORLD_ROWS + rr]. */",
        ]
        lines += _hex_table("bg_col_index", "BG_WORLD_COLS", column_index)
        lines += [""]
        lines += _hex_table("bg_col_data", "BG_COL_UNIQ * BG_WORLD_ROWS", column_data)
    else:
        lines += _hex_table("bg_world_tiles", "BG_WORLD_COLS * BG_WORLD_ROWS", tiles)
    lines += [
        "",
        f"/* {attribute_columns} x {attribute_rows} attribute bytes ({attribute_columns * attribute_rows} bytes). */",
    ]
    lines += _hex_table(
        "bg_world_attrs", "BG_WORLD_ATTR_COLS * BG_WORLD_ATTR_ROWS", attributes
    )
    lines += ["", "#endif", ""]
    return "\n".join(lines)


def project_needs_four_screen(state: Any) -> bool:
    if not isinstance(state, dict):
        return False
    backgrounds = state.get("backgrounds") or []
    if not isinstance(backgrounds, list):
        return False
    for background in backgrounds:
        if not isinstance(background, dict):
            continue
        dimensions = background.get("dimensions") or {}
        try:
            screens_y = int(dimensions.get("screens_y") or 1)
        except (TypeError, ValueError):
            screens_y = 1
        if screens_y > 1:
            return True
    return False


def patch_ines_four_screen(rom_bytes: bytes) -> bytes:
    if not rom_bytes or len(rom_bytes) < 16 or rom_bytes[:4] != b"NES\x1a":
        return rom_bytes
    header = bytearray(rom_bytes[:16])
    header[6] |= 0x08
    return bytes(header) + rom_bytes[16:]
