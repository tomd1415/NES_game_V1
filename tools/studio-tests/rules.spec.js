// RULES mode — builder module tree as cards (Phase 1.4).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  await page.locator('.mode-btn[data-mode="rules"]').click();
});

test('RULES renders a card per builder module', async ({ page }) => {
  await expect(page.locator('.rule-card')).not.toHaveCount(0);
  await expect(page.locator('.rule-card .card-title', { hasText: 'Game type' })).toBeVisible();
  await expect(page.locator('.rule-card .card-title', { hasText: 'Player 1' })).toBeVisible();
});

test('changing the game type updates state.builder', async ({ page }) => {
  // The Game type card is always-on and expanded.
  const gameCard = page.locator('.rule-card', { hasText: 'Game type' }).first();
  await gameCard.locator('select').first().selectOption('topdown');
  const t = await page.evaluate(() =>
    window.Studio.getState().builder.modules.game.config.type);
  expect(t).toBe('topdown');
});

test('RULES shows only game-type-applicable, universal cards', async ({ page }) => {
  // powerups is SMB "feel" — its editing home is the 🎮 Style tab, never RULES.
  await expect(page.locator('.rule-card .card-title', { hasText: 'Power-ups & fireballs' }))
    .toHaveCount(0);
  // Dialogue applies to the default platformer — visible here…
  await expect(page.locator('.rule-card .card-title', { hasText: 'Dialogue (NPC talk)' }))
    .toBeVisible();
  // …but is inert in an auto-runner, so RULES filters it out there.
  const gameCard = page.locator('.rule-card', { hasText: 'Game type' }).first();
  await gameCard.locator('select').first().selectOption('runner');
  await expect(page.locator('.rule-card .card-title', { hasText: 'Dialogue (NPC talk)' }))
    .toHaveCount(0);
  // The game card no longer leaks racer/runner speed knobs into RULES either —
  // those live in Style. Only the type picker remains as a <select>.
  await expect(gameCard.locator('input[type="number"]')).toHaveCount(0);
});

test('toggling an optional module flips node.enabled', async ({ page }) => {
  // Toggle an optional module and assert it flips (robust to starter defaults).
  const mod = 'pickups';
  const before = await page.evaluate((m) =>
    window.Studio.getState().builder.modules[m].enabled, mod);
  const cb = page.locator(`input[data-module="${mod}"]`);
  if (before) await cb.uncheck(); else await cb.check();
  const after = await page.evaluate((m) =>
    window.Studio.getState().builder.modules[m].enabled, mod);
  expect(after).toBe(!before);
});

test('editing a numeric field commits to config and is undoable', async ({ page }) => {
  // Player 1 card → a numeric field (e.g. Start X). Expand players first.
  const p1 = page.locator('.rule-card', { hasText: 'Player 1' }).first();
  const numInput = p1.locator('input[type="number"]').first();
  await numInput.fill('120');
  await numInput.blur();
  const cfg = await page.evaluate(() =>
    window.Studio.getState().builder.modules.players.submodules.player1.config);
  // Some numeric field now holds 120 (whichever the first one is).
  expect(Object.values(cfg)).toContain(120);

  await page.evaluate(() => window.Studio.undo());
  // After undo the value differs from 120 (restored).
  const cfg2 = await page.evaluate(() =>
    window.Studio.getState().builder.modules.players.submodules.player1.config);
  expect(JSON.stringify(cfg2)).not.toEqual(JSON.stringify(cfg));
});

test('reset modules restores defaults', async ({ page }) => {
  await page.locator('input[data-module="damage"]').check();
  page.on('dialog', (d) => d.accept());
  await page.locator('.btn', { hasText: 'Reset modules' }).click();
  const dmg = await page.evaluate(() =>
    window.Studio.getState().builder.modules.damage.enabled);
  expect(dmg).toBe(false);
});

// ---- Sprite-reactions matrix (Phase 1.4 parity) -----------------------

test('reactions matrix is Maker-gated', async ({ page }) => {
  // Beginner (default) hides it.
  await expect(page.locator('.rule-card', { hasText: 'Sprite reactions' }))
    .toHaveCount(0);
  // Maker reveals it.
  await page.locator('#level-select').selectOption('maker');
  await expect(page.locator('.rule-card', { hasText: 'Sprite reactions' }))
    .toBeVisible();
});

test('changing a reaction writes to state.behaviour_reactions', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  const card = page.locator('.rule-card', { hasText: 'Sprite reactions' });
  // Solid ground = type id 1. Set the selected sprite to "bounce".
  await card.locator('select[data-react-type="1"]').selectOption('bounce');
  const verb = await page.evaluate(() => {
    const s = window.Studio.getState();
    const i = 0; // picker defaults to the first character (the hero)
    return s.behaviour_reactions[i]['1'];
  });
  expect(verb).toBe('bounce');

  // Undo restores the prior verb.
  await page.evaluate(() => window.Studio.undo());
  const after = await page.evaluate(() =>
    window.Studio.getState().behaviour_reactions[0]['1']);
  expect(after).not.toBe('bounce');
});

test('adding a character in CHARS keeps reactions index-aligned', async ({ page }) => {
  await page.locator('#level-select').selectOption('maker');
  // Open the reactions matrix once so behaviour_reactions is materialised.
  await expect(page.locator('.rule-card', { hasText: 'Sprite reactions' }))
    .toBeVisible();
  const before = await page.evaluate(() =>
    window.Studio.getState().sprites.length);

  // Add a character in CHARS.
  await page.locator('.mode-btn[data-mode="chars"]').click();
  await page.locator('#chars-new').click();

  const aligned = await page.evaluate(() => {
    const s = window.Studio.getState();
    return s.behaviour_reactions.length === s.sprites.length;
  });
  expect(aligned).toBe(true);
  const after = await page.evaluate(() =>
    window.Studio.getState().sprites.length);
  expect(after).toBe(before + 1);
});
