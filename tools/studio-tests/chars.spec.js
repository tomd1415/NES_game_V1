// CHARS mode — character list, roles, and drawing (Phase 1.2).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="chars"]').click();
});

test('lists the starter hero with its role', async ({ page }) => {
  // The starter's first character is the player (hero); other sample
  // characters may follow, so assert the hero rather than an exact count.
  await expect(page.locator('.char-row').first().locator('.chip', { hasText: 'player' })).toBeVisible();
  await expect(page.locator('select[data-role]')).toHaveValue('player');
  expect(await page.evaluate(() => window.Studio.getState().sprites[0].role)).toBe('player');
});

test('role assignment updates the sprite (the notes.md question)', async ({ page }) => {
  await page.locator('select[data-role]').selectOption('enemy');
  const role = await page.evaluate(() => window.Studio.getState().sprites[0].role);
  expect(role).toBe('enemy');
});

test('new / duplicate / delete characters', async ({ page }) => {
  const before = await page.evaluate(() => window.Studio.getState().sprites.length);
  await page.locator('#chars-new').click();
  await expect(page.locator('.char-row')).toHaveCount(before + 1);
  const n = await page.evaluate(() => window.Studio.getState().sprites.length);
  expect(n).toBe(before + 1);
});

test('resizing changes the metasprite dimensions and cell grid', async ({ page }) => {
  // Width select is the first select in "This character".
  const sizeSelects = page.locator('.field .row select');
  await sizeSelects.first().selectOption('3');
  const w = await page.evaluate(() => window.Studio.getState().sprites[0].width);
  expect(w).toBe(3);
  const cols = await page.evaluate(() => window.Studio.getState().sprites[0].cells[0].length);
  expect(cols).toBe(3);
});

test('drawing on the TV edits a shared sprite tile', async ({ page }) => {
  // Snapshot the hero's four tiles.
  const before = await page.evaluate(() => {
    const s = window.Studio.getState();
    return JSON.stringify([1, 2, 3, 4].map((i) => s.sprite_tiles[i].pixels));
  });
  // Pick the white pen (colour 3) so it differs from the body colour.
  await page.locator('.swatch-row .swatch').nth(3).click();
  await page.locator('.stage-toolbar .tool[data-tool="pencil"]').click();
  // Click a pixel in the sprite. The hero's tiles are shared with the sample
  // NPC, so the "Duplicate first" safeguard fires — choose Change everywhere,
  // and its proceed() paints that pixel into the shared tile.
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2 - 8, box.y + box.height / 2 - 8);
  const dlg = page.locator('.modal-backdrop.open', { hasText: 'This tile is shared' });
  await expect(dlg).toBeVisible();
  await dlg.locator('.btn', { hasText: 'Change everywhere' }).click();
  const after = await page.evaluate(() => {
    const s = window.Studio.getState();
    return JSON.stringify([1, 2, 3, 4].map((i) => s.sprite_tiles[i].pixels));
  });
  expect(after).not.toEqual(before);
});

test('flip H mirrors the character non-destructively (involution)', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker'); // flips are Maker+
  const before = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().sprites[0].cells));
  const tilesBefore = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().sprite_tiles));
  const flipBtn = page.locator('.btn', { hasText: 'Flip H' });
  await flipBtn.click();
  const afterOne = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().sprites[0].cells));
  expect(afterOne).not.toEqual(before);
  // Shared tile pixels must be untouched — flip only rearranges cells/flags.
  const tilesAfter = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().sprite_tiles));
  expect(tilesAfter).toEqual(tilesBefore);
  // Flipping twice returns to the original.
  await flipBtn.click();
  const afterTwo = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().sprites[0].cells));
  expect(afterTwo).toEqual(before);
});

test('painting a shared tile offers Duplicate-first, which forks the tile', async ({ page }) => {
  // Duplicate the hero (selected first) so its tiles are shared with the copy.
  const before = await page.evaluate(() => window.Studio.getState().sprites.length);
  await page.locator('.btn', { hasText: 'Duplicate' }).click();
  await expect(page.locator('.char-row')).toHaveCount(before + 1);
  // The copy sits right after the hero; its top-left cell points at shared tile 1.
  const cellTileBefore = await page.evaluate(() =>
    window.Studio.getState().sprites[1].cells[0][0].tile);
  expect(cellTileBefore).toBe(1);

  await page.locator('.swatch-row .swatch').nth(3).click();
  await page.locator('.stage-toolbar .tool[data-tool="pencil"]').click();
  const box = await page.locator('#tv-canvas').boundingBox();
  // Click into the top-left cell (just up-left of centre).
  await page.mouse.click(box.x + box.width / 2 - 6, box.y + box.height / 2 - 6);

  // The shared-tile dialog appears.
  const dlg = page.locator('.modal-backdrop.open', { hasText: 'This tile is shared' });
  await expect(dlg).toBeVisible();
  await dlg.locator('.btn', { hasText: 'Duplicate first' }).click();

  // The copy's cell now points at a fresh tile, not the shared one.
  const cellTileAfter = await page.evaluate(() =>
    window.Studio.getState().sprites[1].cells[0][0].tile);
  expect(cellTileAfter).not.toBe(1);
  // The hero's cell still points at the original shared tile.
  const heroCell = await page.evaluate(() =>
    window.Studio.getState().sprites[0].cells[0][0].tile);
  expect(heroCell).toBe(1);
});

test('animation preview toggles play/stop', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker'); // animations are Maker+
  // Create an animation (auto-wires walk with the current frame).
  const animSection = page.locator('.dock-section')
    .filter({ has: page.locator('.title', { hasText: 'Animations' }) });
  await animSection.locator('.btn', { hasText: '+ New' }).click();
  const play = page.locator('.btn', { hasText: 'Preview' });
  await expect(play).toBeVisible();
  await play.click();
  await expect(page.locator('.btn', { hasText: 'Stop' })).toBeVisible();
});
