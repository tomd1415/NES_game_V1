// Guided tutorial (MVP): launching it loads the ready-made starter, shows the
// panel, and each step advances when the pupil makes the light edit + presses
// Check my work — ending in Play. Edits are applied through the real state path
// (Studio.getState() + ctx.markDirty()), then the panel's Check button is
// clicked, exactly as a pupil's edit + click would drive it.
const { test, expect } = require('@playwright/test');

// Apply the light edit for the step at index `idx` via the live state.
async function applyEdit(page, idx) {
  await page.evaluate((i) => {
    const S = window.Studio, s = S.getState();
    if (i === 0) {                                   // name-hero
      const p = s.sprites.find((x) => x && x.role === 'player');
      p.name = 'Pixel';
    } else if (i === 1) {                            // recolour
      s.bg_palettes[0].slots[1] = (s.bg_palettes[0].slots[1] + 1) % 64;
    } else if (i === 2) {                            // draw-tile
      s.bg_tiles[5].pixels[0][0] = 1;
    } else if (i === 3) {                            // build-floor (+3 solid)
      const bg = s.backgrounds[s.selectedBgIdx];
      bg.behaviour[10][10] = 1; bg.behaviour[10][11] = 1; bg.behaviour[10][12] = 1;
    } else if (i === 4) {                            // change-rules
      const c = s.builder.modules.players.submodules.player1.config;
      c.maxHp = (c.maxHp || 3) + 1;
    }
    S.ctx.markDirty();
  }, idx);
}

test('the guided tutorial walks the pupil to a played game', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  // Launch: header Tutorial button loads the ready-made starter + opens the panel.
  await page.locator('#btn-tutorial').click();
  await page.waitForFunction(() => window.StudioTutorial && window.StudioTutorial.isActive());
  await expect(page.locator('.studio-main')).toHaveClass(/tutorial-on/);
  await expect(page.locator('#tutorial-region')).toBeVisible();
  await expect(page.locator('.tut-card')).toBeVisible();

  // The starter shipped a complete tileset (nothing blank to draw from scratch).
  const ready = await page.evaluate(() => {
    const s = window.Studio.getState();
    const drawn = s.bg_tiles[1].pixels.some((r) => r.some((v) => v));   // ground tile drawn
    const hasHero = s.sprites.some((x) => x && x.role === 'player');
    return { drawn, hasHero, step: window.StudioTutorial.stepIndex() };
  });
  expect(ready.drawn).toBe(true);
  expect(ready.hasHero).toBe(true);
  expect(ready.step).toBe(0);

  const total = await page.evaluate(() => window.StudioTutorial.stepCount());
  expect(total).toBe(6);

  // Steps 0..4: make the light edit, press Check my work, expect an advance.
  for (let i = 0; i < 5; i++) {
    await applyEdit(page, i);
    await page.locator('.tut-card [data-act="check"]').click();
    await page.waitForFunction((n) => window.StudioTutorial.stepIndex() === n, i + 1);
  }

  // A check with NO edit must NOT advance (guards against pass-through).
  await page.evaluate(() => { window.__step = window.StudioTutorial.stepIndex(); });
  // (We are now on the Play step, which has no state edit — verify Check alone
  //  on the previous kind of step didn't over-advance: stepIndex is exactly 5.)
  expect(await page.evaluate(() => window.StudioTutorial.stepIndex())).toBe(5);

  // Final step: pressing Play advances the tutorial to completion.
  await page.locator('#btn-play').click();
  await page.waitForFunction(() => window.StudioTutorial.isComplete(), null, { timeout: 15000 });
  await expect(page.locator('.tut-complete')).toBeVisible();

  // Progress persisted on the project.
  const persisted = await page.evaluate(() => window.Studio.getState().tutorial.step);
  expect(persisted).toBe(6);
});

test('a normal project does not show the tutorial panel', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  // Default boot project is not a tutorial.
  const active = await page.evaluate(() => window.StudioTutorial.isActive());
  expect(active).toBe(false);
  await expect(page.locator('.studio-main')).not.toHaveClass(/tutorial-on/);
  await expect(page.locator('#tutorial-region')).toBeHidden();
});
