"""The contract every Studio mode implements.

`MainWindow` used to build all seven modes inline — one 597-line `_create_stage()`
that returned a stack of editors, plus their refresh methods and handlers, all in
the same class. Adding a mode meant touching four places in one 3,000-line file,
and every mode could reach into every other mode's widgets.

A mode is now a `QWidget` that owns its own controls, its own inspector dock and
its own refresh. The shell owns the rail, the stage and the dock host, and knows
nothing about what is inside a mode.

Deliberately the same shape the web already proves out (`studio.js:346-358`), so
the two products stay conceptually aligned.
"""

from __future__ import annotations

from enum import IntEnum
from typing import TYPE_CHECKING

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QFrame, QScrollArea, QVBoxLayout, QWidget

from ...core.project_document import ProjectDocument

if TYPE_CHECKING:  # pragma: no cover - typing only
    from ...persistence.session import ProjectSession
    from ...state.store import DocumentStore


class Level(IntEnum):
    """How much of the Studio a pupil has unlocked.

    The web gates modes, stage tools *and* dock sections on this. Locked modes
    stay **visible** with a nudge rather than disappearing, so a pupil can see
    what is ahead of them.
    """

    BEGINNER = 0
    MAKER = 1
    ADVANCED = 2

    @property
    def label(self) -> str:
        return ("Beginner", "Maker", "Advanced")[int(self)]

    @classmethod
    def parse(cls, value: object) -> "Level":
        if isinstance(value, Level):
            return value
        if isinstance(value, int) and 0 <= value <= 2:
            return cls(value)
        text = str(value or "").strip().lower()
        return {
            "beginner": cls.BEGINNER,
            "maker": cls.MAKER,
            "advanced": cls.ADVANCED,
        }.get(text, cls.BEGINNER)


class ModeContext:
    """Everything a mode needs from the shell — and nothing more.

    Modes reach the document through *this*, never by caching it: an undo
    replaces the document's contents in place, and switching project replaces
    the `ProjectDocument` object outright. A mode that cached the object would
    edit a stranded document after either.
    """

    def __init__(self, window) -> None:
        self._window = window

    # ---- the project ------------------------------------------------------

    @property
    def window(self):
        """The `MainWindow` — for dialog parents and nothing else."""

        return self._window

    @property
    def document(self) -> ProjectDocument:
        return self._window.session.document

    @property
    def session(self) -> "ProjectSession":
        return self._window.session

    @property
    def store(self) -> "DocumentStore":
        return self._window.store

    # ---- talking back to the shell ---------------------------------------

    def edited(self, message: str = "") -> None:
        """Record an edit: save it, retitle the window, tell the pupil.

        Every mutation goes through here. `DocumentStore` hooks the session's
        `saveScheduled`, so this is also what makes the edit undoable.
        """

        self._window.document_edited(message)

    def status(self, message: str) -> None:
        self._window.statusBar().showMessage(message)

    def open_mode(self, mode_id: str) -> None:
        """Jump to another mode — 'Edit this tile's pixels', 'Fix in TILES →'."""

        self._window.select_mode(mode_id)

    @property
    def level(self) -> Level:
        return self._window.level

    def begin_stroke(self) -> None:
        """Open a stroke: everything until `end_stroke()` is one undo step, and
        the expensive per-edit work (validators, the problem panel) is deferred to
        the end rather than run on every mouse-move."""

        self._window.begin_stroke()

    def end_stroke(self, text: str = "edit") -> None:
        self._window.end_stroke(text)


class Mode(QWidget):
    """One workspace mode: WORLD, CHARS, TILES, PALS, RULES, STYLE, SOUND, CODE."""

    #: Stable identifier, uppercase, as shown on the mode rail.
    id: str = ""
    title: str = ""
    #: One line under the mode title in the dock.
    help_text: str = ""
    #: Below this level the mode is visible but locked.
    min_level: Level = Level.BEGINNER
    #: True when the mode edits *on the NES screen* and so takes over the CRT
    #: stage instead of showing a plain editor panel.
    uses_stage: bool = False

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.context = context
        self._dock: QWidget | None = None

    # ---- convenience ------------------------------------------------------

    @property
    def document(self) -> ProjectDocument:
        return self.context.document

    def edited(self, message: str = "") -> None:
        self.context.edited(message)

    def status(self, message: str) -> None:
        self.context.status(message)

    # ---- the contract -----------------------------------------------------

    def build_dock(self) -> QWidget | None:
        """The mode's left-hand inspector. `None` means 'no inspector'.

        Built once, lazily, the first time the mode is opened — a mode nobody
        visits should cost nothing.
        """

        return None

    def dock(self) -> QWidget | None:
        if self._dock is None:
            self._dock = self.build_dock()
        return self._dock

    def stage_widget(self) -> QWidget | None:
        """The widget this mode puts *inside the CRT*, if it edits on the screen.

        The bezel frames an NES screen and only an NES screen — it used to wrap
        the whole editor stack, so RULES rendered as forty spin boxes inside a
        television. A mode with `uses_stage` returns its canvas here; every other
        mode gets a plain editor panel and the television shows the game.
        """

        return None

    def refresh(self) -> None:
        """Re-read the document. Called when this mode becomes visible, and on
        undo/redo or a project switch *if* it is the visible mode.

        Never do expensive work here. Refreshing every mode eagerly on every
        undo — one of which invoked the cc65 codegen — took a test file from 38
        seconds to 178.
        """

    def on_enter(self) -> None:
        """The mode just became visible."""

    def on_leave(self) -> None:
        """The mode is about to be hidden. Commit anything half-typed."""


def scroll_body(host: QWidget, object_name: str) -> QFrame:
    """Fill `host` with a scroll area and return the frame to populate.

    Most editors are taller than a laptop screen. Scrolling them beats
    compressing their controls below readable sizes, which is what the shell
    used to do.
    """

    outer = QVBoxLayout(host)
    outer.setContentsMargins(0, 0, 0, 0)
    area = QScrollArea(host)
    area.setObjectName(object_name)
    area.setWidgetResizable(True)
    area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
    content = QFrame(area)
    content.setObjectName(f"{object_name}Content")
    area.setWidget(content)
    outer.addWidget(area)
    host.scroll_area = area  # type: ignore[attr-defined]
    return content
