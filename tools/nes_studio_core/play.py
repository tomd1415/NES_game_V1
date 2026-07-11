"""Transport-independent build/play result orchestration."""

from __future__ import annotations

import base64
import subprocess
import time
import traceback
from pathlib import Path
from typing import Any, Callable

from . import build as build_core

BuildCallable = Callable[[dict[str, Any]], tuple[bytes, str]]


class PlayService:
    def __init__(
        self,
        build_project: BuildCallable,
        *,
        native_executable: str | None = None,
        native_rom_path: Path | None = None,
        launcher: Callable[..., Any] = subprocess.Popen,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.build_project = build_project
        self.native_executable = native_executable
        self.native_rom_path = Path(native_rom_path) if native_rom_path else None
        self.launcher = launcher
        self.clock = clock

    def run(
        self,
        request: dict[str, Any],
        *,
        target_engine: int,
        current_engine: int,
    ) -> dict[str, Any]:
        mode = str(request.get("mode") or "browser").lower()
        started = self.clock()
        try:
            rom_bytes, build_log = self.build_project(request)
        except build_core.BuildError as exc:
            return {
                "ok": False,
                "stage": "build",
                "log": str(exc),
                "build_time_ms": int((self.clock() - started) * 1000),
            }
        except Exception as exc:
            return {
                "ok": False,
                "stage": "generate",
                "log": f"{type(exc).__name__}: {exc}\n\n{traceback.format_exc()}",
                "build_time_ms": int((self.clock() - started) * 1000),
            }

        built_epoch = self.clock()
        result: dict[str, Any] = {
            "ok": True,
            "log": build_log,
            "size": len(rom_bytes),
            "built_epoch": built_epoch,
            "built_iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(built_epoch)),
            "build_time_ms": int((built_epoch - started) * 1000),
            "engineVersion": target_engine,
            "engineLatest": current_engine,
        }
        if mode == "native":
            return self._launch_native(result, rom_bytes, build_log)
        result["stage"] = "built"
        result["rom_b64"] = base64.b64encode(rom_bytes).decode("ascii")
        return result

    def _launch_native(
        self, result: dict[str, Any], rom_bytes: bytes, build_log: str
    ) -> dict[str, Any]:
        if not self.native_executable or self.native_rom_path is None:
            result["stage"] = "launched-browser-fallback"
            result["warning"] = (
                "fceux is not installed on the server; returning ROM for in-browser "
                "play instead."
            )
            result["rom_b64"] = base64.b64encode(rom_bytes).decode("ascii")
            return result
        try:
            self.native_rom_path.write_bytes(rom_bytes)
        except Exception as exc:
            return {
                "ok": False,
                "stage": "launch",
                "log": build_log + f"\nfailed to stage ROM for fceux: {exc}",
            }
        try:
            self.launcher(
                [self.native_executable, str(self.native_rom_path)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception as exc:
            return {
                "ok": False,
                "stage": "launch",
                "log": build_log + f"\nfailed to launch fceux: {exc}",
            }
        result["stage"] = "launched-native"
        return result
