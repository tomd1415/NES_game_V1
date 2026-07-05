# Studio end-to-end tests (Playwright)

Browser tests for the **NES Studio** redesign (`tools/tile_editor_web/studio.html`).
They complement the node smoke tests in [`../builder-tests/`](../builder-tests/),
which stay the source of truth for the compile pipeline and byte-identical
ROM invariants.

## Run

From the repo root:

```
npm install                 # once — installs @playwright/test
npx playwright install chromium   # once — the browser
npm run test:e2e            # all Studio browser tests
```

Playwright owns the server lifecycle (see [`../../playwright.config.js`](../../playwright.config.js)):
it boots `tools/playground_server.py` on port **18790** with a throwaway
accounts DB, waits for `/health`, then runs the specs. No manual server
needed.

## Suites

| File | Scope |
| ---- | ----- |
| `shell.spec.js` | The four regions + chrome; shared-storage schema; mode rail; level-gated progressive disclosure; the World dock↔TV↔state link; project rename persistence; self-ticking quests; the validator "Needs attention" panel; the Time Machine (before_play snapshot, restore-snapshots-first, the "keeps 8" copy fix). |
| `play.spec.js` | ▶ Play end-to-end: `before_play` snapshot → real cc65 `/play` compile → the shared jsnes emulator launches in the TV. |
| `screenshot.spec.js` | Not an assertion — captures `test-results/studio-shell.png` for visual review. |

## Notes

- Each test runs in a fresh browser context, so `localStorage` starts
  empty and project state never leaks between tests — do **not** clear
  storage in an `addInitScript` (it would also wipe state across an
  intentional `page.reload()`).
- `studio.js` exposes a tiny `window.Studio` surface (`getState`,
  `getMode`, `getLevel`, `renderLive`) purely so the suite can assert on
  internal state without scraping the DOM.
