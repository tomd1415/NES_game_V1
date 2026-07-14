"""The tutorial checks: re-baselined, and lenient.

A step says "draw a tile", and it must be satisfied by drawing a tile *since the
step began*. A check that asked "does any drawn tile exist" would tick itself the
moment a pupil opened a starter, teach nothing, and skip the step.
"""

from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from nes_studio.core import tutorials  # noqa: E402
from nes_studio.core.project_document import ProjectDocument  # noqa: E402


class ReBaselineTests(unittest.TestCase):
    def test_a_starter_that_already_has_art_does_not_tick_the_step(self) -> None:
        document = ProjectDocument.preview()
        document.set_background_tile_pixel(3, 1, 1, 2)  # art exists already
        baseline = copy.deepcopy(document.state)

        self.assertFalse(
            tutorials.drew_a_tile(document.state, baseline),
            "the step ticked itself on art the pupil did not draw",
        )

        document.set_background_tile_pixel(4, 2, 2, 1)  # now they draw one
        self.assertTrue(tutorials.drew_a_tile(document.state, baseline))

    def test_painting_is_measured_from_the_baseline(self) -> None:
        document = ProjectDocument.preview()
        document.set_world_tile(1, 1, 5)
        baseline = copy.deepcopy(document.state)

        self.assertFalse(tutorials.painted_the_screen(document.state, baseline))

        document.set_world_tile(2, 2, 5)
        self.assertTrue(tutorials.painted_the_screen(document.state, baseline))

    def test_ground_is_lenient_about_which_solid_you_paint(self) -> None:
        """A pupil who paints a wall instead of a floor has painted a solid, and
        the step should move on. The tutorial is a nudge, not a test."""

        document = ProjectDocument.preview()
        baseline = copy.deepcopy(document.state)

        document.set_world_behaviour(3, 3, 2)  # a wall, not the "solid ground" asked for

        self.assertTrue(tutorials.painted_ground(document.state, baseline))

    def test_making_a_character(self) -> None:
        document = ProjectDocument.preview()
        baseline = copy.deepcopy(document.state)

        self.assertFalse(tutorials.made_a_character(document.state, baseline))
        document.add_sprite("Hero")
        self.assertTrue(tutorials.made_a_character(document.state, baseline))

    def test_tagging_a_player_is_deliberately_not_rebaselined(self) -> None:
        """A game needs exactly one hero. A pupil who already has one has met the
        idea, and making them delete it to re-earn the step would be silly."""

        document = ProjectDocument.preview()
        document.add_sprite("Hero", role="player")
        baseline = copy.deepcopy(document.state)

        self.assertTrue(tutorials.tagged_a_player(document.state, baseline))

    def test_changing_a_colour(self) -> None:
        document = ProjectDocument.preview()
        baseline = copy.deepcopy(document.state)

        self.assertFalse(tutorials.changed_a_colour(document.state, baseline))
        document.set_background_palette_slot(0, 0, 0x16)
        self.assertTrue(tutorials.changed_a_colour(document.state, baseline))

    def test_building_the_game(self) -> None:
        document = ProjectDocument.preview()
        baseline = copy.deepcopy(document.state)

        self.assertFalse(tutorials.built_the_game(document.state, baseline))
        document.mark_built()
        self.assertTrue(tutorials.built_the_game(document.state, baseline))


class CatalogueTests(unittest.TestCase):
    def test_every_tutorial_is_well_formed(self) -> None:
        self.assertGreaterEqual(len(tutorials.TUTORIALS), 6)

        for tutorial in tutorials.TUTORIALS:
            with self.subTest(tutorial=tutorial.id):
                self.assertTrue(tutorial.title)
                self.assertTrue(tutorial.summary)
                self.assertTrue(tutorial.steps)
                for step in tutorial.steps:
                    self.assertTrue(step.title)
                    self.assertTrue(step.body)
                    self.assertIn(
                        step.mode,
                        {"WORLD", "CHARS", "TILES", "PALS", "STYLE", "RULES", "SOUND", "CODE"},
                    )

    def test_lookup_by_id(self) -> None:
        self.assertIsNotNone(tutorials.tutorial("first-game"))
        self.assertIsNone(tutorials.tutorial("nope"))


if __name__ == "__main__":
    unittest.main()
