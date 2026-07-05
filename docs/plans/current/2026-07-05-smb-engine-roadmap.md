# Engine roadmap — build a Super Mario Bros. 1‑1‑complete game

**Status:** planning · **Branch:** `feature/nes-engine` · **Started:** 2026-07-05

> Goal: the Studio can build a game containing **every feature and behaviour
> in Super Mario Bros. World 1‑1** — SMB‑feel physics, variable jumps,
> power‑ups (mushroom/fire flower/star/1‑Up), fireball projectiles, enemy
> behaviours (Goomba stomp, Koopa shell/kick), 16×16 `?`/brick/coin blocks,
> pipes/warps, the flagpole finish, a sprite‑0 HUD split, one‑way scrolling,
> score/timer/lives.
>
> Grounded in the research: [`../../design/research/smb-1-1-and-nes-engines.md`](../../design/research/smb-1-1-and-nes-engines.md)
> (SMB constants from the `SMBDIS.ASM` disassembly; cc65/NESdev engine
> patterns). Read that first.

## Principles (non‑negotiable)

1. **Each phase is a new engine version** (v3, v4, …) with a `CHANGELOG.md`
   entry and a `scripts/snapshot-engine.mjs` snapshot. Follow
   [`../../design/engine-versioning.md`](../../design/engine-versioning.md).
2. **Additive + gated ⇒ byte‑identical for existing games.** Every new
   behaviour compiles only when a new opt‑in flag / game‑style is set, so the
   golden‑ROM hashes stay unchanged and every shipped classroom game keeps
   working. The C‑preprocessor/dead‑code‑elimination lever
   (docs/design/engine-versioning.md) is how we guarantee this.
3. **A new `BW_GAME_STYLE` — `smb`** carries the whole feature set, so the
   physics/actor changes never touch the four existing game types. The
   original multi‑page site stays pinned to **v1** throughout.
4. **Tests per phase:** codegen assertions + a real **cc65 compile** (like
   `perdoor.mjs`), and — where feasible — a headless jsnes run asserting the
   behaviour (e.g. Mario lands, stomps a Goomba, throws a fireball). Golden
   ROM stays green at every phase.
5. **Structure‑of‑arrays actor pools, fixed‑point 4.4 math, 16×16 metatile
   collision** — the patterns the research recommends and SMB itself uses.

## Phase gap analysis (what exists today)

The current platformer engine already has: solid/platform/ladder/wall/door
behaviour on a metatile map, basic enemy AI (`static`/`walker`/`chaser`),
HP + damage‑on‑touch, checkpoints, spawn effects, dialogue, doors (now
per‑door, v2), and one‑way multi‑screen scrolling (editor caps at 2×2). The
SMB work layers *feel*, an actor system, projectiles, power‑ups, block
interactions, and the finish/HUD on top — behind the `smb` style.

## Phased plan (each = one engine version)

### v3 — SMB‑feel physics + variable jump  *(foundation — ✅ LANDED)*

> **Landed (engine v3, 2026-07-05):** the **variable‑height jump** — the
> signature SMB feel — as the `smb` game style: A jumps, tap = short hop /
> hold = full jump (releasing A+Up mid‑rise cuts the ascent), running take‑off
> (B held) jumps higher. Reuses the platformer engine (`BW_GAME_STYLE 0` +
> `BW_SMB_JUMP`); gated + golden‑ROM‑safe; `smb-jump.mjs` covers it.
> **Also landed (2026-07-05):** the signed **8.8 fixed‑point horizontal**
> movement — `smb_vx` velocity + `smb_px_sub` sub‑pixel accumulator, accelerate
> to a walk (1.5 px/f) or run (2.5 px/f, hold B) max, friction decel on release,
> **2× skid** on reversal, leading‑edge solid/wall collision cancels the step.
> Gated on `BW_SMB_JUMP`; compiles via cc65; golden ROM byte‑identical.
> **Deferred to a later pass:** take‑off‑speed‑*indexed jump tables* (5 buckets)
> — the current running‑take‑off boost already differentiates hop vs run‑jump.

- Signed **4.4 fixed‑point** horizontal movement with a `MoveForce`
  fractional accumulator. SMB constants (verbatim from research):
  max run/walk = `$28/$18` (2.5 / 1.5 px/f); accel `FrictionData`
  `$e4/$98/$d0`; **skid = 2× friction** on direction reversal.
- **Variable jump height:** two gravities (hold vs fall), switched by
  "A held & still rising & within the small rise window"; initial Y speed and
  both gravities **indexed by take‑off speed** (5 buckets) so run‑jumps go
  higher and farther. Fall speed cap `$04`.
- Gated on `BW_GAME_STYLE == smb` (new starter + game‑type). Existing
  platformer feel untouched → byte‑identical.
- Tests: codegen emits the tables; cc65 compiles; headless: hold‑vs‑tap jump
  reaches different heights.

