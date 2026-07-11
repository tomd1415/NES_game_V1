"""Injected, transport-independent isolated NES build workspaces."""

from __future__ import annotations

import re
import shutil
import stat
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from threading import BoundedSemaphore
from typing import Any, Callable


class BuildError(RuntimeError):
    """A compiler failed or did not produce the expected ROM."""


class ToolchainError(BuildError):
    """The compiler process could not be started or timed out."""


class GenerationError(ValueError):
    """Project data could not be converted into generated build inputs."""


class Cancelled(BuildError):
    """A queued build was cancelled before producing an artifact."""


@dataclass(frozen=True, slots=True)
class BuildProfile:
    name: str
    timeout_seconds: float | None
    max_rom_bytes: int


TRUSTED_LOCAL = BuildProfile("trusted-local", None, 4 * 1024 * 1024)
SANDBOXED_REMOTE = BuildProfile("sandboxed-remote", 30.0, 1024 * 1024)


@dataclass(frozen=True, slots=True)
class CBuildInputs:
    chr_bytes: bytes
    nam_bytes: bytes
    palettes_source: str
    scene_source: str
    collision_header: str
    behaviour_source: str
    world_header: str
    world_source: str
    custom_main: str | None = None
    project_inc: str | None = None
    audio_songs_asm: str | None = None
    audio_sfx_asm: str | None = None
    asm_flags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class AsmBuildInputs:
    custom_main: str
    chr_bytes: bytes
    nam_bytes: bytes
    palettes_source: str
    scene_source: str


Runner = Callable[..., Any]


class BuildService:
    def __init__(
        self,
        step_directory: Path,
        *,
        audio_engine_directory: Path | None = None,
        semaphore: BoundedSemaphore | None = None,
        runner: Runner = subprocess.run,
        profile: BuildProfile = TRUSTED_LOCAL,
        cancelled: Callable[[], bool] | None = None,
    ) -> None:
        self.step_directory = Path(step_directory)
        self.audio_engine_directory = (
            Path(audio_engine_directory) if audio_engine_directory is not None else None
        )
        self.semaphore = semaphore or BoundedSemaphore(1)
        self.runner = runner
        self.profile = profile
        self.cancelled = cancelled or (lambda: False)

    def build_c(self, inputs: CBuildInputs) -> tuple[bytes, str]:
        with tempfile.TemporaryDirectory(prefix="nesgame_build_") as directory:
            root = self._clone(Path(directory))
            if inputs.custom_main is not None:
                (root / "src" / "main.c").write_text(inputs.custom_main)
            self._write_assets(root, inputs.chr_bytes, inputs.nam_bytes)
            sources = {
                "scene.inc": inputs.scene_source,
                "palettes.inc": inputs.palettes_source,
                "collision.h": inputs.collision_header,
                "behaviour.c": inputs.behaviour_source,
                "bg_world.h": inputs.world_header,
                "bg_world.c": inputs.world_source,
            }
            for name, source in sources.items():
                (root / "src" / name).write_text(source)
            if inputs.project_inc:
                (root / "src" / "project.inc").write_text(inputs.project_inc)

            arguments = ["make", "-C", str(root), *inputs.asm_flags]
            if inputs.audio_songs_asm and inputs.audio_sfx_asm:
                (root / "src" / "audio_songs.s").write_text(stage_audio_asm(inputs.audio_songs_asm))
                (root / "src" / "audio_sfx.s").write_text(stage_audio_asm(inputs.audio_sfx_asm))
                arguments.append("USE_AUDIO=1")
                if self.audio_engine_directory is None:
                    raise BuildError("audio build requested without an audio engine directory")
                arguments.append(f"FAMISTUDIO_DIR={self.audio_engine_directory}")
            return self._run(root, arguments)

    def build_asm(self, inputs: AsmBuildInputs, makefile: str) -> tuple[bytes, str]:
        with tempfile.TemporaryDirectory(prefix="nesgame_build_asm_") as directory:
            root = self._clone(Path(directory))
            for orphan in ("main.c", "scene.inc", "palettes.inc"):
                (root / "src" / orphan).unlink(missing_ok=True)
            (root / "src" / "main.s").write_text(inputs.custom_main)
            (root / "src" / "scene.asminc").write_text(inputs.scene_source)
            (root / "src" / "palettes.asminc").write_text(inputs.palettes_source)
            self._write_assets(root, inputs.chr_bytes, inputs.nam_bytes)
            (root / "Makefile").write_text(makefile)
            return self._run(root, ["make", "-C", str(root)])

    def _clone(self, temporary_directory: Path) -> Path:
        root = temporary_directory / "Step_Playground"
        shutil.copytree(
            self.step_directory,
            root,
            ignore=shutil.ignore_patterns("game.nes", "*.o", "*.map", "build"),
        )
        # Installed resources may be mounted or packaged read-only. copytree
        # preserves those modes, but generated sources must replace files in
        # the disposable clone. Never chmod the source tree itself.
        for path in (root, *root.rglob("*")):
            path.chmod(path.stat().st_mode | stat.S_IWUSR)
        return root

    @staticmethod
    def _write_assets(root: Path, chr_bytes: bytes, nam_bytes: bytes) -> None:
        sprites = root / "assets" / "sprites"
        backgrounds = root / "assets" / "backgrounds"
        sprites.mkdir(parents=True, exist_ok=True)
        backgrounds.mkdir(parents=True, exist_ok=True)
        (sprites / "game.chr").write_bytes(chr_bytes)
        (backgrounds / "level.nam").write_bytes(nam_bytes)

    def _run(self, root: Path, arguments: list[str]) -> tuple[bytes, str]:
        if self.cancelled():
            raise Cancelled("build cancelled before toolchain start")
        try:
            with self.semaphore:
                if self.cancelled():
                    raise Cancelled("build cancelled while waiting for toolchain")
                result = self.runner(
                    arguments,
                    capture_output=True,
                    text=True,
                    timeout=self.profile.timeout_seconds,
                )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ToolchainError(str(exc)) from exc
        if self.cancelled():
            raise Cancelled("build cancelled after toolchain completion")
        log = (result.stdout or "") + (result.stderr or "")
        log = log.replace(str(root) + "/", "").replace(str(root), "")
        if result.returncode != 0:
            raise BuildError(log)
        rom_path = root / "game.nes"
        if not rom_path.exists():
            raise BuildError(log + "\ngame.nes missing after build")
        rom = rom_path.read_bytes()
        if len(rom) > self.profile.max_rom_bytes:
            raise BuildError(
                f"game.nes is {len(rom)} bytes; profile limit is {self.profile.max_rom_bytes}"
            )
        return rom, log


_AUDIO_PRELUDE = """\
; Auto-prepended by playground_server.py — see _AUDIO_ASM_PRELUDE
; in tools/playground_server.py for the why.  Defines symbols that
; newer FamiStudio exports test via `.if`, so ca65 can evaluate
; them as constant 0 instead of erroring with "Constant expression
; expected".
.ifndef FAMISTUDIO_CFG_C_BINDINGS
FAMISTUDIO_CFG_C_BINDINGS = 0
.endif

"""
_AUDIO_CONFIG_RE = re.compile(r"^\s*FAMISTUDIO_CFG_C_BINDINGS\s*=", re.MULTILINE)


def stage_audio_asm(source: str) -> str:
    if not source or _AUDIO_CONFIG_RE.search(source):
        return source
    return _AUDIO_PRELUDE + source
