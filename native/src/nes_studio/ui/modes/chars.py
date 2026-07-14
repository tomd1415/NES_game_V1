"""CHARS — create characters: their art, their roles, their animations."""

from __future__ import annotations

from PySide6.QtCore import QSize, QTimer, Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ...render.framebuffer import render_sprite
from ...render.palette import nes_qcolor
from ..widgets.forms import Card
from ..widgets.shared_tile_guard import SharedTileGuard, sprite_tile_users
from ..widgets.sprite_canvas import SpriteCanvas
from ..widgets.visuals import (
    SPRITE_ROLES,
    add_visual_choice,
    prepare_visual_selector,
    role_colour,
    sprite_thumbnail,
)
from .base import Level, Mode, ModeContext, scroll_body


class CharsMode(Mode):
    """A character is a grid of 8x8 cells, each pointing at a shared sprite tile.

    You now *draw* one, rather than describing it through four spin boxes. The
    canvas paints straight through to whichever tile owns the pixel under the
    cursor — and stops to ask when that tile belongs to somebody else too.
    """

    id = "CHARS"
    title = "CHARS"
    help_text = "Create characters, roles, frames, and animations."
    min_level = Level.BEGINNER

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("charsModePage")
        self._visible_sprites: list[int] = []
        self._pen = 1
        self._guard = SharedTileGuard(self, lambda: self.document)
        self._preview_frame = 0

        content = scroll_body(self, "charsEditor")
        layout = QVBoxLayout(content)
        layout.setContentsMargins(18, 16, 18, 24)
        layout.setSpacing(8)

        tools = QHBoxLayout()
        tools.addWidget(QLabel("DRAW", content))
        self.tool_buttons: dict[str, QPushButton] = {}
        tool_group = QButtonGroup(content)
        tool_group.setExclusive(True)
        for tool, label in (("pencil", "✎ Pencil"), ("picker", "⊹ Pick cell")):
            button = QPushButton(label, content)
            button.setObjectName(f"chars{tool.title()}Button")
            button.setCheckable(True)
            button.clicked.connect(lambda _checked=False, tool=tool: self.set_tool(tool))
            tool_group.addButton(button)
            self.tool_buttons[tool] = button
            tools.addWidget(button)
        self.tool_buttons["pencil"].setChecked(True)

        tools.addSpacing(12)
        tools.addWidget(QLabel("PEN", content))
        self.pen_buttons: list[QPushButton] = []
        pen_group = QButtonGroup(content)
        pen_group.setExclusive(True)
        for value in range(4):
            button = QPushButton(str(value), content)
            button.setObjectName(f"charsPen{value}")
            button.setCheckable(True)
            button.setFixedWidth(42)
            button.clicked.connect(lambda _checked=False, value=value: self.set_pen(value))
            pen_group.addButton(button)
            self.pen_buttons.append(button)
            tools.addWidget(button)
        self.pen_buttons[self._pen].setChecked(True)
        tools.addStretch(1)
        layout.addLayout(tools)

        self.canvas = SpriteCanvas(content)
        self.canvas.setMinimumHeight(320)
        self.canvas.pixel_painted.connect(self._paint_pixel)
        self.canvas.cell_selected.connect(self._canvas_cell_selected)
        self.canvas.stroke_began.connect(self._begin_stroke)
        self.canvas.stroke_ended.connect(self._end_stroke)
        layout.addWidget(self.canvas)

        self.pen_hint = QLabel(content)
        self.pen_hint.setObjectName("charsPenHint")
        self.pen_hint.setWordWrap(True)
        layout.addWidget(self.pen_hint)

        # ---- the selected cell ---------------------------------------------
        cell = Card("Selected cell", "One 8×8 tile of this character.", content)
        self.sprite_cell_x = QSpinBox(cell)
        self.sprite_cell_x.setRange(0, 7)
        self.sprite_cell_y = QSpinBox(cell)
        self.sprite_cell_y.setRange(0, 7)
        position = QHBoxLayout()
        position.addWidget(self.sprite_cell_x)
        position.addWidget(self.sprite_cell_y)
        holder = QWidget(cell)
        holder.setLayout(position)
        cell.field("Cell", holder)
        self.sprite_cell_tile = QSpinBox(cell)
        self.sprite_cell_tile.setObjectName("spriteCellTile")
        self.sprite_cell_tile.setRange(0, 255)
        self.sprite_cell_tile.setDisplayIntegerBase(16)
        self.sprite_cell_tile.setPrefix("0x")
        cell.field("Uses tile", self.sprite_cell_tile, hint="The shared 8×8 slot this cell draws.")
        self.sprite_cell_palette = QSpinBox(cell)
        self.sprite_cell_palette.setObjectName("spriteCellPalette")
        self.sprite_cell_palette.setRange(0, 3)
        cell.field("Sprite palette", self.sprite_cell_palette)
        attributes = QHBoxLayout()
        self.sprite_cell_flip_h = QCheckBox("Flip H", cell)
        self.sprite_cell_flip_v = QCheckBox("Flip V", cell)
        self.sprite_cell_priority = QCheckBox("Behind BG", cell)
        self.sprite_cell_empty = QCheckBox("Empty", cell)
        for control in (
            self.sprite_cell_flip_h,
            self.sprite_cell_flip_v,
            self.sprite_cell_priority,
            self.sprite_cell_empty,
        ):
            attributes.addWidget(control)
        flags = QWidget(cell)
        flags.setLayout(attributes)
        cell.wide(flags)
        self.shared_note = QLabel(cell)
        self.shared_note.setObjectName("sharedTileNote")
        self.shared_note.setWordWrap(True)
        cell.wide(self.shared_note)
        self.edit_sprite_pixels_button = QPushButton("Open this tile in TILES", cell)
        self.edit_sprite_pixels_button.setObjectName("editSpritePixelsButton")
        self.edit_sprite_pixels_button.clicked.connect(self._edit_cell_in_tiles)
        cell.wide(self.edit_sprite_pixels_button)
        layout.addWidget(cell)

        # ---- animations ------------------------------------------------------
        animations = Card("Animations", "Play frames in order to bring a character to life.", content)
        self.animation_list = QListWidget(animations)
        self.animation_list.setObjectName("animationList")
        self.animation_list.setAccessibleName("Project animations")
        self.animation_list.setMaximumHeight(120)
        animations.wide(self.animation_list)

        buttons = QHBoxLayout()
        for label, name, callback in (
            ("New", "newAnimationButton", self._new_animation),
            ("Rename", "renameAnimationButton", self._rename_animation),
            ("Duplicate", "duplicateAnimationButton", self._duplicate_animation),
            ("Delete", "deleteAnimationButton", self._delete_animation),
        ):
            button = QPushButton(label, animations)
            button.setObjectName(name)
            button.clicked.connect(callback)
            buttons.addWidget(button)
            setattr(self, f"animation_{label.lower()}_button", button)
        row = QWidget(animations)
        row.setLayout(buttons)
        animations.wide(row)

        frames = QHBoxLayout()
        self.animation_add_frame_button = QPushButton("Add this character", animations)
        self.animation_add_frame_button.setObjectName("addAnimationFrameButton")
        self.animation_add_frame_button.clicked.connect(self._append_frame)
        frames.addWidget(self.animation_add_frame_button)
        self.animation_remove_frame_button = QPushButton("Remove last", animations)
        self.animation_remove_frame_button.setObjectName("removeAnimationFrameButton")
        self.animation_remove_frame_button.clicked.connect(self._remove_frame)
        frames.addWidget(self.animation_remove_frame_button)
        frame_row = QWidget(animations)
        frame_row.setLayout(frames)
        animations.wide(frame_row)

        order = QHBoxLayout()
        self.animation_frame_index = QSpinBox(animations)
        self.animation_frame_index.setObjectName("animationFrameIndex")
        self.animation_frame_index.setPrefix("Frame ")
        order.addWidget(self.animation_frame_index)
        self.animation_frame_left = QPushButton("←", animations)
        self.animation_frame_left.setObjectName("moveAnimationFrameLeftButton")
        self.animation_frame_left.clicked.connect(lambda: self._move_frame(-1))
        order.addWidget(self.animation_frame_left)
        self.animation_frame_right = QPushButton("→", animations)
        self.animation_frame_right.setObjectName("moveAnimationFrameRightButton")
        self.animation_frame_right.clicked.connect(lambda: self._move_frame(1))
        order.addWidget(self.animation_frame_right)
        order_row = QWidget(animations)
        order_row.setLayout(order)
        animations.wide(order_row)

        self.animation_fps = QSpinBox(animations)
        self.animation_fps.setObjectName("animationFps")
        self.animation_fps.setRange(1, 60)
        animations.field("Speed (fps)", self.animation_fps)

        self.animation_preview = QLabel("Select an animation to preview it.", animations)
        self.animation_preview.setObjectName("animationPreview")
        self.animation_preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.animation_preview.setMinimumHeight(72)
        animations.wide(self.animation_preview)

        self.animation_assignments: dict[str, QComboBox] = {}
        for kind in ("walk", "jump", "attack"):
            selector = QComboBox(animations)
            selector.setObjectName(f"{kind}AnimationSelector")
            prepare_visual_selector(selector, f"{kind.title()} animation")
            self.animation_assignments[kind] = selector
            animations.field(f"Use for {kind}", selector)
        layout.addWidget(animations)
        layout.addStretch(1)

        self._preview_timer = QTimer(self)
        self._preview_timer.setInterval(125)
        self._preview_timer.timeout.connect(self._advance_preview)

        self._connect()

    def _connect(self) -> None:
        self.sprite_cell_x.valueChanged.connect(self._select_cell_from_spin)
        self.sprite_cell_y.valueChanged.connect(self._select_cell_from_spin)
        self.sprite_cell_tile.valueChanged.connect(self._set_cell)
        self.sprite_cell_palette.valueChanged.connect(self._set_cell)
        for control in (
            self.sprite_cell_flip_h,
            self.sprite_cell_flip_v,
            self.sprite_cell_priority,
            self.sprite_cell_empty,
        ):
            control.toggled.connect(self._set_cell)
        self.animation_list.currentRowChanged.connect(self._select_animation)
        self.animation_fps.valueChanged.connect(self._set_fps)
        for kind, selector in self.animation_assignments.items():
            selector.currentIndexChanged.connect(
                lambda _index, kind=kind: self._set_assignment(kind)
            )

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        label = QLabel("CHARACTERS", dock)
        label.setObjectName("sectionLabel")
        layout.addWidget(label)

        self.sprite_filter = QComboBox(dock)
        self.sprite_filter.setObjectName("spriteRoleFilter")
        prepare_visual_selector(self.sprite_filter, "Filter characters by role")
        add_visual_choice(self.sprite_filter, "All roles", None, colour="#7878d8", glyph="*")
        for role, colour, glyph in SPRITE_ROLES:
            add_visual_choice(self.sprite_filter, role, role, colour=colour, glyph=glyph)
        layout.addWidget(self.sprite_filter)

        self.sprite_list = QListWidget(dock)
        self.sprite_list.setObjectName("spriteList")
        self.sprite_list.setIconSize(QSize(40, 40))
        layout.addWidget(self.sprite_list)

        actions = QHBoxLayout()
        for label_text, callback in (
            ("New", self._new_sprite),
            ("Copy", self._duplicate_sprite),
            ("Rename", self._rename_sprite),
            ("Delete", self._delete_sprite),
        ):
            button = QPushButton(label_text, dock)
            button.setObjectName(f"sprite{label_text}Button")
            button.clicked.connect(callback)
            actions.addWidget(button)
        layout.addLayout(actions)

        properties = QLabel("THIS CHARACTER", dock)
        properties.setObjectName("sectionLabel")
        layout.addWidget(properties)

        self.sprite_role = QComboBox(dock)
        self.sprite_role.setObjectName("spriteRoleSelector")
        prepare_visual_selector(self.sprite_role, "Character role")
        for role, colour, glyph in SPRITE_ROLES:
            add_visual_choice(self.sprite_role, role, role, colour=colour, glyph=glyph)
        layout.addWidget(self.sprite_role)

        self.sprite_flying = QCheckBox("Flying (ignores gravity)", dock)
        self.sprite_flying.setObjectName("spriteFlyingToggle")
        layout.addWidget(self.sprite_flying)

        size = QHBoxLayout()
        self.sprite_width = QSpinBox(dock)
        self.sprite_width.setObjectName("spriteWidth")
        self.sprite_width.setRange(1, 8)
        self.sprite_width.setPrefix("W ")
        size.addWidget(self.sprite_width)
        self.sprite_height = QSpinBox(dock)
        self.sprite_height.setObjectName("spriteHeight")
        self.sprite_height.setRange(1, 8)
        self.sprite_height.setPrefix("H ")
        size.addWidget(self.sprite_height)
        layout.addLayout(size)

        self.oam_note = QLabel(dock)
        self.oam_note.setObjectName("oamNote")
        self.oam_note.setWordWrap(True)
        layout.addWidget(self.oam_note)
        layout.addStretch(1)

        self.sprite_filter.currentIndexChanged.connect(lambda _index: self.refresh_sprites(0))
        self.sprite_list.currentRowChanged.connect(self._select_sprite)
        self.sprite_role.currentIndexChanged.connect(self._set_role)
        self.sprite_flying.toggled.connect(self._set_flying)
        self.sprite_width.valueChanged.connect(self._resize)
        self.sprite_height.valueChanged.connect(self._resize)
        return dock

    # ---- lifecycle --------------------------------------------------------

    def on_enter(self) -> None:
        self._preview_timer.start()

    def on_leave(self) -> None:
        self._preview_timer.stop()

    def refresh(self) -> None:
        self.dock()
        self.refresh_sprites()
        self.refresh_animations()

    # ---- sprites ----------------------------------------------------------

    @property
    def sprite_index(self) -> int:
        row = self.sprite_list.currentRow()
        return self._visible_sprites[row] if 0 <= row < len(self._visible_sprites) else -1

    def refresh_sprites(self, selected: int | None = None) -> None:
        current = self.sprite_list.currentRow() if selected is None else selected
        role_filter = self.sprite_filter.currentData()
        self.sprite_list.blockSignals(True)
        self.sprite_list.clear()
        self._visible_sprites = []
        sprites = self.document.state.get("sprites") or []
        for index, name in enumerate(self.document.sprite_names()):
            sprite = sprites[index]
            if role_filter is not None and sprite.get("role", "other") != role_filter:
                continue
            self.sprite_list.addItem(
                QListWidgetItem(
                    sprite_thumbnail(self.document, sprite),
                    f"{name} ({sprite.get('role', 'other')})",
                )
            )
            self._visible_sprites.append(index)
        self.sprite_list.setCurrentRow(
            max(0, min(current, self.sprite_list.count() - 1)) if self.sprite_list.count() else -1
        )
        self.sprite_list.blockSignals(False)
        self._select_sprite(self.sprite_list.currentRow())

    def _select_sprite(self, _row: int) -> None:
        index = self.sprite_index
        enabled = index >= 0
        for control in (
            self.sprite_role,
            self.sprite_flying,
            self.sprite_width,
            self.sprite_height,
            self.canvas,
        ):
            control.setEnabled(enabled)
        if not enabled:
            self.canvas.set_sprite(None, 1, 1)
            self.oam_note.setText("")
            return

        sprite = self.document.state["sprites"][index]
        self.sprite_role.blockSignals(True)
        role = self.sprite_role.findData(str(sprite.get("role") or "other"))
        self.sprite_role.setCurrentIndex(max(0, role))
        self.sprite_role.blockSignals(False)
        self.sprite_flying.blockSignals(True)
        self.sprite_flying.setChecked(bool(sprite.get("flying", False)))
        self.sprite_flying.blockSignals(False)

        width = min(8, max(1, int(sprite.get("width") or 1)))
        height = min(8, max(1, int(sprite.get("height") or 1)))
        for control, value in ((self.sprite_width, width), (self.sprite_height, height)):
            control.blockSignals(True)
            control.setValue(value)
            control.blockSignals(False)

        for control, maximum in (
            (self.sprite_cell_x, width - 1),
            (self.sprite_cell_y, height - 1),
        ):
            control.blockSignals(True)
            control.setMaximum(maximum)
            control.blockSignals(False)

        # The NES draws at most 64 hardware sprites; a big character eats them
        # fast, and that is a budget worth teaching before it bites.
        cells = width * height
        self.oam_note.setText(
            f"{width}×{height} = {cells} of the NES's 64 hardware sprites "
            f"({cells * 100 // 64}% of OAM for one copy of this character)."
        )
        self._redraw_canvas()
        self._refresh_cell_controls()

    def _redraw_canvas(self) -> None:
        index = self.sprite_index
        if index < 0:
            self.canvas.set_sprite(None, 1, 1)
            return
        sprite = self.document.state["sprites"][index]
        width = min(8, max(1, int(sprite.get("width") or 1)))
        height = min(8, max(1, int(sprite.get("height") or 1)))
        self.canvas.set_sprite(render_sprite(self.document, sprite), width, height)
        self._refresh_pen_hint()

    def _refresh_pen_hint(self) -> None:
        cell = self._cell()
        if cell is None:
            self.pen_hint.setText("")
            return
        palette = int(cell.get("palette", 0)) & 3
        slots = self.document.sprite_palette(palette)
        names = ["transparent"] + [f"0x{slot:02X}" for slot in slots]
        for value, button in enumerate(self.pen_buttons):
            colour = "#101018" if value == 0 else nes_qcolor(slots[value - 1]).name()
            button.setStyleSheet(
                f"background: {colour}; color: {'#f8f8f8' if value == 0 else '#080810'}; "
                "font-weight: 800;"
            )
        self.pen_hint.setText(
            f"Painting through sprite palette {palette}: "
            + ", ".join(f"{value} = {name}" for value, name in enumerate(names))
        )

    # ---- the selected cell ------------------------------------------------

    def _cell(self) -> dict | None:
        index = self.sprite_index
        if index < 0:
            return None
        sprite = self.document.state["sprites"][index]
        cells = sprite.get("cells") or []
        column, row = self.canvas.selected_cell
        if row >= len(cells) or not isinstance(cells[row], list) or column >= len(cells[row]):
            return None
        cell = cells[row][column]
        return cell if isinstance(cell, dict) else None

    def _canvas_cell_selected(self, column: int, row: int) -> None:
        for control, value in ((self.sprite_cell_x, column), (self.sprite_cell_y, row)):
            control.blockSignals(True)
            control.setValue(value)
            control.blockSignals(False)
        self._refresh_cell_controls()

    def _select_cell_from_spin(self, _value: int) -> None:
        self.canvas.select_cell(self.sprite_cell_x.value(), self.sprite_cell_y.value())
        self._refresh_cell_controls()

    def _refresh_cell_controls(self) -> None:
        cell = self._cell()
        if cell is None:
            self.shared_note.setText("")
            return
        for control, value in (
            (self.sprite_cell_tile, int(cell.get("tile", 0))),
            (self.sprite_cell_palette, int(cell.get("palette", 0))),
        ):
            control.blockSignals(True)
            control.setValue(value)
            control.blockSignals(False)
        for control, key in (
            (self.sprite_cell_flip_h, "flipH"),
            (self.sprite_cell_flip_v, "flipV"),
            (self.sprite_cell_priority, "priority"),
            (self.sprite_cell_empty, "empty"),
        ):
            control.blockSignals(True)
            control.setChecked(bool(cell.get(key, False)))
            control.blockSignals(False)

        users = sprite_tile_users(
            self.document, int(cell.get("tile", 0)), excluding=self.sprite_index
        )
        self.shared_note.setText(
            "This drawing is shared with " + ", ".join(user.name for user in users) + "."
            if users
            else "This drawing belongs to this character alone."
        )
        self._refresh_pen_hint()

    def _set_cell(self, _value: object = None) -> None:
        index = self.sprite_index
        if index < 0:
            return
        self.document.set_sprite_cell(
            index,
            self.sprite_cell_x.value(),
            self.sprite_cell_y.value(),
            tile=self.sprite_cell_tile.value(),
            palette=self.sprite_cell_palette.value(),
            flip_h=self.sprite_cell_flip_h.isChecked(),
            flip_v=self.sprite_cell_flip_v.isChecked(),
            priority=self.sprite_cell_priority.isChecked(),
            empty=self.sprite_cell_empty.isChecked(),
        )
        self._redraw_canvas()
        self._refresh_cell_controls()
        self.refresh_sprites(self.sprite_list.currentRow())
        self.edited("")

    def _edit_cell_in_tiles(self) -> None:
        cell = self._cell()
        if cell is None:
            return
        tiles = self.context.window.modes["TILES"]
        tiles.select_tile(int(cell.get("tile", 0)), bank="sprite")
        self.context.open_mode("TILES")
        self.status("Editing this cell's tile in TILES")

    # ---- drawing ----------------------------------------------------------

    def set_tool(self, tool: str) -> None:
        self.canvas.set_tool(tool)
        self.tool_buttons[tool].setChecked(True)

    def set_pen(self, value: int) -> None:
        self._pen = value
        self.pen_buttons[value].setChecked(True)
        self.status(
            "Pen 0 is transparent — it rubs out."
            if value == 0
            else f"Pen set to sprite colour {value}"
        )

    def _begin_stroke(self) -> None:
        self.context.begin_stroke()

    def _end_stroke(self) -> None:
        self.context.end_stroke("draw")
        self._guard.reset()

    def _paint_pixel(self, cell_x: int, cell_y: int, x: int, y: int) -> None:
        """Paint one pixel of the character, into whichever tile owns it."""

        index = self.sprite_index
        if index < 0:
            return
        sprite = self.document.state["sprites"][index]
        cells = sprite.get("cells") or []
        if cell_y >= len(cells) or cell_x >= len(cells[cell_y]):
            return
        cell = cells[cell_y][cell_x]
        if not isinstance(cell, dict):
            return

        tile = int(cell.get("tile", 0))
        decision, tile = self._guard.check(tile, sprite_index=index)
        if decision == SharedTileGuard.CANCELLED:
            return
        if decision == SharedTileGuard.DUPLICATED:
            # Point this cell at its own copy, then paint that.
            self.document.set_sprite_cell(
                index,
                cell_x,
                cell_y,
                tile=tile,
                palette=int(cell.get("palette", 0)),
                flip_h=bool(cell.get("flipH")),
                flip_v=bool(cell.get("flipV")),
                priority=bool(cell.get("priority")),
                empty=bool(cell.get("empty")),
            )
            self.status(f"Gave this character its own copy of the drawing (tile 0x{tile:02X})")

        # A flipped cell draws its tile mirrored, so the pixel the pupil clicked
        # is not the pixel in the tile. Undo the flip before writing.
        if bool(cell.get("flipH")):
            x = 7 - x
        if bool(cell.get("flipV")):
            y = 7 - y

        if cell.get("empty"):
            # Drawing into an empty cell is how you fill one in.
            self.document.set_sprite_cell(
                index,
                cell_x,
                cell_y,
                tile=tile,
                palette=int(cell.get("palette", 0)),
                flip_h=bool(cell.get("flipH")),
                flip_v=bool(cell.get("flipV")),
                priority=bool(cell.get("priority")),
                empty=False,
            )

        self.document.set_sprite_tile_pixel(tile, x, y, self._pen)
        self._redraw_canvas()
        self.edited("")

    # ---- sprite CRUD ------------------------------------------------------

    def _new_sprite(self) -> None:
        name, accepted = QInputDialog.getText(
            self.context.window, "New character", "Name:", text="Character"
        )
        if not accepted or not name.strip():
            return
        index = self.document.add_sprite(name)
        self.refresh_sprites(index)
        self.edited(f"Created {name.strip()}")

    def _duplicate_sprite(self) -> None:
        index = self.sprite_index
        if index < 0:
            return
        name, accepted = QInputDialog.getText(
            self.context.window,
            "Duplicate character",
            "Name:",
            text=f"{self.document.sprite_names()[index]} copy",
        )
        if not accepted or not name.strip():
            return
        self.refresh_sprites(self.document.duplicate_sprite(index, name))
        self.edited(f"Duplicated into {name.strip()}")

    def _rename_sprite(self) -> None:
        index = self.sprite_index
        if index < 0:
            return
        name, accepted = QInputDialog.getText(
            self.context.window,
            "Rename character",
            "Name:",
            text=self.document.sprite_names()[index],
        )
        if not accepted or not name.strip():
            return
        self.document.rename_sprite(index, name)
        self.refresh_sprites(self.sprite_list.currentRow())
        self.edited("Renamed character")

    def _delete_sprite(self) -> None:
        index = self.sprite_index
        if index < 0:
            return
        name = self.document.sprite_names()[index]
        if (
            QMessageBox.question(self.context.window, "Delete character", f"Delete {name}?")
            != QMessageBox.StandardButton.Yes
        ):
            return
        self.document.delete_sprite(index)
        self.refresh_sprites(max(0, self.sprite_list.currentRow() - 1))
        self.edited(f"Deleted {name}")

    def _set_role(self, _index: int) -> None:
        index = self.sprite_index
        role = self.sprite_role.currentData()
        if index >= 0 and isinstance(role, str):
            self.document.set_sprite_role(index, role)
            self.refresh_sprites(self.sprite_list.currentRow())
            self.edited(f"Role set to {role}")

    def _set_flying(self, flying: bool) -> None:
        index = self.sprite_index
        if index >= 0:
            self.document.set_sprite_flying(index, flying)
            self.edited("")

    def _resize(self, _value: int) -> None:
        index = self.sprite_index
        if index < 0:
            return
        self.document.resize_sprite(index, self.sprite_width.value(), self.sprite_height.value())
        self._select_sprite(self.sprite_list.currentRow())
        self.refresh_sprites(self.sprite_list.currentRow())
        self.edited("Resized character")

    # ---- animations -------------------------------------------------------

    def refresh_animations(self, selected: int | None = None) -> None:
        if selected is None:
            selected = self.animation_list.currentRow()
        self.animation_list.blockSignals(True)
        self.animation_list.clear()
        animations = self.document.state.get("animations") or []
        for animation in animations:
            if isinstance(animation, dict):
                frames = len(animation.get("frames") or [])
                self.animation_list.addItem(
                    f"{animation.get('name') or 'Animation'} — "
                    f"{animation.get('fps', 8)} fps ({frames} frames)"
                )
        self.animation_list.setCurrentRow(
            selected if 0 <= selected < self.animation_list.count() else -1
        )
        self.animation_list.blockSignals(False)

        assignments = self.document.state.get("animation_assignments") or {}
        for kind, selector in self.animation_assignments.items():
            selector.blockSignals(True)
            selector.clear()
            add_visual_choice(selector, "(none)", None, colour="#787898", glyph="–")
            for index, animation in enumerate(animations):
                if isinstance(animation, dict):
                    add_visual_choice(
                        selector,
                        str(animation.get("name") or "Animation"),
                        index,
                        colour="#78d8d8",
                        glyph=str(index + 1),
                    )
            assigned = assignments.get(kind) if isinstance(assignments, dict) else None
            chosen = next(
                (
                    index
                    for index, animation in enumerate(animations)
                    if isinstance(animation, dict) and animation.get("id") == assigned
                ),
                -1,
            )
            selector.setCurrentIndex(chosen + 1)
            selector.blockSignals(False)
        self._select_animation(self.animation_list.currentRow())

    def _animation(self, index: int | None = None) -> dict | None:
        if index is None:
            index = self.animation_list.currentRow()
        animations = self.document.state.get("animations") or []
        if 0 <= index < len(animations) and isinstance(animations[index], dict):
            return animations[index]
        return None

    def _select_animation(self, _row: int) -> None:
        self._preview_frame = 0
        animation = self._animation()
        self.animation_fps.blockSignals(True)
        self.animation_fps.setValue(int(animation.get("fps", 8)) if animation else 8)
        self.animation_fps.blockSignals(False)

        has = animation is not None
        self.animation_add_frame_button.setEnabled(has and self.sprite_index >= 0)
        self.animation_remove_frame_button.setEnabled(bool(animation and animation.get("frames")))
        for name in ("rename", "duplicate", "delete"):
            getattr(self, f"animation_{name}_button").setEnabled(has)

        frames = len(animation.get("frames") or []) if animation else 0
        self.animation_frame_index.blockSignals(True)
        self.animation_frame_index.setRange(0, max(0, frames - 1))
        self.animation_frame_index.setValue(
            min(self.animation_frame_index.value(), max(0, frames - 1))
        )
        self.animation_frame_index.setEnabled(frames > 0)
        self.animation_frame_index.blockSignals(False)
        self.animation_frame_left.setEnabled(frames > 1 and self.animation_frame_index.value() > 0)
        self.animation_frame_right.setEnabled(
            frames > 1 and self.animation_frame_index.value() < frames - 1
        )
        self._refresh_preview()

    def _advance_preview(self) -> None:
        animation = self._animation()
        frames = (animation.get("frames") or []) if animation else []
        if frames:
            self._preview_frame = (self._preview_frame + 1) % len(frames)
            self._refresh_preview()

    def _refresh_preview(self) -> None:
        animation = self._animation()
        if animation is None:
            self.animation_preview.setPixmap(QPixmap())
            self.animation_preview.setText("Select an animation to preview it.")
            return
        frames = animation.get("frames") or []
        if not frames:
            self.animation_preview.setPixmap(QPixmap())
            self.animation_preview.setText("Add character frames to preview this animation.")
            return
        position = self._preview_frame % len(frames)
        sprite_index = int(frames[position])
        sprites = self.document.state.get("sprites") or []
        names = self.document.sprite_names()
        name = names[sprite_index] if 0 <= sprite_index < len(names) else "Missing character"
        # Show the frame, not a sentence describing the frame. The old preview
        # was a *label of text* — it never showed the animation at all.
        if 0 <= sprite_index < len(sprites):
            image = render_sprite(self.document, sprites[sprite_index])
            if not image.isNull():
                scale = max(1, min(64 // max(1, image.height()), 64 // max(1, image.width())))
                pixmap = QPixmap.fromImage(
                    image.scaled(
                        image.width() * scale,
                        image.height() * scale,
                        Qt.AspectRatioMode.KeepAspectRatio,
                        Qt.TransformationMode.FastTransformation,
                    )
                )
                self.animation_preview.setPixmap(pixmap)
                self.animation_preview.setToolTip(
                    f"{name} — frame {position + 1}/{len(frames)} at {animation.get('fps', 8)} fps"
                )
                self.animation_preview.setAccessibleName(
                    f"Playing {animation.get('name') or 'animation'}: {name}, "
                    f"frame {position + 1} of {len(frames)}"
                )
                return
        self.animation_preview.setText(
            f"▶ {name}  ·  frame {position + 1}/{len(frames)}  ·  {animation.get('fps', 8)} FPS"
        )

    def _new_animation(self) -> None:
        name, accepted = QInputDialog.getText(
            self.context.window, "New animation", "Name:", text="Animation"
        )
        if not accepted or not name.strip():
            return
        try:
            sprite = self.sprite_index
            index = self.document.add_animation(name, frames=[sprite] if sprite >= 0 else [])
        except ValueError as exc:
            QMessageBox.warning(self.context.window, "Could not create animation", str(exc))
            return
        self.refresh_animations(index)
        self.edited(f"Created animation {name.strip()}")

    def _rename_animation(self) -> None:
        index = self.animation_list.currentRow()
        animation = self._animation(index)
        if animation is None:
            return
        name, accepted = QInputDialog.getText(
            self.context.window,
            "Rename animation",
            "Name:",
            text=str(animation.get("name") or "Animation"),
        )
        if accepted and name.strip():
            self.document.update_animation(index, name=name)
            self.refresh_animations(index)
            self.edited("Renamed animation")

    def _duplicate_animation(self) -> None:
        index = self.animation_list.currentRow()
        animation = self._animation(index)
        if animation is None:
            return
        name, accepted = QInputDialog.getText(
            self.context.window,
            "Duplicate animation",
            "Name:",
            text=f"{animation.get('name') or 'Animation'} copy",
        )
        if accepted and name.strip():
            self.refresh_animations(self.document.duplicate_animation(index, name))
            self.edited("Duplicated animation")

    def _delete_animation(self) -> None:
        index = self.animation_list.currentRow()
        if self._animation(index) is None:
            return
        self.document.delete_animation(index)
        self.refresh_animations(max(0, index - 1))
        self.edited("Deleted animation")

    def _append_frame(self) -> None:
        index, sprite = self.animation_list.currentRow(), self.sprite_index
        if index >= 0 and sprite >= 0:
            self.document.append_animation_frame(index, sprite)
            self.refresh_animations(index)
            self.edited("Added a frame")

    def _remove_frame(self) -> None:
        index = self.animation_list.currentRow()
        if index < 0:
            return
        try:
            self.document.remove_animation_frame(index)
        except ValueError:
            return
        self.refresh_animations(index)
        self.edited("Removed a frame")

    def _move_frame(self, offset: int) -> None:
        index = self.animation_list.currentRow()
        source = self.animation_frame_index.value()
        if index < 0:
            return
        try:
            self.document.move_animation_frame(index, source, source + offset)
        except IndexError:
            return
        self.refresh_animations(index)
        self.animation_frame_index.setValue(source + offset)
        self.edited("Reordered frames")

    def _set_fps(self, fps: int) -> None:
        index = self.animation_list.currentRow()
        if index >= 0:
            self.document.update_animation(index, fps=fps)
            self.refresh_animations(index)
            self.edited("")

    def _set_assignment(self, kind: str) -> None:
        self.document.set_animation_assignment(
            kind, self.animation_assignments[kind].currentData()
        )
        self.edited(f"{kind.title()} animation assigned")
