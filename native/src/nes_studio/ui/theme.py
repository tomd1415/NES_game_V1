"""Load the theme, and the accessibility preferences that bend it.

The theme lives in `resources/theme.qss`, not in a Python string. It is applied
to the **application**, not the window: a `QDialog` is a top-level window and
does not inherit a `QMainWindow` stylesheet, so setting it on the window left
every dialog rendering as light-on-light default Qt chrome.
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib import resources

from PySide6.QtCore import QSettings
from PySide6.QtGui import QFont
from PySide6.QtWidgets import QApplication

#: Text scales offered in Preferences. 1.0 is the design size.
TEXT_SCALES: tuple[tuple[str, float], ...] = (
    ("Normal", 1.0),
    ("Large (125%)", 1.25),
    ("Larger (150%)", 1.5),
    ("Largest (200%)", 2.0),
)

#: Raises every contrast ratio in the chrome above 7:1, and thickens the focus
#: ring, for pupils who cannot pick a dim border out of a dark panel.
HIGH_CONTRAST_QSS = """
QMainWindow, #studioWorkspace, #stagePanel { background: #000000; }
#contextDock, #contextDockContent, #questPanel, #modeRail, #appBar { background: #000000; }
QLabel, #modeHelp, #cardSubtitle, #fieldLabel { color: #ffffff; }
#sectionLabel, #cardTitle, #modeTitle, #brandLabel { color: #ffff00; }
QPushButton { background: #000000; color: #ffffff; border: 2px solid #ffffff; }
QPushButton:hover { background: #303030; }
QPushButton:checked, #modeRail QPushButton:checked { background: #ffffff; color: #000000; }
QSpinBox, QComboBox, QLineEdit, QPlainTextEdit { background: #000000; color: #ffffff; border: 2px solid #ffffff; }
QSpinBox:focus, QComboBox:focus, QLineEdit:focus, QPlainTextEdit:focus { border: 3px solid #ffff00; }
QListWidget { background: #000000; border: 2px solid #ffffff; }
QListWidget::item:selected { background: #ffffff; color: #000000; }
#settingsCard { background: #000000; border: 2px solid #ffffff; }
"""


@dataclass(frozen=True)
class Accessibility:
    """What the pupil (or their teacher) asked the interface to do."""

    text_scale: float = 1.0
    high_contrast: bool = False
    #: The emulator's flashing is the one thing in the app that can trigger a
    #: photosensitive response, and a school cannot know in advance who is
    #: affected.
    reduce_flashing: bool = False

    @classmethod
    def load(cls, settings: QSettings | None = None) -> "Accessibility":
        settings = settings or QSettings()
        return cls(
            text_scale=float(settings.value("accessibility/textScale", 1.0)),
            high_contrast=_as_bool(settings.value("accessibility/highContrast", False)),
            reduce_flashing=_as_bool(settings.value("accessibility/reduceFlashing", False)),
        )

    def save(self, settings: QSettings | None = None) -> None:
        settings = settings or QSettings()
        settings.setValue("accessibility/textScale", self.text_scale)
        settings.setValue("accessibility/highContrast", self.high_contrast)
        settings.setValue("accessibility/reduceFlashing", self.reduce_flashing)


def _as_bool(value: object) -> bool:
    # QSettings round-trips booleans as the strings "true"/"false" on some
    # backends, and bool("false") is True.
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes"}


def theme_qss() -> str:
    return (
        resources.files("nes_studio.resources").joinpath("theme.qss").read_text(encoding="utf-8")
    )


#: The application's own default text size, captured before we ever scale it.
#: Scaling the *current* font would compound every time the preference changed.
_base_point_size: float | None = None


def apply_theme(application: QApplication, preferences: Accessibility | None = None) -> None:
    """Style the whole application, honouring the accessibility preferences."""

    global _base_point_size

    preferences = preferences or Accessibility()
    stylesheet = theme_qss()
    if preferences.high_contrast:
        stylesheet += HIGH_CONTRAST_QSS

    if _base_point_size is None:
        size = application.font().pointSizeF()
        _base_point_size = size if size > 0 else 10.0
    font = QFont(application.font())
    font.setPointSizeF(_base_point_size * preferences.text_scale)
    application.setFont(font)
    application.setStyleSheet(stylesheet)
