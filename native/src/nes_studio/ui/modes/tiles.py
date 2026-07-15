"""TILES — the shared 8x8 graphics used by both worlds and characters."""

from __future__ import annotations

from PySide6.QtCore import QPoint, QPointF, QRectF, QSize, Qt, Signal
from PySide6.QtGui import QColor, QKeySequence, QPainter, QPen, QShortcut
from PySide6.QtWidgets import (
    QButtonGroup,
    QComboBox,
    QGridLayout,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ...render.palette import nes_qcolor
from ..widgets.budget import BudgetMeter
from ..widgets.visuals import add_visual_choice, prepare_visual_selector, tile_thumbnail
from .base import Level, Mode, ModeContext, scroll_body

#: The NES has exactly this many tiles in each pattern table. Not one more.
TILES_PER_BANK = 256


class TilesMode(Mode):
    """A 256-slot tile library and an 8x8 pixel editor for the selected slot.

    A tile has no palette of its own — the nametable cell (or metasprite cell)
    that references it chooses one. So the editor needs an explicit "preview
    through this palette" choice, exactly as the web has.
    """

    id = "TILES"
    title = "TILES"
    help_text = "Edit the shared 8×8 graphics used by worlds and characters."
    min_level = Level.BEGINNER

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("tilesModePage")
        self._pen = 1
        self._clipboard: list[list[int]] | None = None
        self._painting = False

        content = scroll_body(self, "tileEditor")
        layout = QVBoxLayout(content)
        layout.setContentsMargins(14, 14, 14, 22)
        layout.setSpacing(8)

        layout.addWidget(QLabel("TILE LIBRARY — select a slot", content))
        library = QGridLayout()
        library.setSpacing(3)
        self.library_buttons: list[QPushButton] = []
        for index in range(256):
            button = QPushButton(f"{index:02X}", content)
            button.setObjectName(f"tileLibrary{index:02X}")
            button.setFixedSize(42, 28)
            button.setIconSize(QSize(20, 20))
            button.setAccessibleName(f"Select tile {index:02X}")
            button.clicked.connect(
                lambda _checked=False, index=index: self.select_tile(index)
            )
            self.library_buttons.append(button)
            library.addWidget(button, index // 16, index % 16)
        layout.addLayout(library)

        pen_row = QHBoxLayout()
        pen_row.addWidget(QLabel("PIXEL PEN", content))
        self.pen_buttons: list[QPushButton] = []
        pen_group = QButtonGroup(content)
        pen_group.setExclusive(True)
        for value in range(4):
            button = QPushButton(str(value), content)
            button.setObjectName(f"tilePen{value}")
            button.setCheckable(True)
            button.setFixedWidth(42)
            button.clicked.connect(lambda _checked=False, value=value: self.set_pen(value))
            pen_group.addButton(button)
            self.pen_buttons.append(button)
            pen_row.addWidget(button)
        self.pen_buttons[self._pen].setChecked(True)
        pen_row.addStretch(1)
        layout.addLayout(pen_row)

        # One self-painting widget, not 64 QPushButtons. The button grid could
        # not be dragged across on a real display: the pressed button had to
        # forward the mouse grab to its neighbours through `childAt`, and every
        # painted pixel re-ran `setStyleSheet` on all 64 buttons — which, mid-drag
        # on a real compositor, dropped the grab, so only the first pixel landed.
        # A single widget owns the whole stroke, exactly as the CHARS canvas does.
        self.pixel_canvas = _PixelGrid(content)
        self.pixel_canvas.stroke_began.connect(self.begin_paint)
        self.pixel_canvas.stroke_ended.connect(self.end_paint)
        self.pixel_canvas.painted.connect(self.paint_pixel)
        layout.addWidget(self.pixel_canvas, 0, Qt.AlignmentFlag.AlignLeft)
        layout.addStretch(1)

        self._shortcuts: list[QShortcut] = []
        for key, delta in (("[", -1), ("]", 1), ("Up", -16), ("Down", 16)):
            shortcut = QShortcut(QKeySequence(key), self)
            shortcut.setContext(Qt.ShortcutContext.WidgetWithChildrenShortcut)
            shortcut.activated.connect(lambda delta=delta: self.step_tile(delta))
            self._shortcuts.append(shortcut)

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        # Populate every selector *before* connecting it. Adding the first item
        # to an empty QComboBox fires currentIndexChanged, and a handler that
        # calls refresh() would re-enter this method through `self.bank`.
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        bank_label = QLabel("BANK", dock)
        bank_label.setObjectName("sectionLabel")
        layout.addWidget(bank_label)
        self.tile_bank = QComboBox(dock)
        self.tile_bank.setObjectName("tileBankSelector")
        prepare_visual_selector(self.tile_bank, "Tile bank")
        add_visual_choice(self.tile_bank, "Background tiles", "bg", colour="#4878d8", glyph="BG")
        add_visual_choice(self.tile_bank, "Sprite tiles", "sprite", colour="#f8d878", glyph="SP")
        layout.addWidget(self.tile_bank)

        tile_label = QLabel("TILE", dock)
        tile_label.setObjectName("sectionLabel")
        layout.addWidget(tile_label)
        self.tile_selector = QSpinBox(dock)
        self.tile_selector.setObjectName("backgroundTileSelector")
        self.tile_selector.setRange(0, 255)
        self.tile_selector.setDisplayIntegerBase(16)
        self.tile_selector.setPrefix("0x")
        self.tile_selector.setAccessibleName("Tile index")
        layout.addWidget(self.tile_selector)

        self.tile_preview_palette = QComboBox(dock)
        self.tile_preview_palette.setObjectName("tilePreviewPalette")
        prepare_visual_selector(self.tile_preview_palette, "Preview palette")
        for palette in range(4):
            add_visual_choice(
                self.tile_preview_palette,
                f"Preview palette {palette}",
                palette,
                colour="#4878d8",
                glyph=str(palette),
            )
        layout.addWidget(self.tile_preview_palette)

        self.tile_name = QLineEdit(dock)
        self.tile_name.setObjectName("backgroundTileName")
        self.tile_name.setPlaceholderText("Tile name")
        self.tile_name.editingFinished.connect(self._set_name)
        layout.addWidget(self.tile_name)

        self.tile_default_behaviour = QSpinBox(dock)
        self.tile_default_behaviour.setObjectName("tileDefaultBehaviour")
        self.tile_default_behaviour.setRange(0, 255)
        self.tile_default_behaviour.setPrefix("Default behaviour: ")
        self.tile_default_behaviour.valueChanged.connect(self._set_default_behaviour)
        layout.addWidget(self.tile_default_behaviour)

        self.usage_label = QLabel(dock)
        self.usage_label.setObjectName("tileUsageLabel")
        self.usage_label.setWordWrap(True)
        layout.addWidget(self.usage_label)

        budget_label = QLabel("CHR BUDGET", dock)
        budget_label.setObjectName("sectionLabel")
        layout.addWidget(budget_label)
        # The NES has exactly 256 background tiles and 256 sprite tiles, and not
        # one more. A pupil should meet that ceiling as a meter, not as a build
        # failure.
        self.bg_meter = BudgetMeter("Background tiles", TILES_PER_BANK, dock)
        self.bg_meter.setObjectName("bgTileBudgetMeter")
        layout.addWidget(self.bg_meter)
        self.sprite_meter = BudgetMeter("Sprite tiles", TILES_PER_BANK, dock)
        self.sprite_meter.setObjectName("spriteTileBudgetMeter")
        layout.addWidget(self.sprite_meter)

        actions_label = QLabel("TRANSFORM", dock)
        actions_label.setObjectName("sectionLabel")
        layout.addWidget(actions_label)
        transforms = QGridLayout()
        for position, (label, operation) in enumerate(
            (("Clear", "clear"), ("Flip H", "flip_h"), ("Flip V", "flip_v"), ("Rotate", "rotate"))
        ):
            button = QPushButton(label, dock)
            button.setObjectName(f"tile{operation.title().replace('_', '')}Button")
            button.clicked.connect(
                lambda _checked=False, operation=operation: self._transform(operation)
            )
            transforms.addWidget(button, position // 2, position % 2)
        layout.addLayout(transforms)

        slots = QGridLayout()
        for position, (label, name, callback) in enumerate(
            (
                ("Duplicate", "duplicateTileButton", self._duplicate),
                ("Copy", "copyTileButton", self._copy),
                ("Paste", "pasteTileButton", self._paste),
                ("Swap…", "swapTileButton", self._swap),
            )
        ):
            button = QPushButton(label, dock)
            button.setObjectName(name)
            button.clicked.connect(callback)
            slots.addWidget(button, position // 2, position % 2)
        layout.addLayout(slots)
        layout.addStretch(1)

        # Everything is populated; now it is safe to listen.
        self.tile_bank.currentIndexChanged.connect(lambda _index: self.refresh())
        self.tile_selector.valueChanged.connect(lambda _value: self.refresh())
        self.tile_preview_palette.currentIndexChanged.connect(lambda _index: self.refresh())
        return dock

    # ---- selection --------------------------------------------------------

    @property
    def bank(self) -> str:
        self.dock()
        return "sprite" if self.tile_bank.currentData() == "sprite" else "bg"

    @property
    def tile_index(self) -> int:
        self.dock()
        return int(self.tile_selector.value())

    @property
    def preview_palette(self) -> int:
        self.dock()
        value = self.tile_preview_palette.currentData()
        return int(value) & 3 if isinstance(value, int) else 0

    def select_tile(self, index: int, *, bank: str | None = None) -> None:
        """Point the editor at one tile. The entry point for 'edit this tile'."""

        self.dock()
        if bank is not None:
            self.tile_bank.setCurrentIndex(1 if bank == "sprite" else 0)
        self.tile_selector.setValue(max(0, min(255, index)))

    def step_tile(self, delta: int) -> None:
        self.select_tile(self.tile_index + delta)

    def set_pen(self, value: int) -> None:
        self._pen = value
        self.pen_buttons[value].setChecked(True)
        self.status(f"Tile pen set to colour {value}")

    def set_compact(self, compact: bool) -> None:
        """Shrink the library at the documented minimum window width."""

        for button in self.library_buttons:
            button.setFixedSize(38 if compact else 42, 26 if compact else 28)

    # ---- pixels -----------------------------------------------------------

    def pixels(self) -> list[list[int]]:
        if self.bank == "sprite":
            return self.document.sprite_tile_pixels(self.tile_index)
        return self.document.background_tile_pixels(self.tile_index)

    def ramp(self) -> tuple[str, str, str, str]:
        """The four real colours the current bank+palette paints with.

        Background pixel value 0 is the universal backdrop; sprite value 0 is
        transparent (shown as the editor's dark base, since a checkerboard would
        fight the surrounding chrome).
        """

        palette = self.preview_palette
        if self.bank == "sprite":
            slots = self.document.sprite_palette(palette)
            zero = "#101018"
        else:
            slots = self.document.background_palette(palette)
            zero = nes_qcolor(self.document.universal_background).name()
        return (zero, *(nes_qcolor(slot).name() for slot in slots))

    def paint_pixel(self, column: int, row: int) -> None:
        index, value = self.tile_index, self._pen
        if self.bank == "sprite":
            self.document.set_sprite_tile_pixel(index, column, row, value)
        else:
            self.document.set_background_tile_pixel(index, column, row, value)
        self.refresh()
        self.edited(f"Tile 0x{index:02X} pixel {column}, {row} set to {value}")

    def begin_paint(self) -> None:
        """A pixel drag is one undo step, not one per pixel."""

        if not self._painting:
            self._painting = True
            self.context.begin_stroke()

    def end_paint(self) -> None:
        if self._painting:
            self._painting = False
            self.context.end_stroke("draw")

    # ---- refresh ----------------------------------------------------------

    def refresh(self) -> None:
        if self._dock is None:
            self.dock()
        pixels = self.pixels()
        colours = self.ramp()
        for value, button in enumerate(self.pen_buttons):
            button.setStyleSheet(
                f"background: {colours[value]}; "
                f"color: {'#f8f8f8' if value == 0 else '#080810'}; font-weight: 800;"
            )
        self.pixel_canvas.set_pixels(pixels, colours)

        background = self.bank != "sprite"
        self.tile_default_behaviour.blockSignals(True)
        self.tile_default_behaviour.setValue(
            self.document.background_tile_default_behaviour(self.tile_index) or 0
        )
        self.tile_default_behaviour.setEnabled(background)
        self.tile_default_behaviour.blockSignals(False)

        tiles = self.document.state.get("bg_tiles" if background else "sprite_tiles") or []
        tile = tiles[self.tile_index] if self.tile_index < len(tiles) else {}
        self.tile_name.blockSignals(True)
        self.tile_name.setText(str(tile.get("name") or "") if isinstance(tile, dict) else "")
        self.tile_name.blockSignals(False)

        selected = self.tile_index
        used = self.usage(self.bank)
        for index, button in enumerate(self.library_buttons):
            is_selected, count = index == selected, used.get(index, 0)
            fill = "#f8d878" if is_selected else "#4878d8" if count else "#292949"
            text = "#080810" if is_selected else "#f8f8f8"
            button.setIcon(
                tile_thumbnail(self.document, index, bank=self.bank, palette=self.preview_palette)
            )
            button.setStyleSheet(
                f"background: {fill}; color: {text}; padding: 0; "
                f"border: {'2px solid #f8f8f8' if is_selected else '1px solid #5b5b90'};"
            )
            button.setToolTip(
                f"Tile 0x{index:02X} — used {count} time{'s' if count != 1 else ''}"
            )
        count = used.get(selected, 0)
        self.usage_label.setText(
            f"Tile 0x{selected:02X} is used {count} time{'s' if count != 1 else ''}."
            + ("" if count else " Nothing references it yet.")
        )
        self.bg_meter.set_used(self.drawn_tiles("bg"))
        self.sprite_meter.set_used(self.drawn_tiles("sprite"))

    def drawn_tiles(self, bank: str) -> int:
        """How many of the 256 slots hold any art at all.

        A slot full of pixel value 0 is a slot the pupil has not spent — it costs
        CHR space, but it is theirs to use.
        """

        read = (
            self.document.sprite_tile_pixels if bank == "sprite" else self.document.background_tile_pixels
        )
        drawn = 0
        for index in range(TILES_PER_BANK):
            pixels = read(index)
            if any(value for row in pixels for value in row):
                drawn += 1
        return drawn

    def usage(self, bank: str) -> dict[int, int]:
        """How many times each tile slot is referenced."""

        counts: dict[int, int] = {}
        if bank == "sprite":
            for sprite in self.document.state.get("sprites") or []:
                for row in sprite.get("cells", []) if isinstance(sprite, dict) else []:
                    for cell in row if isinstance(row, list) else []:
                        if isinstance(cell, dict) and not cell.get("empty"):
                            tile = int(cell.get("tile", 0))
                            counts[tile] = counts.get(tile, 0) + 1
            return counts
        for background in self.document.state.get("backgrounds") or []:
            for row in background.get("nametable", []) if isinstance(background, dict) else []:
                for cell in row if isinstance(row, list) else []:
                    tile = int(cell.get("tile", 0)) if isinstance(cell, dict) else 0
                    counts[tile] = counts.get(tile, 0) + 1
        return counts

    # ---- edits ------------------------------------------------------------

    def _transform(self, operation: str) -> None:
        index = self.tile_index
        if self.bank == "sprite":
            self.document.transform_sprite_tile(index, operation)
        else:
            self.document.transform_background_tile(index, operation)
        self.refresh()
        self.edited(f"Applied {operation.replace('_', ' ')} to tile 0x{index:02X}")

    def _duplicate(self) -> None:
        try:
            index = (
                self.document.duplicate_sprite_tile(self.tile_index)
                if self.bank == "sprite"
                else self.document.duplicate_background_tile(self.tile_index)
            )
        except ValueError as exc:
            QMessageBox.information(self.context.window, "Duplicate tile", str(exc))
            return
        self.select_tile(index)
        self.edited(f"Duplicated tile into 0x{index:02X}")

    def _copy(self) -> None:
        self._clipboard = [row[:] for row in self.pixels()]
        self.status(f"Copied tile 0x{self.tile_index:02X}")

    def _paste(self) -> None:
        if self._clipboard is None:
            self.status("Nothing to paste — copy a tile first")
            return
        index, sprite = self.tile_index, self.bank == "sprite"
        self.context.begin_stroke()
        for row, pixels in enumerate(self._clipboard):
            for column, value in enumerate(pixels):
                if sprite:
                    self.document.set_sprite_tile_pixel(index, column, row, value)
                else:
                    self.document.set_background_tile_pixel(index, column, row, value)
        self.context.end_stroke("paste tile")
        self.refresh()
        self.edited(f"Pasted into tile 0x{index:02X}")

    def _swap(self) -> None:
        first = self.tile_index
        second, accepted = QInputDialog.getInt(
            self.context.window,
            "Swap tile slots",
            "Swap with tile (hex shown in library):",
            first,
            0,
            255,
        )
        if not accepted or second == first:
            return
        self.document.swap_tile_slots(self.bank, first, second)
        self.select_tile(second)
        self.refresh()
        self.edited(
            f"Swapped tile slots 0x{first:02X} and 0x{second:02X}; "
            "references followed the artwork"
        )

    def _set_name(self) -> None:
        if self.bank == "sprite":
            self.document.set_sprite_tile_metadata(self.tile_index, name=self.tile_name.text())
        else:
            self.document.set_background_tile_metadata(
                self.tile_index, name=self.tile_name.text()
            )
        self.refresh()
        self.edited("Tile renamed")

    def _set_default_behaviour(self, value: int) -> None:
        if self.bank != "sprite":
            self.document.set_background_tile_metadata(self.tile_index, default_behaviour=value)
            self.edited("Tile default behaviour changed")


class _PixelGrid(QWidget):
    """The 8x8 pixel editor: one widget that paints itself and owns the drag.

    This replaced a grid of 64 `QPushButton`s. That grid could not be dragged
    across on a real display — the pressed button had to forward the mouse grab
    to its neighbours by hit-testing `childAt` on every move, and each painted
    pixel re-ran `setStyleSheet` on all 64 buttons, which on a real compositor
    dropped the grab mid-stroke so only the first pixel landed.

    A single widget holds the grab for the whole stroke. It is deliberately dumb:
    it is handed the 8x8 values and the four ramp colours to draw, and it emits
    which cell was painted. The mode owns the document. (The same split as the
    CHARS `SpriteCanvas`.)
    """

    CELLS = 8

    painted = Signal(int, int)  # column, row
    stroke_began = Signal()
    stroke_ended = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("tilePixelCanvas")
        self.setFixedSize(256, 256)
        self.setAccessibleName("Tile pixel editor")
        self.setCursor(Qt.CursorShape.CrossCursor)
        self._pixels = [[0] * self.CELLS for _ in range(self.CELLS)]
        self._ramp: tuple[str, ...] = ("#101018",) * 4
        self._painting = False

    def set_pixels(self, pixels: list[list[int]], ramp: tuple[str, ...]) -> None:
        self._pixels = pixels
        self._ramp = ramp
        self.update()

    def _cell_size(self) -> float:
        return self.width() / self.CELLS

    def _cell_at(self, position) -> tuple[int, int] | None:
        size = self._cell_size()
        column = int(position.x() // size)
        row = int(position.y() // size)
        if 0 <= column < self.CELLS and 0 <= row < self.CELLS:
            return column, row
        return None

    def cell_centre(self, column: int, row: int) -> QPoint:
        """Where a cell is drawn — so a test can click the pixel it means to."""

        size = self._cell_size()
        return QPointF((column + 0.5) * size, (row + 0.5) * size).toPoint()

    def paintEvent(self, _event) -> None:  # noqa: N802 - Qt API
        painter = QPainter(self)
        size = self._cell_size()
        for row in range(self.CELLS):
            for column in range(self.CELLS):
                value = self._pixels[row][column] if row < len(self._pixels) else 0
                rect = QRectF(column * size, row * size, size, size)
                painter.fillRect(rect, QColor(self._ramp[value & 3]))
        painter.setPen(QPen(QColor("#34345f"), 1))
        for index in range(self.CELLS + 1):
            offset = index * size
            painter.drawLine(QPointF(offset, 0), QPointF(offset, self.height()))
            painter.drawLine(QPointF(0, offset), QPointF(self.width(), offset))

    def mousePressEvent(self, event) -> None:  # noqa: N802 - Qt API
        if event.button() != Qt.MouseButton.LeftButton:
            return
        cell = self._cell_at(event.position())
        if cell is None:
            return
        self._painting = True
        self.stroke_began.emit()
        self.painted.emit(*cell)

    def mouseMoveEvent(self, event) -> None:  # noqa: N802 - Qt API
        if not self._painting or not (event.buttons() & Qt.MouseButton.LeftButton):
            return
        cell = self._cell_at(event.position())
        if cell is not None:
            self.painted.emit(*cell)

    def mouseReleaseEvent(self, event) -> None:  # noqa: N802 - Qt API
        if event.button() == Qt.MouseButton.LeftButton and self._painting:
            self._painting = False
            self.stroke_ended.emit()
