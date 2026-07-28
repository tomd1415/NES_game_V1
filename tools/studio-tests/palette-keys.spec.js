// Palette/colour keyboard shortcuts, across every editor that has them.
//
// User request: "I use a keyboard where the number row is Esc, 1, 2, 3 ... with 0
// and backtick (`) all the way on the right side, which makes it very
// inconvenient." So `4` is now an additional alias for colour 0, everywhere. The
// existing keys are untouched: 0→0, 1→1, 2→2, 3→3, and ` →0 as before.
//
// Four surfaces, because the shortcut lives in four separate implementations:
// the Studio's TILES and CHARS modes (which had no digit shortcut at all before),
// and the two legacy pages. Each test asserts BOTH that 4 selects colour 0 and
// that the original keys still do what they always did — an alias that quietly
// broke 1/2/3 would be a worse bug than the inconvenience it fixes.
const { test, expect } = require('@playwright/test');

const bootStudio = async (page) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
};
const penOf = (page, mode) =>
  page.evaluate((m) => window.StudioModes[m]._get().pen, mode);

test('Studio TILES: 0-3 pick the pen, 4 and ` pick 0', async ({ page }) => {
  await bootStudio(page);
  await page.locator('#level-select').selectOption('maker');   // TILES is Maker-level
  await page.locator('.mode-btn[data-mode="tiles"]').click();

  for (const k of ['1', '2', '3', '0']) {
    await page.keyboard.press(k);
    expect(await penOf(page, 'tiles'), `key ${k}`).toBe(Number(k));
  }
  await page.keyboard.press('3');
  expect(await penOf(page, 'tiles')).toBe(3);
  await page.keyboard.press('4');
  expect(await penOf(page, 'tiles'), 'key 4 should pick colour 0').toBe(0);

  await page.keyboard.press('2');
  await page.keyboard.press('`');
  expect(await penOf(page, 'tiles'), 'backtick still picks 0').toBe(0);
});

test('Studio CHARS: 0-3 pick the pen, 4 and ` pick 0', async ({ page }) => {
  await bootStudio(page);
  await page.locator('.mode-btn[data-mode="chars"]').click();   // Beginner-level

  for (const k of ['1', '2', '3', '0']) {
    await page.keyboard.press(k);
    expect(await penOf(page, 'chars'), `key ${k}`).toBe(Number(k));
  }
  await page.keyboard.press('2');
  await page.keyboard.press('4');
  expect(await penOf(page, 'chars'), 'key 4 should pick colour 0 (erase)').toBe(0);

  await page.keyboard.press('1');
  await page.keyboard.press('`');
  expect(await penOf(page, 'chars'), 'backtick still picks 0').toBe(0);
});

test('Studio: Ctrl/Cmd+digit is left to the browser, not stolen as a colour', async ({ page }) => {
  await bootStudio(page);
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.keyboard.press('2');
  expect(await penOf(page, 'chars')).toBe(2);
  // studio.js dispatches onKey even with a modifier held, so the handler has to
  // ignore these itself — Ctrl+1 switches browser tab and must not repaint.
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Control+4');
  expect(await penOf(page, 'chars'), 'modified digits must not change the pen').toBe(2);
});

// --- the two legacy pages ----------------------------------------------------
// Still served, critical-fix-only, but this is where the shortcut has always
// lived — so this is the surface the request was actually about.
for (const [page_, label] of [['/index.html', 'tile editor'], ['/sprites.html', 'sprite editor']]) {
  test(`legacy ${label}: 0-3 pick the colour, 4 and \` pick 0`, async ({ page }) => {
    await page.goto(page_);
    await page.waitForSelector('.color-btn');
    const colour = () => page.evaluate(() => currentColour);
    // The visible state, not just the variable: the swatch a pupil sees selected.
    const activeSwatch = () => page.evaluate(() => {
      const b = document.querySelector('.color-btn.active');
      return b ? Number(b.dataset.color) : null;
    });

    for (const k of ['1', '2', '3', '0']) {
      await page.keyboard.press(k);
      expect(await colour(), `key ${k}`).toBe(Number(k));
      expect(await activeSwatch(), `key ${k} highlights its swatch`).toBe(Number(k));
    }

    await page.keyboard.press('3');
    expect(await colour()).toBe(3);
    await page.keyboard.press('4');
    expect(await colour(), 'key 4 should pick colour 0').toBe(0);
    expect(await activeSwatch(), 'key 4 highlights the colour-0 swatch').toBe(0);

    await page.keyboard.press('2');
    await page.keyboard.press('`');
    expect(await colour(), 'backtick still picks 0').toBe(0);
  });
}
