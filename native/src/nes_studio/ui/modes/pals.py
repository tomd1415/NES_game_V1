"""PALS — choose authentic NES background and sprite colours."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ...render.palette import nes_qcolor
from ..widgets.visuals import (
    add_visual_choice,
    prepare_visual_selector,
    style_palette_control,
    swatch_style,
)
from .base import Level, Mode, ModeContext, scroll_body


class PalsMode(Mode):
    """The 64-colour NES master palette, and the eight 4-colour palettes.

    The hardware rules the editor has to teach, and therefore enforce:

    * **Background slot 0 is not free.** All four background palettes share one
      universal backdrop colour. Editing "BG2 colour 0" independently is not a
      thing the NES can do, so the editor shows the backdrop once and locks the
      per-palette slot 0.
    * **Sprite slot 0 is transparent.** It is not a colour at all.
    """

    id = "PALS"
    title = "PALS"
    help_text = "Choose authentic NES background and sprite colours."
    min_level = Level.BEGINNER

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("palsModePage")
        content = scroll_body(self, "paletteEditor")
        layout = QGridLayout(content)
        layout.setContentsMargins(18, 16, 18, 24)

        layout.addWidget(
            QLabel("BACKGROUND PALETTES — slot 0 uses the universal backdrop", content),
            0,
            0,
            1,
            5,
        )
        self.background_slot_zero: list[QPushButton] = []
        self.background_palette_controls: list[QSpinBox] = []
        for palette in range(4):
            layout.addWidget(QLabel(f"BG{palette}", content), palette + 1, 0)
            # Slot 0 is shown, so the four colours of a palette are visible as
            # four colours — but it is the shared backdrop, so it is not editable
            # here. It is edited once, in the dock.
            backdrop = QPushButton(content)
            backdrop.setObjectName(f"backgroundPalette{palette}Slot0")
            backdrop.setEnabled(False)
            backdrop.setFixedSize(42, 28)
            backdrop.setToolTip(
                "The universal backdrop — shared by all four background palettes. "
                "Change it under BACKDROP."
            )
            backdrop.setAccessibleName(f"Background palette {palette} slot 0 — the shared backdrop")
            self.background_slot_zero.append(backdrop)
            layout.addWidget(backdrop, palette + 1, 1)
            for slot in range(3):
                control = QSpinBox(content)
                control.setRange(0, 0x3F)
                control.setDisplayIntegerBase(16)
                control.setPrefix("0x")
                control.setObjectName(f"backgroundPalette{palette}Slot{slot + 1}")
                control.setAccessibleName(
                    f"Background palette {palette} colour slot {slot + 1}"
                )
                control.valueChanged.connect(
                    lambda value, palette=palette, slot=slot: self._set_background_slot(
                        palette, slot, value
                    )
                )
                style_palette_control(control, 0)
                self.background_palette_controls.append(control)
                layout.addWidget(control, palette + 1, slot + 2)

        layout.addWidget(
            QLabel("SPRITE PALETTES — slot 0 is transparent", content), 6, 0, 1, 5
        )
        self.sprite_palette_controls: list[QSpinBox] = []
        for palette in range(4):
            layout.addWidget(QLabel(f"SP{palette}", content), palette + 7, 0)
            transparent = QLabel("—", content)
            transparent.setObjectName(f"spritePalette{palette}Slot0")
            transparent.setAlignment(Qt.AlignmentFlag.AlignCenter)
            transparent.setToolTip("Sprite colour 0 is transparent — it shows the background.")
            transparent.setAccessibleName(f"Sprite palette {palette} slot 0 — transparent")
            layout.addWidget(transparent, palette + 7, 1)
            for slot in range(3):
                control = QSpinBox(content)
                control.setRange(0, 0x3F)
                control.setDisplayIntegerBase(16)
                control.setPrefix("0x")
                control.setObjectName(f"spritePalette{palette}Slot{slot + 1}")
                control.setAccessibleName(f"Sprite palette {palette} colour slot {slot + 1}")
                control.valueChanged.connect(
                    lambda value, palette=palette, slot=slot: self._set_sprite_slot(
                        palette, slot, value
                    )
                )
                style_palette_control(control, 0)
                self.sprite_palette_controls.append(control)
                layout.addWidget(control, palette + 7, slot + 2)

        layout.addWidget(QLabel("NES MASTER PALETTE", content), 11, 0, 1, 5)
        master = QGridLayout()
        master.setSpacing(3)
        self.master_palette_buttons: list[QPushButton] = []
        for colour in range(0x40):
            button = QPushButton(f"{colour:02X}", content)
            button.setObjectName(f"nesMasterColour{colour:02X}")
            button.setFixedSize(42, 28)
            button.setAccessibleName(f"Use NES colour {colour:02X} for the selected palette slot")
            button.setStyleSheet(swatch_style(colour))
            button.clicked.connect(
                lambda _checked=False, colour=colour: self.apply_colour(colour)
            )
            self.master_palette_buttons.append(button)
            master.addWidget(button, colour // 16, colour % 16)
        layout.addLayout(master, 12, 0, 1, 5)
        layout.setRowStretch(13, 1)

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        slot_label = QLabel("EDIT SLOT", dock)
        slot_label.setObjectName("sectionLabel")
        layout.addWidget(slot_label)
        self.palette_target = QComboBox(dock)
        self.palette_target.setObjectName("paletteTargetSelector")
        prepare_visual_selector(self.palette_target, "Palette slot to edit")
        for bank, prefix in (("bg", "BG"), ("sprite", "SP")):
            for palette in range(4):
                for slot in range(3):
                    add_visual_choice(
                        self.palette_target,
                        f"{prefix}{palette} · colour {slot + 1}",
                        (bank, palette, slot),
                        colour="#4878d8" if bank == "bg" else "#f87878",
                        glyph=prefix,
                    )
        layout.addWidget(self.palette_target)
        hint = QLabel("Pick a slot, then click a colour in the master palette.", dock)
        hint.setWordWrap(True)
        layout.addWidget(hint)

        backdrop_label = QLabel("BACKDROP", dock)
        backdrop_label.setObjectName("sectionLabel")
        layout.addWidget(backdrop_label)
        self.universal_background = QSpinBox(dock)
        self.universal_background.setObjectName("palsUniversalBackground")
        self.universal_background.setRange(0, 0x3F)
        self.universal_background.setDisplayIntegerBase(16)
        self.universal_background.setPrefix("0x")
        self.universal_background.setAccessibleName("Universal NES background colour")
        self.universal_background.valueChanged.connect(self._set_universal_background)
        layout.addWidget(self.universal_background)
        backdrop_hint = QLabel(
            "Every background palette shares this colour as its slot 0.", dock
        )
        backdrop_hint.setWordWrap(True)
        layout.addWidget(backdrop_hint)

        recent_label = QLabel("RECENT COLOURS", dock)
        recent_label.setObjectName("sectionLabel")
        layout.addWidget(recent_label)
        self.recent_row = QHBoxLayout()
        self.recent_row.setSpacing(3)
        self._recent_buttons: list[QPushButton] = []
        layout.addLayout(self.recent_row)

        usage_label = QLabel("WHERE THEY ARE USED", dock)
        usage_label.setObjectName("sectionLabel")
        layout.addWidget(usage_label)
        self.usage = QLabel(dock)
        self.usage.setObjectName("paletteUsage")
        self.usage.setWordWrap(True)
        layout.addWidget(self.usage)
        layout.addStretch(1)
        return dock

    # ---- refresh ----------------------------------------------------------

    def refresh(self) -> None:
        document = self.document
        for palette in range(4):
            self.background_slot_zero[palette].setStyleSheet(
                swatch_style(document.universal_background)
            )
            for slot, colour in enumerate(document.background_palette(palette)):
                control = self.background_palette_controls[palette * 3 + slot]
                control.blockSignals(True)
                control.setValue(colour)
                control.blockSignals(False)
                style_palette_control(control, colour)
            for slot, colour in enumerate(document.sprite_palette(palette)):
                control = self.sprite_palette_controls[palette * 3 + slot]
                control.blockSignals(True)
                control.setValue(colour)
                control.blockSignals(False)
                style_palette_control(control, colour)
        if self._dock is None:
            return
        self.universal_background.blockSignals(True)
        self.universal_background.setValue(document.universal_background)
        self.universal_background.blockSignals(False)
        self._refresh_recent()
        self._refresh_usage()

    def _refresh_recent(self) -> None:
        if self._dock is None:  # the recent row lives in the dock
            return
        while self._recent_buttons:
            button = self._recent_buttons.pop()
            self.recent_row.removeWidget(button)
            button.deleteLater()
        for colour in self.document.palette_recent_colours():
            button = QPushButton(f"{colour:02X}")
            button.setAccessibleName(f"Reuse recent NES colour {colour:02X}")
            button.setFixedSize(42, 28)
            button.setStyleSheet(swatch_style(colour))
            button.clicked.connect(
                lambda _checked=False, colour=colour: self.apply_colour(colour)
            )
            self._recent_buttons.append(button)
            self.recent_row.addWidget(button)

    def _refresh_usage(self) -> None:
        """Count where each palette is actually used.

        A palette nobody references is a palette the pupil can safely reuse —
        and one they have probably forgotten they set.
        """

        document = self.document
        background: dict[int, int] = {}
        for row in document.world_palettes():
            for value in row:
                background[int(value) & 3] = background.get(int(value) & 3, 0) + 1
        sprite: dict[int, int] = {}
        for entry in document.state.get("sprites") or []:
            if not isinstance(entry, dict):
                continue
            for row in entry.get("cells") or []:
                for cell in row if isinstance(row, list) else []:
                    if isinstance(cell, dict) and not cell.get("empty"):
                        index = int(cell.get("palette", 0)) & 3
                        sprite[index] = sprite.get(index, 0) + 1

        lines = []
        for palette in range(4):
            cells = background.get(palette, 0)
            lines.append(
                f"BG{palette}: {cells} cell{'' if cells == 1 else 's'}"
                + ("" if cells else "  ·  unused")
            )
        for palette in range(4):
            cells = sprite.get(palette, 0)
            lines.append(
                f"SP{palette}: {cells} sprite cell{'' if cells == 1 else 's'}"
                + ("" if cells else "  ·  unused")
            )
        self.usage.setText("\n".join(lines))

    # ---- edits ------------------------------------------------------------

    def _set_background_slot(self, palette: int, slot: int, colour: int) -> None:
        self.document.set_background_palette_slot(palette, slot, colour)
        self.document.remember_palette_colour(colour)
        style_palette_control(self.background_palette_controls[palette * 3 + slot], colour)
        self._refresh_recent()
        self.edited(f"BG{palette} palette slot {slot + 1} set to 0x{colour:02X}")

    def _set_sprite_slot(self, palette: int, slot: int, colour: int) -> None:
        self.document.set_sprite_palette_slot(palette, slot, colour)
        self.document.remember_palette_colour(colour)
        style_palette_control(self.sprite_palette_controls[palette * 3 + slot], colour)
        self._refresh_recent()
        self.edited(f"SP{palette} palette slot {slot + 1} set to 0x{colour:02X}")

    def _set_universal_background(self, colour: int) -> None:
        self.document.set_universal_background(colour)
        self.document.remember_palette_colour(colour)
        for button in self.background_slot_zero:
            button.setStyleSheet(swatch_style(colour))
        self._refresh_recent()
        self.edited(f"Universal backdrop set to 0x{colour:02X}")

    def apply_colour(self, colour: int) -> None:
        """Put `colour` into whichever slot the dock has selected."""

        self.dock()  # the target selector lives in the dock; make sure it exists
        target = self.palette_target.currentData()
        if not isinstance(target, tuple) or len(target) != 3:
            return
        bank, palette, slot = target
        controls = (
            self.background_palette_controls if bank == "bg" else self.sprite_palette_controls
        )
        controls[int(palette) * 3 + int(slot)].setValue(colour)

    def selected_slot(self) -> tuple[str, int, int] | None:
        target = self.palette_target.currentData()
        return target if isinstance(target, tuple) else None

    def select_slot(self, bank: str, palette: int, slot: int) -> None:
        """Point the editor at one slot — used by the validators' 'Fix in PALS →'.

        The index is computed, not searched: `QComboBox.findData()` round-trips a
        Python tuple through `QVariant` and does not reliably match it back, so it
        silently returned -1 and left the selection on whatever was there before.
        """

        self.dock()
        bank_offset = 0 if bank == "bg" else 12
        index = bank_offset + (palette & 3) * 3 + (slot % 3)
        if 0 <= index < self.palette_target.count():
            self.palette_target.setCurrentIndex(index)

    def colour_of(self, bank: str, palette: int, slot: int) -> int:
        controls = (
            self.background_palette_controls if bank == "bg" else self.sprite_palette_controls
        )
        return int(controls[palette * 3 + slot].value())

    def swatch(self, colour: int) -> str:
        return nes_qcolor(colour).name()
