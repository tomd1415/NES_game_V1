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

test('entities can be placed on screen 2 of a scrolling background (bug #14)', async ({ page }) => {
  // Grow the background to two screens wide and scroll the World view to the
  // second screen, then place — the instance must land in world coords past
  // the first screen (x >= 256), not get clamped back onto screen 1.
  await page.evaluate(() => {
    const st = window.Studio.getState();
    const bg = st.backgrounds[st.selectedBgIdx];
    const W = 64;
    bg.dimensions = { screens_x: 2, screens_y: 1 };
    bg.nametable = bg.nametable.map((row) => {
      const r = row.slice();
      while (r.length < W) r.push({ tile: 0, palette: 0 });
      return r;
    });
    if (bg.behaviour) bg.behaviour = bg.behaviour.map((row) => {
      const r = row.slice();
      while (r.length < W) r.push(0);
      return r;
    });
    window.Studio.ctx.setViewScreen(1, 0);   // show screen 2
    window.Studio.renderLive();
  });
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="place"]').click();
  await clickTv(page, 0.5, 0.4);
  const placed = await lastInstance(page);
  expect(placed.x).toBeGreaterThanOrEqual(256);   // landed on screen 2, not clamped to screen 1
  expect(placed.x).toBeLessThan(512);             // and within the 2-screen world
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
