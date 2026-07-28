# Project status — where we are now

**Living document.** Update it when a session ends or an engine version ships;
don't date-stamp the filename. This is the file to read *first* when picking up
work cold, and the file to refresh *last* before putting work down.

- **Last updated:** 2026-07-28
- **Branch:** `main`
- **Engine version:** **v78** (the dialogue box no longer flashes the screen)
- **Node build/regression suite:** ✅ green, including the golden
  byte-identical-ROM hashes (`node tools/builder-tests/run-all.mjs`,
  verified 2026-07-28 at v78)
- **Studio E2E:** ✅ **141 passed** (2026-07-28, 3.0 min) — 129 from before this
  week, plus 5 in `emulator-crash-banner.spec.js` (#37), 2 in
  `enemy-bump.spec.js` (#30) and 5 in `palette-keys.spec.js` (#39, which also
  covers the two legacy painter pages). Confirms the suite survives engine
  v76/v77/v78, the emulator watchdog and the new Style-tab toggle.
- **Playtest ROMs:** regenerated 2026-07-28 and **byte-identical** to the
  v76-era build (`node scripts/make-playtest-roms.mjs`, hashes compared before
  and after, at v77 *and* again at v78). v77's enemy-bump is off by default and
  v78 only changes dialogue-enabled builds, so the ROMs waiting on the attended
  playtests are unaffected and do not need re-judging against a newer engine.
  - ✅ **Run the normal way** — `npx playwright test` from the repo root, no
    config override, against the image's **own baked Chromium** (build 1228,
    matching Playwright 1.61.1). The earlier caveats are retired: the container
    *has* now been rebuilt on the host (image built 2026-07-27 21:26), which was
    the last unverified link. The throwaway-config / system-Chromium-150 workaround
    is no longer needed and shouldn't be reused.
  - Why Chromium is *baked* rather than allowlisted: `init-firewall.sh` resolves
    each allowed host's A records once at container start and pins the IPs, and
    `cdn.playwright.dev` rotates them, so a runtime download fails mid-session.
    Build time has unrestricted egress. `ARG PLAYWRIGHT_VERSION` in the Dockerfile
    **must** match `package-lock.json`; the builder-tests suite fails if they drift.
  - The rebuild also exposed a half-linked global `claude` bin from
    `npm install -g`; the Dockerfile now repairs it at build time and fails the
    build if it stays broken, so an agent-less image can't ship silently.

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

**About 33 of the 39 are done**, leaving ~6 genuinely open (2026-07-28: #31
closed by engine v78, and #24 found already complete on audit). Treat that as a
rough tally, not a metric — the items are marked up in prose ("*Done*",
"*FIXED 2026-07-10 (engine v63)*", …) with no machine-readable status, so the
number is hand-maintained and drifts. **The grouping in "What is genuinely
open" below is the authoritative part** — it says not just what is open but
what each one is waiting on.

## Recent engine versions

| Version | Closed |
| ------- | ------ |
| v78 | #31 — the dialogue box's forced-blank flash, the last slice of that item |
| v77 | #30 — enemy-vs-enemy AABB separation, the last slice of that item |
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

~~**#24** — the gallery remove-gating half is not evidenced as done.~~
**Resolved 2026-07-28 — it *is* done; this entry was stale.** Audited end to
end and every half of the item is shipped and covered:

- *Server* — `/gallery/remove` denies by default
  (`playground_server.py` `_gallery_remove_response`): a valid teacher/admin
  secret may remove anything, otherwise the caller must be signed in (401
  `not_logged_in`) **and** own the entry (403 `not_owner`). Ownership is the
  `owner` id stamped into `metadata.json` at publish.
- *List* — `/gallery/list` exposes a per-entry `owned` boolean and deliberately
  does **not** leak the raw numeric owner id.
- *UI* — `gallery.html` renders the 🗑 Remove button only for `entry.owned` or
  teacher mode, and translates 401/403 into plain-language messages. The Studio
  has no separate gallery view; its Gallery button opens this page.
- *Tests* — `tools/builder-tests/gallery-auth.mjs` covers anonymous→401,
  wrong-pupil→403 `not_owner`, owner→200, a pupil against an anonymous
  entry→403, teacher→200, and a wrong secret rejected. The cross-computer half
  (`/auth/*`, `/me/projects`) is covered by `accounts.mjs`,
  `account-projects.mjs` and `account-ui.mjs`. All green in the 2026-07-28 run.

### Shipped features with a known remaining slice

| # | Remaining slice |
| - | --------------- |
| #6 | Per-sprite / per-area fine-tuning (jump/gravity/walk presets are done) |
| #10 | Vertical scroll still capped at 2 screens — a hard engine limit |
| #13 | Chaser variants / homing |
| #14 | Multi-screen rooms still fall back to the shared scene (v75 is v1) |
| #26 | Per-feature top-down parity sweeps |
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
  so #10's wide-scroll work is live. **Still needs redoing — now for v78.** The
  live host was confirmed current at v75, so it is three engine versions behind
  (v76 OAM fixes, v77 enemy bump, v78 dialogue flash). Needs `main` deployed
  plus the Python server restarted. Host-side, not a session job.
- ~~**Should `.devcontainer/` be committed?**~~ **Resolved 2026-07-21** — it is
  tracked (`d87ebcd`). Remaining wrinkle: it expects `$HOME/claude-skills` and
  `/usr/local/share/claude-guidance` **on the host**, so a fresh clone elsewhere
  would need those paths (or the mounts trimmed) before it builds.
- ~~**The emulator crash banner has no E2E coverage.**~~ **Closed 2026-07-27** —
  `tools/studio-tests/emulator-crash-banner.spec.js` covers all four failure
  modes in a real browser: malformed ROM (dialog opens and explains, instead of
  Play doing nothing), a `nes.frame()` throw (banner shown *and* the loop torn
  down, not left re-throwing 60×/s), a watchdog stall, retry rebooting the cart,
  and closing the dialog leaving no orphaned interval. Mutation-tested — removing
  the `loadROM` guard, the watchdog verdict, `close()`'s `stopLoop()`, or the
  frame `try/catch` each fails a specific test.

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
