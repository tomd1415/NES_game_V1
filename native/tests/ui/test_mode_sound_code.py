"""SOUND and CODE."""

from __future__ import annotations

import unittest

from support import StudioTest


class SoundModeTests(StudioTest):
    def sound(self, window):
        window.select_mode("SOUND")
        return window.modes["SOUND"]

    def test_songs_are_listed_with_their_size(self) -> None:
        window = self.window("basics")
        window.document.add_audio_song("theme.s", ".export _theme\ntheme: .byte 0")
        sound = self.sound(window)
        sound.refresh()

        self.assertIn("theme", sound.song_list.item(0).text())
        self.assertIn("Audio uses", sound.audio_budget.text())

    def test_the_budget_meter_tracks_the_cartridge(self) -> None:
        window = self.window("basics")
        sound = self.sound(window)
        window.document.add_audio_song("big.s", "x" * 8192)
        sound.refresh()

        self.assertGreater(sound.budget_meter.used, 8000)
        self.assertFalse(sound.budget_meter.is_over)
        self.assertRenders(sound.budget_meter, minimum_colours=2)

    def test_previewing_a_song_does_not_change_the_project(self) -> None:
        """Previewing is a *question*, not an edit.

        The first version of this called `set_default_song()` before building, so
        asking "what does track 2 sound like?" permanently changed which song the
        pupil's game starts with.
        """

        window = self.window("basics")
        sound = self.sound(window)
        window.document.add_audio_song("one.s", ".export _a\na: .byte 0")
        window.document.add_audio_song("two.s", ".export _b\nb: .byte 0")
        window.document.set_default_song(0)
        window.session.flush()
        window.store.clear()
        sound.refresh()

        # Capture what gets handed to the builder rather than running cc65.
        handed = []
        window.build_play.preview = handed.append

        sound.song_list.setCurrentRow(1)
        sound._preview()

        audio = window.document.state["audio"]
        self.assertEqual(
            int(audio["defaultSongIdx"]), 0, "previewing overwrote the game's default song"
        )
        self.assertFalse(window.document.dirty, "previewing counted as an edit")
        self.assertFalse(window.store.can_undo, "previewing pushed an undo step")

        # ...and the throwaway copy is the one that starts with the chosen song.
        self.assertEqual(len(handed), 1)
        self.assertIsNot(handed[0], window.document, "it handed over the live project")
        self.assertEqual(int(handed[0].state["audio"]["defaultSongIdx"]), 1)

    def test_a_preview_build_is_not_adopted_as_the_project_s_rom(self) -> None:
        """The preview ROM is a throwaway: it is not the project, so Export and
        the 'has been built' quest must not pick it up."""

        from nes_studio.integrations.direct_build import NativeBuildResult

        window = self.window("basics")
        self.sound(window)
        builds = window.document.build_count

        played = []
        window.build_play.run_rom = played.append

        window.build_play._transient = True
        window.build_play._succeeded(
            NativeBuildResult(rom=b"NES\x1a" + bytes(16), log="ok", request_sha256="x")
        )

        self.assertEqual(len(played), 1, "the preview was built but never played")

        self.assertIsNone(window.build_play.rom, "the throwaway ROM was adopted")
        self.assertEqual(window.document.build_count, builds, "a preview counted as a build")

    def test_the_meter_goes_over(self) -> None:
        window = self.window("basics")
        sound = self.sound(window)
        window.document.add_audio_song("huge.s", "x" * 40000)
        sound.refresh()

        self.assertTrue(sound.budget_meter.is_over)
        self.assertIn("OVER", sound.budget_meter.accessibleDescription().upper())


class CodeModeTests(StudioTest):
    def code(self, window):
        window.select_mode("CODE")
        return window.modes["CODE"]

    def test_viewing_code_does_not_eject_the_project(self) -> None:
        """`customMainC` feeds the build, so writing it changes how the game is
        compiled. Merely *looking* at CODE used to set it to the generated
        source, because the highlighter re-fires textChanged after
        blockSignals() has been lifted."""

        window = self.window("scratch")
        window.session.flush()
        window.document.dirty = False
        self.assertIsNone(window.document.custom_source("c"))

        self.code(window)
        self.application.processEvents()

        self.assertIsNone(
            window.document.custom_source("c"),
            "opening CODE ejected the project into hand-edited source",
        )
        self.assertFalse(window.document.dirty)

    def test_editing_code_does_write_custom_source(self) -> None:
        window = self.window("scratch")
        code = self.code(window)
        code.code_preview.setPlainText("int main(void) { return 0; }")
        self.application.processEvents()

        self.assertEqual(window.document.custom_source("c"), "int main(void) { return 0; }")

    def test_the_generated_source_is_shown(self) -> None:
        window = self.window("basics")
        code = self.code(window)
        self.assertIn("#include", code.code_preview.toPlainText())
        self.assertTrue(code.code_c_button.isChecked())

    def test_assembly_is_a_separate_source(self) -> None:
        window = self.window("basics")
        code = self.code(window)
        code.code_asm_button.click()

        self.assertTrue(code.code_asm_button.isChecked())
        self.assertIn(".include", code.code_preview.toPlainText())

        code.code_preview.setPlainText("; edited assembly\n")
        self.assertEqual(window.document.custom_source("asm"), "; edited assembly\n")

    def test_restore_hands_the_project_back_to_the_generator(self) -> None:
        """Once `customMainC` was set there was no way back — WORLD, CHARS and
        RULES silently stopped reaching the ROM, for good."""

        window = self.window("scratch")
        code = self.code(window)
        code.code_preview.setPlainText("int main(void) { return 0; }")
        self.assertIsNotNone(window.document.custom_source("c"))
        self.assertTrue(code.restore_button.isEnabled())

        window.document.clear_custom_source("c")
        code.refresh()

        self.assertIsNone(window.document.custom_source("c"))
        self.assertIn("#include", code.code_preview.toPlainText())
        self.assertFalse(code.restore_button.isEnabled())

    def test_the_build_log_is_kept(self) -> None:
        """A failed build said 'the ROM could not be built' and discarded the
        compiler's actual words."""

        window = self.window("basics")
        code = self.code(window)
        code.set_build_log("main.c:12: error: 'foo' undeclared", failed=True)

        self.assertIn("undeclared", code.build_log.toPlainText())
        self.assertIn("FAILED", code.build_log_title.text())


if __name__ == "__main__":
    unittest.main()
