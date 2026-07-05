// RULES mode — builder module tree as cards (Phase 1.4).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="rules"]').click();
});

test('RULES renders a card per builder module', async ({ page }) => {
  await expect(page.locator('.rule-card')).not.toHaveCount(0);
  await expect(page.locator('.rule-card .card-title', { hasText: 'Game type' })).toBeVisible();
  await expect(page.locator('.rule-card .card-title', { hasText: 'Player 1' })).toBeVisible();
});

test('changing the game type updates state.builder', async ({ page }) => {
  // The Game type card is always-on and expanded.
  const gameCard = page.locator('.rule-card', { hasText: 'Game type' }).first();
  await gameCard.locator('select').first().selectOption('topdown');
  const t = await page.evaluate(() =>
    window.Studio.getState().builder.modules.game.config.type);
  expect(t).toBe('topdown');
});

test('toggling an optional module flips node.enabled', async ({ page }) => {
  // Damage is off by default.
  const before = await page.evaluate(() =>
    window.Studio.getState().builder.modules.damage.enabled);
  expect(before).toBe(false);
  await page.locator('input[data-module="damage"]').check();
  const after = await page.evaluate(() =>
    window.Studio.getState().builder.modules.damage.enabled);
  expect(after).toBe(true);
});

test('editing a numeric field commits to config and is undoable', async ({ page }) => {
  // Player 1 card → a numeric field (e.g. Start X). Expand players first.
  const p1 = page.locator('.rule-card', { hasText: 'Player 1' }).first();
  const numInput = p1.locator('input[type="number"]').first();
  await numInput.fill('120');
  await numInput.blur();
  const cfg = await page.evaluate(() =>
    window.Studio.getState().builder.modules.players.submodules.player1.config);
  // Some numeric field now holds 120 (whichever the first one is).
  expect(Object.values(cfg)).toContain(120);

  await page.evaluate(() => window.Studio.undo());
  // After undo the value differs from 120 (restored).
  const cfg2 = await page.evaluate(() =>
    window.Studio.getState().builder.modules.players.submodules.player1.config);
  expect(JSON.stringify(cfg2)).not.toEqual(JSON.stringify(cfg));
});

test('reset modules restores defaults', async ({ page }) => {
  await page.locator('input[data-module="damage"]').check();
  page.on('dialog', (d) => d.accept());
  await page.locator('.btn', { hasText: 'Reset modules' }).click();
  const dmg = await page.evaluate(() =>
    window.Studio.getState().builder.modules.damage.enabled);
  expect(dmg).toBe(false);
});
