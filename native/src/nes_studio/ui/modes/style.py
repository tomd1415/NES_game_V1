"""STYLE — what kind of game this is, and how it feels to move in it.

The missing 8th mode. Native crammed game type and physics into the top of
RULES, where they sat above forty unrelated fields; the web splits them out
(`studio-style.js`) because "what kind of game is this" is the *first* decision
a pupil makes, not a setting buried in a form.

Every field here is one the game type actually uses: choose "platformer" and the
racer's laps and checkpoints disappear rather than sitting there doing nothing.
"""

from __future__ import annotations

from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QLabel,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ..widgets.forms import Card
from ..widgets.visuals import add_visual_choice, prepare_visual_selector
from .base import Level, Mode, ModeContext, scroll_body

#: id -> (label, colour, glyph, one-line description)
GAME_STYLES: tuple[tuple[str, str, str, str, str], ...] = (
    ("platformer", "Platformer", "#4878d8", "↟", "Run and jump. Gravity pulls you down."),
    ("topdown", "Top-down", "#78d878", "✦", "Walk in all four directions. No gravity."),
    ("runner", "Auto-runner", "#f8d878", "→", "The screen scrolls by itself; you only jump."),
    ("racer", "Racer", "#f87878", "R", "Drive laps against the clock."),
    ("smb", "SMB showcase", "#c87848", "M", "Blocks, pipes, power-ups and a flagpole."),
)

#: Which cards each game style actually uses. A field the engine ignores is a
#: field that should not be on screen.
STYLE_FIELDS: dict[str, frozenset[str]] = {
    "platformer": frozenset({"gravity", "jump"}),
    "smb": frozenset({"gravity", "jump"}),
    "topdown": frozenset(),
    "runner": frozenset({"gravity", "jump", "autoscroll"}),
    "racer": frozenset({"racer"}),
}


