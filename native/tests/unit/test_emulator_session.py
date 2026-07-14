"""The embedded NES core, driven the way the app drives it."""

from __future__ import annotations

import importlib.util
import os
import sys
import time
import unittest
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = NATIVE_ROOT.parent
sys.path.insert(0, str(NATIVE_ROOT / "src"))

PYSIDE_AVAILABLE = importlib.util.find_spec("PySide6") is not None
CORE_AVAILABLE = importlib.util.find_spec("nes_core") is not None

# A ROM from a real pupil-style project, not a synthetic fixture.
ROM = REPO_ROOT / "tools" / "gallery" / "studio-e2e-1783888332355-b3d9" / "rom.nes"


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
@unittest.skipUnless(CORE_AVAILABLE, "nes_core is not installed")
@unittest.skipUnless(ROM.exists(), "sample ROM is not present")
class EmulatorCoreTests(unittest.TestCase):
    """The core itself — no Qt event loop involved."""

    def test_a_real_rom_produces_picture_and_sound(self) -> None:
        from nes_core import Nes

        nes = Nes(44100.0)
        nes.load_rom(ROM.read_bytes())

        peak = 0.0
        samples_seen = 0
        for _ in range(300):  # five seconds
            pixels, samples = nes.clock_frame()
            samples_seen += len(samples)
            if samples:
                peak = max(peak, max(abs(value) for value in samples))

        self.assertEqual(len(pixels), 256 * 240 * 4)

        # Picture: a real game is not one flat colour.
        distinct = {pixels[i : i + 4] for i in range(0, len(pixels), 4)}
        self.assertGreater(len(distinct), 4, "the screen looks blank")

        # Sound: the APU must actually be producing samples, at the right rate.
        per_frame = samples_seen / 300
        self.assertAlmostEqual(per_frame, 44100 / 60, delta=5)
        self.assertGreater(peak, 0.0, "the APU produced silence")

    def test_input_changes_the_game(self) -> None:
        from nes_core import Nes

        def run(button: str | None) -> bytes:
            nes = Nes(44100.0)
            nes.load_rom(ROM.read_bytes())
            for frame in range(240):
                if button and frame > 60:
                    nes.set_button(1, button, True)
                pixels, _ = nes.clock_frame()
            return pixels

        self.assertNotEqual(run(None), run("right"))

    def test_bad_input_is_rejected(self) -> None:
        from nes_core import Nes

        nes = Nes(44100.0)
        nes.load_rom(ROM.read_bytes())
        with self.assertRaises(ValueError):
            nes.set_button(3, "a", True)
        with self.assertRaises(ValueError):
            nes.set_button(1, "turbo", True)

    def test_clocking_without_a_rom_is_an_error_not_a_crash(self) -> None:
        from nes_core import Nes

        with self.assertRaises(RuntimeError):
            Nes(44100.0).clock_frame()


@unittest.skipUnless(PYSIDE_AVAILABLE, "PySide6 is not installed")
@unittest.skipUnless(CORE_AVAILABLE, "nes_core is not installed")
@unittest.skipUnless(ROM.exists(), "sample ROM is not present")
class EmulatorSessionTests(unittest.TestCase):
    """The Qt session that drives the core."""

    @classmethod
    def setUpClass(cls) -> None:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from PySide6.QtWidgets import QApplication

        cls.app = QApplication.instance() or QApplication([])

    def test_it_emits_opaque_frames(self) -> None:
        """Without audio the loop must still run — a machine with no sound card
        has to show the game, not a black screen. And RGBA8888 over tetanes'
        zero alpha byte would make every frame fully transparent."""

        from nes_studio.emulator.session import EmulatorSession

        session = EmulatorSession()
        frames: list = []
        session.frame_ready.connect(frames.append)
        session.start(ROM.read_bytes())

        deadline = time.time() + 2.0
        while time.time() < deadline and len(frames) < 5:
            self.app.processEvents()
        session.stop()

        self.assertGreaterEqual(len(frames), 5, "the emulator produced no frames")
        image = frames[-1]
        self.assertEqual((image.width(), image.height()), (256, 240))
        self.assertEqual(image.pixelColor(0, 0).alpha(), 255, "frame is transparent")

    def test_stop_is_idempotent_and_reports_state(self) -> None:
        from nes_studio.emulator.session import EmulatorSession

        session = EmulatorSession()
        self.assertFalse(session.is_running())
        session.start(ROM.read_bytes())
        self.assertTrue(session.is_running())
        session.stop()
        self.assertFalse(session.is_running())
        session.stop()  # must not raise
        self.assertFalse(session.is_running())

    def test_keys_only_route_while_running(self) -> None:
        from PySide6.QtCore import Qt

        from nes_studio.emulator.session import EmulatorSession

        session = EmulatorSession()
        self.assertFalse(session.handle_key(Qt.Key.Key_Right, True))

        session.start(ROM.read_bytes())
        self.assertTrue(session.handle_key(Qt.Key.Key_Right, True))
        self.assertTrue(session.handle_key(Qt.Key.Key_O, True))  # player 2 A
        self.assertFalse(session.handle_key(Qt.Key.Key_Z, True))  # unmapped
        session.stop()

    def test_player_two_controls_match_the_web(self) -> None:
        """A pupil moving between browser and native must not relearn controls."""

        from PySide6.QtCore import Qt

        from nes_studio.emulator.session import EmulatorSession

        mapping = EmulatorSession.KEY_MAP
        self.assertEqual(mapping[Qt.Key.Key_F], (1, "a"))
        self.assertEqual(mapping[Qt.Key.Key_D], (1, "b"))
        self.assertEqual(mapping[Qt.Key.Key_I], (2, "up"))
        self.assertEqual(mapping[Qt.Key.Key_O], (2, "a"))
        self.assertEqual(mapping[Qt.Key.Key_1], (2, "start"))


if __name__ == "__main__":
    unittest.main()
