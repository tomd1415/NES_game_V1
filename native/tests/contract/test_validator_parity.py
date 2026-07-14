"""The native validators must say exactly what the web's say.

`core/validators.py` is a port of `tools/tile_editor_web/builder-validators.js`.
A port drifts. This test runs the **real JavaScript**, in node, over the same
project states, and asserts the two produce identical problems — same order,
same ids, same severities, and the same message text down to the curly
apostrophes and the double spaces.

That is the whole point of `tests/contract/`: an invariant that holds the two
targets together, rather than two implementations that merely looked the same on
the day they were written.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = NATIVE_ROOT.parent
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.core.validators import validate  # noqa: E402

VALIDATORS_JS = REPO_ROOT / "tools" / "tile_editor_web" / "builder-validators.js"
NODE = shutil.which("node")

#: A harness that loads the web's file as-is and reports what it says.
HARNESS = """
const fs = require('fs');
global.window = {};
eval(fs.readFileSync(process.argv[2], 'utf8'));
const states = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = states.map((state) => window.BuilderValidators.validate(state));
process.stdout.write(JSON.stringify(out));
"""


def _background(behaviour=None, screens_x=1, screens_y=1):
    return {
        "behaviour": behaviour or [[0] * 32 for _ in range(30)],
        "dimensions": {"screens_x": screens_x, "screens_y": screens_y},
    }


def _state(**overrides):
    base = {
        "sprites": [],
        "backgrounds": [_background()],
        "selectedBgIdx": 0,
        "animations": [],
        "builder": {"modules": {}},
    }
    base.update(overrides)
    return base


def _module(name, enabled=True, **config):
    return {name: {"enabled": enabled, "config": config}}


def _players(p1=None, p2=None):
    submodules = {}
    if p1 is not None:
        submodules["player1"] = {"enabled": True, "config": p1}
    if p2 is not None:
        submodules["player2"] = {"enabled": True, "config": p2}
    return {"players": {"enabled": True, "submodules": submodules}}


def _trigger_map():
    behaviour = [[0] * 32 for _ in range(30)]
    behaviour[10][10] = 5
    return behaviour


#: Every state here is chosen to make a different check fire. Add one whenever a
#: check is added — a check with no case here is a check that can silently drift.
CASES: list[dict] = [
    # clean
    _state(),
    # no player sprite, no walk animation
    _state(builder={"modules": _players(p1={"maxHp": 3})}),
    # damage, no health, no enemies
    _state(
        sprites=[{"role": "player", "width": 2, "height": 2}],
        builder={"modules": {**_module("damage"), **_players(p1={"maxHp": 0})}},
    ),
    # damage, P2 on, both invincible — two problems, in order
    _state(
        sprites=[
            {"role": "player", "width": 1, "height": 1},
            {"role": "player", "width": 1, "height": 1},
        ],
        builder={
            "modules": {
                **_module("damage"),
                **_players(p1={"maxHp": 0}, p2={"maxHp": 0}),
            }
        },
    ),
    # dialogue: no NPC, blank text, unsupported characters
    _state(builder={"modules": _module("dialogue", text="héllo @ world")}),
    # dialogue with an NPC that says something unsayable
    _state(
        sprites=[{"role": "npc", "width": 1, "height": 1}],
        builder={
            "modules": {
                **_module("dialogue", text="HI", text2="", text3=""),
                **_module("scene", instances=[{"spriteIdx": 0, "x": 20, "y": 20, "text": "Wot? #1"}]),
            }
        },
    ),
    # win condition with nothing to reach
    _state(builder={"modules": _module("win_condition", type="reach_tile", behaviourType="door")}),
    # win by pickups, pickups off
    _state(builder={"modules": _module("win_condition", type="all_pickups_collected")}),
    # win by pickups, pickups on, no pickup sprite
    _state(
        builder={
            "modules": {
                **_module("win_condition", type="all_pickups_collected"),
                **_module("pickups"),
            }
        }
    ),
    # doors: out of range and no door tiles
    _state(builder={"modules": _module("doors", targetBgIdx=9)}),
    # doors: a float target, interpolated raw by the web
    _state(builder={"modules": _module("doors", targetBgIdx=3.5)}),
    # scene instance pointing at a sprite that is gone
    _state(builder={"modules": _module("scene", instances=[{"spriteIdx": 4, "x": 10, "y": 20}])}),
    # scene instance off screen
    _state(
        sprites=[{"role": "enemy", "width": 1, "height": 1}],
        builder={"modules": _module("scene", instances=[{"spriteIdx": 0, "x": 300, "y": 20}])},
    ),
    # sprites-per-scanline overflow
    _state(
        sprites=[{"role": "enemy", "width": 5, "height": 2}],
        builder={
            "modules": _module(
                "scene",
                instances=[
                    {"spriteIdx": 0, "x": 0, "y": 100},
                    {"spriteIdx": 0, "x": 40, "y": 100},
                ],
            )
        },
    ),
    # a player too big for OAM
    _state(sprites=[{"role": "player", "width": 8, "height": 9}]),
    # the whole frame over budget
    _state(
        sprites=[
            {"role": "player", "width": 4, "height": 4},
            {"role": "enemy", "width": 4, "height": 4},
            {"role": "hud", "width": 1, "height": 1},
        ],
        builder={
            "modules": {
                **_players(p1={"maxHp": 9}),
                **_module("hud"),
                **_module(
                    "scene",
                    instances=[{"spriteIdx": 1, "x": 20, "y": 20}, {"spriteIdx": 1, "x": 40, "y": 20}],
                ),
            }
        },
    ),
    # spawn effect pointing nowhere (index rendered raw)
    _state(builder={"modules": _module("spawn")}),
    _state(builder={"modules": _module("spawn", spriteIdx=9)}),
    # damage effect pointing nowhere
    _state(
        sprites=[{"role": "enemy", "width": 1, "height": 1}],
        builder={
            "modules": {
                **_module("damage", spawnOnHit=True, spawnSpriteIdx=None),
                **_players(p1={"maxHp": 3}),
            }
        },
    ),
    # respawn HP over max
    _state(
        sprites=[{"role": "enemy", "width": 1, "height": 1}],
        builder={
            "modules": {
                **_module("damage", checkpoints=True, respawnHp=8),
                **_players(p1={"maxHp": 3}),
            }
        },
    ),
    # HUD with no HUD sprite
    _state(builder={"modules": _module("hud")}),
    # player 2 without a second player sprite
    _state(
        sprites=[{"role": "player", "width": 1, "height": 1}],
        builder={"modules": _players(p1={"maxHp": 3}, p2={"maxHp": 3})},
    ),
    # walls module with nothing painted
    _state(builder={"modules": _module("behaviour_walls")}),
    # enemy walk animation whose size matches no enemy
    _state(
        sprites=[
            {"role": "enemy", "width": 1, "height": 1},
            {"role": "npc", "width": 3, "height": 3},
        ],
        animations=[{"role": "enemy", "style": "walk", "frames": [1]}],
    ),
    # dialogue on, an NPC to say it, and nothing to say
    _state(
        sprites=[{"role": "npc", "width": 1, "height": 1}],
        builder={"modules": _module("dialogue", text="   ")},
    ),
    # smb: flagpole with no win condition, and past the end of the level
    _state(
        builder={
            "modules": {
                **_module("game", type="smb"),
                **_module("flagpole", x=200),
            }
        }
    ),
    # blocks giving a power-up with the power-up module off
    _state(
        builder={
            "modules": {
                **_module("blocks", blockList=[{"kind": "question", "contents": "mushroom"}]),
            }
        }
    ),
    # runner: too narrow, no spikes, dialogue that will not work
    _state(
        builder={
            "modules": {
                **_module("game", type="runner"),
                **_module("dialogue", text="HI"),
            }
        }
    ),
    # racer: one screen, no markers
    _state(builder={"modules": _module("game", type="racer", racerCheckpoints=2)}),
    # racer: big enough, still missing its markers
    _state(
        backgrounds=[_background(screens_x=2, screens_y=2)],
        builder={"modules": _module("game", type="racer", racerCheckpoints=1)},
    ),
    # a project that is actually finished and clean
    _state(
        sprites=[
            {"role": "player", "width": 1, "height": 1},
            {"role": "enemy", "width": 1, "height": 1},
        ],
        animations=[{"id": 1, "role": "player", "style": "walk", "frames": [0]}],
        animation_assignments={"walk": 1},
        backgrounds=[_background(behaviour=_trigger_map())],
        builder={
            "modules": {
                **_players(p1={"maxHp": 3}),
                **_module("damage"),
                **_module("win_condition", type="reach_tile", behaviourType="trigger"),
            }
        },
    ),
]


@unittest.skipUnless(NODE, "node is not installed")
@unittest.skipUnless(VALIDATORS_JS.exists(), "the web validators are not in this checkout")
class ValidatorParityTests(unittest.TestCase):
    """The native checks and the web's must be the same checks."""

    @classmethod
    def setUpClass(cls) -> None:
        import tempfile

        cls._directory = tempfile.TemporaryDirectory()
        directory = Path(cls._directory.name)
        harness = directory / "harness.js"
        harness.write_text(HARNESS, encoding="utf-8")
        states = directory / "states.json"
        states.write_text(json.dumps(CASES), encoding="utf-8")

        result = subprocess.run(
            [NODE, str(harness), str(VALIDATORS_JS), str(states)],
            capture_output=True,
            text=True,
            check=True,
        )
        cls.web = json.loads(result.stdout)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._directory.cleanup()

    def test_every_case_produces_the_same_problems(self) -> None:
        for index, case in enumerate(CASES):
            with self.subTest(case=index):
                # The web's own `validate()` does not include the scanline check
                # that `studio.js` appends afterwards, so compare like with like.
                native = [
                    problem
                    for problem in validate(case)
                    if problem.id != "scanline-overflow"
                ]
                expected = self.web[index]

                self.assertEqual(
                    [problem.id for problem in native],
                    [problem["id"] for problem in expected],
                    "the two targets disagree on which checks fire, or in what order",
                )
                for got, want in zip(native, expected):
                    self.assertEqual(got.severity, want["severity"], f"{got.id}: severity")
                    self.assertEqual(got.message, want["message"], f"{got.id}: message")
                    self.assertEqual(got.fix, want["fix"], f"{got.id}: fix")
                    self.assertEqual(
                        got.jump_to, want["jumpTo"], f"{got.id}: jump target"
                    )

    def test_the_cases_exercise_every_check(self) -> None:
        """A check with no case here is a check that can silently drift.

        Fails when a check is added to either target without a case that makes it
        fire — which is precisely when the two are free to diverge unnoticed.
        """

        import re

        source = Path(
            NATIVE_ROOT / "src" / "nes_studio" / "core" / "validators.py"
        ).read_text(encoding="utf-8")
        declared = set(re.findall(r'id="([a-z0-9-]+)"', source))
        # `scanline-overflow` lives in studio.js, not builder-validators.js, so
        # the web's `validate()` never emits it.
        declared.discard("scanline-overflow")

        fired = {problem["id"] for problems in self.web for problem in problems}

        self.assertEqual(
            declared - fired,
            set(),
            "these checks have no case that makes them fire, so they can drift",
        )


if __name__ == "__main__":
    unittest.main()
