// Whole-project JSON round-trip (Phase 3.5).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('export → import is lossless', async ({ page }) => {
  // Make the state distinctive first.
  await page.locator('#project-name').fill('Round Trip Test');
  await page.waitForTimeout(400);
  const exported = await page.evaluate(() => window.Studio.exportJson());

  // Import it back and compare the canonical state.
  const ok = await page.evaluate((text) => window.Studio.importText(text), exported);
  expect(ok).toBe(true);
  const reexported = await page.evaluate(() => window.Studio.exportJson());
  expect(JSON.parse(reexported)).toEqual(JSON.parse(exported));
});

test('importing snapshots the current work first (before_import)', async ({ page }) => {
  const exported = await page.evaluate(() => window.Studio.exportJson());
  await page.evaluate((text) => window.Studio.importText(text), exported);
  const reasons = await page.evaluate(() =>
    window.Storage.listSnapshots().map((s) => s.reason));
  expect(reasons).toContain('before_import');
});

test('the Time Machine exposes Save / Open project file', async ({ page }) => {
  await page.locator('#btn-time-machine').click();
  await expect(page.locator('#tm-export')).toBeVisible();
  await expect(page.locator('#tm-import')).toBeVisible();
});

test('importing a distinct project replaces the live state', async ({ page }) => {
  // Build a modified export: rename + change universal_bg.
  const modified = await page.evaluate(() => {
    const s = JSON.parse(window.Studio.exportJson());
    s.name = 'Imported World';
    s.universal_bg = 5;
    return JSON.stringify(s);
  });
  await page.evaluate((text) => window.Studio.importText(text), modified);
  expect(await page.evaluate(() => window.Studio.getState().universal_bg)).toBe(5);
  await expect(page.locator('#project-name')).toHaveValue('Imported World');
});
