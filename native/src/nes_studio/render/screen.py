"""A widget that shows a 256x240 NES frame at integer scale."""

from __future__ import annotations

from PySide6.QtCore import QRectF, Qt, Signal
from PySide6.QtGui import QColor, QImage, QMouseEvent, QPainter
from PySide6.QtWidgets import QSizePolicy, QWidget

SCREEN_WIDTH = 256
SCREEN_HEIGHT = 240


class NesScreen(QWidget):
    """Displays an NES frame — whether edited or emulated.

    Deliberately dumb: it owns no document and no emulator. Whoever has the
    pixels calls `set_frame()`. That is what lets the same widget serve the
    live editor and the running game, which is the point of the CRT stage.
    """

    hovered = Signal(int, int)  # tile x, y — or (-1, -1) when the cursor leaves
    clicked = Signal(int, int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("nesScreenView")
        self.setAccessibleName("NES screen")
        self.setMouseTracking(True)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self._frame: QImage | None = None

    def set_frame(self, image: QImage | None) -> None:
        self._frame = image
        self.update()

    def frame(self) -> QImage | None:
        return self._frame

    def _geometry(self) -> tuple[float, float, float]:
        """Return (scale, left, top) for a centred, aspect-correct screen."""

        scale = min(self.width() / SCREEN_WIDTH, self.height() / SCREEN_HEIGHT)
        scale = max(scale, 0.0)
        left = (self.width() - SCREEN_WIDTH * scale) / 2
        top = (self.height() - SCREEN_HEIGHT * scale) / 2
        return scale, left, top

    def _tile_at(self, event: QMouseEvent) -> tuple[int, int] | None:
        scale, left, top = self._geometry()
        if scale <= 0:
            return None
        x = int((event.position().x() - left) / scale) // 8
        y = int((event.position().y() - top) / scale) // 8
        if 0 <= x < SCREEN_WIDTH // 8 and 0 <= y < SCREEN_HEIGHT // 8:
            return x, y
        return None

    def paintEvent(self, _event) -> None:  # noqa: N802 - Qt API
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#080810"))
        if self._frame is None or self._frame.isNull():
            return
        # Nearest-neighbour: smoothing turns pixel art to mush.
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
        scale, left, top = self._geometry()
        painter.drawImage(
            QRectF(left, top, SCREEN_WIDTH * scale, SCREEN_HEIGHT * scale), self._frame
        )

    def mouseMoveEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        cell = self._tile_at(event)
        self.hovered.emit(*(cell if cell else (-1, -1)))

    def leaveEvent(self, _event) -> None:  # noqa: N802 - Qt API
        self.hovered.emit(-1, -1)

    def mousePressEvent(self, event: QMouseEvent) -> None:  # noqa: N802 - Qt API
        cell = self._tile_at(event)
        if cell is not None:
            self.clicked.emit(*cell)
