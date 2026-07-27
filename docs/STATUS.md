# Project status — where we are now

**Living document.** Update it when a session ends or an engine version ships;
don't date-stamp the filename. This is the file to read *first* when picking up
work cold, and the file to refresh *last* before putting work down.

- **Last updated:** 2026-07-26
- **Branch:** `main`
- **Engine version:** **v76** (Player 1 OAM cursor can no longer wrap or overrun)
- **Node build/regression suite:** ✅ green, including the golden
  byte-identical-ROM hashes (`node tools/builder-tests/run-all.mjs`,
  verified 2026-07-26)
- **Studio E2E:** ✅ **129 passed** (2026-07-27, ~3.2 min) — first run since
  before 2026-07-20, so this is the first confirmation the suite survives engine
  v76 and the emulator watchdog.
  - ⚠️ **Run against *system* Chromium 150** (`apt-get install chromium`, pointed
    at via a throwaway config), **not** Playwright's own build. Playwright 1.61.1
    expects Chromium 149, so treat this as strong evidence, not proof.
  - ⚠️ **The container has still never been rebuilt.** The Dockerfile now bakes
    Chromium at build time (2026-07-27), because `cdn.playwright.dev` rotates IPs
    and the egress allowlist pins them once at startup — but Docker is
    deliberately unavailable *inside* the container, so that change is unverified.
    Rebuild on the host, then re-run `npx playwright test` plainly (no override)
    to confirm. The apt-installed Chromium lives in the container's writable
    layer and disappears on rebuild — which is fine, the image supplies the
    proper one.

## How work is tracked

Work is feedback-driven. The authoritative sources, in order:

1. [`feedback/recently-observed-bugs.md`](feedback/recently-observed-bugs.md) —
   the **numbered list #1–#38**. This is the backlog. (Note: the older
   [`feedback/PUPIL_FEEDBACK.md`](feedback/PUPIL_FEEDBACK.md) is an unnumbered,
   largely superseded themed log — don't mistake it for the numbered list.)
2. [`changelog/changelog-implemented.md`](changelog/changelog-implemented.md) —
   newest section first; the "Engine v11 → v75 bring-forward summary" is the
   bulk cross-reference of which engine version closed which `#n`, with later
   sections above it for what shipped since.
3. [`tools/engines/CHANGELOG.md`](../tools/engines/CHANGELOG.md) — per-version
   engine detail.

**About 29 of the 38 are done**, leaving ~9 genuinely open. Treat that as a
rough tally, not a metric — the items are marked up in prose ("*Done*",
"*FIXED 2026-07-10 (engine v63)*", …) with no machine-readable status, so the
number is hand-maintained and drifts. **The grouping in "What is genuinely
open" below is the authoritative part** — it says not just what is open but
what each one is waiting on.

## Recent engine versions

| Version | Closed |
| ------- | ------ |
| v76 | #37 — two silent OAM-corruption bugs on the Player 1 draw (see below) |
| v75 | #14 — per-room scene instances (place enemies/players per background) |
| v74 | #7 / #27 — event sound effects on jump / pickup / hurt / win |
| v73 | #35 — invincibility frames floored at 10 (no more instant kill) |
| v72 | #13 — shooter/turret enemy path |
| v71 | #13 — hopper enemy path |

## What is genuinely open

### Needs a human at a keyboard (attended)

**Prepped and ready — see
[`guides/PLAYTEST-CHECKLIST.md`](guides/PLAYTEST-CHECKLIST.md).** Run
`node scripts/make-playtest-roms.mjs` to build the ROMs (gitignored;
regenerate after any engine change), then play them somewhere with sound and
tick the boxes. **Not in the dev container** — it has fceux but no display and
no audio device.

- **#7 / #27 — event-sound playtest.** *The clearest blocker.* Shipped in v74.
  The suite proves the SFX code is *linked* (events-ON and events-OFF ROMs
  differ, re-verified 2026-07-26 for the playtest ROM), but not that it is
  audible or right — jsnes APU inspection is too fragile to trust. Someone has
  to listen to four events: jump, pickup, hurt, win.
- **#15 — stomp feel tuning.** Three ROMs are built to A/B: the current
  `MARGIN 8 / BOUNCE 12`, a springier `BOUNCE 18`, and a more forgiving
  `MARGIN 12`. Pick a winner. (`stompBounce` is a Damage-module setting;
  `BW_STOMP_MARGIN` is currently fixed behind an `#ifndef`.)

### Blocked on a pupil repro, not on engineering

- **#34** — collision feels "1 pixel across" on Start.
- **#28** — NPC dialogue misbehaving; the font-tile class of bug is fixed, a
  fresh symptom capture is needed before more coding.
