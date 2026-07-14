"""The Studio shell.

Owns the chrome — app bar, mode rail, stage, dock host, attention panel — and
delegates everything else: the modes to `ui/modes/`, building and playing to
`ui/build_play.py`, the File menu to `ui/project_actions.py`.

It owns **no editor**. It used to own all seven: 3,008 lines, 176 methods, 129
widget attributes, every mode built inline in one 597-line method. A mode now
lives in `ui/modes/<mode>.py` behind the protocol in `ui/modes/base.py`, and this
file does not know what is inside one.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

from PySide6.QtCore import QSettings, QStandardPaths, Qt, QTimer
from PySide6.QtGui import QAction, QCloseEvent, QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSplitter,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from ..core.project_document import ProjectDocument
from ..core.resources import ResourceLocator
from ..emulator.session import EmulatorSession
from ..integrations.fceux import FceuxLauncher
from ..metadata import APP_DISPLAY_NAME, APP_VERSION
from ..persistence.manager import StorageManager
from ..render.screen import NesScreen
from ..state.store import DocumentStore
from .assets import AssetDialogs
from .attention import AttentionPanel
from .build_play import BuildPlayController
from .diagnostics import DiagnosticsDialog
from .modes import MODE_CLASSES, MODE_NAMES, Level, Mode, ModeContext
from .preferences import PreferencesDialog
from .project_actions import ProjectActions
from .theme import Accessibility, apply_theme
from .tutorial import TutorialController, TutorialPickerDialog


class MainWindow(QMainWindow):
    """The Studio's chrome, and nothing else."""

    def __init__(self, resource_locator: ResourceLocator) -> None:
        super().__init__()
        self._resource_locator = resource_locator
        self._diagnostics: DiagnosticsDialog | None = None
        self._mode = "WORLD"
        self._stale_modes: set[str] = set()
        self._mode_buttons: dict[str, QPushButton] = {}
        self._modes: dict[str, Mode] = {}

        self.fceux = FceuxLauncher.discover()
        self.emulator = EmulatorSession(self)

        self._settings = QSettings()
        self._accessibility = Accessibility.load(self._settings)
        self._level = Level.parse(self._settings.value("studio/level", Level.MAKER))

        data_root = os.environ.get("NES_STUDIO_DATA_ROOT") or QStandardPaths.writableLocation(
            QStandardPaths.StandardLocation.AppDataLocation
        )
        self.storage = StorageManager(Path(data_root))
        projects = self.storage.projects()
        if projects:
            self.session = self.storage.open_session(projects[0].project_id)
        else:
            project = self.storage.create_starter("scratch", name="Native Preview")
            self.session = self.storage.open_session(project.project_id)

        self.store = DocumentStore(self.session, self)
        self.store.changed.connect(self._document_restored)
        self.session.saveScheduled.connect(self.mark_unsaved)
        self.session.saved.connect(lambda _revision: self.mark_saved())

        self._snapshot_timer = QTimer(self)
        self._snapshot_timer.setInterval(30_000)
        self._snapshot_timer.timeout.connect(lambda: self.projects.snapshot_if_changed())
        self._snapshot_timer.start()

        self._context = ModeContext(self)
        self.projects = ProjectActions(self)
        self.assets = AssetDialogs(self)
        self.tutorial = TutorialController(self)
        self.build_play = BuildPlayController(self)

        self.setObjectName("mainWindow")
        self.setWindowTitle(APP_DISPLAY_NAME)
        self.resize(1360, 860)
        self.setMinimumSize(960, 640)
        self._create_menus()
        self.setCentralWidget(self._create_workspace())
        self.emulator.frame_ready.connect(self.nes_screen.set_frame)
        self.emulator.failed.connect(self._emulator_failed)
        self._install_shortcuts()
        self.apply_accessibility(self._accessibility)
        self.select_mode("WORLD")
        self._update_responsive_chrome()
        self.update_document_title()
        self.statusBar().showMessage(
            "Native workspace ready"
            if self.fceux is not None
            else "Native workspace ready — FCEUX not found; ROM export remains available"
        )

    # ---- what a mode is allowed to see ------------------------------------

    @property
    def resource_locator(self) -> ResourceLocator:
        return self._resource_locator

    @property
    def modes(self) -> dict[str, Mode]:
        return self._modes

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def level(self) -> Level:
        return self._level

    @property
    def document(self) -> ProjectDocument:
        return self.session.document

    def document_edited(self, message: str = "") -> None:
        """A mode changed the document.

        One place, so no mode has to *remember* to save, retitle and re-check.
        `DocumentStore` hooks the session's `saveScheduled`, so this is also what
        makes the edit undoable.
        """

        self.session.schedule_save()
        self.update_document_title()
        self.attention.refresh()
        self.tutorial.check()
        if message:
            self.statusBar().showMessage(message)

    # ---- layout -----------------------------------------------------------

    def _create_workspace(self) -> QWidget:
        root = QWidget(self)
        root.setObjectName("studioWorkspace")
        outer = QVBoxLayout(root)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        outer.addWidget(self._create_app_bar())

        body = QWidget(root)
        layout = QHBoxLayout(body)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(self._create_mode_rail())

        # Build every mode before the stage: the stage needs their widgets.
        for mode_class in MODE_CLASSES:
            mode = mode_class(self._context)
            self._modes[mode.id] = mode

        splitter = QSplitter(Qt.Orientation.Horizontal, body)
        splitter.setObjectName("workspaceSplitter")
        splitter.setChildrenCollapsible(False)
        splitter.addWidget(self._create_dock_host())
        splitter.addWidget(self._create_stage())
        self.attention = AttentionPanel(self)
        splitter.addWidget(self.attention)
        splitter.setSizes([280, 760, 300])
        splitter.setStretchFactor(1, 1)
        layout.addWidget(splitter, 1)
        outer.addWidget(body, 1)
        return root

    def _create_app_bar(self) -> QWidget:
        """Mirrors the web's top bar (`studio.html:422-457`)."""

        bar = QFrame(self)
        bar.setObjectName("appBar")
        bar.setFixedHeight(56)
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(16, 6, 16, 6)
        layout.setSpacing(8)

        self.project_name = QLineEdit(bar)
        self.project_name.setObjectName("projectName")
        self.project_name.setAccessibleName("Project name")
        self.project_name.setToolTip("Click to rename your game")
        self.project_name.setMaximumWidth(320)
        self.project_name.editingFinished.connect(self._rename_project)
        layout.addWidget(self.project_name)

        self.save_dot = QLabel("●", bar)
        self.save_dot.setObjectName("saveDot")
        layout.addWidget(self.save_dot)
        layout.addStretch(1)

        self.level_select = QComboBox(bar)
        self.level_select.setObjectName("levelSelect")
        self.level_select.setAccessibleName("Expertise level")
        self.level_select.setToolTip(
            "Beginner hides the advanced modes. Nothing is deleted — locked modes "
            "stay on the rail so you can see what is ahead."
        )
        for level in (Level.BEGINNER, Level.MAKER, Level.ADVANCED):
            self.level_select.addItem(level.label, level)
        self.level_select.setCurrentIndex(int(self._level))
        self.level_select.currentIndexChanged.connect(self._level_chosen)
        layout.addWidget(self.level_select)

        for label, name, callback in (
            ("Tutorial", "tutorialButton", self.open_tutorial_picker),
            ("Build", "buildButton", lambda: self.build_play.build()),
            ("▶ Play", "playButton", lambda: self.build_play.toggle_play()),
            ("Help", "helpButton", self._show_about),
        ):
            button = QPushButton(label, bar)
            button.setObjectName(name)
            button.clicked.connect(callback)
            layout.addWidget(button)
            if name == "buildButton":
                self.build_button = button
            elif name == "playButton":
                self.play_button = button
        self.build_button.setAccessibleDescription(
            "Build the current project in a background worker"
        )
        self.play_button.setAccessibleDescription(
            "Build the project and play it here, in the Studio"
        )
        return bar

    def _create_mode_rail(self) -> QWidget:
        rail = QFrame(self)
        rail.setObjectName("modeRail")
        rail.setFixedWidth(108)
        layout = QVBoxLayout(rail)
        layout.setContentsMargins(10, 16, 10, 16)
        layout.setSpacing(6)

        brand = QLabel("NES\nSTUDIO", rail)
        brand.setObjectName("brandLabel")
        brand.setAlignment(Qt.AlignmentFlag.AlignCenter)
        brand.setAccessibleName("NES Studio")
        layout.addWidget(brand)

        for index, mode_class in enumerate(MODE_CLASSES, start=1):
            button = QPushButton(mode_class.id, rail)
            button.setObjectName(f"mode{mode_class.id.title()}Button")
            button.setCheckable(True)
            button.setAutoExclusive(True)
            button.setAccessibleName(f"Open {mode_class.id.title()} mode")
            button.setToolTip(f"{mode_class.help_text}  ({index})")
            button.clicked.connect(
                lambda _checked=False, name=mode_class.id: self.select_mode(name)
            )
            self._mode_buttons[mode_class.id] = button
            layout.addWidget(button)
        layout.addStretch(1)
        return rail

    def _create_dock_host(self) -> QWidget:
        """One inspector per mode.

        The dock used to exist **only in WORLD** — `setVisible(mode == "WORLD")`
        — so in the other six modes the entire left column vanished and the mode
        was a single full-width editor panel.
        """

        host = QScrollArea(self)
        host.setObjectName("contextDock")
        host.setWidgetResizable(True)
        host.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        host.setMinimumWidth(240)

        content = QFrame(host)
        content.setObjectName("contextDockContent")
        layout = QVBoxLayout(content)
        layout.setContentsMargins(18, 20, 18, 20)

        self.mode_title = QLabel(content)
        self.mode_title.setObjectName("modeTitle")
        layout.addWidget(self.mode_title)
        self.mode_help = QLabel(content)
        self.mode_help.setObjectName("modeHelp")
        self.mode_help.setWordWrap(True)
        layout.addWidget(self.mode_help)

        self.locked_notice = QLabel(content)
        self.locked_notice.setObjectName("lockedNotice")
        self.locked_notice.setWordWrap(True)
        self.locked_notice.setVisible(False)
        layout.addWidget(self.locked_notice)

        self.dock_stack = QStackedWidget(content)
        self.dock_stack.setObjectName("dockStack")
        for mode in self._modes.values():
            self.dock_stack.addWidget(mode.dock() or QWidget())
        layout.addWidget(self.dock_stack, 1)

        host.setWidget(content)
        self.context_dock = host
        return host

    def _create_stage(self) -> QWidget:
        stage = QFrame(self)
        stage.setObjectName("stagePanel")
        stage.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        layout = QVBoxLayout(stage)
        layout.setContentsMargins(20, 16, 20, 20)

        toolbar = QHBoxLayout()
        self.live_badge = QLabel("● LIVE", stage)
        self.live_badge.setObjectName("liveBadge")
        toolbar.addWidget(self.live_badge)
        toolbar.addStretch(1)
        layout.addLayout(toolbar)

        self.editor_stack = QStackedWidget(stage)
        self.editor_stack.setObjectName("editorStack")

        # The CRT bezel frames an NES screen — and *only* an NES screen. It used
        # to wrap the whole editor stack, so RULES rendered as forty spin boxes
        # inside a television.
        self.television = QFrame(self.editor_stack)
        self.television.setObjectName("television")
        self.television.setAccessibleName("Live NES game preview")
        tv_layout = QVBoxLayout(self.television)
        tv_layout.setContentsMargins(24, 24, 24, 24)
        screen = QFrame(self.television)
        screen.setObjectName("nesScreen")
        screen_layout = QVBoxLayout(screen)
        screen_layout.setContentsMargins(0, 0, 0, 0)
        self.screen_stack = QStackedWidget(screen)
        self.screen_stack.setObjectName("screenStack")

        # A mode that edits *on the screen* puts its canvas inside the bezel.
        for mode in self._modes.values():
            widget = mode.stage_widget()
            if widget is not None:
                self.screen_stack.addWidget(widget)

        # The running game. Same stage, same bezel.
        self.nes_screen = NesScreen(self.screen_stack)
        self.screen_stack.addWidget(self.nes_screen)
        screen_layout.addWidget(self.screen_stack)
        tv_layout.addWidget(screen)
        self.editor_stack.addWidget(self.television)

        # Everything else is a plain editor panel.
        for mode in self._modes.values():
            if not mode.uses_stage:
                self.editor_stack.addWidget(mode)

        layout.addWidget(self.editor_stack, 1)

        self.controls_hint = QLabel(EmulatorSession.CONTROLS_HINT, stage)
        self.controls_hint.setObjectName("controlsHint")
        self.controls_hint.setWordWrap(True)
        self.controls_hint.setVisible(False)
        layout.addWidget(self.controls_hint)
        return stage

    # ---- modes ------------------------------------------------------------

    def select_mode(self, mode: str) -> None:
        """Show a mode: its page in the stage, its dock in the inspector."""

        if mode not in self._modes:
            raise ValueError(f"Unknown Studio mode: {mode}")
        target = self._modes[mode]
        if target.min_level > self._level:
            self._nudge_locked_mode(target)
            return

        # The running game and the editors share one stage.
        if self.build_play.is_playing:
            self.build_play.stop(restore_mode=False)

        if self._mode in self._modes and self._mode != mode:
            self._modes[self._mode].on_leave()

        self._mode = mode
        self._mode_buttons[mode].setChecked(True)
        self.mode_title.setText(target.title)
        self.mode_help.setText(target.help_text)
        self.locked_notice.setVisible(False)
        self.dock_stack.setCurrentIndex(list(self._modes).index(mode))

        self.editor_stack.setCurrentWidget(self.television if target.uses_stage else target)
        stage_widget = target.stage_widget()
        if stage_widget is not None:
            self.screen_stack.setCurrentWidget(stage_widget)

        self._refresh_mode(mode)
        target.on_enter()
        self.statusBar().showMessage(f"{mode.title()} mode selected")

    def _nudge_locked_mode(self, mode: Mode) -> None:
        """A locked mode stays visible, and says how to unlock it.

        Hiding it would tell a pupil nothing. This tells them the mode exists,
        what it is for, and exactly which switch turns it on.
        """

        self.locked_notice.setText(
            f"{mode.title} is a {mode.min_level.label} mode.\n\n{mode.help_text}\n\n"
            f"Set your level to {mode.min_level.label} in the top bar to open it."
        )
        self.locked_notice.setVisible(True)
        self._mode_buttons[self._mode].setChecked(True)
        self.statusBar().showMessage(
            f"{mode.title} unlocks at {mode.min_level.label} — change your level in the top bar"
        )

    def _refresh_mode(self, mode: str) -> None:
        self._stale_modes.discard(mode)
        try:
            self._modes[mode].refresh()
        except Exception as exc:  # one broken editor must not take the app down
            self.statusBar().showMessage(f"Could not refresh {mode}: {exc}")

    def refresh_all_editors(self) -> None:
        """The document changed underneath every mode — undo, redo, or a switch.

        Refresh only the mode the pupil is looking at; mark the rest stale, to be
        refreshed when they are next opened. Refreshing them all eagerly meant
        every undo re-ran CODE's refresh, which invokes the cc65 codegen — seconds
        of work per keystroke-sized edit, and 178 s for one test file.
        """

        self._stale_modes = set(MODE_NAMES)
        self._refresh_mode(self._mode)
        self.attention.refresh()

    def after_project_replaced(self) -> None:
        """The document was swapped underneath us by a restore."""

        self.store.rebind(self.session)
        self.build_play.forget_rom()
        self.refresh_all_editors()
        self.update_document_title()

    def switch_to_project(self, project_id: str) -> None:
        if self.build_play.is_playing:
            self.build_play.stop()
        self.session.switch(project_id)
        self.after_project_replaced()

    # ---- levels -----------------------------------------------------------

    def set_level(self, level: Level) -> None:
        """Unlock the modes at or below `level`.

        Programmatic on purpose, so callers and tests can drive it without the
        combo box.
        """

        self._level = level
        self._settings.setValue("studio/level", int(level))
        self.level_select.blockSignals(True)
        self.level_select.setCurrentIndex(int(level))
        self.level_select.blockSignals(False)
        self._sync_locked_modes()
        self.attention.refresh()
        if self._modes[self._mode].min_level > level:
            self.select_mode("WORLD")
        self.statusBar().showMessage(f"Level set to {level.label}")

    def _level_chosen(self, _index: int) -> None:
        level = self.level_select.currentData()
        if isinstance(level, Level):
            self.set_level(level)

    def _sync_locked_modes(self) -> None:
        for mode_id, button in self._mode_buttons.items():
            locked = self._modes[mode_id].min_level > self._level
            button.setText(f"🔒 {mode_id}" if locked else mode_id)
            button.setProperty("locked", "true" if locked else "false")
            self.repolish(button)

    # ---- chrome -----------------------------------------------------------

    def resizeEvent(self, event: object) -> None:  # noqa: N802 - Qt API spelling
        super().resizeEvent(event)
        self._update_responsive_chrome()

    def _update_responsive_chrome(self) -> None:
        """Keep the centre editor usable at the documented minimum window size."""

        compact = self.width() < 1160
        if hasattr(self, "attention"):
            self.attention.setVisible(not compact)
        if "TILES" in self._modes:
            self._modes["TILES"].set_compact(compact)

    @staticmethod
    def repolish(widget: QWidget) -> None:
        """Make Qt re-read a widget's style after its objectName or a property
        changed. Without this the stylesheet keeps applying the old rule."""

        widget.style().unpolish(widget)
        widget.style().polish(widget)

    def set_mode_shortcuts_enabled(self, enabled: bool) -> None:
        for shortcut in self._mode_shortcuts:
            shortcut.setEnabled(enabled)

    def update_document_title(self) -> None:
        document = self.document
        marker = " *" if document.dirty else ""
        self.setWindowTitle(f"{document.name}{marker} — {APP_DISPLAY_NAME}")
        if hasattr(self, "project_name") and not self.project_name.hasFocus():
            self.project_name.blockSignals(True)
            self.project_name.setText(document.name)
            self.project_name.blockSignals(False)

    def _rename_project(self) -> None:
        name = self.project_name.text().strip()
        if not name or name == self.document.name:
            return
        self.document.state["name"] = name
        self.document.dirty = True
        self.document_edited(f"Renamed to “{name}”")

    def mark_unsaved(self) -> None:
        if hasattr(self, "save_dot"):
            self.save_dot.setObjectName("saveDotPending")
            self.save_dot.setToolTip("Unsaved changes — saving shortly")
            self.save_dot.setAccessibleName("Unsaved changes")
            self.repolish(self.save_dot)

    def mark_saved(self) -> None:
        if hasattr(self, "save_dot"):
            self.save_dot.setObjectName("saveDotSaved")
            self.save_dot.setToolTip("All changes saved")
            self.save_dot.setAccessibleName("All changes saved")
            self.repolish(self.save_dot)
        self.update_document_title()

    def _document_restored(self) -> None:
        """The document was replaced by an undo or redo — re-read it."""

        self.refresh_all_editors()
        self.update_document_title()

    # ---- accessibility ----------------------------------------------------

    def apply_accessibility(self, preferences: Accessibility) -> None:
        self._accessibility = preferences
        preferences.save(self._settings)
        application = QApplication.instance()
        if application is not None:
            apply_theme(application, preferences)
        self.emulator.set_reduce_flashing(preferences.reduce_flashing)
        self._sync_locked_modes()

    def _open_preferences(self) -> None:
        dialog = PreferencesDialog(self._accessibility, self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            self.apply_accessibility(dialog.preferences())
            self.statusBar().showMessage("Preferences applied")

    # ---- undo -------------------------------------------------------------

    def _undo(self) -> None:
        if self.store.undo():
            self.statusBar().showMessage("Undone")

    def _redo(self) -> None:
        if self.store.redo():
            self.statusBar().showMessage("Redone")

    # ---- playing ----------------------------------------------------------

    def _emulator_failed(self, message: str) -> None:
        self.build_play.stop()
        QMessageBox.critical(self, "The game stopped", message)

    def keyPressEvent(self, event) -> None:  # noqa: N802 - Qt API
        if self.build_play.handle_key(event, True):
            return
        super().keyPressEvent(event)

    def keyReleaseEvent(self, event) -> None:  # noqa: N802 - Qt API
        if self.build_play.handle_key(event, False):
            return
        super().keyReleaseEvent(event)

    def open_tutorial_picker(self) -> None:
        TutorialPickerDialog(self.tutorial, self).exec()

    # ---- menus ------------------------------------------------------------

    def _create_menus(self) -> None:
        file_menu = self.menuBar().addMenu("&File")
        self._action(file_menu, "&New Project", lambda: self.projects.prompt_new(), QKeySequence.StandardKey.New)
        self._action(file_menu, "&My Games…", lambda: self.projects.open_catalog(), "Ctrl+M", "projectCatalogAction")
        self._action(file_menu, "&Open Project File…", lambda: self.projects.open_file(), QKeySequence.StandardKey.Open)
        self._action(file_menu, "&Save", lambda: self.projects.save(), QKeySequence.StandardKey.Save, "saveAction")
        self._action(file_menu, "Save Project &As…", lambda: self.projects.save_as(), QKeySequence.StandardKey.SaveAs)
        file_menu.addSeparator()
        self._action(file_menu, "&Time Machine…", lambda: self.projects.open_time_machine(), "Ctrl+H", "timeMachineAction")
        self._action(file_menu, "&Restore Latest Snapshot", lambda: self.projects.recover_autosave(), None, "recoverAutosaveAction")
        file_menu.addSeparator()

        imports = file_menu.addMenu("&Import")
        self._action(imports, "Tiles (.chr)…", lambda: self.assets.import_chr())
        self._action(imports, "Palette (.pal)…", lambda: self.assets.import_pal())
        self._action(imports, "Nametable (.nam)…", lambda: self.assets.import_nam())
        exports = file_menu.addMenu("&Export")
        self._action(exports, "Tiles (.chr)…", lambda: self.assets.export_chr())
        self._action(exports, "Palette (.pal)…", lambda: self.assets.export_pal())
        self._action(exports, "Nametable (.nam)…", lambda: self.assets.export_nam())
        self.export_rom_action = self._action(
            exports, "Built &ROM…", lambda: self.build_play.export_rom(), None, "exportRomAction"
        )
        self.export_rom_action.setEnabled(False)
        file_menu.addSeparator()
        self._action(file_menu, "E&xit", self.close)

        edit_menu = self.menuBar().addMenu("&Edit")
        self.undo_action = self._action(
            edit_menu, "&Undo", self._undo, QKeySequence.StandardKey.Undo, "undoAction"
        )
        self.undo_action.setEnabled(False)
        self.redo_action = self._action(
            edit_menu, "&Redo", self._redo, QKeySequence.StandardKey.Redo, "redoAction"
        )
        self.redo_action.setEnabled(False)
        # Undo covers every mode, not just WORLD.
        self.store.can_undo_changed.connect(self.undo_action.setEnabled)
        self.store.can_redo_changed.connect(self.redo_action.setEnabled)
        edit_menu.addSeparator()
        self._action(edit_menu, "&Preferences…", self._open_preferences, "Ctrl+,", "preferencesAction")

        view_menu = self.menuBar().addMenu("&View")
        self._action(view_menu, "&Diagnostics…", self._show_diagnostics)

        build_menu = self.menuBar().addMenu("&Build")
        self._action(build_menu, "&Build ROM", lambda: self.build_play.build(), "F5")
        self._action(build_menu, "&Play", lambda: self.build_play.toggle_play(), "F6")
        self.fceux_action = self._action(
            build_menu, "Open in &FCEUX", lambda: self.build_play.launch_fceux()
        )
        self.fceux_action.setEnabled(False)

        help_menu = self.menuBar().addMenu("&Help")
        self._action(help_menu, "&Tutorials…", self.open_tutorial_picker)
        self._action(help_menu, "&About NES Studio", self._show_about)

    def _action(
        self,
        menu,
        text: str,
        callback: Callable[[], object],
        shortcut: object = None,
        name: str = "",
    ) -> QAction:
        action = QAction(text, self)
        if name:
            action.setObjectName(name)
        if shortcut is not None:
            action.setShortcut(
                shortcut
                if isinstance(shortcut, QKeySequence.StandardKey)
                else QKeySequence(shortcut)
            )
        action.triggered.connect(lambda _checked=False: callback())
        menu.addAction(action)
        return action

    def _install_shortcuts(self) -> None:
        """Bind 1..8 to the mode rail, matching the rail's visible order."""

        self._mode_shortcuts: list[QShortcut] = []
        for index, mode in enumerate(MODE_NAMES, start=1):
            shortcut = QShortcut(QKeySequence(str(index)), self)
            shortcut.activated.connect(lambda mode=mode: self.select_mode(mode))
            self._mode_shortcuts.append(shortcut)
        self._sync_locked_modes()

    def _show_diagnostics(self) -> None:
        self._diagnostics = DiagnosticsDialog(self._resource_locator, self)
        self._diagnostics.show()

    def _show_about(self) -> None:
        QMessageBox.about(
            self,
            "About NES Studio",
            f"{APP_DISPLAY_NAME} {APP_VERSION}\n\n"
            "A native Linux sibling of the supported NES Studio web application.\n\n"
            "Keys: 1–8 switch mode · Ctrl+S save · F5 build · F6 play · "
            "Ctrl+Z undo · Ctrl+M my games · Ctrl+H time machine.",
        )

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802 - Qt API
        self.emulator.stop()
        self._snapshot_timer.stop()
        for mode in self._modes.values():
            mode.on_leave()
        self.projects.flush_autosave()
        self.storage.close()
        super().closeEvent(event)

    # ---- compatibility for callers and tests ------------------------------

    def new_project(self, style: str = "scratch", name: str = "Untitled Game") -> None:
        self.projects.new(style, name)

    def open_project_path(self, path: str) -> bool:
        return self.projects.open_path(path)

    def save_project_path(self, path: str) -> bool:
        return self.projects.save_to(path)

    def recover_autosave(self) -> bool:
        return self.projects.recover_autosave()

    def open_project_catalog(self) -> None:
        self.projects.open_catalog()

    def open_time_machine(self) -> None:
        self.projects.open_time_machine()
