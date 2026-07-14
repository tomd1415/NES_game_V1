"""The ~30 checks that tell a pupil why their game will not work."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from nes_studio.core.validators import (  # noqa: E402
    Problem,
    has_errors,
    scanline_load,
    too_many_sprites_per_scanline,
    validate,
)


def state(**overrides) -> dict:
    base = {
        "sprites": [],
        "backgrounds": [{"behaviour": [[0] * 32 for _ in range(30)], "dimensions": {"screens_x": 1, "screens_y": 1}}],
        "selectedBgIdx": 0,
        "builder": {"modules": {}},
    }
    base.update(overrides)
    return base


def module(name: str, enabled: bool = True, **config) -> dict:
    return {name: {"enabled": enabled, "config": config}}


class ValidatorTests(unittest.TestCase):
    def test_a_bare_project_has_no_problems(self) -> None:
        self.assertEqual(validate(state()), [])

    def test_player_module_without_a_player_sprite(self) -> None:
        problems = validate(
            state(builder={"modules": {"players": {"submodules": {"player1": {"enabled": True}}}}})
        )
        ids = [problem.id for problem in problems]
        self.assertIn("no-player-role", ids)
        self.assertTrue(has_errors(problems))

    def test_the_problem_knows_which_mode_fixes_it(self) -> None:
        problems = validate(
            state(builder={"modules": {"players": {"submodules": {"player1": {"enabled": True}}}}})
        )
        problem = next(p for p in problems if p.id == "no-player-role")
        self.assertEqual(problem.mode, "CHARS")

    def test_dialogue_without_an_npc_is_an_error(self) -> None:
        problems = validate(state(builder={"modules": module("dialogue", text="HELLO")}))
        self.assertIn("dialogue-no-npc", [problem.id for problem in problems])

    def test_dialogue_with_an_npc_and_text_is_clean(self) -> None:
        problems = validate(
            state(
                sprites=[{"role": "npc", "width": 1, "height": 1}],
                builder={"modules": module("dialogue", text="HELLO")},
            )
        )
        self.assertEqual([problem.id for problem in problems], [])

    def test_dialogue_reports_unsupported_characters(self) -> None:
        problems = validate(
            state(
                sprites=[{"role": "npc", "width": 1, "height": 1}],
                builder={"modules": module("dialogue", text="HELLO @ WORLD")},
            )
        )
        problem = next(p for p in problems if p.id == "dialogue-unsupported-chars")
        self.assertIn('"@"', problem.message)

    def test_a_win_condition_with_no_winning_tile(self) -> None:
        problems = validate(
            state(builder={"modules": module("win_condition", type="reach_tile", behaviourType="trigger")})
        )
        problem = next(p for p in problems if p.id == "win-no-tiles")
        self.assertIn("trigger tiles", problem.message)
        self.assertEqual(problem.mode, "WORLD")

    def test_a_painted_trigger_satisfies_the_win_condition(self) -> None:
        behaviour = [[0] * 32 for _ in range(30)]
        behaviour[5][5] = 5  # trigger
        problems = validate(
            state(
                backgrounds=[{"behaviour": behaviour, "dimensions": {"screens_x": 1, "screens_y": 1}}],
                builder={"modules": module("win_condition", type="reach_tile")},
            )
        )
        self.assertNotIn("win-no-tiles", [problem.id for problem in problems])

    def test_doors_pointing_at_a_background_that_does_not_exist(self) -> None:
        problems = validate(state(builder={"modules": module("doors", targetBgIdx=7)}))
        problem = next(p for p in problems if p.id == "doors-target-invalid-bg")
        self.assertIn("you only have 1 background.", problem.message)

    def test_a_same_room_door_is_fine(self) -> None:
        behaviour = [[0] * 32 for _ in range(30)]
        behaviour[1][1] = 4  # door
        problems = validate(
            state(
                backgrounds=[{"behaviour": behaviour, "dimensions": {"screens_x": 1, "screens_y": 1}}],
                builder={"modules": module("doors", targetBgIdx=-1)},
            )
        )
        self.assertEqual([problem.id for problem in problems], [])

    def test_damage_with_no_health_is_an_error(self) -> None:
        problems = validate(
            state(
                sprites=[{"role": "enemy", "width": 1, "height": 1}],
                builder={
                    "modules": {
                        **module("damage"),
                        "players": {"submodules": {"player1": {"enabled": True, "config": {"maxHp": 0}}}},
                    }
                },
            )
        )
        problem = next(p for p in problems if p.id == "hp-zero-with-damage")
        self.assertEqual(problem.severity, "error")
        self.assertIn("no player can take damage", problem.message)

    def test_a_player_too_big_for_the_hardware(self) -> None:
        problems = validate(state(sprites=[{"role": "player", "width": 8, "height": 9}]))
        problem = next(p for p in problems if p.id == "player-oam-overflow")
        self.assertIn("need 72 hardware sprites", problem.message)
        self.assertEqual(problem.severity, "error")

    def test_a_missing_spawn_sprite_renders_like_javascript(self) -> None:
        """The web interpolates the index raw, so an absent one reads
        `sprite #undefined`. Reproduced, because the two must agree."""

        problems = validate(state(builder={"modules": module("spawn")}))
        problem = next(p for p in problems if p.id == "spawn-trigger-invalid-sprite")
        self.assertIn("sprite #undefined", problem.message)

    def test_a_runner_needs_a_wide_world(self) -> None:
        problems = validate(state(builder={"modules": module("game", type="runner")}))
        ids = [problem.id for problem in problems]
        self.assertIn("runner-needs-scrolling-world", ids)
        self.assertIn("runner-no-spike", ids)

    def test_a_racer_needs_its_markers(self) -> None:
        problems = validate(
            state(
                backgrounds=[
                    {
                        "behaviour": [[0] * 32 for _ in range(30)],
                        "dimensions": {"screens_x": 2, "screens_y": 1},
                    }
                ],
                builder={"modules": module("game", type="racer", racerCheckpoints=2)},
            )
        )
        problem = next(p for p in problems if p.id == "racer-laps-need-markers")
        self.assertIn("a finish line and checkpoint 1", problem.message)
        self.assertIn("checkpoint 2", problem.message)

    def test_problems_come_back_in_the_web_s_order(self) -> None:
        """No sorting, no dedup — the web reports them in the order it runs the
        checks, and the two must match."""

        problems = validate(
            state(
                builder={
                    "modules": {
                        **module("damage"),
                        **module("dialogue", text=""),
                        "players": {
                            "submodules": {
                                "player1": {"enabled": True, "config": {"maxHp": 0}},
                                "player2": {"enabled": True, "config": {"maxHp": 0}},
                            }
                        },
                    }
                }
            )
        )
        ids = [problem.id for problem in problems]
        self.assertLess(ids.index("p2-hp-zero-with-damage"), ids.index("hp-zero-with-damage"))
        self.assertLess(ids.index("hp-zero-with-damage"), ids.index("damage-no-enemies"))

    def test_a_check_that_throws_is_skipped_not_fatal(self) -> None:
        """One broken validator must never stop a pupil building their game."""

        broken = state()
        broken["backgrounds"] = "not a list at all"
        self.assertIsInstance(validate(broken), list)


class ScanlineTests(unittest.TestCase):
    """The NES draws 8 sprites per scanline. The 9th does not appear."""

    def test_two_wide_sprites_side_by_side_overflow(self) -> None:
        sprites = [{"role": "enemy", "width": 5, "height": 2}]
        instances = [
            {"spriteIdx": 0, "x": 0, "y": 100},
            {"spriteIdx": 0, "x": 40, "y": 100},
        ]
        problem = too_many_sprites_per_scanline(
            state(sprites=sprites, builder={"modules": module("scene", instances=instances)})
        )
        self.assertIsNotNone(problem)
        self.assertIn("Up to 10 sprites", problem.message)
        self.assertEqual(problem.severity, "warn")

    def test_sprites_a_screen_apart_do_not_collide(self) -> None:
        """The 256px window is what stops a scrolling level false-positiving on
        enemies that are nowhere near one another."""

        sprites = [{"role": "enemy", "width": 5, "height": 2}]
        instances = [
            {"spriteIdx": 0, "x": 0, "y": 100},
            {"spriteIdx": 0, "x": 300, "y": 100},
        ]
        problem = too_many_sprites_per_scanline(
            state(sprites=sprites, builder={"modules": module("scene", instances=instances)})
        )
        self.assertIsNone(problem)

    def test_the_per_scanline_analysis_honours_empty_cells(self) -> None:
        """The stricter of the two analyses counts *cells*, and an empty cell
        costs nothing."""

        full = {
            "role": "enemy",
            "width": 4,
            "height": 1,
            "cells": [[{"tile": 1}, {"tile": 1}, {"tile": 1}, {"tile": 1}]],
        }
        empty = {
            "role": "enemy",
            "width": 4,
            "height": 1,
            "cells": [[{"tile": 1, "empty": True}] * 4],
        }
        instances = [{"spriteIdx": 0, "x": index * 8, "y": 50} for index in range(3)]

        busy = scanline_load(
            state(sprites=[full], builder={"modules": module("scene", instances=instances)})
        )
        self.assertEqual(busy.max_load, 12)

        blank = scanline_load(
            state(sprites=[empty], builder={"modules": module("scene", instances=instances)})
        )
        self.assertEqual(blank.max_load, 0)
        self.assertEqual(blank.overflow_rows, 0)

    def test_overflow_is_reported_with_the_busiest_row(self) -> None:
        sprite = {
            "role": "enemy",
            "width": 5,
            "height": 1,
            "cells": [[{"tile": 1}] * 5],
        }
        instances = [{"spriteIdx": 0, "x": index * 8, "y": 60} for index in range(3)]
        problems = validate(
            state(sprites=[sprite], builder={"modules": module("scene", instances=instances)})
        )
        problem = next(p for p in problems if p.id == "scanline-overflow")
        self.assertIn("busiest: 15", problem.message)
        self.assertEqual(problem.mode, "WORLD")


if __name__ == "__main__":
    unittest.main()
