// Per-door destinations editor in WORLD (engine v2).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker');
});

test('WORLD Doors section lists painted doors and configures destinations', async ({ page }) => {
  // Paint a Door tile (behaviour id 4) and re-render the dock.
  await page.evaluate(() => {
    const bg = window.Studio.getState().backgrounds[0];
    bg.behaviour[12][8] = 4; // door tile at tx=8, ty=12
  });
  await page.locator('.mode-btn[data-mode="world"]').click();

  const doors = page.locator('.dock-section').filter({ has: page.locator('.title', { hasText: 'Doors' }) });
  await expect(doors).toBeVisible();
  await expect(doors).toContainText('Door at tile 8,12');

  // Set Spawn X and the target room.
  const spawnX = doors.locator('input[type="number"]').first();
  await spawnX.fill('96');
  await spawnX.blur();
  const entry = await page.evaluate(() => {
    const list = window.Studio.getState().builder.modules.doors.config.doorList;
    return list.find((d) => d.tx === 8 && d.ty === 12) || null;
  });
  expect(entry).not.toBeNull();
  expect(entry.spawnX).toBe(96);
  // The doors module is auto-enabled so the per-door table actually builds.
  const enabled = await page.evaluate(() =>
    window.Studio.getState().builder.modules.doors.enabled);
  expect(enabled).toBe(true);
});

test('removing a door tile prunes its entry', async ({ page }) => {
  await page.evaluate(() => { window.Studio.getState().backgrounds[0].behaviour[12][8] = 4; });
  await page.locator('.mode-btn[data-mode="world"]').click();
  await expect(page.locator('.dock-section', { hasText: 'Doors' })).toContainText('Door at tile 8,12');
  // Erase the door tile → the entry is pruned on next render.
  await page.evaluate(() => { window.Studio.getState().backgrounds[0].behaviour[12][8] = 0; });
  await page.locator('.mode-btn[data-mode="world"]').click();
  const count = await page.evaluate(() =>
    window.Studio.getState().builder.modules.doors.config.doorList.filter((d) => d.tx === 8 && d.ty === 12).length);
  expect(count).toBe(0);
});
