// Publish to gallery — the Phase 1 exit's "publish" leg.
const { test, expect } = require('@playwright/test');

test('publishing builds the ROM, captures a preview, and lands in the gallery', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  await page.locator('#btn-publish').click();
  await expect(page.locator('#pub-backdrop')).toHaveClass(/open/);

  const title = 'Studio E2E ' + Date.now();
  await page.locator('#pub-title-input').fill(title);
  await page.locator('#pub-handle-input').fill('tester');
  await page.locator('#pub-submit').click();

  // Real cc65 build + 60-frame preview + upload — allow time.
  await expect(page.locator('#pub-status')).toContainText('Published', { timeout: 30000 });

  // It appears in the server's gallery list.
  const found = await page.evaluate(async (t) => {
    const r = await fetch('/gallery/list');
    const d = await r.json();
    const items = d.items || d.games || d || [];
    return JSON.stringify(items).includes(t);
  }, title);
  expect(found).toBe(true);
});
