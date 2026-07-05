// Header navigation: reach the gallery, and open a saved project from disk.
const { test, expect } = require('@playwright/test');

test('the header has Gallery and Open (project file) buttons', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await expect(page.locator('#btn-gallery')).toBeVisible();
  await expect(page.locator('#btn-open-file')).toBeVisible();
});

test('Gallery button opens the gallery', async ({ page, context }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  const popupPromise = context.waitForEvent('page');
  await page.locator('#btn-gallery').click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  expect(popup.url()).toContain('gallery.html');
});

test('Open button triggers the project-file picker', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // Clicking Open forwards to the hidden .json file input (reuses the importer).
  const clicked = await page.evaluate(() => {
    return new Promise((resolve) => {
      const inp = document.getElementById('tm-import-file');
      inp.addEventListener('click', function (e) { e.preventDefault(); resolve(true); }, { once: true });
      document.getElementById('btn-open-file').click();
      setTimeout(() => resolve(false), 500);
    });
  });
  expect(clicked).toBe(true);
});
