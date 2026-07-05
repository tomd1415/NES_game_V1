// CHR / OAM budget meters (Phase 3.1).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('the cartridge budget meters render with real counts', async ({ page }) => {
  await expect(page.locator('#budget-list .budget')).toHaveCount(3);
  await expect(page.locator('.budget', { hasText: 'background tiles' })).toBeVisible();
  await expect(page.locator('.budget', { hasText: 'sprite tiles' })).toBeVisible();
  // Starter uses a few BG tiles (ground + brick) → non-zero, well under 256.
  const bgText = await page.locator('.budget', { hasText: 'background tiles' }).locator('.val').textContent();
  const [used, max] = bgText.split('/').map((n) => parseInt(n, 10));
  expect(max).toBe(256);
  expect(used).toBeGreaterThan(0);
  expect(used).toBeLessThan(256);
});

test('drawing a new tile increases the CHR budget', async ({ page }) => {
  const readBg = async () =>
    parseInt((await page.locator('.budget', { hasText: 'background tiles' }).locator('.val').textContent()).split('/')[0], 10);
  const before = await readBg();
  // Paint into a fresh BG tile via TILES mode.
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="tiles"]').click();
  await page.locator('.tile-grid .tile-cell').nth(40).click(); // a blank tile
  await page.locator('.swatch-row .swatch').nth(1).click();
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const after = await readBg();
  expect(after).toBe(before + 1);
});