- **#37** — random crash/freeze. **The repro-independent hardening is now done**
  (2026-07-26); a pupil repro is still wanted for anything left over. What
  shipped:
  - *Browser* — the jsnes frame loop had no error handling, and an exception
    inside `nes.frame()` does not stop a `setInterval`, so a fault re-threw
    60×/second into a console no pupil sees while the game sat frozen. Now
    try/catch + a frame watchdog (stalled / pathologically slow) + a
    plain-language banner with a retry. `loadROM` is guarded too — a malformed
    ROM used to make Play do nothing at all.
  - *Engine (v76)* — two silent OAM-corruption bugs on the Player 1 draw, found
    by probing `oam_idx` after the draw. The ASM `draw_player` tracked the
    cursor in **Y (8-bit)**, so a 64-cell player wrapped it to 0 and everything
    drawn afterwards painted over the player; the C path had no bound at all and
    wrote 4 bytes past `oam_buf[255]`. Both fixed and regression-tested
    (`render-p1-oam-cursor.mjs`), plus the HUD heart loops now exit all three
    nested loops and the Builder counts the status bar's sprite-0 marker.
  - *Known limitation, documented not papered over:* a genuinely infinite
    **synchronous** loop inside `nes.frame()` still cannot be preempted from the
    page's own thread. That would need a worker or a patched jsnes.
  - *Follow-up if big players ever become common:* `draw_player` still uses an
    8-bit cursor; the server routes around it rather than widening it to 16 bits,
    which would cost every scroll build ROM bytes.

### Not started / parked

- **#23** — tablets & mobile. Self-declared very low priority; deferred until we
  see pupils on tablets.
- **#8** — default tempo and tempo-change triggers. Per-song tempo is out of
  scope (baked into the FamiStudio export); in-game tempo changes are feasible
  but were queued behind #7/#27.
- **#24** — accounts UI, `/auth/*` and `/me/projects` shipped, but the gallery
  remove-gating half is not evidenced as done.

### Shipped features with a known remaining slice

| # | Remaining slice |
| - | --------------- |
| #6 | Per-sprite / per-area fine-tuning (jump/gravity/walk presets are done) |
| #10 | Vertical scroll still capped at 2 screens — a hard engine limit |
| #13 | Chaser variants / homing |
| #14 | Multi-screen rooms still fall back to the shared scene (v75 is v1) |
| #26 | Per-feature top-down parity sweeps |
| #30 | Enemy-vs-enemy AABB overlap |
| #31 | Brief forced-blank flash when the dialogue box opens |
| #38 | Rendering a differently-sized jump pose in-engine |
| #5 | Shipped (hand-written 6502 engine, v11→v54) but never formally marked done |

### Verified-correct, no work needed

**#16** (palette fidelity) and **#32** (deleting the 2nd animation) were both
investigated on 2026-07-13 and found **not reproducible**. Repro cards are
parked in `recently-observed-bugs.md` in case they recur — don't re-open them
speculatively.

## Open questions to confirm

- ~~**Is `main` actually deployed?**~~ **Resolved 2026-07-26** — confirmed by the
  maintainer: the separate host runs current `main` with the server restarted,
  so #10's wide-scroll work is live. Note this needs redoing for **v76**.
- `.devcontainer/` is untracked in the working tree — decide whether it gets
  committed.
- **The emulator crash banner has no E2E coverage.** The 2026-07-27 run was
  green across all 129 specs, but **none of them touch it** — `grep -rl
  "emu-crash" tools/studio-tests/` returns nothing. So "E2E is green" says
  nothing about the #37 watchdog UI: the banner appearing, the retry button
  rebooting the ROM, and the loop being torn down on close are still guarded
  only by source-level assertions in `emulator-watchdog.mjs`. A spec that forces
  a fault and asserts the banner is the obvious next test to write.

## Standing guardrails

Restated here because they gate every engine change:

- Keep **golden-ROM byte-identity** for the default project.
- Gate every new engine behaviour **off by default**, so unused features are
  stripped by the preprocessor/cc65 and ROMs stay byte-identical.
- Test the **emitted C _and_ the ROM behaviour**, not just one.
- On any ROM-output change: bump `tools/engines/ENGINE_VERSION` **and**
  `tools/tile_editor_web/engine-version.js`, add a
  [`tools/engines/CHANGELOG.md`](../tools/engines/CHANGELOG.md) entry, and run
  `node scripts/snapshot-engine.mjs`. Full workflow in
  [`design/engine-versioning.md`](design/engine-versioning.md).

## A note on the older plan files

[`plans/current/2026-07-06-next-improvements.md`](plans/current/2026-07-06-next-improvements.md)
was the prioritised pick-list, but it is **stale and misleading as of
2026-07-20**: its entire A-tier has shipped, and its C-tier "highest-impact
remaining item" (the scrolling engine rework) was largely closed by v62–v66.
Read it for the guardrails and the D-tier long-horizon ideas (metatiles, 8×16
sprites, CHR banking/mapper, in-browser cc65/WASM, teacher dashboard), not for
what to do next. **This file supersedes its A/B/C tiers.**
