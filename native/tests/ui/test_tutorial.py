"""The tutorial, driven through the real window."""

from __future__ import annotations

import unittest

from support import StudioTest


class TutorialTests(StudioTest):
    def test_every_show_me_points_at_a_control_that_exists(self) -> None:
        """"Show me" flashes the **real control**, found by objectName. A typo
        here is a button that silently does nothing — so check every one against
        the window we actually build."""

        from PySide6.QtWidgets import QWidget

        from nes_studio.core.tutorials import TUTORIALS

        window = self.window()
        # Open every mode so that each one's widgets are constructed.
        for mode in window.modes:
            window.select_mode(mode)

        for tutorial in TUTORIALS:
            for step in tutorial.steps:
                if not step.show_me:
                    continue
                with self.subTest(tutorial=tutorial.id, step=step.title):
                    self.assertIsNotNone(
                        window.findChild(QWidget, step.show_me),
                        f"'Show me' points at {step.show_me!r}, which no widget is named",
                    )

    def test_starting_a_tutorial_opens_its_first_step(self) -> None:
        window = self.window("scratch")
        self.assertTrue(window.tutorial.start("first-game"))

        step = window.tutorial.step
        self.assertIsNotNone(step)
        self.assertEqual(window.tutorial.index, 0)
        self.assertEqual(window.mode, step.mode)

    def test_a_step_advances_when_the_pupil_does_the_thing(self) -> None:
        window = self.window("scratch")
        window.tutorial.start("first-game")
        self.assertEqual(window.tutorial.index, 0)  # "draw a block of ground"

        window.document.set_background_tile_pixel(4, 2, 2, 1)
        window.document_edited()

        self.assertEqual(window.tutorial.index, 1, "the step did not notice the drawing")

    def test_a_finished_starter_does_not_skip_the_steps(self) -> None:
        """The whole point of re-baselining: `basics` already has painted ground,
        and the pupil must still paint some."""

        window = self.window("basics")
        window.tutorial.start("first-game")
        self.assertEqual(window.tutorial.index, 0)

        window.document_edited()  # nothing was done

        self.assertEqual(window.tutorial.index, 0, "a step ticked itself on existing work")

    def test_show_me_finds_the_widget(self) -> None:
        window = self.window("scratch")
        window.tutorial.start("first-game")

        self.assertTrue(window.tutorial.show_me())

    def test_the_panel_tracks_the_step(self) -> None:
        window = self.window("scratch")
        window.tutorial.start("hero")
        panel = window.attention.tutorial

        self.assertTrue(panel.isVisibleTo(window.attention))
        self.assertIn("1/3", panel.title.text())
        self.assertIn("Make a new character", panel.title.text())

        window.document.add_sprite("Hero")
        window.document_edited()

        self.assertIn("2/3", panel.title.text())

    def test_the_tutorial_completes(self) -> None:
        window = self.window("scratch")
        window.tutorial.start("hero")

        window.tutorial.skip()
        window.tutorial.skip()
        window.tutorial.skip()

        self.assertIsNone(window.tutorial.step)
        self.assertIn("done", window.attention.tutorial.title.text())

    def test_ending_a_tutorial_hides_the_panel(self) -> None:
        window = self.window("scratch")
        window.tutorial.start("hero")
        window.tutorial.stop()

        self.assertIsNone(window.tutorial.active)
        self.assertFalse(window.attention.tutorial.isVisibleTo(window.attention))


if __name__ == "__main__":
    unittest.main()
