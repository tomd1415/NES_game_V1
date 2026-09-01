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
const paintPaletteOf = (page) =>
  page.evaluate(() => window.StudioModes.world._get().paintPalette);

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

// WORLD's picker is four BG SUB-PALETTES, not five pen colours, so the set stops
// at 3 — there is no colour-0/transparent to alias. 4 and ` still map to palette 0
// so this surface does not become the one place the awkward reach is still needed.
//
// Split across several small tests on purpose: this suite runs unattended on a
// shared box with a 30s per-test timeout and no retries, and each keypress or
// evaluate is a round-trip that stretches under host load. One long test that
// walks every case is the difference between a reliable suite and a flaky one.
const enterWorld = async (page) => {
  await bootStudio(page);
  await page.locator('.mode-btn[data-mode="world"]').click();
};

test('Studio WORLD: 0-3 pick the paint palette', async ({ page }) => {
  await enterWorld(page);
  for (const k of ['1', '2', '3', '0']) {
    await page.keyboard.press(k);
    expect(await paintPaletteOf(page), `key ${k}`).toBe(Number(k));
  }
});

test('Studio WORLD: 4 and ` also pick palette 0', async ({ page }) => {
  await enterWorld(page);
  await page.keyboard.press('3');
  await page.keyboard.press('4');
  expect(await paintPaletteOf(page), 'key 4 should pick palette 0').toBe(0);
  await page.keyboard.press('2');
  await page.keyboard.press('`');
  expect(await paintPaletteOf(page), 'backtick still picks 0').toBe(0);
});

test('Studio WORLD: a digit past the last palette is ignored', async ({ page }) => {
  await enterWorld(page);
  // There are only four BG palettes: 5 must do nothing, not clamp to 3 and not
  // select a palette that does not exist.
  await page.keyboard.press('2');
  await page.keyboard.press('5');
  expect(await paintPaletteOf(page), 'key 5 is not a palette').toBe(2);
});

test('Studio WORLD: the highlighted BG strip follows the key', async ({ page }) => {
  await enterWorld(page);
  // The selection a pupil actually sees, not just the variable.
  await page.keyboard.press('1');
  // Scoped to WORLD's own "Paint colour" section rather than the whole document.
  // `.pal-strip.sel` is emitted by studio-world.js AND studio-pals.js (its shared
  // backdrop row), so a document-wide query was relying on an invariant nobody
  // stated: that only the current mode's dock is ever in the DOM. That is true
  // today because renderDock replaces the dock's contents — but it is a property
  // of the shell, not of this test, and if it ever stopped holding this would
  // assert against PALS' strip while still looking like a WORLD test.
  const sel = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('.dock-section')].find(
      (d) => (d.querySelector('.title') || {}).textContent === 'Paint colour');
    if (!sec) return { err: 'no "Paint colour" section in the dock' };
    const s = sec.querySelector('.pal-strip.sel .label');
    return { text: s ? s.textContent : null };
  });
  // A missing section must fail loudly here, not read as "no selection".
  expect(sel.err, 'WORLD dock has no "Paint colour" section — the scope anchor moved, ' +
    'and an unscoped query would have quietly matched some other mode\'s strip').toBeUndefined();
  expect(sel.text).toBe('BG 1');
});

// Picking a palette must not silently change the project. WORLD's block editor has
// its own BG 0-3 buttons that DO edit saved data through pushUndo; the keyboard is
// deliberately not wired to those.
test('Studio WORLD: a palette key changes no project data', async ({ page }) => {
  await enterWorld(page);
  const snapshot = () => page.evaluate(() => JSON.stringify(window.Studio.getState().backgrounds));
  const before = await snapshot();
  for (const k of ['0', '1', '2', '3', '4', '`']) await page.keyboard.press(k);
  expect(await snapshot(), 'palette keys must not touch the nametable').toBe(before);
});

// WORLD guards modifiers separately — each mode's onKey has to ignore them itself.
test('Studio WORLD: Ctrl/Cmd+digit is left to the browser', async ({ page }) => {
  await enterWorld(page);
  await page.keyboard.press('2');
  expect(await paintPaletteOf(page)).toBe(2);
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Control+4');
  expect(await paintPaletteOf(page), 'modified digits must not change the palette').toBe(2);
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
