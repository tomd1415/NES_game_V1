// CHARS mode — character list, roles, and drawing (Phase 1.2).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="chars"]').click();
});

test('lists the starter hero with its role', async ({ page }) => {
  await expect(page.locator('.char-row')).toHaveCount(1);
  await expect(page.locator('.char-row .chip', { hasText: 'player' })).toBeVisible();
  await expect(page.locator('select[data-role]')).toHaveValue('player');
});

test('role assignment updates the sprite (the notes.md question)', async ({ page }) => {
  await page.locator('select[data-role]').selectOption('enemy');
  const role = await page.evaluate(() => window.Studio.getState().sprites[0].role);
  expect(role).toBe('enemy');
});

test('new / duplicate / delete characters', async ({ page }) => {
  await page.locator('#chars-new').click();
  await expect(page.locator('.char-row')).toHaveCount(2);
  const n = await page.evaluate(() => window.Studio.getState().sprites.length);
  expect(n).toBe(2);
});

test('resizing changes the metasprite dimensions and cell grid', async ({ page }) => {
  // Width select is the first select in "This character".
  const sizeSelects = page.locator('.field .row select');
  await sizeSelects.first().selectOption('3');
  const w = await page.evaluate(() => window.Studio.getState().sprites[0].width);
  expect(w).toBe(3);
  const cols = await page.evaluate(() => window.Studio.getState().sprites[0].cells[0].length);
  expect(cols).toBe(3);
});

test('drawing on the TV edits a shared sprite tile', async ({ page }) => {
  // Snapshot the hero's four tiles.
  const before = await page.evaluate(() => {
    const s = window.Studio.getState();
    return JSON.stringify([1, 2, 3, 4].map((i) => s.sprite_tiles[i].pixels));
  });
  // Pick the white pen (colour 3) so it differs from the body colour.
  await page.locator('.swatch-row .swatch').nth(3).click();
  await page.locator('.stage-toolbar .tool[data-tool="pencil"]').click();
  // Drag a short stroke across the middle of the sprite.
  const box = await page.locator('#tv-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 10, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 10, cy, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => {
    const s = window.Studio.getState();
    return JSON.stringify([1, 2, 3, 4].map((i) => s.sprite_tiles[i].pixels));
  });
  expect(after).not.toEqual(before);
});
