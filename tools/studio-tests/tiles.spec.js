// TILES mode — the 8×8 tile primitive (Phase 2).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker'); // TILES is Maker-level
  await page.locator('.mode-btn[data-mode="tiles"]').click();
});

test('shows a 256-tile bank grid and tile ops', async ({ page }) => {
  await expect(page.locator('.tile-grid .tile-cell')).toHaveCount(256);
  await expect(page.locator('.btn', { hasText: 'Flip H' })).toBeVisible();
  await expect(page.locator('.btn', { hasText: 'Rotate' })).toBeVisible();
});

test('painting on the TV edits the selected tile, and shared refs update', async ({ page }) => {
  // Select tile 1 (the ground tile, referenced by the floor).
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  const beforeRefs = await page.evaluate(() => {
    const s = window.Studio.getState();
    // Ground tile is used across the floor; snapshot its pixels.
    return JSON.stringify(s.bg_tiles[1].pixels);
  });
  // Pen value 2 (rare in the ground tile) drawn across the middle row.
  await page.locator('.swatch-row .swatch').nth(2).click();
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  const afterRefs = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  expect(afterRefs).not.toEqual(beforeRefs);
});

test('Flip H mirrors the tile and is undoable', async ({ page }) => {
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  const before = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  await page.locator('.btn', { hasText: 'Flip H' }).click();
  const flipped = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  expect(flipped).not.toEqual(before);
  await page.evaluate(() => window.Studio.undo());
  const restored = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  expect(restored).toEqual(before);
});

test('bank toggle switches to the sprite pattern table', async ({ page }) => {
  await page.locator('.btn', { hasText: 'Sprite' }).click();
  const bank = await page.evaluate(() => window.StudioModes.tiles._get().bank);
  expect(bank).toBe('sprite');
  await expect(page.locator('.dock-section .title', { hasText: 'Sprite tiles' })).toBeVisible();
});

test('[ and ] step the selected tile', async ({ page }) => {
  await page.locator('.tile-grid .tile-cell').nth(5).click();
  await page.locator('#tv-canvas').hover();
  await page.keyboard.press(']');
  expect(await page.evaluate(() => window.StudioModes.tiles._get().selIdx)).toBe(6);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  expect(await page.evaluate(() => window.StudioModes.tiles._get().selIdx)).toBe(4);
});
