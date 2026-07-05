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
| `shell.spec.js` | The four regions + chrome; shared-storage schema; mode rail; level-gated progressive disclosure; project rename persistence; self-ticking quests; the "Needs attention" panel; the Time Machine (before_play snapshot, restore-snapshots-first, "keeps 8" copy fix). |
| `play.spec.js` | ▶ Play end-to-end: `before_play` snapshot → real cc65 `/play` compile → the shared jsnes emulator launches. |
| `world.spec.js` | WORLD painting: stamp/erase/undo, the 2×2 Colour tool, Type (behaviour) painting, background management. |
| `entities.spec.js` | WORLD entity placement: Place tool drops a scene instance, per-instance AI/speed config, delete. |
| `chars.spec.js` | CHARS: character list, role assignment, new/dup/delete, resize, drawing edits a shared sprite tile. |
| `animations.spec.js` | CHARS animations: creating one auto-wires walk (clears the validator warning); frames + reassignment. |
| `pals.spec.js` | PALS: backdrop + 4 BG + 4 sprite palettes, slot-0 lock, master 64-colour picker. |
| `rules.spec.js` | RULES: a card per builder module; game-type change; module toggle; numeric field commit + undo; reset. |
| `tiles.spec.js` | TILES: 256-tile bank grid, painting edits the shared tile, Flip H + undo, bank toggle, `[`/`]` stepping. |
| `budget.spec.js` | CHR/OAM budget meters render real counts; drawing a fresh tile bumps the count. |
| `sound-code.spec.js` | SOUND starter pack + FamiStudio `.s` upload symbol extraction; CODE read-only C; validator jump-to-fix buttons. |
| `publish.spec.js` | 📤 Publish: build → 60-frame preview → `/gallery/publish`, then asserts the entry appears in `/gallery/list`. |
| `project-file.spec.js` | Whole-project JSON round-trip (export → import lossless; before_import snapshot). |
| `screenshot.spec.js` | Not assertions — captures `test-results/studio-*.png` for visual review. |

## Notes

- Each test runs in a fresh browser context, so `localStorage` starts
  empty and project state never leaks between tests — do **not** clear
  storage in an `addInitScript` (it would also wipe state across an
  intentional `page.reload()`).
- `studio.js` exposes a tiny `window.Studio` surface (`getState`,
  `getMode`, `getLevel`, `renderLive`) purely so the suite can assert on
  internal state without scraping the DOM.
