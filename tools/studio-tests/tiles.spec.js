// TILES mode — the 8×8 tile primitive (Phase 2).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('#level-select').selectOption('maker'); // TILES is Maker-level
  await page.locator('.mode-btn[data-mode="tiles"]').click();
});

test('shows a 256-tile bank grid and tile ops', async ({ page }) => {
  await expect(page.locator('.tile-grid .tile-cell')).toHaveCount(256);
  await expect(page.locator('.btn', { hasText: 'Flip H' })).toBeVisible();
  await expect(page.locator('.btn', { hasText: 'Rotate' })).toBeVisible();
});

test('painting on the TV edits the selected tile, and shared refs update', async ({ page }) => {
  // Select tile 1 (the ground tile, referenced by the floor).
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  const beforeRefs = await page.evaluate(() => {
    const s = window.Studio.getState();
    // Ground tile is used across the floor; snapshot its pixels.
    return JSON.stringify(s.bg_tiles[1].pixels);
  });
  // Pen value 2 (rare in the ground tile) drawn across the middle row.
  await page.locator('.swatch-row .swatch').nth(2).click();
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, { steps: 8 });
  await page.mouse.up();
  const afterRefs = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  expect(afterRefs).not.toEqual(beforeRefs);
});

test('Flip H mirrors the tile and is undoable', async ({ page }) => {
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  const before = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  await page.locator('.btn', { hasText: 'Flip H' }).click();
  const flipped = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  expect(flipped).not.toEqual(before);
  await page.evaluate(() => window.Studio.undo());
  const restored = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles[1].pixels));
  expect(restored).toEqual(before);
});

test('bank toggle switches to the sprite pattern table', async ({ page }) => {
  await page.locator('.btn', { hasText: 'Sprite' }).click();
  const bank = await page.evaluate(() => window.StudioModes.tiles._get().bank);
  expect(bank).toBe('sprite');
  await expect(page.locator('.dock-section .title', { hasText: 'Sprite tiles' })).toBeVisible();
});

test('reference-rewriting swap moves a tile without changing the picture', async ({ page }) => {
  // The starter floor uses BG tile 1. Swap it into empty slot 50.
  const res = await page.evaluate(() => {
    const s = window.Studio.getState();
    const groundPixels = JSON.stringify(s.bg_tiles[1].pixels);
    // A known ground cell references tile 1 before the swap.
    const nt = s.backgrounds[0].nametable;
    const beforeCell = nt[28][0].tile;
    window.StudioModes.tiles._set({ bank: 'bg' });
    window.StudioModes.tiles._swap(1, 50);
    const s2 = window.Studio.getState();
    return {
      beforeCell,
      afterCell: s2.backgrounds[0].nametable[28][0].tile,
      slot50: JSON.stringify(s2.bg_tiles[50].pixels),
      groundPixels,
    };
  });
  expect(res.beforeCell).toBe(1);
  // The reference followed the data into slot 50 → picture unchanged.
  expect(res.afterCell).toBe(50);
  expect(res.slot50).toEqual(res.groundPixels);
});

test('CHARS "Edit tiles" jumps into TILES focused on the sprite tile (2.4)', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.locator('.btn', { hasText: 'Edit these tiles' }).click();
  const mode = await page.evaluate(() => window.Studio.getMode());
  expect(mode).toBe('tiles');
  const g = await page.evaluate(() => window.StudioModes.tiles._get());
  expect(g.bank).toBe('sprite');
  expect(g.selIdx).toBe(1); // the starter hero's first tile
});

test('dialogue reserves the glyph tile slots in TILES (2.6)', async ({ page }) => {
  // Ensure dialogue is OFF first (the sample starter may enable it) → nothing reserved.
  await page.evaluate(() => { window.Studio.getState().builder.modules.dialogue.enabled = false; });
  await page.locator('.mode-btn[data-mode="tiles"]').click();
  await expect(page.locator('.tile-cell.reserved')).toHaveCount(0);
  // Turn dialogue on and re-render.
  await page.evaluate(() => {
    const s = window.Studio.getState();
    s.builder.modules.dialogue.enabled = true;
  });
  await page.locator('.mode-btn[data-mode="tiles"]').click();
  // space + 0-9 + A-Z + a-z = 1 + 10 + 26 + 26 = 63 reserved slots.
  await expect(page.locator('.tile-cell.reserved')).toHaveCount(63);
  await expect(page.locator('.dock-note', { hasText: 'reserved for text glyphs' })).toBeVisible();
  // Sprite bank is unaffected (glyphs live in the BG pattern table).
  await page.locator('.btn', { hasText: 'Sprite' }).click();
  await expect(page.locator('.tile-cell.reserved')).toHaveCount(0);
});

test('[ and ] step the selected tile', async ({ page }) => {
  await page.locator('.tile-grid .tile-cell').nth(5).click();
  await page.locator('#tv-canvas').hover();
  await page.keyboard.press(']');
  expect(await page.evaluate(() => window.StudioModes.tiles._get().selIdx)).toBe(6);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  expect(await page.evaluate(() => window.StudioModes.tiles._get().selIdx)).toBe(4);
});
