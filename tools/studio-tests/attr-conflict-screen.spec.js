// The attribute-clash COUNT must describe the screen the pupil is looking at —
// the same screen the red X marks are drawn on.
//
// A 2×2 chunk can show only one palette on the NES, so WORLD outlines offending
// chunks with a red X and the dock says "N blocks mix two palettes (red X on
// this screen)" — tightened to "this screen" on 2026-08-14, because "on screen"
// could be read as "on the display". NOT an owner decision: the question of
// whether the count should cover the whole level or the current screen was
// asked and the reply came back unreadable, so the standing behaviour since
// 6a93e3f (current screen) was kept and the label made to say so. If the answer
// arrives and it is "whole level", this comment and that label both change.
// The overlay applies the view-screen offset; until 2026-08-09 the
// counter did not, and always scanned screen 0. On any level wider than one
// screen the two therefore described different places:
//
//   - clashes on screen 2, pupil on screen 2 -> X marks visible, dock says 0
//   - clashes on screen 0, pupil on screen 2 -> dock says 2, no X marks anywhere
//
// A wrong number, shown to a child, with nothing failing — which is why this is
// asserted as a number rather than as "a warning appears". The pre-existing
// coverage in world.spec.js only ever used screen 0, so it could not see this.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="world"]').click();
});

// Grow to 3 screens wide and put a palette clash in one 2×2 chunk of `screen`.
async function clashOnScreen(page, screen) {
  await page.evaluate((sx) => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => (b.title || '').startsWith('Add a screen to the right'));
    for (let i = 0; i < sx; i++) btn.click();
  }, 2);
  await page.evaluate((sc) => {
    const s = window.Studio.getState();
    const nt = s.backgrounds[s.selectedBgIdx].nametable;
    const col = sc * 32;                 // first column of that screen
    nt[0][col].palette = 0;
    nt[0][col + 1].palette = 2;          // same 2×2 chunk, different palette
  }, screen);
}

const conflicts = (page) =>
  page.evaluate(() => window.StudioModes.world._conflicts());
const gotoScreen = (page, x) =>
  page.evaluate((sx) => window.Studio.ctx.setViewScreen(sx, 0), x);

test('the clash count follows the viewed screen', async ({ page }) => {
  await clashOnScreen(page, 2);
  await gotoScreen(page, 0);
  expect(await conflicts(page), 'screen 0 is clean').toBe(0);
  await gotoScreen(page, 2);
  expect(await conflicts(page), 'the clash is on screen 2 and must be counted there').toBe(1);
});

test('a clash on another screen is not attributed to this one', async ({ page }) => {
  await clashOnScreen(page, 0);
  await gotoScreen(page, 2);
  expect(await conflicts(page), 'screen 2 is clean — the clash is on screen 0').toBe(0);
  await gotoScreen(page, 0);
  expect(await conflicts(page)).toBe(1);
});

test('the dock warning agrees with the count on a non-zero screen', async ({ page }) => {
  await clashOnScreen(page, 1);
  await gotoScreen(page, 1);
  await page.locator('.mode-btn[data-mode="world"]').click();   // re-render the dock
  await expect(page.locator('.dock-note', { hasText: 'mix two palettes' })).toBeVisible();
  expect(await conflicts(page)).toBe(1);
});
