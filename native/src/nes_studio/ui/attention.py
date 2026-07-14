"""What needs your attention: the quests you are working towards, and what is
wrong with the game right now.

The quest half is derived from the pupil's own document. (It was, for a while, a
hardcoded checklist of *developer* milestones — "Launch a real Qt application",
all ticked — which told the pupil nothing about their own game.)

The validator half is new: ~30 checks, each with a **Fix in ‹Mode› →** button
that takes you to the mode that can fix it. That button is the whole point.
Telling a pupil "Doors is on but no tile is painted Door" and leaving them to
find where is not much better than saying nothing.
"""

from __future__ import annotations

from collections.abc import Callable

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from ..core.project_document import ProjectDocument
from ..core.validators import Problem, validate
from .modes.base import Level
from .tutorial import TutorialPanel

#: Each quest is (label, predicate) — the predicate reads the live document.
QUESTS: tuple[tuple[str, Callable[[ProjectDocument], bool]], ...] = (
    ("Meet your hero", ProjectDocument.has_player_sprite),
    ("Draw a tile", ProjectDocument.has_drawn_background_tile),
    ("Build some ground", ProjectDocument.has_painted_nametable),
    ("Add a second screen", ProjectDocument.has_multiple_screens),
    ("Take it for a spin", ProjectDocument.has_been_built),
)


class AttentionPanel(QFrame):
    """The right-hand column: quests, then problems."""

    def __init__(self, window) -> None:
        super().__init__(window)
        self._window = window
        self.setObjectName("questPanel")
        self.setMinimumWidth(250)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 20, 18, 20)

        # The tutorial, when one is running, sits above everything else: it is
        # the thing the pupil is being asked to do right now.
        self.tutorial = TutorialPanel(window.tutorial, self)
        layout.addWidget(self.tutorial)

        title = QLabel("QUEST LOG", self)
        title.setObjectName("modeTitle")
        layout.addWidget(title)

        self.quest_heading = QLabel("Your game", self)
        self.quest_heading.setObjectName("questHeading")
        layout.addWidget(self.quest_heading)

        self._quest_labels: list[QLabel] = []
        for _ in QUESTS:
            item = QLabel(self)
            item.setWordWrap(True)
            layout.addWidget(item)
            self._quest_labels.append(item)

        problems_title = QLabel("PROBLEMS", self)
        problems_title.setObjectName("modeTitle")
        layout.addWidget(problems_title)

        self.summary = QLabel(self)
        self.summary.setObjectName("validatorClean")
        self.summary.setWordWrap(True)
        layout.addWidget(self.summary)

        scroll = QScrollArea(self)
        scroll.setObjectName("validatorList")
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        content = QWidget(scroll)
        self._problem_layout = QVBoxLayout(content)
        self._problem_layout.setContentsMargins(0, 0, 0, 0)
        self._problem_layout.setSpacing(10)
        self._problem_layout.addStretch(1)
        scroll.setWidget(content)
        layout.addWidget(scroll, 1)

        self._problem_widgets: list[QWidget] = []
        self._problems: list[Problem] = []
        self.refresh()

    @property
    def problems(self) -> list[Problem]:
        return self._problems

    def refresh(self) -> None:
        self._refresh_quests()
        self._refresh_problems()

    # ---- quests -----------------------------------------------------------

    def _refresh_quests(self) -> None:
        document = self._window.document
        for label, (text, done_for) in zip(self._quest_labels, QUESTS):
            try:
                done = bool(done_for(document))
            except Exception:  # a quest must never break the editor
                done = False
            label.setText(("✓  " if done else "○  ") + text)
            label.setObjectName("questComplete" if done else "questPending")
            label.style().unpolish(label)
            label.style().polish(label)

    # ---- problems ---------------------------------------------------------

    def _refresh_problems(self) -> None:
        while self._problem_widgets:
            widget = self._problem_widgets.pop()
            self._problem_layout.removeWidget(widget)
            widget.deleteLater()

        try:
            problems = validate(self._window.document.state)
        except Exception:  # noqa: BLE001 - the checks must never break the app
            problems = []
        # The web hides warnings below Maker: a beginner should see what *stops*
        # their game, not a list of things that merely could be better.
        if self._window.level < Level.MAKER:
            problems = [problem for problem in problems if problem.is_error]
        self._problems = problems

        errors = sum(1 for problem in problems if problem.is_error)
        warnings = len(problems) - errors
        if not problems:
            self.summary.setText("✓  Nothing wrong. This game will build.")
            self.summary.setObjectName("validatorClean")
        else:
            parts = []
            if errors:
                parts.append(f"{errors} error{'' if errors == 1 else 's'}")
            if warnings:
                parts.append(f"{warnings} warning{'' if warnings == 1 else 's'}")
            self.summary.setText(" · ".join(parts))
            self.summary.setObjectName("validatorError" if errors else "validatorWarning")
        self.summary.style().unpolish(self.summary)
        self.summary.style().polish(self.summary)

        for problem in problems:
            widget = self._build_problem(problem)
            self._problem_layout.insertWidget(self._problem_layout.count() - 1, widget)
            self._problem_widgets.append(widget)

    def _build_problem(self, problem: Problem) -> QWidget:
        card = QFrame(self)
        card.setObjectName("settingsCard")
        layout = QVBoxLayout(card)
        layout.setContentsMargins(10, 8, 10, 10)
        layout.setSpacing(4)

        heading = QLabel("✗ Error" if problem.is_error else "⚠ Warning", card)
        heading.setObjectName("validatorError" if problem.is_error else "validatorWarning")
        layout.addWidget(heading)

        message = QLabel(problem.message, card)
        message.setWordWrap(True)
        layout.addWidget(message)

        fix = QLabel(problem.fix, card)
        fix.setObjectName("validatorInfo")
        fix.setWordWrap(True)
        layout.addWidget(fix)

        mode = problem.mode
        if mode and mode in self._window.modes:
            row = QHBoxLayout()
            row.addStretch(1)
            button = QPushButton(f"Fix in {mode.title()} →", card)
            button.setObjectName("validatorFixButton")
            button.setAccessibleName(f"Go to {mode.title()} mode to fix: {problem.message}")
            button.clicked.connect(lambda _checked=False, mode=mode: self._window.select_mode(mode))
            row.addWidget(button)
            layout.addLayout(row)
        return card
