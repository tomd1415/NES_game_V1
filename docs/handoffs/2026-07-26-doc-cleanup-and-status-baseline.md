# Handoff: doc-cleanup + STATUS baseline — 2026-07-26

> ✅ **CONSUMED — this handoff has been acted on. Do not pick work from it.**
> The receiving session answered its one open thread: the user chose *all* the
> candidates, in order. Shipped the same day — the emulator watchdog and engine
> **v76** (both feedback #37), the Studio-first README rewrite, and the attended
> playtests prepped (`scripts/make-playtest-roms.mjs` +
> [`guides/PLAYTEST-CHECKLIST.md`](../guides/PLAYTEST-CHECKLIST.md)).
> `main` is deployed and up to date was confirmed, closing that question for #10.
>
> Kept as a record of *how the session was handed over*, not as a live to-do.
> **For current state read [`docs/STATUS.md`](../STATUS.md).**

**Goal:** land a durable "where we are now" baseline and sweep stale doc references, no
ROM/engine risk. **Done looks like:** STATUS.md exists and is wired into session-start reads;
no stale `v72`/legacy-primary references in the touched docs; all committed to `main`.
— **This is essentially complete.** The open thread is only *what to pick up next* (see below).

## Environment
- Repo: `/workspace` (git, branch `main`). Linux 6.12 / Debian 13.
- NES game-maker: browser editor `tools/tile_editor_web/` + Python stdlib build server
  `tools/playground_server.py` (runs cc65). Run: `python3 tools/playground_server.py`
  → serves `http://127.0.0.1:8765/studio.html`. Env: `PLAYGROUND_HOST`, `PLAYGROUND_PORT`.
- Docs commit **direct to `main`** — no branch, no PR (user decision, see Provenance).

## Established (fact ← evidence)
- Engine is **v75**, both constants agree ← `cat tools/engines/ENGINE_VERSION` → `75`;
  `tools/tile_editor_web/engine-version.js:17` → `global.NES_ENGINE_VERSION = 75;`.
- Working tree clean except untracked `.devcontainer/` ← `git status --short` → `?? .devcontainer/`.
- Session's work is committed ← `git log --oneline` → `0957acf`, `bd58b18`, `c409ce0`,
  `0d167e0` (all this session), on top of v75 (`d696bcf`).
- STATUS baseline is wired into session start ← `CLAUDE.md` "Where to start" now leads with
  `docs/STATUS.md`; also linked from `docs/README.md` ("Where things live" + two bullets).
- Studio (`studio.html`) is the **primary** front-end; the seven legacy pages are served but
  critical-fix-only ← `docs/README.md` "Current editor status".

## Ruled out (approach ← the observation that killed it)
- **Editing the top-level `README.md` "Opening the visual editor" section piecemeal** ←
  lines ~100–115 describe the *legacy* multi-page editor in detail; a one-line patch leaves it
  internally inconsistent. Needs a proper Studio-first rewrite, not a quick win.
- **Running the full `node tools/builder-tests/run-all.mjs` as a quick verify** ← it builds
  ROMs and takes >2 min; timed out at 120 s. It was GREEN earlier this session. Don't gate a
  doc-only change on it; run it (with a long timeout) only when engine output could change.
- **`pgrep -f playground_server.py` to check the server is down** ← matches its own command
  line (false positive). Use `ps -eo args | grep "[p]layground_server.py"` or a curl port check.
- **Backgrounding the server inside a compound Bash command to capture its banner** ← races,
  empty log, exit 144. Start it as its own background command, then read/kill in separate steps.

## Open questions
- **What to pick up next?** — user was asked and has not chosen. Candidates:
  (a) top-level README Studio-first rewrite; (b) feedback item **#37** defensive hardening
  (guard player/P2 OAM loops, add a jsnes watchdog) — *real engine-adjacent code*, would need
  its own scoped task + possible version bump/snapshot, **not** a quick win.
- **Is `main` actually deployed anywhere?** (bears on feedback #10) — no known discriminating
  test in-repo; ask the user.
- **Should `.devcontainer/` be committed or gitignored?** — user's call; left untracked.

## Next actions (in order)
1. **Ask the user which thread to start** (README rewrite / #37 hardening / something else) —
   do not start unprompted; the "few quick wins" batch that prompted this is done.
2. If open items are needed, read `docs/STATUS.md` first — it groups the ~10 remaining of 38
   feedback items by blocker (attended-playtest / needs-repro / parked / verified-correct).
3. For any change that can alter a ROM byte or the project↔ROM contract: follow the engine-
   versioning ritual (bump both constants, `CHANGELOG.md` entry,
   `node scripts/snapshot-engine.mjs`) — see `CLAUDE.md` and `docs/design/engine-versioning.md`.

## Provenance
[decided] Docs commit direct to `main`, no branch/PR (user: "main is fine, don't branch for
docs") — scoped to docs; still ask before code/engine changes touching ROM output.
[decided] STATUS.md is deliberately **not** date-stamped, so it doesn't go stale like
`2026-07-06-next-improvements.md`.
[proposed] README rewrite and #37 hardening as next threads — suggested, **not** agreed.
[assumed] Tests still green (last confirmed earlier this session; full suite not re-run here).

**To the receiving session:** spot-check the *Established* lines cheaply, treat *Ruled out* as
settled unless your own evidence contradicts it, and confirm the *[proposed]* next thread with
the user before building on it. Then execute — don't hand the user a list to relay back.
