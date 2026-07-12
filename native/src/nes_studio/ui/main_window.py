"""Native NES Studio workspace shell."""

from __future__ import annotations

import os
from pathlib import Path

from PySide6.QtCore import QIODevice, QObject, QSaveFile, QStandardPaths, QThread, QTimer, Qt, Signal, Slot
from PySide6.QtGui import QAction, QCloseEvent, QKeySequence
from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QFrame,
    QFileDialog,
    QHBoxLayout,
    QGridLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QMainWindow,
    QMenu,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QSizePolicy,
    QSpinBox,
    QSplitter,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from ..core.resources import ResourceLocator
from ..codegen.differential import CodegenDifferential
from ..core.project_document import ProjectDocument, ProjectFormatError
from ..metadata import APP_DISPLAY_NAME, APP_VERSION
from ..persistence.manager import StorageManager
from ..persistence.portability import AtomicExportError, export_project, import_project
from ..persistence.session import ProjectSession
from ..integrations.direct_build import DirectBuildController, NativeBuildResult
from ..integrations.fceux import EmulatorLaunchError, FceuxLauncher
from .diagnostics import DiagnosticsDialog
from .widgets.world_canvas import WorldCanvas


MODE_NAMES = ("WORLD", "CHARS", "TILES", "PALS", "RULES", "SOUND", "CODE")


class _BuildWorker(QObject):
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


