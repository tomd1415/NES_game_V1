# Full ASM engine — remaining surface + ROI (scoping, not a plan)

**Question this answers:** the hand-written 6502 conversion has been running for a
while (leaves → AI → scroll → scene-draw → all player physics, shipped by default at
engine v50). Is the "full ASM engine" goal essentially done, and if not, what's left
and is it worth converting?

**Short answer:** the **perf-relevant core is complete AND shipped** — every hot
per-frame loop is on ASM by default (as of v54, the player OAM draw loop too). What
remains in cc65 C is glue + event-driven gameplay logic, where ASM buys ~zero runtime
and adds real risk. Everything else is a purity/education project with diminishing
returns.

## What's already on hand-written 6502 (the frame budget)

The NTSC frame budget is spent in the **per-frame hot loops**, and they are all ASM:

| System | Flag | Notes |
|--------|------|-------|
| read_controller, write_palettes, behaviour_at | `NES_ASM_LEAF` | universal, shipped |
| world_to_screen_x/y, scroll_follow/apply/stream | `NES_ASM_SCROLL` | multi-screen |
| scene-sprite **draw** loop | `NES_ASM_SCENE` | the big draw win |
| scene **AI** (walker/chaser/flyer/patrol + probe) | `NES_ASM_AI` | ~1.2× vs C (asm-ai-bench) |
| animation state machine (advance_animation) | `NES_ASM_ANIM` | basic anim |
| **all player physics** — 6 single-player + 4 two-player | `NES_ASM_PLAYER{,_SMB,_RACER,_PLAYER2}` | shipped v43/v50, A/B-verified |

That is essentially the entire per-frame compute load. **The speed goal — the stated
reason for the ASM engine — is met.**

## What's still cc65 C

Inventory of `platformer.c` (~2600 lines) beyond the ASM-gated blocks:

1. **Main-loop glue / vblank / OAM-DMA orchestration** (~the `while(1)` structure).
   Control flow + register pokes, not compute. **ASM value: ~zero** (nothing to
   speed up). **Risk: high** — it sequences the DMA + scroll writes inside the
   vblank window; a timing slip = mid-screen corruption. **Verdict: leave in C.**

2. **Player OAM draw loop** (~405 code lines, ~1878–2360). Builds the P1/P2 sprite
   OAM entries each frame: flip-left mirroring, tile/attr lookup, animation-frame
   source select, position. **Per-frame**, so it's the one remaining candidate with
   real (if modest) value — but the *scene* draw (the bigger sprite count) is already
   ASM, and the player is only 4–8 sprites. **ASM value: modest. Risk: moderate**
   (rendering + P2 + anim variants).
   - **DONE + SHIPPED (v51→v54, 2026-07-09):** the **player draw loop is converted
     and ships by default** — `src/pdraw_asm.s` (`draw_player` + `draw_player2`).
     A/B-proven C-draw ≡ ASM-draw byte-for-byte in the OAM shadow (P1 square + 2×3 +
     3×1, and P1+P2 2-player, across a screen-2 scroll with the flip). Reads
     `anim_tiles`/`anim_attrs`/`anim_base` (P1) + `player2_tiles`/`attrs` (P2), so it
     covers static + animated players. Engages for any scroll build with a custom
     main.c; granular kill switch `PLAYGROUND_NO_PDRAW=1`. Goldens unchanged (stock =
     no custom main.c; `_rom-equiv` fixture = 1-screen, outside the envelope). Only
     the **animated-P2** branch (walk/jump source-select) stays C — niche, low value.

3. **Gameplay-logic modules** — SMB power-ups (fireball pool, mushroom/star), blocks
   (? blocks, coins), stomp, HP + damage, spawn-on-hit effects, doors / multi-bg,
   pickups, win conditions, HUD draw, racer lap-digit draw. These are **event-driven**
   (run on a hit / pickup / door, or a few sprites of HUD), **not per-frame hot
   loops**. **ASM value: ~zero** (no measurable frame cost). **Risk: high** — they
   are the most varied, edge-case-heavy logic in the engine, and niche (mostly
   SMB-only). **Verdict: leave in C — this is exactly what cc65 is good at.**

## Low-hanging fruit already proven in the lab (if completeness is the goal)

Three asm-lab leaves are **proven but not wired** — they could be wired cheaply, but
they're cold (event-driven), so the win is purity, not speed:
- `draw_text` + `clear_text_row` — the dialogue text renderer.
- `reaction_for` — the per-behaviour reaction lookup.

## Recommendation

- **Treat the ASM engine as done for its purpose.** The hot loops are converted and
  shipped; there is no meaningful frame-budget left to reclaim.
- If you want to keep going toward a literal 100%-ASM engine (educational/purity),
  the sensible order is: **(a) player OAM draw loop** (the only remaining per-frame
  piece, modest value), then **(b) wire the already-proven text/reaction leaves**
  (cheap, cold), and **explicitly NOT** the main-loop glue or the gameplay modules
  (high risk, zero perf — C is the right tool there).
- Otherwise, the higher-value next items are elsewhere: the parked **SMB HUD flicker
  fix** (`docs/design/2026-07-08-smb-bg-status-bar.md`, a real visible bug) and the
  in-progress **FCEUX hardware validation** of what shipped.
