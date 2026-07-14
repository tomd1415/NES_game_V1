"""Build the ROM, then play it in the stage.

The two things that cross every mode, and so belong to neither. Kept off
`MainWindow` because the shell's job is to arrange the furniture, not to run a
compiler and an emulator.

The build runs on a `QThread` against a **detached copy** of the document: cc65
takes seconds, and the pupil must be able to keep editing while it runs without
the build seeing half an edit.
"""

from __future__ import annotations

from PySide6.QtCore import QIODevice, QObject, QSaveFile, QThread, Qt, Signal, Slot
from PySide6.QtWidgets import QFileDialog, QMessageBox

from ..core.project_document import ProjectDocument
from ..emulator.session import EmulatorUnavailable, core_available
from ..integrations.direct_build import DirectBuildController, NativeBuildResult
from ..integrations.fceux import EmulatorLaunchError


class BuildWorker(QObject):
    succeeded = Signal(object)
    failed = Signal(str)
    finished = Signal()

    def __init__(self, controller: DirectBuildController, document: ProjectDocument) -> None:
        super().__init__()
        self.controller = controller
        self.document = document

    @Slot()
    def run(self) -> None:
        try:
            self.succeeded.emit(self.controller.build(self.document))
        except Exception as exc:  # surfaced in the desktop UI, not an event-loop traceback
            self.failed.emit(str(exc))
        finally:
            self.finished.emit()


