# Test servers and ports

Every test in this repo that needs a real ROM talks to a **Playground Server**
(`tools/playground_server.py`) — the same server a pupil uses, because that is what
runs cc65. There are three separate contexts in which one gets started, on three
different ports, and they are easy to confuse.

This file is the answer to "which port is which, and how do I start it".

## The three servers

| Context | Port | What it serves | How to start it |
| ------- | ---- | -------------- | --------------- |
| **Dev / manual** | **8765** | The Studio at `/studio.html`, the seven legacy pages, and `/play` (builds a ROM with cc65). What you open in a browser to use the thing. | `python3 tools/playground_server.py` |
| **Studio E2E** | **18790** | The same server, booted and killed **automatically** by Playwright with an isolated accounts DB. You do not start this yourself. | `npx playwright test` (from the repo root) |
| **Builder tests** | **18768–18894** | One throwaway server per suite, spawned and killed by that suite. Each `.mjs` picks its own port. | `node tools/builder-tests/run-all.mjs`, or one suite: `node tools/builder-tests/enemy-bump.mjs` |

The runner (`run-all.mjs`) executes suites **one at a time** (`spawnSync` in a
loop), so several suites sharing a port is deliberate and harmless — about a dozen
pairs do. Only concurrent runs collide.

## ⚠️ 18790 is claimed twice

Playwright's `webServer` binds **18790** (`playwright.config.js`), and so do three
builder-test suites — `asm-corpus.mjs`, `asm-realproj.mjs` (`PORT_C`) and
`asm-player.mjs` (`PORT_D`).

Each command is internally sequential, so this never bites a single run. It bites
when you run **both suites at once**, and it does so **silently** — which is why it
is worth knowing about.

A playground server that finds the port already held by *another playground server*
does not fail. It prints `already running -- nothing to do` and exits 0. The suite's
harness (`startServer`) does not check that its own process survived, so the suite
then runs happily against **the E2E server it did not configure** — different
accounts DB, and, more dangerously, **none of the env overrides it asked for**. A
suite that sets `PLAYGROUND_NO_ASM=1` to exercise the pure-C engine would silently
test the ASM one instead, and still pass.

(The hard error — `Port N is in use by something else (not a playground server)` —
only appears when something that is *not* a playground server holds the port.)

If you want them in parallel, move the E2E out of the way rather than editing the
suites:

```bash
STUDIO_TEST_PORT=18990 npx playwright test
```

(`tools/builder-tests/README.md` describes the asm suites as using "18790–18795",
which is where this overlap came from.)

## Adding a suite: picking a port

Take the next free port **above 18894** (the current highest) and stay under 19000.
Do not trust a grep for `PORT =` — the suites spell it several ways
(`PORT`, `PORT_C`/`PORT_A`/`PORT_D`, an inline `startServer(18882)` in
`physics-globals.mjs`, and `PORT + 1` in `enemy-bump.mjs`). This catches all of them:

```bash
grep -rhoE '\b18[0-9]{3}\b' tools/builder-tests/*.mjs playwright.config.js | sort -n | uniq
```

If your suite needs **two** servers (e.g. to compare the ASM and pure-C engines),
claim both numbers explicitly in a comment — `enemy-bump.mjs` uses `PORT` and
`PORT + 1`, so 18854 is taken without ever appearing as a literal.

## Env vars worth knowing

Read by `tools/playground_server.py`; the test harness sets several for you.

| Var | Effect |
| --- | ------ |
| `PLAYGROUND_PORT` | Port to bind (default `8765`). |
| `PLAYGROUND_HOST` | Interface to bind (default `127.0.0.1`). |
| `PLAYGROUND_ACCOUNTS_DB` | Path to the accounts DB. **Tests set this to a throwaway file** so they never touch `tools/accounts.db`. |
| `PLAYGROUND_SKIP_DOTENV` | Skip `.env` loading, so a developer's local config cannot change a test result. |
| `PLAYGROUND_NO_ASM` | Kill switch: build the pure-C engine instead of the hand-written 6502 paths. Useful for A/B-ing a behaviour across both. |
| `PLAYGROUND_NO_PDRAW` | Disable the ASM player draw specifically. |
| `STUDIO_TEST_PORT` | Read by `playwright.config.js`, not the server — moves the E2E port. |

## Health check

Every server answers `GET /health`. That is how Playwright waits for boot, and how
the server decides whether a port is held by *another playground server* (it will
reuse/report) or by something unrelated (it exits with the message above).

```bash
curl -fsS http://127.0.0.1:8765/health && echo OK
```

## Not in the dev container

The dev container has `fceux` but **no display and no audio device**, so nothing
here plays a ROM with sound. That is why the two attended playtests in
[`PLAYTEST-CHECKLIST.md`](PLAYTEST-CHECKLIST.md) have to happen on a real machine.
