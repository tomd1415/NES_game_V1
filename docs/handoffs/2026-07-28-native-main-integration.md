# Handoff: integrate main into native branch + server bind fix — 2026-07-28
**Goal:** land `main` (engine v75) into `chore/linux-native-bootstrap-v63` with all engine
features working, verified by the golden-ROM builder suite. **Done looks like:** `node
tools/builder-tests/run-all.mjs` green (bar env-only `audio.mjs`), engine re-snapshotted, and
a decision made on the native Qt suite (can't run here). **Do NOT merge to main; do NOT
rewrite history** (both standing user constraints, [decided]).

## Environment
- Container `nesnative`, `/workspace` bind-mounted from host `/home/proj_nesnative/NES_game_V1`
  (`findmnt -no SOURCE /workspace` → `/dev/sda[/home/proj_nesnative/NES_game_V1]`).
- Toolchain present: `node` v20.20.2, `cc65/ca65/ld65` V2.18. **Absent:** pip, network,
  PySide6, pytest, fastapi, `node_modules`.
- Scratch (may not persist): `/tmp/claude-0/-workspace/4eac7425-.../scratchpad/` — has
  `main-server-additions.diff`, `builder-*.log`. Regenerate the diff with the command below.

## Established (fact ← evidence)
- HEAD is a WIP merge, unpushed ← `git log -1 --format=%h%s` → `26a1917 Merge main… (WIP…)`;
  `git rev-list --count origin/chore/linux-native-bootstrap-v63..HEAD` → `52`.
- main is fully merged ← `git merge-base --is-ancestor main HEAD` → yes; `git rev-list --count HEAD..main` → `0`.
- Merge is a real 2-parent commit ← parents `6fb70ac` (pre-merge tip) + `09df502` (main).
- Only conflict was `tools/playground_server.py`, resolved to the branch's delegation layer
  (`git checkout --ours`); it imports OK. Engine versions agree ← `ENGINE_VERSION`=75,
  `engine-version.js`=75.
- Post-merge builder suite is broadly RED from ONE root cause: missing physics `.define`s ←
  `node tools/builder-tests/all-modules.mjs` → `player_asm.s: Symbol 'JUMP_BUDGET'/'JUMP_SPEED'/'PLAYER_GRAVITY' is undefined`.
- Uncommitted: `CONTRIBUTING.md` (server-bind doc note) ← `git status --short` → ` M CONTRIBUTING.md`.
- Server bind fix live + durable-on-rebuild ← `curl http://172.17.0.2:8765/health` → 200;
  `.devcontainer/devcontainer.json` containerEnv has `"PLAYGROUND_HOST": "0.0.0.0"` (+comment).

## Ruled out (approach ← the observation that killed it)
- "Port is 6 self-contained helpers" ← features thread through the branch's REFACTORED core
  contracts: `CBuildInputs` (build.py) needs new `bw_sfx_events`/`hud_nmi` fields; the
  ASM-dispatch (`nes_asm_scene`/`nes_asm_ai`) needs `not _scene_is_perroom(...)` gating —
  architecture surgery across 6 of 9 core modules, not additive.
- "Verify hunk-by-hunk against the suite" ← physics/compression `.define`s are foundational,
  so the whole suite stays red until several features are correct *together* (cascade).
- Native Qt/pytest/E2E verification in THIS container ← no PySide6/pytest/node_modules/pip
  (import fails). Only `python3 -m unittest` on Qt-free `core/` + `node` builder suite run here.
- `audio.mjs` failure is NOT a branch regression ← it fails on a clean `main` worktree too
  (109/110), same suite; audio codegen is byte-identical branch↔main. Environmental.
- Server bound `127.0.0.1` ← host publish forwards to bridge IP 172.17.0.2:8765, refused;
  fix is bind `0.0.0.0`. Running container's baked env lacks it (`/proc/1/environ` has
  `DEV_PORTS` not `PLAYGROUND_HOST`) → only a REBUILD activates the containerEnv fix.

## Open questions
- Continue the codegen port here, hand to the branch author, or reset? — user's call; I flagged
  it materially larger and STOPPED (see Provenance). No port code written yet.
- Does committing the WIP merge belong on this branch, or reset first? — `git reset --hard 6fb70ac`
  restores the exact pre-merge tip (still on origin) and discards the merge + uncommitted files.

## Next actions (in order)
1. **Get the user's decision on the merge/port** (it's [proposed], below) before writing port code.
2. If continuing the port: regenerate the reference diff —
   `git diff $(git merge-base 6fb70ac 09df502)..09df502 -- tools/playground_server.py` — then do
   the **physics+compression bundle first** (`_player_physics`→`tools/nes_studio_core/project.py`
   emitting `JUMP_BUDGET/JUMP_SPEED/PLAYER_GRAVITY`; `_dedup_columns/_bg_compression/_guard_world_fits`
   →`world.py`; `SCROLL_COMPRESSED` in project.inc/bg_world.h). Verify: `node tools/builder-tests/all-modules.mjs`.
3. Server: to activate durability, recreate the container (devcontainer rebuild), then confirm
   `curl http://172.17.0.2:8765/health` = 200. Decide whether to commit `CONTRIBUTING.md`.

## Provenance
[decided] = user chose it. [proposed] = suggested, not agreed. [assumed] = unverified.
- [decided] Merge main + port features into `nes_studio_core`; no rewrite history; no merge to main; bind server `0.0.0.0` durably via containerEnv.
- [proposed] "Continue the port here vs hand to the branch author vs reset" — I recommended continuing but STOPPED per the user's "stop if materially larger" tripwire; **user has not chosen**.
- [assumed] Physics+compression first will clear the cascade green (logic traced, not yet run).

**To the receiving session:** investigate and execute yourself. The merge/port is paused on a
user decision (Open questions #1) — surface that, don't build port code on the [proposed]
recommendation until confirmed. Spot-check an *Established* line (e.g. the `all-modules` error)
before relying on it.
