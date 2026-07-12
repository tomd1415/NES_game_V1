from __future__ import annotations

import subprocess
from pathlib import Path

from nes_studio.integrations.fceux import EmulatorLaunchError, FceuxLauncher


def test_launcher_is_explicitly_unavailable_without_fceux() -> None:
    assert FceuxLauncher.discover(lambda _name: None) is None


def test_launcher_stages_exact_rom_then_uses_argument_array(tmp_path: Path) -> None:
    calls = []
    launcher = FceuxLauncher("/usr/bin/fceux")
    target = launcher.launch(
        b"NES\x1a",
        tmp_path / "roms" / "latest.nes",
        runner=lambda arguments, **kwargs: calls.append((arguments, kwargs)),
    )
    assert target.read_bytes() == b"NES\x1a"
    assert calls == [
        (
            ["/usr/bin/fceux", str(target)],
            {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "start_new_session": True},
        )
    ]


def test_launcher_reports_process_start_failure_after_preserving_rom(tmp_path: Path) -> None:
    target = tmp_path / "latest.nes"
    launcher = FceuxLauncher("fceux")
    try:
        launcher.launch(b"ROM", target, runner=lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("missing")))
    except EmulatorLaunchError as exc:
        assert "Could not start FCEUX" in str(exc)
    else:
        raise AssertionError("launch failure was accepted")
    assert target.read_bytes() == b"ROM"
