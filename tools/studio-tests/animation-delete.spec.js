// #32 — "deleting the 2nd sprite animation appears to delete the 1st." The Studio
// CHARS animation list deletes the clicked animation via its own object
// (indexOf(an)), and each animation owns its frames array, so this must not
// happen. Guard it: create two animations, delete the SECOND, the FIRST remains.
const { test, expect } = require('@playwright/test');

test('#32 deleting the 2nd animation keeps the 1st', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="chars"]').click();

  const ids = await page.evaluate(() => {
    const s = window.Studio.getState();
    s.animations = [
      { id: 101, name: 'FIRST',  frames: [0], fps: 8, role: 'player', style: 'walk' },
      { id: 102, name: 'SECOND', frames: [0], fps: 8, role: 'player', style: 'custom' },
    ];
    window.Studio.ctx.renderDock();
    return s.animations.map(a => a.id);
  });
  expect(ids).toEqual([101, 102]);

  // Delete the SECOND animation via its 🗑 button.
  const del = page.locator('.anim-row button[title="Delete"]');
  await expect(del).toHaveCount(2);
  await del.nth(1).click();

  const after = await page.evaluate(() =>
    window.Studio.getState().animations.map(a => ({ id: a.id, name: a.name })));
  expect(after).toEqual([{ id: 101, name: 'FIRST' }]);   // the FIRST survives, the SECOND is gone
});
