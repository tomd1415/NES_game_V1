"""Validate and normalize NES Studio project JSON without launching the UI."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import BinaryIO, Sequence

from .project_document import ProjectDocument, ProjectFormatError


def _read(path: str, stdin: BinaryIO) -> bytes:
    return stdin.read() if path == "-" else Path(path).read_bytes()


def _write(path: str, payload: bytes, stdout: BinaryIO) -> None:
    if path == "-":
        stdout.write(payload)
    else:
        Path(path).write_bytes(payload)


def main(
    argv: Sequence[str] | None = None,
    *,
    stdin: BinaryIO | None = None,
    stdout: BinaryIO | None = None,
    stderr: BinaryIO | None = None,
) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="project JSON path, or - for stdin")
    parser.add_argument("output", nargs="?", default="-", help="normalized JSON path, or -")
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate only; do not write normalized JSON",
    )
    args = parser.parse_args(argv)
    input_stream = stdin or sys.stdin.buffer
    output_stream = stdout or sys.stdout.buffer
    error_stream = stderr or sys.stderr.buffer
    try:
        document = ProjectDocument.from_json(_read(args.input, input_stream))
        if not args.check:
            _write(args.output, document.to_json(), output_stream)
    except (OSError, ProjectFormatError) as exc:
        error_stream.write((f"nes-studio-project: {exc}\n").encode("utf-8"))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
