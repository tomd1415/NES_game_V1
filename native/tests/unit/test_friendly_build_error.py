"""Tests for tools/nes_studio_core/play.py::friendly_build_error.

It is the only thing between a pupil and
`Segment 'RODATA' overflows memory area 'ROM0' by 5950 bytes`, and it fails
SILENTLY: a regex that stops matching just returns the raw log, and nothing
notices the friendly path went dead.

The real message format, read out of the shipped binary rather than guessed
(`strings $(command -v ld65) | grep -i overflow`, ld65 V2.18 Debian 2.19-1):

    Segment '%s' overflows memory area '%s' by %lu byte%c

Note `byte%c`: cc65 puts 's' there for a plural and a space for exactly one.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "tools"))

from nes_studio_core.play import friendly_build_error  # noqa: E402


REAL = "ld65: Error: Segment 'RODATA' overflows memory area 'ROM0' by 5950 bytes"


class FriendlyBuildErrorTests(unittest.TestCase):
    def test_a_real_ld65_overflow_is_translated(self) -> None:
        out = friendly_build_error(REAL)
        self.assertNotEqual(out, REAL, "the raw linker text was passed through")
        self.assertIn("5950 bytes too big", out)
        self.assertIn("32KB", out)

    def test_the_byte_count_comes_from_the_overflow_not_the_segment(self) -> None:
        """Group 1 is the memory area, group 2 is the count. Swapping them would
        still 'work' on most inputs, so pin it with an unmistakable number."""
        out = friendly_build_error(
            "Segment 'CODE' overflows memory area 'ROM0' by 7 bytes"
        )
        self.assertIn("about 7 bytes too big", out)

    def test_one_byte_overflow_is_still_translated(self) -> None:
        """ld65 emits 'byte' (singular) for exactly one. The current regex
        demands 'bytes' and silently gives up. Fix: `by (\\d+) bytes?`."""
        raw = "Segment 'RODATA' overflows memory area 'ROM0' by 1 byte"
        out = friendly_build_error(raw)
        self.assertNotEqual(out, raw, "one-byte overflow fell through untranslated")
        self.assertIn("1 byte", out)

    def test_an_unrelated_build_failure_is_passed_through_untouched(self) -> None:
        raw = "ca65: Error: Invalid input character: 0x5C"
        self.assertEqual(friendly_build_error(raw), raw)

    def test_empty_input_is_safe(self) -> None:
        self.assertEqual(friendly_build_error(""), "")

    def test_none_does_not_raise(self) -> None:
        """`search(log or "")` guards the match against None but the fall-through
        is a bare `return log`. The only caller passes `str(exc)`, so this is an
        inconsistency, not a live bug — asserted as "does not raise" so it does
        not become a false alarm."""
        self.assertFalse(friendly_build_error(None))

    def test_the_advice_names_actions_a_pupil_can_take(self) -> None:
        out = friendly_build_error(REAL)
        for action in ("shorter", "reuse repeated sections", "fewer different"):
            self.assertIn(action, out)


if __name__ == "__main__":
    unittest.main()
