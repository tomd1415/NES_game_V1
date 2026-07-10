"""Native NES Studio workspace shell."""

from __future__ import annotations

import os
from pathlib import Path

from PySide6.QtCore import QIODevice, QSaveFile, QStandardPaths, QTimer, Qt
from PySide6.QtGui import QAction, QCloseEvent, QKeySequence
from PySide6.QtWidgets import (
    QButtonGroup,
    QFrame,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPushButton,
    QSizePolicy,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from ..core.resources import ResourceLocator
from ..core.project_document import ProjectDocument, ProjectFormatError
from ..metadata import APP_DISPLAY_NAME, APP_VERSION
from ..persistence.autosave import AutosaveRepository
from .diagnostics import DiagnosticsDialog
from .widgets.world_canvas import WorldCanvas


MODE_NAMES = ("WORLD", "CHARS", "TILES", "PALS", "RULES", "SOUND", "CODE")


class MainWindow(QMainWindow):
    """Real Qt workspace establishing the native Studio information architecture."""

    def __init__(self, resource_locator: ResourceLocator) -> None:
        super().__init__()
        self._resource_locator = resource_locator
        self._diagnostics: DiagnosticsDialog | None = None
        self._mode_buttons: dict[str, QPushButton] = {}
        self._tool_buttons: dict[str, QPushButton] = {}
        self._document = ProjectDocument.preview()
        data_root = os.environ.get("NES_STUDIO_DATA_ROOT") or QStandardPaths.writableLocation(
            QStandardPaths.StandardLocation.AppDataLocation
        )
        self._autosave = AutosaveRepository(Path(data_root) / "autosave")
        self._autosave_timer = QTimer(self)
        self._autosave_timer.setSingleShot(True)
        self._autosave_timer.setInterval(1000)
        self._autosave_timer.timeout.connect(self._flush_autosave)
        self._snapshot_timer = QTimer(self)
        self._snapshot_timer.setInterval(30_000)
        self._snapshot_timer.timeout.connect(self._snapshot_if_changed)
        self._snapshot_timer.start()

        self.setObjectName("mainWindow")
        self.setWindowTitle(APP_DISPLAY_NAME)
        self.resize(1280, 800)
        self.setMinimumSize(960, 640)
        self._create_menus()
        self.setCentralWidget(self._create_workspace())
        self.world_canvas.load_tiles(self._document.world_tiles())
        self._apply_theme()
        self.select_mode("WORLD")
        self._update_document_title()
        self.statusBar().showMessage("Native workspace ready — preview milestone")

    def _create_workspace(self) -> QWidget:
        root = QWidget(self)
        root.setObjectName("studioWorkspace")
        layout = QHBoxLayout(root)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(self._create_mode_rail())
        splitter = QSplitter(Qt.Orientation.Horizontal, root)
        splitter.setObjectName("workspaceSplitter")
        splitter.setChildrenCollapsible(False)
        splitter.addWidget(self._create_context_dock())
        splitter.addWidget(self._create_stage())
        splitter.addWidget(self._create_quest_panel())
        splitter.setSizes([250, 700, 280])
        splitter.setStretchFactor(1, 1)
        layout.addWidget(splitter, 1)
        return root

    def _create_mode_rail(self) -> QWidget:
        rail = QFrame(self)
        rail.setObjectName("modeRail")
        rail.setFixedWidth(108)
        layout = QVBoxLayout(rail)
        layout.setContentsMargins(10, 16, 10, 16)
        layout.setSpacing(8)

        brand = QLabel("NES\nSTUDIO", rail)
        brand.setObjectName("brandLabel")
        brand.setAlignment(Qt.AlignmentFlag.AlignCenter)
        brand.setAccessibleName("NES Studio")
        layout.addWidget(brand)

        group = QButtonGroup(self)
        group.setExclusive(True)
        for mode in MODE_NAMES:
            button = QPushButton(mode, rail)
            button.setObjectName(f"mode{mode.title()}Button")
            button.setCheckable(True)
            button.setAccessibleName(f"Open {mode.title()} mode")
            button.clicked.connect(lambda _checked=False, name=mode: self.select_mode(name))
            group.addButton(button)
            self._mode_buttons[mode] = button
            layout.addWidget(button)
        layout.addStretch(1)
        return rail

    def _create_context_dock(self) -> QWidget:
        dock = QFrame(self)
        dock.setObjectName("contextDock")
        dock.setMinimumWidth(210)
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(18, 20, 18, 20)

        self.mode_title = QLabel(dock)
        self.mode_title.setObjectName("modeTitle")
        layout.addWidget(self.mode_title)
        self.mode_help = QLabel(dock)
        self.mode_help.setObjectName("modeHelp")
        self.mode_help.setWordWrap(True)
        layout.addWidget(self.mode_help)

        section = QLabel("TOOLS", dock)
        section.setObjectName("sectionLabel")
        layout.addWidget(section)
        tool_group = QButtonGroup(self)
        tool_group.setExclusive(True)
        for tool in ("select", "paint", "erase"):
            label = tool.title()
            button = QPushButton(label, dock)
            button.setObjectName(f"world{label}Button")
            button.setCheckable(True)
            button.clicked.connect(lambda _checked=False, name=tool: self._select_world_tool(name))
            tool_group.addButton(button)
            self._tool_buttons[tool] = button
            layout.addWidget(button)
        layout.addStretch(1)
        return dock

    def _create_stage(self) -> QWidget:
        stage = QFrame(self)
        stage.setObjectName("stagePanel")
        stage.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        layout = QVBoxLayout(stage)
        layout.setContentsMargins(24, 20, 24, 24)

        toolbar = QHBoxLayout()
        self.live_badge = QLabel("● LIVE", stage)
        self.live_badge.setObjectName("liveBadge")
        toolbar.addWidget(self.live_badge)
        toolbar.addStretch(1)
        play = QPushButton("▶ PLAY", stage)
        play.setObjectName("playButton")
        play.setEnabled(False)
        play.setAccessibleDescription("ROM build and Play will be enabled after build-core extraction")
        toolbar.addWidget(play)
        layout.addLayout(toolbar)

        television = QFrame(stage)
        television.setObjectName("television")
        television.setAccessibleName("Live NES game preview")
        tv_layout = QVBoxLayout(television)
        tv_layout.setContentsMargins(24, 24, 24, 24)
        screen = QFrame(television)
        screen.setObjectName("nesScreen")
        screen_layout = QVBoxLayout(screen)
        screen_layout.setContentsMargins(0, 0, 0, 0)
        self.world_canvas = WorldCanvas(screen)
        self.world_canvas.cell_changed.connect(self._world_cell_changed)
        self.world_canvas.cursor_changed.connect(self._world_cursor_changed)
        self.world_canvas.history_changed.connect(self._world_history_changed)
        screen_layout.addWidget(self.world_canvas)
        tv_layout.addWidget(screen)
        layout.addWidget(television, 1)
        return stage

    def _create_quest_panel(self) -> QWidget:
        panel = QFrame(self)
        panel.setObjectName("questPanel")
        panel.setMinimumWidth(230)
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(18, 20, 18, 20)

        title = QLabel("QUEST LOG", panel)
        title.setObjectName("modeTitle")
        layout.addWidget(title)
        progress = QLabel("Native Studio foundation", panel)
        progress.setObjectName("questHeading")
        layout.addWidget(progress)
        for text, done in (
            ("Launch a real Qt application", True),
            ("Build the Studio workspace", True),
            ("Open a local project", False),
            ("Paint a WORLD tile", False),
            ("Build and export a ROM", False),
        ):
            item = QLabel(("✓  " if done else "○  ") + text, panel)
            item.setObjectName("questComplete" if done else "questPending")
            item.setWordWrap(True)
            layout.addWidget(item)
        layout.addStretch(1)

        notice = QLabel("Development preview\nNo project files are modified by this shell.", panel)
        notice.setObjectName("previewNotice")
        notice.setWordWrap(True)
        layout.addWidget(notice)
        return panel

    def select_mode(self, mode: str) -> None:
        """Select a workspace mode and update its contextual introduction."""

        if mode not in self._mode_buttons:
            raise ValueError(f"Unknown Studio mode: {mode}")
        self._mode_buttons[mode].setChecked(True)
        self.mode_title.setText(mode)
        self.mode_help.setText(
            {
                "WORLD": "Build screens, paint tile types, and place game objects.",
                "CHARS": "Create characters, roles, frames, and animations.",
                "TILES": "Edit the shared 8×8 graphics used by worlds and characters.",
                "PALS": "Choose authentic NES background and sprite colours.",
                "RULES": "Configure players, enemies, doors, dialogue, and winning.",
                "SOUND": "Import songs and sound effects and watch the ROM budget.",
                "CODE": "Inspect or edit the generated C and 6502 assembly source.",
            }[mode]
        )
        self.statusBar().showMessage(f"{mode.title()} mode selected — editor controls coming next")
        world_enabled = mode == "WORLD"
        for button in self._tool_buttons.values():
            button.setEnabled(world_enabled)
        self.world_canvas.setEnabled(world_enabled)
        if world_enabled:
            self._select_world_tool(self.world_canvas.tool)

    def _select_world_tool(self, tool: str) -> None:
        self.world_canvas.set_tool(tool)
        self._tool_buttons[tool].setChecked(True)
        self.statusBar().showMessage(f"WORLD {tool.title()} tool — click or drag on the NES screen")

    def _world_cell_changed(self, col: int, row: int, value: int) -> None:
        self._document.set_world_tile(col, row, value)
        self._autosave_timer.start()
        self._update_document_title()
        self.statusBar().showMessage(f"WORLD cell ({col}, {row}) changed to tile {value}")

    def _world_cursor_changed(self, col: int, row: int) -> None:
        self.statusBar().showMessage(f"WORLD cell ({col}, {row}) — {self.world_canvas.tool.title()} tool")

    def _world_history_changed(self, can_undo: bool, can_redo: bool) -> None:
        self.undo_action.setEnabled(can_undo)
        self.redo_action.setEnabled(can_redo)

    def _undo_world(self) -> None:
        if self.world_canvas.undo():
            self.statusBar().showMessage("Undid WORLD edit")

    def _redo_world(self) -> None:
        if self.world_canvas.redo():
            self.statusBar().showMessage("Redid WORLD edit")

    def _update_document_title(self) -> None:
        marker = " *" if self._document.dirty else ""
        self.setWindowTitle(f"{self._document.name}{marker} — {APP_DISPLAY_NAME}")

    def open_project_path(self, path: str) -> bool:
        if self._document.dirty:
            self._autosave.snapshot(self._document.to_json(), "before_import")
        try:
            document = ProjectDocument.open(path)
        except (OSError, ProjectFormatError) as exc:
            QMessageBox.critical(self, "Could not open project", str(exc))
            return False
        self._document = document
        self.world_canvas.load_tiles(document.world_tiles())
        self._update_document_title()
        self.statusBar().showMessage(f"Opened {document.path}")
        return True

    def save_project_path(self, path: str) -> bool:
        destination = QSaveFile(path)
        if not destination.open(QIODevice.OpenModeFlag.WriteOnly):
            QMessageBox.critical(self, "Could not save project", destination.errorString())
            return False
        payload = self._document.to_json()
        if destination.write(payload) != len(payload) or not destination.commit():
            QMessageBox.critical(self, "Could not save project", destination.errorString())
            destination.cancelWriting()
            return False
        self._document.path = Path(path)
        self._document.dirty = False
        self._autosave.save_current(payload)
        self._update_document_title()
        self.statusBar().showMessage(f"Saved {path}")
        return True

    def _flush_autosave(self) -> None:
        if self._document.dirty:
            self._autosave.save_current(self._document.to_json())
            self.statusBar().showMessage("Autosaved recovery copy")

    def _snapshot_if_changed(self) -> None:
        if self._document.dirty:
            self._autosave.snapshot(self._document.to_json(), "auto_30s")

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802 - Qt API
        self._autosave_timer.stop()
        self._snapshot_timer.stop()
        self._flush_autosave()
        super().closeEvent(event)

    def _open_project(self) -> None:
        path, _filter = QFileDialog.getOpenFileName(
            self, "Open NES Studio Project", "", "NES Studio projects (*.json);;JSON files (*.json)"
        )
        if path:
            self.open_project_path(path)

    def _save_project_as(self) -> None:
        suggested = str(self._document.path or Path(f"{self._document.name}.json"))
        path, _filter = QFileDialog.getSaveFileName(
            self, "Save NES Studio Project", suggested, "NES Studio projects (*.json)"
        )
        if path:
            if not path.casefold().endswith(".json"):
                path += ".json"
            self.save_project_path(path)

    def _apply_theme(self) -> None:
        self.setStyleSheet(
            """
            QMainWindow, #studioWorkspace { background: #0f0f1b; color: #f8f8f8; }
            QMenuBar, QMenu, QStatusBar { background: #191933; color: #f8f8f8; }
            QMenuBar::item:selected, QMenu::item:selected { background: #4b4b9b; }
            #modeRail { background: #191933; border-right: 2px solid #4b4b9b; }
            #brandLabel { color: #f8d878; font-weight: 900; font-size: 17px; padding-bottom: 12px; }
            #modeRail QPushButton { background: transparent; color: #b8b8d8; border: 1px solid transparent; padding: 10px 3px; font-weight: 700; }
            #modeRail QPushButton:hover { border-color: #7878c8; color: white; }
            #modeRail QPushButton:checked { background: #383878; color: #f8f8f8; border-color: #9898e8; }
            #contextDock, #questPanel { background: #202044; }
            #contextDock { border-right: 1px solid #4b4b7b; }
            #questPanel { border-left: 1px solid #4b4b7b; }
            #modeTitle { color: #f8d878; font-size: 20px; font-weight: 800; }
            #modeHelp { color: #c8c8e8; padding: 6px 0 18px 0; }
            #sectionLabel { color: #78d8d8; font-weight: 800; padding-top: 8px; }
            QPushButton { background: #383878; color: white; border: 1px solid #7878c8; border-radius: 3px; padding: 8px; }
            QPushButton:disabled { background: #292949; color: #787898; border-color: #484868; }
            #stagePanel { background: #101024; }
            #liveBadge { color: #78d878; font-weight: 800; }
            #television { background: #585868; border: 8px solid #303044; border-radius: 18px; }
            #nesScreen { background: #181828; border: 4px solid #080810; }
            #previewMessage { color: #a8e8f8; font-size: 17px; }
            #questHeading { color: white; font-weight: 700; padding: 10px 0; }
            #questComplete { color: #78d878; padding: 5px 0; }
            #questPending { color: #b8b8d8; padding: 5px 0; }
            #previewNotice { background: #30305c; color: #d8d8f8; border: 1px solid #6868a8; padding: 10px; }
            QSplitter::handle { background: #4b4b7b; width: 2px; }
            """
        )

    def _create_menus(self) -> None:
        file_menu = self.menuBar().addMenu("&File")
        self._add_placeholder(file_menu, "&New Project")
        open_action = QAction("&Open Project…", self)
        open_action.setShortcut(QKeySequence.StandardKey.Open)
        open_action.triggered.connect(self._open_project)
        file_menu.addAction(open_action)
        save_action = QAction("Save Project &As…", self)
        save_action.setShortcut(QKeySequence.StandardKey.SaveAs)
        save_action.triggered.connect(self._save_project_as)
        file_menu.addAction(save_action)
        self._add_placeholder(file_menu, "Export &ROM…")
        file_menu.addSeparator()
        exit_action = QAction("E&xit", self)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        edit_menu = self.menuBar().addMenu("&Edit")
        self.undo_action = QAction("&Undo", self)
        self.undo_action.setObjectName("undoAction")
        self.undo_action.setShortcut(QKeySequence.StandardKey.Undo)
        self.undo_action.setEnabled(False)
        self.undo_action.triggered.connect(self._undo_world)
        edit_menu.addAction(self.undo_action)
        self.redo_action = QAction("&Redo", self)
        self.redo_action.setObjectName("redoAction")
        self.redo_action.setShortcut(QKeySequence.StandardKey.Redo)
        self.redo_action.setEnabled(False)
        self.redo_action.triggered.connect(self._redo_world)
        edit_menu.addAction(self.redo_action)

        view_menu = self.menuBar().addMenu("&View")
        diagnostics_action = QAction("&Diagnostics…", self)
        diagnostics_action.triggered.connect(self._show_diagnostics)
        view_menu.addAction(diagnostics_action)

        build_menu = self.menuBar().addMenu("&Build")
        self._add_placeholder(build_menu, "&Build ROM")
        self._add_placeholder(build_menu, "&Play")

        help_menu = self.menuBar().addMenu("&Help")
        about_action = QAction("&About NES Studio", self)
        about_action.triggered.connect(self._show_about)
        help_menu.addAction(about_action)

    def _add_placeholder(self, menu: QMenu, label: str) -> None:
        action = QAction(label, self)
        action.setEnabled(False)
        menu.addAction(action)

    def _show_diagnostics(self) -> None:
        self._diagnostics = DiagnosticsDialog(self._resource_locator, self)
        self._diagnostics.show()

    def _show_about(self) -> None:
        QMessageBox.about(
            self,
            "About NES Studio",
            f"{APP_DISPLAY_NAME} {APP_VERSION}\n\n"
            "A native Linux sibling of the supported NES Studio web application.",
        )
