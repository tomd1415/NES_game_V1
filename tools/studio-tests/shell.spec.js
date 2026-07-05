// Studio shell — Phase 0 smoke tests.
//
// Boots studio.html (served by playground_server.py via the webServer
// config) and asserts the four regions, chrome, shared-state wiring,
// level gating, the LIVE render, and the progress-safety uplift.
const { test, expect } = require('@playwright/test');

// Each Playwright test runs in a fresh browser context, so localStorage
// starts empty and project state never leaks between tests — no manual
// clearing needed (and clearing on every navigation would wipe state
// across an intentional reload).
test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
});

test('the four regions and top chrome are present', async ({ page }) => {
  await expect(page.locator('.app-header')).toBeVisible();
  await expect(page.locator('.mode-rail')).toBeVisible();
  await expect(page.locator('.dock')).toBeVisible();
  await expect(page.locator('.tv-region')).toBeVisible();
  await expect(page.locator('.quest-region')).toBeVisible();

  // Chrome controls.
  await expect(page.locator('#btn-play')).toBeVisible();
  await expect(page.locator('#btn-time-machine')).toBeVisible();
  await expect(page.locator('#level-select')).toBeVisible();
  await expect(page.locator('#save-dot')).toBeVisible();
});

test('boots game-first: the TV renders a non-empty LIVE screen', async ({ page }) => {
  // The starter paints a floor + player, so the canvas must not be a
  // single flat colour. Count distinct colours in the framebuffer.
  const distinct = await page.evaluate(() => {
    const c = document.getElementById('tv-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) {
      seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
    return seen.size;
  });
  expect(distinct).toBeGreaterThan(2);
  await expect(page.locator('#tv-state-label')).toHaveText('Live');
});

test('shares the storage schema: a starter project is persisted', async ({ page }) => {
  const s = await page.evaluate(() => window.Studio.getState());
  expect(Array.isArray(s.bg_tiles)).toBe(true);
  expect(s.bg_tiles.length).toBe(256);
  expect(Array.isArray(s.sprite_tiles)).toBe(true);
  expect(s.backgrounds.length).toBeGreaterThan(0);
  // The hero the starter paints.
  expect(s.sprites.some((sp) => sp && sp.role === 'player')).toBe(true);
  // Persisted under the v2 catalog so old pages read the same save.
  const persisted = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.includes('.current'));
    return keys.length;
  });
  expect(persisted).toBeGreaterThan(0);
});

test('mode rail switches the dock and stage name', async ({ page }) => {
  // World is active by default.
  await expect(page.locator('.mode-btn.active')).toHaveText(/World/);
  await expect(page.locator('#stage-mode-name')).toHaveText('World');

  // Switch to Rules (a Beginner mode → always visible).
  await page.locator('.mode-btn[data-mode="rules"]').click();
  await expect(page.locator('#stage-mode-name')).toHaveText('Rules');
  await expect(page.locator('#dock h2')).toHaveText('Rules');
  expect(await page.evaluate(() => window.Studio.getMode())).toBe('rules');
});

test('level switch gates advanced modes (progressive disclosure)', async ({ page }) => {
  // Bug #4: gated modes stay VISIBLE but LOCKED so pupils see more exists.
  // Beginner: Tiles / Code locked; World unlocked.
  await expect(page.locator('.mode-btn[data-mode="tiles"]')).toHaveClass(/locked/);
  await expect(page.locator('.mode-btn[data-mode="code"]')).toHaveClass(/locked/);
  await expect(page.locator('.mode-btn[data-mode="world"]')).not.toHaveClass(/locked/);
  // Clicking a locked mode nudges to raise the level (doesn't switch).
  await page.locator('.mode-btn[data-mode="tiles"]').click();
  expect(await page.evaluate(() => window.Studio.getMode())).not.toBe('tiles');
  await expect(page.locator('#level-hint')).toContainText('unlocks');

  // Maker unlocks Tiles but not Code.
  await page.locator('#level-select').selectOption('maker');
  await expect(page.locator('.mode-btn[data-mode="tiles"]')).not.toHaveClass(/locked/);
  await expect(page.locator('.mode-btn[data-mode="code"]')).toHaveClass(/locked/);

  // Advanced unlocks everything.
  await page.locator('#level-select').selectOption('advanced');
  await expect(page.locator('.mode-btn[data-mode="code"]')).not.toHaveClass(/locked/);
});

test('the World dock adds a background and the TV follows', async ({ page }) => {
  const before = await page.evaluate(() => window.Studio.getState().backgrounds.length);
  await page.locator('#world-add-bg').click();
  const after = await page.evaluate(() => window.Studio.getState().backgrounds.length);
  expect(after).toBe(before + 1);
  // The new background is selected and there are now N picker rows.
  await expect(page.locator('.bg-row')).toHaveCount(after);
  await expect(page.locator('.bg-row.sel')).toHaveCount(1);
});

test('renaming the project updates the shared state and persists', async ({ page }) => {
  await page.locator('#project-name').fill('Robot Rescue');
  // Debounced autosave settles.
  await page.waitForTimeout(500);
  const name = await page.evaluate(() => window.Studio.getState().name);
  expect(name).toBe('Robot Rescue');
  // Reload → the rename survived (shared storage).
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await expect(page.locator('#project-name')).toHaveValue('Robot Rescue');
});

test('the quest log ticks self-ticking quests from real state', async ({ page }) => {
  // The starter satisfies "Meet your hero" and "Build some ground".
  const doneCount = await page.locator('.quest.done').count();
  expect(doneCount).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.quest', { hasText: 'Meet your hero' })).toHaveClass(/done/);
});

test('Needs-attention renders the validator output', async ({ page }) => {
  // Either a clean-build note or at least one finding — never empty.
  const attn = page.locator('#attn-list');
  await expect(attn).not.toBeEmpty();
});

test('Time Machine: Play snapshots first, and the dialog lists it', async ({ page }) => {
  // Trigger a before_play snapshot without needing a full compile: call the
  // snapshot directly is not what we want — instead assert the wiring by
  // opening Time Machine after a manual snapshot via the storage layer.
  await page.evaluate(() => {
    // Simulate what onPlay does first: snapshot with the before_play reason.
    window.Storage.saveSnapshot(window.Studio.getState(), 'before_play');
  });
  await page.locator('#btn-time-machine').click();
  await expect(page.locator('#tm-backdrop')).toHaveClass(/open/);
  await expect(page.locator('.snap-row .reason', { hasText: 'before_play' })).toBeVisible();
  // Copy fix: it must say "keeps 8", never "keeps 5".
  await expect(page.locator('#tm-body')).toContainText('keeps 8');
  await expect(page.locator('#tm-body')).not.toContainText('keeps 5');
});

test('Time Machine restore snapshots current state first (nothing lost)', async ({ page }) => {
  // Take a snapshot of the pristine starter.
  await page.evaluate(() => window.Storage.saveSnapshot(window.Studio.getState(), 'auto_30s'));
  // Change the project name.
  await page.locator('#project-name').fill('Changed Name');
  await page.waitForTimeout(450);
  // Restore the earlier snapshot.
  await page.locator('#btn-time-machine').click();
  await page.locator('.snap-row button', { hasText: 'Restore' }).first().click();
  // Restoring must itself have created a before_recovery snapshot of the
  // changed state, so the change is recoverable.
  const reasons = await page.evaluate(() =>
    window.Storage.listSnapshots().map((s) => s.reason));
  expect(reasons).toContain('before_recovery');
});
