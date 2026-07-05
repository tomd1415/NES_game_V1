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
