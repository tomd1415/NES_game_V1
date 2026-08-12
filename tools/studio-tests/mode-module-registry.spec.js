// Every mode on the rail must have a module behind it.
//
// Two lists have to agree and nothing checked that they did: `MODES` in
// studio.js (which builds the rail) and the `window.StudioModes.<id>`
// registrations, one per `studio-<id>.js`, wired in by hand as <script> tags in
// studio.html. A renamed file, a typo'd tag or a syntax error in any of those
// eight files breaks the correspondence.
//
// What makes that worth a test is the failure mode. studio.js renders a
// placeholder for a mode with no module — "This mode arrives later in the
// redesign … the X tools dock in here next." That copy was written in Phase 0
// when modes genuinely had not been built. All eight have shipped since, so
// today the placeholder can only mean a module FAILED TO LOAD, and it tells the
// pupil the feature is planned rather than broken. A teacher reads it as
// "not finished yet" and never reports it. Nothing goes red anywhere.
//
// So this asserts both the cause (every rail mode has a registered module) and
// the pupil-visible consequence (no mode shows the placeholder).
//
// Both lists are enumerated AT RUNTIME — the rail from the DOM it actually
// built, the registry from the object that actually exists — rather than by
// scanning studio.js and studio.html for names. A source-scanning version of
// this test would match the very comment above and pass on it.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // Advanced shows every mode unlocked; locked buttons still exist on the rail
  // at lower levels, but cannot be entered, so the placeholder check needs this.
  await page.locator('#level-select').selectOption('advanced');
});

// The rail is built from MODES, which is closure-private, so the buttons are
// the honest runtime view of it.
const railModes = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.mode-btn')].map((b) => b.dataset.mode));

test('every mode on the rail has a registered module', async ({ page }) => {
  const rail = await railModes(page);

  // A selector that matches nothing would otherwise make the loop below pass
  // without asserting anything at all.
  expect(rail.length, 'the mode rail is empty — the selector or the rail broke, ' +
    'and every other assertion here would have silently passed').toBeGreaterThan(0);

  const missing = await page.evaluate((ids) =>
    ids.filter((id) => {
      const m = window.StudioModes && window.StudioModes[id];
      return !m || typeof m.renderDock !== 'function';
    }), rail);

  expect(missing, `no module registered for: ${missing.join(', ')} — the matching ` +
    'studio-<mode>.js did not load, or loaded without registering').toEqual([]);
});

// ...and the other direction, which the two tests above cannot see.
//
// Both of those are driven by the rail: they iterate the buttons and look each
// one up in the registry, so anything present ONLY in the registry is invisible
// to them. A module that registers itself but was dropped from `MODES` has no
// button, cannot be reached by a pupil, and is dead weight shipped to every
// browser — with nothing failing anywhere.
//
// This test exists because of what was found in snapshot-engine.mjs the same day:
// a gate that had been watched failing, and still had an entire direction
// missing, because the loop was driven by one of the two lists. That applies to
// the tests above as much as to anything else, so it is checked here rather than
// assumed. See LESSONS-LEARNT.md, "Only one direction of a two-way comparison".
test('every registered module is reachable from the rail', async ({ page }) => {
  const rail = await railModes(page);
  expect(rail.length).toBeGreaterThan(0);

  const registered = await page.evaluate(() => Object.keys(window.StudioModes || {}));
  expect(registered.length, 'window.StudioModes is empty — the mode modules did not load, ' +
    'and this assertion would otherwise pass on nothing').toBeGreaterThan(0);

  const unreachable = registered.filter((id) => !rail.includes(id));
  expect(unreachable, `registered but not on the rail: ${unreachable.join(', ')} — ` +
    'the module ships to every browser and no pupil can reach it, because MODES ' +
    'in studio.js has no entry for it').toEqual([]);
});

test('no mode shows the "arrives later" placeholder', async ({ page }) => {
  const rail = await railModes(page);
  expect(rail.length).toBeGreaterThan(0);

  const stranded = [];
  for (const id of rail) {
    await page.locator(`.mode-btn[data-mode="${id}"]`).click();
    // selectMode is synchronous; the dock is rebuilt before the click resolves.
    if (await page.locator('#dock .placeholder').count()) stranded.push(id);
  }

  expect(stranded, `these modes fell back to the Phase-0 placeholder: ${stranded.join(', ')}. ` +
    'A pupil is told the mode "arrives later in the redesign"; the truth is that ' +
    'its module is missing').toEqual([]);
});

// The placeholder copy stays deliberately calm, so the real reason has to reach
// the console instead. Unregistering at runtime reproduces a failed load without
// editing studio.html — selectMode re-reads window.StudioModes on every switch.
test('a missing module says so in the console, once', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.evaluate(() => { delete window.StudioModes.sound; });
  const hits = async () => errors.filter((t) => /no module registered for mode "sound"/.test(t));

  await page.locator('.mode-btn[data-mode="sound"]').click();
  expect((await hits()).length, 'the placeholder must not be the only account of a failed load').toBe(1);
  expect((await hits())[0]).toContain('NOT the real reason');

  // renderDock runs on every dock interaction; a per-call log would flood the
  // console exactly the way #37 did.
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.Studio.refresh(); });
  expect((await hits()).length, 'said once is said').toBe(1);
});
