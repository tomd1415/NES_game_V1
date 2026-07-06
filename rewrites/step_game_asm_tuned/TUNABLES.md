# ASM Tunables

Steps 1-5 now have explicit `TUNABLES` blocks near the top of `src/main.s`.
Change those constants first.

For Step 5, the message data labels are still useful when changing dialogue:

- `msg1_line1`, `msg1_line2`, `msg1_line3`
- `msg2_line1`, `msg2_line2`, `msg2_line3`

The Step 5 box layout can be changed with:

- `BOX_TOP_ADDR_HI`, `BOX_TOP_ADDR_LO`
- `BOX_TEXT1_LO`, `BOX_TEXT2_LO`, `BOX_TEXT3_LO`
- `BOX_BOTTOM_LO`
- `BOX_WIDTH`, `BOX_INNER_WIDTH`, `TEXT_WIDTH`