### v4 — Actor/object system + enemy behaviours  *(✅ LANDED 2026-07-05)*

> **Landed (engine v4):** two per-instance enemy AIs on the Scene page, built on
> the existing structure-of-arrays scene-sprite pool (`ss_x/ss_y/ss_role/…`) so
> they reuse the proven movement + `bw_sprite_blocked` collision:
> - **Goomba** (`ai:'goomba'`): walks + reverses at walls, **walks off ledges**
>   (no ledge sensing), **stomp** from above defeats + bounces, side-touch hurts.
> - **Koopa** (`ai:'koopa'`): walk → **stomp to a still shell** → **touch to
>   kick** (shell slides 3 px/f away from the player, **chains kills** on
>   enemies it overtakes, hurts on contact); stomping a sliding shell stops it.
>
> Shared `BW_SMB_TOUCH/STOMP/BOUNCE/HURT/GUARD` macros; HURT/GUARD respect the
> Damage module's iframes so a stomp never double-counts as a side-hit (either
> apply order). Gated on engine v4+ (pre-v4 degrades to `walker`) → golden ROM
> byte-identical. Starter + Studio Scene AI dropdown wired. `smb-enemies.mjs`
> covers codegen + engine-pin fallback + cc65 compile.
>
> **Deferred to later passes:** stomp-*chain scoring* (100→…→1-Up) lands with the
> score/HUD system in **v7**; a distinct shell tile/art (the shell currently
> reuses the koopa sprite); and a dedicated `MAX_ENEMIES` fixed actor pool
> (today's scene-sprite array already serves as the pool).

### v5 — Projectiles + power‑up state machine  *(✅ LANDED 2026-07-05)*

> **Landed (engine v5):** the SMB power‑up system, behind a new **Power‑ups**
> module (`BW_SMB_POWERUPS`, gated on the smb style + engine v5 → byte‑identical
> otherwise):
> - **Power state** `smb_pstate` small→super→fire + a **Starman** timer. A hit
>   **demotes** a super/fire player to small (instead of costing HP); a Starman
>   ignores hits.
> - **Fireballs:** a 2‑slot pool — **B** in the fire state throws one; it steps
>   ±3 px/f, arcs under 8.8 gravity (capped fall) and **bounces** off the ground,
>   **despawns** on a wall / world edge, and **defeats enemies** on contact.
>   Drawn as one 8×8 sprite (`BW_FIREBALL_TILE`/`PAL`).
> - **Items** as a new Scene AI kind (`ai:'item'` + `power`): **Super Mushroom**
>   (→super), **Fire Flower** (→fire), **Starman** (invincible), **1‑Up** (full
>   heal — a true lives counter arrives with the v7 HUD).
> - **SMB tuning:** the smb style now **falls a touch faster than it rises** for
>   a snappier arc; the SMB showcase starter is now a **two‑screen scrolling
>   level** with the power‑ups wired and jump/speed tuned toward the original.
>
> Studio: a Power‑ups module card (RULES) and an `item` AI option with a power
> picker (WORLD). `smb-powerups.mjs` + the updated `starter-smb.mjs` cover
> codegen, engine/game‑type gating, and cc65 compile; golden ROM byte‑identical.
>
> **Deferred:** items don't yet **spawn from ? blocks** (that dispensing lands
> with the block interactions in **v6**); the mushroom is static rather than
> walking; fireballs cap at 2 (as SMB does).

### v6 — Block interactions  *(🚧 IN PROGRESS — core landed 2026-07-05)*

> **Landed (engine v6):** interactive blocks via a **Blocks** module — a
> position→kind table (`bw_block_tbl`, like the per-door table) + `bw_block_used[]`
> state, gated on the SMB style + engine v6 (byte-identical otherwise):
> **coin** (collect on touch, `bw_coins++`), **? block** (bump from below → step
> the power state up small→super→fire when Power-ups are on, else +coin; then
> inert), **brick** (bump; break only while super). Studio **Blocks editor** in
> WORLD (Maker+). `smb-blocks.mjs` covers codegen + gating + cc65 compile; golden
> ROM byte-identical.
>
> **Also landed:** runtime **tile-graphics swap** — a consumed block queues a
> vblank nametable poke (`bw_poke_*`) so a collected coin / broken brick vanishes
> and a used ? block shows a configurable "used tile"; jsnes-verified. (Reverts
> if a block scrolls off and back, since the world map is `const` — fine forward.)
>
> **Still open in v6:** the **? → item that visibly jumps out** (vs. the current
> direct power-up grant); invisible/hidden blocks; multi-coin bricks; and coin
> **score** (lands with the v7 HUD).
>
> Implementation note: chose a **block-list table** (consistent with doors /
> scene instances) over a per-metatile property table — same gameplay, far
> lower risk, and no dependency on the 16×16 metatile path.

### v7 — HUD + score/timer/lives  *(✅ core LANDED 2026-07-05)*

