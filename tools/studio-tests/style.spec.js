// STYLE mode — the dedicated per-game-type options screen.
const { test, expect } = require('@playwright/test');

test('Style tab picks the game type and shows SMB-specific options', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  // The Style mode is in the rail.
  await page.locator('.mode-btn[data-mode="style"]').click();
  await expect(page.locator('.dock-section', { hasText: 'Game style' })).toBeVisible();

  // Choose SMB — state.builder.modules.game.config.type flips.
  await page.locator('.style-card', { hasText: 'SMB platformer' }).click();
  const t = await page.evaluate(() => window.Studio.getState().builder.modules.game.config.type);
  expect(t).toBe('smb');

  // SMB-specific sections appear (power-ups, blocks pointer).
  await expect(page.locator('.dock-section', { hasText: 'Power-ups & fireballs' })).toBeVisible();
  await expect(page.locator('.btn', { hasText: 'Edit blocks in World' })).toBeVisible();

  // Enabling power-ups from Style flips the module on.
  await page.locator('.dock-section', { hasText: 'Power-ups & fireballs' }).locator('input[type=checkbox]').first().check();
  const puOn = await page.evaluate(() => window.Studio.getState().builder.modules.powerups.enabled);
  expect(puOn).toBe(true);

  // Switching to Racer swaps the options.
  await page.locator('.style-card', { hasText: 'Racer' }).click();
  await expect(page.locator('.dock-section', { hasText: 'Racer options' })).toBeVisible();
});
