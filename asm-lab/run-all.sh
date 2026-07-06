#!/usr/bin/env bash
# Build + run every asm-lab test (smoke + each converted function's unit test).
# Exits non-zero on the first failure. Run from asm-lab/.
set -euo pipefail
cd "$(dirname "$0")"

fail=0
run() { # name  src...
  local name="$1"; shift
  echo "── $name ──────────────────────────────────────────────"
  make ROM="$name" SRC="$*" >/dev/null 2>build/.$name.log || { echo "BUILD FAIL"; cat build/.$name.log; fail=1; return; }
}

make clean >/dev/null 2>&1 || true
mkdir -p build

# smoke
run smoke "src/smoke.c"
node harness/smoke.mjs || fail=1

# functions
run w2sx "functions/world_to_screen_x/ref.c functions/world_to_screen_x/test.c functions/world_to_screen_x/asm.s"
node functions/world_to_screen_x/test.mjs || fail=1

run w2sy "functions/world_to_screen_y/ref.c functions/world_to_screen_y/test.c functions/world_to_screen_y/asm.s"
node functions/world_to_screen_y/test.mjs || fail=1

echo
if [ "$fail" -ne 0 ]; then echo "asm-lab: SOME TESTS FAILED"; exit 1; fi
echo "asm-lab: all tests passed."
