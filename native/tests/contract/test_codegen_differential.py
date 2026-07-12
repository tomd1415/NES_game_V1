from __future__ import annotations

import sys
import json
import os
import subprocess
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
NATIVE_ROOT = REPOSITORY_ROOT / "native"
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.codegen import CodegenDifferential  # noqa: E402


def representative_project() -> dict:
    return {
        "name": "hostile </script> ' \" ${value} Ω",
        "sprites": [
            {
                "name": "hero",
                "role": "player",
                "width": 1,
                "height": 1,
                "cells": [[{"tile": 1, "palette": 0, "empty": False}]],
            }
        ],
        "backgrounds": [
            {
                "dimensions": {"screens_x": 1, "screens_y": 1},
                "nametable": [],
            }
        ],
    }


def test_current_builder_output_is_byte_identical_in_qjs_and_node() -> None:
    result = CodegenDifferential(REPOSITORY_ROOT).compare(representative_project())
    assert result.matched
    assert result.qjs_source == result.node_source
    assert result.qjs_sha256 == result.node_sha256
    assert "#include" in result.qjs_source


def test_v62_snapshot_output_is_byte_identical_in_qjs_and_node() -> None:
    snapshot = REPOSITORY_ROOT / "tools" / "engines" / "v62"
    result = CodegenDifferential(snapshot).compare(representative_project())
    assert result.matched
    assert result.qjs_sha256 == result.node_sha256


def test_headless_codegen_cli_reports_machine_readable_match(tmp_path: Path) -> None:
    project_path = tmp_path / "project.json"
    project_path.write_text(json.dumps(representative_project()))
    process = subprocess.run(
        [
            sys.executable,
            "-m",
            "nes_studio.codegen.cli",
            "--root",
            str(REPOSITORY_ROOT),
            "--project",
            str(project_path),
            "--json",
        ],
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(NATIVE_ROOT / "src")},
    )
    assert process.returncode == 0, process.stderr
    payload = json.loads(process.stdout)
    assert payload["matched"] is True
    assert payload["qjs_sha256"] == payload["node_sha256"]
