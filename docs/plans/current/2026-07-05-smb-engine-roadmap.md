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

### v6 — 16×16 block interactions
- Per‑metatile **property table**; the tile‑hit path folds in: **? block**
  (dispense item/coins by player state; becomes used/empty), **brick**
  (bump; **break only when Super**), **coin** (collect, +200, coin count,
  100→1‑Up), invisible/hidden blocks, multi‑coin brick (bump‑window timer).
- Tests: compile; headless bumping a ? block spawns an item/coin and marks used.

### v7 — HUD + score/timer/lives + sprite‑0 split
- Fixed HUD (score, coins, world, time, lives) as **background** with a
  **sprite‑0‑hit scroll split** over the scrolling field.
- Timer ticks every 24 frames (~0.4 s/unit); lives; score.
- Tests: compile; headless HUD renders and doesn't scroll with the field.

### v8 — Level structure: pipes/warps, flagpole finish, staircase, bonus room
- Enterable **pipes** (down‑press warp to a target like per‑door), the
  **flagpole** end sequence (+ score by height) and castle, the **staircase**,
  and the underground **bonus room** as a linked area.
- Tests: compile; headless flagpole ends the level; pipe warps.

### v9 — Rendering / hardware scaling
- **8×16 sprite mode** (DM‑3), OAM **priority cycling** (flicker over
  drop‑out for the 8‑per‑scanline limit), **one‑way column‑streaming scroll**
  polish (buffer a nametable column + attributes per 16 px, flush in vblank),
  and — if one 8 KB CHR page is exhausted — **MMC3** for 1 KB CHR banks +
  scanline IRQ (this also unlocks bigger worlds, DM‑ and Phase‑4 items).
- Tests: compile under MMC3; golden ROM (NROM path) unchanged.

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
