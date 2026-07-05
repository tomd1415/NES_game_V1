// PALS mode — palette editing (Phase 1.3).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // PALS is a Maker-level mode.
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="pals"]').click();
});

test('PALS shows backdrop, 4 BG and 4 sprite palettes + master grid', async ({ page }) => {
  await expect(page.locator('.dock-section .title', { hasText: 'Backdrop' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Background palettes' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Sprite palettes' })).toBeVisible();
  await expect(page.locator('.master-grid .swatch')).toHaveCount(64);
});

test('editing a BG palette slot updates the state and recolours live', async ({ page }) => {
  // Select BG palette 1, slot 1 (the second swatch after the locked slot 0).
  const bg1 = page.locator('.pal-strip', { hasText: 'BG 1' });
  await bg1.locator('.swatch').nth(1).click(); // slot index 1 (editable slot 1)
  // Pick colour index 20 from the master grid.
  await page.locator('.master-grid .swatch').nth(20).click();
  const val = await page.evaluate(() => window.Studio.getState().bg_palettes[1].slots[0]);
  expect(val).toBe(20);
});

test('slot 0 is locked (backdrop / transparent) and cannot be picked as a slot', async ({ page }) => {
  // Every palette strip's first swatch is the locked slot 0.
  const locked = page.locator('.pal-strip .swatch.locked');
  expect(await locked.count()).toBeGreaterThanOrEqual(8); // 4 BG + 4 SP
});

test('editing the backdrop updates universal_bg', async ({ page }) => {
  await page.locator('.pal-strip', { hasText: 'BG0' }).locator('.swatch').first().click();
  await page.locator('.master-grid .swatch').nth(13).click(); // 0x0D-ish black
  const uni = await page.evaluate(() => window.Studio.getState().universal_bg);
  expect(uni).toBe(13);
});
