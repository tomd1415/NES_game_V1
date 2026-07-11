from __future__ import annotations

import copy
import importlib
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
TOOLS_ROOT = REPOSITORY_ROOT / "tools"
sys.path.insert(0, str(TOOLS_ROOT))

from nes_studio_core import build, preparation  # noqa: E402


def request(custom_c: str | None = None, player2: int | None = None) -> dict:
    body = {
        "state": {"sprites": [{}, {}]},
        "sceneSprites": [{"spriteIdx": 1, "x": 300, "y": 20}],
        "playerSpriteIdx": 0,
    }
    if custom_c is not None:
        body["customMainC"] = custom_c
    if player2 is not None:
        body["playerSpriteIdx2"] = player2
    return body


def test_request_parsing_is_normalized_and_input_immutable() -> None:
    body = request("  source  ", 1)
    body["playerStart"] = {"x": "70", "y": 130}
    before = copy.deepcopy(body)
    parsed = preparation.parse_request(body)
    assert parsed.custom_main_c == "  source  "
    assert parsed.player_index_2 == 1
    assert (parsed.start_x, parsed.start_y) == (70, 130)
    parsed.state["generated"] = True
    assert body == before


def test_request_rejects_conflicting_or_wrong_type_sources() -> None:
    for body in (
        {"state": {}, "customMainC": "c", "customMainAsm": "asm"},
        {"state": {}, "customMainC": 3},
        {"state": []},
    ):
        try:
            preparation.parse_request(body)
        except build.GenerationError:
            pass
        else:
            raise AssertionError(f"invalid request was accepted: {body}")


def test_audio_normalization_stubs_only_the_missing_half_and_enforces_limit() -> None:
    assets = preparation.normalize_audio(
        {"audioSongsAsm": "song"}, songs_stub="silent-song", sfx_stub="silent-sfx"
    )
    assert assets == preparation.AudioAssets("song", "silent-sfx")
    assets = preparation.normalize_audio(
        {"audioSfxAsm": "sfx"}, songs_stub="silent-song", sfx_stub="silent-sfx"
    )
    assert assets == preparation.AudioAssets("silent-song", "sfx")
    try:
        preparation.normalize_audio(
            {"audioSongsAsm": "x" * (preparation.AUDIO_MAX_BYTES + 1)},
            songs_stub="song",
            sfx_stub="sfx",
        )
    except build.GenerationError:
        pass
    else:
        raise AssertionError("oversized audio was accepted")


def test_asm_feature_selection_covers_wide_two_player_and_kill_switch() -> None:
    source = "\n#define NES_ASM_READY_V1\n#define BW_GAME_STYLE 1\nss_ai_type[4]"
    parsed = preparation.parse_request(request(source, 1))
    features = preparation.select_asm_features(
        parsed,
        world_columns=64,
        world_rows=30,
        has_scene_animation=False,
    )
    assert features == preparation.AsmFeatures(
        leaf=True,
        scroll=True,
        scene=True,
        ai=True,
        player=True,
        smb=False,
        racer=False,
        player2=True,
        player_draw=True,
    )
    disabled_draw = preparation.select_asm_features(
        parsed,
        world_columns=64,
        world_rows=30,
        has_scene_animation=False,
        disable_player_draw=True,
    )
    assert not disabled_draw.player_draw


def test_preparation_core_import_has_no_filesystem_side_effects(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.iterdir())
    importlib.reload(preparation)
    assert set(tmp_path.iterdir()) == before
