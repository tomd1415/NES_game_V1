"""Phase-1 native application shell."""

from __future__ import annotations

from PySide6.QtGui import QAction
from PySide6.QtWidgets import QLabel, QMainWindow, QMenu, QMessageBox

from ..core.resources import ResourceLocator
from ..metadata import APP_DISPLAY_NAME, APP_VERSION
from .diagnostics import DiagnosticsDialog


class MainWindow(QMainWindow):
    """Minimal real Qt shell used to establish native application identity."""

    def __init__(self, resource_locator: ResourceLocator) -> None:
        super().__init__()
        self._resource_locator = resource_locator
        self._diagnostics: DiagnosticsDialog | None = None

        self.setObjectName("mainWindow")
        self.setWindowTitle(APP_DISPLAY_NAME)
        self.resize(1120, 720)
        self._create_menus()

        welcome = QLabel(
            "NES Studio native shell\n\n"
            "The project model and editors will be added in later vertical slices.",
            self,
        )
        welcome.setObjectName("nativeShellWelcome")
        welcome.setAccessibleName("NES Studio native development shell")
        welcome.setStyleSheet("font-size: 18px; padding: 32px;")
        self.setCentralWidget(welcome)
        self.statusBar().showMessage("Native shell ready")

    def _create_menus(self) -> None:
        file_menu = self.menuBar().addMenu("&File")
        self._add_placeholder(file_menu, "&New Project")
        self._add_placeholder(file_menu, "&Open Project…")
        self._add_placeholder(file_menu, "Export &ROM…")
        file_menu.addSeparator()
        exit_action = QAction("E&xit", self)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        edit_menu = self.menuBar().addMenu("&Edit")
        self._add_placeholder(edit_menu, "&Undo")
        self._add_placeholder(edit_menu, "&Redo")

        view_menu = self.menuBar().addMenu("&View")
        diagnostics_action = QAction("&Diagnostics…", self)
        diagnostics_action.triggered.connect(self._show_diagnostics)
        view_menu.addAction(diagnostics_action)

        build_menu = self.menuBar().addMenu("&Build")
        self._add_placeholder(build_menu, "&Build ROM")
        self._add_placeholder(build_menu, "&Play")

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
