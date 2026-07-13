// #20 — the Sprite-reactions editor is cramped in the narrow dock. An "⤢ Expand"
// button opens a WIDE matrix (every character × every tile) in a modal, editable
// in place. Guards that the button opens the matrix and edits write through.
const { test, expect } = require('@playwright/test');

test('#20 sprite reactions: Expand opens a wide matrix that edits reactions', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker');   // reactions card is maker-level
  await page.locator('.mode-btn[data-mode="rules"]').click();

  // Expand → a wide modal with the reactions matrix.
  await page.locator('#react-expand').click();
  const modal = page.locator('.modal.wide');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.react-matrix')).toBeVisible();

  const cells = modal.locator('.react-matrix td select');
  expect(await cells.count()).toBeGreaterThan(0);

  // Editing a cell writes through to behaviour_reactions.
  const first = cells.first();
  const info = await first.evaluate((el) => ({ sprite: el.getAttribute('data-mx-sprite'), type: el.getAttribute('data-mx-type') }));
  await first.selectOption('bounce');
  const val = await page.evaluate((info) => window.Studio.getState().behaviour_reactions[+info.sprite][info.type], info);
  expect(val).toBe('bounce');
});
