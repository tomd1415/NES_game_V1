# Next improvements — prioritised roadmap (2026-07-06)

Written at the end of an autonomous session that shipped engine **v10** (flyer +
patrol enemy paths) and **v11** (basic-platformer stomp), fixed bugs #14/#17/#18,
investigated #16/#28, and swept the whole `recently-observed-bugs.md` list. This
doc is the pick-list for what comes next, tagged by **value / effort / risk /
can-it-be-done-unattended**, so any future session can grab the top item that
fits its constraints.

Legend — **Unattended?**: ✅ safe to do test-gated without a human · ⚠️ needs
in-emulator playtesting or visual sign-off · ⛔ high blast-radius, do attended.

## A. Ready + safe (do these first, unattended-friendly)

1. **Geometry Dash preset (bug #11)** — *value: med (explicit pupil ask) ·
   effort: low · risk: low · Unattended: ✅*. The runner style already is the GD
   loop (auto-scroll, tap-jump, spike-restart). Add a discoverable "Geometry
   Dash" starter/picker entry with a spike-heavy sample level + a short tutorial.
   Test: a launch+build+play E2E like the other styles. Watch for: don't
   duplicate the runner engine — it's a themed preset, not a new engine.
2. **Enemy-animation behavioural test** — *value: low-med · effort: low ·
   risk: none · Unattended: ✅*. #17 wired the UI; `round1-polish.mjs` covers the
   bake. Add a focused test that an enemy created via the new role-tagged path
   actually cycles frames in the ROM (OAM tile index changes over time).
3. **More enemy paths (extend v10 → v12)** — *value: med · effort: med · risk:
   low (gated) · Unattended: ✅*. e.g. a **shooter** (periodically spawns a
   projectile toward the player, reusing the fireball/spawn machinery) or a
   **jumper/hopper**. Same recipe as v10/v11: gate off-by-default, degrade on
   old engines, behavioural test, snapshot. Keep the perf budget in mind
   (see the engine-perf-budget memory) — gate off-screen actors.

## B. Valuable but needs a human in the loop

4. **Stomp feel tuning (finish #15)** — *Unattended: ⚠️*. v11 shipped with
   `BW_STOMP_MARGIN=8`, `BW_STOMP_BOUNCE=12`. Play a real level and tune the
   margin (how much of the enemy's top counts as a stomp) and the bounce height.
   Consider a small score/coin reward on a stomp.
5. **Audio config (Sprint 5)** — *Unattended: ⚠️*. Surface FamiStudio
   `FAMISTUDIO_USE_*`, tempo, and SFX→event bindings; add an audio budget. All
   server-mediated (blobs linked into the fixed NROM) and must be *heard* to
   confirm — attended. See `2026-07-05-trust-and-hardening.md` Sprint 5 scoping.
6. **PRG budget meter (Sprint 5)** — *Unattended: ⛔*. Needs `ld65` to emit a
   map file (a linker-invocation change that would fail *every* build if wrong),
   then server parse + `/play` field + Studio meter. CHR/OAM meters already
   cover the common failure, so lower urgency. Do attended, behind the golden
   gate, verifying the linker change on a known-good build first.

## C. Architectural (design needed before code)

7. **Scrolling engine (bugs #2/#3/#9/#29/#10)** — *Unattended: ⛔*. Multi-screen
   door stale-nametable, vertical / 2×2 scroll glitches, and ">2 screens" all
   trace to the scroll/nametable-streaming model (plan **§T3.1**). This is a
   deliberate architecture task — read `docs/reference/nes-resources.md`
   (PPU scrolling / rendering / frame-timing) and the codegen review first, then
   design the nametable-streaming + scroll-split approach before touching code.
   Highest-impact remaining item, but the riskiest — do NOT rework unattended.
8. **Per-background scene lists (finish #14)** — *Unattended: ⚠️→⛔*. Today all
   scene instances are one shared list across `backgrounds[]`. "Different enemies
   per room" needs a per-bg scene model + codegen that loads the right scene when
   a door swaps rooms. Editor + codegen + engine change — design first.

## D. Lower priority / long-horizon (unchanged backlog)

- Compact metatile storage for larger worlds; 8×16 sprite mode across the whole
  pipeline; CHR banking / mapper only if teaching value justifies (real SMB is
  NROM, decision D-9); in-browser cc65/WASM build; teacher dashboard; the full
  hand-written 6502 ASM engine (low-priority educational backlog — do not start
  unprompted).

---

*Guardrails carry over: keep golden-ROM byte-identity for the default project
(gate every new engine behaviour off-by-default), test emitted C **and** ROM
behaviour, and bump `ENGINE_VERSION` + snapshot for any ROM-output change.*
