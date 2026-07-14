"""The budget meters: 256 tiles, 64 hardware sprites, 32 KB of cartridge.

The NES is a machine of hard ceilings. The web shows them as live meters so a
pupil learns the limit exists *before* they hit it; native showed nothing at all.
"""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
class BudgetMeterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from nes_studio.application import create_application

        cls.application = create_application(["nes-studio-test"])

    def meter(self, limit: int = 64):
        from nes_studio.ui.widgets.budget import BudgetMeter

        widget = BudgetMeter("Sprites", limit)
        widget.resize(240, 34)
        self.addCleanup(widget.close)
        return widget

    def test_it_reports_what_is_used(self) -> None:
        meter = self.meter()
        meter.set_used(16)

        self.assertEqual(meter.used, 16)
        self.assertAlmostEqual(meter.fraction, 0.25)
        self.assertFalse(meter.is_over)
        self.assertIn("16", meter.text())
        self.assertIn("64", meter.text())

    def test_the_three_bands(self) -> None:
        from nes_studio.ui.widgets.budget import COMFORTABLE, OVER, TIGHT

        meter = self.meter()

        meter.set_used(10)
        self.assertEqual(meter.colour(), COMFORTABLE)

        meter.set_used(56)  # 87.5%
        self.assertEqual(meter.colour(), TIGHT)

        meter.set_used(65)
        self.assertEqual(meter.colour(), OVER)
        self.assertTrue(meter.is_over)

    def test_over_the_limit_is_a_state_not_a_warning(self) -> None:
        """A project past a hardware limit will not render as drawn. That is a
        fact about the machine, not advice."""

        meter = self.meter()
        meter.set_used(100)

        self.assertIn("over the limit", meter.accessibleDescription())

    def test_it_actually_draws_the_bar(self) -> None:
        """A meter that renders as one flat colour has told the pupil nothing —
        and would pass any assertion about its `used` field."""

        meter = self.meter()
        meter.set_used(32)
        meter.show()
        meter.repaint()
        image = meter.grab().toImage()

        colours = {
            image.pixel(x, y)
            for y in range(image.height())
            for x in range(0, image.width(), 4)
        }
        self.assertGreater(len(colours), 2, "the meter drew nothing but a flat fill")

        # The filled half differs from the empty half.
        bar_y = meter.height() - 6
        self.assertNotEqual(
            image.pixel(4, bar_y),
            image.pixel(meter.width() - 4, bar_y),
            "the bar is not proportional — filled and empty look the same",
        )

    def test_the_bar_grows_with_use(self) -> None:
        meter = self.meter()
        meter.show()

        meter.set_used(8)
        meter.repaint()
        quiet = meter.grab().toImage().pixel(meter.width() // 2, meter.height() - 6)

        meter.set_used(60)
        meter.repaint()
        busy = meter.grab().toImage().pixel(meter.width() // 2, meter.height() - 6)

        self.assertNotEqual(quiet, busy, "the bar did not move")


if __name__ == "__main__":
    unittest.main()
