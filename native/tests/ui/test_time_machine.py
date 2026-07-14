"""The Time Machine.

The store has snapshotted every 30 seconds — and before every build, new project
and restore — since it was written. Nothing has ever been able to *look* at them.
"""

from __future__ import annotations

import unittest

from support import StudioTest


class TimeMachineTests(StudioTest):
    def dialog(self, window):
        from nes_studio.ui.time_machine import TimeMachineDialog

        window.session.flush()
        dialog = TimeMachineDialog(window.storage, window.session, window)
        self.addCleanup(dialog.close)
        return dialog

    def test_it_lists_the_snapshots_that_already_exist(self) -> None:
        window = self.window("scratch")
        window.document.set_world_tile(1, 1, 5)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )

        dialog = self.dialog(window)

        self.assertGreaterEqual(dialog.list.count(), 1)
        self.assertIn("Autosave", dialog.list.item(0).text())

    def test_restoring_puts_the_project_back(self) -> None:
        window = self.window("scratch")
        window.document.set_world_tile(4, 4, 9)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )

        # Wreck it.
        window.document.set_world_tile(4, 4, 0)
        window.document.set_world_tile(5, 5, 99)
        window.session.flush()
        self.assertEqual(window.document.world_tiles(0, 0)[4][4], 0)

        dialog = self.dialog(window)
        self.assertTrue(dialog.restore(0))

        self.assertEqual(window.document.world_tiles(0, 0)[4][4], 9)
        self.assertEqual(window.document.world_tiles(0, 0)[5][5], 0)

    def test_restoring_snapshots_the_present_first(self) -> None:
        """Time-travelling must not be the one thing you cannot come back from."""

        window = self.window("scratch")
        window.document.set_world_tile(2, 2, 3)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )

        # The present has to *differ* from the snapshot, or there is nothing to
        # preserve — the repository dedups snapshots by content hash.
        window.document.set_world_tile(9, 9, 12)
        window.session.flush()

        dialog = self.dialog(window)
        self.assertTrue(dialog.restore(0))

        reasons = {
            entry.reason
            for entry in window.storage.repository.snapshots(window.session.project_id)
        }
        self.assertIn("before_time_machine", reasons)
        self.assertEqual(window.document.world_tiles(0, 0)[9][9], 0, "the restore did not land")

    def test_restoring_is_undoable_which_is_what_the_dialog_promises(self) -> None:
        """The dialog says "Ctrl+Z brings it straight back". It has to be true.

        It was not: `restore()` reloaded the session, which built a *new*
        `ProjectDocument` and rebound the store — clearing the undo stack. A pupil
        who restored the wrong version could not get back, and we had told them
        they could.
        """

        window = self.window("scratch")
        window.document.set_world_tile(4, 4, 9)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )

        # Carry on working — through `document_edited`, as every mode does, so the
        # store records it as a step.
        window.document.set_world_tile(4, 4, 21)
        window.document.set_world_tile(7, 7, 33)
        window.document_edited()
        window.session.flush()

        dialog = self.dialog(window)
        self.assertTrue(dialog.restore(0))
        self.assertEqual(window.document.world_tiles(0, 0)[4][4], 9)

        # ...and change your mind.
        self.assertTrue(window.store.can_undo, "the restore threw the undo history away")
        self.assertTrue(window.store.undo())

        self.assertEqual(window.document.world_tiles(0, 0)[4][4], 21)
        self.assertEqual(window.document.world_tiles(0, 0)[7][7], 33)

    def test_restoring_does_not_strand_the_open_mode(self) -> None:
        """Mutating in place keeps every mode's document reference valid."""

        window = self.window("scratch")
        window.document.set_world_tile(2, 2, 5)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )
        window.document.set_world_tile(2, 2, 6)
        window.document_edited()
        window.session.flush()

        self.dialog(window).restore(0)

        world = window.modes["WORLD"]
        self.assertIs(world.document, window.session.document)
        self.assertEqual(world.canvas.cell_value(2, 2), 5, "the canvas still shows the old state")

    def test_recover_autosave_is_undoable_too(self) -> None:
        window = self.window("scratch")
        window.document.set_world_tile(1, 1, 4)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )
        window.document.set_world_tile(1, 1, 8)
        window.document_edited()
        window.session.flush()

        self.assertTrue(window.recover_autosave())
        self.assertEqual(window.document.world_tiles(0, 0)[1][1], 4)

        self.assertTrue(window.store.undo())
        self.assertEqual(window.document.world_tiles(0, 0)[1][1], 8)

    def test_a_snapshot_says_what_the_game_looked_like(self) -> None:
        from nes_studio.ui.time_machine import _describe

        window = self.window("basics")
        summary = _describe(window.document.to_json())

        self.assertIn("character", summary)
        self.assertIn("background", summary)
        self.assertIn("painted cell", summary)

    def test_the_restore_button_needs_a_selection(self) -> None:
        window = self.window("scratch")
        window.document.set_world_tile(1, 1, 2)
        window.session.flush()
        window.storage.repository.snapshot(
            window.session.project_id, window.document.to_json(), reason="auto_30s"
        )

        dialog = self.dialog(window)
        self.assertFalse(dialog.restore_button.isEnabled(), "nothing is selected yet")

        dialog.list.setCurrentRow(0)
        self.assertTrue(dialog.restore_button.isEnabled())

    def test_restoring_an_index_that_does_not_exist_is_refused(self) -> None:
        window = self.window("scratch")
        dialog = self.dialog(window)
        self.assertFalse(dialog.restore(99))


if __name__ == "__main__":
    unittest.main()
