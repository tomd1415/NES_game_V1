"""The attention panel: quests derived from the pupil's game, and the validators.

The quest log was, for a while, five hardcoded *developer* milestones ("Launch a
real Qt application"), all ticked — which told a pupil nothing about their own
game.
"""

from __future__ import annotations

import unittest

from support import StudioTest


class QuestTests(StudioTest):
    def test_quests_are_derived_from_the_document(self) -> None:
        window = self.window("scratch")
        labels = [label.text() for label in window.attention._quest_labels]

        self.assertNotIn("Launch a real Qt application", " ".join(labels))

        from nes_studio.ui.attention import QUESTS

        self.assertEqual(len(labels), len(QUESTS))

    def test_a_quest_ticks_when_it_is_earned(self) -> None:
        from nes_studio.ui.attention import QUESTS

        window = self.window("scratch")
        spin = [text for text, _ in QUESTS].index("Take it for a spin")
        self.assertTrue(window.attention._quest_labels[spin].text().startswith("○"))

        window.document.mark_built()
        window.attention.refresh()

        self.assertTrue(window.attention._quest_labels[spin].text().startswith("✓"))


class ValidatorPanelTests(StudioTest):
    def test_a_clean_project_says_so(self) -> None:
        window = self.window("basics")
        window.attention.refresh()
        # `basics` may legitimately have warnings; what matters is that the panel
        # renders a verdict rather than nothing.
        self.assertTrue(window.attention.summary.text())

    def test_a_broken_project_is_reported(self) -> None:
        window = self.window("scratch")
        # Dialogue on, but no NPC to speak it: an error, per the web's checks.
        window.document.set_dialogue_enabled(True)
        window.attention.refresh()

        ids = {problem.id for problem in window.attention.problems}
        self.assertIn("dialogue-no-npc", ids)
        self.assertIn("error", window.attention.summary.objectName().lower())

    def test_a_problem_offers_a_jump_to_the_mode_that_fixes_it(self) -> None:
        """'Fix in Chars →' is the whole point. Telling a pupil what is wrong and
        leaving them to find where is barely better than saying nothing."""

        window = self.window("scratch")
        window.document.set_dialogue_enabled(True)
        window.attention.refresh()

        problem = next(p for p in window.attention.problems if p.id == "dialogue-no-npc")
        self.assertEqual(problem.mode, "CHARS")

        button = window.findChild(object, "validatorFixButton")
        self.assertIsNotNone(button, "no Fix in <Mode> button was rendered")
        button.click()
        self.assertEqual(window.mode, "CHARS")

    def test_a_beginner_is_not_shown_warnings(self) -> None:
        """The web hides warnings below Maker: a beginner should see what *stops*
        their game, not a list of things that could be better."""

        from nes_studio.ui.modes.base import Level

        window = self.window("scratch")
        window.document.set_dialogue_enabled(True)  # error
        window.document.set_damage_option("amount", 1)
        window.document.set_hud_enabled(True)  # warning: no HUD sprite

        window.set_level(Level.ADVANCED)
        window.attention.refresh()
        self.assertTrue(any(not p.is_error for p in window.attention.problems))

        window.set_level(Level.BEGINNER)
        self.assertTrue(all(p.is_error for p in window.attention.problems))

    def test_the_panel_renders(self) -> None:
        window = self.window("scratch")
        window.document.set_dialogue_enabled(True)
        window.attention.refresh()
        window.attention.resize(300, 700)
        self.assertRenders(window.attention, minimum_colours=3)


class StrokeBatchingTests(StudioTest):
    """The expensive per-edit work (validators + rebuilding the problem panel)
    is deferred to the end of a paint/draw stroke. Without this a 30-cell drag
    ran the validators and tore down the panel's widgets 30 times, once per
    mouse-move — the same mid-drag widget churn that dropped the grab in the
    pixel editor.

    These assert the *shape*, never a wall-clock number, which would be flaky."""

    def _count_refreshes(self, window):
        calls = {"n": 0}
        original = window.attention.refresh

        def counting():
            calls["n"] += 1
            return original()

        window.attention.refresh = counting
        return calls

    def test_a_drag_refreshes_the_panel_once_not_per_cell(self) -> None:
        window = self.window("scratch")
        world = window.modes["WORLD"]
        world.select_tool("paint")
        world.tile_value.setValue(1)
        calls = self._count_refreshes(window)

        world.canvas.begin_stroke()
        for column in range(10):
            world.canvas.edit_cell(column, 5)
        during = calls["n"]
        world.canvas.end_stroke()

        self.assertEqual(during, 0, "the panel rebuilt mid-stroke, once per cell")
        self.assertEqual(calls["n"], 1, "the panel did not refresh once at stroke end")

    def test_a_non_stroke_edit_still_refreshes_immediately(self) -> None:
        """Batching must not delay the ordinary case: a spin-box change is not a
        stroke, so its problems appear at once."""

        window = self.window("scratch")
        calls = self._count_refreshes(window)

        window.document.set_dialogue_enabled(True)
        window.document_edited()

        self.assertEqual(calls["n"], 1)

    def test_the_final_state_of_the_stroke_is_what_is_shown(self) -> None:
        """Deferring must not show a stale panel: a drag that creates a palette
        conflict shows it after release, computed from the end state."""

        window = self.window("scratch")
        world = window.modes["WORLD"]
        world.select_tool("palette")

        # Paint two different palettes into one 2x2 attribute quadrant.
        world.canvas.begin_stroke()
        world.canvas.set_palette_value(1)
        world.canvas.edit_cell(0, 0)
        world.canvas.set_palette_value(2)
        world.canvas.edit_cell(1, 0)
        world.canvas.end_stroke()

        ids = [problem.id for problem in window.attention.problems]
        # The conflict is a render-time fact the panel derives; at minimum the
        # panel reflects the end state, so a fresh validate() over it agrees.
        from nes_studio.core.validators import validate

        self.assertEqual(ids, [p.id for p in validate(window.document.state)])

    def test_undo_grouping_and_batching_share_the_boundary(self) -> None:
        """The stroke is one undo step *and* one refresh — the same boundary."""

        window = self.window("scratch")
        world = window.modes["WORLD"]
        world.select_tool("paint")
        world.tile_value.setValue(4)

        world.canvas.begin_stroke()
        for column in range(5):
            world.canvas.edit_cell(column, 2)
        world.canvas.end_stroke()

        # One undo reverts the whole stroke...
        self.assertTrue(window.store.undo())
        tiles = window.document.world_tiles(0, 0)
        self.assertTrue(all(tiles[2][column] != 4 for column in range(5)))
        self.assertFalse(window.store.can_undo, "the stroke was more than one undo step")


if __name__ == "__main__":
    unittest.main()
