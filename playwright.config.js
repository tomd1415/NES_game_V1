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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
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
