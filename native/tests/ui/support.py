"""Shared scaffolding for the UI tests.

Two rules this file exists to enforce, both learned the hard way:

* **Close your windows.** A live `MainWindow` keeps a 30 s snapshot timer and an
  open session. Leaking one makes two sessions race on the same project and
  raise `StaleRevisionError` inside a *later*, unrelated test.
* **Assert pixels, not document fields.** 180 tests were green while the app
  rendered a transparent emulator frame and a white-on-white PALS panel, because
  every test asserted `document.field == X` and none asserted that anything had
  been *drawn*.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class StudioTest(unittest.TestCase):
    """A test that needs a real `MainWindow`."""

    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        os.environ.setdefault("NES_STUDIO_TEST_MODE", "1")
        cls._data_root = tempfile.TemporaryDirectory()
        os.environ["NES_STUDIO_DATA_ROOT"] = cls._data_root.name

        from nes_studio.application import create_application

        cls.application = create_application(["nes-studio-test"])

    @classmethod
    def tearDownClass(cls) -> None:
        os.environ.pop("NES_STUDIO_DATA_ROOT", None)
        cls._data_root.cleanup()

    def window(self, starter: str | None = None, *, level: str = "advanced"):
        """A window on a project of its own.

        Every test gets a fresh project: two windows sharing one project race on
        its revision and fail somewhere else entirely.

        The default level is Advanced because a test usually wants to reach every
        mode. Pass a lower one to test the gating itself.
        """

        from nes_studio.core.resources import ResourceLocator
        from nes_studio.ui.main_window import MainWindow
        from nes_studio.ui.modes.base import Level

        window = MainWindow(ResourceLocator.discover(NATIVE_ROOT))
        self.addCleanup(self._dispose, window)
        window.set_level(Level.parse(level))
        if starter is not None:
            window.new_project(starter, f"{self.id()} {id(self)}")
        return window

    def _dispose(self, window) -> None:
        """Close the window *and actually destroy it*.

        Closing is not enough, and neither is `deleteLater()` on its own.

        The theme is applied to the **application**, so every `setStyleSheet()`
        re-polishes every widget alive in the process — and one `MainWindow` is
        ~1,170 widgets. A window that is merely closed keeps all of them, so each
        test made the next one slower: one file went from 1.4 s for its first
        test to 12 s for its ninth, and the whole suite grew superlinearly.

        The trap: `processEvents()` does **not** deliver `DeferredDelete`, which
        is the event `deleteLater()` posts. Without `sendPostedEvents` the widgets
        are never freed and the leak looks exactly like a leak you have already
        fixed.
        """

        from PySide6.QtCore import QEvent

        try:
            window.close()
            window.setParent(None)
            window.deleteLater()
        except RuntimeError:
            return  # already destroyed by an explicit dispose in the test
        self.application.sendPostedEvents(None, QEvent.Type.DeferredDelete)
        self.application.processEvents()

    # ---- pixels -----------------------------------------------------------

    @staticmethod
    def grab(widget):
        """Render a widget to an image, as the pupil would see it."""

        widget.show()
        widget.repaint()
        return widget.grab().toImage()

    def assertRenders(self, widget, *, minimum_colours: int = 3) -> None:  # noqa: N802
        """The widget drew something with structure — not one flat fill.

        A transparent frame, a white-on-white panel and an all-black canvas all
        pass a `document.field == X` test and fail this one.
        """

        image = self.grab(widget)
        self.assertFalse(image.isNull(), "the widget rendered nothing at all")
        self.assertGreater(image.width(), 0)
        colours = {
            image.pixel(x, y)
            for y in range(0, image.height(), max(1, image.height() // 40))
            for x in range(0, image.width(), max(1, image.width() // 40))
        }
        self.assertGreaterEqual(
            len(colours),
            minimum_colours,
            f"{widget.objectName() or type(widget).__name__} rendered "
            f"{len(colours)} distinct colour(s) — it is a flat fill, not a picture",
        )

    def assertLegible(self, widget) -> None:  # noqa: N802
        """Foreground and background differ — this is the white-on-white check."""

        image = self.grab(widget)
        colours = {
            image.pixel(x, y)
            for y in range(0, image.height(), 3)
            for x in range(0, image.width(), 3)
        }
        self.assertGreater(
            len(colours),
            1,
            f"{widget.objectName()} is a single flat colour — its text is invisible",
        )
