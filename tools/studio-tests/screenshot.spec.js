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
