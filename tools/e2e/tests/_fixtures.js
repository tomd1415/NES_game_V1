// Shared fixtures + helpers for the editor browser tests.
//
// Every page exposes its storage instance as `window.Storage`
// (createTileEditorStorage). Only index.html / behaviour.html *bootstrap* a
// blank project on load; builder/code/audio/gallery/sprites only LOAD an
// existing one. So `open()` seeds a project via index.html first (the project
// lives in the shared `projects.v2` catalog, which every page reads), then
// lands on the target page. These helpers lean on the real storage API instead
// of hand-writing state JSON, so they don't drift from the schema.
import { test as base, expect } from '@playwright/test';

// The seven editor pages, in nav order.
export const PAGES = [
  'index.html',     // Backgrounds
  'sprites.html',   // Sprites
  'behaviour.html', // Behaviour
  'builder.html',   // Builder
  'code.html',      // Code
  'audio.html',     // Audio
  'gallery.html',   // Gallery
];

// Some console errors are environmental noise, not page faults: favicon 404s,
// optional-asset network refusals. Keep this list tight — the whole point of
// the smoke test is to catch real script breakage.
const IGNORED_CONSOLE = [
  /favicon/i,
  /Failed to load resource.*404/i,
];
function isIgnored(text) {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

// Extended `test` that (a) pre-dismisses the cookie banner on every navigation
// so it can never overlay a control under test, and (b) captures console errors
// + uncaught page exceptions, exposed as `page.__errors()`.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        // Pre-dismiss the cookie banner and the first-run onboarding/tour so
        // neither overlays a control under test. The onboarding "welcome"
        // dialog (help-dialog) is gated on these per-page localStorage keys;
        // the tour uses the prefs flags.
        localStorage.setItem('nes_editor.cookie_notice_ack', '1');
        localStorage.setItem('help-seen', '1');
        localStorage.setItem('sprites-help-seen', '1');
        const prefs = JSON.parse(localStorage.getItem('nes_tile_editor.prefs.v1') || '{}');
        prefs.tourSeenBackgrounds = true;
        prefs.tourSeenSprites = true;
        localStorage.setItem('nes_tile_editor.prefs.v1', JSON.stringify(prefs));
      } catch (e) {}
    });
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isIgnored(msg.text())) {
        errors.push(`console.error: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });
    page.__errors = () => errors.slice();
    await use(page);
  },
});

export { expect };

// Load a page WITHOUT seeding a project — exercises the real "no project yet"
// path too, which must still load cleanly. Used by the smoke test.
export async function openBare(page, pageName) {
  await page.goto(`/${pageName}`, { waitUntil: 'load' });
  await page.waitForLoadState('domcontentloaded');
  return page;
}

// Ensure a project exists, then land on `pageName`. Visiting index.html first
// bootstraps a blank project into the shared catalog; every page then reads it.
export async function open(page, pageName) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => !!(window.Storage && window.Storage.loadCurrent && window.Storage.loadCurrent()),
    { timeout: 12_000 });
  if (pageName !== 'index.html') {
    await page.goto(`/${pageName}`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.Storage && window.Storage.loadCurrent), { timeout: 12_000 });
  }
  return page;
}

// Read the active project's current state through the page's own Storage.
export async function loadCurrent(page) {
  return page.evaluate(() => window.Storage.loadCurrent());
}

// Seed the current project, then reload so the page re-renders from the seed.
//
// `mutate` runs in the browser as `mutate(state)` and mutates the loaded state
// in place.  After saving we neutralise saveCurrent() and reload immediately —
// otherwise the page's pending debounced autosave (scheduled when migration
// marked the freshly-loaded default dirty) fires AFTER our save and clobbers
// the seed with the page's stale in-memory state.  Blocking saveCurrent on this
// dying instance makes the seed survive into the reloaded page.
export async function seedAndReload(page, mutate) {
  const fnStr = mutate.toString();
  await page.evaluate((fn) => {
    // eslint-disable-next-line no-eval
    const m = eval('(' + fn + ')');
    const s = window.Storage.loadCurrent();
    m(s);
    window.Storage.saveCurrent(s);
    window.Storage.saveCurrent = function () { return { ok: true }; };
    location.reload();
  }, fnStr).catch(() => {});   // the reload may tear down the eval context
  await page.waitForLoadState('load');
  await page.waitForFunction(() => !!(window.Storage && window.Storage.loadCurrent));
}
