# Handoff: #37 hardening, docs audit, Playwright in the container — 2026-07-27

> ✅ **CONSUMED — this handoff has been acted on. Do not pick work from it.**
> The container **was** rebuilt on the host (image built 2026-07-27 21:26), and the
> receiving session confirmed the discriminating test: `npx playwright test` plain,
> no `--config` override, against the image's own baked Chromium →
> **134 passed (3.0 min)**. `node tools/builder-tests/run-all.mjs` green alongside it.
> The rebuild also surfaced and fixed a half-linked global `claude` bin
> (`.devcontainer/Dockerfile`, commit `539d632`) — repaired at build time and now a
> hard build failure if it stays broken.
>
> **Still open, and now tracked in [`docs/STATUS.md`](../STATUS.md) instead:** the two
> attended playtests (#7/#27 event sounds, #15 stomp feel) and the v76 redeploy.
> Both need a human, not a session.
>
> Kept as a record of *how the session was handed over*, not as a live to-do.
> **For current state read [`docs/STATUS.md`](../STATUS.md).**

**Goal:** close feedback **#37** and get Studio E2E running again. **Done looks like:** the
dev container rebuilt on the host and `npx playwright test` green *without* the system-Chromium
override, plus the two attended playtests judged. Everything else listed here is **finished and
pushed**; the two items above are all that remain.

## Environment
- Repo `/workspace`, branch `main`, **inside a dev container** (`/.dockerenv` present).
  Debian 12 bookworm userland, Linux 6.12.
- Server: `python3 tools/playground_server.py` → `http://127.0.0.1:8765/studio.html`.
  Env: `PLAYGROUND_HOST`, `PLAYGROUND_PORT`, `PLAYGROUND_NO_PDRAW`, `PLAYGROUND_NO_ASM`.
- Node 20, Playwright **1.61.1** (`package-lock.json`), system Chromium **150.0.7871.181**
  (`apt-get install chromium`, installed this session into the container's writable layer —
  **it disappears on rebuild**, which is fine, the image supplies the proper one).
- Git remote `origin` = `gh-NES_game_V1:tomd1415/NES_game_V1.git`, pushed over a **forwarded
  ssh-agent** (`SSH_AUTH_SOCK=/ssh-agent/socket`); no private key is inside the container.
- Docs commit **direct to `main`**, no branch/PR.

## Established (fact ← evidence)
- Engine is **v76**, both constants agree ← `cat tools/engines/ENGINE_VERSION` → `76`;
  `grep NES_ENGINE_VERSION tools/tile_editor_web/engine-version.js` → `= 76`.
- Everything is pushed, tree clean ← `git log --oneline -1 origin/main` → `13aa858`;
  `git status --porcelain | wc -l` → `0`.
- Node suite green incl. golden byte-identical ROMs and the v76 snapshot ←
  `node tools/builder-tests/run-all.mjs` → `✅ All Builder regression checks pass.`
- Studio E2E **134 passed** (~3.4 min) ← run against *system* Chromium via a throwaway config
  (see *Ruled out* for why the normal path fails). 129 pre-existing + 5 new.
- **#37 root causes were found by probing `oam_idx` right after the player draw**, not by the
  plan's guesses ← ASM path left `oam_idx` at `0`/`4` instead of `256`/`260` (8-bit `Y` cursor
  wraps); C path reached `260`, i.e. 4 bytes past `oam_buf[255]`. Both now bounded ←
  `node tools/builder-tests/render-p1-oam-cursor.mjs` → all checks pass.
- `cdn.playwright.dev` is blocked, Debian repos are not ← `curl -sS -o /dev/null -w "%{http_code}"
  https://cdn.playwright.dev/` → times out; same against `http://deb.debian.org/debian/` → `200`.
- The container cannot build itself ← `which docker podman nerdctl devcontainer buildah` → all
  absent; `ls /var/run/docker.sock` → no such file.

## Ruled out (approach ← the observation that killed it)
- **Allowlisting `cdn.playwright.dev` in `init-firewall.sh`** ← the script resolves each host's
  A records **once at container start** and pins the IPs in an ipset; that CDN rotates, so the
  entry goes stale mid-session. Baking Chromium at build time (before the firewall applies) is
  the fix that is actually in the Dockerfile.
- **Re-assigning `jsnes.NES.prototype.frame` after `NesEmulator.open()`** (to "heal" a fault
  mid-test) ← jsnes's constructor does `this.frame = this.frame.bind(this)`, so the instance
  snapshots the prototype at construction. The re-patch silently does nothing and the test
  asserts the wrong thing. Use the mode-flag stub in `emulator-crash-banner.spec.js`.
