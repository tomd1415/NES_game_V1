from __future__ import annotations

import copy
from pathlib import Path

from nes_studio.core.project_document import ProjectDocument
from nes_studio.core.resources import ResourceLocator
from nes_studio.integrations.direct_build import DirectBuildController


def test_direct_build_returns_a_rom_without_mutating_the_live_document(monkeypatch, tmp_path: Path) -> None:
    document = ProjectDocument.preview()
    before = copy.deepcopy(document.state)
    controller = DirectBuildController(ResourceLocator.from_root(tmp_path, source_checkout=True))

    class Differential:
        def __init__(self, _root):
            pass

        def default_builder(self):
            return {"version": 1, "modules": {}}

        def assemble(self, _project):
            return "generated C"

    class Service:
        def __init__(self, *_args, **_kwargs):
            pass

    class Builder:
        def __init__(self, _service, **_kwargs):
            pass

        def build(self, request):
            request["state"]["mutated_by_build"] = True
            return b"NES\\x1a", "built"

    class Core:
        class build:
            BuildService = Service

        class build_assets:
            ASM_MAKEFILE = "asm"
            AUTO_SONGS_STUB_ASM = "songs"
            AUTO_SFX_STUB_ASM = "sfx"

        class preparation:
            ProjectBuilder = Builder

    monkeypatch.setattr("nes_studio.integrations.direct_build.CodegenDifferential", Differential)
    monkeypatch.setattr(controller, "_core", lambda: Core)
    result = controller.build(document)
    assert result.rom == b"NES\\x1a"
    assert result.log == "built"
    assert len(result.request_sha256) == 64
    assert document.state == before
