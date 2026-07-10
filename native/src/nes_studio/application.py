"""Qt application lifecycle."""

from __future__ import annotations

from collections.abc import Sequence

from PySide6.QtCore import QCoreApplication
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QApplication

from .core.resources import ResourceLocator
from .metadata import (
    APP_DISPLAY_NAME,
    APP_ID,
    APP_VERSION,
    ORGANIZATION_DOMAIN,
    ORGANIZATION_NAME,
)
from .ui.main_window import MainWindow


def create_application(argv: Sequence[str]) -> QApplication:
    """Create or return the process-wide Qt application instance."""

    existing = QApplication.instance()
    if existing is not None:
        return existing

    QCoreApplication.setOrganizationName(ORGANIZATION_NAME)
    QCoreApplication.setOrganizationDomain(ORGANIZATION_DOMAIN)
    QCoreApplication.setApplicationName(APP_DISPLAY_NAME)
    QCoreApplication.setApplicationVersion(APP_VERSION)

    application = QApplication(list(argv))
    QGuiApplication.setDesktopFileName(APP_ID)
    application.setApplicationDisplayName(APP_DISPLAY_NAME)
    return application


def run(argv: Sequence[str]) -> int:
    """Run the native shell without starting a server or browser."""

    application = create_application(argv)
    window = MainWindow(ResourceLocator.discover())
    window.show()
    return application.exec()
