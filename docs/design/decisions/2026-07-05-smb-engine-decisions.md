# SMB-engine build — decisions & alternatives

Running log of the non-obvious choices made while extending the engine toward a
"near-perfect SMB at full speed" (engine v3→v9+), with the alternatives that
were weighed. Newest first. Companion to the roadmap
([`../../plans/current/2026-07-05-smb-engine-roadmap.md`](../../plans/current/2026-07-05-smb-engine-roadmap.md))
and the engine changelog ([`../../../tools/engines/CHANGELOG.md`](../../../tools/engines/CHANGELOG.md)).

## D-13 · OAM flicker by **rotating the scene-sprite OAM region**, not the draw order
- **Chosen (v9):** capture the scene sprites' OAM byte range and rotate it one
  slot per frame *after* the draw, all behind `#ifdef BW_OAM_FLICKER`.
- **Alternative:** rotate the *index* inside the scene draw loops (`ss_[i]` →
  `ss_[(i+f)%n]`). **Rejected** — it would perturb the loop's generated code and
  risk the golden ROM even when off; the post-draw region-rotate is fully gated
  and leaves player + HUD (drawn earlier) at fixed priority.

## D-12 · Pipes are **same-room** warps; cross-room bonus areas use a door
- **Chosen (v8):** a pipe warps to a spawn spot in the same level (the
  underground of a tall 1×2 level, or any teleport). No `current_bg` /
  `load_background_n` dependency.
- **Alternative:** cross-room pipe warps. **Deferred** — those symbols only
  exist under the doors module's multi-bg path, and the per-door warp already
  covers cross-room; coupling pipes to it wasn't worth it.

## D-11 · HUD is **OAM digit sprites**, not a sprite-0 background split
- **Chosen (v7):** draw coins/time/score/lives as OAM digit sprites at fixed
  screen positions (the server seeds 0-9 into the sprite pool). Scroll-fixed
  without any mid-frame timing.
- **Alternative:** SMB's actual approach — HUD in the nametable + a sprite-0 hit
  that splits the scroll mid-frame. **Deferred to v9-polish** — it's intricate
  and timing-sensitive; the OAM HUD is simple, works today, and costs only a few
  sprites (spread over two rows to respect the 8-per-scanline limit).

## D-10 · Game-style options live in a dedicated **"Style" mode tab**
- **Chosen:** a new top-level screen in the mode rail that shows *only* the
  selected game type's options (SMB: physics/jump, power-ups, blocks, HUD;
  racer: laps/speed; runner: scroll; top-down: —). RULES keeps the *shared*
  modules (damage, dialogue, win condition…).
- **Alternatives considered:** (a) a panel at the top of RULES that swaps by
  type — least navigation but crowds RULES; (b) grouped inline cards in RULES —
  least new UI but options stay scattered. **User picked the dedicated tab** for
  room to grow as SMB gains options.
- **Why it matters:** every new game-style feature (power-ups, blocks, HUD,
  pipes, flagpole…) gets a natural home the pupil can find, instead of piling
  onto the flat module list.

## D-9 · Stay on **NROM** (mapper 0) — no MMC3
- **Chosen:** keep the NROM cartridge for the whole SMB feature set — exactly
  the mapper the real Super Mario Bros. uses (32KB PRG + 8KB CHR). 8×16 sprites,
  OAM flicker/priority, and scroll polish all fit NROM.
- **Alternative:** build the MMC3 mapper (1KB CHR banking + scanline IRQ) for
  bigger worlds/art. **Rejected for now** — large, risky, and unnecessary for a
  faithful SMB; it would also complicate the golden-ROM path. Revisit only if a
  game genuinely exhausts the 8KB CHR page.

## D-8 · Interactive blocks are a **block-list table**, not a per-metatile property map
- **Chosen:** a small `bw_block_tbl` of (x, y, kind, usedTile) entries + a
  `bw_block_used[]` state array, mirroring the per-door table.
- **Alternative:** a per-metatile property byte on the 16×16 block library.
  **Rejected** — same gameplay, far more plumbing, and a hard dependency on the
  metatile path. The list is consistent with doors/scene instances and easy to
  edit.

## D-7 · Block tile-swap via a **vblank nametable poke**, accepting scroll-revert
- **Chosen:** a consumed block queues a nametable write (`bw_poke_*`) flushed in
  vblank so its tile changes/vanishes.
- **Trade-off accepted:** the world tile source is `const` ROM, so a block that
  scrolls off-screen and back is re-streamed to its original art (though it
  stays logically inert). Fine for a forward-scrolling SMB level. The only
  full fix (a RAM copy of the world map) costs ~2KB RAM — not worth it.

## D-6 · Enemy AI perf: **cheap single-probe collision + on-screen dormancy**
- Replacing the 5-arg body-row-looping `bw_sprite_blocked` with a one-lookup
  `bw_smb_wall`, plus a `BW_SMB_ONSCREEN` gate, took 8 on-screen Goombas from
  ~25 fps to a full 60 fps. cc65 function-call + loop overhead was the cost.
  See [[nes-engine-perf-budget]] (memory) — kept to the Goomba/Koopa path so the
  golden ROM (which uses `walker`) is unchanged.

## D-5 · The whole SMB feature set is gated behind flags for **byte-identical** golden ROMs
- Every feature (`BW_SMB_JUMP`, `BW_SMB_POWERUPS`, `BW_SMB_BLOCKS`, …) only emits
  for the `smb` game type on a high-enough target engine. The golden `_rom-equiv`
  fixture (a non-SMB everything-on ROM) therefore stays byte-identical at every
  version — the safety net that lets us ship boldly.
