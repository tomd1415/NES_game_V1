// Playwright config for the NES Studio redesign end-to-end tests.
//
// The app is a set of static pages served by tools/playground_server.py
// (it also does the cc65 /play compile). We let Playwright own the
// server lifecycle via `webServer`, on a dedicated test port so it never
// clashes with a developer's running instance (default 8765).
//
// Tests live in tools/studio-tests/. The older node smoke tests under
// tools/builder-tests/ are unaffected and still run via
// `node tools/builder-tests/run-all.mjs`.
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.STUDIO_TEST_PORT || 18790);
const BASE_URL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tools/studio-tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 30000,
  expect: { timeout: 7000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Opt-in escape hatch for a container whose image does not bake Playwright's own
  // Chromium. The image is supposed to (`npx playwright install --with-deps chromium`
  // at build time, because init-firewall.sh pins cdn.playwright.dev's IPs at container
  // start and that CDN rotates them, so a runtime download hangs). When the image
  // predates that, `apt-get install chromium` reaches deb.debian.org, which IS on the
  // allowlist, and this points Playwright at it:
  //
  //   PLAYWRIGHT_CHROMIUM_PATH=$(command -v chromium) npx playwright test
  //
  // Prefer rebuilding the container. A distro Chromium is a DIFFERENT build from the
  // one this Playwright version was tested against, so read a failure here twice
  // before believing it is the app.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: {
    command: `python3 tools/playground_server.py`,
    url: `${BASE_URL}/health`,
    timeout: 30000,
    reuseExistingServer: false,
    env: {
      PLAYGROUND_PORT: String(PORT),
      PLAYGROUND_SKIP_DOTENV: '1',
      // Isolate the accounts DB so tests never touch tools/accounts.db.
      PLAYGROUND_ACCOUNTS_DB: '/tmp/studio-e2e-accounts.db',
    },
  },
});
