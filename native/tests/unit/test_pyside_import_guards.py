"""No test module may explode at import time when PySide6 is absent.

PySide6 is optional in the test environment. When a module imports it -- directly
or transitively through `nes_studio.*` -- without a guard, pytest reports a
**collection ERROR**, which reads exactly like a defect. Twelve modules did that,
plus three tests that imported inside the body and reported as plain FAILURES, so
"the Qt toolkit is not installed here" and "something is broken" arrived in the
same words and the suite could not be read at a glance (finding F3).

This test stops that coming back. It is the generalisation, not a list of the
twelve: any new module that forgets the guard fails here on the day it is added.

**Why it does not simply check for collection errors.** On a box that *has*
PySide6 every module imports fine, so such a check would pass while saying
nothing -- green because the condition it looks for cannot arise, which is the
failure mode this whole area of the codebase has been bitten by. Instead it
imports every test module in a subprocess with PySide6 *forced* to be missing.
That reproduces the headless container's condition on any machine, so the test
means the same thing everywhere.

Guarded modules raise `Skipped` from `pytest.importorskip`, which is the correct
outcome and is counted as a pass here.
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

TESTS_ROOT = Path(__file__).resolve().parents[1]
NATIVE_ROOT = TESTS_ROOT.parent

# Run inside a subprocess with PySide6 blocked. Kept as a string rather than a
# helper module so that what executes is visible next to the assertion.
PROBE = r"""
import importlib.util, json, sys
from pathlib import Path

TESTS_ROOT = Path(sys.argv[1])
NATIVE_ROOT = TESTS_ROOT.parent

# Mirror conftest.py so import success does not depend on collection order.
sys.path.insert(0, str(TESTS_ROOT / "ui"))
sys.path.insert(0, str(NATIVE_ROOT / "src"))


class _BlockPySide:
    # Make PySide6 unimportable even on a machine where it is installed.

    def find_module(self, name, path=None):
        return self.find_spec(name, path)

    def find_spec(self, name, path=None, target=None):
        if name == "PySide6" or name.startswith("PySide6."):
            raise ModuleNotFoundError("No module named 'PySide6'", name="PySide6")
        return None


sys.meta_path.insert(0, _BlockPySide())
for name in [n for n in sys.modules if n == "PySide6" or n.startswith("PySide6.")]:
    del sys.modules[name]

# Absence has two faces and both must be emulated, or the probe is not testing
# the real condition. An `import PySide6` statement must raise (the meta_path
# finder above), but a module ASKING whether it is installed --
# `importlib.util.find_spec("PySide6")`, which is how support.py and test_icons.py
# decide whether to skip -- must get None back, not an exception. The import
# statement goes through importlib._bootstrap and is unaffected by this patch.
import importlib.util as _iu

_real_find_spec = _iu.find_spec


def _find_spec(name, package=None):
    if name == "PySide6" or name.startswith("PySide6."):
        return None
    return _real_find_spec(name, package)


_iu.find_spec = _find_spec

try:
    from _pytest.outcomes import Skipped
except Exception:  # pragma: no cover - pytest always present in this suite
    class Skipped(Exception):
        pass

results = {}
for path in sorted(TESTS_ROOT.rglob("test_*.py")):
    rel = str(path.relative_to(NATIVE_ROOT))
    module_name = "probe_" + rel.replace("/", "_").removesuffix(".py")
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
        results[rel] = "imported"
    except Skipped:
        results[rel] = "skipped"
    except ModuleNotFoundError as exc:
        if getattr(exc, "name", "") == "PySide6" or "PySide6" in str(exc):
            results[rel] = "UNGUARDED"
        else:
            results[rel] = "other-import-error: " + str(exc)
    except Exception as exc:
        results[rel] = "other-error: " + type(exc).__name__ + ": " + str(exc)
    finally:
        sys.modules.pop(module_name, None)

print(json.dumps(results))
"""


class PySideImportGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        completed = subprocess.run(
            [sys.executable, "-c", PROBE, str(TESTS_ROOT)],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if completed.returncode != 0:
            raise AssertionError(
                "the import probe itself failed:\n" + completed.stderr[-2000:]
            )
        cls.results = json.loads(completed.stdout.strip().splitlines()[-1])

    def test_the_probe_actually_looked_at_the_modules(self) -> None:
        """Guards against the probe silently finding nothing and passing."""

        self.assertGreater(
            len(self.results), 30, f"only {len(self.results)} test modules found"
        )

    def test_no_test_module_needs_pyside6_to_be_imported(self) -> None:
        unguarded = sorted(k for k, v in self.results.items() if v == "UNGUARDED")
        self.assertEqual(
            unguarded,
            [],
            "these modules raise ModuleNotFoundError: No module named 'PySide6' at "
            "import time, so pytest reports them as collection ERRORS rather than "
            "skips (F3). Add `pytest.importorskip(\"PySide6\")` above the first "
            "import that needs Qt -- remembering that nes_studio.* pulls Qt in "
            "transitively:\n  " + "\n  ".join(unguarded),
        )

    def test_no_module_fails_to_import_for_some_other_reason(self) -> None:
        """A module that cannot be imported at all is invisible, not passing."""

        broken = sorted(
            f"{k}: {v}" for k, v in self.results.items() if v.startswith("other-")
        )
        self.assertEqual(broken, [], "modules that fail to import:\n  " + "\n  ".join(broken))


if __name__ == "__main__":
    unittest.main()
