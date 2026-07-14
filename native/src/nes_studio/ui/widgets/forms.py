"""Cards and labelled fields.

RULES was forty controls in one flat column, each labelled by abusing
`QSpinBox.setPrefix()` — so "Racer laps" was *inside* the spin box, rendered as
part of its value, unreachable to a screen reader as a label and impossible to
align. And every racer field was shown in a platformer, where it does nothing.

A `Card` groups related settings under a heading and can hide itself wholesale
when the game type does not use it.
"""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QFormLayout,
    QFrame,
    QLabel,
    QVBoxLayout,
    QWidget,
)


class Card(QFrame):
    """A titled group of settings."""

    def __init__(self, title: str, subtitle: str = "", parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setObjectName("settingsCard")
        self.setFrameShape(QFrame.Shape.NoFrame)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(14, 12, 14, 14)
        outer.setSpacing(6)

        heading = QLabel(title, self)
        heading.setObjectName("cardTitle")
        outer.addWidget(heading)

        if subtitle:
            note = QLabel(subtitle, self)
            note.setObjectName("cardSubtitle")
            note.setWordWrap(True)
            outer.addWidget(note)

        self.form = QFormLayout()
        self.form.setLabelAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.form.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.ExpandingFieldsGrow)
        self.form.setHorizontalSpacing(12)
        self.form.setVerticalSpacing(6)
        outer.addLayout(self.form)

    def field(self, label: str, control: QWidget, *, hint: str = "") -> QWidget:
        """Add a control under a real label — not a spin-box prefix."""

        caption = QLabel(label, self)
        caption.setObjectName("fieldLabel")
        caption.setBuddy(control)
        if not control.accessibleName():
            control.setAccessibleName(label)
        if hint:
            control.setToolTip(hint)
            caption.setToolTip(hint)
        self.form.addRow(caption, control)
        return control

    def wide(self, control: QWidget) -> QWidget:
        """Add a control that is its own label — a checkbox, or a note."""

        self.form.addRow(control)
        return control

    def toggle(self, text: str, *, hint: str = "") -> QCheckBox:
        control = QCheckBox(text, self)
        if hint:
            control.setToolTip(hint)
        self.form.addRow(control)
        return control
