// CHARS marquee region select — copy/paste + rotate/flip/scale/clear over a
// dragged selection (Phase 1 sprites.html parity). The pixel ops are driven
// through the mode's headless `_test` hook (pointer drags aren't needed to
// exercise the transforms); gating is checked through the real DOM.
//
// Each op test first zeroes an 8×8 patch (cell 0,0) so it's independent of any
// localStorage-persisted sprite from a prior test.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('marquee Selection panel + ▦ Select tool are Maker-gated', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  // Beginner (default): no Selection panel.
  await expect(page.locator('.dock-section .title', { hasText: 'Selection' })).toHaveCount(0);
  // Maker reveals it.
  await page.locator('#level-select').selectOption('maker');
  await expect(page.locator('.dock-section .title', { hasText: 'Selection' })).toBeVisible();
});

test('copy/paste round-trips a region', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="chars"]').click();
  const r = await page.evaluate(() => {
    const T = window.StudioModes.chars._test;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) T.set(x, y, 0);
    T.set(0, 0, 1); T.set(1, 0, 1); T.set(0, 1, 1); T.set(1, 1, 1); // 2×2 block
    T.setSel(0, 0, 1, 1); T.copy();
    T.setSel(4, 4, 5, 5); T.paste();
    return [T.get(4, 4), T.get(5, 4), T.get(4, 5), T.get(5, 5), T.get(3, 3)];
  });
  expect(r).toEqual([1, 1, 1, 1, 0]); // pasted block present, elsewhere untouched
});

test('flip H mirrors the region horizontally', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  const r = await page.evaluate(() => {
    const T = window.StudioModes.chars._test;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) T.set(x, y, 0);
    T.set(0, 0, 1); T.set(1, 0, 2); T.set(2, 0, 3);
    T.setSel(0, 0, 2, 0); T.flip('h');
    return [T.get(0, 0), T.get(1, 0), T.get(2, 0)];
  });
  expect(r).toEqual([3, 2, 1]);
});

test('rotate CW turns a 3-wide row into a 3-tall column + clears the old footprint', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  const r = await page.evaluate(() => {
    const T = window.StudioModes.chars._test;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) T.set(x, y, 0);
    T.set(0, 0, 1); T.set(1, 0, 2); T.set(2, 0, 3);
    T.setSel(0, 0, 2, 0); T.rotate('cw');
    return { sel: T.selRect(), col: [T.get(0, 0), T.get(0, 1), T.get(0, 2)], oldTail: [T.get(1, 0), T.get(2, 0)] };
  });
  expect(r.sel).toEqual({ x0: 0, y0: 0, x1: 0, y1: 2 }); // 1 wide × 3 tall
  expect(r.col).toEqual([1, 2, 3]);                       // left→right became top→bottom
  expect(r.oldTail).toEqual([0, 0]);                      // L-shaped remainder cleared
});

test('scale ×2 doubles a pixel into a 2×2 block', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  const r = await page.evaluate(() => {
    const T = window.StudioModes.chars._test;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) T.set(x, y, 0);
    T.set(0, 0, 2);
    T.setSel(0, 0, 0, 0); T.scale(2);
    return { sel: T.selRect(), block: [T.get(0, 0), T.get(1, 0), T.get(0, 1), T.get(1, 1)] };
  });
  expect(r.sel).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  expect(r.block).toEqual([2, 2, 2, 2]);
});

test('scale ÷2 halves a 2×2 into 1×1 and clears the tail', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  const r = await page.evaluate(() => {
    const T = window.StudioModes.chars._test;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) T.set(x, y, 0);
    T.set(0, 0, 3); T.set(1, 0, 3); T.set(0, 1, 3); T.set(1, 1, 3);
    T.setSel(0, 0, 1, 1); T.scale(0.5);
    return { sel: T.selRect(), px: T.get(0, 0), tail: [T.get(1, 0), T.get(0, 1), T.get(1, 1)] };
  });
  expect(r.sel).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  expect(r.px).toBe(3);
  expect(r.tail).toEqual([0, 0, 0]);
});

test('dragging the ▦ Select tool on the canvas forms a marquee', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  await page.locator('.mode-btn[data-mode="chars"]').click();
  // ▦ Select lives in the "More tools" popup — reveal it, then activate it.
  await page.locator('.more-tools-btn').click();
  await page.locator('.tool[data-tool="select"]').click();
  // Drag a box across the middle of the paint canvas.
  const box = await page.locator('#tv-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.60, box.y + box.height * 0.60, { steps: 6 });
  await page.mouse.up();
  const sel = await page.evaluate(() => window.StudioModes.chars._get().selRect);
  expect(sel).not.toBeNull();
  expect(sel.x1).toBeGreaterThan(sel.x0); // a real, normalised marquee formed
  expect(sel.y1).toBeGreaterThan(sel.y0);
});

test('clear zeroes the selected region and is undoable', async ({ page }) => {
  await page.locator('.mode-btn[data-mode="chars"]').click();
  const cleared = await page.evaluate(() => {
    const T = window.StudioModes.chars._test;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) T.set(x, y, 0);
    T.set(0, 0, 1); T.set(1, 1, 1);
    T.setSel(0, 0, 1, 1); T.clear();
    return [T.get(0, 0), T.get(1, 1)];
  });
  expect(cleared).toEqual([0, 0]);
  // clearRegion pushes exactly one undo unit.
  const restored = await page.evaluate(() => {
    window.Studio.undo();
    const T = window.StudioModes.chars._test;
    return [T.get(0, 0), T.get(1, 1)];
  });
  expect(restored).toEqual([1, 1]);
});
