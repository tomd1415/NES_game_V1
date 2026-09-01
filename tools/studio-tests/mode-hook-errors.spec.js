// A Studio mode whose overlay hook throws must SAY SO — once — and must not
// take the editor down with it.
//
// Until 2026-08-09 both `onRenderOverlay` catches in studio.js were `catch (e) {}`.
// A mode whose overlay threw simply stopped drawing its grid / hover cell /
// selection, for ever, with nothing in the console — while the `renderTV` catch a
// few lines above had always logged. That is the silent-absence shape: the editor
// looks fine, one piece of it is missing, and nobody can tell why.
//
// The opposite mistake is just as real and is why this asserts "exactly once"
// rather than "at least once". renderLive() runs on every interaction, so logging
// per call reproduces item #37 — a fault re-thrown into a console no pupil reads,
// endlessly, while the screen sits there looking healthy.
const { test, expect } = require('@playwright/test');

const bootStudio = async (page) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
};

// Collect console errors, then make WORLD's overlay hook throw on every call.
async function armThrowingOverlay(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await bootStudio(page);
  await page.locator('.mode-btn[data-mode="world"]').click();
  await page.evaluate(() => {
    window.StudioModes.world.onRenderOverlay = function () {
      throw new Error('deliberate overlay failure');
    };
  });
  return errors;
}

test('a throwing overlay hook is reported, and names the mode and hook', async ({ page }) => {
  const errors = await armThrowingOverlay(page);
  await page.evaluate(() => window.Studio.renderLive());
  const hits = errors.filter((t) => /world\.onRenderOverlay/.test(t));
  expect(hits.length, 'the failure must be reported, not swallowed').toBe(1);
  expect(hits[0]).toContain('threw');
});

test('it is reported exactly once, not once per render', async ({ page }) => {
  const errors = await armThrowingOverlay(page);
  // Twelve renders: enough that a per-frame log would be unmistakable.
  await page.evaluate(() => { for (let i = 0; i < 12; i++) window.Studio.renderLive(); });
  const hits = errors.filter((t) => /world\.onRenderOverlay/.test(t));
  expect(hits.length, 'a per-frame log would flood the console — see #37').toBe(1);
});

// The console message claims the hook "is still called on every render and will
// keep throwing". That is a checkable claim about behaviour, so check it — an
// earlier wording said the overlay was "suppressed for the rest of this session",
// which would have sent a reader looking for suppression logic that has never
// existed. If someone later makes that true by actually disabling the hook, this
// fails and the message gets corrected with it.
test('the hook keeps being called after it throws — only the message is silenced', async ({ page }) => {
  await armThrowingOverlay(page);
  await page.evaluate(() => {
    window.__overlayCalls = 0;
    window.StudioModes.world.onRenderOverlay = function () {
      window.__overlayCalls++;
      throw new Error('deliberate overlay failure');
    };
  });
  await page.evaluate(() => { for (let i = 0; i < 6; i++) window.Studio.renderLive(); });
  expect(await page.evaluate(() => window.__overlayCalls),
    'six renders must mean six calls — the fault is reported once, not fixed').toBe(6);
});

test('the editor keeps working after an overlay hook throws', async ({ page }) => {
  await armThrowingOverlay(page);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.Studio.renderLive(); });
  // The TV still renders and the app is still responsive: switching mode works,
  // and the project state is untouched by the fault.
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await expect(page.locator('.mode-btn[data-mode="chars"]')).toHaveClass(/sel|active/);
  const ok = await page.evaluate(() => !!window.Studio.getState().backgrounds.length);
  expect(ok, 'project state survives an overlay fault').toBe(true);
});
