from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.codegen.runtime import (  # noqa: E402
    CodegenCancelled,
    CodegenError,
    CodegenRuntime,
)


def test_runtime_evaluates_trusted_scripts_with_globals_and_console(tmp_path: Path) -> None:
    script = tmp_path / "generator.js"
    script.write_text(
        "console.info('generating', project.name);\n"
        "globalThis.generate = () => ({ source: project.name.toUpperCase(), count: 2 });\n"
    )
    result = CodegenRuntime(tmp_path).evaluate(
        ["generator.js"], "generate()", globals={"project": {"name": "hero"}}
    )
    assert result.value == {"source": "HERO", "count": 2}
    assert result.console == (("info", "generating hero"),)


def test_every_evaluation_uses_a_fresh_isolate(tmp_path: Path) -> None:
    script = tmp_path / "counter.js"
    script.write_text("globalThis.counter = (globalThis.counter || 0) + 1;")
    runtime = CodegenRuntime(tmp_path)
    assert runtime.evaluate([script], "counter").value == 1
    assert runtime.evaluate([script], "counter").value == 1


def test_runtime_rejects_scripts_outside_trusted_root(tmp_path: Path) -> None:
    trusted = tmp_path / "trusted"
    trusted.mkdir()
    outside = tmp_path / "outside.js"
    outside.write_text("1")
    try:
        CodegenRuntime(trusted).evaluate([outside], "1")
    except CodegenError as exc:
        assert "outside trusted root" in str(exc)
    else:
        raise AssertionError("untrusted script executed")


def test_runtime_reports_javascript_filename_line_stack_and_console(tmp_path: Path) -> None:
    script = tmp_path / "broken.js"
    script.write_text("console.warn('before failure');\nthrow new Error('broken');\n")
    try:
        CodegenRuntime(tmp_path).evaluate([script], "1")
    except CodegenError as exc:
        assert "broken" in str(exc)
        assert exc.filename.endswith("broken.js")
        assert exc.line == 2
        assert "broken.js" in exc.stack
        assert exc.console == (("warn", "before failure"),)
    else:
        raise AssertionError("JavaScript error was accepted")


def test_runtime_honours_cancellation_before_script_execution(tmp_path: Path) -> None:
    script = tmp_path / "never.js"
    script.write_text("throw new Error('must not execute')")
    try:
        CodegenRuntime(tmp_path, cancelled=lambda: True).evaluate([script], "1")
    except CodegenCancelled:
        pass
    else:
        raise AssertionError("cancelled code generation executed")
