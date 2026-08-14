# Handoff: v79 shipped, the same two human-gated items remain — 2026-08-14

> **Updated 2026-08-14: the engine is now v79, not v78.** The redeploy target below
> moved with it — the live host should end up on **v79**, not v78. Everything else in
> this file still stands; the two human-gated items are unchanged and neither was
> affected by v79. The "Established" section below is a record of what was true on
> 2026-07-28 and is deliberately left as it was, except where it states the engine
> version, which would otherwise send someone to redeploy the wrong build.

**Goal:** clear the two items a session cannot do alone — the attended playtests
(#7/#27, #15) and the live-host redeploy — then pick new work from `docs/STATUS.md`.
**Done looks like:** both playtests judged and their items closed, and the live host
serving engine **v79** with the Python server restarted.

## Environment
- Repo `/workspace`, branch `main`, **inside a dev container** (`/.dockerenv`, built
  2026-07-27 21:27). Debian 12 bookworm, Linux 6.12. Node v20.20.2, Python 3.11.2.
- Server: `python3 tools/playground_server.py` → `http://127.0.0.1:8765/studio.html`.
- **Ports** (this bites — see *Ruled out*): dev `8765`, Studio E2E `18790`, builder-tests
  `18768–18894`. Full table: `docs/guides/TEST-SERVERS.md`.
- Playwright **1.61.1**, Chromium **baked into the image** at `/root/.cache/ms-playwright/`
  (`chromium-1228`, `chromium_headless_shell-1228`). Run `npx playwright test` plainly — the
  old system-Chromium `--config` workaround is retired and must not be reused.
- Git remote `origin` = `gh-NES_game_V1:tomd1415/NES_game_V1.git`, pushed over a forwarded
  ssh-agent (`SSH_AUTH_SOCK=/ssh-agent/socket`); no private key is inside the container.
- Skills repo is a **separate** repo at `/root/.claude/skills` (remote `gh-claude-skills:…`).
  **`git fetch` it before editing** — see *Ruled out*.
- Docs commit **direct to `main`**, no branch/PR.
- The full builder suite takes **~25–30 min**; the Studio E2E ~3 min. Budget for that.

## Established (fact ← evidence)
- Engine is **v79** (was v78 when this file was written), both constants agree,
  snapshot frozen ← `cat tools/engines/ENGINE_VERSION` → `79`; `grep NES_ENGINE_VERSION
  tools/tile_editor_web/engine-version.js` → `= 79`; `node scripts/snapshot-engine.mjs
  --check` → `✓ v79 snapshot matches HEAD (30 compared, 30 in the snapshot).`
- Node suite green at v78 incl. golden byte-identical ROMs ←
  `node tools/builder-tests/run-all.mjs` → `✅ All Builder regression checks pass.`
- Studio E2E **141 passed** (3.0 min) ← `npx playwright test`, plain, no override.
- **v78 = the dialogue box no longer flashes the screen (#31)** — the banner is written
  one 32-byte row per frame (prepared in `per_frame`, blitted unrolled in vblank) instead
  of one force-blanked burst ← `tools/engines/CHANGELOG.md` v78;
  `node tools/builder-tests/render-dialogue-noflash.mjs` → 7 checks pass.
  Measured: on v77 the frame the box opens drops a 40-scanline band from **7680 lit
  pixels to 0**; on v78 it holds 7680 through the whole open *and* close.
- The `_rom-equiv` everything-on pin moved `972cb215…` → `e86a91b8…` **deliberately**, and
  the dialogue writer is the sole cause ← rebuilding with `git show
  fac8ac2:tools/tile_editor_web/builder-modules.js` (the pre-v78 commit) and nothing else
  reverted reproduces `972cb215…` exactly. The no-modules goldens are unchanged, so a project without dialogue
  still builds byte-for-byte.
- **The playtest ROMs are unaffected by v77 and v78** (this was the previous handoff's
  open `[assumed]`) ← `md5sum playtest-roms/*.nes` before/after
  `node scripts/make-playtest-roms.mjs`, run at v77 and again at v78: all three `OK`.
  So the ROMs sitting in `playtest-roms/` are the right ones to judge; no rebuild needed.
- **#24 (accounts + gallery remove-gating) is DONE** — the previous "not evidenced" note
  was stale ← server denies by default (`_gallery_remove_response`: teacher secret, else
  signed-in **and** owner), `/gallery/list` exposes `owned` not the raw id, `gallery.html`
  only renders 🗑 Remove for owned/teacher, and `gallery-auth.mjs` covers all six cases.
  Written up in `docs/STATUS.md` and at item 24.

## Ruled out (approach ← the observation that killed it)
- **Waiting for a human to eyeball the #31 flash** (what the codegen plan assumed) ←
  jsnes *does* model it: with rendering off the burst runs past vblank, so the top
  scanlines paint flat backdrop and the framebuffer shows it. A framebuffer probe over a
  40-scanline band gives a 7680-vs-0 signal, which is not marginal. Sprint 4's "-Os
  changes timing, needs Mesen" caveat does not transfer — this *bounds* vblank work.
- **Editing a skill after only grepping the local checkout** ← `/root/.claude/skills` was
  **6 commits stale**, so a grep showed a bug upstream had already fixed (`fc03685`).
  `git fetch origin` first, always.
- **Running `tools/builder-tests/run-all.mjs` and `npx playwright test` concurrently** ←
  they share port **18790** and the clash is **silent**: the second playground server sees
  a healthy sibling, prints `already running -- nothing to do`, exits 0, and the suite runs
  against a server it did not configure. Run them one at a time, or
  `STUDIO_TEST_PORT=18990 npx playwright test`.
- **Piping a long suite through `tail -N`** ← you lose the failure detail and only see the
  summary line. Redirect the whole run to a file and grep it.
- **Push-apart-only separation for #30** (no direction reversal) ← two walkers grind at the
  contact point forever, 1px per frame — the *jitter* #30 complains about.
- **Widening ASM `draw_player`'s cursor to 16-bit** ← it changes ROM bytes for every scroll
  build; `tools/playground_server.py` routes around it instead.
- **Repairing the global `claude` bin inside a running container** ← the egress allowlist
  blocks the native-binary refetch. Build time only.

## Open questions
- **#7/#27 — are the four event sounds audible and right?** — discriminating test: play
  `playtest-roms/01-sfx-events.nes` somewhere with speakers and tick
  `docs/guides/PLAYTEST-CHECKLIST.md`. **Not in this container** — it has fceux but no
  display and no audio device. The ROM is current; do **not** rebuild it first.
- **#15 — which stomp tuning feels best?** — test: A/B the three ROMs; name a winner.
  (`01-sfx-events.nes` *is* the baseline `MARGIN 8 / BOUNCE 12` build — same defaults, so
  it is not written twice.)
- **Is the live host on v78 yet?** Almost certainly not — it was user-confirmed at **v75**
  and is now three versions behind. Test: hit the live server's `/health` and compare its
  engine version against `78`. Host-side, outside this container.
- **Should WORLD mode also get digit shortcuts for its background-palette picker?** It has
  a 0–3 palette concept but has never had a key binding, so #39 deliberately left it alone.
  Still unasked.

## Next actions (in order)
1. Copy `playtest-roms/*.nes` to a machine with speakers; run both playtests against
   `docs/guides/PLAYTEST-CHECKLIST.md`. Report per item: `#7/#27: …` and `#15: variant <x>`.
   The ROMs are verified current — skip regenerating them.
2. Closing **#15** changes a shipped default → **full engine ritual** (v79): bump
   `tools/engines/ENGINE_VERSION` *and* `tools/tile_editor_web/engine-version.js`, add a
   `tools/engines/CHANGELOG.md` entry, commit, then `node scripts/snapshot-engine.mjs`
   (it reads from **git HEAD**, so commit first), then refresh `docs/STATUS.md`.
   Expect `_rom-equiv.mjs`'s everything-on pin to move — re-pin it deliberately with a
   note, the way v78 did, after proving your change is the only cause.
3. Redeploy `main` to the live host and restart the Python server (host-side).
4. Only then pick new work — read `docs/STATUS.md` first; it groups the remaining ~6
   feedback items by *blocker*, which is the useful axis. With #31 and #24 closed, the
   unblocked engineering candidates are the "remaining slice" table (#6, #10, #13, #14,
   #26, #38) — everything else is waiting on a pupil repro or on a human.

## Provenance
[decided] The playtests and the redeploy stay with the user — they asked to keep being
reminded, not for a session to attempt them.
[decided] Docs commit direct to `main`, no branch/PR.
[decided, this session] #31 was picked as the next work item without asking, because it was
the only remaining *defect* (rather than feature expansion) that was unblocked and
verifiable in-container. If that was the wrong call the work stands on its own — it closes
a reported bug — but the next pick is worth confirming.
[proposed] Action 4, and the WORLD-mode question — suggested, **not** agreed.
[proposed] User-*configurable* palette shortcuts, which is what the #39 reporter literally
asked for. A fixed `4` alias shipped instead; the full request is recorded at item #39.
[assumed] Nothing outstanding — the previous handoff's two `[assumed]` items are now
settled: the playtest ROMs are verified unaffected, and the live host is still believed to
be at v75 but that is now written as an open question with a test, not an assumption.

**To the receiving session:** investigate and execute yourself — do not hand the user a list
to relay back. Spot-check *Established* cheaply, treat *Ruled out* as settled unless your own
evidence contradicts it, and confirm *[proposed]* before building on it.
