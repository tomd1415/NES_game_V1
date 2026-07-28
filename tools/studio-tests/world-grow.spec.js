// WORLD grow-a-screen arrows (feedback #10 — scroll beyond 2 screens). Clicking
// ◀▶▲▼ "Add a screen" grows the level one screen in that direction; ▶/▼ extend
// (append), ◀/▲ push the level over (prepend + shift stored world coords).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="world"]').click();
});

const RIGHT = 'button[title^="Add a screen to the right"]';
const LEFT = 'button[title^="Add a screen to the left"]';
const DOWN = 'button[title^="Add a screen to the down"]';

test('grow right appends a screen and widens the nametable', async ({ page }) => {
  const before = await page.evaluate(() => {
    const bg = window.Studio.getState().backgrounds[0];
    return { sx: bg.dimensions.screens_x | 0 || 1, cols: bg.nametable[0].length };
  });
  await page.locator(RIGHT).click();
  const after = await page.evaluate(() => {
    const bg = window.Studio.getState().backgrounds[0];
    return { sx: bg.dimensions.screens_x, cols: bg.nametable[0].length, bcols: bg.behaviour[0].length, rows: bg.nametable.length };
  });
  expect(after.sx).toBe(before.sx + 1);
  expect(after.cols).toBe(after.sx * 32);          // nametable widened
  expect(after.bcols).toBe(after.sx * 32);         // behaviour grid kept in sync
  expect(after.rows).toBe(30);                     // still 1 screen tall
});

test('grow right builds a wide level (compression territory)', async ({ page }) => {
  for (let i = 0; i < 8; i++) await page.locator(RIGHT).click();   // -> ~9 screens
  const r = await page.evaluate(() => {
    const bg = window.Studio.getState().backgrounds[0];
    return { sx: bg.dimensions.screens_x, cols: bg.nametable[0].length };
  });
  expect(r.sx).toBeGreaterThanOrEqual(9);          // past the 8-screen raw cap
  expect(r.cols).toBe(r.sx * 32);
});

test('grow left prepends a screen and shifts existing art + player start', async ({ page }) => {
  await page.evaluate(() => {
    const s = window.Studio.getState();
    const bg = s.backgrounds[s.selectedBgIdx || 0];
    bg.nametable[10][3] = { tile: 7, palette: 0 };   // a marker at world col 3
    s.builder.modules.players.submodules.player1.config.startX = 40;
  });
  await page.locator(LEFT).click();
  const r = await page.evaluate(() => {
    const s = window.Studio.getState();
    const bg = s.backgrounds[s.selectedBgIdx || 0];
    return {
      sx: bg.dimensions.screens_x,
      at35: (bg.nametable[10][35] || {}).tile,
      at3: (bg.nametable[10][3] || {}).tile,
      startX: s.builder.modules.players.submodules.player1.config.startX,
    };
  });
  expect(r.sx).toBe(2);
  expect(r.at35).toBe(7);              // the marker moved right by one screen (32 tiles)
  expect(r.at3).toBe(0);               // the new leftmost screen is blank
  expect(r.startX).toBe(40 + 32 * 8);  // player start shifted by one screen (256 px)
});

test('wide growth is capped at 12 screens', async ({ page }) => {
  for (let i = 0; i < 15; i++) {
    const btn = page.locator(RIGHT);
    if (await btn.isDisabled()) break;
    await btn.click();
  }
  const sx = await page.evaluate(() => window.Studio.getState().backgrounds[0].dimensions.screens_x);
  expect(sx).toBe(12);
  await expect(page.locator(RIGHT)).toBeDisabled();
});

test('tall growth stays capped at 2 screens', async ({ page }) => {
  await page.locator(DOWN).click();                // 1 -> 2 tall
  const sy1 = await page.evaluate(() => window.Studio.getState().backgrounds[0].dimensions.screens_y);
  expect(sy1).toBe(2);
  await expect(page.locator(DOWN)).toBeDisabled(); // can't go past 2 tall
});
