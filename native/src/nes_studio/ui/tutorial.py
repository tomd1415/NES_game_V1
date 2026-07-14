"""The guided tutorial: a step, a nudge, and a "Show me" that flashes the real
control.

Not a video, not a screenshot, not a modal that covers the thing it is talking
about. "Show me" finds the actual widget by `objectName` and flashes it where it
lives, so the pupil looks at the app and not at a picture of the app.

Steps advance on their own. Every check is re-baselined against the state when
the step began (see `core/tutorials.py`), so a pupil who starts from a finished
starter still does the work.
"""

from __future__ import annotations

import copy

from PySide6.QtCore import QObject, QTimer, Signal
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QProgressBar,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..core.tutorials import TUTORIALS, Step, Tutorial, tutorial


class TutorialController(QObject):
    """Runs one tutorial: which step, is it done, what does "Show me" point at."""

    changed = Signal()
    finished = Signal()

    def __init__(self, window) -> None:
        super().__init__(window)
        self._window = window
        self._tutorial: Tutorial | None = None
        self._index = 0
        self._baseline: dict = {}
        self._flash: QTimer | None = None

    # ---- state ------------------------------------------------------------

    @property
    def active(self) -> Tutorial | None:
        return self._tutorial

    @property
    def step(self) -> Step | None:
        if self._tutorial is None or self._index >= len(self._tutorial.steps):
            return None
        return self._tutorial.steps[self._index]

    @property
    def index(self) -> int:
        return self._index

    def start(self, identifier: str) -> bool:
        chosen = tutorial(identifier)
        if chosen is None:
            return False
        self._tutorial = chosen
        self._index = -1
        self._advance_to(0)
        return True

    def stop(self) -> None:
        self._tutorial = None
        self._index = 0
        self._baseline = {}
        self.changed.emit()

    # ---- progress ---------------------------------------------------------

    def _advance_to(self, index: int) -> None:
        if self._tutorial is None:
            return
        self._index = index
        if index >= len(self._tutorial.steps):
            self.changed.emit()
            self.finished.emit()
            return
        # Re-baseline: the step is satisfied by what happens *from now on*.
        self._baseline = copy.deepcopy(self._window.document.state)
        step = self._tutorial.steps[index]
        if step.mode in self._window.modes:
            self._window.select_mode(step.mode)
        self.changed.emit()

    def check(self) -> None:
        """Has the current step been done? Called after every edit."""

        step = self.step
        if step is None:
            return
        try:
            done = bool(step.done(self._window.document.state, self._baseline))
        except Exception:  # noqa: BLE001 - a broken check must not trap the pupil
            done = False
        if done:
            self._advance_to(self._index + 1)

    def skip(self) -> None:
        if self._tutorial is not None:
            self._advance_to(self._index + 1)

    def back(self) -> None:
        if self._tutorial is not None and self._index > 0:
            self._advance_to(self._index - 1)

    # ---- "Show me" --------------------------------------------------------

    def show_me(self) -> bool:
        """Flash the real control this step is talking about.

        Returns False when the step names no control, or the control is not on
        screen — in which case the panel says so rather than doing nothing.
        """

        step = self.step
        if step is None or not step.show_me:
            return False
        target = self._window.findChild(QWidget, step.show_me)
        # `isVisibleTo` and not `isVisible`: the control is the right one to flash
        # as soon as its mode is open, whether or not the window has been shown
        # yet — and `isVisible()` is false for every widget in a window that has
        # not been shown, which is every widget under test.
        if target is None or not target.isVisibleTo(self._window):
            return False
        self._flash_widget(target)
        return True

    def _flash_widget(self, widget: QWidget) -> None:
        effect = QGraphicsOpacityEffect(widget)
        widget.setGraphicsEffect(effect)
        state = {"count": 0}

        def blink() -> None:
            state["count"] += 1
            effect.setOpacity(0.25 if state["count"] % 2 else 1.0)
            if state["count"] >= 6:
                timer.stop()
                effect.setOpacity(1.0)
                widget.setGraphicsEffect(None)

        timer = QTimer(self)
        timer.setInterval(140)
        timer.timeout.connect(blink)
        timer.start()
        self._flash = timer


