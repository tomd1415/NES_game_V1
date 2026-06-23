// Regression for recently-observed-bugs item 18: duplicating a sprite must
// allocate FRESH tile slots and copy the pixels, not share the original's
// `state.sprite_tiles[idx]` entries (editing the copy used to silently edit the
// original).  `run-all.mjs` only source-text-guards this ("a behavioural test
// would need a JSDOM harness which the project doesn't currently have") — this
// is that behavioural test.
import { test, expect, open, seedAndReload } from './_fixtures.js';

test('Duplicating a sprite clones its tiles into fresh slots (item 18)', async ({ page }) => {
  await open(page, 'sprites.html');

  // Seed one 1×1 sprite whose only cell uses tile #5, and paint tile #5 with a
  // recognisable row of palette-colour-1 pixels.
  await seedAndReload(page, (s) => {
    const distinctive = [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    s.sprite_tiles[5] = { name: '', pixels: distinctive };
    s.sprites = [{
      name: 'hero', role: 'other', width: 1, height: 1,
      cells: [[{ tile: 5, palette: 0, flipH: false, flipV: false, priority: false, empty: false }]],
    }];
  });
  await page.waitForFunction(() => (window.Storage.loadCurrent().sprites || []).length === 1);

  // sprite0 is the only sprite, so it's selected by default. Duplicate it.
  await page.locator('#btn-sprite-dup').click();
  await page.waitForFunction(() => (window.Storage.loadCurrent().sprites || []).length === 2);

  const r = await page.evaluate(() => {
    const s = window.Storage.loadCurrent();
    const a = s.sprites[0].cells[0][0].tile;   // original tile index
    const b = s.sprites[1].cells[0][0].tile;   // copy's tile index
    return {
      origTile: a,
      copyTile: b,
      samePixels: JSON.stringify(s.sprite_tiles[a].pixels) === JSON.stringify(s.sprite_tiles[b].pixels),
    };
  });

  // The copy must point at a DIFFERENT tile slot (no sharing)…
  expect(r.copyTile, 'duplicate must use a fresh tile slot, not the original\'s').not.toBe(r.origTile);
  // …whose pixels were copied from the original.
  expect(r.samePixels, 'duplicate\'s fresh tile should contain a copy of the original pixels').toBe(true);
});
