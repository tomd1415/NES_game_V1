# What is actually current in here

**Read this before treating anything in this directory as pending work.**

`docs/plans/` has a `current/` and an `archive/`, and the convention is that finished
plans move across. **Archiving stopped in late April 2026** — the newest file in
`archive/` is dated `2026-04-26`, and everything written since has stayed here
whether it shipped or not. So `current/` currently holds 21 plans, most of which
describe work that is done.

*Snapshot taken 2026-08-14 — a dated observation, not a live index. Re-check before
relying on it; the point of this file is to stop the directory name being read as a
claim, not to become a second thing that rots.*

## Plans whose headline artifact ships today

Verified by checking the artifact exists, not by re-reading each plan's steps — so
treat these as "believed complete", and confirm before assuming a specific step
inside one was done.

| Plan | Evidence it shipped |
| ---- | ------------------- |
| `2026-06-18-arc-a-render-test-harness.md` | `tools/builder-tests/lib/render-harness.mjs` |
| `2026-06-21-pupil-accounts.md` | `tools/builder-tests/accounts.mjs`, `account-ui.mjs` |
| `2026-06-21-topdown-racer.md` | `topdown.mjs`, `racer.mjs` suites; both game types in STYLE |
| `2026-07-05-first-tutorial-mvp.md` | `studio-tutorial.js`, `tutorial.spec.js` (9 tests) |
| `2026-06-18-arc-e-metatiles-and-game-styles.md` | `tools/tile_editor_web/metatiles.js` |
| `2026-07-06-asm-engine-generator.md` | `steps/Step_Playground/src/ai_asm.s`, the `asm-*` suites |
| `2026-07-05-studio-redesign.md` | `studio.js` + eight mode modules; the Studio is the primary front-end |

## Genuinely not done

- **`2026-08-06-item-14-multiscreen-rooms.md`** — the live one. Step 1 measured
  2026-08-13 (per-room parking survives a wide build); Steps 2–5 not started. Also
  carries the ride-along list for two stale comments stranded in frozen engine files.
- **`2026-06-22-wasm-emulator-spike.md`** — self-declares *"exploratory / not
  scheduled. Decision-gated — do not build"*. Correctly here.

## The rest

Not audited. Several are batch/roadmap documents (`next-phase-master-plan`,
`arc-c-tier2-backlog`, `next-improvements`) that are partly done by nature, and
splitting those is a judgement call rather than a filing one — which is why nothing
has been moved. Moving files is the owner's call; this note only stops the directory
name from misleading someone in the meantime.
