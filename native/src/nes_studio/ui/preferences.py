"""Accessibility preferences.

A school gets one image on every machine and a class it does not choose. The
three settings here are the ones that decide whether a pupil can use the Studio
at all: how big the text is, whether the chrome has enough contrast to see, and
whether the screen is allowed to flash.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QLabel,
    QVBoxLayout,
    QWidget,
)

from .theme import TEXT_SCALES, Accessibility


class PreferencesDialog(QDialog):
    """Text scale, high contrast, reduced flashing."""

    def __init__(self, preferences: Accessibility, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("preferencesDialog")
        self.setWindowTitle("Preferences")
        self.setMinimumWidth(460)

        layout = QVBoxLayout(self)

        layout.addWidget(QLabel("Text size", self))
        self.text_scale = QComboBox(self)
        self.text_scale.setObjectName("textScaleSelector")
        self.text_scale.setAccessibleName("Text size")
        for label, scale in TEXT_SCALES:
            self.text_scale.addItem(label, scale)
        chosen = self.text_scale.findData(preferences.text_scale)
        self.text_scale.setCurrentIndex(chosen if chosen >= 0 else 0)
        layout.addWidget(self.text_scale)

        self.high_contrast = QCheckBox("High contrast", self)
        self.high_contrast.setObjectName("highContrastToggle")
        self.high_contrast.setChecked(preferences.high_contrast)
        self.high_contrast.setToolTip(
            "Black background, white text, thick focus outlines."
        )
        layout.addWidget(self.high_contrast)

        self.reduce_flashing = QCheckBox("Reduce flashing in the game", self)
        self.reduce_flashing.setObjectName("reduceFlashingToggle")
        self.reduce_flashing.setChecked(preferences.reduce_flashing)
        self.reduce_flashing.setToolTip(
            "Smooths rapid full-screen brightness changes while a game is playing."
        )
        layout.addWidget(self.reduce_flashing)

        note = QLabel(
            "A game a pupil writes can flash the whole screen — that is what the "
            "hardware does. This damps it without changing the ROM.",
            self,
        )
        note.setWordWrap(True)
        layout.addWidget(note)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel, self
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

    def preferences(self) -> Accessibility:
        return Accessibility(
            text_scale=float(self.text_scale.currentData() or 1.0),
            high_contrast=self.high_contrast.isChecked(),
            reduce_flashing=self.reduce_flashing.isChecked(),
        )
