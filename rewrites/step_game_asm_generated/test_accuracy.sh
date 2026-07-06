#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

STEPS="
Step_1_Player_Movement
Step_2_Background_Level
Step_3_Enemies_And_Items
Step_4_Dialogue
Step_5_Multi_NPC_Dialogue
"

for step in $STEPS; do
    c_dir="$ROOT/rewrites/step_game_modular/$step"
    asm_dir="$ROOT/rewrites/step_game_asm_generated/$step"

    echo "== $step =="
    make -B -C "$c_dir" >/dev/null
    make -B -C "$asm_dir" >/dev/null

    if cmp -s "$c_dir/game.nes" "$asm_dir/game.nes"; then
        echo "OK: ASM ROM matches modular C ROM"
    else
        echo "FAIL: ASM ROM differs from modular C ROM" >&2
        exit 1
    fi
done

echo "All ASM conversions match."
