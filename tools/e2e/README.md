# Browser (Playwright) tests

These tests drive the **real editor pages** in a headless Chromium against a
live `playground_server.py`, covering in-browser DOM behaviour the Node
`tools/builder-tests/` harness can't reach: it syntax-checks the editor JS and
boots compiled ROMs in jsnes, but it never *loads the pages in a browser*, so
DOM-level regressions (a broken Play button, a selection desync, lost project
data on a UI action) sailed past it.  Several of those are only protected by
source-text guards in `run-all.mjs` ("a behavioural test would need a JSDOM
harness which the project doesn't currently have") — this suite is that harness.

## Running

```bash
cd tools/e2e
npm install            # or: npm install --offline   (uses the npm cache)
npm test               # headless
npm run test:headed    # watch it drive the browser
npm run report         # open the last HTML report
```

Playwright starts (and stops) its own `playground_server.py` on port **8799**
(override with `E2E_PORT`), pointed at a throwaway accounts DB, with
`PLAYGROUND_SKIP_DOTENV=1` so a developer's local `.env` never leaks in.
Browsers are expected in the default cache (`~/.cache/ms-playwright`); the suite
pins `@playwright/test@1.59.1`, whose Chromium revision (1217) is already cached
on the dev machine.

## What each spec covers

| Spec | Guards |
| --- | --- |
| `smoke.spec.js` | Every one of the 7 editor pages loads in a real browser with **no uncaught JS errors** and its primary chrome present, and boots a valid project into storage.  Catches a missing/renamed `<script>` or a broken shared module that per-file syntax checks miss. |
| `code-play.spec.js` | The Code page's "▶ Play in NES" builds + boots end-to-end (assemble → `/play` → cc65 → jsnes), a regression for the `ReferenceError: src is not defined` that silently broke the whole button. |
| `animation-delete.spec.js` | Deleting the animation selected in the list deletes **that** one — regression for the months-open "deleting the 2nd animation removes the 1st" (recently-observed-bugs item 32). |
| `background-duplicate.spec.js` | Duplicating a background preserves its behaviour grid and 16×16 metatile data (no silent data loss / downgrade). |
| `sprite-duplicate.spec.js` | Duplicating a sprite clones its tiles into fresh slots (item 18) — the behavioural test `run-all.mjs` only source-text-guards. |
| `undo-redo.spec.js` | Undo/redo round-trips a document change on the Backgrounds page (browser-only undo stack). |
| `background-delete-door-remap.spec.js` | Deleting a background remaps the Doors module's `targetBgIdx` so a door never points at a missing/wrong room (2026-06-15 fix). |
| `project-lifecycle.spec.js` | New / Duplicate / Delete project through the real menu, asserted against the shared storage catalog. |
| `cross-page-consistency.spec.js` | A change on one page is the same project every other page loads (the shared-catalog contract). |

## Adding a test

Drop a `*.spec.js` file in `tests/`.  Import `{ test, expect, open }` from
`./_fixtures.js`; `open(page, 'sprites.html')` lands on a clean page with a
booted project, and every page exposes its storage as `window.Storage`
(`loadCurrent()` / `saveCurrent(state)`) for deterministic seeding without
hand-writing schema.  The `page.__errors()` helper returns console/page errors
captured during the test.
