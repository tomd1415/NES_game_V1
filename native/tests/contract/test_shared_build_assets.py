from __future__ import annotations

import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT / "tools"))

from nes_studio_core import build_assets  # noqa: E402
import playground_server  # noqa: E402


def test_web_adapter_uses_shared_static_build_assets(monkeypatch) -> None:
    captured = {}

    class Builder:
        def __init__(self, _service, **kwargs):
            captured.update(kwargs)

        def build(self, _body, **_kwargs):
            return b"ROM", ""

    monkeypatch.setattr(playground_server.preparation_core, "ProjectBuilder", Builder)
    assert playground_server._build_rom({"state": {}}) == (b"ROM", "")
    assert captured == {
        "asm_makefile": build_assets.ASM_MAKEFILE,
        "songs_stub": build_assets.AUTO_SONGS_STUB_ASM,
        "sfx_stub": build_assets.AUTO_SFX_STUB_ASM,
    }


def test_shared_asm_makefile_keeps_the_native_assembly_contract() -> None:
    assert "ca65" in build_assets.ASM_MAKEFILE
    assert "src/scene.asminc" in build_assets.ASM_MAKEFILE
    assert "game.nes" in build_assets.ASM_MAKEFILE
