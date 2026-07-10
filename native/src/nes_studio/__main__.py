"""Command-line entry point for the native application."""

from __future__ import annotations

import sys
from collections.abc import Sequence


def main(argv: Sequence[str] | None = None) -> int:
    """Start NES Studio, reporting a useful error when Qt is unavailable."""

    try:
        from .application import run
    except ModuleNotFoundError as exc:
        if exc.name and exc.name.startswith("PySide6"):
            print(
                "PySide6 is required to run NES Studio. "
                "Install the native package with: python -m pip install -e '.[dev]'",
                file=sys.stderr,
            )
            return 2
        raise

    return run(list(argv) if argv is not None else sys.argv)


if __name__ == "__main__":
    raise SystemExit(main())
