"""Read-only diagnostics for paths, versions and resource discovery."""

from __future__ import annotations

import platform
import sys

from PySide6 import __version__ as pyside_version
from PySide6.QtCore import QLibraryInfo, QStandardPaths, Qt
from PySide6.QtWidgets import QDialog, QDialogButtonBox, QPlainTextEdit, QVBoxLayout, QWidget

from ..core.resources import ResourceLocator
from ..metadata import APP_ID, APP_VERSION


def build_diagnostics(locator: ResourceLocator) -> str:
    """Return a copy-friendly diagnostic report without exposing secrets."""

    missing = locator.missing_required()
    lines = [
        f"Application ID: {APP_ID}",
        f"Application version: {APP_VERSION}",
        f"Python: {platform.python_version()} ({sys.executable})",
        f"PySide6: {pyside_version}",
        f"Qt: {QLibraryInfo.version().toString()}",
        f"Platform: {platform.platform()}",
        f"Resource root: {locator.root}",
        f"Source checkout: {locator.source_checkout}",
        f"Engines: {locator.engines_dir}",
        f"Playground: {locator.playground_dir}",
        f"Data: {QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppDataLocation)}",
        f"Config: {QStandardPaths.writableLocation(QStandardPaths.StandardLocation.AppConfigLocation)}",
        f"Cache: {QStandardPaths.writableLocation(QStandardPaths.StandardLocation.CacheLocation)}",
        "Missing required resources: " + (", ".join(str(path) for path in missing) or "none"),
    ]
    return "\n".join(lines)


class DiagnosticsDialog(QDialog):
    """Display environment diagnostics without modifying the system."""

    def __init__(self, locator: ResourceLocator, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("NES Studio Diagnostics")
        self.setMinimumSize(720, 420)

        report = QPlainTextEdit(build_diagnostics(locator), self)
        report.setReadOnly(True)
        report.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        report.setAccessibleName("Application diagnostics")

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Close, parent=self)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.addWidget(report)
        layout.addWidget(buttons, alignment=Qt.AlignmentFlag.AlignRight)
