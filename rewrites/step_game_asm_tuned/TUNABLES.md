# ASM Tunables

Step 1 and Step 2 now have explicit `TUNABLES` blocks near the top of
`src/main.s`. Change those constants first.

For Steps 3-5, the current tuned directory still uses the generated ASM baseline,
with comments added above the editable data labels. Useful labels:

- `_enemy1_x`, `_enemy1_y`, `_enemy1_left`, `_enemy1_right`
- `_enemy2_x`, `_enemy2_y`, `_enemy2_left`, `_enemy2_right`
- `_enemy_speed`
- `_gem_x`, `_gem_y`
- `_heart_x`, `_heart_y`
- `_npc_x`, `_npc_y` in Step 4
- `_npc1_x`, `_npc1_y`, `_npc2_x`, `_npc2_y` in Step 5
- `_msg_hello` in Step 4
- `_msg1_line1`, `_msg1_line2`, `_msg1_line3`, `_msg2_line1`,
  `_msg2_line2`, `_msg2_line3` in Step 5

Next tuning targets for Steps 3-5:

- Replace `read_controller` with the hand Step 1/2 version.
- Replace `reset_scroll`, `ppu_seek`, and palette writes with direct register
  writes/macros.
- Replace `draw_sprite`/`draw_enemy` call chains with direct OAM writes.
- Replace movement/gravity boolean helper calls with branch-only ASM.
