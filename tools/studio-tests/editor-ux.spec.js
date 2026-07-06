// Editor UX: wider + resizable edit column, live cursor coordinates, edge rulers.
const { test, expect } = require('@playwright/test');

test('the edit column is wider and can be dragged to resize (persisted)', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  // Default is the new wider width (310px).
  const w0 = await page.evaluate(() =>
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--dock-w'), 10));
  expect(w0).toBe(310);

  // Drag the resizer to the right → the column gets wider.
  const handle = page.locator('#dock-resizer');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const w1 = await page.evaluate(() =>
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--dock-w'), 10));
  expect(w1).toBeGreaterThan(w0 + 40);

  // It persisted to localStorage.
  const saved = await page.evaluate(() => parseInt(localStorage.getItem('studio.dockWidth'), 10));
  expect(saved).toBe(w1);
});

test('WORLD shows live cursor coordinates and edge rulers', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // Default boots into WORLD. Edge rulers are populated.
  await expect(page.locator('#tv-rulers .rk')).not.toHaveCount(0);

  // Moving over the canvas updates the coordinate box to a tile x, y.
  const canvas = page.locator('#tv-canvas');
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await expect(page.locator('#tv-coords')).toHaveText(/x \d+, y \d+/);
});
