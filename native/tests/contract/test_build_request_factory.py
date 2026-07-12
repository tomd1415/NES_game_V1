from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
NATIVE_ROOT = REPOSITORY_ROOT / "native"
WEB_ROOT = REPOSITORY_ROOT / "tools" / "tile_editor_web"
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.codegen import CodegenRuntime  # noqa: E402
from nes_studio.core.build_request import BuildRequestFactory  # noqa: E402
from nes_studio.core.project_document import ProjectSnapshot  # noqa: E402


SCRIPTS = [
    Path("tools/tile_editor_web/builder-assembler.js"),
    Path("tools/tile_editor_web/builder-modules.js"),
]
def runtime_value(scripts, expression, globals=None):
    return CodegenRuntime(REPOSITORY_ROOT).evaluate(
        scripts, expression, globals=globals or {}
    ).value


def browser_request(state: dict, template: str) -> dict:
    script = r"""
global.window = global;
const fs = require('fs');
const vm = require('vm');
vm.runInThisContext(fs.readFileSync('tools/tile_editor_web/builder-assembler.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('tools/tile_editor_web/builder-modules.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('tools/tile_editor_web/play-pipeline.js', 'utf8'));
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
global.NES_TARGET_ENGINE = 63;
process.stdout.write(JSON.stringify(
  PlayPipeline.buildPlayRequest(input.state, input.template, {mode: 'native'})
));
"""
    completed = subprocess.run(
        ["node", "-e", script],
        cwd=REPOSITORY_ROOT,
        input=json.dumps({"state": state, "template": template}),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(completed.stdout)


def canonical_state() -> dict:
    builder = runtime_value(SCRIPTS, "BuilderDefaults()")
    builder["modules"]["players"]["submodules"]["player2"]["enabled"] = True
    builder["modules"]["scene"]["config"]["instances"] = [
        {"spriteIdx": 2, "x": 311, "y": 99}
    ]
    cells = [[{"tile": 1, "palette": 0, "empty": False}]]
    state = {
        "version": 1,
        "name": "request parity",
        "engineVersion": 63,
        "selectedBgIdx": 0,
        "backgrounds": [
            {
                "name": "room",
                "dimensions": {"screens_x": 1, "screens_y": 1},
                "nametable": [
                    [{"tile": 0, "palette": 0} for _ in range(32)] for _ in range(30)
                ],
                "behaviour": [[0 for _ in range(32)] for _ in range(30)],
            }
        ],
        "sprites": [
            {"name": "p1", "role": "player", "width": 1, "height": 1, "cells": cells},
            {"name": "p2", "role": "player", "width": 1, "height": 1, "cells": cells},
            {"name": "enemy", "role": "enemy", "width": 1, "height": 1, "cells": cells},
        ],
        "builder": builder,
        "audio": {
            "songs": [
                {"asm": "song_one:", "symbol": "song_one"},
                {"asm": "song_two:", "symbol": "song_two"},
            ],
            "defaultSongIdx": 1,
            "sfx": {"asm": "sounds:", "symbol": "sounds"},
        },
    }
    return state


def test_native_build_request_is_identical_to_browser_play_pipeline() -> None:
    state = canonical_state()
    before = copy.deepcopy(state)
    template = (WEB_ROOT / "builder-templates" / "platformer.c").read_text()
    builder_defaults = runtime_value(SCRIPTS, "BuilderDefaults()")

    def assemble(value):
        return runtime_value(
            SCRIPTS,
            "BuilderAssembler.assemble(state, template)",
            {"state": value, "template": template},
        )

    native = BuildRequestFactory(
        target_engine=63,
        builder_defaults=builder_defaults,
        assembler=assemble,
    ).create(ProjectSnapshot.from_state(state), mode="native").to_dict()
    browser = browser_request(state, template)
    assert native == browser
    assert state == before


def test_factory_fortifies_empty_project_without_mutating_snapshot() -> None:
    state = canonical_state()
    state["sprites"] = []
    state.pop("audio")
    state.pop("builder")
    snapshot = ProjectSnapshot.from_state(state)
    defaults = runtime_value(SCRIPTS, "BuilderDefaults()")
    request = BuildRequestFactory(
        target_engine=63,
        builder_defaults=defaults,
        assembler=lambda _state: "generated",
    ).create(snapshot).to_dict()
    assert request["state"]["sprites"][0]["role"] == "player"
    assert request["state"]["audio"] == {
        "songs": [],
        "sfx": None,
        "defaultSongIdx": 0,
    }
    assert request["customMainC"] == "generated"
    assert "sprites" not in snapshot.state() or snapshot.state()["sprites"] == []
