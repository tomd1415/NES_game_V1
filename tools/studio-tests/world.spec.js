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

test('WORLD dock shows backgrounds, palette and tiles at Beginner', async ({ page }) => {
  await expect(page.locator('.dock-section .title', { hasText: 'Backgrounds' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Paint colour' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Tiles' })).toBeVisible();
  // 64 tile-picker cells.
  await expect(page.locator('.tile-grid .tile-cell')).toHaveCount(64);
  // Tile type + Selection are Maker-level (finer disclosure, 1.7).
  await expect(page.locator('.dock-section .title', { hasText: 'Tile type' })).toHaveCount(0);
  await expect(page.locator('.dock-section .title', { hasText: 'Selection' })).toHaveCount(0);
});

test('Tile type + Selection reveal at Maker (finer gating 1.7)', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await expect(page.locator('.dock-section .title', { hasText: 'Tile type' })).toBeVisible();
  await expect(page.locator('.dock-section .title', { hasText: 'Selection' })).toBeVisible();
  // The ⛰ Type and ▦ Select tools appear only after More tools, at Maker.
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await expect(page.locator('.stage-toolbar .tool[data-tool="type"]')).toBeVisible();
  await expect(page.locator('.stage-toolbar .tool[data-tool="select"]')).toBeVisible();
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
  await page.locator('#level-select').selectOption('maker'); // Type tool is Maker+
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

// Helper: drag the TV from one cell to another (for the Select tool).
async function dragCells(page, x0, y0, x1, y1) {
  const box = await page.locator('#tv-canvas').boundingBox();
  const px = (cx) => box.x + (cx + 0.5) * (box.width / 32);
  const py = (cy) => box.y + (cy + 0.5) * (box.height / 30);
  await page.mouse.move(px(x0), py(y0));
  await page.mouse.down();
  await page.mouse.move(px(x1), py(y1), { steps: 5 });
  await page.mouse.up();
}

test('region select → copy → paste duplicates a chunk of the level', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker'); // Select tool is Maker+
  // Lay down two known tiles.
  await page.locator('.stage-toolbar .tool[data-tool="stamp"]').click();
  await page.locator('.tile-grid .tile-cell').nth(1).click();
  await clickCell(page, 5, 3);
  await page.locator('.tile-grid .tile-cell').nth(2).click();
  await clickCell(page, 6, 3);

  // Select tool → marquee over (5,3)-(6,3).
  await page.locator('.stage-toolbar .more-tools-btn').click();
  await page.locator('.stage-toolbar .tool[data-tool="select"]').click();
  await dragCells(page, 5, 3, 6, 3);
  await page.locator('.btn', { hasText: 'Copy' }).click();
  const clip = await page.evaluate(() => window.StudioModes.world._get().clipboard);
  expect(clip.length).toBe(1);
  expect(clip[0].map((c) => c.tile)).toEqual([1, 2]);

  // Select a destination anchor at (5,10) and paste.
  await dragCells(page, 5, 10, 5, 10);
  await page.locator('.btn', { hasText: 'Paste' }).click();
  const pasted = await page.evaluate(() => {
    const s = window.Studio.getState();
    const nt = s.backgrounds[s.selectedBgIdx].nametable;
    return [nt[10][5].tile, nt[10][6].tile];
  });
  expect(pasted).toEqual([1, 2]);
});

test('attribute conflict in a 2×2 chunk is detected and warned (2.5)', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  // Clean starter → no conflicts.
  expect(await page.evaluate(() => window.StudioModes.world._conflicts())).toBe(0);
  // Force two different palettes inside one 2×2 chunk (cells (0,0) and (1,0)).
  await page.evaluate(() => {
    const s = window.Studio.getState();
    const nt = s.backgrounds[s.selectedBgIdx].nametable;
    nt[0][0].palette = 0;
    nt[0][1].palette = 2;
  });
  await page.locator('.mode-btn[data-mode="world"]').click(); // force a dock re-render
  expect(await page.evaluate(() => window.StudioModes.world._conflicts())).toBe(1);
  await expect(page.locator('.dock-note', { hasText: 'mix two palettes' })).toBeVisible();
});

test('full-screen preview opens a modal with a canvas', async ({ page }) => {
  await page.locator('.btn', { hasText: 'Full-screen preview' }).click();
  const dlg = page.locator('.modal-backdrop.open');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('canvas')).toBeVisible();
  await dlg.locator('.btn', { hasText: 'Close' }).click();
  await expect(dlg).toHaveCount(0);
});

test('tile-type slots are named for the game type (3.4)', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  // Platformer (starter default): slot 7 reads "Spike", not a generic label.
  await expect(page.locator('.dock-section', { hasText: 'Tile type' }))
    .toContainText('Spike');
  // Switch to racer in RULES → the same slots become checkpoints / finish.
  await page.evaluate(() => {
    window.Studio.getState().builder.modules.game.config.type = 'racer';
  });
  await page.locator('.mode-btn[data-mode="world"]').click(); // re-render dock
  const typeSection = page.locator('.dock-section', { hasText: 'Tile type' });
  await expect(typeSection).toContainText('Checkpoint 1');
  await expect(typeSection).toContainText('Finish line');
  await expect(typeSection).not.toContainText('Spike');
});

test('adding a background switches selection and the picker grows', async ({ page }) => {
  const before = await page.locator('.bg-row').count();
  await page.locator('#world-add-bg').click();
  await expect(page.locator('.bg-row')).toHaveCount(before + 1);
  const sel = await page.evaluate(() => window.Studio.getState().selectedBgIdx);
  expect(sel).toBeGreaterThan(0);
});
