from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import build  # noqa: E402
import playground_server  # noqa: E402


def make_step(root: Path) -> Path:
    step = root / "Step"
    (step / "src").mkdir(parents=True)
    (step / "src" / "main.c").write_text("stock")
    (step / "assets").mkdir()
    (step / "Makefile").write_text("all:")
    return step


def inputs() -> build.CBuildInputs:
    return build.CBuildInputs(
        chr_bytes=b"chr",
        nam_bytes=b"nam",
        palettes_source="pal",
        scene_source="scene",
        collision_header="collision",
        behaviour_source="behaviour",
        world_header="world-h",
        world_source="world-c",
        custom_main="custom",
        project_inc="project",
        asm_flags=("NES_ASM_LEAF=1",),
    )


def test_c_build_stages_an_isolated_workspace_and_returns_rom(tmp_path: Path) -> None:
    step = make_step(tmp_path)
    observed = {}

    def runner(arguments, **kwargs):
        root = Path(arguments[2])
        observed["arguments"] = arguments
        observed["main"] = (root / "src" / "main.c").read_text()
        observed["scene"] = (root / "src" / "scene.inc").read_text()
        observed["chr"] = (root / "assets" / "sprites" / "game.chr").read_bytes()
        (root / "game.nes").write_bytes(b"NES-ROM")
        return SimpleNamespace(returncode=0, stdout=f"built {root}/src/main.c\n", stderr="")

    service = build.BuildService(step, runner=runner)
    rom, log = service.build_c(inputs())
    assert rom == b"NES-ROM"
    assert observed == {
        "arguments": ["make", "-C", observed["arguments"][2], "NES_ASM_LEAF=1"],
        "main": "custom",
        "scene": "scene",
        "chr": b"chr",
    }
    assert "Step_Playground" not in log
    assert (step / "src" / "main.c").read_text() == "stock"
    assert not (step / "game.nes").exists()


def test_build_failures_are_structured_and_missing_rom_is_rejected(tmp_path: Path) -> None:
    step = make_step(tmp_path)
    failing = build.BuildService(
        step,
        runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=2, stdout="", stderr="bad"),
    )
    try:
        failing.build_c(inputs())
    except build.BuildError as exc:
        assert str(exc) == "bad"
    else:
        raise AssertionError("failed compiler was accepted")

    missing = build.BuildService(
        step,
        runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=0, stdout="ok", stderr=""),
    )
    try:
        missing.build_c(inputs())
    except build.BuildError as exc:
        assert "game.nes missing" in str(exc)
    else:
        raise AssertionError("missing ROM was accepted")


def test_build_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(build)
    assert set(tmp_path.iterdir()) == before


def test_asm_build_replaces_c_sources_and_stages_generated_inputs(tmp_path: Path) -> None:
    step = make_step(tmp_path)
    observed = {}

    def runner(arguments, **_kwargs):
        root = Path(arguments[2])
        observed["main_c_exists"] = (root / "src" / "main.c").exists()
        observed["main_s"] = (root / "src" / "main.s").read_text()
        observed["scene"] = (root / "src" / "scene.asminc").read_text()
        observed["makefile"] = (root / "Makefile").read_text()
        (root / "game.nes").write_bytes(b"ASM-ROM")
        return SimpleNamespace(returncode=0, stdout="assembled", stderr="")

    service = build.BuildService(step, runner=runner)
    rom, _log = service.build_asm(
        build.AsmBuildInputs("main-asm", b"chr", b"nam", "pal-asm", "scene-asm"),
        "asm-makefile",
    )
    assert rom == b"ASM-ROM"
    assert observed == {
        "main_c_exists": False,
        "main_s": "main-asm",
        "scene": "scene-asm",
        "makefile": "asm-makefile",
    }


def test_remote_profile_rejects_oversized_rom(tmp_path: Path) -> None:
    step = make_step(tmp_path)

    def runner(arguments, **_kwargs):
        root = Path(arguments[2])
        (root / "game.nes").write_bytes(b"x" * 9)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    profile = build.BuildProfile("tiny-test", 1.0, 8)
    service = build.BuildService(step, runner=runner, profile=profile)
    try:
        service.build_c(inputs())
    except build.BuildError as exc:
        assert "profile limit is 8" in str(exc)
    else:
        raise AssertionError("oversized ROM was accepted")


def test_audio_staging_preserves_existing_config_or_adds_guarded_prelude() -> None:
    configured = "FAMISTUDIO_CFG_C_BINDINGS = 1\nsource"
    assert build.stage_audio_asm(configured) == configured
    staged = build.stage_audio_asm("source")
    assert staged.endswith("source")
    assert ".ifndef FAMISTUDIO_CFG_C_BINDINGS" in staged


def test_server_build_orchestration_never_mutates_caller_project(monkeypatch) -> None:
    project = {"marker": ["original"]}

    def mutate_then_stop(state):
        state["marker"].append("generated")
        raise RuntimeError("stop after mutation probe")

    monkeypatch.setattr(playground_server, "_expand_metatiles", mutate_then_stop)
    try:
        playground_server._build_rom({"state": project})
    except RuntimeError as exc:
        assert str(exc) == "stop after mutation probe"
    else:
        raise AssertionError("mutation probe did not stop build")
    assert project == {"marker": ["original"]}
