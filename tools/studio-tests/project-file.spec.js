// Whole-project JSON round-trip (Phase 3.5).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('export → import is lossless', async ({ page }) => {
  // Make the state distinctive first.
  await page.locator('#project-name').fill('Round Trip Test');
  await page.waitForTimeout(400);
  const exported = await page.evaluate(() => window.Studio.exportJson());

  // Import it back and compare the canonical state.
  const ok = await page.evaluate((text) => window.Studio.importText(text), exported);
  expect(ok).toBe(true);
  const reexported = await page.evaluate(() => window.Studio.exportJson());
  expect(JSON.parse(reexported)).toEqual(JSON.parse(exported));
});

test('importing snapshots the current work first (before_import)', async ({ page }) => {
  const exported = await page.evaluate(() => window.Studio.exportJson());
  await page.evaluate((text) => window.Studio.importText(text), exported);
  const reasons = await page.evaluate(() =>
    window.Storage.listSnapshots().map((s) => s.reason));
  expect(reasons).toContain('before_import');
});

test('the Time Machine exposes Save / Open project file', async ({ page }) => {
  await page.locator('#btn-time-machine').click();
  await expect(page.locator('#tm-export')).toBeVisible();
  await expect(page.locator('#tm-import')).toBeVisible();
});

test('importing a distinct project replaces the live state', async ({ page }) => {
  // Build a modified export: rename + change universal_bg.
  const modified = await page.evaluate(() => {
    const s = JSON.parse(window.Studio.exportJson());
    s.name = 'Imported World';
    s.universal_bg = 5;
    return JSON.stringify(s);
  });
  await page.evaluate((text) => window.Studio.importText(text), modified);
  expect(await page.evaluate(() => window.Studio.getState().universal_bg)).toBe(5);
  await expect(page.locator('#project-name')).toHaveValue('Imported World');
});

test('CHR export → import round-trips losslessly (3.5)', async ({ page }) => {
  const before = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles.map((t) => t.pixels)));
  const chr = await page.evaluate(() => Array.from(window.Studio.exportChrBytes()));
  expect(chr.length).toBe(2 * 256 * 16);
  // Corrupt a tile, then re-import the saved CHR.
  await page.evaluate(() => {
    const px = window.Studio.getState().bg_tiles[1].pixels;
    px[0][0] = (px[0][0] + 1) % 4;
  });
  await page.evaluate((bytes) => window.Studio.importChrBytes(new Uint8Array(bytes)), chr);
  const after = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().bg_tiles.map((t) => t.pixels)));
  expect(after).toEqual(before);
});

test('PAL export → import round-trips the palettes (3.5)', async ({ page }) => {
  // Set distinctive palettes.
  await page.evaluate(() => {
    const s = window.Studio.getState();
    s.universal_bg = 0x11;
    s.bg_palettes[1] = { slots: [0x21, 0x22, 0x23] };
    s.sprite_palettes[2] = { slots: [0x14, 0x15, 0x16] };
  });
  const before = await page.evaluate(() => {
    const s = window.Studio.getState();
    return JSON.stringify([s.universal_bg, s.bg_palettes, s.sprite_palettes]);
  });
  const pal = await page.evaluate(() => Array.from(window.Studio.exportPalBytes()));
  expect(pal.length).toBe(32);
  // Corrupt, then re-import.
  await page.evaluate(() => { window.Studio.getState().universal_bg = 0x0F; });
  await page.evaluate((b) => window.Studio.importPalBytes(new Uint8Array(b)), pal);
  const after = await page.evaluate(() => {
    const s = window.Studio.getState();
    return JSON.stringify([s.universal_bg, s.bg_palettes, s.sprite_palettes]);
  });
  expect(after).toEqual(before);
});

test('NAM export → import round-trips the active screen (3.5)', async ({ page }) => {
  // Paint a couple of distinctive cells with a non-zero palette in one chunk.
  await page.evaluate(() => {
    const nt = window.Studio.getState().backgrounds[0].nametable;
    nt[4][4] = { tile: 9, palette: 2 };
    nt[4][5] = { tile: 9, palette: 2 };
    nt[5][4] = { tile: 9, palette: 2 };
    nt[5][5] = { tile: 9, palette: 2 };
  });
  const before = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().backgrounds[0].nametable));
  const nam = await page.evaluate(() => Array.from(window.Studio.exportNamBytes()));
  expect(nam.length).toBe(1024);
  // Corrupt a tile, re-import.
  await page.evaluate(() => { window.Studio.getState().backgrounds[0].nametable[4][4].tile = 0; });
  await page.evaluate((b) => window.Studio.importNamBytes(new Uint8Array(b)), nam);
  const after = await page.evaluate(() =>
    JSON.stringify(window.Studio.getState().backgrounds[0].nametable));
  expect(after).toEqual(before);
});
