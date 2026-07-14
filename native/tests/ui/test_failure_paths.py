"""What happens when things go wrong.

Most `QMessageBox` branches were untested. A dialog that never appears, or that
crashes when it does, is invisible to every other test in this suite: the
document is unchanged either way, so a `document.field == X` assertion passes
whether the app warned the pupil or silently did nothing.

Each test here records the dialogs instead of blocking on them, and asserts both
halves: **the pupil was told**, and **the project survived**.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from PySide6.QtWidgets import QMessageBox

from support import StudioTest


class DialogRecorder:
    """Swallow the modal dialogs and remember what they said."""

    def __init__(self, test) -> None:
        self.shown: list[tuple[str, str, str]] = []  # (kind, title, text)
        self._test = test

    def install(self, answer=QMessageBox.StandardButton.Yes) -> None:
        for kind in ("warning", "critical", "information", "question"):
            self._patch(kind, answer)

        # The static helpers are not the only way a dialog appears: a failed build
        # constructs a `QMessageBox` and calls `.exec()` on it, which blocks
        # forever with no one to click it. Patching only the helpers left the
        # suite hanging.
        recorder = self

        def stub_exec(dialog):
            recorder.shown.append(
                ("exec", dialog.windowTitle(), f"{dialog.text()} {dialog.informativeText()}")
            )
            return int(answer)

        original = QMessageBox.exec
        QMessageBox.exec = stub_exec
        self._test.addCleanup(setattr, QMessageBox, "exec", original)

    def _patch(self, kind: str, answer) -> None:
        recorder = self

        def stub(_parent, title, text="", *args, **kwargs):
            recorder.shown.append((kind, str(title), str(text)))
            return answer

        original = getattr(QMessageBox, kind)
        setattr(QMessageBox, kind, staticmethod(stub))
        self._test.addCleanup(setattr, QMessageBox, kind, original)

    @property
    def titles(self) -> list[str]:
        return [title for _kind, title, _text in self.shown]

    def said(self, fragment: str) -> bool:
        return any(
            fragment.lower() in f"{title} {text}".lower() for _kind, title, text in self.shown
        )


class AssetFailureTests(StudioTest):
    def recorder(self):
        recorder = DialogRecorder(self)
        recorder.install()
        return recorder

    def _import(self, window, name: str, data: bytes, method: str, *, bank: str | None = None):
        """Point the file dialog at a file we wrote, and run the import."""

        from PySide6.QtWidgets import QFileDialog, QInputDialog

        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / name
        path.write_bytes(data)

        original_file = QFileDialog.getOpenFileName
        original_item = QInputDialog.getItem
        QFileDialog.getOpenFileName = staticmethod(lambda *a, **k: (str(path), ""))
        QInputDialog.getItem = staticmethod(
            lambda *a, **k: ("Sprite tiles" if bank == "sprite" else "Background tiles", True)
        )
        self.addCleanup(setattr, QFileDialog, "getOpenFileName", original_file)
        self.addCleanup(setattr, QInputDialog, "getItem", original_item)

        getattr(window.assets, method)()

    def test_a_chr_that_is_not_whole_tiles_is_refused(self) -> None:
        window = self.window("basics")
        recorder = self.recorder()
        before = window.document.background_tile_pixels(0)

        self._import(window, "broken.chr", b"\x00" * 17, "import_chr")

        self.assertTrue(recorder.said("could not import tiles"), "the pupil was not told")
        self.assertEqual(
            window.document.background_tile_pixels(0), before, "the bank was damaged anyway"
        )

    def test_a_pal_of_the_wrong_length_is_refused(self) -> None:
        window = self.window("basics")
        recorder = self.recorder()
        before = window.document.background_palette(0)

        self._import(window, "broken.pal", b"\x00" * 20, "import_pal")

        self.assertTrue(recorder.said("could not import palette"))
        self.assertEqual(window.document.background_palette(0), before)

    def test_a_nam_of_the_wrong_length_is_refused(self) -> None:
        window = self.window("basics")
        recorder = self.recorder()
        before = window.document.world_tiles(0, 0)

        self._import(window, "broken.nam", b"\x00" * 100, "import_nam")

        self.assertTrue(recorder.said("could not import nametable"))
        self.assertEqual(window.document.world_tiles(0, 0), before)

    def test_a_good_chr_does_import(self) -> None:
        """The refusals above must not be a blanket 'always refuse'."""

        from nes_studio.core import assets

        window = self.window("scratch")
        self.recorder()
        source = window.document
        source.set_background_tile_pixel(3, 2, 1, 2)
        payload = assets.export_chr(source, "bg")

        blank = self.window("scratch")
        self._import(blank, "good.chr", payload, "import_chr")

        self.assertEqual(blank.document.background_tile_pixels(3)[1][2], 2)


class ProjectFailureTests(StudioTest):
    def test_a_corrupt_project_file_is_refused_and_the_current_one_survives(self) -> None:
        window = self.window("basics")
        recorder = DialogRecorder(self)
        recorder.install()
        original = window.session.project_id
        window.document.state["name"] = "Still mine"
        window.document.dirty = True
        window.session.flush()

        with TemporaryDirectory() as directory:
            path = Path(directory) / "broken.json"
            path.write_text("{ this is not json", encoding="utf-8")

            self.assertFalse(window.open_project_path(str(path)))

        self.assertTrue(recorder.said("could not open project"))
        self.assertEqual(window.session.project_id, original, "we were moved off the project")
        self.assertEqual(window.document.name, "Still mine")

    def test_deleting_the_last_background_is_refused(self) -> None:
        window = self.window("scratch")
        recorder = DialogRecorder(self)
        recorder.install()
        world = window.modes["WORLD"]
        self.assertEqual(len(window.document.background_names()), 1)

        world._delete_background()

        self.assertTrue(recorder.said("at least one background"))
        self.assertEqual(len(window.document.background_names()), 1)

    def test_deleting_a_background_when_there_are_two_works(self) -> None:
        window = self.window("scratch")
        recorder = DialogRecorder(self)
        recorder.install(QMessageBox.StandardButton.Yes)
        window.document.add_background("Level 2")
        window.modes["WORLD"].refresh()

        window.modes["WORLD"]._delete_background()

        self.assertEqual(len(window.document.background_names()), 1)

    def test_adding_an_entity_with_no_character_to_place_says_so(self) -> None:
        window = self.window("scratch")
        recorder = DialogRecorder(self)
        recorder.install()
        world = window.modes["WORLD"]
        world.refresh_entities()

        world._add_entity()

        self.assertTrue(recorder.said("create a non-player character"))
        self.assertEqual(window.document.scene_instances(), [])


class SharedTileGuardFailureTests(StudioTest):
    """The guard's three answers must each do what they say."""

    def _shared(self, window):
        hero = window.document.add_sprite("Hero", role="player")
        villager = window.document.add_sprite("Villager", role="npc")
        window.document.set_sprite_cell(hero, 0, 0, tile=42, palette=0)
        window.document.set_sprite_cell(villager, 0, 0, tile=42, palette=0)
        return hero, villager

    def _guard(self, window, answer: str):
        """A guard that answers its own question, so no dialog is shown.

        The question (`ask`) and the consequences (`check`) are separate for
        exactly this reason: the bugs live in the consequences.
        """

        from nes_studio.ui.widgets.shared_tile_guard import SharedTileGuard

        guard = SharedTileGuard(window, lambda: window.document)
        guard.asked = []

        def ask(tile, users):
            guard.asked.append((tile, [user.name for user in users]))
            return answer

        guard.ask = ask
        return guard

    def test_change_everywhere_edits_the_shared_drawing(self) -> None:
        from nes_studio.ui.widgets.shared_tile_guard import SharedTileGuard

        window = self.window("scratch")
        hero, _villager = self._shared(window)
        guard = self._guard(window, SharedTileGuard.EVERYWHERE)

        decision, tile = guard.check(42, sprite_index=hero)

        self.assertEqual(decision, SharedTileGuard.EVERYWHERE)
        self.assertEqual(guard.asked, [(42, ["Villager"])], "it did not name who else uses it")
        self.assertEqual(tile, 42, "it should still be painting the shared tile")

    def test_duplicate_first_gives_this_character_its_own_copy(self) -> None:
        from nes_studio.ui.widgets.shared_tile_guard import SharedTileGuard

        window = self.window("scratch")
        hero, villager = self._shared(window)
        window.document.set_sprite_tile_pixel(42, 1, 1, 3)
        guard = self._guard(window, SharedTileGuard.DUPLICATED)

        decision, tile = guard.check(42, sprite_index=hero)

        self.assertEqual(decision, SharedTileGuard.DUPLICATED)
        self.assertNotEqual(tile, 42, "it is still pointing at the shared tile")
        # The copy carries the art across...
        self.assertEqual(window.document.sprite_tile_pixels(tile)[1][1], 3)
        # ...and the Villager still has the original.
        self.assertEqual(
            int(window.document.state["sprites"][villager]["cells"][0][0]["tile"]), 42
        )

    def test_cancel_paints_nothing(self) -> None:
        from nes_studio.ui.widgets.shared_tile_guard import SharedTileGuard

        window = self.window("scratch")
        hero, _villager = self._shared(window)
        guard = self._guard(window, SharedTileGuard.CANCELLED)

        decision, _tile = guard.check(42, sprite_index=hero)

        self.assertEqual(decision, SharedTileGuard.CANCELLED)

    def test_the_answer_is_remembered_for_the_rest_of_the_stroke(self) -> None:
        """Dragging a pencil across a shared tile must ask **once**, not once per
        pixel — which would be a dialog per pixel of the drag."""

        from nes_studio.ui.widgets.shared_tile_guard import SharedTileGuard

        window = self.window("scratch")
        hero, _villager = self._shared(window)
        guard = self._guard(window, SharedTileGuard.EVERYWHERE)

        for _ in range(5):
            guard.check(42, sprite_index=hero)

        self.assertEqual(len(guard.asked), 1, "it asked again mid-stroke")

        # A new stroke asks afresh.
        guard.reset()
        guard.check(42, sprite_index=hero)
        self.assertEqual(len(guard.asked), 2)


class BuildFailureTests(StudioTest):
    def test_a_failed_build_tells_the_pupil_and_keeps_the_log(self) -> None:
        window = self.window("basics")
        recorder = DialogRecorder(self)
        recorder.install()

        window.build_play._failed("main.c:12: error: 'foo' undeclared")

        self.assertTrue(recorder.said("could not be built"))
        code = window.modes["CODE"]
        self.assertIn("undeclared", code.build_log.toPlainText())
        self.assertIn("FAILED", code.build_log_title.text())
        self.assertEqual(window.build_play.log, "main.c:12: error: 'foo' undeclared")

    def test_exporting_before_building_says_so_rather_than_writing_nothing(self) -> None:
        window = self.window("basics")
        self.assertIsNone(window.build_play.rom)

        window.build_play.export_rom()

        self.assertIn("Build the ROM first", window.statusBar().currentMessage())


if __name__ == "__main__":
    unittest.main()
