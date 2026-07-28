# Handoff: v77 shipped, two human-gated items remain — 2026-07-28

**Goal:** clear the last two items that a session cannot do alone — the attended playtests
(#7/#27, #15) and the v77 redeploy — then pick new work from `docs/STATUS.md`.
**Done looks like:** both playtests judged and their items closed, and the live host serving
engine **v77** with the Python server restarted.

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
  Clean at `db725c2`. **`git fetch` it before editing** — see *Ruled out*.
- Docs commit **direct to `main`**, no branch/PR.

## Established (fact ← evidence)
- Everything pushed, tree clean ← `git log --oneline -1` and `… -1 origin/main` both
  `11f8d41`; `git status --porcelain | wc -l` → `0`.
- Engine is **v77**, both constants agree ← `cat tools/engines/ENGINE_VERSION` → `77`;
  `grep NES_ENGINE_VERSION tools/tile_editor_web/engine-version.js` → `= 77`.
- Node suite green incl. golden byte-identical ROMs and the v77 snapshot ←
  `node tools/builder-tests/run-all.mjs` → `✅ All Builder regression checks pass.`
- Studio E2E **141 passed** (2.9 min) ← `npx playwright test`, plain, no override.
- **v77 = enemy-vs-enemy AABB separation (#30)**, off by default behind the Globals toggle
  "Enemies bump into each other" ← `tools/engines/CHANGELOG.md` v77;
  `node tools/builder-tests/enemy-bump.mjs` → 11 checks pass, both build paths.
- **`4` now also picks colour 0** in all four painters (#39) ← `tools/studio-tests/palette-keys.spec.js`
  → 5 passed. Studio TILES/CHARS had *no* digit shortcut before; they gained the whole 0–4 set.
- The container rebuild is done and verified ← image built 21:26, `npx playwright test` green
  on its own baked Chromium with no config override.

## Ruled out (approach ← the observation that killed it)
- **Editing a skill after only grepping the local checkout** ← `/root/.claude/skills` was
  **6 commits stale**, so a grep showed a bug that upstream had already fixed (`fc03685`). A
  whole re-implementation was written and then discarded when `git push` was rejected.
  `git fetch origin` first, always.
- **Running `tools/builder-tests/run-all.mjs` and `npx playwright test` concurrently** ← they share port
  **18790**, and the clash is **silent**: the second playground server sees a healthy sibling,
  prints `already running -- nothing to do`, exits 0, and the suite then runs against a server
  it did not configure — with none of its env overrides (e.g. `PLAYGROUND_NO_ASM=1`). Run them
  one at a time, or `STUDIO_TEST_PORT=18990 npx playwright test`.
- **Push-apart-only separation for #30** (no direction reversal) ← two walkers then grind at
  the contact point forever, 1px per frame — which is the *jitter* #30 itself complains about.
  Confirmed by mutation: suppressing the turn signal gives "met at x 104, ended at x 104".
- **Widening ASM `draw_player`'s cursor to 16-bit** (from the previous handoff, still true) ←
  it changes ROM bytes for every scroll build; `tools/playground_server.py` routes around it instead.
- **Repairing the global `claude` bin inside a running container** ← the egress allowlist
  blocks the native-binary refetch, leaving `claude native binary not installed`, which is
  worse than the half-linked state. Build time only.

## Open questions
- **#7/#27 — are the four event sounds audible and right?** — discriminating test: play
  `playtest-roms/01-sfx-events.nes` somewhere with speakers and tick
  `docs/guides/PLAYTEST-CHECKLIST.md`. **Not in this container** — it has fceux but no display
  and no audio device.
- **#15 — which stomp tuning feels best?** — test: A/B the three ROMs; name a winner.
- **Do the playtest ROMs need regenerating for v77?** They are v76-era (built before the v77
  work). v77 is off by default so they *should* be byte-identical — discriminating test:
  `md5sum playtest-roms/*.nes > /tmp/before && node scripts/make-playtest-roms.mjs && md5sum -c /tmp/before`.
  Regenerate regardless before judging; it costs a minute.
- **Is the live host on v77 yet?** The deploy is host-side, outside this container — test: hit
  the live server's `/health` and compare its engine version against `77`.
- **Should WORLD mode also get digit shortcuts for its background-palette picker?** It has a
  0–3 palette concept but has never had a key binding, so #39 deliberately left it alone.

## Next actions (in order)
1. **Regenerate the playtest ROMs and check the drift:**
   `cd /workspace && md5sum playtest-roms/*.nes > /tmp/roms.before && node scripts/make-playtest-roms.mjs && md5sum -c /tmp/roms.before`
2. Copy `playtest-roms/*.nes` to a machine with speakers; run both playtests against
   `docs/guides/PLAYTEST-CHECKLIST.md`. Report per item: `#7/#27: …` and `#15: variant <x>`.
3. Closing **#15** changes a shipped default → **full engine ritual**: bump
   `tools/engines/ENGINE_VERSION` *and* `tools/tile_editor_web/engine-version.js`, add a
   `tools/engines/CHANGELOG.md` entry, commit, then `node scripts/snapshot-engine.mjs`
   (it reads from **git HEAD**, so commit first), then refresh `docs/STATUS.md`.
4. Redeploy `main` to the live host and restart the Python server (host-side).
5. Only then pick new work — read `docs/STATUS.md` first; it groups the ~8 remaining feedback
   items by *blocker*, which is the useful axis.

## Provenance
[decided] The user chose #30 from a four-way menu, then asked for: the skill Dockerfile port,
the test harness checked in, the ports doc, and the `4`-picks-0 change with `0→0, 1→1, 2→2,
3→3, 4→0`.
[decided] Docs commit direct to `main`, no branch/PR.
[decided] The playtests and the redeploy stay with the user — they asked to keep being
reminded, not for a session to attempt them.
[proposed] Action 5, and the WORLD-mode question — suggested, **not** agreed.
[proposed] User-*configurable* palette shortcuts, which is what the #39 reporter literally
asked for. A fixed `4` alias shipped instead; the full request is recorded at item #39.
[assumed] The playtest ROMs are unaffected by v77 (feature is off by default) — unverified,
hence action 1.
[assumed] The live host is still at **v75** — user-confirmed at v75 and not re-checked since.

**To the receiving session:** investigate and execute yourself — do not hand the user a list
to relay back. Spot-check *Established* cheaply, treat *Ruled out* as settled unless your own
evidence contradicts it, and confirm *[proposed]* before building on it.
