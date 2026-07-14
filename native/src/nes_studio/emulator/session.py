"""Run a built ROM inside the Studio's own CRT stage.

Native used to shell out to FCEUX and disable Play entirely when FCEUX was
absent — on a locked-down school image that is a hard failure of the core loop,
and it meant the CRT bezel framed a screen that never showed the game.

The core is `nes_core` (a PyO3 binding around tetanes-core, MIT OR Apache-2.0);
see `native/nes_core/README.md`.
"""

from __future__ import annotations

import array

from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtGui import QImage, QPainter
from PySide6.QtMultimedia import QAudio, QAudioFormat, QAudioSink


def _mean_brightness(image: QImage) -> float:
    """Average luminance of a frame, sampled on a grid.

    Every pixel would be 61,440 reads per frame in Python — far too slow for a
    16 ms budget. A 16x16 grid is 256 reads and is more than enough to spot a
    full-screen flash, which by definition is not a local change.
    """

    total = 0
    samples = 0
    for y in range(0, image.height(), 15):
        for x in range(0, image.width(), 16):
            colour = image.pixelColor(x, y)
            total += (
                0.299 * colour.red() + 0.587 * colour.green() + 0.114 * colour.blue()
            )
            samples += 1
    return total / samples if samples else 0.0

SAMPLE_RATE = 44100
FRAME_RATE = 60
BYTES_PER_SAMPLE = 2  # Int16, mono

# The NES produces a variable number of samples per frame (733/734/735 at
# 44.1 kHz), so every buffer size here is an estimate, not a contract.
SAMPLES_PER_FRAME = SAMPLE_RATE // FRAME_RATE
BYTES_PER_FRAME = SAMPLES_PER_FRAME * BYTES_PER_SAMPLE

#: How far ahead of the speaker we are willing to run. Too small and any
#: scheduling hiccup underruns; too large and input feels laggy.
BUFFER_FRAMES = 4

#: Never emulate more than this many frames in one tick, so a stall cannot make
#: the app freeze while it "catches up" indefinitely.
MAX_CATCH_UP_FRAMES = 4

#: Poll faster than a frame when audio paces us; the sink decides the rate.
AUDIO_POLL_MS = 4

#: Fixed timestep used only when the machine has no working audio device.
FIXED_STEP_MS = 1000 // FRAME_RATE


class EmulatorUnavailable(RuntimeError):
    """The embedded core is not installed."""


def core_available() -> bool:
    try:
        import nes_core  # noqa: F401
    except ImportError:
        return False
    return True