class TutorialPanel(QFrame):
    """The step you are on, and what to do about it."""

    def __init__(self, controller: TutorialController, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._controller = controller
        self.setObjectName("tutorialPanel")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 12)

        self.progress = QProgressBar(self)
        self.progress.setObjectName("tutorialProgress")
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(6)
        layout.addWidget(self.progress)

        self.title = QLabel(self)
        self.title.setObjectName("cardTitle")
        self.title.setWordWrap(True)
        layout.addWidget(self.title)

        self.body = QLabel(self)
        self.body.setWordWrap(True)
        layout.addWidget(self.body)

        self.note = QLabel(self)
        self.note.setObjectName("validatorInfo")
        self.note.setWordWrap(True)
        self.note.setVisible(False)
        layout.addWidget(self.note)

        actions = QHBoxLayout()
        self.show_me_button = QPushButton("Show me", self)
        self.show_me_button.setObjectName("tutorialShowMeButton")
        self.show_me_button.clicked.connect(self._show_me)
        actions.addWidget(self.show_me_button)
        self.skip_button = QPushButton("Skip", self)
        self.skip_button.setObjectName("tutorialSkipButton")
        self.skip_button.clicked.connect(controller.skip)
        actions.addWidget(self.skip_button)
        self.stop_button = QPushButton("End", self)
        self.stop_button.setObjectName("tutorialStopButton")
        self.stop_button.clicked.connect(controller.stop)
        actions.addWidget(self.stop_button)
        layout.addLayout(actions)

        controller.changed.connect(self.refresh)
        self.refresh()

    def _show_me(self) -> None:
        found = self._controller.show_me()
        self.note.setText(
            "" if found else "That control is not on screen right now — open the mode above."
        )
        self.note.setVisible(not found)

    def refresh(self) -> None:
        active = self._controller.active
        step = self._controller.step
        self.setVisible(active is not None)
        if active is None:
            return
        if step is None:
            self.title.setText(f"✓  {active.title} — done!")
            self.body.setText("Nicely done. Pick another from the Tutorial button any time.")
            self.progress.setRange(0, 1)
            self.progress.setValue(1)
            self.show_me_button.setVisible(False)
            self.skip_button.setVisible(False)
            self.stop_button.setText("Close")
            return

        total = len(active.steps)
        self.progress.setRange(0, total)
        self.progress.setValue(self._controller.index)
        self.title.setText(f"{self._controller.index + 1}/{total}  ·  {step.title}")
        self.body.setText(step.body)
        self.note.setVisible(False)
        self.show_me_button.setVisible(bool(step.show_me))
        self.skip_button.setVisible(True)
        self.stop_button.setText("End")


class TutorialPickerDialog(QDialog):
    """Choose a tutorial."""

    def __init__(self, controller: TutorialController, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._controller = controller
        self.setObjectName("tutorialPickerDialog")
        self.setWindowTitle("Tutorials")
        self.setMinimumWidth(520)

        layout = QVBoxLayout(self)
        layout.addWidget(QLabel("Pick something to learn. You can stop at any point.", self))

        self.list = QListWidget(self)
        self.list.setObjectName("tutorialList")
        for entry in TUTORIALS:
            item = QListWidgetItem(
                f"{entry.title}\n     {entry.summary}  ·  {len(entry)} steps"
            )
            item.setData(0x0100, entry.id)  # Qt.ItemDataRole.UserRole
            self.list.addItem(item)
        self.list.setCurrentRow(0)
        self.list.itemDoubleClicked.connect(lambda _item: self._start())
        layout.addWidget(self.list, 1)

        buttons = QDialogButtonBox(self)
        start = buttons.addButton("Start", QDialogButtonBox.ButtonRole.AcceptRole)
        start.setObjectName("startTutorialButton")
        start.clicked.connect(self._start)
        buttons.addButton(QDialogButtonBox.StandardButton.Close).clicked.connect(self.reject)
        layout.addWidget(buttons)

    def _start(self) -> None:
        item = self.list.currentItem()
        if item is None:
            return
        if self._controller.start(str(item.data(0x0100))):
            self.accept()
