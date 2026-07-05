// Not a test assertion — a convenience "spec" to capture a full-page
// screenshot of the Studio shell for visual review. Run with:
//   npx playwright test tools/studio-tests/screenshot.spec.js
const { test } = require('@playwright/test');

test('capture studio shell screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('advanced'); // show all modes
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/studio-shell.png', fullPage: false });
});

test('capture CHARS + RULES screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('advanced');
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/studio-chars.png' });
  await page.locator('.mode-btn[data-mode="rules"]').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/studio-rules.png' });
  await page.locator('.mode-btn[data-mode="pals"]').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/studio-pals.png' });
});
