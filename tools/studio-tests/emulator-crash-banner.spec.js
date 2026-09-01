// Emulator crash banner — feedback item #37 ("my game keeps crashing" /
// "the emulator froze for no reason").
//
// The node suite (builder-tests/emulator-watchdog.mjs) unit-tests the watchdog
// and asserts at SOURCE level that the frame loop is wired to it. That cannot
// see the actual DOM: whether the banner really appears, whether retry reboots
// the ROM, whether closing the dialog stops the loop. This spec covers that
// half, driving the real emulator.js in a real browser.
//
// It calls NesEmulator.open() directly rather than going through ▶ Play,
// because the point is to force failures a compiled ROM will not produce on
// demand — and it keeps the spec off the ~25 s cc65 build path.
const { test, expect } = require('@playwright/test');

// Smallest thing jsnes accepts: iNES header + 1×16 KB PRG + 1×8 KB CHR.
// Contents are irrelevant — every test here replaces frame() before it runs,
// or is checking the load path that never reaches execution.
const MAKE_ROM = () => {
  const rom = new Uint8Array(16 + 16384 + 8192);
  rom.set([0x4e, 0x45, 0x53, 0x1a, 1, 1, 0, 0]);   // "NES\x1a", prg=1, chr=1
  return rom;
};

/**
 * Load the Studio, pull jsnes in, and install ONE switchable frame() stub.
 *
 * The stub is installed once, before any NES is constructed, and its behaviour
 * is switched through `window.__frameMode`. That indirection is essential, not
 * stylistic: jsnes's constructor does `this.frame = this.frame.bind(this)`, so
 * each instance snapshots the prototype method at construction time. Re-assigning
 * `jsnes.NES.prototype.frame` after `open()` therefore does nothing to the
 * running emulator — a trap that silently made an earlier draft of this spec
 * assert the wrong thing.
 *
 *   'ok'    — count the call, render nothing (harmless; the ROM is a stub)
 *   'throw' — count, then throw, exercising the try/catch path
 *   'stall' — same as 'ok'; named separately for intent at the call site
 */
async function setup(page) {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.evaluate(async (romSrc) => {
    await window.NesEmulator.ensureJsnes();
    window.__mkRom = new Function('return (' + romSrc + ')()');
    window.__frameCalls = 0;
    window.__frameMode = 'ok';
    window.__realFrame = window.jsnes.NES.prototype.frame;
    window.jsnes.NES.prototype.frame = function () {
      window.__frameCalls++;
      if (window.__frameMode === 'throw') throw new Error('synthetic frame fault');
    };
  }, MAKE_ROM.toString());
}

/** Restore jsnes and close any open dialog, so tests don't leak into each other. */
async function teardown(page) {
  await page.evaluate(() => {
    if (window.__realFrame) window.jsnes.NES.prototype.frame = window.__realFrame;
    const dlg = document.getElementById('emu-dialog');
    if (dlg && dlg.open) dlg.close();
  });
}

test.afterEach(async ({ page }) => { await teardown(page); });

test('a malformed ROM opens the dialog and says so, instead of doing nothing', async ({ page }) => {
  await setup(page);

  // Before #37 this rejected open() BEFORE showModal(), so a pupil clicked
  // Play and absolutely nothing happened — no dialog, no message.
  await page.evaluate(() => {
    window.NesEmulator.open(new Uint8Array([1, 2, 3, 4]), { hasP2: false });
  });

  await expect(page.locator('#emu-dialog')).toBeVisible();
  await expect(page.locator('#emu-crash')).toBeVisible();
  await expect(page.locator('#emu-crash-text')).toContainText('could not be started');
  // Rebooting a cartridge that never loaded cannot work, so no false hope.
  await expect(page.locator('#emu-crash-retry')).toBeHidden();
});

test('an error inside nes.frame() stops the loop and shows the banner', async ({ page }) => {
  await setup(page);

  await page.evaluate(() => {
    window.__frameMode = 'throw';
    window.NesEmulator.open(window.__mkRom(), { hasP2: false });
  });

  await expect(page.locator('#emu-crash')).toBeVisible();
  await expect(page.locator('#emu-crash-text')).toContainText('stopped because of an error');
  await expect(page.locator('#emu-crash-retry')).toBeVisible();

  // The real defect this guards: an exception in a setInterval callback does
  // NOT stop the interval, so the fault used to re-throw 60x/second forever
  // while the game sat frozen. The loop must be torn down, not just reported.
  const before = await page.evaluate(() => window.__frameCalls);
  await page.waitForTimeout(500);          // ~30 frames' worth of ticks
  const after = await page.evaluate(() => window.__frameCalls);
  expect(after).toBe(before);
});

test('a stalled emulator (ticks, but no frames rendered) trips the watchdog', async ({ page }) => {
  await setup(page);

  // frame() returns without ever painting — the canvas would hold its last
  // image forever. opts.watchdog shortens the stall threshold so the test
  // does not sit through the ~2 s production default.
  await page.evaluate(() => {
    window.__frameMode = 'stall';
    window.NesEmulator.open(window.__mkRom(), { hasP2: false, watchdog: { stallTicks: 3 } });
  });

  await expect(page.locator('#emu-crash')).toBeVisible();
  await expect(page.locator('#emu-crash-text')).toContainText('stopped responding');
});

test('retry reboots the ROM, clears the banner and resumes emulation', async ({ page }) => {
  await setup(page);

  await page.evaluate(() => {
    window.__frameMode = 'throw';
    window.NesEmulator.open(window.__mkRom(), { hasP2: false });
  });
  await expect(page.locator('#emu-crash')).toBeVisible();

  // Heal the fault, then retry: the cart reboots and the loop restarts.
  await page.evaluate(() => { window.__frameMode = 'ok'; window.__frameCalls = 0; });
  await page.locator('#emu-crash-retry').click();

  await expect(page.locator('#emu-crash')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__frameCalls)).toBeGreaterThan(0);
});

test('closing the dialog stops the frame loop (no orphaned interval)', async ({ page }) => {
  await setup(page);

  await page.evaluate(() => {
    window.__frameMode = 'ok';
    window.NesEmulator.open(window.__mkRom(), { hasP2: false });
  });
  // Confirm it is genuinely running before we close it, so a stopped counter
  // afterwards means "torn down", not "never started".
  await expect.poll(() => page.evaluate(() => window.__frameCalls)).toBeGreaterThan(0);

  await page.locator('#emu-close').click();
  await expect(page.locator('#emu-dialog')).toBeHidden();

  const before = await page.evaluate(() => window.__frameCalls);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__frameCalls);
  expect(after).toBe(before);
});
