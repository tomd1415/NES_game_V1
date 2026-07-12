"""Command-line Node/QJSEngine compatibility check."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .differential import CodegenDifferential


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="live repository or engine snapshot root")
    parser.add_argument("--project", type=Path, help="representative project JSON object")
    parser.add_argument("--node", default="node", help="Node executable used as the reference")
    parser.add_argument("--json", action="store_true", help="emit machine-readable result JSON")
    args = parser.parse_args(argv)
    project = {}
    if args.project:
        project = json.loads(args.project.read_text(encoding="utf-8"))
        if not isinstance(project, dict):
            parser.error("--project must contain a JSON object")
    result = CodegenDifferential(args.root, node=args.node).compare(project)
    payload = {
        "matched": result.matched,
        "qjs_sha256": result.qjs_sha256,
        "node_sha256": result.node_sha256,
    }
    if args.json:
        print(json.dumps(payload, sort_keys=True))
    else:
        status = "PASS" if result.matched else "FAIL"
        print(f"{status} QJSEngine={result.qjs_sha256} Node={result.node_sha256}")
    return 0 if result.matched else 1


if __name__ == "__main__":
    raise SystemExit(main())
