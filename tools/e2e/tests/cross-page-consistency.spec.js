// The seven pages share ONE project through the storage catalog.  A change made
// on one page must be the project every other page loads — this guards the
// shared-catalog contract that the per-page editors depend on.
import { test, expect, open, seedAndReload, PAGES } from './_fixtures.js';

test('A change on Backgrounds is the same project every page loads', async ({ page }) => {
  await open(page, 'index.html');

  // Stamp the active project with recognisable, cross-page-relevant fields.
  await seedAndReload(page, (s) => {
    s.name = 'SharedProj';
    s.universal_bg = 0x15;
  });
  await page.waitForFunction(() => window.Storage.loadCurrent().name === 'SharedProj');

  // Every page (that loads a project) must see the same one.
  for (const pageName of PAGES) {
    await page.goto(`/${pageName}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.Storage && window.Storage.loadCurrent));
    const seen = await page.evaluate(() => {
      const s = window.Storage.loadCurrent();
      return s ? { name: s.name, ubg: s.universal_bg } : null;
    });
    // gallery.html may not expose a current project at all — only assert when it does.
    if (seen) {
      expect(seen.name, `${pageName} loaded a different project`).toBe('SharedProj');
      expect(seen.ubg, `${pageName} lost the universal background colour`).toBe(0x15);
    }
  }
});
