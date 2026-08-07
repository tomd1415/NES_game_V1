"""Path setup shared by every test module.

`support` lives in tests/ui and is imported unqualified by the UI tests.

`src` is here because otherwise `import nes_studio` only works when some *other*
test module happened to run first and do its own `sys.path.insert`. That made a
single file behave differently from the whole suite: running
`pytest tests/unit/test_bundles.py` alone failed with "No module named
nes_studio" while the same file passed in a full run. An import-order dependency
is a bad thing to debug and a worse thing to trust.
"""

import sys
from pathlib import Path

TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS / "ui"))
sys.path.insert(0, str(TESTS.parent / "src"))
