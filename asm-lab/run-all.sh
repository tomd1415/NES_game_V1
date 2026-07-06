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
# For PPU-effect functions we build the driver twice (C ref vs ASM) so the
# harness can compare their effect on PPU/VRAM state.
run2() { # base  src...   (builds <base>_ref and <base>_asm)
  local base="$1"; shift
  echo "── $base (ref+asm) ────────────────────────────────────"
  make ROM="${base}_ref" SRC="$*" >/dev/null 2>build/.${base}_ref.log || { echo "REF BUILD FAIL"; cat build/.${base}_ref.log; fail=1; return; }
  make ROM="${base}_asm" CFLAGS="-Os -DASM_VARIANT" SRC="$*" >/dev/null 2>build/.${base}_asm.log || { echo "ASM BUILD FAIL"; cat build/.${base}_asm.log; fail=1; return; }
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

run bat "functions/behaviour_at/ref.c functions/behaviour_at/test.c functions/behaviour_at/asm.s"
node functions/behaviour_at/test.mjs || fail=1

run rf "functions/reaction_for/ref.c functions/reaction_for/test.c functions/reaction_for/asm.s"
node functions/reaction_for/test.mjs || fail=1

run rc "functions/read_controller/ref.c functions/read_controller/test.c functions/read_controller/asm.s"
node functions/read_controller/test.mjs || fail=1

run2 wp "functions/write_palettes/ref.c functions/write_palettes/test.c functions/write_palettes/asm.s"
node functions/write_palettes/test.mjs || fail=1

run2 dt "functions/draw_text/ref.c functions/draw_text/test.c functions/draw_text/asm.s"
node functions/draw_text/test.mjs || fail=1

run2 ctr "functions/clear_text_row/ref.c functions/clear_text_row/test.c functions/clear_text_row/asm.s"
node functions/clear_text_row/test.mjs || fail=1

run sf "functions/scroll_follow/ref.c functions/scroll_follow/test.c functions/scroll_follow/asm.s"
node functions/scroll_follow/test.mjs || fail=1

run sap "functions/scroll_apply_ppu/ref.c functions/scroll_apply_ppu/test.c functions/scroll_apply_ppu/asm.s"
node functions/scroll_apply_ppu/test.mjs || fail=1

echo
if [ "$fail" -ne 0 ]; then echo "asm-lab: SOME TESTS FAILED"; exit 1; fi
echo "asm-lab: all tests passed."
