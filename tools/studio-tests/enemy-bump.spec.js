// STYLE mode — "Enemies bump into each other" (feedback #30, engine v77).
//
// The codegen and ROM behaviour are covered by tools/builder-tests/enemy-bump.mjs.
// What only a real browser can prove is that a pupil can actually reach the
// setting: it has to be on the Style tab for EVERY game type (enemies exist in
// all of them), it has to write through to state, and it has to survive undo and
// a reload — a toggle that silently forgets is worse than no toggle.
const { test, expect } = require('@playwright/test');

// Match on the section's own .title, not hasText: the "Movement & jump" section's
// gravity help mentions "the enemies", and hasText is a case-insensitive substring
// match, so a looser locator lands on that section's bob checkbox instead.
const bumpSection = (page) => page.locator('.dock-section:has(> .title:text-is("Enemies"))');
const bumpBox = (page) => bumpSection(page).locator('input[type=checkbox]').first();
const readBump = (page) => page.evaluate(() => {
  const m = window.Studio.getState().builder.modules;
  return m.globals && m.globals.config ? !!m.globals.config.enemyBump : null;
});

test('the enemy-bump toggle is on Style for every game type and writes through to state', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="style"]').click();

  // Default platformer: present and OFF (the byte-identical baseline).
  await expect(bumpSection(page)).toBeVisible();
  await expect(bumpBox(page)).not.toBeChecked();

  // Ticking it writes through to the globals module the emitter reads.
  await bumpBox(page).check();
  expect(await readBump(page)).toBe(true);

  // Enemies exist in every game type, so the setting must survive a type switch
  // rather than being stranded on the platformer screen.
  // Exact-text on the card's own label div: the Racer card's subtitle reads
  // "top-down track", so a hasText:'Top-down' would match two cards.
  for (const type of ['SMB platformer', 'Racer', 'Top-down']) {
    await page.locator(`.style-card:has(div:text-is("${type}"))`).click();
    await expect(bumpSection(page)).toBeVisible();
    await expect(bumpBox(page)).toBeChecked();
    expect(await readBump(page)).toBe(true);
  }
});

test('the enemy-bump toggle survives undo and a reload', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="style"]').click();

  await bumpBox(page).check();
  expect(await readBump(page)).toBe(true);

  // It pushes an undo step like every other Style field.  The dock is not
  // re-rendered on undo (nor is it for the neighbouring bob checkbox), so bounce
  // through another mode to force a fresh render — which also checks the box
  // reads its state back rather than remembering its own DOM.
  await page.evaluate(() => window.Studio.undo && window.Studio.undo());
  expect(await readBump(page)).toBe(false);
  await page.locator('.mode-btn[data-mode="rules"]').click();
  await page.locator('.mode-btn[data-mode="style"]').click();
  await expect(bumpBox(page)).not.toBeChecked();

  await bumpBox(page).check();
  expect(await readBump(page)).toBe(true);

  // Persisted, not just held in the live object.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="style"]').click();
  await expect(bumpBox(page)).toBeChecked();
  expect(await readBump(page)).toBe(true);
});
