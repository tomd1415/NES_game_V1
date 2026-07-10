"""Native Qt-painted WORLD editing surface."""

from __future__ import annotations

from PySide6.QtCore import QPoint, QRect, QSize, Qt, Signal
from PySide6.QtGui import QColor, QMouseEvent, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget


class WorldCanvas(QWidget):
    """Paint a small tile-index model without browser or server dependencies."""

    COLS = 32
    ROWS = 30
    NES_COLOURS = (
        QColor("#181828"),
        QColor("#4878d8"),
        QColor("#78d878"),
        QColor("#f8d878"),
    )

    cell_changed = Signal(int, int, int)
    cursor_changed = Signal(int, int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("worldCanvas")
        self.setAccessibleName("Editable NES world canvas")
        self.setAccessibleDescription("A 32 by 30 tile screen; use Paint or Erase and drag over cells")
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self._cells = [[0 for _ in range(self.COLS)] for _ in range(self.ROWS)]
        self._tool = "select"
        self._paint_value = 1
        self._hover: tuple[int, int] | None = None
        self._seed_preview()

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
        if tool not in {"select", "paint", "erase"}:
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

    def edit_cell(self, col: int, row: int) -> bool:
        """Apply the active tool; return whether the model changed."""

        self._validate_cell(col, row)
        if self._tool == "select":
            return False
        value = self._paint_value if self._tool == "paint" else 0
        if self._cells[row][col] == value:
            return False
        self._cells[row][col] = value
        self.cell_changed.emit(col, row, value)
        self.update(self._cell_rect(col, row))
        return True

    def _validate_cell(self, col: int, row: int) -> None:
        if not 0 <= col < self.COLS or not 0 <= row < self.ROWS:
            raise IndexError(f"WORLD cell outside {self.COLS}x{self.ROWS}: {col}, {row}")

    def _grid_geometry(self) -> tuple[int, int, int]:
        tile = max(1, min(self.width() // self.COLS, self.height() // self.ROWS))
        width, height = tile * self.COLS, tile * self.ROWS
        return tile, (self.width() - width) // 2, (self.height() - height) // 2

    def _cell_at(self, point: QPoint) -> tuple[int, int] | None:
        tile, left, top = self._grid_geometry()
        col, row = (point.x() - left) // tile, (point.y() - top) // tile
        if 0 <= col < self.COLS and 0 <= row < self.ROWS:
            return col, row
        return None

    def _cell_rect(self, col: int, row: int) -> QRect:
        tile, left, top = self._grid_geometry()
        return QRect(left + col * tile, top + row * tile, tile, tile)

    def paintEvent(self, _event) -> None:  # noqa: N802 - Qt API
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#080810"))
        tile, left, top = self._grid_geometry()
        for row, cells in enumerate(self._cells):
            for col, value in enumerate(cells):
                rect = QRect(left + col * tile, top + row * tile, tile, tile)
                painter.fillRect(rect, self.NES_COLOURS[value])

        painter.setPen(QPen(QColor("#383858"), 1))
        for col in range(self.COLS + 1):
            x = left + col * tile
            painter.drawLine(x, top, x, top + self.ROWS * tile)
        for row in range(self.ROWS + 1):
            y = top + row * tile
            painter.drawLine(left, y, left + self.COLS * tile, y)

        if self._hover is not None:
            painter.setPen(QPen(QColor("#f8f8f8"), 2))
            painter.drawRect(self._cell_rect(*self._hover).adjusted(1, 1, -1, -1))

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        if event.button() == Qt.MouseButton.LeftButton:
            cell = self._cell_at(event.position().toPoint())
            if cell is not None:
                self.edit_cell(*cell)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        cell = self._cell_at(event.position().toPoint())
        if cell != self._hover:
            self._hover = cell
            self.update()
            if cell is not None:
                self.cursor_changed.emit(*cell)
        if cell is not None and event.buttons() & Qt.MouseButton.LeftButton:
            self.edit_cell(*cell)

    def leaveEvent(self, _event) -> None:  # noqa: N802 - Qt API
        self._hover = None
        self.update()
