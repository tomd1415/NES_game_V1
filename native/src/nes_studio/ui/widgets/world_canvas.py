"""Native Qt-painted WORLD editing surface."""

from __future__ import annotations

import math

from PySide6.QtCore import QPointF, QRectF, QSize, Qt, Signal
from PySide6.QtGui import QColor, QKeyEvent, QMouseEvent, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget


class WorldCanvas(QWidget):
    """Paint a small tile-index model without browser or server dependencies."""

    COLS = 32
    ROWS = 30
    TILE_PIXELS = 8
    NES_COLOURS = (
        QColor("#181828"),
        QColor("#4878d8"),
        QColor("#78d878"),
        QColor("#f8d878"),
    )

    cell_changed = Signal(int, int, int)
    palette_changed = Signal(int, int, int)
    behaviour_changed = Signal(int, int, int)
    cursor_changed = Signal(int, int)
    history_changed = Signal(bool, bool)
    grid_options_changed = Signal(bool, bool)
    entity_selected = Signal(int)
    entity_moved = Signal(int, int, int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("worldCanvas")
        self.setAccessibleName("Editable NES world canvas")
        self.setAccessibleDescription("A 32 by 30 tile screen; use Paint or Erase and drag over cells")
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self._cells = [[0 for _ in range(self.COLS)] for _ in range(self.ROWS)]
        self._palettes = [[0 for _ in range(self.COLS)] for _ in range(self.ROWS)]
        self._behaviours = [[0 for _ in range(self.COLS)] for _ in range(self.ROWS)]
        self._tool = "select"
        self._paint_value = 1
        self._palette_value = 1
        self._behaviour_value = 1
        self._hover: tuple[int, int] | None = None
        self._selected = (0, 0)
        self._selection = (0, 0, 0, 0)
        self._selection_anchor: tuple[int, int] | None = None
        self._clipboard: list[list[tuple[int, int, int]]] | None = None
        self._show_grid = True
        self._show_attributes = True
        self._undo: list[list[tuple[int, int, int, int, str]]] = []
        self._redo: list[list[tuple[int, int, int, int, str]]] = []
        self._stroke: list[tuple[int, int, int, int, str]] | None = None
        self._stroke_cells: set[tuple[int, int, str]] = set()
        self._entities: list[dict[str, int]] = []
        self._drag_entity: int | None = None
        self._seed_preview()
        self._update_accessible_cell()

    def _seed_preview(self) -> None:
        for row in range(24, self.ROWS):
            for col in range(self.COLS):
                self._cells[row][col] = 2 if row == 24 else 1
        for col, height in ((5, 3), (6, 3), (12, 5), (13, 5), (22, 2)):
            for row in range(24 - height, 24):
                self._cells[row][col] = 3

    def sizeHint(self) -> QSize:  # noqa: N802 - Qt API
        return QSize(640, 600)

    def set_tool(self, tool: str) -> None:
        if tool not in {"select", "paint", "erase", "fill", "palette", "behaviour"}:
            raise ValueError(f"Unknown WORLD tool: {tool}")
        self._tool = tool
        self.setCursor(
            Qt.CursorShape.ArrowCursor if tool == "select" else Qt.CursorShape.CrossCursor
        )

    @property
    def tool(self) -> str:
        return self._tool

    def cell_value(self, col: int, row: int) -> int:
        self._validate_cell(col, row)
        return self._cells[row][col]

    def palette_value(self, col: int, row: int) -> int:
        self._validate_cell(col, row)
        return self._palettes[row][col]

    def behaviour_value(self, col: int, row: int) -> int:
        self._validate_cell(col, row)
        return self._behaviours[row][col]

    @property
    def selected_cell(self) -> tuple[int, int]:
        return self._selected

    def set_palette_value(self, value: int) -> None:
        if not 0 <= value <= 3:
            raise ValueError("NES background palette must be 0..3")
        self._palette_value = value

    def set_paint_value(self, value: int) -> None:
        if not 0 <= value <= 0xFF:
            raise ValueError("NES tile index must be 0..255")
        self._paint_value = value

    def set_behaviour_value(self, value: int) -> None:
        if not 0 <= value <= 0xFF:
            raise ValueError("WORLD behaviour must be 0..255")
        self._behaviour_value = value

    def set_grid_options(self, *, show_grid: bool, show_attributes: bool) -> None:
        self._show_grid, self._show_attributes = bool(show_grid), bool(show_attributes)
        self.update()

    @property
    def grid_options(self) -> tuple[bool, bool]:
        return self._show_grid, self._show_attributes

    def toggle_grid(self) -> None:
        self._show_grid = not self._show_grid
        self.grid_options_changed.emit(self._show_grid, self._show_attributes)
        self.update()

    def load_tiles(self, tiles: list[list[int]]) -> None:
        if len(tiles) < self.ROWS or any(len(row) < self.COLS for row in tiles[: self.ROWS]):
            raise ValueError("WORLD tile data must be at least 32 by 30")
        self._cells = [list(map(int, row[: self.COLS])) for row in tiles[: self.ROWS]]
        self._undo.clear()
        self._redo.clear()
        self.history_changed.emit(False, False)
        self.update()

    def load_world(
        self,
        tiles: list[list[int]],
        palettes: list[list[int]],
        behaviours: list[list[int]],
    ) -> None:
        self.load_tiles(tiles)
        for values, label in ((palettes, "palette"), (behaviours, "behaviour")):
            if len(values) < self.ROWS or any(len(row) < self.COLS for row in values[: self.ROWS]):
                raise ValueError(f"WORLD {label} data must be at least 32 by 30")
        self._palettes = [list(map(int, row[: self.COLS])) for row in palettes[: self.ROWS]]
        self._behaviours = [list(map(int, row[: self.COLS])) for row in behaviours[: self.ROWS]]
        self._selected = (0, 0)
        self._selection = (0, 0, 0, 0)
        self._update_accessible_cell()

    def set_entities(self, entities: list[dict[str, int]]) -> None:
        self._entities = [dict(entity) for entity in entities]
        self.update()

    def edit_cell(self, col: int, row: int) -> bool:
        """Apply the active tool; return whether the model changed."""

        self._validate_cell(col, row)
        if self._tool == "select":
            return False
        positions = [(col, row)]
        if self._tool == "fill":
            positions = self._contiguous_cells(col, row)
        if self._tool == "palette":
            left, top = (col // 2) * 2, (row // 2) * 2
            positions = [
                (cell_col, cell_row)
                for cell_row in range(top, min(top + 2, self.ROWS))
                for cell_col in range(left, min(left + 2, self.COLS))
            ]
        owns_stroke = len(positions) > 1 and self._stroke is None
        if owns_stroke:
            self.begin_stroke()
        changed = False
        for cell_col, cell_row in positions:
            changed = self._edit_one(cell_col, cell_row) or changed
        if owns_stroke:
            self.end_stroke()
        return changed

    @property
    def has_clipboard(self) -> bool:
        return self._clipboard is not None

    @property
    def selection(self) -> tuple[int, int, int, int]:
        return self._selection

    def copy_selection(self) -> bool:
        left, top, right, bottom = self._selection
        self._clipboard = [
            [
                (self._cells[row][col], self._palettes[row][col], self._behaviours[row][col])
                for col in range(left, right + 1)
            ]
            for row in range(top, bottom + 1)
        ]
        return True

    def paste_selection(self, col: int | None = None, row: int | None = None) -> bool:
        if self._clipboard is None:
            return False
        target_col, target_row = self._selected if col is None or row is None else (col, row)
        self._validate_cell(target_col, target_row)
        self.begin_stroke()
        changed = False
        for row_offset, values in enumerate(self._clipboard):
            for col_offset, (tile, palette, behaviour) in enumerate(values):
                destination_col, destination_row = target_col + col_offset, target_row + row_offset
                if destination_col >= self.COLS or destination_row >= self.ROWS:
                    continue
                changed = self._record_value(destination_col, destination_row, "tile", tile) or changed
                changed = self._record_value(destination_col, destination_row, "palette", palette) or changed
                changed = self._record_value(destination_col, destination_row, "behaviour", behaviour) or changed
        self.end_stroke()
        return changed

    def _contiguous_cells(self, col: int, row: int) -> list[tuple[int, int]]:
        source = self._cells[row][col]
        if source == self._paint_value:
            return []
        pending = [(col, row)]
        found = {(col, row)}
        while pending:
            current_col, current_row = pending.pop()
            for next_col, next_row in (
                (current_col - 1, current_row),
                (current_col + 1, current_row),
                (current_col, current_row - 1),
                (current_col, current_row + 1),
            ):
                position = (next_col, next_row)
                if (
                    position not in found
                    and 0 <= next_col < self.COLS
                    and 0 <= next_row < self.ROWS
                    and self._cells[next_row][next_col] == source
                ):
                    found.add(position)
                    pending.append(position)
        return list(found)

    def _edit_one(self, col: int, row: int) -> bool:
        target, value, signal = self._edit_target()
        if target[row][col] == value:
            return False
        return self._record_value(col, row, self._history_tool(), value)

    def _record_value(self, col: int, row: int, tool: str, value: int) -> bool:
        target, signal = self._target_and_signal(tool)
        if target[row][col] == value:
            return False
        before = target[row][col]
        target[row][col] = value
        change = (col, row, before, value, tool)
        if self._stroke is None:
            self._undo.append([change])
            self._redo.clear()
            self.history_changed.emit(True, False)
        elif (col, row, tool) not in self._stroke_cells:
            self._stroke.append(change)
            self._stroke_cells.add((col, row, tool))
        signal.emit(col, row, value)
        if (col, row) == self._selected:
            self._update_accessible_cell()
        self.update(self._cell_rect(col, row).toAlignedRect())
        return True

    def _history_tool(self) -> str:
        if self._tool in {"paint", "erase", "fill"}:
            return "tile"
        return self._tool

    def _edit_target(self):
        if self._tool in {"paint", "erase", "fill"}:
            value = 0 if self._tool == "erase" else self._paint_value
            return self._cells, value, self.cell_changed
        if self._tool == "palette":
            return self._palettes, self._palette_value, self.palette_changed
        return self._behaviours, self._behaviour_value, self.behaviour_changed

    def begin_stroke(self) -> None:
        if self._stroke is None:
            self._stroke = []
            self._stroke_cells.clear()

    def end_stroke(self) -> None:
        if self._stroke is None:
            return
        if self._stroke:
            self._undo.append(self._stroke)
            self._redo.clear()
            self.history_changed.emit(True, False)
        self._stroke = None
        self._stroke_cells.clear()

    @property
    def can_undo(self) -> bool:
        return bool(self._undo)

    @property
    def can_redo(self) -> bool:
        return bool(self._redo)

    def undo(self) -> bool:
        if not self._undo:
            return False
        stroke = self._undo.pop()
        for col, row, before, _after, tool in reversed(stroke):
            target, signal = self._target_and_signal(tool)
            target[row][col] = before
            signal.emit(col, row, before)
        self._redo.append(stroke)
        self.history_changed.emit(self.can_undo, self.can_redo)
        self._update_accessible_cell()
        self.update()
        return True

    def redo(self) -> bool:
        if not self._redo:
            return False
        stroke = self._redo.pop()
        for col, row, _before, after, tool in stroke:
            target, signal = self._target_and_signal(tool)
            target[row][col] = after
            signal.emit(col, row, after)
        self._undo.append(stroke)
        self.history_changed.emit(self.can_undo, self.can_redo)
        self._update_accessible_cell()
        self.update()
        return True

    def _target_and_signal(self, tool: str):
        if tool in {"paint", "erase", "fill", "tile"}:
            return self._cells, self.cell_changed
        if tool == "palette":
            return self._palettes, self.palette_changed
        return self._behaviours, self.behaviour_changed

    def _select_cell(self, col: int, row: int) -> None:
        self._validate_cell(col, row)
        if self._selected != (col, row):
            self._selected = (col, row)
            self.cursor_changed.emit(col, row)
        self._update_accessible_cell()
        self.update()

    def _set_selection(self, anchor: tuple[int, int], current: tuple[int, int]) -> None:
        self._selection = (
            min(anchor[0], current[0]), min(anchor[1], current[1]),
            max(anchor[0], current[0]), max(anchor[1], current[1]),
        )
        self.update()

    def _update_accessible_cell(self) -> None:
        col, row = self._selected
        self.setAccessibleDescription(
            f"Selected WORLD cell column {col}, row {row}; "
            f"tile {self._cells[row][col]}, palette {self._palettes[row][col]}, "
            f"behaviour {self._behaviours[row][col]}. "
            "Use arrow keys to move and Space or Enter to apply the active tool."
        )

    def _validate_cell(self, col: int, row: int) -> None:
        if not 0 <= col < self.COLS or not 0 <= row < self.ROWS:
            raise IndexError(f"WORLD cell outside {self.COLS}x{self.ROWS}: {col}, {row}")

    def _grid_geometry(self) -> tuple[float, float, float]:
        scale = max(
            1 / self.TILE_PIXELS,
            min(
                self.width() / (self.COLS * self.TILE_PIXELS),
                self.height() / (self.ROWS * self.TILE_PIXELS),
            ),
        )
        tile = self.TILE_PIXELS * scale
        width, height = tile * self.COLS, tile * self.ROWS
        return tile, (self.width() - width) / 2, (self.height() - height) / 2

    def _cell_at(self, point: QPointF) -> tuple[int, int] | None:
        tile, left, top = self._grid_geometry()
        col = math.floor((point.x() - left) / tile)
        row = math.floor((point.y() - top) / tile)
        if 0 <= col < self.COLS and 0 <= row < self.ROWS:
            return col, row
        return None

    def cell_at_position(self, x: float, y: float) -> tuple[int, int] | None:
        """Map widget coordinates to a WORLD cell without scale rounding."""

        return self._cell_at(QPointF(x, y))

    def _cell_rect(self, col: int, row: int) -> QRectF:
        tile, left, top = self._grid_geometry()
        return QRectF(left + col * tile, top + row * tile, tile, tile)

    def _world_position(self, point: QPointF) -> tuple[int, int]:
        tile, left, top = self._grid_geometry()
        return max(0, min(255, int((point.x() - left) * 8 / tile))), max(0, min(239, int((point.y() - top) * 8 / tile)))

    def _entity_at(self, point: QPointF) -> int | None:
        x, y = self._world_position(point)
        for index in reversed(range(len(self._entities))):
            entity = self._entities[index]
            if abs(x - entity["x"]) <= 8 and abs(y - entity["y"]) <= 8:
                return index
        return None

    def paintEvent(self, _event) -> None:  # noqa: N802 - Qt API
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#080810"))
        tile, left, top = self._grid_geometry()
        for row, cells in enumerate(self._cells):
            for col, value in enumerate(cells):
                rect = QRectF(left + col * tile, top + row * tile, tile, tile)
                painter.fillRect(rect, self.NES_COLOURS[value % len(self.NES_COLOURS)])
        for entity in self._entities:
            rect = QRectF(left + entity["x"] * tile / 8 - tile / 2, top + entity["y"] * tile / 8 - tile / 2, tile, tile)
            painter.fillRect(rect, QColor("#f87878"))
            painter.setPen(QPen(QColor("#f8f8f8"), 1))
            painter.drawRect(rect)

        if self._show_grid:
            painter.setPen(QPen(QColor("#383858"), 1))
            for col in range(self.COLS + 1):
                x = left + col * tile
                painter.drawLine(QPointF(x, top), QPointF(x, top + self.ROWS * tile))
            for row in range(self.ROWS + 1):
                y = top + row * tile
                painter.drawLine(QPointF(left, y), QPointF(left + self.COLS * tile, y))
        if self._show_attributes:
            painter.setPen(QPen(QColor("#7878c8"), 2))
            for col in range(0, self.COLS + 1, 2):
                x = left + col * tile
                painter.drawLine(QPointF(x, top), QPointF(x, top + self.ROWS * tile))
            for row in range(0, self.ROWS + 1, 2):
                y = top + row * tile
                painter.drawLine(QPointF(left, y), QPointF(left + self.COLS * tile, y))

        highlight = self._hover if self._hover is not None else self._selected
        if highlight is not None:
            painter.setPen(QPen(QColor("#f8f8f8"), 2))
            painter.drawRect(self._cell_rect(*highlight).adjusted(1, 1, -1, -1))
        left, top, right, bottom = self._selection
        painter.setPen(QPen(QColor("#78d8d8"), 2))
        painter.drawRect(
            self._cell_rect(left, top).united(self._cell_rect(right, bottom)).adjusted(1, 1, -1, -1)
        )

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        if event.button() == Qt.MouseButton.LeftButton:
            cell = self._cell_at(event.position())
            if cell is not None:
                if self._tool == "select":
                    entity = self._entity_at(event.position())
                    if entity is not None:
                        self._drag_entity = entity
                        self.entity_selected.emit(entity)
                        return
                self._select_cell(*cell)
                if self._tool == "select":
                    self._selection_anchor = cell
                    self._set_selection(cell, cell)
                    return
                self.begin_stroke()
                self.edit_cell(*cell)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_entity = None
            self._selection_anchor = None
            self.end_stroke()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        cell = self._cell_at(event.position())
        if cell != self._hover:
            self._hover = cell
            self.update()
            if cell is not None:
                self.cursor_changed.emit(*cell)
        if cell is not None and event.buttons() & Qt.MouseButton.LeftButton:
            if self._drag_entity is not None:
                x, y = self._world_position(event.position())
                self._entities[self._drag_entity]["x"], self._entities[self._drag_entity]["y"] = x, y
                self.entity_moved.emit(self._drag_entity, x, y)
                self.update()
                return
            if self._tool == "select" and self._selection_anchor is not None:
                self._set_selection(self._selection_anchor, cell)
            else:
                self.edit_cell(*cell)

    def leaveEvent(self, _event) -> None:  # noqa: N802 - Qt API
        self._hover = None
        self.update()

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 - Qt API
        col, row = self._selected
        movement = {
            Qt.Key.Key_Left: (-1, 0),
            Qt.Key.Key_Right: (1, 0),
            Qt.Key.Key_Up: (0, -1),
            Qt.Key.Key_Down: (0, 1),
        }.get(event.key())
        if movement is not None:
            next_col = min(self.COLS - 1, max(0, col + movement[0]))
            next_row = min(self.ROWS - 1, max(0, row + movement[1]))
            self._select_cell(next_col, next_row)
            event.accept()
            return
        if event.key() in {Qt.Key.Key_Space, Qt.Key.Key_Return, Qt.Key.Key_Enter}:
            self.edit_cell(col, row)
            event.accept()
            return
        if event.key() == Qt.Key.Key_G:
            self.toggle_grid()
            event.accept()
            return
        if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
            if event.key() == Qt.Key.Key_C:
                self.copy_selection()
                event.accept()
                return
            if event.key() == Qt.Key.Key_V:
                self.paste_selection()
                event.accept()
                return
        super().keyPressEvent(event)
