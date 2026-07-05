// Studio TV — PLAY end-to-end.
//
// Clicking ▶ Play must: snapshot with reason before_play, compile the
// starter through the server /play (real cc65 build), and hand the ROM to
// the shared emulator (its #emu-dialog appears). This is the Phase 0 exit
// criterion "the starter game … plays (PLAY) inside the Studio TV".
const { test, expect } = require('@playwright/test');

test('▶ Play snapshots before_play, compiles, and launches the emulator', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  await page.locator('#btn-play').click();

  // Progress-safety: the before_play snapshot exists straight away.
  await expect
    .poll(() => page.evaluate(() =>
      window.Storage.listSnapshots().some((s) => s.reason === 'before_play')))
    .toBe(true);

  // The TV flips to the Playing state while compiling.
  await expect(page.locator('#tv-state-label')).toHaveText('Playing');

  // The real cc65 build finishes and the shared emulator dialog appears.
  await expect(page.locator('#emu-dialog')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('#emu-canvas')).toBeVisible();
});
