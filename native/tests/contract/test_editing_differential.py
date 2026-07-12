from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
NATIVE_ROOT = REPOSITORY_ROOT / "native"
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.core.editing import (  # noqa: E402
    delete_metatile,
    promote_background_to_metatiles,
    swap_tile_slots,
)


def node(
    expression: str,
    value: dict,
    *,
    scripts: tuple[str, ...],
    prelude: str = "",
) -> dict:
    loader = "\n".join(
        f"vm.runInThisContext(fs.readFileSync({json.dumps(script)}, 'utf8'));"
        for script in scripts
    )
    source = f"""
global.window = global; global.globalThis = global;
const fs = require('fs'), vm = require('vm');
const value = JSON.parse(fs.readFileSync(0, 'utf8'));
{prelude}
{loader}
{expression}
process.stdout.write(JSON.stringify(value));
"""
    result = subprocess.run(
        ["node", "-e", source],
        cwd=REPOSITORY_ROOT,
        input=json.dumps(value),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def background() -> dict:
    cells = [
        [{"tile": (row % 2) * 2 + column % 2 + 4, "palette": row // 2} for column in range(4)]
        for row in range(4)
    ]
    return {
        "nametable": cells,
        "behaviour": [[7 if row < 2 else 9 for _ in range(4)] for row in range(4)],
        "future": "kept",
    }


def test_metatile_promotion_and_deletion_match_browser_library() -> None:
    native = promote_background_to_metatiles(copy.deepcopy(background()))
    browser = node(
        "MetatileLib.promote(value);",
        copy.deepcopy(background()),
        scripts=("tools/tile_editor_web/metatiles.js",),
    )
    assert native == browser
    assert delete_metatile(native, 0) is True
    browser_deleted = node(
        "MetatileLib.deleteBlock(value, 0);",
        browser,
        scripts=("tools/tile_editor_web/metatiles.js",),
    )
    assert native == browser_deleted


def tile_state() -> dict:
    tiles = [{"slot": index} for index in range(256)]
    return {
        "bg_tiles": copy.deepcopy(tiles),
        "sprite_tiles": copy.deepcopy(tiles),
        "backgrounds": [{
            "nametable": [[{"tile": 3}, {"tile": 9}, {"tile": 4}]],
            "metatiles": [{"tiles": [9, 3, 4, 3]}],
        }],
        "sprites": [{"cells": [[{"tile": 3}, {"tile": 9, "empty": True}, {"tile": 9}]]}],
    }


def browser_swap(value: dict, bank: str) -> dict:
    prelude = """
global.StudioUI = {el: function(){}, bgTileUsage: function(){}, spriteTileUsage: function(){}};
global.Studio = {getState: function(){ return value; }};
global.NesRender = {};
"""
    return node(
        f"StudioModes.tiles._set({{bank: {json.dumps(bank)}}}); StudioModes.tiles._swap(3, 9);",
        value,
        scripts=("tools/tile_editor_web/studio-tiles.js",),
        prelude=prelude,
    )


def test_background_and_sprite_tile_reference_swaps_match_studio() -> None:
    for bank in ("bg", "sprite"):
        original = tile_state()
        native = copy.deepcopy(original)
        swap_tile_slots(native, bank, 3, 9)
        assert native == browser_swap(original, bank)
