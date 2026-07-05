// CHARS animations (Phase 1.2) — clears the "no walk animation" warning.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // Animations + warnings are Maker-level (finer disclosure, 1.7).
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="chars"]').click();
});

test('creating an animation auto-wires walk and clears the validator warning', async ({ page }) => {
  // The starter has a "No walk animation" warning.
  await expect(page.locator('#attn-list')).toContainText('walk animation');

  await page.locator('.dock-section .title', { hasText: 'Animations' })
    .locator('..').locator('.btn', { hasText: '+ New' }).click();

  // An animation exists and walk is assigned to it.
  const state = await page.evaluate(() => {
    const s = window.Studio.getState();
    return { anims: s.animations.length, walk: s.animation_assignments.walk };
  });
  expect(state.anims).toBe(1);
  expect(state.walk).not.toBeNull();

  // The warning is gone.
  await expect(page.locator('#attn-list')).not.toContainText('No walk animation');
});

test('adding frames and reassigning walk works', async ({ page }) => {
  const animsSection = page.locator('.dock-section', { hasText: 'Animations' });
  await animsSection.locator('.btn', { hasText: '+ New' }).click();
  await page.locator('.btn', { hasText: 'Add this character as a frame' }).click();
  const frames = await page.evaluate(() => window.Studio.getState().animations[0].frames.length);
  expect(frames).toBe(2);

  // Reassign walk to (none) via the dropdown.
  await page.locator('select[data-assign="walk"]').selectOption('');
  const walk = await page.evaluate(() => window.Studio.getState().animation_assignments.walk);
  expect(walk).toBeNull();
});
