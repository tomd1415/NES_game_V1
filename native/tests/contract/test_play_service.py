from __future__ import annotations

import base64
import importlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import build, play  # noqa: E402


def test_browser_play_wraps_exact_build_artifact() -> None:
    service = play.PlayService(lambda _request: (b"ROM", "clean"))
    result = service.run({}, target_engine=62, current_engine=63)
    assert result["ok"] is True
    assert result["stage"] == "built"
    assert base64.b64decode(result["rom_b64"]) == b"ROM"
    assert result["size"] == 3
    assert result["engineVersion"] == 62
    assert result["engineLatest"] == 63


def test_build_and_generation_failures_have_distinct_stages() -> None:
    def fail_build(_request):
        raise build.BuildError("compiler log")

    result = play.PlayService(fail_build).run({}, target_engine=1, current_engine=1)
    assert result["stage"] == "build"
    assert result["log"] == "compiler log"

    def fail_generation(_request):
        raise build.GenerationError("bad project")

    result = play.PlayService(fail_generation).run({}, target_engine=1, current_engine=1)
    assert result["stage"] == "generate"
    assert result["log"].startswith("GenerationError: bad project")


def test_native_fallback_returns_rom_when_launcher_is_unavailable() -> None:
    service = play.PlayService(lambda _request: (b"ROM", ""))
    result = service.run(
        {"mode": "native"}, target_engine=1, current_engine=1
    )
    assert result["stage"] == "launched-browser-fallback"
    assert base64.b64decode(result["rom_b64"]) == b"ROM"


def test_native_launch_stages_exact_rom_and_invokes_injected_launcher(tmp_path: Path) -> None:
    calls = []

    def launcher(arguments, **kwargs):
        calls.append((arguments, kwargs))

    rom_path = tmp_path / "latest.nes"
    service = play.PlayService(
        lambda _request: (b"ROM", "log"),
        native_executable="fceux",
        native_rom_path=rom_path,
        launcher=launcher,
    )
    result = service.run({"mode": "native"}, target_engine=1, current_engine=1)
    assert result["stage"] == "launched-native"
    assert rom_path.read_bytes() == b"ROM"
    assert calls[0][0] == ["fceux", str(rom_path)]


def test_play_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(play)
    assert set(tmp_path.iterdir()) == before
