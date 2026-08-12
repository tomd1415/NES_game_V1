# Project status — where we are now

**Living document.** Update it when a session ends or an engine version ships;
don't date-stamp the filename. This is the file to read *first* when picking up
work cold, and the file to refresh *last* before putting work down.

- **Last updated:** 2026-08-12 (unattended maintenance — failures that reported a
  *wrong* reason rather than none, both suites re-run green; no engine change).
  ⚠️ **The 2026-08-09/12 work below is local and unpushed** — `origin/main` is at
  `780cf5c` and has not moved, so it is a clean fast-forward whenever it goes.
  For the count, ask git rather than this file:
  `git log --oneline origin/main..main | wc -l` (16 at the time of writing, and
  that number is exactly the kind that rots — an earlier draft of this line said
  15 and was wrong one commit later).
- **Branch:** `main`
- **Engine version:** **v78** (the dialogue box no longer flashes the screen)
- **Node build/regression suite:** ✅ green, including the golden
  byte-identical-ROM hashes (`node tools/builder-tests/run-all.mjs`,
  **114 suites, exit 0, re-run 2026-08-12 at v78**, ≈6 min) — plus 22 invariants
  and 38 syntax checks. The 38 are 32 shipped `.js` modules, 5 inline HTML script
  bodies and `playground_server.py`; the 32 match the 32 non-vendored `.js` files
  on disk exactly, which is the point of enumerating them at runtime rather than
  hand-listing (it used to check 14 and silently skip the rest).
- **Studio E2E:** ✅ **157 passed, exit 0** (`npx playwright test`, 7.1 min,
  re-run 2026-08-12 at v78) across 34 spec files. Was 147 on 2026-07-30; the ten
  added since are the silent-failure guards from the 2026-08-09 maintenance —
  4 in `mode-hook-errors.spec.js`, 3 in `attr-conflict-screen.spec.js` and 3 in
  `mode-module-registry.spec.js`. Still confirms the suite survives engine
  v76/v77/v78, the emulator watchdog and the Style-tab toggle.
  - ⚠️ **Under host load the committed 30s per-test limit can still be too tight**,
    and the run then shows false red. Known tells, all unrelated to any recent
    change: `project-file` NAM round-trip (59.1s) and `budget` CHR (41.6s) on
    2026-07-30, and `tutorial › every game style` (46.6s) on 2026-08-09 at host
    load 39. Re-run with `--timeout=120000` to tell an environment problem from a
    real one.
  - The warning stands but is not a certainty: the 2026-08-12 run above was fully
    green *with load rising to ~14.5*, `tutorial › every game style` included. So
    a green run under load proves nothing about the next one, and a red test named
    above is still worth re-running before believing it.
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

## 2026-08-06/07 unattended maintenance — what changed

No engine change, so **still v78**. The 2026-08-06 commits are on `origin/main`
(`780cf5c`); the `startServer` hardening below landed after them.

- **Docs audited against the code.** ~60 concrete claims in `README.md` and
  `CLAUDE.md` (paths, ports, commands, flags, mode levels, key bindings) were
  checked individually. All but two held. Fixed: `level.nam` was listed under
  `src/` (it lives in `assets/backgrounds/`), and — the bigger one — **CLAUDE.md
  said a `/play` leaves engine sources modified in `git status`. It no longer
  does**: `_build_rom()` builds in a `TemporaryDirectory`. That advice would have
  taught people to ignore a real modification. Evidence: a full 114-suite run left
  `git status steps/Step_Playground/` empty.
- **The documented 18790 double-claim is fixed.** `asm-corpus`, `asm-realproj`
  and `asm-player` moved to 18895–18897, and `run-all.mjs` gained a check that
  reads the E2E port out of `playwright.config.js` and fails if any suite names
  it. The clash had survived for weeks behind a doc note; a doc note is not a
  check. Builder-test range is now **18768–18897**.
- **Gates were mutation-tested** — five deliberate breakages, four caught, one
  limitation found and written up in `tools/builder-tests/README.md`: a green
  snapshot check does **not** mean the working tree is clean, because `--check`
  reads from HEAD.
- **`startServer` hardened (2026-08-07)** — the root cause behind the port clash,
  not just the symptom. It used to spawn, sleep a blind 1500 ms and return, so a
  server that surrendered the port (exit 0, "already running") went unnoticed and
  the suite tested a server it had not configured. It now pre-checks the port
  before spawning, waits for the child's own `listening on` banner rather than for
  the port to answer, and confirms the child is alive. The happy path is ~4×
  faster per call as a side effect (≈340 ms vs 1500 ms; ~90 s over a full run —
  *not* the larger wall-clock swing between runs, which was host load). The first
  version of this fix was wrong and its own positive control caught it: it polled
  `/health` after spawning and "passed" against an occupied port because Python
  had not finished starting up. See `tools/builder-tests/README.md`.