class StyleMode(Mode):
    """Game type, and the movement rules that follow from it."""

    id = "STYLE"
    title = "STYLE"
    help_text = "Choose what kind of game this is, and how it feels to move."
    min_level = Level.BEGINNER

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("styleModePage")
        content = scroll_body(self, "styleEditor")
        layout = QVBoxLayout(content)
        layout.setContentsMargins(20, 18, 20, 28)
        layout.setSpacing(10)

        kind = Card("Game type", "Everything else on this page follows from this choice.", content)
        self.game_style = QComboBox(kind)
        self.game_style.setObjectName("gameStyleSelector")
        prepare_visual_selector(self.game_style, "Game style")
        for value, label, colour, glyph, _description in GAME_STYLES:
            add_visual_choice(self.game_style, label, value, colour=colour, glyph=glyph)
        kind.field("This game is a", self.game_style)
        self.style_description = QLabel(kind)
        self.style_description.setObjectName("styleDescription")
        self.style_description.setWordWrap(True)
        kind.wide(self.style_description)
        layout.addWidget(kind)

        self.cards: dict[str, Card] = {}

        gravity = Card("Gravity", parent=content)
        self.gravity = QSpinBox(gravity)
        self.gravity.setObjectName("gravityPxControl")
        self.gravity.setRange(0, 4)
        gravity.field(
            "Pull downwards",
            self.gravity,
            hint="Pixels per frame the player accelerates downwards. 0 is weightless.",
        )
        self.cards["gravity"] = gravity
        layout.addWidget(gravity)

        jump = Card("Jumping", parent=content)
        self.jump_speed = QSpinBox(jump)
        self.jump_speed.setObjectName("jumpSpeedPxControl")
        self.jump_speed.setRange(1, 6)
        jump.field("Take-off speed", self.jump_speed, hint="How hard the player leaves the ground.")
        self.walk_bob = QCheckBox("Bob up and down when walking", jump)
        self.walk_bob.setObjectName("walkBobToggle")
        jump.wide(self.walk_bob)
        self.cards["jump"] = jump
        layout.addWidget(jump)

        autoscroll = Card("Auto-scroll", "The screen moves on its own.", content)
        self.autoscroll_speed = QSpinBox(autoscroll)
        self.autoscroll_speed.setObjectName("autoscrollSpeedControl")
        self.autoscroll_speed.setRange(1, 4)
        autoscroll.field("Scroll speed", self.autoscroll_speed)
        self.cards["autoscroll"] = autoscroll
        layout.addWidget(autoscroll)

        racer = Card("Race", parent=content)
        self.racer_top_speed = QSpinBox(racer)
        self.racer_top_speed.setObjectName("racerTopSpeedControl")
        self.racer_top_speed.setRange(1, 4)
        racer.field("Top speed", self.racer_top_speed)
        self.racer_laps = QSpinBox(racer)
        self.racer_laps.setObjectName("racerLapsControl")
        self.racer_laps.setRange(1, 9)
        racer.field("Laps to win", self.racer_laps)
        self.racer_checkpoints = QSpinBox(racer)
        self.racer_checkpoints.setObjectName("racerCheckpointsControl")
        self.racer_checkpoints.setRange(1, 2)
        racer.field("Checkpoints", self.racer_checkpoints)
        self.cards["racer"] = racer
        layout.addWidget(racer)
        layout.addStretch(1)

        # Connect only once every control exists and is populated.
        self.game_style.currentIndexChanged.connect(self._set_style)
        self.gravity.valueChanged.connect(
            lambda value: self._set_global("gravityPx", value)
        )
        self.jump_speed.valueChanged.connect(
            lambda value: self._set_global("jumpSpeedPx", value)
        )
        self.walk_bob.toggled.connect(
            lambda value: self._set_global("bobWhenWalking", value)
        )
        for control, key in (
            (self.autoscroll_speed, "autoscrollSpeed"),
            (self.racer_top_speed, "racerTopSpeed"),
            (self.racer_laps, "racerLaps"),
            (self.racer_checkpoints, "racerCheckpoints"),
        ):
            control.valueChanged.connect(
                lambda value, key=key: self._set_game_option(key, value)
            )

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        label = QLabel("HOW IT PLAYS", dock)
        label.setObjectName("sectionLabel")
        layout.addWidget(label)
        self.summary = QLabel(dock)
        self.summary.setObjectName("styleSummary")
        self.summary.setWordWrap(True)
        layout.addWidget(self.summary)

        hint = QLabel(
            "Changing the game type rewires the engine. Settings a type does not "
            "use are hidden rather than ignored.",
            dock,
        )
        hint.setWordWrap(True)
        layout.addWidget(hint)
        layout.addStretch(1)
        return dock

    # ---- state ------------------------------------------------------------

    def _config(self) -> dict:
        builder = self.document.state.get("builder") or {}
        game = ((builder.get("modules") or {}).get("game") or {}).get("config") or {}
        return game if isinstance(game, dict) else {}

    def _globals(self) -> dict:
        builder = self.document.state.get("builder") or {}
        values = ((builder.get("modules") or {}).get("globals") or {}).get("config") or {}
        return values if isinstance(values, dict) else {}

    @property
    def game_type(self) -> str:
        style = str(self._config().get("type", "platformer"))
        return style if style in {value for value, *_ in GAME_STYLES} else "platformer"

    def refresh(self) -> None:
        config, values = self._config(), self._globals()
        style = self.game_type

        self.game_style.blockSignals(True)
        index = self.game_style.findData(style)
        self.game_style.setCurrentIndex(max(0, index))
        self.game_style.blockSignals(False)
        self.style_description.setText(
            next(text for value, _label, _colour, _glyph, text in GAME_STYLES if value == style)
        )

        for control, key, default in (
            (self.gravity, "gravityPx", 1),
            (self.jump_speed, "jumpSpeedPx", 2),
        ):
            control.blockSignals(True)
            control.setValue(int(values.get(key, default)))
            control.blockSignals(False)
        self.walk_bob.blockSignals(True)
        self.walk_bob.setChecked(bool(values.get("bobWhenWalking", False)))
        self.walk_bob.blockSignals(False)

        for control, key, default in (
            (self.autoscroll_speed, "autoscrollSpeed", 2),
            (self.racer_top_speed, "racerTopSpeed", 3),
            (self.racer_laps, "racerLaps", 3),
            (self.racer_checkpoints, "racerCheckpoints", 1),
        ):
            control.blockSignals(True)
            control.setValue(int(config.get(key, default)))
            control.blockSignals(False)

        used = STYLE_FIELDS.get(style, frozenset())
        for name, card in self.cards.items():
            card.setVisible(name in used)
        self._refresh_summary(style)

    def _refresh_summary(self, style: str) -> None:
        if self._dock is None:
            return
        label = next(text for value, text, *_ in GAME_STYLES if value == style)
        values = self._globals()
        lines = [f"A {label.lower()}."]
        if "gravity" in STYLE_FIELDS.get(style, frozenset()):
            gravity = int(values.get("gravityPx", 1))
            lines.append("Weightless." if gravity == 0 else f"Gravity {gravity}.")
        if style == "racer":
            lines.append(f"{int(self._config().get('racerLaps', 3))} laps.")
        if style == "runner":
            lines.append(f"Scrolls at {int(self._config().get('autoscrollSpeed', 2))}.")
        self.summary.setText(" ".join(lines))

    # ---- edits ------------------------------------------------------------

    def _set_style(self, _index: int) -> None:
        style = self.game_style.currentData()
        if not isinstance(style, str):
            return
        self.document.set_game_style(style)
        self.refresh()
        self.edited(f"Game type set to {style}")

    def _set_game_option(self, key: str, value: int) -> None:
        self.document.set_game_option(key, value)
        self._refresh_summary(self.game_type)
        self.edited("")

    def _set_global(self, key: str, value: int | bool) -> None:
        self.document.set_global_option(key, value)
        self._refresh_summary(self.game_type)
        self.edited("")
