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


if __name__ == "__main__":
    unittest.main()
