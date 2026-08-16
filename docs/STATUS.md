# Project status — where we are now

**Living document.** Update it when a session ends or an engine version ships;
don't date-stamp the filename. This is the file to read *first* when picking up
work cold, and the file to refresh *last* before putting work down.

- **Last updated:** 2026-08-13 (unattended maintenance — an eleven-item accepted
  work-list worked to completion; no engine change).
  ✅ **Everything below is pushed.** `main` and `origin/main` agree; the four-day
  divergence that earlier versions of this line warned about is closed.
  Do not restate a commit count here — ask git:
  `git log --oneline origin/main..main | wc -l` (0 means in step). Two earlier
  drafts of this line carried a hand-written count and both were wrong within one
  commit.
- **Branch:** `main`
- **Engine version:** **v79** (multi-screen rooms keep their own entities, #14 Step 2 —
  and with it a fix for entities on rows 239-255 being silently swallowed)
- **Node build/regression suite:** ✅ green, including the golden
  byte-identical-ROM hashes (`node tools/builder-tests/run-all.mjs`,
  **117 suites, exit 0, re-run 2026-08-14 at v79**) — plus 22 invariants and 40
  syntax checks. The 40 are 32 shipped `.js` modules, 7 inline HTML script bodies
  and `playground_server.py`; the 32 match the 32 non-vendored `.js` files on disk
  exactly, and the 7 cover every HTML page carrying a bare `<script>`. Both sets
  are enumerated at runtime rather than hand-listed — the `.js` list used to name
  14 and silently skip 18, and the HTML list named 5 of 8, leaving `audio.html`
  and `gallery.html` unchecked.
- **Studio E2E:** ✅ **165 passed, exit 0** (`npx playwright test`, re-run
  2026-08-15 at v79) across 35 spec files. Was 147 on 2026-07-30 and 158 on
  2026-08-13; the eleven before that are the silent-failure guards from the
  2026-08-09/12 maintenance, and the six since are the whole-level preview
  assertion in `world.spec.js` plus `starter-hook.spec.js`. Still confirms the
  suite survives engine v76-v79, the emulator watchdog and the Style-tab toggle.
  - **The suite is now mutation-tested as a body**, which it never had been:
    `tools/studio-tests/mutations-e2e.json`, 3 breaks in 3 different spec files,
    all 3 caught. Run it with `mutate tools/studio-tests/mutations-e2e.json`.
    Note it deliberately runs with a longer timeout than the committed config —
    a test that reddens because the box was busy is indistinguishable from one
    that reddened because the break was caught, so a slow test manufactures false
    "caught" verdicts. Measured at load 19 the two `tutorial.spec.js` long tests
    do exactly that.
  - Per-spec counts are deliberately *not* listed. They were, earlier the same
    day, and were stale within hours of being written — one more test in one spec
    and three numbers were wrong at once. The total is a dated measurement, not a
    live claim; re-run to refresh it, and `grep -c '^test(' <spec>` for a
    breakdown that cannot be out of date.
  - Wall-clock is not a constant and is not recorded here: the same 158 tests took
    **7.1 min** at host load ~14.5 and **3.8 min** at load ~1 on the same day. Use
    it to judge the box, never to judge a change.
  - **The committed 30 s per-test limit is adequate to at least host load ~15.**
    Measured, not estimated. The full suite is green at the committed timeout with
    no override at load ~1 *and* at load ~14.5 (both 2026-08-12), and the two tests
    that once blew it — `project-file` NAM round-trip and `budget` CHR — took
    59.1 s and 41.6 s at load ~30 but **2.0 s and 2.5 s** at load ~1.8 (2026-08-08).
    Only one test has exceeded it since: `tutorial › every game style`, 46.6 s at
    load **39** (2026-08-09).
    - **So the rule is about the box, not the suite.** A red test named above,
      *with the load average high*, is an environment result — confirm with
      `--timeout=120000`. A red test on a quiet box is a real failure, and
      reaching for the override there hides a regression.
    - This replaces an earlier blanket warning that the limit "is not enough under
      load", which was true of a loaded box in July and had become a reason to
      distrust a suite that is fine. It is gone rather than annotated: a
      correction printed under the claim it corrects gets read as the claim.
- **Playtest ROMs:** ✅ **re-verified 2026-08-13** — `node scripts/make-playtest-roms.mjs`
  run again at v78 produced output **byte-identical** to the files on disk from
  2026-07-28 (all three sha1s unchanged: `5945fb3d…`, `cc2943e3…`, `c6a71980…`).
  So "the ROMs are current, do not rebuild before playtesting" is measured, not
  inferred. The reasoning behind it still holds too: v77's enemy-bump is off by
  default and v78 only changes dialogue-enabled builds, so neither touches these.
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
- ~~**Dead code found, not removed**: eight unreferenced path constants in
  `playground_server.py`.~~ **Removed 2026-08-13** (`4c108ec`).
  `DEFAULT_MAIN_C`/`DEFAULT_MAIN_S` beside them were live and stayed.

## 2026-08-13 — an accepted work-list, worked to completion

Eleven items, ten done and one deliberately partial. Everything is pushed. The theme
was **proving guards can fail**, and the recurring finding is worth stating once
rather than eleven times:

> Three times, a guard that looked hollow was correct and my *break* was the defect.
> "Nothing caught this" cannot distinguish *the guard is broken* from *the mutation
> was a no-op* — so measure that the break changes the output before believing
> either.

