"""Paint a whole character, not one 8x8 tile at a time.

Native's CHARS had **no drawing canvas at all** — you edited one cell of a
character through four spin boxes, and to change a pixel you left for TILES and
found the right 8x8 slot yourself. A pupil drawing a 2x2 hero had to hold the
mapping from "the hero's left boot" to "sprite tile 0x1B" in their head.

This canvas draws the metasprite as the game will draw it, and paints straight
through to whichever tile owns the pixel under the cursor. Cell flips are
honoured in both directions: paint on a flipped cell and the pixel lands where
you drew it.
"""

from __future__ import annotations

import math

from PySide6.QtCore import QPoint, QPointF, QRectF, QSize, Qt, Signal
from PySide6.QtGui import QColor, QImage, QMouseEvent, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget

TILE = 8


class SpriteCanvas(QWidget):
    """The character, drawn big, painted per pixel.

    Emits intent — `pixel_painted`, `cell_selected` — and never touches the
    document. The mode owns the document; the canvas owns the interaction.
    """

    #: (cell_x, cell_y, x within the tile, y within the tile)
    pixel_painted = Signal(int, int, int, int)
    cell_selected = Signal(int, int)
    stroke_began = Signal()
    stroke_ended = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("spriteCanvas")
        self.setAccessibleName("Character drawing canvas")
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self._image: QImage | None = None
        self._columns = 1
        self._rows = 1
        self._selected = (0, 0)
        self._hover: tuple[int, int] | None = None
        self._painting = False
        self._show_grid = True
        self._tool = "pencil"

    # ---- state ------------------------------------------------------------

    def set_sprite(self, image: QImage | None, columns: int, rows: int) -> None:
        self._image = image
        self._columns = max(1, columns)
        self._rows = max(1, rows)
        column, row = self._selected
        self._selected = (min(column, self._columns - 1), min(row, self._rows - 1))
        self.update()

    def set_tool(self, tool: str) -> None:
        if tool not in {"pencil", "fill", "picker"}:
            raise ValueError(f"Unknown CHARS tool: {tool}")
        self._tool = tool
        self.setCursor(
            Qt.CursorShape.ArrowCursor if tool == "picker" else Qt.CursorShape.CrossCursor
        )

    @property
    def tool(self) -> str:
        return self._tool

    @property
    def selected_cell(self) -> tuple[int, int]:
        return self._selected

    def select_cell(self, column: int, row: int) -> None:
        column = max(0, min(self._columns - 1, column))
        row = max(0, min(self._rows - 1, row))
        if (column, row) != self._selected:
            self._selected = (column, row)
            self.cell_selected.emit(column, row)
        self.update()

    def set_show_grid(self, show: bool) -> None:
        self._show_grid = show
        self.update()

    def sizeHint(self) -> QSize:  # noqa: N802 - Qt API
        return QSize(320, 320)

    # ---- geometry ---------------------------------------------------------

    def _geometry(self) -> tuple[float, float, float]:
        """(pixel size, left, top) for a centred, aspect-correct character."""

        width = self._columns * TILE
        height = self._rows * TILE
        size = max(1.0, min(self.width() / width, self.height() / height))
        return size, (self.width() - width * size) / 2, (self.height() - height * size) / 2

    def pixel_centre(self, x: int, y: int) -> QPoint:
        """Where in the widget one pixel of the character is drawn.

        The inverse of `_pixel_at`, so a test can click the pixel it means to.
        """

        size, left, top = self._geometry()
        return QPointF(left + (x + 0.5) * size, top + (y + 0.5) * size).toPoint()

    def _pixel_at(self, point: QPointF) -> tuple[int, int] | None:
        size, left, top = self._geometry()
        x = math.floor((point.x() - left) / size)
        y = math.floor((point.y() - top) / size)
        if 0 <= x < self._columns * TILE and 0 <= y < self._rows * TILE:
            return x, y
        return None

    # ---- painting ---------------------------------------------------------

    def paintEvent(self, _event) -> None:  # noqa: N802 - Qt API
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#101018"))
        size, left, top = self._geometry()
        width = self._columns * TILE * size
        height = self._rows * TILE * size

        # A checkerboard behind the art: sprite colour 0 is *transparent*, and a
        # pupil has to be able to see the difference between "transparent" and
        # "black".
        square = max(4.0, size)
        rows = int(math.ceil(height / square))
        columns = int(math.ceil(width / square))
        for row in range(rows):
            for column in range(columns):
                shade = "#232338" if (row + column) % 2 else "#1a1a2c"
                painter.fillRect(
                    QRectF(
                        left + column * square,
                        top + row * square,
                        min(square, width - column * square),
                        min(square, height - row * square),
                    ),
                    QColor(shade),
                )

        if self._image is not None and not self._image.isNull():
            painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
            painter.drawImage(QRectF(left, top, width, height), self._image)

        if self._show_grid and size >= 4:
            painter.setPen(QPen(QColor("#2e2e4e"), 1))
            for x in range(self._columns * TILE + 1):
                position = left + x * size
                painter.drawLine(QPointF(position, top), QPointF(position, top + height))
            for y in range(self._rows * TILE + 1):
                position = top + y * size
                painter.drawLine(QPointF(left, position), QPointF(left + width, position))

        # The cell boundaries are the thing that matters: each is one 8x8 tile,
        # and a tile is the unit the NES actually stores.
        painter.setPen(QPen(QColor("#7878c8"), 2))
        for column in range(self._columns + 1):
            position = left + column * TILE * size
            painter.drawLine(QPointF(position, top), QPointF(position, top + height))
        for row in range(self._rows + 1):
            position = top + row * TILE * size
            painter.drawLine(QPointF(left, position), QPointF(left + width, position))

        column, row = self._selected
        painter.setPen(QPen(QColor("#f8d878"), 3))
        painter.drawRect(
            QRectF(
                left + column * TILE * size,
                top + row * TILE * size,
                TILE * size,
                TILE * size,
            ).adjusted(1, 1, -1, -1)
        )

        if self._hover is not None:
            painter.setPen(QPen(QColor("#f8f8f8"), 1))
            painter.drawRect(
                QRectF(left + self._hover[0] * size, top + self._hover[1] * size, size, size)
            )

    # ---- interaction ------------------------------------------------------

    def _paint_at(self, point: QPointF) -> None:
        pixel = self._pixel_at(point)
        if pixel is None:
            return
        x, y = pixel
        self.pixel_painted.emit(x // TILE, y // TILE, x % TILE, y % TILE)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        if event.button() != Qt.MouseButton.LeftButton:
            return
        pixel = self._pixel_at(event.position())
        if pixel is None:
            return
        self.select_cell(pixel[0] // TILE, pixel[1] // TILE)
        if self._tool == "picker":
            return
        self._painting = True
        self.stroke_began.emit()
        self._paint_at(event.position())

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        pixel = self._pixel_at(event.position())
        if pixel != self._hover:
            self._hover = pixel
            self.update()
        if self._painting and self._tool == "pencil":
            self._paint_at(event.position())

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        if event.button() == Qt.MouseButton.LeftButton and self._painting:
            self._painting = False
            self.stroke_ended.emit()

    def leaveEvent(self, _event) -> None:  # noqa: N802 - Qt API
        self._hover = None
        self.update()

    def keyPressEvent(self, event) -> None:  # noqa: N802 - Qt API
        column, row = self._selected
        movement = {
            Qt.Key.Key_Left: (-1, 0),
            Qt.Key.Key_Right: (1, 0),
            Qt.Key.Key_Up: (0, -1),
            Qt.Key.Key_Down: (0, 1),
        }.get(event.key())
        if movement is not None:
            self.select_cell(column + movement[0], row + movement[1])
            event.accept()
            return
        super().keyPressEvent(event)
