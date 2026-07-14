"""The screen, full size, with nothing else on it.

A 32x30 grid of 8x8 cells inside a dock-flanked stage is small. Sometimes you
just want to see the picture.
"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication, QImage, QKeyEvent
from PySide6.QtWidgets import QVBoxLayout, QWidget

from ...render.screen import NesScreen


class FullscreenPreview(QWidget):
    """A borderless window showing one rendered NES screen. Escape closes it."""

    def __init__(self, image: QImage, parent: QWidget | None = None) -> None:
        super().__init__(parent, Qt.WindowType.Window)
        self.setObjectName("fullscreenPreview")
        self.setWindowTitle("WORLD preview")
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.setStyleSheet("background: #080810;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.screen = NesScreen(self)
        self.screen.set_frame(image)
        layout.addWidget(self.screen)

        screen = QGuiApplication.primaryScreen()
        if screen is not None:
            self.resize(screen.availableGeometry().size())

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 - Qt API
        if event.key() in {Qt.Key.Key_Escape, Qt.Key.Key_F11}:
            self.close()
            return
        super().keyPressEvent(event)