- **Two more coverage lists now enumerate at runtime.** The inline-`<script>` check
  hand-listed 5 of 8 HTML pages, leaving `audio.html` (~22 kB of JS) and
  `gallery.html` (~7.8 kB) never syntax-checked. Both storage/emulator guards also
  enumerate now, and each asserts its own trigger's hit-count — previously a renamed
  trigger would have skipped every page and printed OK.
- **Six gate mutations are executable** rather than prose:
  `tools/builder-tests/mutations/gates.json`, run with `mutate`. 7 caught / 0 not,
  including the snapshot-copy limitation kept as `expect_none_because` so it cannot
  be forgotten. Needed a new suite first — `harness-startserver.mjs` — because
  `startServer`'s pre-flight had no named assertion to turn red.
- **The golden byte-identical-ROM invariants have now been watched failing**
  (`golden-rom.json`), which had never been done. Both took two wrong anchors first:
  `DEADZONE_LEFT` is dead in its translation unit, and one `jmp_up` site is stripped
  by `#if BW_GAME_STYLE == 2 && PLAYER2_ENABLED` — a break landing in exactly the
  code this invariant exists to strip.
- **`preflight` run for the first time**: clean, and proved non-vacuous. Two
  shared-tool caveats recorded in [`LESSONS-LEARNT.md`](LESSONS-LEARNT.md).
- **#14 Step 1 measured** — per-room parking *does* survive a wide (16-bit) build.
  The plan is corrected three ways, including an off-by-one that would have let
  Step 2 admit a row of silently-parked entities. The door-transition half is
  **unproven** and marked so: no suite drives a door in a render test.

## 2026-08-09/12 unattended maintenance — what changed

No engine change, so **still v78**. All of this is now on `origin/main`.

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
A second theme emerged the same week and is worth separating, because it is a
different failure: **gates that report success for work they did not do.** The
first theme lies about *why* something broke; this one denies anything ran at all.

- **`snapshot-engine.mjs --check` could not see a deleted engine file.** The gate
  the whole versioning ritual rests on compared in one direction only: it walked
  the live engine files and looked each up in the frozen manifest, so it caught
  changes and additions but never a **deletion or rename** — that file is not in
  the live enumeration, so the loop never visited it. Moving
  `src/asm_macros.inc` aside still gave `✓ v78 snapshot matches HEAD (30 files)`
  and exit 0. The count made it worse: it came from `manifest.json`'s own claim,
  so it read identically whether 30 files were compared or none were. Now checked
  both ways, and the success line reports what was actually compared.
- **`run-all.mjs` would report "all checks pass" for zero suites.** If the suite
  enumeration came back empty the loop ran zero times, `anyFail` stayed false, and
  the runner printed ✅ having executed none of the 114 — golden ROM hashes
  included. Guarded; the mirror of a guard that already existed 60 lines above it
  for the syntax enumeration.
- **`BUILDER_GUIDE.md`'s coverage note is now a check.** It said "if that count has
  moved, this table has gone stale, which is exactly the failure this note exists
  to make visible" — and nothing made it visible. `run-all.mjs` now verifies the
  guide's module accounting against `builder-modules.js` both ways.
- **The mode-registry spec was one-directional too**, and was fixed by applying the
  snapshot lesson to it the same day: a module registered but dropped from `MODES`
  is unreachable dead weight, and only a rail-driven loop could not see it.

The generalisation, now in [`LESSONS-LEARNT.md`](LESSONS-LEARNT.md) §1: **watching a
gate fail proves it can fail, not that it covers the ground you think.** The
snapshot gate *had* been watched failing — at the one thing it checked.

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
- **10 modules' worth of pupil help is invisible in the Studio.** Found 2026-08-13.
  `detailedHelp` is an array of explanatory lines carried by 10 of the 18 Builder
  modules — `dialogue` alone has 18 of them — and it is rendered **only** by
  `builder.html`, one of the legacy pages that CLAUDE.md marks critical-fix-only.
  The Studio's RULES card renders `def.description` (one sentence) and nothing else,
  so a pupil on the primary front-end never sees any of it.
  - Not a defect I should fix unasked: whether RULES grows a help disclosure, and
    what it looks like, is a design decision of the same kind as the three questions
    already raised. Raising it rather than guessing.
  - Worth knowing either way, because the text exists and somebody wrote it.
- **Per-NPC dialogue text: the engine half is done, the UI half does not exist.**
  Found 2026-08-12 and left alone, because exposing it is a product call.
  A scene instance may carry its own `text`; `builder-modules.js` collects those
  into `npcOverrides`, emits `BW_DIALOG_PER_NPC 1`, and the vblank loop consults
  the override. It is covered by two suites — `round2-dialogue.mjs` (B7a, both
  directions: 0 when no NPC has its own text, 1 when one does) and
  `all-modules.mjs`. **But no Studio mode writes `instance.text`** — the WORLD
  instance editor offers Speed, X and Y only — so a pupil cannot author it, and it
  is reachable only by importing a project file that already has it.
  - The dialogue module's own help still says "All NPC-tagged sprites share the
    same dialog text in this MVP; per-NPC text is a future upgrade." That reads
    like stale copy and is **not** — it is true of what a pupil can do, which is
    what that audience needs. Do not "correct" it to say the feature works until
    there is a way for them to use it.
  - **The question for the owner:** add a text field to the WORLD instance editor
    (small, and the engine is waiting for it), or leave the capability parked?

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