- **New docs:** [`LESSONS-LEARNT.md`](LESSONS-LEARNT.md) (what has cost time here,
  by mistake-shape, including the false theories) and a step-by-step plan for
  #14's remaining slice at
  [`plans/current/2026-08-06-item-14-multiscreen-rooms.md`](plans/current/2026-08-06-item-14-multiscreen-rooms.md).
- **Dead code found, not removed** (needs a non-doc change): eight unreferenced
  path constants in `playground_server.py` — `CHR_PATH`, `NAM_PATH`, `SCENE_INC`,
  `PAL_INC`, `COLLISION_H_PATH`, `BEHAVIOUR_C_PATH`, `BG_WORLD_H_PATH`,
  `BG_WORLD_C_PATH`. `DEFAULT_MAIN_C`/`DEFAULT_MAIN_S` beside them are live.

## 2026-08-09/12 unattended maintenance — what changed

No engine change, so **still v78**. All of this is **local and unpushed** at the
time of writing (see the warning under "What is genuinely open").

The theme was one shape: **a failure that reports a wrong reason instead of no
reason.** Quiet failures are already covered in `LESSONS-LEARNT.md` §1; these are
worse, because they supply an explanation convincing enough to stop the reader
looking.

- **A mode that fails to load no longer claims it is unbuilt.** `studio.js` shows
  a placeholder when `window.StudioModes[id]` is missing — "This mode arrives
  later in the redesign". True in Phase 0; all eight modes have shipped since, so
  that branch now means a module *failed to load* (renamed file, syntax error,
  dropped `<script>`). A pupil was told the feature was planned and a teacher
  would file it as "not finished yet". The copy stays — a pupil can do nothing
  about a failed load — but the real reason now reaches the console once per mode.
  Guarded by `mode-module-registry.spec.js`, which enumerates the rail and the
  registry **at runtime**: `MODES` is closure-private, and a source-scanning
  version would have matched the comment explaining itself.
- **A mode whose overlay hook throws now says so, once.** Both `onRenderOverlay`
  catches were `catch (e) {}`, so a mode silently stopped drawing its grid / hover
  / selection for ever. Reported once per mode+hook, never per frame (#37).
- **…and that fix's own message was wrong, and is fixed too.** It said the overlay
  was "suppressed for the rest of this session". Nothing suppresses it: both call
  sites are inside `renderLive()`, so the hook is called and throws on every
  render for ever. What is said once is the message. Now pinned by a test — six
  renders must mean six calls.
- **WORLD's palette-clash count follows the viewed screen.** The red X overlay was
  offset-aware and the counter was not, so on any level wider than one screen the
  number and the marks described different places: Xs with a count of 0, or a
  count with no Xs anywhere. A wrong number, shown to a child, with nothing
  failing.
- **`stopServer` waits for the child, and fails if it cannot kill it.** Two
  commits: it used to `kill` then sleep 300 ms and hope, the mirror of the
  `startServer` bug above; and the first fix still returned quietly if the child
  survived SIGKILL, leaking a server whose port would then fail *someone else's*
  suite with an error blaming them.
- **The JS syntax gate enumerates instead of hand-listing.** It checked a
  hardcoded 14 filenames with an `if (!exists) continue`, so 18 of 32 shipped
  modules were never checked — including every Studio mode module. Now read from
  disk, with an explicit failure if the enumeration comes back empty.
- **Builder-test ports are not unique** — 19 are shared, one by four suites. Safe
  only because `run-all.mjs` is strictly serial; documented in
  [`guides/TEST-SERVERS.md`](guides/TEST-SERVERS.md) as a precondition, because
  parallelising the suite would collide all 19 on contact.
- **Docs corrected against the code:** `_resolve_engine_versions` in
  `playground_server.py` justified itself with "for v1..v2 the static cc65 sources
  are identical" — true until v19/v20, and we are on v78 (the conclusion still
  holds; only the reason had rotted). Plus the BUILDER_GUIDE module coverage
  (10 of 18) and the deliberate broken links, both signposted rather than "fixed".

## How work is tracked

Work is feedback-driven. The authoritative sources, in order:

1. [`feedback/recently-observed-bugs.md`](feedback/recently-observed-bugs.md) —
   the **numbered list #1–#39**. This is the backlog. (Note: the older
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
