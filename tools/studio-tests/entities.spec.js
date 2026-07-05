// WORLD entity placement (Phase 1.1) — "the world where elements come together".
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // Make a non-player character to place.
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.locator('#chars-new').click();
  await page.locator('select[data-role]').selectOption('enemy');
  await page.locator('.mode-btn[data-mode="world"]').click();
});

async function clickTv(page, fx, fy) {
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

const sceneCount = (page) => page.evaluate(() =>
  window.Studio.getState().builder.modules.scene.config.instances.length);
const lastInstance = (page) => page.evaluate(() => {
  const i = window.Studio.getState().builder.modules.scene.config.instances;
  return i[i.length - 1];
});

test('Place tool drops a scene instance on the TV', async ({ page }) => {
  const before = await sceneCount(page);
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.5, 0.4);
  expect(await sceneCount(page)).toBe(before + 1);
  const placed = await lastInstance(page);
  expect(placed).toHaveProperty('spriteIdx');
  expect(placed).toHaveProperty('x');
  expect(placed.ai).toBe('static');
});

test('per-instance AI + speed config writes to the instance', async ({ page }) => {
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.5, 0.4);
  // The placed instance is auto-selected → its config panel shows.
  await page.locator('select[data-ent-ai]').selectOption('walker');
  // The placed instance is auto-selected, so its AI is the one that changed.
  expect((await lastInstance(page)).ai).toBe('walker');
});

test('deleting an entity removes it from the scene', async ({ page }) => {
  const before = await sceneCount(page);
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.3, 0.4);
  await clickTv(page, 0.7, 0.4);
  expect(await sceneCount(page)).toBe(before + 2);
  await page.locator('.ent-row .icon-btn').first().click();
  expect(await sceneCount(page)).toBe(before + 1);
});
