# Project status — where we are now

**Living document.** Update it when a session ends or an engine version ships;
don't date-stamp the filename. This is the file to read *first* when picking up
work cold, and the file to refresh *last* before putting work down.

- **Last updated:** 2026-07-20
- **Branch:** `main`
- **Engine version:** **v75** (per-room scene instances)
- **Node build/regression suite:** ✅ green, including the golden
  byte-identical-ROM hashes (`node tools/builder-tests/run-all.mjs`,
  verified 2026-07-20)
- **Studio E2E:** not re-run at the time of writing (`npx playwright test`)

## How work is tracked

Work is feedback-driven. The authoritative sources, in order:

1. [`feedback/recently-observed-bugs.md`](feedback/recently-observed-bugs.md) —
   the **numbered list #1–#38**. This is the backlog. (Note: the older
   [`feedback/PUPIL_FEEDBACK.md`](feedback/PUPIL_FEEDBACK.md) is an unnumbered,
   largely superseded themed log — don't mistake it for the numbered list.)
2. [`changelog/changelog-implemented.md`](changelog/changelog-implemented.md) —
   its "Engine v11 → v75 bring-forward summary" is the cross-reference of which
   engine version closed which `#n`.
3. [`tools/engines/CHANGELOG.md`](../tools/engines/CHANGELOG.md) — per-version
   engine detail.

Roughly **28 of the 38 items are done.**

## Recent engine versions

| Version | Closed |
| ------- | ------ |
| v75 | #14 — per-room scene instances (place enemies/players per background) |
| v74 | #7 / #27 — event sound effects on jump / pickup / hurt / win |
| v73 | #35 — invincibility frames floored at 10 (no more instant kill) |
| v72 | #13 — shooter/turret enemy path |
| v71 | #13 — hopper enemy path |

## What is genuinely open

### Needs a human at a keyboard (attended)

- **#7 / #27 — FCEUX audio playtest.** *The clearest blocker.* The feature
  shipped in v74 but cannot be marked done: jsnes APU inspection is too fragile
  to verify audio automatically, so someone has to listen to it. See
  [`guides/DEBUGGING_FCEUX.md`](guides/DEBUGGING_FCEUX.md).
- **#15 — stomp feel tuning.** `BW_STOMP_MARGIN=8` / `BW_STOMP_BOUNCE=12` need a
  human judging whether the bounce feels right.

### Blocked on a pupil repro, not on engineering

- **#34** — collision feels "1 pixel across" on Start.
- **#37** — random emulator crash/freeze. *Partly actionable without the repro:*
  the plan flags unguarded player/P2 OAM loops and a jsnes loop with no
  watchdog. That hardening is worth doing regardless.
- **#28** — NPC dialogue misbehaving; the font-tile class of bug is fixed, a
  fresh symptom capture is needed before more coding.

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

- **Is `main` actually deployed?** #10's notes say the live site runs on a
  separate host and needs `main` deployed plus the Python server restarted to
  pick up the wide-scroll work. Nothing confirms that happened.
- `.devcontainer/` is untracked in the working tree — decide whether it gets
  committed.

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
