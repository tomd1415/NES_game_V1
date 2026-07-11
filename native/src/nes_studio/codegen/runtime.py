"""Fresh-isolate QJSEngine execution for trusted bundled generators."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from PySide6.QtCore import QCoreApplication, QObject, Slot
from PySide6.QtQml import QJSEngine, QJSValue


class CodegenError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        filename: str = "",
        line: int = 0,
        stack: str = "",
        console: tuple[tuple[str, str], ...] = (),
    ) -> None:
        super().__init__(message)
        self.filename = filename
        self.line = line
        self.stack = stack
        self.console = console


class CodegenCancelled(CodegenError):
    """Execution was cancelled between trusted script evaluations."""


@dataclass(frozen=True, slots=True)
class CodegenResult:
    value: Any
    console: tuple[tuple[str, str], ...]


class _ConsoleBridge(QObject):
    def __init__(self) -> None:
        super().__init__()
        self.entries: list[tuple[str, str]] = []

    @Slot(str, str)
    def write(self, level: str, message: str) -> None:
        self.entries.append((level, message))


_CONSOLE_SHIM = r"""
var globalThis = this;
globalThis.console = {};
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  globalThis.console[level] = (...args) => {
    const text = args.map(value => {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch (_) { return String(value); }
    }).join(' ');
    globalThis.__codegenConsole.write(level, text);
  };
}
"""


class CodegenRuntime:
    """Evaluate only scripts rooted under a configured trusted directory."""

    def __init__(
        self,
        trusted_root: str | Path,
        *,
        cancelled: Callable[[], bool] | None = None,
    ) -> None:
        self.trusted_root = Path(trusted_root).resolve()
        self.cancelled = cancelled or (lambda: False)

    def evaluate(
        self,
        scripts: Iterable[str | Path],
        expression: str,
        *,
        globals: dict[str, Any] | None = None,
    ) -> CodegenResult:
        QCoreApplication.instance() or QCoreApplication([])
        engine = QJSEngine()
        bridge = _ConsoleBridge()
        engine.globalObject().setProperty("__codegenConsole", engine.newQObject(bridge))
        self._evaluate_value(engine, _CONSOLE_SHIM, "<console-shim>", bridge)
        for name, value in (globals or {}).items():
            if not name.isidentifier():
                raise ValueError(f"Invalid JavaScript global name: {name}")
            engine.globalObject().setProperty(name, engine.toScriptValue(value))
        for script in scripts:
            self._check_cancelled(bridge)
            path = self._trusted_path(script)
            try:
                source = path.read_text(encoding="utf-8")
            except OSError as exc:
                raise CodegenError(str(exc), filename=str(path), console=tuple(bridge.entries)) from exc
            self._evaluate_value(engine, source, str(path), bridge)
        self._check_cancelled(bridge)
        value = self._evaluate_value(engine, expression, "<expression>", bridge)
        return CodegenResult(value.toVariant(), tuple(bridge.entries))

    def _trusted_path(self, script: str | Path) -> Path:
        candidate = Path(script)
        if not candidate.is_absolute():
            candidate = self.trusted_root / candidate
        candidate = candidate.resolve()
        try:
            candidate.relative_to(self.trusted_root)
        except ValueError as exc:
            raise CodegenError(f"Script is outside trusted root: {candidate}") from exc
        if not candidate.is_file():
            raise CodegenError(f"Trusted script does not exist: {candidate}")
        return candidate

    def _check_cancelled(self, bridge: _ConsoleBridge) -> None:
        if self.cancelled():
            raise CodegenCancelled("code generation cancelled", console=tuple(bridge.entries))

    @staticmethod
    def _evaluate_value(
        engine: QJSEngine,
        source: str,
        filename: str,
        bridge: _ConsoleBridge,
    ) -> QJSValue:
        value = engine.evaluate(source, filename, 1)
        if value.isError():
            message = value.toString()
            error_file = value.property("fileName").toString() or filename
            line = value.property("lineNumber").toInt()
            stack = value.property("stack").toString()
            raise CodegenError(
                message,
                filename=error_file,
                line=line,
                stack=stack,
                console=tuple(bridge.entries),
            )
        return value