- **Widening ASM `draw_player`'s cursor to 16-bit** (the "obvious" fix for the wrap) ← it would
  change ROM bytes for **every** scroll build, for a case the server can simply route around.
  `playground_server.py` now declines `NES_ASM_PDRAW` when `base + W*H*4 >= 256`. Note the
  boundary is `< 256`, **not** `<= 256`: writes are fine at exactly 256, the closing `sty` is not.
- **Probing OAM at the `while (oam_idx < 256)` park loop** ← that anchor is not reached when
  `BW_SMB_HUD_BG` is on, so it reads uninitialised RAM (jsnes fills RAM with `0xFF` on reset —
  a probe reading `255`/`65535` means *never ran*, not *overflowed*). Anchor after the P1 loop.
- **Running Studio E2E in this container the normal way** ← no browser in the image and the CDN
  is blocked; `npx playwright install` times out.

## Open questions
- **Does the rebuilt image actually work?** The Dockerfile change is **unverified by any build**
  — discriminating test: rebuild on the host, then `cd /workspace && npx playwright test`
  (no `--config` override). Expect 134.
- **#7/#27 — are the event sounds audible and right?** — test: play
  `playtest-roms/01-sfx-events.nes` somewhere with speakers and tick
  [`docs/guides/PLAYTEST-CHECKLIST.md`](../guides/PLAYTEST-CHECKLIST.md).
- **#15 — which stomp tuning feels best?** — test: A/B the three ROMs from
  `node scripts/make-playtest-roms.mjs`; report a winner, or a direction.
- **Is `.devcontainer/` portable?** It expects `$HOME/claude-skills` and
  `/usr/local/share/claude-guidance` on the host — fine here, breaks a fresh clone elsewhere.

## Next actions (in order)
1. **On the HOST** (not in the container): rebuild the dev container — VS Code
   *Dev Containers: Rebuild Container*, or `devcontainer build --workspace-folder <repo>`.
2. Reattach, then `cd /workspace && npx playwright test` — plain, no override. If it dies with
   `Executable doesn't exist at .../chromium_headless_shell-<N>`, the pin drifted:
   `node tools/builder-tests/run-all.mjs` names the version to put in the Dockerfile's
   `ARG PLAYWRIGHT_VERSION` and then rebuild again.
3. Run the two attended playtests (`node scripts/make-playtest-roms.mjs` → three ROMs +
   the checklist). Closing #15 changes a shipped default, so it needs the **full engine ritual**:
   bump `tools/engines/ENGINE_VERSION` *and* `tools/tile_editor_web/engine-version.js`, add a
   `tools/engines/CHANGELOG.md` entry, `node scripts/snapshot-engine.mjs` (it reads from **git
   HEAD**, so commit first), then refresh [`docs/STATUS.md`](../STATUS.md).
4. Redeploy: the live host was confirmed current at **v75**; `main` is now **v76**, so it is
   behind. Needs `main` deployed plus the Python server restarted.
5. Only then pick new work — read [`docs/STATUS.md`](../STATUS.md) first; it groups the ~9
   remaining feedback items by *blocker*, which is the useful axis.

## Provenance
[decided] The user asked for all four threads of the 2026-07-26 handoff, in order, then for
each of: push, commit `.devcontainer/`, enable Playwright, rebuild+run E2E, write the spec.
[decided] Docs commit direct to `main`, no branch/PR.
[decided] `main` is deployed and up to date **as of v75** — user-confirmed; not re-checked since.
[proposed] Action 4 (redeploy for v76) and action 5 — suggested, **not** agreed.
[proposed] Writing a spec for the *slow*-watchdog verdict; only `stalled` and `crash` are
covered in the browser today (`slow` is unit-tested in `emulator-watchdog.mjs`).
[assumed] The rebuilt image will behave like system Chromium 150 did. Playwright 1.61.1 ships
Chromium **149**, so the E2E green is strong evidence, not proof.
[assumed] `.devcontainer/Dockerfile.bak-tools-174621` is a disposable stray; left on disk,
excluded from git via a new `*.bak-*` ignore rule. Deleting it was not my call.

**To the receiving session:** investigate and execute yourself — do not hand the user a list to
relay back. Spot-check *Established* cheaply, treat *Ruled out* as settled unless your own
evidence contradicts it, and confirm *[proposed]* before building on it.