class EmulatorSession(QObject):
    """Drives the core, paced by the audio clock."""

    frame_ready = Signal(QImage)
    stopped = Signal()
    failed = Signal(str)

    #: Matches the web exactly (`emulator.js` mapCode), so a pupil moving
    #: between the browser and native does not have to relearn the controls.
    #: Note Player 2 Start/Select are Digit1/Digit2, which collide with the
    #: window's 1-7 mode shortcuts — those are disabled while a game runs.
    KEY_MAP: dict[int, tuple[int, str]] = {
        Qt.Key.Key_Up: (1, "up"),
        Qt.Key.Key_Down: (1, "down"),
        Qt.Key.Key_Left: (1, "left"),
        Qt.Key.Key_Right: (1, "right"),
        Qt.Key.Key_F: (1, "a"),
        Qt.Key.Key_D: (1, "b"),
        Qt.Key.Key_Return: (1, "start"),
        Qt.Key.Key_Enter: (1, "start"),
        Qt.Key.Key_Shift: (1, "select"),
        Qt.Key.Key_I: (2, "up"),
        Qt.Key.Key_K: (2, "down"),
        Qt.Key.Key_J: (2, "left"),
        Qt.Key.Key_L: (2, "right"),
        Qt.Key.Key_O: (2, "a"),
        Qt.Key.Key_U: (2, "b"),
        Qt.Key.Key_1: (2, "start"),
        Qt.Key.Key_2: (2, "select"),
    }

    #: Shown under the screen so the controls are never a guess.
    CONTROLS_HINT = (
        "P1  ← ↑ → ↓ move · F = A · D = B · Enter = Start        "
        "P2  I J K L move · O = A · U = B · 1 = Start"
    )

    def handle_key(self, key: int, pressed: bool) -> bool:
        """Route a key to the pads. Returns True when the key was consumed."""

        mapping = self.KEY_MAP.get(key)
        if mapping is None or not self._running:
            return False
        player, button = mapping
        self.set_button(player, button, pressed)
        return True

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._nes = None
        self._sink: QAudioSink | None = None
        self._device = None
        self._timer = QTimer(self)
        self._timer.setInterval(4)  # poll faster than a frame; audio sets the pace
        self._timer.timeout.connect(self._tick)
        self._running = False
        self._muted = False
        self._audio_ok = False
        self._reduce_flashing = False
        self._previous_frame: QImage | None = None

    # ---- lifecycle --------------------------------------------------------

    def is_running(self) -> bool:
        return self._running

    def has_audio(self) -> bool:
        return self._audio_ok

    def start(self, rom: bytes) -> None:
        try:
            from nes_core import Nes
        except ImportError as exc:  # pragma: no cover - packaging failure
            raise EmulatorUnavailable(
                "The embedded NES core is not installed (nes_core)."
            ) from exc

        self.stop()
        self._nes = Nes(float(SAMPLE_RATE))
        self._nes.load_rom(rom)
        self._open_audio()

        # With audio, the sink's free space paces us. Without it there is no
        # clock to follow, so fall back to a fixed timestep — a machine with no
        # sound card must still show the game, not a black screen.
        self._timer.setInterval(AUDIO_POLL_MS if self._audio_ok else FIXED_STEP_MS)
        self._running = True
        self._timer.start()

    def _open_audio(self) -> None:
        """Open the speaker, tolerating machines that have none."""

        self._audio_ok = False
        fmt = QAudioFormat()
        fmt.setSampleRate(SAMPLE_RATE)
        fmt.setChannelCount(1)
        fmt.setSampleFormat(QAudioFormat.SampleFormat.Int16)
        try:
            sink = QAudioSink(fmt, self)
            sink.setBufferSize(BYTES_PER_FRAME * BUFFER_FRAMES)
            device = sink.start()
        except Exception:
            self._sink, self._device = None, None
            return
        if device is None or sink.error() not in (
            QAudio.Error.NoError,
            QAudio.Error.UnderrunError,
        ):
            self._sink, self._device = None, None
            return
        self._sink, self._device = sink, device
        self._audio_ok = True

    def stop(self) -> None:
        self._timer.stop()
        if self._sink is not None:
            self._sink.stop()
            self._sink = None
        self._device = None
        self._nes = None
        if self._running:
            self._running = False
            self.stopped.emit()

    def set_muted(self, muted: bool) -> None:
        self._muted = muted

    def set_reduce_flashing(self, reduce: bool) -> None:
        """Damp rapid full-screen brightness swings.

        A pupil's game can strobe the whole screen — that is what the hardware
        does, and we are not going to change their ROM. But a classroom cannot
        know in advance who is photosensitive, so this blends a frame with the
        one before it when the average brightness jumps hard. The game is
        unchanged; only what we *show* is softened.
        """

        self._reduce_flashing = reduce
        if not reduce:
            self._previous_frame = None

    # ---- the loop ---------------------------------------------------------

    def _tick(self) -> None:
        """Emulate as many frames as the audio buffer has room for.

        Pacing on the sink rather than on a 16.67 ms QTimer is what keeps audio
        from underrunning: a timer drifts against the 44.1 kHz clock, and the
        gap shows up as clicks and wobbling music. This is the same problem the
        web hit and solved with a fixed-timestep loop plus a catch-up cap.
        """

        if not self._running or self._nes is None:
            return

        produced = 0
        pixels = None
        try:
            while produced < MAX_CATCH_UP_FRAMES:
                if self._audio_ok:
                    assert self._sink is not None and self._device is not None
                    if self._sink.bytesFree() < BYTES_PER_FRAME:
                        break
                elif produced >= 1:
                    break  # silent fallback: exactly one frame per fixed tick

                pixels, samples = self._nes.clock_frame()
                produced += 1

                if self._audio_ok and self._device is not None:
                    payload = (
                        bytes(len(samples) * BYTES_PER_SAMPLE)
                        if self._muted
                        else self._pcm(samples)
                    )
                    self._device.write(payload)
        except Exception as exc:  # a dead core must not take the app with it
            self.stop()
            self.failed.emit(str(exc))
            return

        if produced:
            # tetanes leaves the alpha byte at zero, so RGBA8888 would render a
            # fully transparent screen. RGBX8888 treats it as padding.
            image = QImage(
                pixels, 256, 240, 256 * 4, QImage.Format.Format_RGBX8888
            ).copy()
            if self._reduce_flashing:
                image = self._damp_flash(image)
            self.frame_ready.emit(image)

    #: A brightness jump bigger than this (0-255) between consecutive frames is a
    #: flash, not a scene change.
    FLASH_THRESHOLD = 40

    def _damp_flash(self, frame: QImage) -> QImage:
        """Blend with the previous frame when the screen brightness jumps hard."""

        previous = self._previous_frame
        self._previous_frame = frame
        if previous is None or previous.size() != frame.size():
            return frame
        if abs(_mean_brightness(frame) - _mean_brightness(previous)) < self.FLASH_THRESHOLD:
            return frame

        blended = QImage(previous)
        painter = QPainter(blended)
        painter.setOpacity(0.5)
        painter.drawImage(0, 0, frame)
        painter.end()
        self._previous_frame = blended
        return blended

    @staticmethod
    def _pcm(samples) -> bytes:
        """Convert the core's f32 samples to the sink's Int16 format."""

        out = array.array("h", bytes(len(samples) * BYTES_PER_SAMPLE))
        for index, value in enumerate(samples):
            if value > 1.0:
                value = 1.0
            elif value < -1.0:
                value = -1.0
            out[index] = int(value * 32767)
        return out.tobytes()

    # ---- input ------------------------------------------------------------

    def set_button(self, player: int, button: str, pressed: bool) -> None:
        if self._nes is not None:
            self._nes.set_button(player, button, pressed)
