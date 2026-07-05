// Old-page "try the new Studio" promo banner (studio-promo.js).
const { test, expect } = require('@playwright/test');

test('old pages show a dismissible Studio promo that persists dismissal', async ({ page }) => {
  await page.goto('/index.html');
  const promo = page.locator('#studio-promo');
  await expect(promo).toBeVisible();
  await expect(promo.locator('a[href="studio.html"]')).toBeVisible();
  await expect(promo).toContainText('testing build');

  // Dismiss → gone, and stays gone across a reload (localStorage).
  // Fire the handler directly: index.html repaints constantly, so a
  // coordinate-based click can't settle — we're verifying the dismissal
  // logic, not pixel-stability. (The banner is z-index 99999, above the
  // page's own z-index-100 chrome, so real users can click it fine.)
  await page.locator('#studio-promo-dismiss').dispatchEvent('click');
  await expect(promo).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#studio-promo')).toHaveCount(0);
});

test('the Studio itself never shows the promo', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await expect(page.locator('#studio-promo')).toHaveCount(0);
});
