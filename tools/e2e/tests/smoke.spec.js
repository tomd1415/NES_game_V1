// Smoke test: every editor page loads in a real browser with no uncaught JS
// errors and its primary chrome present. This catches the class of bug that
// ships silently — a missing/renamed <script>, a syntax error in an inline
// block, a broken shared module — which the Node `run-all.mjs` syntax check
// (each file in isolation) cannot see, because it never actually loads the
// pages together in a browser. Loaded WITHOUT a seeded project, so it also
// covers the "no project yet" path, which must still load cleanly.
import { test, expect, openBare, open, PAGES } from './_fixtures.js';

for (const pageName of PAGES) {
  test(`loads ${pageName} with no console/page errors`, async ({ page }) => {
    await openBare(page, pageName);

    // The shared chrome (header) must be present on every page.
    await expect(page.locator('.app-header, header').first()).toBeVisible({ timeout: 5000 });

    // No uncaught errors during boot + first render.
    await page.waitForTimeout(400);
    const errors = page.__errors();
    expect(errors, `unexpected errors on ${pageName}:\n${errors.join('\n')}`).toEqual([]);
  });
}

test('Backgrounds page exposes its primary controls', async ({ page }) => {
  await openBare(page, 'index.html');
  for (const id of ['#tileset-canvas', '#tile-canvas', '#btn-play', '#btn-undo', '#palette-editor']) {
    await expect(page.locator(id)).toHaveCount(1);
  }
});

test('Sprites page exposes its primary controls', async ({ page }) => {
  await openBare(page, 'sprites.html');
  await expect(page.locator('#btn-sprite-dup')).toHaveCount(1);
  await expect(page.locator('#btn-play')).toHaveCount(1);
});

test('index.html bootstraps a valid, complete project into storage', async ({ page }) => {
  await open(page, 'index.html');
  const state = await page.evaluate(() => window.Storage.loadCurrent());
  expect(state, 'index.html produced no current project').toBeTruthy();
  expect(Array.isArray(state.bg_palettes), 'state.bg_palettes').toBeTruthy();
  expect(Array.isArray(state.sprite_tiles), 'state.sprite_tiles').toBeTruthy();
  expect(Array.isArray(state.backgrounds), 'state.backgrounds').toBeTruthy();
  expect(state.backgrounds.length).toBeGreaterThan(0);
});
