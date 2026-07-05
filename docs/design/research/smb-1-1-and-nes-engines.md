# Super Mario Bros. World 1‑1 & NES Platformer Engine Research

**Purpose:** A reimplementation-grade reference for (1) every gameplay feature/behaviour in *Super Mario Bros.* (NES, 1985) World 1‑1, with the actual engine constants; and (2) how NES platformer engines and these mechanics are built in practice, especially with **cc65/C** rather than raw 6502 asm.

**Primary sources of truth used below**

- The **comprehensive SMB disassembly** by *doppelganger* (`SMBDIS.ASM`, 2012). Every hex constant, label name, and data table quoted in this document was read directly from that source (gist `1wErt3r/4048722`), which is also mirrored as an annotated interactive listing at 6502disassembly.com. Where I quote a `.db` table or a label (e.g. `MaxRightXSpdData`, `FallMForceData`), it is verbatim from that file.
- The **SMB1 RAM map** (Data Crystal / TCRF) for variable addresses and their meanings.
- Physics interpretation cross-checked against the **SDA Knowledge Base**, **TASVideos GameResources/NES/SuperMarioBros**, and **jdaster64's** widely-cited player-physics breakdown.
- Level content cross-checked against the **Super Mario Wiki** and **StrategyWiki** 1‑1 pages.
- Topic 2 sourced from the **NESdev Wiki**, **nesdoug.com** (cc65 tutorial series), and **neslib/FamiTone** (Shiru).

A **Sources** list with URLs is at the end.

> Notation: `$xx` = hex byte from the ROM. SMB stores velocities as **signed 8‑bit fixed‑point in "4.4" form** — the high nibble is whole pixels/frame, the low nibble is sixteenths of a pixel/frame. So `$28` = `2.5` px/frame, `$18` = `1.5`, `$f8` = `-0.5`. Sub‑pixel *accumulators* (`*_MoveForce`) are a further 1/256 fraction that carries into the 4.4 speed byte. Frame rate is ~60.0988 Hz (NTSC).

---

## TOPIC 1 — World 1‑1: complete feature & behaviour enumeration

### 1. Player movement (horizontal)

**Model.** Input sets a *direction of acceleration*; acceleration changes velocity; velocity (plus a sub-pixel accumulator) changes position. All three carry fractional parts. Source: `PlayerPhysicsSub` / `ImposeFriction` / `MoveObjectHorizontally` in the disassembly.

- `Player_X_Speed` ($0057) is the signed 4.4 velocity. `Player_X_MoveForce` ($0705) is the 1/256 sub-accumulator that friction/acceleration is added into; its carry bumps `Player_X_Speed`. `Player_XSpeedAbsolute` ($0700) is the unsigned magnitude, range `$00`–`$28`.
- **Maximum speeds** (`MaxRightXSpdData` / `MaxLeftXSpdData`):

  | State | Right | Left | px/frame |
  |---|---|---|---|
  | Running (B held) | `$28` | `$d8` | 2.5 |
  | Walking | `$18` | `$e8` | 1.5 |
  | Climbing / underwater | `$10` | `$f0` | 1.0 |
  | Pipe-intro auto-walk | `$0c` | — | 0.75 |

