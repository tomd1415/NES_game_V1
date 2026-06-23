// Undo / redo on the Backgrounds page, driven through the real buttons.  The
// undo stack is browser-only state, so the Node harness can't exercise it; this
// guards that an action → undo → redo round-trips the live document.
import { test, expect, open } from './_fixtures.js';

test('Undo and redo round-trip a background duplicate', async ({ page }) => {
  await open(page, 'index.html');

  // One option per background; the project starts with a single background.
  const opts = page.locator('#bg-select option');
  await expect(opts).toHaveCount(1);

  // Duplicate → 2 backgrounds (pushes an undo entry).
  await page.locator('#btn-bg-dup').click();
  await expect(opts).toHaveCount(2);

  // Undo → back to 1.
  await expect(page.locator('#btn-undo')).toBeEnabled();
  await page.locator('#btn-undo').click();
  await expect(opts).toHaveCount(1);

  // Redo → back to 2.
  await expect(page.locator('#btn-redo')).toBeEnabled();
  await page.locator('#btn-redo').click();
  await expect(opts).toHaveCount(2);
});
