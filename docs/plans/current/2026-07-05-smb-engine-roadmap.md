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

### v3 — SMB‑feel physics + variable jump  *(foundation)*
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

### v4 — Actor/object system + enemy behaviours
- Structure‑of‑arrays actor pool (`MAX_ENEMIES`), per‑slot tiny state machine.
- **Goomba:** walk ~0.5 px/f (`$f8`), reverse on wall/enemy, **no ledge
  sensing**; **stomp** (downward motion) → squash + score; side‑touch damages.
- **Koopa Troopa:** walk → **stomp to shell** → **kick** = ±3 px/f
  (`KickedShellXSpdData` `$30/$d0`) moving shell that chains kills / hurts on
  return.
- Stomp‑chain scoring (100→…→1‑Up).
- Tests: compile; headless stomp defeats a Goomba; kicked shell moves + kills.

### v5 — Projectiles + power‑up state machine
- **Fireballs:** 2‑slot pool gated on `state==inactive`; spawn X±4, ±4 px/f,
  gravity‑bounce (fall cap 3 px/f), despawn off‑screen/on wall; defeat enemies.
- **Power‑up state** = `PlayerStatus` small/super/fire; hit steps straight to
  small; fire only in fire state.
- **Items:** Super Mushroom (moves like a walker), Fire Flower (static),
  Starman (invincibility timer), 1‑Up. Spawn from blocks (v6 wires the
  dispense).
- Tests: compile; headless fireball spawns/limits to 2; mushroom promotes.

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