- **Acceleration / friction** (`FrictionData`, added to `Player_X_MoveForce` each frame): running `$e4`, walking `$98`, water/skid `$d0`. As px/frame² these are ≈ `$e4`→0.0557, `$98`→0.0371, `$d0`→0.0508 (value ÷ 4096, because it accumulates in 1/256 and carries into the 1/16 speed LSB). These match jdaster64's published figures.
- **Skidding / turning:** when `PlayerFacingDir` ≠ `Player_MovingDir`, the friction adder is **doubled** (the `asl FrictionAdderLow` / `rol FrictionAdderHigh` at `ExitPhy`). This gives the fast deceleration and the skid animation (`Player_MovingDir` flips only once `Player_XSpeedAbsolute` drops below `$0b`; below that, X speed is zeroed and direction snaps to facing).
- **Running requires B held.** `RunningTimer` ($0703) is set to `$0a` while B is pressed and stays "running" briefly after release; the run acceleration/max table is selected when the timer is set or when `Player_XSpeedAbsolute ≥ $21`.
- **Hard invariant:** *Mario never moves faster than 4 px/frame.* The collision engine depends on this (NESdev forum, echoed by the disassembly's stepping logic).
- Animation cadence (`GetPlayerAnimSpeed`) buckets speed at thresholds `$1c`, `$0e`, `$0b` to pick leg-cycle timing.

### 2. Player movement (vertical): jumping, variable height, gravity, fall cap

Handled by `CheckForJumping` → `ProcJumping` → `JumpSwimSub` → `MovePlayerVertically`.

- **You can only jump from the ground** (`Player_State`==0); no mid-air re-jump. A must be a *fresh* press (checked against `PreviousA_B_Buttons`).
- **Initial jump velocity depends on horizontal speed at take-off.** `Player_XSpeedAbsolute` selects index Y (0–4):

  | `XSpeedAbsolute` | idx | Init Y speed (`PlayerYSpdData`) | Hold gravity (`JumpMForceData`) | Fall gravity (`FallMForceData`) |
  |---|---|---|---|---|
  | `< $09` | 0 | `$fc` (−4.0) | `$20` (0.125) | `$70` (0.4375) |
  | `< $10` | 1 | `$fc` (−4.0) | `$20` (0.125) | `$70` (0.4375) |
  | `< $19` | 2 | `$fc` (−4.0) | `$1e` (0.117) | `$60` (0.375) |
  | `< $1c` | 3 | `$fb` (−5.0) | `$28` (0.156) | `$90` (0.5625) |
  | `≥ $1c` | 4 | `$fb` (−5.0) | `$28` (0.156) | `$90` (0.5625) |
  | swim | 5 | `$fe` | `$0d` | `$0a` |
  | whirlpool | 6 | `$ff` | `$04` | `$09` |

  So a full-run jump launches at **−5 px/f** and, crucially, falls under **stronger** gravity — you go higher *and* farther. Gravity px/f² = value ÷ 256.
- **Variable jump height (the core feel).** Each frame, while rising (`Player_Y_Speed` < 0), `JumpSwimSub` keeps the **weak** "hold" gravity (`VerticalForce`) **only if** A is still held (this frame *and* last) **and** the player is still near the launch point (`JumpOrigin_Y_Position − Player_Y_Position < DiffToHaltJump`, where `DiffToHaltJump`=`$01`). Otherwise `DumpFall` copies the **strong** falling gravity (`VerticalForceDown`) into the active `VerticalForce`. **Net effect: release A while rising → gravity immediately jumps from ~0.125 to ~0.44–0.56 px/f², cutting the jump short.** Holding A the whole way gives the full-height parabola.
- **Max fall speed.** `MovePlayerVertically` loads max vertical speed `#$04` before `ImposeGravitySprObj`, i.e. the whole-pixel fall cap is **4 px/frame**. *Disputed nuance:* jdaster64 and some TAS notes quote an effective terminal ≈ **4.5 px/f** because the 1/256 `Player_Y_MoveForce` fraction keeps contributing sub-pixels at the cap. Use `$04` (4.0) as the hard cap; note the ~4.5 figure if matching frame-exact behaviour.
- `Player_Y_Speed` ($009F) reads `$fb`(−5) rising fastest … `$05` falling fastest in RAM.

### 3. Power-up state machine

`PlayerStatus`/`PowerupState` ($0756): **0 = small, 1 = Super (big), ≥2 = Fire (fiery)**. `PlayerSize` ($0754) is a separate big/small flag.

- **Super Mushroom:** small → Super. **Fire Flower:** Super → Fire (grants fireballs). A `?`/brick that dispenses a power-up **checks the player's state to decide contents**: it yields a **Super Mushroom if Mario is small, a Fire Flower if Mario is already big** — this is why the "mushroom block" becomes a flower on a second visit.
- **Taking damage steps the machine *down* one level:** Fire→Super? No — in SMB1 **any hit on a powered-up Mario (Super *or* Fire) drops him straight to small**, with a brief mercy-invincibility (flashing). A hit while **small = death**. Timer-out uses `ForceInjury` and kills even a big Mario (he dies "small").
- **Starman (invincibility):** `StarInvincibleTimer` ($079F). While set: palette cycles, music switches, and **touching an enemy defeats it** (Mario runs through them). Runs out on a timer.
- **1‑Up Mushroom:** green mushroom; grants +1 life (`NumberofLives` $075A), **no state change**.
- **Item spawn/emergence & motion.** A bumped block spawns the item, which **rises slowly out of the top of the block** over several frames, then becomes an active object:
  - Mushrooms (Super/1‑Up) **move horizontally** (initial direction away from Mario's approach / rightward by default), are **affected by gravity**, **reverse at walls**, ride the ground, and **can roll off ledges/into pits**. Speed is walk-ish.
  - **Fire Flower does *not* move** — it sits on the block, flashing, until collected.
  - Star **bounces** (hops) as it moves.

### 4. Projectiles — Mario's fireballs

Code: `ProcFireball_Bubble` → `FireballObjCore` (+ `FireballBGCollision`, `FireballEnemyCollision`).

- **Fire required** (`PlayerStatus ≥ 2`); thrown on a **fresh B press**; blocked while crouching or climbing.
- **Hard limit of 2 on screen.** `FireballCounter` ($06CE) LSB selects slot 0 or 1; a throw only happens if **that slot's `Fireball_State` is inactive (0)**. Two live fireballs ⇒ no throw.
- **Spawn:** at `Player_X + 4`, `Player_Y`, high-pos 1.
- **Horizontal speed** (`FireballXSpdData`): `$40` = **+4.0 px/f** (facing right), `$c0` = **−4.0 px/f** (left). Bounding-box control `$07`.
- **Vertical:** initial `Fireball_Y_Speed` = `$04` (downward). `ImposeGravity` uses downward force `$50` and a **max vertical speed of `$03` (3 px/f)**. Fireballs **bounce off the ground** (BG collision re-launches them upward), giving the characteristic bouncing arc.
- **Despawn:** when off-screen bits AND `%11001100` are set → state cleared; on hitting a wall/ceiling → **explosion** graphic then removal. On enemy hit → `FireballEnemyCollision` defeats the enemy, awards points, and the fireball explodes.
- **Enemy interaction:** most 1‑1 enemies die to one fireball (Goomba, Koopa). (Buzzy Beetles, not in 1‑1, are fire-immune — general SMB rule.)

### 5. Enemies present in 1‑1 and their behaviour

1‑1 contains **Little Goombas** (several) and exactly **one green Koopa Troopa**. Enemy velocities are the same signed 4.4 format.

- **Init walking speed** (`NormalXSpdData`): `$f8` (**−0.5 px/f**, normal mode) or `$f4` (−0.75, hard mode). Goomba init = `InitGoomba` → `InitNormalEnemy` (`$f8`), box control `$09` (small box).
- **Turning:** enemies **reverse on hitting a wall/pipe or another enemy**; they **do *not* sense ledges** — green Koopas and Goombas **walk off ledges and fall**. (Red Koopas — not in 1‑1 — *do* turn at ledges; noted for completeness.)
- **Goomba defeat:** **stomp** (Mario moving downward onto it) → flattened "squashed" sprite for a short timer, then removed (+100 pts, or chain value). Also killed by fireball, by a kicked shell, by a bumped block from below, or by Star contact.
- **Koopa Troopa:** stomp → retreats into a **stationary shell** (stunned state). The shell:
  - If left alone, after `EnemyIntervalTimer` expires the Koopa **re-emerges** (`ReviveStunned`) walking in a **pseudo-random direction** derived from the frame counter (`RevivedXSpeed`: `$08, $f8, $0c, $f4`).
  - **Kicked** (Mario touches a still shell) → it slides: `KickedShellXSpdData` = `$30` (**+3 px/f**) or `$d0` (**−3 px/f**). **A kicked shell moves faster than a running Mario (2.5 px/f)** and mows down other enemies (chain scoring), bounces off walls, and will hurt Mario if it comes back at him.
- **Hitbox timing:** enemy hitboxes affect Mario **only every other frame** (`PlayerEnemyCollision` gates on `FrameCounter` d0). "As long as you're moving downward when you contact the enemy, you stomp it" — you don't have to hit the exact top.
- **Enemy slot budget:** the engine processes a small fixed pool; **~5 active enemy objects on screen** at once is the practical limit (plus separate fireball/block/misc slots).

### 6. Blocks, tiles, coins, HUD

- **Background is metatile-based**, blocks are **16×16 px**, aligned to a 16-px grid.
- **`?` (question) block:** contents vary — a **Coin** (most), a **power-up** (Mushroom/Flower, state-dependent as above), a **Starman**, a **1‑Up**, a **multi-coin**, or (elsewhere) a vine. On use it **animates a short bump** (rises a few px and returns) and becomes a **used/empty block** (solid, brown, inert).
- **Brick block:**
  - **Small Mario:** bumping only nudges it (dispenses contents if it holds any; empty bricks just bounce and stay).
  - **Super/Fire Mario:** an **empty** brick **shatters into 4 fragments** that fly up and out, and is removed. Bricks that **hold contents do *not* break** even when big — they behave like `?` blocks until emptied (this is how the 10‑coin brick, the Star brick and the 1‑Up brick work).
- **Multi-coin brick (10 coins):** first bump starts a short timer; repeated bumps within the window each pop **one coin** (up to 10), then it converts to a used block.
- **Invisible / hidden blocks:** appear only when struck from below. **1‑1 has a hidden 1‑Up brick** (invisible) after the first pipe set.
- **Coins:** contact-collect (background coins in the bonus room); each coin = **+1 coin count** and **200 pts**; **100 coins → 1‑Up**.
- **Bumping any block also flips/kills enemies standing on it.**
- **Scoring / combos.** Consecutive stomps *without touching the ground* escalate: **100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000, then 1‑Up.** Flagpole grab awards by height: **100 / 400 / 800 / 2000 / 5000** (top = 5000). Fireworks at level end if the timer's last digit is **1, 3, or 6**.
- **HUD** shows MARIO score (`TopScoreDisplay`, 6-digit BCD at `$07DD`), coin count, WORLD (1‑1), and TIME. On real hardware the HUD is drawn from the **background** and kept fixed while the play-field scrolls beneath it via a **sprite‑0-hit scroll split** (see Topic 2).

### 7. Pipes, warp, bonus room, layout, staircase, flagpole

- **Pipes:** solid, 2–4 blocks tall. Some are **enterable**: standing centered on an enterable pipe and pressing **Down** plays the pipe-entry animation and **warps** to a sub-area. In **1‑1 the tall later pipe leads to an underground bonus coin room** (rows of coins; commonly cited as ~**20–24 coins**, of which a top row may require running to reach — Mario Wiki lists **19** collectible in a casual pass). The room's exit pipe drops Mario back out **near the end of 1‑1**, at the pipe just before the staircase.
- **Ordered layout of 1‑1** (start → flag; interactive objects). Exact tile coordinates live in the disassembly's Area Object / Enemy data tables; the canonical sequence is:
  1. Open ground, **Goomba** approaches. Timer starts at **400**.
  2. Lone **`?` (Coin)** floating.
  3. Block cluster: a row of **Brick / `?` / Brick** with a **`?` containing the Super Mushroom (→ Fire Flower if already big)**, plus additional **`?` (Coin)** blocks (the famous first "row of blocks").
  4. First **set of pipes** (increasing heights) with **Goombas** between them; the tall one is the **warp pipe** to the bonus room.
  5. **Hidden 1‑Up brick** (invisible) then a **pit**.
  6. **`?` (Mushroom/Flower)**; a long overhead **brick row** dropping **Goombas**.
  7. **10‑coin brick** (below the row) + two bricks — the **second holds a Starman**.
  8. **`?` Fire-Flower** group; the **green Koopa Troopa** plus Goombas; more bricks.
  9. Two **solid "hard-block" pyramids** with a **pit** between them.
  10. The **bonus-room exit pipe**, then a couple of Goombas and a short block row, a final pipe.
  11. The **ascending staircase** (8 steps of stacked hard blocks).
  12. The **flagpole**: touching it starts the slide (score by height), Mario slides down, the flag lowers, then he **walks right into the castle**; the castle flag raises and the level ends. Remaining **time converts to score** (SMB1 tallies remaining time into the score at level clear; commonly cited as **50 pts per time unit** — some sources dispute the exact multiplier, so treat the rate as tunable).

### 8. Scrolling, camera, timer, lives, score

- **One-way horizontal scroll.** The camera advances rightward with Mario and **never scrolls left**; the **left edge of the screen is a solid wall** (`ScreenLeft`) that Mario cannot back through. 1‑1 has **no vertical scroll** (fixed play-field height). Scroll is player-driven (no forced auto-scroll in 1‑1).
- **Timer.** `GameTimerDisplay` (3 BCD digits, `$07F8`). `RunGameTimer` decrements the display by 1 unit each time `GameTimerCtrlTimer` (reset to **`$18` = 24 frames**) elapses → **~0.399 real seconds per timer unit** (a "game second" is *not* a real second). At **100** the "time running out" music plays. At **000** → forced death.
- **Lives** (`NumberofLives` $075A). **Score** is 6-digit BCD (`$07DD`–…); coin count at `$075E`.

---

## Key constants table (verbatim from `SMBDIS.ASM`)

| Meaning | Label | Bytes | Decoded |
|---|---|---|---|
| Max run / walk / climb / pipe speed (right) | `MaxRightXSpdData` | `$28 $18 $10 $0c` | 2.5 / 1.5 / 1.0 / 0.75 px/f |
| Same, left | `MaxLeftXSpdData` | `$d8 $e8 $f0` | −2.5 / −1.5 / −1.0 px/f |
| Ground accel/friction (run/walk/water) | `FrictionData` | `$e4 $98 $d0` | ≈0.056 / 0.037 / 0.051 px/f² (×2 when skidding/turning) |
| Jump init Y speed by X-speed bucket | `PlayerYSpdData` | `$fc $fc $fc $fb $fb $fe $ff` | −4,−4,−4,−5,−5 (+swim) px/f |
| Gravity while A held (rising) | `JumpMForceData` | `$20 $20 $1e $28 $28 $0d $04` | 0.125…0.156 px/f² |
| Gravity falling / A released | `FallMForceData` | `$70 $70 $60 $90 $90 $0a $09` | 0.375…0.5625 px/f² |
| Jump fractional init | `InitMForceData` | `$00 $00 $00 $00 $00 $80 $00` | — |
| Max fall speed (whole-pixel cap) | `MovePlayerVertically` `#$04` | `$04` | 4.0 px/f (jdaster64: ~4.5 effective) |
| `DiffToHaltJump` (variable-jump gate) | — | `$01` | rise-window before strong gravity |
| Fireball horizontal speed (R/L) | `FireballXSpdData` | `$40 $c0` | +4.0 / −4.0 px/f |
| Fireball init Y / gravity / max fall | `FireballObjCore` | `$04` / `$50` / `$03` | down 4 / 0.31 px/f² / 3 px/f |
| Enemy walk speed (normal / hard) | `NormalXSpdData` | `$f8 $f4` | −0.5 / −0.75 px/f |
| Kicked shell speed (R/L) | `KickedShellXSpdData` | `$30 $d0` | +3.0 / −3.0 px/f |
| Revived stunned-enemy speeds | `RevivedXSpeed` | `$08 $f8 $0c $f4` | ±0.5 / ±0.75 px/f |
| Game-timer tick period | `GameTimerCtrlTimer` reset | `$18` | 24 frames ≈ 0.4 s per unit |
| Interval-timer period (slow timers) | `IntervalTimerControl` reset | `$14` | 20→21-frame cadence |
| Fireball on-screen limit | `FireballCounter` LSB slot | — | max **2** live |
| Powerup state | `PlayerStatus` | `0/1/≥2` | small / Super / Fire |
| Subpixel granularity | — | — | 16 subpixels per pixel; speed = 4.4 fixed-point |

**Selected RAM addresses** (Data Crystal): `Player_X_Position` sub-pixel scroll `$03AD`; `Player_X_Speed` `$0057`; `Player_XSpeedAbsolute` `$0700`; `Player_Y_Speed` `$009F`; `Player_Y_MoveForce` `$0433`; `Player_State` (0 ground /1 jump /2 fall-off-ledge /3 climb) `$001D`; `PlayerStatus` `$0756`; `PlayerSize` `$0754`; `StarInvincibleTimer` `$079F`; `Fireball_State` `$0024`; `NumberofLives` `$075A`; coins `$075E`; score BCD `$07DD`; `GameTimerDisplay` `$07F8`.

---

## TOPIC 2 — How NES platformer engines (and these mechanics) are built, with cc65/C

### A. What SMB itself does on real hardware

- **SMB1 is an NROM (mapper 0) cart:** 32 KB PRG-ROM, a single **8 KB CHR-ROM** (no bank switching). All background + sprite tiles live in that one CHR page, which constrains the tile budget — SMB reuses tiles heavily and switches the **background palette** per area type.
- **Fixed HUD + scrolling world via sprite‑0 hit.** The top status bar is a *background* region; SMB places **sprite 0** at a known scanline, polls the PPU's **sprite‑0-hit flag**, and at that moment rewrites the scroll register mid-frame so the HUD stays put while the play-field scrolls. This is the canonical NES "background HUD split" technique (NESdev Wiki: *Sprite 0 hit*).
- **8×16 sprite mode** is commonly used for characters (Mario is built from 8×16 sprites), halving the number of OAM entries needed per figure.

### B. Object / actor systems in cc65 (the practical pattern)

The dominant community guidance (nesdoug's cc65 series) is explicit: **do *not* use an array-of-structs** for actors — the 6502 addresses `array[i].field` slowly. Instead use **structure-of-arrays**: one small (`< 256`-byte) parallel `char` array per field, indexed by actor id. Example (nesdoug):

```c
#define MAX_COINS 16
unsigned char coin_x[MAX_COINS];
unsigned char coin_y[MAX_COINS];
unsigned char coin_active[MAX_COINS];
unsigned char coin_room[MAX_COINS];
unsigned char coin_actual_x[MAX_COINS];   // high byte of world X
```

Keep each actor's world X as **two bytes** (on-screen low + "page/room" high) exactly as SMB does (`Player_X_Position` + `Player_PageLoc`). Terminology nesdoug standardises: *object/actor* (a game entity), *metasprite* (its multi-sprite graphic), *nametable* (the tilemap).

**Sub-pixel physics in 8-bit** is done exactly like SMB: store velocity as fixed-point (e.g. 4.4 or an 8.8 with a separate fractional "force" byte), add the fractional accumulator each frame, and move a whole pixel only when it carries. This is the standard NESdev answer to "how do I get smooth/slow movement" and is what makes SMB's acceleration feel analog on an integer CPU.

### C. Metasprites & OAM management

- **OAM** is 256 bytes = **64 sprites × 4 bytes** (Y, tile, attributes, X); NESdev: *"Don't hardcode OAM addresses."* The usual flow is to build a **shadow OAM buffer** in RAM each frame and **DMA** it to the PPU during vblank (`$4014`).
- A **metasprite** is an array of `{x-offset, y-offset, tile, attribute}` records terminated by `$80`. neslib's `oam_meta_spr(x, y, data)` copies one metasprite into the OAM buffer and returns the next free OAM index, so you chain calls per actor. Tools: **NES Screen Tool** exports metasprites (including "copy to clipboard as C").
- **8×16 sprites** (set bit 5 of `PPUCTRL`): the pattern table is chosen by **bit 0 of the tile number**, not by `PPUCTRL` — so only even tile indices start a 16-px-tall sprite. Good for characters; halves OAM pressure.

### D. The hard hardware limits (and how engines cope)

- **8 sprites per scanline.** The PPU renders at most 8 sprites on any scanline; extras **drop/flicker**. Mitigations: (1) design enemies so few share a row; (2) **OAM cycling** — rotate the priority order of the shadow OAM each frame so dropped sprites flicker instead of vanishing (nesdev "shuffling metasprites"); (3) prefer 8×16 sprites to reduce entry count.
- **64 total sprites.** Budget OAM across player + enemies + projectiles + effects.
- **CHR budget / more tiles:** NROM (like SMB1) has one 8 KB CHR page. To get more/animated tiles, homebrew moves to a **bank-switching mapper** — **MMC1** (coarse) or **MMC3** (fine 1 KB/2 KB CHR banks + a scanline IRQ counter). NESdev: CHR bank switching "works best on a mapper with banks smaller than 4 KB, such as MMC3." nesdoug ch. 24 covers MMC3 from C. SMB-style animated question blocks/water can also be done purely by **swapping CHR banks** each frame.
- **Scrolling + nametable updates.** With only two physical nametables (plus mirroring), horizontal scrolling reveals a **seam**; you must **stream a new column of tiles** into the off-screen nametable every ~16 px of scroll, and update the corresponding **attribute** bytes — all inside vblank, so writes are batched into a buffer and flushed via a fast unrolled copy. Games often blank the top/bottom 8–16 px near the seam to hide artifacts. neslib provides `scroll()` and buffered VRAM update helpers.
- **Everything PPU-touching happens in vblank.** The main loop computes; the NMI handler does OAM DMA, the queued nametable/attribute writes, palette changes, and sets scroll — in that order, within the vblank budget.

### E. Background collision against a tile/metatile map

nesdoug's metatile approach (the standard cc65 pattern):

- Represent the room as **16×15 metatiles** (each metatile = 2×2 tiles = 16×16 px) → a **240-byte** collision array instead of 960 bytes. The **high nibble of Y** and **high nibble of X** index straight into it (cheap on 6502).
- A parallel **collision-property table** maps each metatile id → behaviour (solid, passable, coin, spike, `?`, brick, pipe-enter, etc.).
- Actor-vs-map: test the metatile at the actor's leading edge(s) for the axis of motion (check feet for floor when falling, head for ceiling when rising, front for walls), resolve by snapping to the tile boundary. This mirrors SMB's own block-side collision that also decides brick-bump vs break and item dispense.

### F. Enemy AI / state machines / projectile pools in C

- nesdoug's platformer chapters implement enemies as **state machines over the SoA arrays**: e.g. a "chaser" that reverses at walls and a "bouncer" that checks the floor while falling and stops exactly at the floor point — directly analogous to SMB's Goomba (wall-reverse, no ledge sense) and the shell/hop behaviours.
- **Projectile pools** are just a small SoA with an `active` flag per slot — exactly SMB's fireball model (2 fixed slots, thrown only into an inactive slot). Give each slot position/velocity/state; iterate the pool each frame; free on off-screen or collision.
- **Powerup state machines** map cleanly to a single `char` state var per SMB (`0 small / 1 super / 2 fire`) with transition rules on pickup and on hit (step down; small+hit = death), plus a separate invincibility timer for the Star.

### G. Established writeups & tutorials (for the SMB internals specifically)

- **The SMB disassembly** (doppelganger `SMBDIS.ASM`; interactive at 6502disassembly.com; high-level restructured version on romhacking.net) — the authoritative source for every constant above.
- **SuperMarioBros-C** (MitchellSternke) — a C/C++ translation of the original ROM; useful to read the physics as procedural C.
- **Retro Game Mechanics Explained** (YouTube) — frame-accurate breakdowns of SMB movement/RNG/scrolling.
- **jdaster64's** player-physics doc and Stats Compendium — the most-cited pixel/frame conversion of the constants.
- **SDA Knowledge Base** and **TASVideos GameResources/NES/SuperMarioBros** — mechanics, RNG (frame-based LFSR), 21-frame rule, flagpole/fireworks timing.

---

## Actor / object-system design implications (for your engine)

1. **Structure-of-arrays, not array-of-structs.** One `char[]` per field per actor type; index by slot. Fixed-size pools (`MAX_ENEMIES`, `MAX_FIREBALLS=2`, `MAX_ITEMS`, `MAX_COINS`). This is both faster on 6502 *and* matches how SMB is written.
2. **Fixed-point everywhere.** Positions = `pixel + page` (two bytes) with a sub-pixel fraction byte; velocities = signed 4.4 (or 8.8) with a `MoveForce` fractional accumulator that carries into the whole-pixel speed. Copy SMB's exact constants above to get its feel, then tune.
3. **Two gravities per jump** (hold vs fall), selected by "A held & still rising & within a small rise window." This one rule is what produces variable jump height — implement it before anything else if you want SMB feel.
4. **Take-off-speed-indexed jump tables** (initial Y speed + both gravities) give the "run jumps go higher and farther" behaviour for free — mirror the 5-entry tables.
5. **Collision on a 16×16 metatile map** with a per-metatile property table; resolve per axis at leading edges. Fold block-bump / brick-break / item-dispense / coin-collect into the same tile-hit path SMB uses.
6. **Enemy AI = tiny per-slot state machine.** Walk at ~0.5 px/f; reverse on wall/enemy contact; **no ledge sensing** (green Koopa/Goomba fall off). Stomp → squash/shell; kicked shell = ±3 px/f projectile that chains kills.
7. **Projectiles are a 2-slot pool** gated on `state==inactive`; bounce on ground, cap fall at 3 px/f, despawn off-screen/on wall.
8. **Rendering:** shadow-OAM in RAM, DMA in NMI; metasprites terminated by `$80`; 8×16 sprite mode for characters; cycle OAM priority to convert drop-outs into flicker; keep the HUD as background with a **sprite‑0 scroll split**.
9. **Scrolling is one-way**: lock the camera's left edge and treat screen-left as a wall; stream one nametable column + attributes per 16 px of scroll, buffered and flushed in vblank.
10. **Tile budget:** if one 8 KB CHR page isn't enough, move to **MMC3** for 1 KB CHR banks + scanline IRQ (also lets you animate BG by bank-swapping), rather than fighting NROM.

---

## Sources (URLs)

**SMB internals / physics**
- Comprehensive SMB disassembly (doppelganger, `SMBDIS.ASM`): https://gist.github.com/1wErt3r/4048722
- Interactive/annotated version: https://6502disassembly.com/nes-smb/ and https://6502disassembly.com/nes-smb/SuperMarioBros.html
- High-level restructured disassembly: https://www.romhacking.net/documents/635/
- SMB → C translation (SuperMarioBros-C): https://github.com/MitchellSternke/SuperMarioBros-C
- SMB1 RAM map (Data Crystal / TCRF): https://datacrystal.tcrf.net/wiki/Super_Mario_Bros./RAM_map
- SDA Knowledge Base — Super Mario Bros.: https://kb.speeddemosarchive.com/Super_Mario_Bros.
- TASVideos GameResources / NES / Super Mario Bros: https://tasvideos.org/GameResources/NES/SuperMarioBros
- jdaster64 (physics research / Stats Compendium): https://www.mariowiki.com/User:Jdaster64
- NESdev forum — "Super Mario Physics": https://forums.nesdev.org/viewtopic.php?t=10447

**World 1‑1 layout**
- Super Mario Wiki — World 1‑1 (SMB): https://www.mariowiki.com/World_1-1_(Super_Mario_Bros.)
- StrategyWiki — SMB / World 1: https://strategywiki.org/wiki/Super_Mario_Bros./World_1
- Super Mario Wiki — Fireball: https://www.mariowiki.com/Fireball
- Super Mario Wiki — Koopa Troopa (ledge/shell behaviour): https://www.mariowiki.com/Koopa_Troopa
- Super Mario Wiki — Goomba: https://www.mariowiki.com/Goomba

**NES engine / cc65 / hardware**
- nesdoug — NES programming with cc65 (index): https://nesdoug.com/
- nesdoug — Platformer (ch. 14): https://nesdoug.com/2018/09/05/14-platformer/
- nesdoug — Sprites (ch. 6): https://nesdoug.com/2018/09/05/06-sprites/
- nesdoug — Metatiles / BG collision: https://dag7.gitbook.io/nesdoug-nes-guide/11.-metatiles and https://nesdoug.com/2020/06/09/bg-collision/
- nesdoug — Advanced Mapper MMC3 (ch. 24): https://nesdoug.com/2019/11/11/23-advanced-mapper-mmc3/
- neslib (Shiru) header (metasprite/oam API): https://github.com/jmk/cc65-nes-examples/blob/master/neslib.h and notes: https://nesdoug.com/2017/04/13/my-neslib-notes/
- NESdev Wiki — PPU OAM: https://www.nesdev.org/wiki/PPU_OAM
- NESdev Wiki — Don't hardcode OAM addresses: https://www.nesdev.org/wiki/Don't_hardcode_OAM_addresses
- NESdev Wiki — PPU registers (sprite 0 hit, 8×16): https://www.nesdev.org/wiki/PPU_registers
- NESdev Wiki — CHR ROM vs CHR RAM: https://www.nesdev.org/wiki/CHR_ROM_vs._CHR_RAM
- NESdev Wiki — MMC3 / Programming MMC3: https://www.nesdev.org/wiki/MMC3 , https://www.nesdev.org/wiki/Programming_MMC3
- NESdev Wiki — Mapper overview: https://www.nesdev.org/wiki/Mapper
- 8bitworkshop NES docs: https://8bitworkshop.com/docs/platforms/nes/
- Nerdy Nights (classic NES asm tutorial mirror): https://nerdy-nights.nes.science/

> **Where sources disagree:** (a) **Terminal fall speed** — the disassembly hard-caps whole-pixel Y speed at `$04` (4 px/f), while jdaster64/TAS notes cite an effective ≈4.5 px/f once the sub-pixel accumulator is counted. (b) **Bonus-room coin count** in 1‑1 — commonly given as 19 (Mario Wiki, casual pass) up to ~24 depending on whether the top row is reached. (c) **End-of-level time→score multiplier** is often quoted as 50 pts/unit but the exact figure is inconsistently reported; treat as tunable.
