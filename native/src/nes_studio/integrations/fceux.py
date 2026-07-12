"""Capability-gated external FCEUX launch for native ROM artifacts."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


class EmulatorLaunchError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class FceuxLauncher:
    executable: str

    @classmethod
    def discover(
        cls, which: Callable[[str], str | None] = shutil.which
    ) -> "FceuxLauncher | None":
        executable = which("fceux")
        return cls(executable) if executable else None

    def launch(
        self,
        rom: bytes,
        destination: str | Path,
        *,
        runner: Callable[..., object] = subprocess.Popen,
    ) -> Path:
        target = Path(destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(
            prefix=f".{target.name}.", suffix=".tmp", dir=target.parent
        )
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(rom)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        except OSError as exc:
            Path(temporary).unlink(missing_ok=True)
            raise EmulatorLaunchError(f"Could not stage ROM for FCEUX: {exc}") from exc
        try:
            runner(
                [self.executable, str(target)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as exc:
            raise EmulatorLaunchError(f"Could not start FCEUX: {exc}") from exc
        return target
