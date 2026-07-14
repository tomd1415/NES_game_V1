"""WORLD — build screens, paint tile types, and place game objects.

The only mode that edits *on the NES screen*, so it is the only one that takes
over the CRT stage.
"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QGridLayout,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ...core.project_document import ProjectFormatError
from ...render.framebuffer import attribute_conflicts, render_nametable, render_sprite
from ..widgets.budget import BudgetMeter
from ..widgets.visuals import add_visual_choice, prepare_visual_selector, role_colour
from ..widgets.world_canvas import WorldCanvas
from .base import Level, Mode, ModeContext

#: The behaviours the engine understands, and what they mean to a pupil.
BEHAVIOURS: tuple[tuple[int, str], ...] = (
    (0, "Empty — you walk through it"),
    (1, "Solid ground — you stand on it"),
    (2, "Wall — you cannot pass"),
    (3, "Platform — you can jump up through it"),
    (4, "Ladder — you can climb it"),
    (5, "Trigger — something happens"),
    (6, "Door — it takes you somewhere"),
    (7, "Hazard — it hurts"),
)

BACKGROUND_COLOURS = ("#4878d8", "#78d878", "#78d8d8", "#f8d878", "#f878d8", "#c87848")


class WorldMode(Mode):
    """Paint the screen; place the characters that live on it."""

    id = "WORLD"
    title = "WORLD"
    help_text = "Build screens, paint tile types, and place game objects."
    min_level = Level.BEGINNER
    uses_stage = True

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("worldModePage")
        self.screen_x = 0
        self.screen_y = 0
        self.tool_buttons: dict[str, QPushButton] = {}

        self.canvas = WorldCanvas()
        self.canvas.cell_changed.connect(self._cell_changed)
        self.canvas.palette_changed.connect(self._palette_changed)
        self.canvas.behaviour_changed.connect(self._behaviour_changed)
        self.canvas.cursor_changed.connect(self._cursor_moved)
        self.canvas.picked.connect(self._pick_cell)
        self.canvas.stroke_began.connect(self.context.begin_stroke)
        self.canvas.stroke_ended.connect(lambda: self.context.end_stroke("paint"))
        self.canvas.grid_options_changed.connect(self._grid_shortcut_changed)
        self.canvas.entity_selected.connect(self._canvas_entity_selected)
        self.canvas.entity_moved.connect(self._canvas_entity_moved)

        self._fullscreen: QWidget | None = None
        preview = QShortcut(QKeySequence("F11"), self.canvas)
        preview.setContext(Qt.ShortcutContext.WidgetWithChildrenShortcut)
        preview.activated.connect(self.show_fullscreen_preview)

    def stage_widget(self) -> QWidget:
        return self.canvas

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:  # noqa: PLR0915 - one inspector, built once
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        background_label = QLabel("BACKGROUND", dock)
        background_label.setObjectName("sectionLabel")
        layout.addWidget(background_label)
        self.background_selector = QComboBox(dock)
        self.background_selector.setObjectName("worldBackgroundSelector")
        prepare_visual_selector(self.background_selector, "WORLD background")
        layout.addWidget(self.background_selector)
        actions = QGridLayout()
        for position, (label, callback) in enumerate(
            (
                ("New", self._new_background),
                ("Duplicate", self._duplicate_background),
                ("Rename", self._rename_background),
                ("Delete", self._delete_background),
            )
        ):
            button = QPushButton(label, dock)
            button.setObjectName(f"worldBackground{label}Button")
            button.setAccessibleName(f"{label} WORLD background")
            button.clicked.connect(callback)
            actions.addWidget(button, position // 2, position % 2)
        layout.addLayout(actions)

        layout_label = QLabel("SCREEN LAYOUT", dock)
        layout_label.setObjectName("sectionLabel")
        layout.addWidget(layout_label)
        self.world_layout = QComboBox(dock)
        self.world_layout.setObjectName("worldLayoutSelector")
        prepare_visual_selector(self.world_layout, "WORLD screen layout")
        for label, dimensions, colour, glyph in (
            ("1 × 1 screen", (1, 1), "#4878d8", "1"),
            ("2 × 1 screens", (2, 1), "#78d878", "2"),
            ("1 × 2 screens", (1, 2), "#78d8d8", "2"),
            ("2 × 2 screens", (2, 2), "#f8d878", "4"),
        ):
            add_visual_choice(self.world_layout, label, dimensions, colour=colour, glyph=glyph)
        layout.addWidget(self.world_layout)

        viewport = QHBoxLayout()
        self.world_screen_x = QSpinBox(dock)
        self.world_screen_x.setObjectName("worldScreenX")
        self.world_screen_x.setPrefix("X ")
        self.world_screen_x.setAccessibleName("WORLD screen horizontal position")
        viewport.addWidget(self.world_screen_x)
        self.world_screen_y = QSpinBox(dock)
        self.world_screen_y.setObjectName("worldScreenY")
        self.world_screen_y.setPrefix("Y ")
        self.world_screen_y.setAccessibleName("WORLD screen vertical position")
        viewport.addWidget(self.world_screen_y)
        layout.addLayout(viewport)

        tools_label = QLabel("TOOLS", dock)
        tools_label.setObjectName("sectionLabel")
        layout.addWidget(tools_label)
        tool_group = QButtonGroup(dock)
        tool_group.setExclusive(True)
        tools = QGridLayout()
        for position, tool in enumerate(
            ("select", "paint", "erase", "fill", "palette", "behaviour")
        ):
            label = tool.title()
            button = QPushButton(label, dock)
            button.setObjectName(f"world{label}Button")
            button.setCheckable(True)
            button.clicked.connect(lambda _checked=False, name=tool: self.select_tool(name))
            tool_group.addButton(button)
            self.tool_buttons[tool] = button
            tools.addWidget(button, position // 2, position % 2)
        layout.addLayout(tools)
        pick_hint = QLabel("Right-click a cell to copy everything about it.", dock)
        pick_hint.setWordWrap(True)
        layout.addWidget(pick_hint)

        paint_label = QLabel("PAINT WITH", dock)
        paint_label.setObjectName("sectionLabel")
        layout.addWidget(paint_label)
        self.tile_value = QSpinBox(dock)
        self.tile_value.setObjectName("worldTileValue")
        self.tile_value.setRange(0, 255)
        self.tile_value.setValue(1)
        self.tile_value.setPrefix("Tile 0x")
        self.tile_value.setDisplayIntegerBase(16)
        self.tile_value.setAccessibleName("WORLD tile value")
        layout.addWidget(self.tile_value)
        self.edit_world_tile_button = QPushButton("Edit this tile's pixels", dock)
        self.edit_world_tile_button.setObjectName("editWorldTileButton")
        self.edit_world_tile_button.setAccessibleDescription(
            "Open the current WORLD paint tile in the shared tile pixel editor"
        )
        self.edit_world_tile_button.clicked.connect(self._edit_tile_pixels)
        layout.addWidget(self.edit_world_tile_button)

        self.palette_value = QSpinBox(dock)
        self.palette_value.setObjectName("worldPaletteValue")
        self.palette_value.setRange(0, 3)
        self.palette_value.setValue(1)
        self.palette_value.setPrefix("Palette ")
        self.palette_value.setAccessibleName("WORLD palette value")
        layout.addWidget(self.palette_value)

        self.behaviour_value = QComboBox(dock)
        self.behaviour_value.setObjectName("worldBehaviourValue")
        prepare_visual_selector(self.behaviour_value, "WORLD behaviour value")
        for value, label in BEHAVIOURS:
            add_visual_choice(
                self.behaviour_value,
                label,
                value,
                colour=("#787898", "#787898", "#c87848", "#78d878", "#f8d878", "#f8d878",
                        "#78d8d8", "#f87878")[value],
                glyph=str(value),
            )
        self.behaviour_value.setCurrentIndex(1)
        layout.addWidget(self.behaviour_value)

        blocks_label = QLabel("16×16 BLOCKS", dock)
        blocks_label.setObjectName("sectionLabel")
        layout.addWidget(blocks_label)
        self.metatile_mode_button = QPushButton("Promote to 16×16 blocks", dock)
        self.metatile_mode_button.setObjectName("metatileModeButton")
        self.metatile_mode_button.clicked.connect(self._toggle_metatile_mode)
        layout.addWidget(self.metatile_mode_button)
        self.metatile_list = QListWidget(dock)
        self.metatile_list.setObjectName("metatileList")
        self.metatile_list.setMaximumHeight(110)
        layout.addWidget(self.metatile_list)
        block_actions = QHBoxLayout()
        for label, name, callback in (
            ("New block", "addMetatileButton", self._add_metatile),
            ("Delete block", "deleteMetatileButton", self._delete_metatile),
        ):
            button = QPushButton(label, dock)
            button.setObjectName(name)
            button.clicked.connect(callback)
            block_actions.addWidget(button)
        layout.addLayout(block_actions)
        self.metatile_tiles = [QSpinBox(dock) for _ in range(4)]
        block_grid = QGridLayout()
        for index, control in enumerate(self.metatile_tiles):
            control.setRange(0, 255)
            control.setDisplayIntegerBase(16)
            control.setPrefix("0x")
            control.setAccessibleName(f"Block tile {index}")
            block_grid.addWidget(control, index // 2, index % 2)
        layout.addLayout(block_grid)
        self.metatile_palette = QSpinBox(dock)
        self.metatile_palette.setRange(0, 3)
        self.metatile_palette.setPrefix("Block palette: ")
        layout.addWidget(self.metatile_palette)
        self.metatile_behaviour = QSpinBox(dock)
        self.metatile_behaviour.setRange(0, 255)
        self.metatile_behaviour.setPrefix("Block behaviour: ")
        layout.addWidget(self.metatile_behaviour)

        guides_label = QLabel("GUIDES", dock)
        guides_label.setObjectName("sectionLabel")
        layout.addWidget(guides_label)
        self.grid_toggle = QCheckBox("Fine grid (G)", dock)
        self.grid_toggle.setObjectName("worldGridToggle")
        layout.addWidget(self.grid_toggle)
        self.attribute_toggle = QCheckBox("2 × 2 attribute guides", dock)
        self.attribute_toggle.setObjectName("worldAttributeGuidesToggle")
        layout.addWidget(self.attribute_toggle)
        self.conflict_toggle = QCheckBox("Flag palette conflicts", dock)
        self.conflict_toggle.setObjectName("worldConflictToggle")
        self.conflict_toggle.setChecked(True)
        self.conflict_toggle.setToolTip(
            "The NES stores one palette per 2×2 quadrant. A quadrant using two "
            "palettes cannot render as you drew it."
        )
        layout.addWidget(self.conflict_toggle)
        self.conflict_label = QLabel(dock)
        self.conflict_label.setObjectName("worldConflictLabel")
        self.conflict_label.setWordWrap(True)
        layout.addWidget(self.conflict_label)

        clipboard = QHBoxLayout()
        for label, name, callback in (
            ("Copy", "worldCopyButton", self._copy_region),
            ("Paste", "worldPasteButton", self._paste_region),
        ):
            button = QPushButton(label, dock)
            button.setObjectName(name)
            button.setAccessibleName(f"{label} WORLD region")
            button.clicked.connect(callback)
            clipboard.addWidget(button)
        layout.addLayout(clipboard)

        self.zoom = QComboBox(dock)
        self.zoom.setObjectName("worldZoomSelector")
        prepare_visual_selector(self.zoom, "Zoom")
        for label, factor in (
            ("Fit", 1.0),
            ("2×", 2.0),
            ("3×", 3.0),
            ("4×", 4.0),
        ):
            add_visual_choice(self.zoom, label, factor, colour="#7878c8", glyph=label[:1])
        layout.addWidget(self.zoom)

        self.fullscreen_button = QPushButton("Preview full screen (F11)", dock)
        self.fullscreen_button.setObjectName("worldFullscreenButton")
        self.fullscreen_button.clicked.connect(self.show_fullscreen_preview)
        layout.addWidget(self.fullscreen_button)

        entities_label = QLabel("CHARACTERS ON THIS SCREEN", dock)
        entities_label.setObjectName("sectionLabel")
        layout.addWidget(entities_label)
        self.scene_sprite = QComboBox(dock)
        self.scene_sprite.setObjectName("sceneSpriteSelector")
        prepare_visual_selector(self.scene_sprite, "Entity character")
        layout.addWidget(self.scene_sprite)
        self.scene_list = QListWidget(dock)
        self.scene_list.setObjectName("sceneInstanceList")
        self.scene_list.setMaximumHeight(110)
        layout.addWidget(self.scene_list)
        scene_actions = QHBoxLayout()
        for label, name, callback in (
            ("Add entity", "addSceneInstanceButton", self._add_entity),
            ("Remove", "removeSceneInstanceButton", self._remove_entity),
        ):
            button = QPushButton(label, dock)
            button.setObjectName(name)
            button.clicked.connect(callback)
            scene_actions.addWidget(button)
        layout.addLayout(scene_actions)
        position = QHBoxLayout()
        self.scene_x = QSpinBox(dock)
        self.scene_x.setObjectName("sceneX")
        self.scene_x.setRange(0, 504)
        self.scene_x.setPrefix("X ")
        position.addWidget(self.scene_x)
        self.scene_y = QSpinBox(dock)
        self.scene_y.setObjectName("sceneY")
        self.scene_y.setRange(0, 464)
        self.scene_y.setPrefix("Y ")
        position.addWidget(self.scene_y)
        layout.addLayout(position)
        self.scene_ai = QComboBox(dock)
        self.scene_ai.setObjectName("sceneAiSelector")
        prepare_visual_selector(self.scene_ai, "Entity behaviour")
        for label, colour, glyph in (
            ("static", "#787898", "■"),
            ("walker", "#78d878", "→"),
            ("chaser", "#f87878", "!"),
            ("goomba", "#c87848", "G"),
            ("koopa", "#78d878", "K"),
            ("item", "#f8d878", "+"),
            ("flyer", "#78d8d8", "↑"),
            ("patrol", "#7878d8", "↔"),
        ):
            add_visual_choice(self.scene_ai, label, label, colour=colour, glyph=glyph)
        layout.addWidget(self.scene_ai)
        self.scene_speed = QSpinBox(dock)
        self.scene_speed.setObjectName("sceneSpeed")
        self.scene_speed.setRange(1, 4)
        self.scene_speed.setPrefix("Speed: ")
        layout.addWidget(self.scene_speed)
        self.scene_text = QLineEdit(dock)
        self.scene_text.setObjectName("sceneDialogue")
        self.scene_text.setMaxLength(84)
        self.scene_text.setPlaceholderText("NPC dialogue override (optional)")
        layout.addWidget(self.scene_text)

        budget_label = QLabel("BUDGET", dock)
        budget_label.setObjectName("sectionLabel")
        layout.addWidget(budget_label)
        self.oam_meter = BudgetMeter("Sprites on screen (OAM)", 64, dock)
        self.oam_meter.setObjectName("oamBudgetMeter")
        layout.addWidget(self.oam_meter)
        layout.addStretch(1)

        # Everything exists and is populated; only now is it safe to listen.
        self.background_selector.currentIndexChanged.connect(self._select_background)
        self.world_layout.currentIndexChanged.connect(self._set_layout)
        self.world_screen_x.valueChanged.connect(self._select_screen)
        self.world_screen_y.valueChanged.connect(self._select_screen)
        self.tile_value.valueChanged.connect(self.canvas.set_paint_value)
        self.palette_value.valueChanged.connect(self.canvas.set_palette_value)
        self.behaviour_value.currentIndexChanged.connect(
            lambda _index: self.canvas.set_behaviour_value(
                int(self.behaviour_value.currentData() or 0)
            )
        )
        self.grid_toggle.toggled.connect(self._set_grid_options)
        self.attribute_toggle.toggled.connect(self._set_grid_options)
        self.conflict_toggle.toggled.connect(self.canvas.set_show_conflicts)
        self.zoom.currentIndexChanged.connect(
            lambda _index: self.canvas.set_zoom(float(self.zoom.currentData() or 1.0))
        )
        for control in self.metatile_tiles + [self.metatile_palette, self.metatile_behaviour]:
            control.valueChanged.connect(self._update_metatile)
        self.metatile_list.currentRowChanged.connect(self._select_metatile)
        self.scene_list.currentRowChanged.connect(self._select_entity)
        for control in (self.scene_x, self.scene_y, self.scene_speed):
            control.valueChanged.connect(lambda _value: self._update_entity())
        self.scene_ai.currentIndexChanged.connect(lambda _index: self._update_entity())
        self.scene_text.editingFinished.connect(self._update_entity)
        return dock

    # ---- refresh ----------------------------------------------------------

    def refresh(self) -> None:
        self.dock()
        self._sync_backgrounds()
        show_grid, show_attributes = self.document.world_grid_options()
        self.canvas.set_grid_options(show_grid=show_grid, show_attributes=show_attributes)
        for checkbox, value in ((self.grid_toggle, show_grid), (self.attribute_toggle, show_attributes)):
            checkbox.blockSignals(True)
            checkbox.setChecked(value)
            checkbox.blockSignals(False)
        self.canvas.load_world(
            self.document.world_tiles(self.screen_x, self.screen_y),
            self.document.world_palettes(self.screen_x, self.screen_y),
            self.document.world_behaviours(self.screen_x, self.screen_y),
        )
        self.refresh_entities()
        self.refresh_metatiles()
        self.redraw()

    def redraw(self) -> None:
        """Re-render the screen from the document.

        This is what makes WORLD show the pupil's actual tile art and palettes
        instead of a placeholder colour per tile index.
        """

        self.canvas.set_frame(render_nametable(self.document, self.screen_x, self.screen_y))
        conflicts = attribute_conflicts(self.document, self.screen_x, self.screen_y)
        self.canvas.set_conflicts(conflicts)
        if self._dock is not None:
            self.conflict_label.setText(
                ""
                if not conflicts
                else f"{len(conflicts)} quadrant{'' if len(conflicts) == 1 else 's'} "
                "use more than one palette and will not render as drawn."
            )

    def _sync_backgrounds(self) -> None:
        self.background_selector.blockSignals(True)
        self.background_selector.clear()
        for index, name in enumerate(self.document.background_names()):
            add_visual_choice(
                self.background_selector,
                name,
                index,
                colour=BACKGROUND_COLOURS[index % len(BACKGROUND_COLOURS)],
                glyph=str(index + 1),
            )
        self.background_selector.setCurrentIndex(self.document.selected_background_index)
        self.background_selector.blockSignals(False)
        self._sync_layout()

    def _sync_layout(self) -> None:
        dimensions = self.document.background_dimensions()
        self.world_layout.blockSignals(True)
        index = self.world_layout.findData(dimensions)
        if index >= 0:
            self.world_layout.setCurrentIndex(index)
        self.world_layout.blockSignals(False)

        screens_x, screens_y = dimensions
        self.screen_x = min(self.screen_x, screens_x - 1)
        self.screen_y = min(self.screen_y, screens_y - 1)
        for control, maximum, value in (
            (self.world_screen_x, screens_x - 1, self.screen_x),
            (self.world_screen_y, screens_y - 1, self.screen_y),
        ):
            control.blockSignals(True)
            control.setRange(0, maximum)
            control.setValue(value)
            control.blockSignals(False)

    # ---- tools ------------------------------------------------------------

    def select_tool(self, tool: str) -> None:
        self.canvas.set_tool(tool)
        self.tool_buttons[tool].setChecked(True)
        self.status(f"WORLD {tool.title()} tool — click or drag on the NES screen")

    def _pick_cell(self, col: int, row: int) -> None:
        self.tile_value.setValue(self.canvas.cell_value(col, row))
        self.palette_value.setValue(self.canvas.palette_value(col, row))
        behaviour = self.canvas.behaviour_value(col, row)
        index = self.behaviour_value.findData(behaviour)
        if index >= 0:
            self.behaviour_value.setCurrentIndex(index)
        self.status(
            f"Picked up cell ({col}, {row}) — tile 0x{self.canvas.cell_value(col, row):02X}, "
            f"palette {self.canvas.palette_value(col, row)}, behaviour {behaviour}"
        )

    def _cursor_moved(self, col: int, row: int) -> None:
        world_x = col + self.screen_x * 32
        world_y = row + self.screen_y * 30
        self.status(
            f"({col}, {row}) on this screen · ({world_x}, {world_y}) in the world · "
            f"{self.canvas.tool.title()} tool"
        )

    def _edit_tile_pixels(self) -> None:
        tiles = self.context.window.modes["TILES"]
        tiles.select_tile(self.tile_value.value(), bank="bg")
        self.context.open_mode("TILES")
        self.status("Editing the current WORLD paint tile in TILES")

    def show_fullscreen_preview(self) -> None:
        """The screen, as big as the monitor allows, with nothing else on it."""

        from ..widgets.preview import FullscreenPreview

        self._fullscreen = FullscreenPreview(
            render_nametable(self.document, self.screen_x, self.screen_y),
            self.context.window,
        )
        self._fullscreen.show()

    # ---- painting ---------------------------------------------------------

    def _world_cell(self, col: int, row: int) -> tuple[int, int]:
        return col + self.screen_x * 32, row + self.screen_y * 30

    def _cell_changed(self, col: int, row: int, value: int) -> None:
        world_col, world_row = self._world_cell(col, row)
        if self.document.background_tile_mode() == "16x16" and self.metatile_list.currentRow() >= 0:
            self.document.stamp_metatile(world_col, world_row, self.metatile_list.currentRow())
            self._painted("block")
            return
        self.document.set_world_tile(world_col, world_row, value)
        default = self.document.background_tile_default_behaviour(value)
        if default is not None and self.canvas.tool in {"paint", "fill"}:
            self.document.set_world_behaviour(world_col, world_row, default)
        self._painted(f"tile 0x{value:02X}")

    def _palette_changed(self, col: int, row: int, value: int) -> None:
        self.document.set_world_palette(*self._world_cell(col, row), value)
        self._painted(f"palette {value}")

    def _behaviour_changed(self, col: int, row: int, value: int) -> None:
        self.document.set_world_behaviour(*self._world_cell(col, row), value)
        self._painted(f"behaviour {value}")

    def _painted(self, description: str) -> None:
        self.redraw()
        self.edited(f"WORLD changed to {description}")

    def _copy_region(self) -> None:
        self.canvas.copy_selection()
        left, top, right, bottom = self.canvas.selection
        self.status(f"Copied WORLD region {right - left + 1} × {bottom - top + 1}")

    def _paste_region(self) -> None:
        if self.canvas.paste_selection():
            self.redraw()
            self.status("Pasted WORLD region")
        else:
            self.status("Nothing to paste — copy a WORLD region first")

    def _set_grid_options(self, _checked: bool) -> None:
        show_grid = self.grid_toggle.isChecked()
        show_attributes = self.attribute_toggle.isChecked()
        self.canvas.set_grid_options(show_grid=show_grid, show_attributes=show_attributes)
        self.document.set_world_grid_options(
            show_grid=show_grid, show_attributes=show_attributes
        )
        self.edited("")

    def _grid_shortcut_changed(self, show_grid: bool, show_attributes: bool) -> None:
        self.grid_toggle.blockSignals(True)
        self.grid_toggle.setChecked(show_grid)
        self.grid_toggle.blockSignals(False)
        self.document.set_world_grid_options(
            show_grid=show_grid, show_attributes=show_attributes
        )
        self.edited("")

    # ---- backgrounds ------------------------------------------------------

    def _select_background(self, index: int) -> None:
        if index < 0 or index == self.document.selected_background_index:
            return
        try:
            self.document.select_background(index)
        except (IndexError, ProjectFormatError) as exc:
            QMessageBox.critical(self.context.window, "Could not open background", str(exc))
            self._sync_backgrounds()
            return
        self.refresh()
        self.edited(f"Opened WORLD background {self.document.background_names()[index]}")

    def _new_background(self) -> None:
        self._create_background(duplicate=False)

    def _duplicate_background(self) -> None:
        self._create_background(duplicate=True)

    def _create_background(self, *, duplicate: bool) -> None:
        names = self.document.background_names()
        suggested = (
            f"{names[self.document.selected_background_index]} copy"
            if duplicate
            else f"Room {len(names) + 1}"
        )
        name, accepted = QInputDialog.getText(
            self.context.window, "WORLD background", "Name:", text=suggested
        )
        if not accepted or not name.strip():
            return
        try:
            index = self.document.add_background(name, duplicate_selected=duplicate)
        except (ValueError, ProjectFormatError) as exc:
            QMessageBox.warning(self.context.window, "Could not create background", str(exc))
            return
        self.refresh()
        self.edited(f"Created WORLD background {self.document.background_names()[index]}")

    def _rename_background(self) -> None:
        index = self.document.selected_background_index
        name, accepted = QInputDialog.getText(
            self.context.window,
            "Rename WORLD background",
            "Name:",
            text=self.document.background_names()[index],
        )
        if not accepted:
            return
        try:
            self.document.rename_background(index, name)
        except (ValueError, IndexError, ProjectFormatError) as exc:
            QMessageBox.warning(self.context.window, "Could not rename background", str(exc))
            return
        self._sync_backgrounds()
        self.edited(f"Renamed WORLD background to {self.document.background_names()[index]}")

    def _delete_background(self) -> None:
        index = self.document.selected_background_index
        names = self.document.background_names()
        if len(names) == 1:
            QMessageBox.information(
                self.context.window,
                "WORLD background",
                "A project must keep at least one background.",
            )
            return
        name = names[index]
        if (
            QMessageBox.question(
                self.context.window, "Delete WORLD background", f"Delete {name}?"
            )
            != QMessageBox.StandardButton.Yes
        ):
            return
        self.document.delete_background(index)
        self.refresh()
        self.edited(f"Deleted WORLD background {name}")

    def _set_layout(self, index: int) -> None:
        dimensions = self.world_layout.itemData(index)
        if not isinstance(dimensions, tuple):
            return
        try:
            self.document.set_background_dimensions(*dimensions)
        except (ValueError, ProjectFormatError) as exc:
            QMessageBox.warning(self.context.window, "Could not change WORLD layout", str(exc))
            self._sync_layout()
            return
        self.refresh()
        self.edited(f"WORLD layout changed to {dimensions[0]} × {dimensions[1]}")

    def _select_screen(self, _value: int) -> None:
        self.screen_x = self.world_screen_x.value()
        self.screen_y = self.world_screen_y.value()
        self.refresh()
        self.status(f"Editing WORLD screen {self.screen_x + 1}, {self.screen_y + 1}")

    # ---- metatiles --------------------------------------------------------

    def refresh_metatiles(self) -> None:
        metatile = self.document.background_tile_mode() == "16x16"
        self.metatile_mode_button.setText(
            "Revert to 8×8 tiles" if metatile else "Promote to 16×16 blocks"
        )
        self.metatile_list.setEnabled(metatile)
        selected = self.metatile_list.currentRow()
        self.metatile_list.blockSignals(True)
        self.metatile_list.clear()
        if metatile:
            blocks = (
                self.document.state["backgrounds"][self.document.selected_background_index].get(
                    "metatiles"
                )
                or []
            )
            for index, block in enumerate(blocks):
                tiles = block.get("tiles", [0, 0, 0, 0])
                self.metatile_list.addItem(
                    f"Block {index}: " + " ".join(f"{int(tile):02X}" for tile in tiles)
                )
        if 0 <= selected < self.metatile_list.count():
            self.metatile_list.setCurrentRow(selected)
        self.metatile_list.blockSignals(False)
        self._select_metatile(self.metatile_list.currentRow())

    def _toggle_metatile_mode(self) -> None:
        if self.document.background_tile_mode() == "16x16":
            self.document.revert_selected_background_to_tiles()
        else:
            self.document.promote_selected_background_to_metatiles()
        self.refresh_metatiles()
        self.edited("WORLD tile mode changed")

    def _add_metatile(self) -> None:
        try:
            index = self.document.add_metatile()
        except ValueError as exc:
            QMessageBox.information(self.context.window, "16×16 blocks", str(exc))
            return
        self.refresh_metatiles()
        self.metatile_list.setCurrentRow(index)
        self.edited("Added a 16×16 block")

    def _delete_metatile(self) -> None:
        if self.document.delete_metatile(self.metatile_list.currentRow()):
            self.refresh_metatiles()
            self.edited("Deleted a 16×16 block")

    def _select_metatile(self, index: int) -> None:
        blocks = (
            self.document.state["backgrounds"][self.document.selected_background_index].get(
                "metatiles"
            )
            or []
        )
        block = blocks[index] if 0 <= index < len(blocks) else None
        controls = self.metatile_tiles + [self.metatile_palette, self.metatile_behaviour]
        values = (
            [*block.get("tiles", [0, 0, 0, 0]), block.get("palette", 0), block.get("behaviour", 0)]
            if block
            else [0] * 6
        )
        for control, value in zip(controls, values):
            control.blockSignals(True)
            control.setValue(int(value))
            control.setEnabled(block is not None)
            control.blockSignals(False)

    def _update_metatile(self, _value: int) -> None:
        index = self.metatile_list.currentRow()
        if index < 0:
            return
        self.document.set_metatile(
            index,
            tiles=[control.value() for control in self.metatile_tiles],
            palette=self.metatile_palette.value(),
            behaviour=self.metatile_behaviour.value(),
        )
        self.refresh_metatiles()
        self.metatile_list.setCurrentRow(index)
        self.edited("")

    # ---- entities ---------------------------------------------------------

    def refresh_entities(self, selected: int | None = None) -> None:
        if selected is None:
            selected = self.scene_list.currentRow()
        sprites = self.document.state.get("sprites") or []

        self.scene_sprite.blockSignals(True)
        self.scene_sprite.clear()
        for index, name in enumerate(self.document.sprite_names()):
            sprite = sprites[index] if index < len(sprites) else {}
            role = str(sprite.get("role") or "other") if isinstance(sprite, dict) else "other"
            if role != "player":
                add_visual_choice(
                    self.scene_sprite, name, index, colour=role_colour(role), glyph=role[:1]
                )
        self.scene_sprite.blockSignals(False)

        self.scene_list.blockSignals(True)
        self.scene_list.clear()
        names = self.document.sprite_names()
        for instance in self.document.scene_instances():
            sprite_index = int(instance.get("spriteIdx") or 0)
            name = names[sprite_index] if 0 <= sprite_index < len(names) else "Character"
            self.scene_list.addItem(
                f"{name} @ {instance.get('x', 0)},{instance.get('y', 0)} "
                f"({instance.get('ai', 'static')})"
            )
        self.scene_list.setCurrentRow(selected if 0 <= selected < self.scene_list.count() else -1)
        self.scene_list.blockSignals(False)
        self._select_entity(self.scene_list.currentRow())
        self._sync_canvas_entities()

    def _sync_canvas_entities(self) -> None:
        x_offset, y_offset = self.screen_x * 256, self.screen_y * 240
        sprites = self.document.state.get("sprites") or []
        visible: list[dict[str, int]] = []
        images = []
        oam = 0
        for index, instance in enumerate(self.document.scene_instances()):
            x = int(instance.get("x", 0)) - x_offset
            y = int(instance.get("y", 0)) - y_offset
            # `spriteIdx` — the shell used to read `sprite`, a key the document
            # has never had, so every entity was drawn with sprite 0's artwork
            # no matter which character it actually was.
            sprite_index = int(instance.get("spriteIdx") or 0)
            sprite = sprites[sprite_index] if 0 <= sprite_index < len(sprites) else None
            if not (0 <= x <= 255 and 0 <= y <= 239):
                continue
            visible.append({"index": index, "x": x, "y": y})
            # Draw the entity as its real sprite, not an anonymous red square.
            images.append(render_sprite(self.document, sprite) if isinstance(sprite, dict) else None)
            if isinstance(sprite, dict):
                oam += max(1, int(sprite.get("width") or 1)) * max(1, int(sprite.get("height") or 1))
        self.canvas.set_entities(visible)
        self.canvas.set_entity_images(images)
        if self._dock is not None:
            # The player is drawn too, and costs OAM the scene does not list.
            player = next(
                (
                    sprite
                    for sprite in sprites
                    if isinstance(sprite, dict) and sprite.get("role") == "player"
                ),
                None,
            )
            if player is not None:
                oam += max(1, int(player.get("width") or 1)) * max(
                    1, int(player.get("height") or 1)
                )
            self.oam_meter.set_used(oam)

    def _select_entity(self, index: int) -> None:
        instances = self.document.scene_instances()
        instance = instances[index] if 0 <= index < len(instances) else None
        for control, key, default in ((self.scene_x, "x", 0), (self.scene_y, "y", 0)):
            control.blockSignals(True)
            control.setValue(int(instance.get(key, default)) if instance else default)
            control.blockSignals(False)
        self.scene_ai.blockSignals(True)
        ai = self.scene_ai.findData(str(instance.get("ai", "static")) if instance else "static")
        self.scene_ai.setCurrentIndex(max(0, ai))
        self.scene_ai.blockSignals(False)
        self.scene_speed.blockSignals(True)
        self.scene_speed.setValue(int(instance.get("speed", 1)) if instance else 1)
        self.scene_speed.blockSignals(False)
        self.scene_text.blockSignals(True)
        self.scene_text.setText(str(instance.get("text", "")) if instance else "")
        self.scene_text.blockSignals(False)

    def _add_entity(self) -> None:
        sprite = self.scene_sprite.currentData()
        if sprite is None:
            QMessageBox.information(
                self.context.window,
                "Add entity",
                "Create a non-player character in CHARS first.",
            )
            return
        index = self.document.add_scene_instance(int(sprite))
        self.refresh_entities(index)
        self.edited("Added a character to the screen")

    def _remove_entity(self) -> None:
        index = self.scene_list.currentRow()
        if index < 0:
            return
        self.document.delete_scene_instance(index)
        self.refresh_entities(min(index, self.scene_list.count() - 1))
        self.edited("Removed a character from the screen")

    def _update_entity(self) -> None:
        index = self.scene_list.currentRow()
        if index < 0:
            return
        self.document.update_scene_instance(
            index,
            x=self.scene_x.value(),
            y=self.scene_y.value(),
            ai=str(self.scene_ai.currentData() or "static"),
            speed=self.scene_speed.value(),
            text=self.scene_text.text(),
        )
        self.refresh_entities(index)
        self.edited("")

    def _canvas_entity_selected(self, visible_index: int) -> None:
        entities = self.canvas.entities()
        if 0 <= visible_index < len(entities):
            self.scene_list.setCurrentRow(entities[visible_index]["index"])

    def _canvas_entity_moved(self, visible_index: int, x: int, y: int) -> None:
        entities = self.canvas.entities()
        if not 0 <= visible_index < len(entities):
            return
        index = entities[visible_index]["index"]
        self.document.update_scene_instance(
            index, x=x + self.screen_x * 256, y=y + self.screen_y * 240
        )
        self.refresh_entities(index)
        self.edited("")
