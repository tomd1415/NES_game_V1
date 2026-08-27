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

### In the dev container

Skip the `npx playwright install` step — the image **bakes Chromium in at build
time** (`.devcontainer/Dockerfile`), because `cdn.playwright.dev` is a rotating
CDN that the egress allowlist cannot pin, so downloading at runtime fails. Just
`npm run test:e2e`.

If you get **"Executable doesn't exist at …/chromium_headless_shell-\<N\>"**, the
image is stale: `package-lock.json` has floated to a Playwright whose browser
build the image does not carry. Rebuild the container (`Dev Containers: Rebuild
Container`, or `devcontainer build`). `run-all.mjs` has an invariant that fails
on that drift before you ever hit it here — it names the version to put in the
Dockerfile's `ARG PLAYWRIGHT_VERSION`.

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

## Per-test timeouts, and when to reach for `test.slow()`

The committed limit is **30 s** and it stays there. Two tests carry `test.slow()`
(90 s): `tutorial.spec.js`'s `every game style` and `the long from-scratch
tutorial`. Nothing else does, and adding a third should need the same evidence.

**Measure before you size anything.** Run the suite with a timeout generous enough
that nothing hits it, so the numbers are the work rather than the limit:

```bash
npx playwright test --reporter=json --timeout=180000 > /tmp/e2e.json
# then read result.duration per test; and record `uptime` — a duration
# without a load figure is not a measurement on this box
```

Two things that are easy to get wrong here, both paid for on 2026-08-27:

- **The load penalty is additive, not proportional.** At load ~26, two tests whose
  quiet times were 2.9 s and 2.5 s took 26.4 s and 25.6 s — about **+23 s each**,
  independent of how long they take on a quiet box. So "this test has 10× headroom"
  is not a safe argument; what matters is quiet-duration **plus** the penalty at the
  load you want to survive.
- **Prefer `test.slow()` to raising the global timeout.** The global guards 163
  well-behaved tests against a genuine hang; tripling it to rescue two would weaken
  all of them. And prefer it to splitting a test that is sequential by nature — half
  a tutorial walk proves half a thing.

The cost of `test.slow()`, stated: a real hang in one of those two now takes 90 s to
surface rather than 30. That is the right trade for a test whose true work is 14 s.

**Do not fix a slow test by passing `--timeout` to your own run.** That was done in
`mutate-report.sh` and it hid the problem from every ordinary `npx playwright test`
while the suite acquired a reputation for flakiness it did not deserve.

## Notes

- Each test runs in a fresh browser context, so `localStorage` starts
  empty and project state never leaks between tests — do **not** clear
  storage in an `addInitScript` (it would also wipe state across an
  intentional `page.reload()`).
- `studio.js` exposes a tiny `window.Studio` surface (`getState`,
  `getMode`, `getLevel`, `renderLive`) purely so the suite can assert on
  internal state without scraping the DOM.