> **Landed (engine v7):** a fixed **coins / time / score / lives** HUD as **OAM
> digit sprites** (server seeds 0-9 into the sprite pool) — scroll-fixed without
> a mid-frame split. Timer ticks ~every 24 frames and **time-up = death**; each
> death spends a life; coins add 200 to the score. Studio HUD panel in the Style
> tab. `smb-hud.mjs` compiles it and jsnes-verifies the timer counts down; golden
> ROM byte-identical.
>
> **Deferred:** the true **sprite-0 background split** (SMB draws the HUD in the
> nametable, splits scroll mid-frame) → folded into the **v9** rendering pass;
> plus a 6-digit score, enemy-stomp scoring, and lives↔checkpoint-respawn.

### v8 — Level structure: pipes/warps, flagpole finish  *(✅ core LANDED 2026-07-05)*

> **Landed (engine v8):** **pipes** — hold Down on a pipe cell to warp to a spawn
> spot (underground bonus of a tall level; a Pipes editor in World); and a
> **flagpole finish** — crossing a column wins (via the Win condition's `bw_won`)
> with a +5000 bonus (toggle + column in the Style tab). `smb-level.mjs` covers
> codegen + gating + cc65 compile; golden ROM byte-identical.
>
> **Deferred / achievable-today:** cross-**room** pipes (use a per-door warp);
> the flagpole slide animation + castle; the **staircase** (just painted solid
> tiles — no engine feature) and the **bonus room** (a door/pipe to another
> area).

### v9 — Rendering (NROM)  *(✅ core LANDED 2026-07-05)*

> **Landed (engine v9):** **OAM flicker / priority cycling** — the scene-sprite
> OAM region rotates one slot per frame, so a >8-sprite scanline flickers (drops
> a different sprite each frame) instead of a permanent drop-out; player + HUD
> keep fixed priority. Style-tab Rendering toggle. `smb-render.mjs` covers it;
> golden ROM byte-identical. **Stays NROM** (decision D-9 — no MMC3).
>
> **Deferred (advanced polish):** 8×16 sprite mode and a true **sprite-0
> background HUD split**. The 8×8 metasprites + OAM HUD already work; column-
> stream scroll is in place from the multi-screen work. MMC3 is out of scope
> (real SMB is NROM).

## Backlog (someday / low priority)

### Full hand-written **6502 assembly** engine — *educational goal, no deadline*
> **Requested 2026-07-05.** The cc65-generated C is ~5× slower than hand asm, so
> the per-frame vblank budget is tight and enemy-heavy scrolling scenes can still
> feel slow even after the v5 AI optimisations (single-probe `bw_smb_wall` +
> on-screen dormancy gate). The long-term aim is a **full ASM version of the
> engine** — primarily the per-frame hot paths (enemy AI, collision, the OAM
> build, scroll streaming) — hand-written in `ca65`, both for the **speed**
> headroom (many more active actors at 60 fps) and as an **educational artefact**
> (readable, commented 6502 that shows pupils how the machine really works).
>
> **This is explicitly low priority and can wait a long time** — the current C
> engine is functional and, for modest enemy counts, runs at ~60 fps.
>
> Feasibility is already proven in-tree: `ca65` is the assembler in the build
> pipeline (cc65 compiles C → `.s` → `ca65`), and `steps/Step_Playground/src/
> graphics.s` is an existing hand-asm routine exported to C (`.export
> _load_background`). Approach sketch (see the 2026-07-05 chat for detail):
> - Add `src/enemy_ai.s` to the Makefile `ASM_SRC`; `.export _bw_enemy_step`,
>   `.import` the `_ss_x/_ss_y/_ss_w/_ss_h` scene arrays + `_active_behaviour_map`.
> - Do the tile lookup **in asm** (read the map pointer, `row*WORLD_COLS+col`)
>   rather than `jsr _behaviour_at` — that C round-trip is the main cost.
> - Refactor per-enemy AI **state** from generated per-instance `static`s into a
>   shared `bw_dir[]` array indexed by sprite, so one routine serves all.
> - Ship as a new **engine version** (own snapshot + golden-ROM gating on the
>   SMB path) with a jsnes perf test asserting e.g. 16 active enemies hold 60 fps.
> - Stretch: extend the hand-asm treatment to the OAM build + scroll streamer,
>   and keep the asm heavily commented as the teaching surface.

## Cross‑cutting: the editor surfaces
Each engine feature needs Studio UI (a power‑up block type, enemy‑behaviour
picker, pipe/warp targets, HUD toggle, `smb` game‑type starter). These land in
the same phase as their engine feature, Maker/Advanced‑gated, and are what a
pupil actually touches — the engine is the substrate.

## Sequencing note
v3 (physics) is the foundation and lands first. v4–v6 are the meat (actors,
projectiles, blocks). v7–v9 complete the presentation/hardware. Each ships as
an isolated, snapshotted, golden‑ROM‑safe engine version so we can stop
between phases with a fully‑working tool at all times.
