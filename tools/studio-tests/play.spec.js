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

  // Focus-theft (#36): a game key must NOT also do its browser default while
  // playing (Arrow keys used to scroll the page under the emulator).
  const arrowPrevented = await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(arrowPrevented).toBe(true);
  // …but a key typed into a focused text field is left alone (so a pupil can
  // still rename their project with the emulator open).
  const typingLeftAlone = await page.evaluate(() => {
    const inp = document.getElementById('project-name'); inp.focus();
    const e = new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true, cancelable: true });
    inp.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(typingLeftAlone).toBe(false);

  // The emulator offers a .nes download of the ROM it just built, and clicking
  // it starts a download named after the project.
  const dl = page.locator('#emu-download');
  await expect(dl).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dl.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.nes$/);
});
