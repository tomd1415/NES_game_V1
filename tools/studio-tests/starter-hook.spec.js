// "Load a starter game" when the starter registry is not usable.
//
// The decision this pins (2026-08-14, left to me by the owner): the button
// DISABLES itself and says why, rather than logging and carrying on. Both make
// the console honest; only one of them is visible to the person using the page,
// and a pupil never opens a console. Before this, `onNewGame` read
// `window.StudioStarter.list` unguarded, so an unwired host page produced a
// button that looked live, threw on click, and reported nothing on screen.
//
// HOW THE FIXTURE WORKS, and why it is not simply `delete window.StudioStarter`.
// `migrateState` calls `StudioStarter.create()` to reseed a corrupt or blank
// slot, so removing the registry outright can stop the Studio booting at all —
// the test would then hang on `studioReady` and prove nothing about the button.
// Instead the registry is left intact and only `list()` is made to return
// empty, which reaches the same guard by the branch that keeps boot working.
const { test, expect } = require('@playwright/test');

async function withEmptyStarterList(page) {
  await page.addInitScript(() => {
    let real = null;
    Object.defineProperty(window, 'StudioStarter', {
      configurable: true,
      get() {
        if (!real) return real;
        const wrapped = Object.create(Object.getPrototypeOf(real));
        Object.assign(wrapped, real);
        wrapped.list = () => [];
        return wrapped;
      },
      set(v) { real = v; },
    });
  });
}

test('with no starters available the button is disabled and says why', async ({ page }) => {
  await withEmptyStarterList(page);
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  const btn = page.locator('#btn-new-game');
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute('title', /studio-starter\.js did not load/);
});

test('clicking it in that state reports rather than throwing', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)));

  await withEmptyStarterList(page);
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  // The account menu reaches the same handler directly, so it can still be
  // invoked even though the button is disabled. It must not throw.
  await page.evaluate(() => window.onLoadStarterGame && window.onLoadStarterGame());
  expect(errors.filter((t) => t.startsWith('PAGEERROR:'))).toEqual([]);
  expect(errors.filter((t) => /Load a starter game" is disabled/.test(t)).length).toBeGreaterThan(0);
});

test('said once, not once per click', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await withEmptyStarterList(page);
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.onLoadStarterGame && window.onLoadStarterGame();
  });
  expect(errors.filter((t) => /Load a starter game" is disabled/.test(t))).toHaveLength(1);
});

test('normally the button is enabled — the fixture is what disables it', async ({ page }) => {
  // The control. Without it, all three assertions above would still pass if the
  // button were disabled for some unrelated reason, or always.
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await expect(page.locator('#btn-new-game')).toBeEnabled();
});
