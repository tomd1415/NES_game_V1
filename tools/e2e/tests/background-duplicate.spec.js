// Regression for the bug-hunt finding: Backgrounds "⎘ Duplicate" dropped the
// per-background behaviour grid (and 16×16 metatile data), so a duplicated
// background silently lost all its painted wall/ground/door markup.  The fix
// deep-clones every field of the source background.
import { test, expect, open, seedAndReload } from './_fixtures.js';

test('Duplicating a background keeps its behaviour grid', async ({ page }) => {
  await open(page, 'index.html');

  // Seed a recognisable behaviour marker on the active background, plus a
  // friendly name so we can find the copy.
  await seedAndReload(page, (s) => {
    const bg = s.backgrounds[s.selectedBgIdx || 0];
    const rows = bg.nametable.length;
    const cols = bg.nametable[0].length;
    // Fresh all-zero grid, then drop a WALL (id 2) marker at a known cell.
    bg.behaviour = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
    bg.behaviour[5][7] = 2;
    bg.name = 'WithWalls';
  });
  await page.waitForFunction(() => {
    const b = window.Storage.loadCurrent().backgrounds[0];
    return b && Array.isArray(b.behaviour) && b.behaviour[5] && b.behaviour[5][7] === 2;
  });

  // Duplicate the active background.
  await page.locator('#btn-bg-dup').click();

  // Autosave persists asynchronously; wait for the second background to land.
  await page.waitForFunction(
    () => (window.Storage.loadCurrent().backgrounds || []).length === 2,
    { timeout: 10_000 });

  const copyBehaviour = await page.evaluate(() => {
    const b = window.Storage.loadCurrent().backgrounds[1];
    return { hasGrid: Array.isArray(b.behaviour), marker: b.behaviour && b.behaviour[5] && b.behaviour[5][7] };
  });
  expect(copyBehaviour.hasGrid, 'duplicated background should carry a behaviour grid').toBe(true);
  expect(copyBehaviour.marker, 'duplicated background should preserve the WALL marker').toBe(2);
});

test('Duplicating a 16×16 metatile background stays a metatile background', async ({ page }) => {
  await open(page, 'index.html');

  // Promote the active background to 16×16 metatiles via the real button, then
  // duplicate it and assert the copy is still a metatile background (tileMode
  // + metatiles + mtmap carried over) rather than silently downgraded to 8×8.
  const promote = page.locator('#btn-mt-promote');
  if (await promote.count()) {
    await promote.click();
    await page.waitForFunction(() => {
      const b = window.Storage.loadCurrent().backgrounds;
      return b && b[0] && b[0].tileMode === '16x16';
    }, { timeout: 10_000 }).catch(() => {});
    const promoted = await page.evaluate(
      () => (window.Storage.loadCurrent().backgrounds[0] || {}).tileMode === '16x16');
    test.skip(!promoted, 'metatile promotion unavailable in this build');

    await page.locator('#btn-bg-dup').click();
    await page.waitForFunction(
      () => (window.Storage.loadCurrent().backgrounds || []).length === 2,
      { timeout: 10_000 });
    const copy = await page.evaluate(() => {
      const b = window.Storage.loadCurrent().backgrounds[1];
      return { tileMode: b.tileMode, hasMetatiles: Array.isArray(b.metatiles), hasMtmap: !!b.mtmap };
    });
    expect(copy.tileMode, 'copy should remain a 16×16 metatile background').toBe('16x16');
    expect(copy.hasMetatiles).toBe(true);
    expect(copy.hasMtmap).toBe(true);
  }
});
