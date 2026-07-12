from __future__ import annotations

import io
import json
import sys
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.core.project_cli import main  # noqa: E402


def legacy_project() -> dict:
    return {
        "name": "CLI caf\u00e9",
        "nametable": [
            [{"tile": 0, "palette": 0, "futureCell": "kept"} for _ in range(32)]
            for _ in range(30)
        ],
        "futureClient": {"opaque": [1, 2, 3]},
    }


def invoke(argv: list[str], payload: bytes = b"") -> tuple[int, bytes, bytes]:
    stdout, stderr = io.BytesIO(), io.BytesIO()
    status = main(argv, stdin=io.BytesIO(payload), stdout=stdout, stderr=stderr)
    return status, stdout.getvalue(), stderr.getvalue()


def test_stdin_stdout_normalization_is_idempotent_and_preserves_unknown_fields() -> None:
    source = json.dumps(legacy_project(), ensure_ascii=False).encode()
    status, normalized, errors = invoke(["-"], source)
    assert status == 0
    assert errors == b""
    state = json.loads(normalized)
    assert state["futureClient"] == {"opaque": [1, 2, 3]}
    assert state["backgrounds"][0]["nametable"][0][0]["futureCell"] == "kept"
    assert invoke(["-"], normalized) == (0, normalized, b"")


def test_file_import_export_matches_stream_contract(tmp_path: Path) -> None:
    source_path = tmp_path / "browser-export.json"
    output_path = tmp_path / "native-export.json"
    source_path.write_text(json.dumps(legacy_project()), encoding="utf-8")
    status, stdout, stderr = invoke([str(source_path), str(output_path)])
    assert (status, stdout, stderr) == (0, b"", b"")
    stream_result = invoke(["-"], source_path.read_bytes())
    assert output_path.read_bytes() == stream_result[1]


def test_check_mode_and_invalid_input_have_stable_exit_codes() -> None:
    valid = json.dumps(legacy_project()).encode()
    assert invoke(["--check", "-"], valid) == (0, b"", b"")
    status, stdout, stderr = invoke(["--check", "-"], b'{"backgrounds": []}')
    assert status == 2
    assert stdout == b""
    assert b"backgrounds" in stderr