class MainWindow(QMainWindow):
    """Real Qt workspace establishing the native Studio information architecture."""

    def __init__(self, resource_locator: ResourceLocator) -> None:
        super().__init__()
        self._resource_locator = resource_locator
        self._diagnostics: DiagnosticsDialog | None = None
        self._mode_buttons: dict[str, QPushButton] = {}
        self._tool_buttons: dict[str, QPushButton] = {}
        self._build_controller = DirectBuildController(resource_locator)
        self._fceux = FceuxLauncher.discover()
        self._build_thread: QThread | None = None
        self._build_worker: _BuildWorker | None = None
        self._last_rom: bytes | None = None
        data_root = os.environ.get("NES_STUDIO_DATA_ROOT") or QStandardPaths.writableLocation(
            QStandardPaths.StandardLocation.AppDataLocation
        )
        self._storage = StorageManager(Path(data_root))
        projects = self._storage.projects()
        if projects:
            self._session = self._storage.open_session(projects[0].project_id)
        else:
            project = self._storage.create_starter("scratch", name="Native Preview")
            self._session = self._storage.open_session(project.project_id)
        self._document = self._session.document
        self._world_screen_x = 0
        self._world_screen_y = 0
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
        self._load_document_world()
        self._apply_theme()
        self.select_mode("WORLD")
        self._update_document_title()
        self.statusBar().showMessage(
            "Native workspace ready"
            if self._fceux is not None
            else "Native workspace ready — FCEUX not found; ROM export remains available"
        )

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

        background_label = QLabel("BACKGROUND", dock)
        background_label.setObjectName("sectionLabel")
        layout.addWidget(background_label)
        self.background_selector = QComboBox(dock)
        self.background_selector.setObjectName("worldBackgroundSelector")
        self.background_selector.setAccessibleName("WORLD background")
        self.background_selector.currentIndexChanged.connect(self._select_background)
        layout.addWidget(self.background_selector)
        background_actions = QHBoxLayout()
        for label, callback in (
            ("New", self._new_background),
            ("Duplicate", self._duplicate_background),
            ("Rename", self._rename_background),
            ("Delete", self._delete_background),
        ):
            button = QPushButton(label, dock)
            button.setObjectName(f"worldBackground{label}Button")
            button.setAccessibleName(f"{label} WORLD background")
            button.clicked.connect(callback)
            background_actions.addWidget(button)
        layout.addLayout(background_actions)
        layout_label = QLabel("SCREEN LAYOUT", dock)
        layout_label.setObjectName("sectionLabel")
        layout.addWidget(layout_label)
        self.world_layout = QComboBox(dock)
        self.world_layout.setObjectName("worldLayoutSelector")
        self.world_layout.setAccessibleName("WORLD screen layout")
        self.world_layout.addItem("1 × 1", (1, 1))
        self.world_layout.addItem("2 × 1", (2, 1))
        self.world_layout.addItem("1 × 2", (1, 2))
        self.world_layout.addItem("2 × 2", (2, 2))
        self.world_layout.currentIndexChanged.connect(self._set_world_layout)
        layout.addWidget(self.world_layout)
        viewport_label = QLabel("EDIT SCREEN", dock)
        viewport_label.setObjectName("sectionLabel")
        layout.addWidget(viewport_label)
        viewport = QHBoxLayout()
        self.world_screen_x = QSpinBox(dock)
        self.world_screen_x.setObjectName("worldScreenX")
        self.world_screen_x.setPrefix("X ")
        self.world_screen_x.setAccessibleName("WORLD screen horizontal position")
        self.world_screen_x.valueChanged.connect(self._select_world_screen)
        viewport.addWidget(self.world_screen_x)
        self.world_screen_y = QSpinBox(dock)
        self.world_screen_y.setObjectName("worldScreenY")
        self.world_screen_y.setPrefix("Y ")
        self.world_screen_y.setAccessibleName("WORLD screen vertical position")
        self.world_screen_y.valueChanged.connect(self._select_world_screen)
        viewport.addWidget(self.world_screen_y)
        layout.addLayout(viewport)
        clipboard_actions = QHBoxLayout()
        copy_button = QPushButton("Copy", dock)
        copy_button.setObjectName("worldCopyButton")
        copy_button.setAccessibleName("Copy selected WORLD region")
        copy_button.clicked.connect(self._copy_world_region)
        clipboard_actions.addWidget(copy_button)
        paste_button = QPushButton("Paste", dock)
        paste_button.setObjectName("worldPasteButton")
        paste_button.setAccessibleName("Paste WORLD region at selected cell")
        paste_button.clicked.connect(self._paste_world_region)
        clipboard_actions.addWidget(paste_button)
        layout.addLayout(clipboard_actions)
        self.grid_toggle = QCheckBox("Fine grid (G)", dock)
        self.grid_toggle.setObjectName("worldGridToggle")
        self.grid_toggle.toggled.connect(self._set_world_grid_options)
        layout.addWidget(self.grid_toggle)
        self.attribute_toggle = QCheckBox("2 × 2 attribute guides", dock)
        self.attribute_toggle.setObjectName("worldAttributeGuidesToggle")
        self.attribute_toggle.toggled.connect(self._set_world_grid_options)
        layout.addWidget(self.attribute_toggle)
        backdrop_label = QLabel("UNIVERSAL BACKDROP", dock)
        backdrop_label.setObjectName("sectionLabel")
        layout.addWidget(backdrop_label)
        self.universal_background = QSpinBox(dock)
        self.universal_background.setObjectName("universalBackgroundValue")
        self.universal_background.setRange(0, 0x3F)
        self.universal_background.setDisplayIntegerBase(16)
        self.universal_background.setPrefix("0x")
        self.universal_background.setAccessibleName("Universal NES background colour")
        self.universal_background.valueChanged.connect(self._set_universal_background)
        layout.addWidget(self.universal_background)

        section = QLabel("TOOLS", dock)
        section.setObjectName("sectionLabel")
        layout.addWidget(section)
        tool_group = QButtonGroup(self)
        tool_group.setExclusive(True)
        for tool in ("select", "paint", "erase", "fill", "palette", "behaviour"):
            label = tool.title()
            button = QPushButton(label, dock)
            button.setObjectName(f"world{label}Button")
            button.setCheckable(True)
            button.clicked.connect(lambda _checked=False, name=tool: self._select_world_tool(name))
            tool_group.addButton(button)
            self._tool_buttons[tool] = button
            layout.addWidget(button)

        tile_label = QLabel("TILE (0–255)", dock)
        tile_label.setObjectName("sectionLabel")
        layout.addWidget(tile_label)
        self.tile_value = QSpinBox(dock)
        self.tile_value.setObjectName("worldTileValue")
        self.tile_value.setRange(0, 255)
        self.tile_value.setValue(1)
        self.tile_value.setAccessibleName("WORLD tile value")
        self.tile_value.valueChanged.connect(
            lambda value: self.world_canvas.set_paint_value(value)
        )
        layout.addWidget(self.tile_value)

        palette_label = QLabel("PALETTE (0–3)", dock)
        palette_label.setObjectName("sectionLabel")
        layout.addWidget(palette_label)
        self.palette_value = QSpinBox(dock)
        self.palette_value.setObjectName("worldPaletteValue")
        self.palette_value.setRange(0, 3)
        self.palette_value.setValue(1)
        self.palette_value.setAccessibleName("WORLD palette value")
        self.palette_value.valueChanged.connect(
            lambda value: self.world_canvas.set_palette_value(value)
        )
        layout.addWidget(self.palette_value)

        behaviour_label = QLabel("BEHAVIOUR (0–255)", dock)
        behaviour_label.setObjectName("sectionLabel")
        layout.addWidget(behaviour_label)
        self.behaviour_value = QSpinBox(dock)
        self.behaviour_value.setObjectName("worldBehaviourValue")
        self.behaviour_value.setRange(0, 255)
        self.behaviour_value.setValue(1)
        self.behaviour_value.setAccessibleName("WORLD behaviour value")
        self.behaviour_value.valueChanged.connect(
            lambda value: self.world_canvas.set_behaviour_value(value)
        )
        layout.addWidget(self.behaviour_value)
        entities_label = QLabel("ENTITIES", dock)
        entities_label.setObjectName("sectionLabel")
        layout.addWidget(entities_label)
        self.scene_sprite = QComboBox(dock)
        self.scene_sprite.setObjectName("sceneSpriteSelector")
        layout.addWidget(self.scene_sprite)
        self.scene_list = QListWidget(dock)
        self.scene_list.setObjectName("sceneInstanceList")
        self.scene_list.currentRowChanged.connect(self._select_scene_instance)
        layout.addWidget(self.scene_list)
        scene_actions = QHBoxLayout()
        add_scene = QPushButton("Add entity", dock)
        add_scene.setObjectName("addSceneInstanceButton")
        add_scene.clicked.connect(self._add_scene_instance)
        scene_actions.addWidget(add_scene)
        remove_scene = QPushButton("Remove", dock)
        remove_scene.setObjectName("removeSceneInstanceButton")
        remove_scene.clicked.connect(self._remove_scene_instance)
        scene_actions.addWidget(remove_scene)
        layout.addLayout(scene_actions)
        self.scene_x, self.scene_y = QSpinBox(dock), QSpinBox(dock)
        for control, maximum, prefix in ((self.scene_x, 504, "X "), (self.scene_y, 464, "Y ")):
            control.setRange(0, maximum)
            control.setPrefix(prefix)
            control.valueChanged.connect(self._update_scene_instance)
            layout.addWidget(control)
        self.scene_ai = QComboBox(dock)
        self.scene_ai.setObjectName("sceneAiSelector")
        self.scene_ai.addItems(["static", "walker", "chaser", "goomba", "koopa", "item", "flyer", "patrol"])
        self.scene_ai.currentTextChanged.connect(lambda _value: self._update_scene_instance())
        layout.addWidget(self.scene_ai)
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
        self.play_button = QPushButton("▶ BUILD ROM", stage)
        self.play_button.setObjectName("playButton")
        self.play_button.setAccessibleDescription("Build the current project in a background worker")
        self.play_button.clicked.connect(self._build_rom)
        toolbar.addWidget(self.play_button)
        self.launch_button = QPushButton("▶ PLAY", stage)
        self.launch_button.setObjectName("launchButton")
        self.launch_button.setAccessibleDescription("Launch the latest built ROM in FCEUX")
        self.launch_button.setEnabled(False)
        self.launch_button.clicked.connect(self._launch_last_rom)
        toolbar.addWidget(self.launch_button)
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
        self.editor_stack = QStackedWidget(screen)
        self.editor_stack.setObjectName("editorStack")
        self.world_canvas = WorldCanvas(self.editor_stack)
        self.world_canvas.cell_changed.connect(self._world_cell_changed)
        self.world_canvas.palette_changed.connect(self._world_palette_changed)
        self.world_canvas.behaviour_changed.connect(self._world_behaviour_changed)
        self.world_canvas.cursor_changed.connect(self._world_cursor_changed)
        self.world_canvas.history_changed.connect(self._world_history_changed)
        self.world_canvas.grid_options_changed.connect(self._world_grid_shortcut_changed)
        self.editor_stack.addWidget(self.world_canvas)
        self.code_preview = QPlainTextEdit(self.editor_stack)
        self.code_preview.setObjectName("codePreview")
        self.code_preview.setReadOnly(True)
        self.code_preview.setAccessibleName("Generated C source preview")
        self.code_preview.setPlainText("Select CODE to generate a preview.")
        self.editor_stack.addWidget(self.code_preview)
        self.palette_editor = QFrame(self.editor_stack)
        self.palette_editor.setObjectName("paletteEditor")
        palette_layout = QGridLayout(self.palette_editor)
        palette_layout.addWidget(QLabel("BACKGROUND PALETTES — slot 0 uses the universal backdrop", self.palette_editor), 0, 0, 1, 4)
        self._background_palette_controls: list[QSpinBox] = []
        for palette in range(4):
            palette_layout.addWidget(QLabel(f"BG{palette}", self.palette_editor), palette + 1, 0)
            for slot in range(3):
                control = QSpinBox(self.palette_editor)
                control.setRange(0, 0x3F)
                control.setDisplayIntegerBase(16)
                control.setPrefix("0x")
                control.setObjectName(f"backgroundPalette{palette}Slot{slot + 1}")
                control.setAccessibleName(f"Background palette {palette} colour slot {slot + 1}")
                control.valueChanged.connect(
                    lambda value, palette=palette, slot=slot: self._set_background_palette_slot(palette, slot, value)
                )
                self._background_palette_controls.append(control)
                palette_layout.addWidget(control, palette + 1, slot + 1)
        palette_layout.addWidget(QLabel("SPRITE PALETTES — slot 0 is transparent", self.palette_editor), 6, 0, 1, 4)
        self._sprite_palette_controls: list[QSpinBox] = []
        for palette in range(4):
            palette_layout.addWidget(QLabel(f"SP{palette}", self.palette_editor), palette + 7, 0)
            for slot in range(3):
                control = QSpinBox(self.palette_editor)
                control.setRange(0, 0x3F)
                control.setDisplayIntegerBase(16)
                control.setPrefix("0x")
                control.setObjectName(f"spritePalette{palette}Slot{slot + 1}")
                control.setAccessibleName(f"Sprite palette {palette} colour slot {slot + 1}")
                control.valueChanged.connect(
                    lambda value, palette=palette, slot=slot: self._set_sprite_palette_slot(palette, slot, value)
                )
                self._sprite_palette_controls.append(control)
                palette_layout.addWidget(control, palette + 7, slot + 1)
        self.editor_stack.addWidget(self.palette_editor)
        self.tile_editor = QFrame(self.editor_stack)
        self.tile_editor.setObjectName("tileEditor")
        tile_layout = QVBoxLayout(self.tile_editor)
        selector_row = QHBoxLayout()
        self.tile_bank = QComboBox(self.tile_editor)
        self.tile_bank.setObjectName("tileBankSelector")
        self.tile_bank.addItem("Background", "bg")
        self.tile_bank.addItem("Sprite", "sprite")
        self.tile_bank.currentIndexChanged.connect(self._refresh_tile_editor)
        selector_row.addWidget(self.tile_bank)
        self.tile_selector = QSpinBox(self.tile_editor)
        self.tile_selector.setObjectName("backgroundTileSelector")
        self.tile_selector.setRange(0, 255)
        self.tile_selector.setDisplayIntegerBase(16)
        self.tile_selector.setPrefix("0x")
        self.tile_selector.setAccessibleName("Background tile index")
        self.tile_selector.valueChanged.connect(self._refresh_tile_editor)
        selector_row.addWidget(self.tile_selector)
        tile_layout.addLayout(selector_row)
        tile_operations = QHBoxLayout()
        for label, operation in (("Clear", "clear"), ("Flip H", "flip_h"), ("Flip V", "flip_v"), ("Rotate", "rotate")):
            button = QPushButton(label, self.tile_editor)
            button.setObjectName(f"tile{operation.title().replace('_', '')}Button")
            button.clicked.connect(lambda _checked=False, operation=operation: self._transform_tile(operation))
            tile_operations.addWidget(button)
        duplicate_button = QPushButton("Duplicate", self.tile_editor)
        duplicate_button.setObjectName("duplicateTileButton")
        duplicate_button.clicked.connect(self._duplicate_tile)
        tile_operations.addWidget(duplicate_button)
        tile_layout.addLayout(tile_operations)
        self.tile_default_behaviour = QSpinBox(self.tile_editor)
        self.tile_default_behaviour.setObjectName("tileDefaultBehaviour")
        self.tile_default_behaviour.setRange(0, 255)
        self.tile_default_behaviour.setPrefix("Default behaviour: ")
        self.tile_default_behaviour.valueChanged.connect(self._set_tile_default_behaviour)
        tile_layout.addWidget(self.tile_default_behaviour)
        tile_grid = QGridLayout()
        tile_grid.setSpacing(1)
        self._tile_pixel_buttons: list[QPushButton] = []
        for row in range(8):
            for column in range(8):
                button = QPushButton(self.tile_editor)
                button.setFixedSize(32, 32)
                button.setObjectName(f"backgroundTilePixel{column}_{row}")
                button.setAccessibleName(f"Background tile pixel {column}, {row}")
                button.clicked.connect(lambda _checked=False, column=column, row=row: self._cycle_tile_pixel(column, row))
                self._tile_pixel_buttons.append(button)
                tile_grid.addWidget(button, row, column)
        tile_layout.addLayout(tile_grid)
        self.editor_stack.addWidget(self.tile_editor)
        self.chars_editor = QFrame(self.editor_stack)
        self.chars_editor.setObjectName("charsEditor")
        chars_layout = QVBoxLayout(self.chars_editor)
        chars_layout.addWidget(QLabel("SPRITES", self.chars_editor))
        self.sprite_list = QListWidget(self.chars_editor)
        self.sprite_list.setObjectName("spriteList")
        self.sprite_list.currentRowChanged.connect(self._select_sprite)
        chars_layout.addWidget(self.sprite_list)
        sprite_actions = QHBoxLayout()
        for label, callback in (("New", self._new_sprite), ("Duplicate", self._duplicate_sprite), ("Rename", self._rename_sprite), ("Delete", self._delete_sprite)):
            button = QPushButton(label, self.chars_editor)
            button.clicked.connect(callback)
            sprite_actions.addWidget(button)
        chars_layout.addLayout(sprite_actions)
        self.sprite_role = QComboBox(self.chars_editor)
        self.sprite_role.addItems(["player", "npc", "enemy", "item", "tool", "powerup", "pickup", "projectile", "decoration", "hud", "other"])
        self.sprite_role.currentTextChanged.connect(self._set_sprite_role)
        chars_layout.addWidget(self.sprite_role)
        self.sprite_flying = QCheckBox("Flying (ignore gravity)", self.chars_editor)
        self.sprite_flying.toggled.connect(self._set_sprite_flying)
        chars_layout.addWidget(self.sprite_flying)
        dimensions = QHBoxLayout()
        self.sprite_width = QSpinBox(self.chars_editor)
        self.sprite_width.setRange(1, 8)
        self.sprite_width.setPrefix("W ")
        self.sprite_width.valueChanged.connect(self._resize_sprite)
        dimensions.addWidget(self.sprite_width)
        self.sprite_height = QSpinBox(self.chars_editor)
        self.sprite_height.setRange(1, 8)
        self.sprite_height.setPrefix("H ")
        self.sprite_height.valueChanged.connect(self._resize_sprite)
        dimensions.addWidget(self.sprite_height)
        chars_layout.addLayout(dimensions)
        cell_controls = QHBoxLayout()
        self.sprite_cell_x, self.sprite_cell_y = QSpinBox(self.chars_editor), QSpinBox(self.chars_editor)
        self.sprite_cell_tile, self.sprite_cell_palette = QSpinBox(self.chars_editor), QSpinBox(self.chars_editor)
        for control, maximum, prefix in ((self.sprite_cell_x, 7, "X "), (self.sprite_cell_y, 7, "Y "), (self.sprite_cell_tile, 255, "Tile "), (self.sprite_cell_palette, 3, "Pal ")):
            control.setRange(0, maximum); control.setPrefix(prefix); cell_controls.addWidget(control)
        self.sprite_cell_x.valueChanged.connect(self._refresh_sprite_cell)
        self.sprite_cell_y.valueChanged.connect(self._refresh_sprite_cell)
        self.sprite_cell_tile.valueChanged.connect(self._set_sprite_cell)
        self.sprite_cell_palette.valueChanged.connect(self._set_sprite_cell)
        chars_layout.addLayout(cell_controls)
        self.new_animation_button = QPushButton("New animation", self.chars_editor)
        self.new_animation_button.setObjectName("newAnimationButton")
        self.new_animation_button.clicked.connect(self._new_animation)
        chars_layout.addWidget(self.new_animation_button)
        self.animation_list = QListWidget(self.chars_editor)
        self.animation_list.setObjectName("animationList")
        self.animation_list.setAccessibleName("Project animations")
        self.animation_list.currentRowChanged.connect(self._select_animation)
        chars_layout.addWidget(self.animation_list)
        animation_actions = QHBoxLayout()
        self.animation_add_frame_button = QPushButton("Add sprite frame", self.chars_editor)
        self.animation_add_frame_button.setObjectName("addAnimationFrameButton")
        self.animation_add_frame_button.clicked.connect(self._append_selected_sprite_frame)
        animation_actions.addWidget(self.animation_add_frame_button)
        self.animation_remove_frame_button = QPushButton("Remove last frame", self.chars_editor)
        self.animation_remove_frame_button.setObjectName("removeAnimationFrameButton")
        self.animation_remove_frame_button.clicked.connect(self._remove_last_animation_frame)
        animation_actions.addWidget(self.animation_remove_frame_button)
        self.animation_delete_button = QPushButton("Delete animation", self.chars_editor)
        self.animation_delete_button.setObjectName("deleteAnimationButton")
        self.animation_delete_button.clicked.connect(self._delete_animation)
        animation_actions.addWidget(self.animation_delete_button)
        chars_layout.addLayout(animation_actions)
        self.animation_fps = QSpinBox(self.chars_editor)
        self.animation_fps.setObjectName("animationFps")
        self.animation_fps.setRange(1, 60)
        self.animation_fps.setPrefix("FPS ")
        self.animation_fps.valueChanged.connect(self._set_animation_fps)
        chars_layout.addWidget(self.animation_fps)
        self.animation_assignments: dict[str, QComboBox] = {}
        for kind in ("walk", "jump", "attack"):
            selector = QComboBox(self.chars_editor)
            selector.setObjectName(f"{kind}AnimationSelector")
            selector.currentIndexChanged.connect(lambda _value, kind=kind: self._set_animation_assignment(kind))
            self.animation_assignments[kind] = selector
            chars_layout.addWidget(selector)
        self.editor_stack.addWidget(self.chars_editor)
        self.rules_editor = QFrame(self.editor_stack)
        self.rules_editor.setObjectName("rulesEditor")
        rules_layout = QVBoxLayout(self.rules_editor)
        rules_layout.addWidget(QLabel("GAME STYLE", self.rules_editor))
        self.game_style = QComboBox(self.rules_editor)
        self.game_style.setObjectName("gameStyleSelector")
        self.game_style.addItems(["platformer", "topdown", "runner", "racer", "smb"])
        self.game_style.currentTextChanged.connect(self._set_game_style)
        rules_layout.addWidget(self.game_style)
        self.game_options: dict[str, QSpinBox] = {}
        for key, label, minimum, maximum in (
            ("autoscrollSpeed", "Runner scroll speed", 1, 4),
            ("racerTopSpeed", "Racer top speed", 1, 4),
            ("racerLaps", "Racer laps", 1, 9),
            ("racerCheckpoints", "Racer checkpoints", 1, 2),
        ):
            control = QSpinBox(self.rules_editor)
            control.setObjectName(f"{key}Control")
            control.setAccessibleName(label)
            control.setPrefix(f"{label}: ")
            control.setRange(minimum, maximum)
            control.valueChanged.connect(lambda value, key=key: self._set_game_option(key, value))
            self.game_options[key] = control
            rules_layout.addWidget(control)
        rules_layout.addWidget(QLabel("PLAYER 1", self.rules_editor))
        self.player_options: dict[str, QSpinBox] = {}
        for key, label, minimum, maximum in (
            ("startX", "Start X", 0, 240), ("startY", "Start Y", 16, 200),
            ("walkSpeed", "Walk speed", 1, 4), ("jumpHeight", "Jump height", 8, 40),
            ("maxHp", "Max HP", 0, 9),
        ):
            control = QSpinBox(self.rules_editor)
            control.setObjectName(f"player{key[0].upper()}{key[1:]}Control")
            control.setAccessibleName(label)
            control.setPrefix(f"{label}: ")
            control.setRange(minimum, maximum)
            control.valueChanged.connect(lambda value, key=key: self._set_player_option(key, value))
            self.player_options[key] = control
            rules_layout.addWidget(control)
        self.attack_button = QComboBox(self.rules_editor)
        self.attack_button.setObjectName("attackButtonSelector")
        self.attack_button.addItems(["none", "a", "b"])
        self.attack_button.currentTextChanged.connect(lambda value: self._set_player_option("attackButton", value))
        rules_layout.addWidget(self.attack_button)
        self.editor_stack.addWidget(self.rules_editor)
        self.sound_editor = QFrame(self.editor_stack)
        self.sound_editor.setObjectName("soundEditor")
        sound_layout = QVBoxLayout(self.sound_editor)
        sound_layout.addWidget(QLabel("MUSIC & SOUND EFFECTS", self.sound_editor))
        self.song_list = QListWidget(self.sound_editor)
        self.song_list.setObjectName("songList")
        self.song_list.setAccessibleName("Project songs")
        sound_layout.addWidget(self.song_list)
        song_actions = QHBoxLayout()
        for label, callback in (("Import song", lambda: self._import_audio(False)), ("Make default", self._make_default_song), ("Remove song", self._remove_song)):
            button = QPushButton(label, self.sound_editor)
            button.clicked.connect(callback)
            song_actions.addWidget(button)
        sound_layout.addLayout(song_actions)
        self.sfx_label = QLabel("No SFX pack loaded", self.sound_editor)
        self.sfx_label.setObjectName("sfxStatus")
        sound_layout.addWidget(self.sfx_label)
        sfx_actions = QHBoxLayout()
        for label, callback in (("Import SFX", lambda: self._import_audio(True)), ("Remove SFX", self._remove_sfx)):
            button = QPushButton(label, self.sound_editor)
            button.clicked.connect(callback)
            sfx_actions.addWidget(button)
        sound_layout.addLayout(sfx_actions)
        self.audio_budget = QLabel(self.sound_editor)
        self.audio_budget.setObjectName("audioBudget")
        self.audio_budget.setWordWrap(True)
        sound_layout.addWidget(self.audio_budget)
        self.editor_stack.addWidget(self.sound_editor)
        screen_layout.addWidget(self.editor_stack)
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
        self.tile_value.setEnabled(world_enabled)
        self.palette_value.setEnabled(world_enabled)
        self.behaviour_value.setEnabled(world_enabled)
        self.world_canvas.setEnabled(world_enabled)
        self.background_selector.setEnabled(world_enabled)
        self.editor_stack.setCurrentWidget(
            self.code_preview if mode == "CODE" else self.palette_editor if mode == "PALS" else self.tile_editor if mode == "TILES" else self.chars_editor if mode == "CHARS" else self.rules_editor if mode == "RULES" else self.sound_editor if mode == "SOUND" else self.world_canvas
        )
        if mode == "CODE":
            self._refresh_code_preview()
        if mode == "PALS":
            self._refresh_palette_editor()
        if mode == "TILES":
            self._refresh_tile_editor()
        if mode == "CHARS":
            self._refresh_sprite_editor()
            self._refresh_animation_list()
        if mode == "RULES":
            self._refresh_rules_editor()
        if mode == "SOUND":
            self._refresh_sound_editor()
        if world_enabled:
            self._refresh_scene_editor()
            self._select_world_tool(self.world_canvas.tool)

    def _refresh_code_preview(self) -> None:
        if not self._resource_locator.source_checkout:
            self.code_preview.setPlainText(
                "Generated source preview is unavailable: this installation lacks the immutable engine bundle."
            )
            return
        try:
            generated = CodegenDifferential(self._resource_locator.root).assemble(
                self._document.snapshot()
            )
        except Exception as exc:
            self.code_preview.setPlainText(f"Could not generate C source:\n\n{exc}")
            self.statusBar().showMessage("Could not generate CODE preview")
            return
        self.code_preview.setPlainText(generated)
        self.statusBar().showMessage("Generated current project C source")

    def _refresh_palette_editor(self) -> None:
        for palette in range(4):
            for slot, colour in enumerate(self._document.background_palette(palette)):
                control = self._background_palette_controls[palette * 3 + slot]
                control.blockSignals(True)
                control.setValue(colour)
                control.blockSignals(False)
            for slot, colour in enumerate(self._document.sprite_palette(palette)):
                control = self._sprite_palette_controls[palette * 3 + slot]
                control.blockSignals(True)
                control.setValue(colour)
                control.blockSignals(False)

    def _set_background_palette_slot(self, palette: int, slot: int, colour: int) -> None:
        self._document.set_background_palette_slot(palette, slot, colour)
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"BG{palette} palette slot {slot + 1} set to 0x{colour:02X}")

    def _set_sprite_palette_slot(self, palette: int, slot: int, colour: int) -> None:
        self._document.set_sprite_palette_slot(palette, slot, colour)
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"SP{palette} palette slot {slot + 1} set to 0x{colour:02X}")

    def _refresh_tile_editor(self, _index: int | None = None) -> None:
        pixels = self._tile_pixels()
        colours = ("#181828", "#4878d8", "#78d878", "#f8d878")
        for row in range(8):
            for column in range(8):
                value = pixels[row][column]
                button = self._tile_pixel_buttons[row * 8 + column]
                button.setText(str(value))
                button.setStyleSheet(f"background: {colours[value]}; color: #080810; padding: 0;")
        self.tile_default_behaviour.blockSignals(True)
        self.tile_default_behaviour.setValue(self._document.background_tile_default_behaviour(self.tile_selector.value()) or 0)
        self.tile_default_behaviour.setEnabled(self.tile_bank.currentData() != "sprite")
        self.tile_default_behaviour.blockSignals(False)

    def _cycle_tile_pixel(self, column: int, row: int) -> None:
        index = self.tile_selector.value()
        value = (self._tile_pixels()[row][column] + 1) & 3
        if self.tile_bank.currentData() == "sprite":
            self._document.set_sprite_tile_pixel(index, column, row, value)
        else:
            self._document.set_background_tile_pixel(index, column, row, value)
        self._refresh_tile_editor()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Tile 0x{index:02X} pixel {column}, {row} set to {value}")

    def _transform_tile(self, operation: str) -> None:
        index = self.tile_selector.value()
        if self.tile_bank.currentData() == "sprite":
            self._document.transform_sprite_tile(index, operation)
        else:
            self._document.transform_background_tile(index, operation)
        self._refresh_tile_editor()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Applied {operation.replace('_', ' ')} to tile 0x{index:02X}")

    def _duplicate_tile(self) -> None:
        try:
            index = self._document.duplicate_sprite_tile(self.tile_selector.value()) if self.tile_bank.currentData() == "sprite" else self._document.duplicate_background_tile(self.tile_selector.value())
        except ValueError as exc:
            QMessageBox.information(self, "Duplicate tile", str(exc))
            return
        self.tile_selector.setValue(index)
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Duplicated tile into 0x{index:02X}")

    def _set_tile_default_behaviour(self, value: int) -> None:
        if self.tile_bank.currentData() != "sprite":
            self._document.set_background_tile_metadata(self.tile_selector.value(), default_behaviour=value)
            self._session.schedule_save()
            self._update_document_title()

    def _tile_pixels(self) -> list[list[int]]:
        if self.tile_bank.currentData() == "sprite":
            return self._document.sprite_tile_pixels(self.tile_selector.value())
        return self._document.background_tile_pixels(self.tile_selector.value())

    def _refresh_scene_editor(self, selected: int | None = None) -> None:
        if selected is None: selected = self.scene_list.currentRow()
        self.scene_sprite.blockSignals(True)
        self.scene_sprite.clear()
        for index, name in enumerate(self._document.sprite_names()):
            if (self._document.state.get("sprites") or [])[index].get("role") != "player":
                self.scene_sprite.addItem(name, index)
        self.scene_sprite.blockSignals(False)
        self.scene_list.blockSignals(True)
        self.scene_list.clear()
        for instance in self._document.scene_instances():
            sprite_index = int(instance.get("spriteIdx") or 0)
            names = self._document.sprite_names()
            name = names[sprite_index] if 0 <= sprite_index < len(names) else "Character"
            self.scene_list.addItem(f"{name} @ {instance.get('x', 0)},{instance.get('y', 0)} ({instance.get('ai', 'static')})")
        self.scene_list.setCurrentRow(selected if 0 <= selected < self.scene_list.count() else -1)
        self.scene_list.blockSignals(False)
        self._select_scene_instance(self.scene_list.currentRow())

    def _select_scene_instance(self, index: int) -> None:
        instances = self._document.scene_instances()
        instance = instances[index] if 0 <= index < len(instances) else None
        for control, key, default in ((self.scene_x, "x", 0), (self.scene_y, "y", 0)):
            control.blockSignals(True); control.setValue(int(instance.get(key, default)) if instance else default); control.blockSignals(False)
        self.scene_ai.blockSignals(True)
        self.scene_ai.setCurrentText(str(instance.get("ai", "static")) if instance else "static")
        self.scene_ai.blockSignals(False)

    def _add_scene_instance(self) -> None:
        sprite = self.scene_sprite.currentData()
        if sprite is None:
            QMessageBox.information(self, "Add entity", "Create a non-player character in CHARS first.")
            return
        index = self._document.add_scene_instance(int(sprite))
        self._session.schedule_save()
        self._refresh_scene_editor(index)
        self._update_document_title()

    def _remove_scene_instance(self) -> None:
        index = self.scene_list.currentRow()
        if index >= 0:
            self._document.delete_scene_instance(index)
            self._session.schedule_save()
            self._refresh_scene_editor(index)
            self._update_document_title()

    def _update_scene_instance(self, _value: int | None = None) -> None:
        index = self.scene_list.currentRow()
        if index >= 0:
            self._document.update_scene_instance(index, x=self.scene_x.value(), y=self.scene_y.value(), ai=self.scene_ai.currentText())
            self._session.schedule_save()
            self._refresh_scene_editor(index)
            self._update_document_title()

    def _refresh_sprite_editor(self, selected: int | None = None) -> None:
        current = self.sprite_list.currentRow() if selected is None else selected
        self.sprite_list.blockSignals(True)
        self.sprite_list.clear()
        for index, name in enumerate(self._document.sprite_names()):
            sprite = self._document.state["sprites"][index]
            self.sprite_list.addItem(f"{name} ({sprite.get('role', 'other')})")
        self.sprite_list.setCurrentRow(
            max(0, min(current, self.sprite_list.count() - 1)) if self.sprite_list.count() else -1
        )
        self.sprite_list.blockSignals(False)
        self._select_sprite(self.sprite_list.currentRow())

    def _select_sprite(self, index: int) -> None:
        enabled = index >= 0 and index < len(self._document.sprite_names())
        self.sprite_role.setEnabled(enabled)
        self.sprite_flying.setEnabled(enabled)
        self.sprite_width.setEnabled(enabled)
        self.sprite_height.setEnabled(enabled)
        if not enabled:
            return
        sprite = self._document.state["sprites"][index]
        self.sprite_role.blockSignals(True)
        self.sprite_role.setCurrentText(str(sprite.get("role") or "other"))
        self.sprite_role.blockSignals(False)
        self.sprite_flying.blockSignals(True)
        self.sprite_flying.setChecked(bool(sprite.get("flying", False)))
        self.sprite_flying.blockSignals(False)
        for control, value in ((self.sprite_width, int(sprite.get("width") or 1)), (self.sprite_height, int(sprite.get("height") or 1))):
            control.blockSignals(True)
            control.setValue(min(8, max(1, value)))
            control.blockSignals(False)
        self.sprite_cell_x.setMaximum(self.sprite_width.value() - 1)
        self.sprite_cell_y.setMaximum(self.sprite_height.value() - 1)
        self._refresh_sprite_cell()

    def _new_sprite(self) -> None:
        name, accepted = QInputDialog.getText(self, "New sprite", "Name:", text="Sprite")
        if accepted:
            self._refresh_sprite_editor(self._document.add_sprite(name))
            self._session.schedule_save()

    def _duplicate_sprite(self) -> None:
        index = self.sprite_list.currentRow()
        if index < 0:
            return
        name, accepted = QInputDialog.getText(self, "Duplicate sprite", "Name:", text=f"{self._document.sprite_names()[index]} copy")
        if accepted:
            self._refresh_sprite_editor(self._document.duplicate_sprite(index, name))
            self._session.schedule_save()

    def _rename_sprite(self) -> None:
        index = self.sprite_list.currentRow()
        if index < 0:
            return
        name, accepted = QInputDialog.getText(self, "Rename sprite", "Name:", text=self._document.sprite_names()[index])
        if accepted:
            self._document.rename_sprite(index, name)
            self._refresh_sprite_editor(index)
            self._session.schedule_save()

    def _delete_sprite(self) -> None:
        index = self.sprite_list.currentRow()
        if index >= 0:
            self._document.delete_sprite(index)
            self._refresh_sprite_editor(index)
            self._session.schedule_save()

    def _set_sprite_role(self, role: str) -> None:
        index = self.sprite_list.currentRow()
        if index >= 0:
            self._document.set_sprite_role(index, role)
            self._refresh_sprite_editor(index)
            self._session.schedule_save()

    def _set_sprite_flying(self, flying: bool) -> None:
        index = self.sprite_list.currentRow()
        if index >= 0:
            self._document.set_sprite_flying(index, flying)
            self._session.schedule_save()

    def _resize_sprite(self, _value: int) -> None:
        index = self.sprite_list.currentRow()
        if index >= 0:
            self._document.resize_sprite(index, self.sprite_width.value(), self.sprite_height.value())
            self._session.schedule_save()

    def _refresh_sprite_cell(self, _value: int | None = None) -> None:
        index = self.sprite_list.currentRow()
        if index < 0:
            return
        cell = self._document.state["sprites"][index]["cells"][self.sprite_cell_y.value()][self.sprite_cell_x.value()]
        for control, value in ((self.sprite_cell_tile, int(cell.get("tile", 0))), (self.sprite_cell_palette, int(cell.get("palette", 0)))):
            control.blockSignals(True); control.setValue(value); control.blockSignals(False)

    def _set_sprite_cell(self, _value: int) -> None:
        index = self.sprite_list.currentRow()
        if index >= 0:
            self._document.set_sprite_cell(index, self.sprite_cell_x.value(), self.sprite_cell_y.value(), tile=self.sprite_cell_tile.value(), palette=self.sprite_cell_palette.value())
            self._session.schedule_save()

    def _new_animation(self) -> None:
        name, accepted = QInputDialog.getText(self, "New animation", "Name:", text="Animation")
        if not accepted:
            return
        try:
            index = self._document.add_animation(name, frames=[self.sprite_list.currentRow()] if self.sprite_list.currentRow() >= 0 else [])
        except ValueError as exc:
            QMessageBox.warning(self, "Could not create animation", str(exc))
            return
        self._session.schedule_save()
        self._refresh_animation_list(index)
        self._update_document_title()
        self.statusBar().showMessage(f"Created animation {name.strip()}")

    def _select_animation(self, index: int) -> None:
        animations = self._document.state.get("animations") or []
        animation = animations[index] if 0 <= index < len(animations) and isinstance(animations[index], dict) else None
        self.animation_fps.blockSignals(True)
        self.animation_fps.setValue(int(animation.get("fps", 8)) if animation else 8)
        self.animation_fps.blockSignals(False)
        has_animation = animation is not None
        self.animation_add_frame_button.setEnabled(has_animation and self.sprite_list.currentRow() >= 0)
        self.animation_remove_frame_button.setEnabled(bool(animation and animation.get("frames")))
        self.animation_delete_button.setEnabled(has_animation)

    def _refresh_animation_list(self, selected: int | None = None) -> None:
        if selected is None:
            selected = self.animation_list.currentRow()
        self.animation_list.clear()
        for animation in self._document.state.get("animations") or []:
            if isinstance(animation, dict):
                self.animation_list.addItem(
                    f"{animation.get('name') or 'Animation'} — {animation.get('fps', 8)} fps ({len(animation.get('frames') or [])} frames)"
                )
        self.animation_list.setCurrentRow(selected if 0 <= selected < self.animation_list.count() else -1)
        animations = self._document.state.get("animations") or []
        assignments = self._document.state.get("animation_assignments") or {}
        for kind, selector in self.animation_assignments.items():
            selector.blockSignals(True)
            selector.clear()
            selector.addItem(f"{kind.title()}: (none)", None)
            for index, animation in enumerate(animations):
                if isinstance(animation, dict):
                    selector.addItem(f"{kind.title()}: {animation.get('name') or 'Animation'}", index)
            assigned = assignments.get(kind) if isinstance(assignments, dict) else None
            selected_index = next((index for index, animation in enumerate(animations) if isinstance(animation, dict) and animation.get("id") == assigned), -1)
            selector.setCurrentIndex(selected_index + 1)
            selector.blockSignals(False)

    def _append_selected_sprite_frame(self) -> None:
        animation, sprite = self.animation_list.currentRow(), self.sprite_list.currentRow()
        if animation >= 0 and sprite >= 0:
            self._document.append_animation_frame(animation, sprite)
            self._session.schedule_save()
            self._refresh_animation_list(animation)

    def _remove_last_animation_frame(self) -> None:
        animation = self.animation_list.currentRow()
        if animation < 0:
            return
        try:
            self._document.remove_animation_frame(animation)
        except ValueError:
            return
        self._session.schedule_save()
        self._refresh_animation_list(animation)

    def _delete_animation(self) -> None:
        animation = self.animation_list.currentRow()
        if animation >= 0:
            self._document.delete_animation(animation)
            self._session.schedule_save()
            self._refresh_animation_list(animation)

    def _set_animation_fps(self, fps: int) -> None:
        animation = self.animation_list.currentRow()
        if animation >= 0:
            self._document.update_animation(animation, fps=fps)
            self._session.schedule_save()
            self._refresh_animation_list(animation)

    def _set_animation_assignment(self, kind: str) -> None:
        selector = self.animation_assignments[kind]
        self._document.set_animation_assignment(kind, selector.currentData())
        self._session.schedule_save()
        self._update_document_title()

    def _refresh_rules_editor(self) -> None:
        builder = self._document.state.get("builder") or {}
        config = ((builder.get("modules") or {}).get("game") or {}).get("config") or {}
        style = config.get("type", "platformer")
        self.game_style.blockSignals(True)
        self.game_style.setCurrentText(style if style in {"platformer", "topdown", "runner", "racer", "smb"} else "platformer")
        self.game_style.blockSignals(False)
        for key, default in (("autoscrollSpeed", 2), ("racerTopSpeed", 3), ("racerLaps", 3), ("racerCheckpoints", 1)):
            control = self.game_options[key]
            control.blockSignals(True)
            control.setValue(int(config.get(key, default)))
            control.blockSignals(False)
        player = (((builder.get("modules") or {}).get("players") or {}).get("submodules") or {}).get("player1") or {}
        player_config = player.get("config") if isinstance(player, dict) else {}
        player_config = player_config if isinstance(player_config, dict) else {}
        for key, default in (("startX", 60), ("startY", 120), ("walkSpeed", 1), ("jumpHeight", 20), ("maxHp", 0)):
            control = self.player_options[key]
            control.blockSignals(True)
            control.setValue(int(player_config.get(key, default)))
            control.blockSignals(False)
        self.attack_button.blockSignals(True)
        self.attack_button.setCurrentText(str(player_config.get("attackButton", "none")))
        self.attack_button.blockSignals(False)

    def _set_game_style(self, style: str) -> None:
        self._document.set_game_style(style)
        self._session.schedule_save()
        self._update_document_title()

    def _set_game_option(self, key: str, value: int) -> None:
        self._document.set_game_option(key, value)
        self._session.schedule_save()
        self._update_document_title()

    def _set_player_option(self, key: str, value: int | str) -> None:
        self._document.set_player_option(key, value)
        self._session.schedule_save()
        self._update_document_title()

    def _refresh_sound_editor(self) -> None:
        audio = self._document.state.get("audio") or {}
        songs = audio.get("songs") if isinstance(audio, dict) and isinstance(audio.get("songs"), list) else []
        default = int(audio.get("defaultSongIdx") or 0) if isinstance(audio, dict) else 0
        self.song_list.clear()
        for index, song in enumerate(songs):
            if isinstance(song, dict):
                marker = "★ " if index == default else "☆ "
                self.song_list.addItem(f"{marker}{song.get('name') or song.get('filename') or f'song {index}'} — {int(song.get('size') or len(str(song.get('asm') or '').encode('utf-8')))} bytes")
        sfx = audio.get("sfx") if isinstance(audio, dict) else None
        self.sfx_label.setText(f"SFX: {sfx.get('name') or sfx.get('filename')}" if isinstance(sfx, dict) else "No SFX pack loaded")
        used = sum(int(song.get("size") or len(str(song.get("asm") or "").encode("utf-8"))) for song in songs if isinstance(song, dict)) + (int(sfx.get("size") or len(str(sfx.get("asm") or "").encode("utf-8"))) if isinstance(sfx, dict) else 0)
        self.audio_budget.setText(f"Audio uses ~{used / 1024:.1f} KB ({round(used / 32768 * 100)}% of a 32 KB cartridge).")

    def _import_audio(self, sfx: bool) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Import SFX" if sfx else "Import song", "", "Assembly source (*.s *.asm)")
        if not path:
            return
        try:
            asm = Path(path).read_text(encoding="utf-8")
            if sfx:
                self._document.set_audio_sfx(path, asm)
            else:
                self._document.add_audio_song(path, asm)
        except (OSError, ValueError) as exc:
            QMessageBox.warning(self, "Could not import audio", str(exc))
            return
        self._session.schedule_save()
        self._refresh_sound_editor()
        self._update_document_title()

    def _make_default_song(self) -> None:
        index = self.song_list.currentRow()
        if index >= 0:
            self._document.set_default_song(index)
            self._session.schedule_save()
            self._refresh_sound_editor()

    def _remove_song(self) -> None:
        index = self.song_list.currentRow()
        if index >= 0:
            self._document.remove_audio_song(index)
            self._session.schedule_save()
            self._refresh_sound_editor()

    def _remove_sfx(self) -> None:
        self._document.clear_audio_sfx()
        self._session.schedule_save()
        self._refresh_sound_editor()

    def _select_world_tool(self, tool: str) -> None:
        self.world_canvas.set_tool(tool)
        self._tool_buttons[tool].setChecked(True)
        self.statusBar().showMessage(f"WORLD {tool.title()} tool — click or drag on the NES screen")

    def _copy_world_region(self) -> None:
        self.world_canvas.copy_selection()
        left, top, right, bottom = self.world_canvas.selection
        self.statusBar().showMessage(f"Copied WORLD region {right - left + 1} × {bottom - top + 1}")

    def _paste_world_region(self) -> None:
        if self.world_canvas.paste_selection():
            self.statusBar().showMessage("Pasted WORLD region")
        else:
            self.statusBar().showMessage("Nothing to paste — copy a WORLD region first")

    def _world_cell_changed(self, col: int, row: int, value: int) -> None:
        self._document.set_world_tile(col + self._world_screen_x * 32, row + self._world_screen_y * 30, value)
        default_behaviour = self._document.background_tile_default_behaviour(value)
        if default_behaviour is not None and self.world_canvas.tool in {"paint", "fill"}:
            self._document.set_world_behaviour(col + self._world_screen_x * 32, row + self._world_screen_y * 30, default_behaviour)
        self._world_value_changed(f"tile {value}")

    def _world_palette_changed(self, col: int, row: int, value: int) -> None:
        self._document.set_world_palette(col + self._world_screen_x * 32, row + self._world_screen_y * 30, value)
        self._world_value_changed(f"palette {value}")

    def _world_behaviour_changed(self, col: int, row: int, value: int) -> None:
        self._document.set_world_behaviour(col + self._world_screen_x * 32, row + self._world_screen_y * 30, value)
        self._world_value_changed(f"behaviour {value}")

    def _world_value_changed(self, description: str) -> None:
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"WORLD changed to {description}")

    def _load_document_world(self) -> None:
        self._sync_background_selector()
        show_grid, show_attributes = self._document.world_grid_options()
        self.world_canvas.set_grid_options(show_grid=show_grid, show_attributes=show_attributes)
        for checkbox, value in ((self.grid_toggle, show_grid), (self.attribute_toggle, show_attributes)):
            checkbox.blockSignals(True)
            checkbox.setChecked(value)
            checkbox.blockSignals(False)
        self.universal_background.blockSignals(True)
        self.universal_background.setValue(self._document.universal_background)
        self.universal_background.blockSignals(False)
        self.world_canvas.load_world(
            self._document.world_tiles(self._world_screen_x, self._world_screen_y),
            self._document.world_palettes(self._world_screen_x, self._world_screen_y),
            self._document.world_behaviours(self._world_screen_x, self._world_screen_y),
        )

    def _set_world_grid_options(self, _checked: bool) -> None:
        show_grid, show_attributes = self.grid_toggle.isChecked(), self.attribute_toggle.isChecked()
        self.world_canvas.set_grid_options(show_grid=show_grid, show_attributes=show_attributes)
        self._document.set_world_grid_options(show_grid=show_grid, show_attributes=show_attributes)
        self._session.schedule_save()
        self._update_document_title()

    def _world_grid_shortcut_changed(self, show_grid: bool, show_attributes: bool) -> None:
        self.grid_toggle.blockSignals(True)
        self.grid_toggle.setChecked(show_grid)
        self.grid_toggle.blockSignals(False)
        self._document.set_world_grid_options(show_grid=show_grid, show_attributes=show_attributes)
        self._session.schedule_save()
        self._update_document_title()

    def _set_universal_background(self, colour: int) -> None:
        self._document.set_universal_background(colour)
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Universal backdrop set to 0x{colour:02X}")

    def _sync_background_selector(self) -> None:
        self.background_selector.blockSignals(True)
        self.background_selector.clear()
        self.background_selector.addItems(self._document.background_names())
        self.background_selector.setCurrentIndex(self._document.selected_background_index)
        self.background_selector.blockSignals(False)
        self._sync_world_layout()

    def _sync_world_layout(self) -> None:
        self.world_layout.blockSignals(True)
        dimensions = self._document.background_dimensions()
        for index in range(self.world_layout.count()):
            if self.world_layout.itemData(index) == dimensions:
                self.world_layout.setCurrentIndex(index)
                break
        self.world_layout.blockSignals(False)
        screens_x, screens_y = dimensions
        self._world_screen_x = min(self._world_screen_x, screens_x - 1)
        self._world_screen_y = min(self._world_screen_y, screens_y - 1)
        for widget, maximum, value in (
            (self.world_screen_x, screens_x - 1, self._world_screen_x),
            (self.world_screen_y, screens_y - 1, self._world_screen_y),
        ):
            widget.blockSignals(True)
            widget.setRange(0, maximum)
            widget.setValue(value)
            widget.blockSignals(False)

    def _select_world_screen(self, _value: int) -> None:
        self._world_screen_x = self.world_screen_x.value()
        self._world_screen_y = self.world_screen_y.value()
        self._load_document_world()
        self.statusBar().showMessage(
            f"Editing WORLD screen {self._world_screen_x + 1}, {self._world_screen_y + 1}"
        )

    def _select_background(self, index: int) -> None:
        if index < 0 or index == self._document.selected_background_index:
            return
        try:
            self._document.select_background(index)
        except (IndexError, ProjectFormatError) as exc:
            QMessageBox.critical(self, "Could not open background", str(exc))
            self._sync_background_selector()
            return
        self._load_document_world()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Opened WORLD background {self._document.background_names()[index]}")

    def _set_world_layout(self, index: int) -> None:
        dimensions = self.world_layout.itemData(index)
        if not isinstance(dimensions, tuple):
            return
        try:
            self._document.set_background_dimensions(*dimensions)
        except (ValueError, ProjectFormatError) as exc:
            QMessageBox.warning(self, "Could not change WORLD layout", str(exc))
            self._sync_world_layout()
            return
        self._load_document_world()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"WORLD layout changed to {dimensions[0]} × {dimensions[1]}")

    def _new_background(self) -> None:
        self._create_background(duplicate=False)

    def _duplicate_background(self) -> None:
        self._create_background(duplicate=True)

    def _create_background(self, *, duplicate: bool) -> None:
        suggested = (
            f"{self._document.background_names()[self._document.selected_background_index]} copy"
            if duplicate
            else f"Room {len(self._document.background_names()) + 1}"
        )
        name, accepted = QInputDialog.getText(self, "WORLD background", "Name:", text=suggested)
        if not accepted:
            return
        try:
            index = self._document.add_background(name, duplicate_selected=duplicate)
        except (ValueError, ProjectFormatError) as exc:
            QMessageBox.warning(self, "Could not create background", str(exc))
            return
        self._load_document_world()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Created WORLD background {self._document.background_names()[index]}")

    def _rename_background(self) -> None:
        index = self._document.selected_background_index
        name, accepted = QInputDialog.getText(
            self, "Rename WORLD background", "Name:", text=self._document.background_names()[index]
        )
        if not accepted:
            return
        try:
            self._document.rename_background(index, name)
        except (ValueError, IndexError, ProjectFormatError) as exc:
            QMessageBox.warning(self, "Could not rename background", str(exc))
            return
        self._sync_background_selector()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Renamed WORLD background to {self._document.background_names()[index]}")

    def _delete_background(self) -> None:
        index = self._document.selected_background_index
        if len(self._document.background_names()) == 1:
            QMessageBox.information(self, "WORLD background", "A project must keep at least one background.")
            return
        name = self._document.background_names()[index]
        if QMessageBox.question(self, "Delete WORLD background", f"Delete {name}?") != QMessageBox.StandardButton.Yes:
            return
        self._document.delete_background(index)
        self._load_document_world()
        self._session.schedule_save()
        self._update_document_title()
        self.statusBar().showMessage(f"Deleted WORLD background {name}")

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
        try:
            import_project(
                self._storage.repository,
                path,
                replace_project_id=self._session.project_id,
                expected_revision=self._session.project.revision,
            )
            self._session.reload(flush=False)
        except (OSError, ProjectFormatError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "Could not open project", str(exc))
            return False
        self._document = self._session.document
        self._document.path = Path(path)
        self._load_document_world()
        self._update_document_title()
        self.statusBar().showMessage(f"Imported {path} into local project storage")
        return True

    def save_project_path(self, path: str) -> bool:
        try:
            self._session.flush()
            export_project(path, self._document)
        except (AtomicExportError, OSError, RuntimeError) as exc:
            QMessageBox.critical(self, "Could not save project", str(exc))
            return False
        self._document.path = Path(path)
        self._update_document_title()
        self.statusBar().showMessage(f"Saved {path}")
        return True

    def _flush_autosave(self) -> None:
        """Compatibility slot for the former recovery timer; now flushes SQLite."""

        if self._document.dirty:
            self._session.flush()
            self.statusBar().showMessage("Saved local project")

    def _snapshot_if_changed(self) -> None:
        if self._document.dirty:
            self._session.flush()
            self._storage.repository.snapshot(
                self._session.project_id, self._document.to_json(), reason="auto_30s"
            )

    def _build_rom(self) -> None:
        if self._build_thread is not None:
            return
        detached = ProjectDocument.from_json(self._document.to_json())
        worker = _BuildWorker(self._build_controller, detached)
        thread = QThread(self)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.succeeded.connect(self._build_succeeded)
        worker.failed.connect(self._build_failed)
        worker.finished.connect(thread.quit)
        worker.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)
        thread.finished.connect(self._build_finished)
        self._build_thread = thread
        self._build_worker = worker
        self.play_button.setEnabled(False)
        self.statusBar().showMessage("Building ROM in a background worker…")
        thread.start()

    def _build_succeeded(self, result: NativeBuildResult) -> None:
        self._last_rom = result.rom
        self.export_rom_action.setEnabled(True)
        self.launch_button.setEnabled(self._fceux is not None)
        self.play_action.setEnabled(self._fceux is not None)
        self.statusBar().showMessage(f"Built ROM ({len(result.rom):,} bytes) — ready to export")

    def _build_failed(self, message: str) -> None:
        self.statusBar().showMessage(f"ROM build failed: {message}")

    def _build_finished(self) -> None:
        self._build_thread = None
        self._build_worker = None
        self.play_button.setEnabled(True)

    def _export_built_rom(self) -> None:
        if self._last_rom is None:
            return
        path, _filter = QFileDialog.getSaveFileName(self, "Export NES ROM", "game.nes", "NES ROM (*.nes)")
        if not path:
            return
        if not path.casefold().endswith(".nes"):
            path += ".nes"
        destination = QSaveFile(path)
        if not destination.open(QIODevice.OpenModeFlag.WriteOnly):
            QMessageBox.critical(self, "Could not export ROM", destination.errorString())
            return
        if destination.write(self._last_rom) != len(self._last_rom) or not destination.commit():
            destination.cancelWriting()
            QMessageBox.critical(self, "Could not export ROM", destination.errorString())
            return
        self.statusBar().showMessage(f"Exported ROM to {path}")

    def _launch_last_rom(self) -> None:
        if self._last_rom is None or self._fceux is None:
            self.statusBar().showMessage("FCEUX is not installed — export the ROM and open it manually")
            return
        try:
            target = self._fceux.launch(
                self._last_rom, self._storage.data_root / "roms" / "latest.nes"
            )
        except EmulatorLaunchError as exc:
            QMessageBox.critical(self, "Could not launch FCEUX", str(exc))
            return
        self.statusBar().showMessage(f"Launched FCEUX with {target}")

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802 - Qt API
        self._snapshot_timer.stop()
        self._flush_autosave()
        self._storage.close()
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

    def recover_autosave(self) -> bool:
        snapshots = self._storage.repository.snapshots(self._session.project_id)
        if not snapshots:
            self.statusBar().showMessage("No local project snapshot is available")
            return False
        try:
            self._session.flush()
            self._storage.repository.restore_snapshot(
                self._session.project_id,
                snapshots[0].snapshot_id,
                expected_revision=self._session.project.revision,
            )
            self._session.reload(flush=False)
        except (KeyError, RuntimeError, ValueError) as exc:
            QMessageBox.critical(self, "Could not restore project snapshot", str(exc))
            return False
        self._document = self._session.document
        self._load_document_world()
        self._update_document_title()
        self.statusBar().showMessage("Restored the latest local project snapshot")
        return True

    def _recover_autosave(self) -> None:
        self.recover_autosave()

    def new_project(self) -> None:
        self._session.snapshot_before("new")
        project = self._storage.create_starter("scratch", name="Untitled Game")
        self._session.close()
        self._session.deleteLater()
        self._session = self._storage.open_session(project.project_id)
        self._document = self._session.document
        self._load_document_world()
        self._update_document_title()
        self.statusBar().showMessage("Created a new locally managed project")

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
        new_action = QAction("&New Project", self)
        new_action.setShortcut(QKeySequence.StandardKey.New)
        new_action.triggered.connect(self.new_project)
        file_menu.addAction(new_action)
        open_action = QAction("&Open Project…", self)
        open_action.setShortcut(QKeySequence.StandardKey.Open)
        open_action.triggered.connect(self._open_project)
        file_menu.addAction(open_action)
        save_action = QAction("Save Project &As…", self)
        save_action.setShortcut(QKeySequence.StandardKey.SaveAs)
        save_action.triggered.connect(self._save_project_as)
        file_menu.addAction(save_action)
        recover_action = QAction("&Restore Latest Snapshot", self)
        recover_action.setObjectName("recoverAutosaveAction")
        recover_action.triggered.connect(self._recover_autosave)
        file_menu.addAction(recover_action)
        self.export_rom_action = QAction("Export Built &ROM…", self)
        self.export_rom_action.setEnabled(False)
        self.export_rom_action.triggered.connect(self._export_built_rom)
        file_menu.addAction(self.export_rom_action)
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
        build_action = QAction("&Build ROM", self)
        build_action.triggered.connect(self._build_rom)
        build_menu.addAction(build_action)
        self.play_action = QAction("&Play in FCEUX", self)
        self.play_action.setEnabled(False)
        self.play_action.triggered.connect(self._launch_last_rom)
        build_menu.addAction(self.play_action)

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
