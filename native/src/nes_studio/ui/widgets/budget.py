"""A budget meter — how much of a fixed NES limit the project has spent.

The NES is a machine of hard ceilings: 256 background tiles, 256 sprite tiles,
64 hardware sprites in OAM, 32 KB of cartridge. The web shows these as live
meters, so a pupil learns the limit exists *before* they hit it. Native showed
nothing at all.

Colour follows the same three-band rule the web uses: comfortable, tight, over.
`over` is a real state, not a warning — a project past a hardware limit will not
render as drawn.
"""

from __future__ import annotations

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import QSizePolicy, QWidget

#: Sourced from the NES system palette, as the web's chrome is.
COMFORTABLE = "#78d878"  # NES $2A
TIGHT = "#f8d878"  # NES $28
OVER = "#f87878"  # NES $16
TRACK = "#292949"
TEXT = "#f8f8f8"

#: Above this fraction of the limit the meter turns amber.
TIGHT_AT = 0.8


class BudgetMeter(QWidget):
    """`label  used/limit` over a proportional bar."""

    def __init__(self, label: str, limit: int, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._label = label
        self._limit = max(1, int(limit))
        self._used = 0
        self._suffix = ""
        self.setMinimumHeight(34)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._update_accessible_text()

    def set_used(self, used: int) -> None:
        used = max(0, int(used))
        if used == self._used:
            return
        self._used = used
        self._update_accessible_text()
        self.update()

    def set_limit(self, limit: int) -> None:
        self._limit = max(1, int(limit))
        self._update_accessible_text()
        self.update()

    @property
    def used(self) -> int:
        return self._used

    @property
    def fraction(self) -> float:
        return self._used / self._limit

    @property
    def is_over(self) -> bool:
        return self._used > self._limit

    def colour(self) -> str:
        if self.is_over:
            return OVER
        if self.fraction >= TIGHT_AT:
            return TIGHT
        return COMFORTABLE

    def _update_accessible_text(self) -> None:
        self.setAccessibleName(f"{self._label} budget")
        state = "over the limit" if self.is_over else f"{round(self.fraction * 100)}% used"
        self.setAccessibleDescription(
            f"{self._label}: {self._used} of {self._limit} — {state}"
        )
        self.setToolTip(self.accessibleDescription())

    def text(self) -> str:
        return f"{self._label}  {self._used:,} / {self._limit:,}"

    def paintEvent(self, _event) -> None:  # noqa: N802 - Qt API
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, False)

        bar = QRectF(0, self.height() - 10, self.width(), 8)
        painter.fillRect(bar, QColor(TRACK))
        filled = min(1.0, self.fraction) * self.width()
        painter.fillRect(QRectF(0, bar.top(), filled, bar.height()), QColor(self.colour()))

        painter.setPen(QColor(TEXT))
        painter.drawText(
            QRectF(0, 0, self.width(), self.height() - 12),
            int(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter),
            self.text(),
        )
        painter.setPen(QColor(self.colour()))
        painter.drawText(
            QRectF(0, 0, self.width(), self.height() - 12),
            int(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter),
            "OVER" if self.is_over else f"{round(self.fraction * 100)}%",
        )
