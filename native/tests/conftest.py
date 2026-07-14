"""Make `support` importable from the UI tests without a package dance."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "ui"))
