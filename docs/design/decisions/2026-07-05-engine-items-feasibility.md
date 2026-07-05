# NES-engine items — feasibility & risk (spike)

**Date:** 2026-07-05 · **Branch:** `redesign/ui-ux`

A read-only investigation of the Phase-4 "engine" backlog to decide which,
if any, is safe to implement without breaking the shipped, classroom-tested
ROM pipeline. **No code was changed** for this spike.

## The safety lever

The golden-ROM tests pin real output:
- `tools/builder-tests/_rom-equiv.mjs` pins a **sha1 of the "everything-on"
  ROM**. Any byte change to a fully-featured build fails.
- `tools/builder-tests/four-screen.mjs` pins **iNES header byte 6** per
  project shape.

The pipeline's invariant (e.g. `platformer.c:30`, `playground_server.py:1064`)
is that **unused features are stripped by the C preprocessor / cc65 dead-code
elimination, so ROMs stay byte-identical.** That is the lever that makes
"behind an off-by-default flag" safe: as long as existing configs don't set
a new flag, their ROM — and its hash — is unchanged.

## Findings

| Item | Where it lives | Scaffolding | Golden-ROM risk | Size |
| ---- | -------------- | ----------- | --------------- | ---- |
| **8×16 sprites** | Sprite height is nowhere today. PPUCTRL hardcoded `0x10` (`platformer.c:691/695`, `scroll.c:25`); metasprites are an 8×8 grid built in the OAM hot loop (`platformer.c:~1465-1671`); CHR encoded 8×8 (`playground_server.py:592-614`). | none | **HIGH** — rewrites the OAM/CHR hot loop shared by every game style (exactly what `_rom-equiv` hashes). | LARGE |
| **Per-door destinations** | `builder-modules.js modules['doors']` emits one global `spawnX/Y/targetBgIdx`; door tiles detected via `BEHAVIOUR_DOOR`. Multi-bg swap runtime behind `BW_DOORS_MULTIBG_ENABLED`. | doors module + tile detection ship; **no per-door data structure** (behaviour grid stores one door id, no per-tile payload). | **MEDIUM** (LOW for the same-room variant) — fully module-gated; door-off projects untouched. | MEDIUM |
| **CHR bank switching** | Fixed mapper-0 / 1 CHR bank (`src/reset.s:33-37`, `cfg/nes.cfg`, `graphics.s:45`). Note: cc65 v2.18 nes.lib hardcodes header byte 6, so the header is **post-patched** (`playground_server.py:2421-2436`). | none | **HIGH** — new mapper + multi-bank CHR + header post-patch changes every ROM's hash. | VERY LARGE |
| **Bigger worlds (>2×2)** | Worlds stored fully-expanded to 8×8 nametables; 2×2 cap in `scroll.c:302-303`; `scroll_stream()` assumes screens 0/1. | **partial** — `MetatileLib` + server `_expand_metatile_bg` exist, but the NES-side compact `mt_map[]`/`mt_defs[]` (E1-4) does not. | **MEDIUM-HIGH** — gated by `SCROLL_BUILD`, but rewrites the RAM/streaming model in `scroll.c`. | LARGE |

## Recommendation

**Per-door destinations, the *same-room* spawn variant** (each Door tile
teleports the player to its own spawn point; no background swap) is the
single lowest-risk engine item:

- Touches **neither** the iNES header/CHR path (rules out #3) **nor** the
  shared OAM/CHR hot loop (#1) **nor** the scroll core (#4).
- Has the most existing scaffolding (working doors module + tile detection).
- **Sidesteps the "NMI frame-model rework" blocker**, which applies only to
  per-door *cross-room* swaps, not to per-door spawn points within one room.
- Fully module-gated: keep the existing single-global-door codepath
  byte-identical unless a new "per-door" sub-flag / >1 configured door is
  present, so the pinned `everything-on` sha1 is preserved.

**Primary files:** `builder-modules.js` (doors module — per-door schema +
table emission), the door-detection block it emits into `platformer.c`, and
the behaviour/door-id emission in `playground_server.py` (~1944+). No changes
to `cfg/nes.cfg`, `src/reset.s`, the OAM builder, or `scroll.c`.

## The open decision (needs the team)

Per-door spawns need a **WORLD editor UX**: door tiles all share one
behaviour-type id, so the editor must let a pupil select an *individual*
placed door cell and give it a target — a new interaction and a new
per-cell data structure (`bg.doorSpawns[{x,y}] = {spawnX, spawnY}`). And
because it edits the **shipped cc65 codegen**, it should land as a reviewed
change with the golden-ROM tests as the guardrail, not a blind edit.

The other three items (8×16, CHR banks, bigger worlds) are each HIGH-risk
and LARGE, touching the ROM header or a hot loop the golden tests pin —
they belong in dedicated, reviewed engine sprints, not autonomous edits.
