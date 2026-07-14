"""Direct native project-to-ROM adapter with no HTTP or browser dependency."""

from __future__ import annotations

import hashlib
import importlib
import sys
from dataclasses import dataclass
from typing import Any

from nes_studio.codegen.differential import CodegenDifferential
from nes_studio.core.build_request import BuildRequestFactory
from nes_studio.core.project_document import ProjectDocument
from nes_studio.core.resources import ResourceLocator


class NativeBuildUnavailable(RuntimeError):
    """The installed application is missing immutable build resources."""


@dataclass(frozen=True, slots=True)
class NativeBuildResult:
    rom: bytes
    log: str
    request_sha256: str


class DirectBuildController:
    """Construct and execute a detached native build using the shared core."""

    def __init__(self, resources: ResourceLocator) -> None:
        self.resources = resources

    def build(self, document: ProjectDocument) -> NativeBuildResult:
        core = self._core()
        if not self.resources.source_checkout:
            raise NativeBuildUnavailable(
                "This installation does not include the native build resources yet"
            )
        source = CodegenDifferential(self.resources.root)
        factory = BuildRequestFactory(
            target_engine=document.engine_version,
            builder_defaults=source.default_builder(),
            assembler=source.assemble,
        )
        request = factory.create(
            document.immutable_snapshot(), mode="native",
            custom_main_c=document.custom_source("c"),
            custom_main_asm=document.custom_source("asm"),
        )
        audio = self.resources.root / "tools" / "audio" / "famistudio"
        service = core.build.BuildService(
            self.resources.playground_dir,
            audio_engine_directory=audio if audio.is_dir() else None,
        )
        builder = core.preparation.ProjectBuilder(
            service,
            asm_makefile=core.build_assets.ASM_MAKEFILE,
            songs_stub=core.build_assets.AUTO_SONGS_STUB_ASM,
            sfx_stub=core.build_assets.AUTO_SFX_STUB_ASM,
        )
        rom, log = builder.build(request.to_dict())
        return NativeBuildResult(rom, log, hashlib.sha256(request.json_bytes).hexdigest())

    def _core(self) -> Any:
        try:
            return _SharedCore.load()
        except ModuleNotFoundError:
            if not self.resources.source_checkout:
                raise NativeBuildUnavailable("Shared build core is not installed") from None
            tools = str(self.resources.root / "tools")
            if tools not in sys.path:
                sys.path.insert(0, tools)
            try:
                return _SharedCore.load()
            except ModuleNotFoundError as exc:
                raise NativeBuildUnavailable("Shared build core could not be loaded") from exc


@dataclass(frozen=True, slots=True)
class _SharedCore:
    build: Any
    build_assets: Any
    preparation: Any

    @classmethod
    def load(cls) -> "_SharedCore":
        return cls(
            build=importlib.import_module("nes_studio_core.build"),
            build_assets=importlib.import_module("nes_studio_core.build_assets"),
            preparation=importlib.import_module("nes_studio_core.preparation"),
        )
