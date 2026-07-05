// WORLD mode — painting onto the live TV (Phase 1.1).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

// Helper: click the TV canvas at a given 8×8 cell.
async function clickCell(page, cx, cy) {
  const box = await page.locator('#tv-canvas').boundingBox();
  const x = box.x + (cx + 0.5) * (box.width / 32);
  const y = box.y + (cy + 0.5) * (box.height / 30);
  await page.mouse.click(x, y);
}

test('WORLD dock shows backgrounds, palette, tiles and types', async ({ page }) => {
  await expect(page.locator('.dock-section .title', { hasText: 'Backgrounds' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Paint colour' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Tiles' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Tile type' })).toBeVisible();
  // 64 tile-picker cells.
  await expect(page.locator('.tile-grid .tile-cell')).toHaveCount(64);
});

test('stamping a tile onto the TV changes the nametable', async ({ page }) => {
  // Select stamp tool + tile 1 (the ground tile).
  await page.locator('.stage-toolbar .tool[data-tool="stamp"]').click();
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  // Paint an empty sky cell near the top.
  await clickCell(page, 5, 3);
  const t = await page.evaluate(() => {
    const s = window.Studio.getState();
    return s.backgrounds[s.selectedBgIdx].nametable[3][5].tile;
  });
  expect(t).toBe(1);
});

test('erase clears a painted cell and undo restores it', async ({ page }) => {
  await page.locator('.stage-toolbar .tool[data-tool="stamp"]').click();
  await page.locator('.tile-grid .tile-cell').nth(2).click();
  await clickCell(page, 6, 4);
  expect(await page.evaluate(() => {
    const s = window.Studio.getState(); return s.backgrounds[s.selectedBgIdx].nametable[4][6].tile;
  })).toBe(2);

  // Erase it (reveal "More tools" first).
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="erase"]').click();
  await clickCell(page, 6, 4);
  expect(await page.evaluate(() => {
    const s = window.Studio.getState(); return s.backgrounds[s.selectedBgIdx].nametable[4][6].tile;
  })).toBe(0);

  // Undo the erase.
  await page.evaluate(() => window.Studio.undo());
  expect(await page.evaluate(() => {
    const s = window.Studio.getState(); return s.backgrounds[s.selectedBgIdx].nametable[4][6].tile;
  })).toBe(2);
});

test('Colour tool paints a whole 2×2 attribute quadrant', async ({ page }) => {
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="palette"]').click();
  // Select BG palette 2.
  await page.locator('.pal-strip', { hasText: 'BG 2' }).click();
  // Paint at cell (8,8) → quadrant (8..9, 8..9) all become palette 2.
  await clickCell(page, 9, 9);
  const pals = await page.evaluate(() => {
    const s = window.Studio.getState();
    const nt = s.backgrounds[s.selectedBgIdx].nametable;
    return [nt[8][8].palette, nt[8][9].palette, nt[9][8].palette, nt[9][9].palette];
  });
  expect(pals).toEqual([2, 2, 2, 2]);
});

test('Type tool paints the behaviour map', async ({ page }) => {
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="type"]').click();
  // Pick "Platform" (id 3).
  await page.locator('.entity-row', { hasText: 'Platform' }).click();
  await clickCell(page, 10, 15);
  const b = await page.evaluate(() => {
    const s = window.Studio.getState();
    return s.backgrounds[s.selectedBgIdx].behaviour[15][10];
  });
  expect(b).toBe(3);
});

test('adding a background switches selection and the picker grows', async ({ page }) => {
  const before = await page.locator('.bg-row').count();
  await page.locator('#world-add-bg').click();
  await expect(page.locator('.bg-row')).toHaveCount(before + 1);
  const sel = await page.evaluate(() => window.Studio.getState().selectedBgIdx);
  expect(sel).toBeGreaterThan(0);
});
