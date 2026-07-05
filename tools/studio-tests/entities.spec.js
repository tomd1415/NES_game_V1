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

test('Place tool drops a scene instance on the TV', async ({ page }) => {
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.5, 0.4);
  const instances = await page.evaluate(() =>
    window.Studio.getState().builder.modules.scene.config.instances);
  expect(instances.length).toBe(1);
  expect(instances[0]).toHaveProperty('spriteIdx');
  expect(instances[0]).toHaveProperty('x');
  expect(instances[0].ai).toBe('static');
});

test('per-instance AI + speed config writes to the instance', async ({ page }) => {
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.5, 0.4);
  // The placed instance is auto-selected → its config panel shows.
  await page.locator('select[data-ent-ai]').selectOption('walker');
  const ai = await page.evaluate(() =>
    window.Studio.getState().builder.modules.scene.config.instances[0].ai);
  expect(ai).toBe('walker');
});

test('deleting an entity removes it from the scene', async ({ page }) => {
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.3, 0.4);
  await clickTv(page, 0.7, 0.4);
  expect(await page.evaluate(() =>
    window.Studio.getState().builder.modules.scene.config.instances.length)).toBe(2);
  await page.locator('.ent-row .icon-btn').first().click();
  expect(await page.evaluate(() =>
    window.Studio.getState().builder.modules.scene.config.instances.length)).toBe(1);
});
