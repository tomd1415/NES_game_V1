"""Shared visual helpers: icons for selectors, swatches, tile and sprite thumbs.

These were methods on `MainWindow`, which meant a mode could only draw a tile
thumbnail by reaching back into the shell. They are pure functions of the
document, so they live here.
"""

from __future__ import annotations

from PySide6.QtCore import QRect, Qt
from PySide6.QtGui import QColor, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import QComboBox, QSpinBox

from ...core.project_document import ProjectDocument
from ...render.framebuffer import render_background_tile, render_sprite, render_sprite_tile
from ...render.palette import is_light, nes_qcolor


def choice_icon(colour: str, glyph: str = "") -> QIcon:
    """A compact, NES-like visual marker for a selector choice."""

    pixmap = QPixmap(28, 20)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setPen(QColor("#080810"))
    painter.setBrush(QColor(colour))
    painter.drawRoundedRect(1, 1, 26, 18, 3, 3)
    # Small square pixels retain the Studio's 8-bit character even where no glyph fits.
    painter.setBrush(QColor("#f8f8f8"))
    painter.drawRect(4, 5, 3, 3)
    painter.drawRect(9, 11, 3, 3)
    if glyph:
        painter.setPen(QColor("#080810"))
        painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, glyph[:2].upper())
    painter.end()
    return QIcon(pixmap)


def add_visual_choice(
    selector: QComboBox, label: str, value: object = None, *, colour: str, glyph: str = ""
) -> None:
    """Add a labelled choice with an icon; the label still reaches screen readers."""

    selector.addItem(choice_icon(colour, glyph), label, value)


def prepare_visual_selector(selector: QComboBox, accessible_name: str) -> None:
    selector.setIconSize(QPixmap(28, 20).size())
    selector.setMinimumHeight(34)
    selector.setAccessibleName(accessible_name)


def style_palette_control(control: QSpinBox, colour: int) -> None:
    """Give a numeric NES palette entry a readable live colour swatch."""

    swatch = nes_qcolor(colour)
    text = "#080810" if is_light(colour) else "#f8f8f8"
    control.setStyleSheet(
        f"QSpinBox {{ background: {swatch.name()}; color: {text}; "
        "border: 2px solid #f8f8f8; font-weight: 800; padding: 4px; }"
    )


def swatch_style(colour: int) -> str:
    """The stylesheet for a button that *is* an NES colour."""

    return (
        f"background: {nes_qcolor(colour).name()}; "
        f"color: {'#080810' if is_light(colour) else '#f8f8f8'}; font-weight: 800; padding: 0;"
    )


def tile_thumbnail(
    document: ProjectDocument, tile_index: int, *, bank: str = "bg", palette: int = 0
) -> QIcon:
    """Render an 8x8 tile into a library thumbnail, in its real colours."""

    renderer = render_background_tile if bank == "bg" else render_sprite_tile
    image = renderer(document, tile_index, palette)
    pixmap = QPixmap(20, 20)
    pixmap.fill(QColor("#080810"))
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
    painter.drawImage(QRect(2, 2, 16, 16), image)
    painter.setPen(QColor("#7878c8"))
    painter.drawRect(0, 0, 19, 19)
    painter.end()
    return QIcon(pixmap)


def sprite_thumbnail(document: ProjectDocument, sprite: dict[str, object]) -> QIcon:
    """Draw a sprite as a compact visual entry, in its real colours."""

    image = render_sprite(document, sprite)
    pixmap = QPixmap(40, 40)
    pixmap.fill(QColor("#101018"))
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, False)
    if not image.isNull() and image.width() and image.height():
        # Preserve the aspect ratio: an 8x16 character must not be squashed
        # into the square thumbnail.
        scale = min(36 / image.width(), 36 / image.height())
        width = max(1, int(image.width() * scale))
        height = max(1, int(image.height() * scale))
        painter.drawImage(QRect((40 - width) // 2, (40 - height) // 2, width, height), image)
    painter.setPen(QColor("#7878c8"))
    painter.drawRect(0, 0, 39, 39)
    painter.end()
    return QIcon(pixmap)


#: The roles a sprite can have, with the colour and glyph each is drawn with.
SPRITE_ROLES: tuple[tuple[str, str, str], ...] = (
    ("player", "#78d8d8", "P"),
    ("npc", "#b8b8d8", "N"),
    ("enemy", "#f87878", "!"),
    ("item", "#f8d878", "+"),
    ("tool", "#9898e8", "T"),
    ("powerup", "#78d878", "↑"),
    ("pickup", "#f8d878", "*"),
    ("projectile", "#f878d8", "→"),
    ("decoration", "#c87848", "D"),
    ("hud", "#7878d8", "H"),
    ("other", "#787898", "?"),
)

#: How a role is coloured when it appears in a list of *entities*, not sprites.
ROLE_COLOURS: dict[str, str] = {
    "enemy": "#f87878",
    "item": "#f8d878",
    "npc": "#b8b8d8",
    "powerup": "#78d878",
    "projectile": "#f878d8",
    "hud": "#f8d878",
}


def role_colour(role: str) -> str:
    return ROLE_COLOURS.get(role, "#7878d8")
