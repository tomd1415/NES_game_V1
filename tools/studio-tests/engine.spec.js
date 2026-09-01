// NES-engine versioning in the Studio: target + upgrade advisor (E-V3).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('the Studio targets the latest engine', async ({ page }) => {
  const [target, latest] = await page.evaluate(() =>
    [window.NES_TARGET_ENGINE, window.NES_ENGINE_VERSION]);
  expect(target).toBe(latest);
  // The engine chrome button shows the project's engine version.
  await expect(page.locator('#btn-engine')).toContainText('v' + latest);
});

// A fresh project must carry its engine version IN THE PROJECT BLOB.
//
// HONEST SCOPE: this is belt-and-braces, not a gap. I added it believing the
// stamping could vanish silently — that `#btn-engine` falls back to
// `window.NES_ENGINE_VERSION` and would still read v<latest>. Mutation-testing
// disproved that: `projectEngine()` is `(state.engineVersion|0) || 1`, so an
// unstamped project renders "⚙ Engine v1" and the test above ALREADY goes red.
// Removing all three stamping sites fails two of these three tests, not one.
//
// Kept anyway, for one narrow reason: the test above asserts rendered button text,
// and this asserts the state the provenance machinery actually reads. A chrome
// redesign could legitimately change the button while the stamp still matters —
// snapshots exist so a future engine can rebuild a game with the engine it was
// authored for, and that reads the blob, not the DOM.
test('a freshly created project is stamped with the engine it was authored for', async ({ page }) => {
  const { stamped, latest } = await page.evaluate(() => ({
    stamped: window.Studio.getState().engineVersion,
    latest: window.NES_ENGINE_VERSION,
  }));
  expect(typeof latest, 'engine-version.js did not load — the comparison below would ' +
    'be vacuous').toBe('number');
  expect(stamped, 'the project blob carries no engineVersion — an unstamped project ' +
    'reads as v1, so a future engine would rebuild it with the wrong engine')
    .toBe(latest);
});

test('engine advisor flags an outdated project and can update it', async ({ page }) => {
  // Force the project onto an older engine.
  await page.evaluate(() => { window.Studio.getState().engineVersion = 1; window.Studio.refresh(); });
  const btn = page.locator('#btn-engine');
  await expect(btn).toContainText('v1');
  await expect(btn).toHaveClass(/primary/); // outdated → highlighted

  await btn.click();
  const dlg = page.locator('.modal-backdrop.open', { hasText: 'NES engine' });
  await expect(dlg).toBeVisible();
  // The changelog (fetched from /engine/CHANGELOG.md) lists what changed since v1.
  await expect(dlg.locator('#engine-advisor-body')).toContainText('v2', { timeout: 10000 });

  await dlg.locator('#engine-update').click();
  expect(await page.evaluate(() => window.Studio.getState().engineVersion))
    .toBe(await page.evaluate(() => window.NES_ENGINE_VERSION));
  await expect(page.locator('#btn-engine')).not.toHaveClass(/primary/);
});
