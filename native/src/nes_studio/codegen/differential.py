"""Node reference versus QJSEngine differential code-generation runner."""

from __future__ import annotations

import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .runtime import CodegenRuntime

ASSEMBLE_EXPRESSION = (
    "BuilderAssembler.assemble("
    "Object.assign({}, project, {builder: project.builder || BuilderDefaults()}), template)"
)

_NODE_RUNNER = r"""
const fs = require('fs');
const vm = require('vm');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const entries = [];
const context = {
  project: payload.project,
  template: payload.template,
  console: {},
};
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  context.console[level] = (...args) => entries.push([level, args.map(value => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }).join(' ')]);
}
context.window = context;
context.self = context;
context.globalThis = context;
vm.createContext(context);
for (const path of payload.scripts) {
  vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
}
const value = vm.runInContext(payload.expression, context, { filename: '<expression>' });
process.stdout.write(JSON.stringify({ value, console: entries }));
"""


@dataclass(frozen=True, slots=True)
class DifferentialResult:
    matched: bool
    qjs_source: str
    node_source: str
    qjs_sha256: str
    node_sha256: str


@dataclass(frozen=True, slots=True)
class SnapshotResult:
    version: int
    matched: bool
    qjs_sha256: str
    node_sha256: str
    error: str = ""


class CodegenDifferential:
    def __init__(self, source_root: str | Path, *, node: str = "node") -> None:
        self.source_root = Path(source_root).resolve()
        self.node = node

    def compare(self, project: dict[str, Any]) -> DifferentialResult:
        web, scripts = self._sources()
        template = (web / "builder-templates" / "platformer.c").read_text(encoding="utf-8")
        runtime = CodegenRuntime(self.source_root)
        relative_scripts = [path.relative_to(self.source_root) for path in scripts]
        qjs = runtime.evaluate(
            relative_scripts,
            ASSEMBLE_EXPRESSION,
            globals={"project": project, "template": template},
        ).value
        node = self._node_generate(scripts, template, project)
        if not isinstance(qjs, str) or not isinstance(node, str):
            raise TypeError("Builder assembler did not return source text")
        return DifferentialResult(
            matched=qjs == node,
            qjs_source=qjs,
            node_source=node,
            qjs_sha256=_sha256(qjs),
            node_sha256=_sha256(node),
        )

    def assemble(self, project: dict[str, Any]) -> str:
        """Run the trusted bundled generator without invoking the Node oracle."""

        web, scripts = self._sources()
        template = (web / "builder-templates" / "platformer.c").read_text(encoding="utf-8")
        runtime = CodegenRuntime(self.source_root)
        result = runtime.evaluate(
            [path.relative_to(self.source_root) for path in scripts],
            ASSEMBLE_EXPRESSION,
            globals={"project": project, "template": template},
        ).value
        if not isinstance(result, str):
            raise TypeError("Builder assembler did not return source text")
        return result

    def default_builder(self) -> dict[str, Any]:
        _web, scripts = self._sources()
        runtime = CodegenRuntime(self.source_root)
        value = runtime.evaluate(
            [path.relative_to(self.source_root) for path in scripts],
            "BuilderDefaults()",
        ).value
        if not isinstance(value, dict):
            raise TypeError("BuilderDefaults() did not return an object")
        return value

    def _sources(self) -> tuple[Path, list[Path]]:
        web = self.source_root / "tools" / "tile_editor_web"
        return web, [web / "builder-assembler.js", web / "builder-modules.js"]

    def _node_generate(
        self, scripts: list[Path], template: str, project: dict[str, Any]
    ) -> str:
        payload = json.dumps(
            {
                "scripts": [str(path) for path in scripts],
                "template": template,
                "project": project,
                "expression": ASSEMBLE_EXPRESSION,
            }
        )
        process = subprocess.run(
            [self.node, "-e", _NODE_RUNNER],
            input=payload,
            capture_output=True,
            text=True,
        )
        if process.returncode != 0:
            raise RuntimeError(process.stderr or process.stdout or "Node codegen failed")
        return json.loads(process.stdout)["value"]


def compare_engine_snapshots(
    repository_root: str | Path,
    project: dict[str, Any],
    *,
    node: str = "node",
) -> tuple[SnapshotResult, ...]:
    root = Path(repository_root).resolve()
    results = []
    for version in range(1, 64):
        snapshot = root / "tools" / "engines" / f"v{version}"
        try:
            result = CodegenDifferential(snapshot, node=node).compare(project)
            results.append(
                SnapshotResult(
                    version,
                    result.matched,
                    result.qjs_sha256,
                    result.node_sha256,
                )
            )
        except Exception as exc:
            results.append(SnapshotResult(version, False, "", "", f"{type(exc).__name__}: {exc}"))
    return tuple(results)


def _sha256(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()
