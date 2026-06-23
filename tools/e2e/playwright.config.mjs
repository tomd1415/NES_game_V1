// Playwright config for the tile-editor browser tests.
//
// These tests drive the REAL editor pages (index/sprites/builder/code/…) in a
// headless Chromium against a live `playground_server.py`, closing the gap the
// Node `tools/builder-tests/` harness can't reach: in-browser DOM behaviour
// (undo/redo, palette persistence across reload, sprite-duplicate pixel
// isolation, the in-browser "Play in NES" pipeline, keyboard-focus handling).
// Several of those are currently only protected by source-text guards in
// `run-all.mjs` ("a behavioural test would need a JSDOM harness which the
// project doesn't currently have") — this suite is that harness.
//
// Browsers are expected in the default cache (~/.cache/ms-playwright). Run:
//   cd tools/e2e && npm install --offline   # or a normal `npm install`
//   npm test
import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// A dedicated port well clear of the default 8765 and the Node suite's
// 18768–18862 range, so an e2e run never collides with a dev server or
// `run-all.mjs`.
const PORT = Number(process.env.E2E_PORT || 8799);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

// Throwaway accounts DB so the suite never touches the real tools/accounts.db.
const ACCT_DB = path.join(os.tmpdir(), `nesgame-e2e-accounts-${PORT}.db`);

export default defineConfig({
  testDir: './tests',
  // The editor mutates a shared build dir on /play (serialised server-side by
  // BUILD_LOCK), and tests are isolated per-context for localStorage, so full
  // parallelism is safe.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A "Play in NES" spec drives a cc65 build + a jsnes instance in a real
  // browser; under heavy parallelism a renderer can be OOM-killed mid-test.
  // One retry absorbs that flake without hiding a deterministic failure.
  retries: 1,
  // Cap concurrency so the heavyweight build+emulator specs each get headroom.
  workers: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 ../playground_server.py',
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PLAYGROUND_PORT: String(PORT),
      // Never read a developer's local .env (join codes / admin secret) into a
      // test run, and never create the real accounts DB.
      PLAYGROUND_SKIP_DOTENV: '1',
      PLAYGROUND_ACCOUNTS_DB: ACCT_DB,
    },
  },
});