class BuildPlayController(QObject):
    """Owns the ROM, the build thread, and the running game."""

    def __init__(self, window) -> None:
        super().__init__(window)
        self._window = window
        self._builder = DirectBuildController(window.resource_locator)
        self._thread: QThread | None = None
        self._worker: BuildWorker | None = None
        self._rom: bytes | None = None
        self._log = ""
        self._play_when_built = False
        #: A build the pupil did not ask to keep — a song preview. Its ROM is
        #: played and thrown away: it is not the project's ROM, and caching it
        #: would leave Play running a game that no longer exists.
        self._transient = False

    # ---- state ------------------------------------------------------------

    @property
    def rom(self) -> bytes | None:
        return self._rom

    @property
    def log(self) -> str:
        return self._log

    @property
    def is_playing(self) -> bool:
        return self._window.emulator.is_running()

    def forget_rom(self) -> None:
        """The project changed underneath us — the built ROM is not it any more."""

        self._rom = None
        self._log = ""

    # ---- building ---------------------------------------------------------

    def build(self, document: ProjectDocument | None = None, *, transient: bool = False) -> None:
        """Build the project on a worker thread.

        Always against a **detached copy**: cc65 takes seconds, and the pupil must
        be able to keep editing while it runs without the build seeing half an
        edit. Pass `document` to build something that is *not* the live project —
        a song preview, which must not change what they are working on.
        """

        if self._thread is not None:
            return
        window = self._window
        self._transient = transient
        if document is None:
            window.session.snapshot_before("before_build")
            document = ProjectDocument.from_json(window.document.to_json())

        worker = BuildWorker(self._builder, document)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.succeeded.connect(self._succeeded)
        worker.failed.connect(self._failed)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)
        thread.finished.connect(self._finished)
        self._thread, self._worker = thread, worker

        window.build_button.setEnabled(False)
        window.statusBar().showMessage("Building ROM in a background worker…")
        thread.start()

    def _succeeded(self, result: NativeBuildResult) -> None:
        window = self._window
        if self._transient:
            # A preview. Play it, but do not adopt it: the project did not change,
            # so its ROM, its build log and its "has been built" state must not
            # either.
            self._transient = False
            self.run_rom(result.rom)
            return
        self._rom = result.rom
        self._log = result.log
        window.export_rom_action.setEnabled(True)
        window.fceux_action.setEnabled(window.fceux is not None)
        window.document.mark_built()
        window.session.schedule_save()
        window.modes["CODE"].set_build_log(result.log)
        window.attention.refresh()
        window.tutorial.check()
        window.statusBar().showMessage(
            f"Built ROM ({len(result.rom):,} bytes) — ready to export"
        )
        if self._play_when_built:
            self._play_when_built = False
            self.run_rom(result.rom)

    def _failed(self, message: str) -> None:
        window = self._window
        self._play_when_built = False
        self._transient = False
        self._log = message
        window.modes["CODE"].set_build_log(message, failed=True)
        window.statusBar().showMessage(f"ROM build failed: {message}")

        # A transient status line is not enough for a compile error the pupil has
        # to act on. The full log is now in CODE, and stays there.
        dialog = QMessageBox(window)
        dialog.setIcon(QMessageBox.Icon.Critical)
        dialog.setWindowTitle("ROM build failed")
        dialog.setText("The ROM could not be built.")
        dialog.setInformativeText("The compiler's output is in CODE, under the source.")
        dialog.setDetailedText(message)
        dialog.exec()

    def _finished(self) -> None:
        self._thread = None
        self._worker = None
        self._window.build_button.setEnabled(True)

    def export_rom(self) -> None:
        window = self._window
        if self._rom is None:
            window.statusBar().showMessage("Build the ROM first (F5)")
            return
        path, _filter = QFileDialog.getSaveFileName(
            window, "Export NES ROM", "game.nes", "NES ROM (*.nes)"
        )
        if not path:
            return
        if not path.casefold().endswith(".nes"):
            path += ".nes"
        target = QSaveFile(path)
        if not target.open(QIODevice.OpenModeFlag.WriteOnly):
            QMessageBox.critical(window, "Could not export ROM", target.errorString())
            return
        if target.write(self._rom) != len(self._rom) or not target.commit():
            target.cancelWriting()
            QMessageBox.critical(window, "Could not export ROM", target.errorString())
            return
        window.statusBar().showMessage(f"Exported ROM to {path}")

    def launch_fceux(self) -> None:
        window = self._window
        if self._rom is None or window.fceux is None:
            window.statusBar().showMessage(
                "FCEUX is not installed — export the ROM and open it manually"
            )
            return
        try:
            target = window.fceux.launch(
                self._rom, window.storage.data_root / "roms" / "latest.nes"
            )
        except EmulatorLaunchError as exc:
            QMessageBox.critical(window, "Could not launch FCEUX", str(exc))
            return
        window.statusBar().showMessage(f"Launched FCEUX with {target}")

    # ---- playing ----------------------------------------------------------

    def preview(self, document: ProjectDocument) -> None:
        """Build and play a document that is not the project, and keep neither."""

        self.build(document, transient=True)

    def toggle_play(self) -> None:
        if self.is_playing:
            self.stop()
        else:
            self.start()

    def start(self) -> None:
        window = self._window
        if not core_available():
            QMessageBox.warning(
                window,
                "Cannot play here",
                "The embedded NES core is not installed. Build and export the ROM,"
                " or install the nes_core wheel.",
            )
            return
        if self._rom is None:
            self._play_when_built = True
            self.build()
            return
        self.run_rom(self._rom)

    def run_rom(self, rom: bytes) -> None:
        window = self._window
        try:
            window.emulator.start(rom)
        except (EmulatorUnavailable, RuntimeError) as exc:
            QMessageBox.critical(window, "Could not start the game", str(exc))
            return
        window.editor_stack.setCurrentWidget(window.television)
        window.screen_stack.setCurrentWidget(window.nes_screen)
        window.nes_screen.setFocus()
        window.play_button.setText("■ Stop")
        window.play_button.setObjectName("stopButton")
        window.repolish(window.play_button)
        window.live_badge.setText("● PLAYING")
        window.controls_hint.setVisible(True)
        # Player 2's Start/Select are 1 and 2, which would otherwise switch mode.
        window.set_mode_shortcuts_enabled(False)
        window.statusBar().showMessage("Playing — press Escape to stop")

    def stop(self, *, restore_mode: bool = True) -> None:
        window = self._window
        window.emulator.stop()
        window.play_button.setText("▶ Play")
        window.play_button.setObjectName("playButton")
        window.repolish(window.play_button)
        window.live_badge.setText("● LIVE")
        window.controls_hint.setVisible(False)
        window.set_mode_shortcuts_enabled(True)
        if restore_mode:
            window.select_mode(window.mode)
        window.statusBar().showMessage("Stopped")

    def handle_key(self, event, pressed: bool) -> bool:
        """Route a key to the running game. True when the game consumed it."""

        window = self._window
        if not self.is_playing:
            return False
        if pressed and event.key() == Qt.Key.Key_Escape:
            self.stop()
            return True
        if event.isAutoRepeat():
            return False
        return window.emulator.handle_key(event.key(), pressed)
